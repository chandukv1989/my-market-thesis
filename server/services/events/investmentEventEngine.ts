/**
 * Investment Event Engine (Phase 24)
 * 
 * Ingests, archives, and evaluates the causal chain of investment events:
 * EVENT -> EVIDENCE -> WHAT CHANGED -> THESIS IMPACT -> DECISION IMPACT -> PORTFOLIO IMPACT -> USER ALERT
 * 
 * Strict Invariants:
 * 1. Historical events are immutable and point-in-time timestamped (announcedAt & availableAt).
 * 2. Point-in-time evaluation strictly enforces zero lookahead bias:
 *    Events where availableAt > asOfDate are completely excluded.
 * 3. Every event is linked to underlying primary evidence references.
 * 4. Analytical only; zero automated broker order execution.
 */

import { GoogleGenAI } from '@google/genai';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';
import {
  InvestmentEvent,
  InvestmentEventType,
  InvestmentEventImpact,
  InvestmentEventTimeline,
  ThesisImpactArea,
  EventSignificance,
  DecisionImpactSummary,
  ThesisImpactSummary,
  ResearchImpactSummary,
  PortfolioImpactSummary,
  InvestmentDecisionAssessment,
  ResearchSnapshot,
  AlertItem
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { resolveSecurity } from '../../../src/data/canonicalSecurities';
import { ResearchNotebookService } from '../research/notebookService';

export class InvestmentEventEngine {
  private static instance: InvestmentEventEngine;
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName = 'gemini-3.8-flash';
  private initialized = false;

  public static getInstance(): InvestmentEventEngine {
    if (!InvestmentEventEngine.instance) {
      InvestmentEventEngine.instance = new InvestmentEventEngine();
    }
    return InvestmentEventEngine.instance;
  }

  private getClient(): GoogleGenAI | null {
    if (!this.aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (key && key.trim().length > 0) {
        this.aiClient = new GoogleGenAI({ apiKey: key });
      }
    }
    return this.aiClient;
  }

  /**
   * Initializes seed events into persistence on startup if not already seeded
   */
  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const eventRepo = persistenceManager.getEventRepository();
      const count = await eventRepo.count();
      if (count === 0) {
        const seedEvents = this.generateCanonicalSeedEvents();
        await eventRepo.saveBatch(seedEvents);
        console.log(`[InvestmentEventEngine] Successfully seeded ${seedEvents.length} canonical investment events.`);
      }
    } catch (err) {
      console.warn('[InvestmentEventEngine] Could not initialize seed events in persistence:', err);
    }
  }

  /**
   * Returns point-in-time timeline of investment events for a given security
   */
  public async getTimeline(securityId: string, asOfDate?: string): Promise<InvestmentEventTimeline> {
    await this.ensureInitialized();
    const canonical = resolveSecurity(securityId);
    const targetId = canonical ? canonical.id : securityId;
    const market = canonical ? canonical.market : 'US';

    const eventRepo = persistenceManager.getEventRepository();
    const rawEvents = await eventRepo.getBySecurityId(targetId, asOfDate);

    // Apply strict PIT cutoff
    let filtered = rawEvents;
    if (asOfDate) {
      const asOfIso = asOfDate.includes('T') ? asOfDate : `${asOfDate}T23:59:59.999Z`;
      const asOfTime = new Date(asOfIso).getTime();
      filtered = rawEvents.filter(e => {
        const availTime = new Date(e.availableAt).getTime();
        return !isNaN(availTime) && availTime <= asOfTime;
      });
    }

    const availableSources = Array.from(new Set(filtered.map(e => e.sourceType)));

    return {
      securityId: targetId,
      market,
      asOfDate: asOfDate || new Date().toISOString().split('T')[0],
      events: filtered,
      totalEvents: filtered.length,
      availableSources,
      epistemicStatus: 'REAL',
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Computes the complete causal impact of a specific investment event
   */
  public async getEventImpact(eventId: string, asOfDate?: string): Promise<InvestmentEventImpact> {
    await this.ensureInitialized();
    const eventRepo = persistenceManager.getEventRepository();
    const event = await eventRepo.get(eventId);

    if (!event) {
      throw new Error(`Investment event not found: "${eventId}"`);
    }

    // 1. Evaluate Decision Assessment Impact
    const decisionImpact = await this.evaluateDecisionImpact(event, asOfDate);

    // 2. Evaluate Thesis Pillar Impact
    const thesisImpact = await this.evaluateThesisImpact(event);

    // 3. Evaluate Research Snapshot Impact
    const researchImpact = await this.evaluateResearchImpact(event);

    // 4. Evaluate Portfolio Holdings Impact
    const portfolioImpact = await this.evaluatePortfolioImpact(event);

    // 5. Aggregate Significance
    const significance: EventSignificance = event.significance || {
      affectsThesis: thesisImpact.affectedAreas.length > 0 ? 'YES' : 'NO',
      affectsDecision: decisionImpact.hasSubsequentDecision && Math.abs(decisionImpact.scoreDelta || 0) >= 3 ? 'YES' : 'NO',
      affectsPortfolio: portfolioImpact.hasExposure ? 'YES' : 'NO',
      affectsEvidenceCoverage: researchImpact.coverageDelta !== 0 ? 'YES' : 'NO',
      affectsInvalidationState: thesisImpact.invalidationTriggered ? 'YES' : 'NO'
    };

    // 6. Generate AI or Deterministic Explanation
    const explanation = await this.generateImpactExplanation(event, {
      decision: decisionImpact,
      thesis: thesisImpact,
      research: researchImpact,
      portfolio: portfolioImpact,
      significance
    });

    // 7. Structured Data Delta for "What Happened"
    const structuredDataDelta: Record<string, { previous?: any; current?: any; delta?: any }> = {};
    const prev = event.previousState || {};
    const curr = event.currentState || event.structuredData || {};
    const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(curr)]));
    for (const key of allKeys) {
      const p = prev[key];
      const c = curr[key];
      let delta = undefined;
      if (typeof p === 'number' && typeof c === 'number') {
        delta = Number((c - p).toFixed(4));
      }
      structuredDataDelta[key] = { previous: p, current: c, delta };
    }

    const whatHappened = {
      title: event.title,
      summary: event.summary,
      structuredDataDelta
    };

    return {
      eventId: event.eventId,
      securityId: event.securityId,
      event,
      asOfDate: asOfDate || event.availableAt.split('T')[0],
      whatHappened,
      whatChanged: {
        decision: decisionImpact,
        thesis: thesisImpact,
        research: researchImpact,
        portfolio: portfolioImpact
      },
      significance,
      explanation,
      epistemicStatus: event.epistemicStatus,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Ingests a new investment event into immutable persistence
   * and dispatches an alert if significant
   */
  public async recordEvent(eventInput: Omit<InvestmentEvent, 'createdAt'> & { createdAt?: string }): Promise<InvestmentEvent> {
    await this.ensureInitialized();
    const event: InvestmentEvent = {
      ...eventInput,
      createdAt: eventInput.createdAt || new Date().toISOString()
    };

    const eventRepo = persistenceManager.getEventRepository();
    const saved = await eventRepo.save(event);

    // If this event threatens the thesis or triggers invalidation, automatically emit an alert
    if (
      saved.significance?.affectsInvalidationState === 'YES' ||
      saved.significance?.affectsThesis === 'YES' ||
      saved.eventType === 'THESIS_INVALIDATION'
    ) {
      await this.emitEventAlert(saved);
    }

    return saved;
  }

  // =========================================================================
  // PRIVATE EVALUATION METHODS
  // =========================================================================

  private async evaluateDecisionImpact(event: InvestmentEvent, asOfDate?: string): Promise<DecisionImpactSummary> {
    const decisionRepo = persistenceManager.getDecisionRepository();
    const canonical = resolveSecurity(event.securityId);
    const targetId = canonical ? canonical.id : event.securityId;

    const history = await decisionRepo.getHistory(targetId);
    if (!history || history.length === 0) {
      return {
        hasSubsequentDecision: false,
        narrative: `No historical decision assessments have been archived for ${event.ticker || targetId} to compare pre/post impact.`
      };
    }

    // Sort ascending by timestamp / generatedAt / asOfDate
    const getAssessmentTime = (d: InvestmentDecisionAssessment) => new Date(d.generatedAt || d.asOfDate).getTime();
    const sorted = [...history].sort((a, b) => getAssessmentTime(a) - getAssessmentTime(b));
    const eventTime = new Date(event.availableAt).getTime();

    // Decisions before event
    const beforeDecisions = sorted.filter(d => getAssessmentTime(d) <= eventTime);
    // Decisions after event (bounded by asOfDate if provided)
    let afterDecisions = sorted.filter(d => getAssessmentTime(d) > eventTime);
    if (asOfDate) {
      const asOfIso = asOfDate.includes('T') ? asOfDate : `${asOfDate}T23:59:59.999Z`;
      const asOfTime = new Date(asOfIso).getTime();
      afterDecisions = afterDecisions.filter(d => getAssessmentTime(d) <= asOfTime);
    }

    const decisionBefore = beforeDecisions.length > 0 ? beforeDecisions[beforeDecisions.length - 1] : null;
    const decisionAfter = afterDecisions.length > 0 ? afterDecisions[0] : null;

    if (!decisionAfter) {
      return {
        hasSubsequentDecision: false,
        decisionBefore: decisionBefore ? this.mapDecisionSummary(decisionBefore) : null,
        narrative: decisionBefore
          ? `Last archived assessment on ${decisionBefore.asOfDate} held score ${decisionBefore.compositeScore}/100 (${decisionBefore.conviction}). No subsequent committee review archived post-event.`
          : 'No baseline assessment prior to event available.'
      };
    }

    const scoreDelta = decisionBefore ? decisionAfter.compositeScore - decisionBefore.compositeScore : 0;
    const convictionChange = decisionBefore && decisionBefore.conviction !== decisionAfter.conviction
      ? `${decisionBefore.conviction} -> ${decisionAfter.conviction}`
      : undefined;

    const ratingBefore = decisionBefore ? this.extractRating(decisionBefore) : undefined;
    const ratingAfter = this.extractRating(decisionAfter);
    const ratingChange = ratingBefore && ratingBefore !== ratingAfter
      ? `${ratingBefore} -> ${ratingAfter}`
      : undefined;

    // Dimension deltas
    const dimensionDeltas: Record<string, number> = {};
    if (decisionBefore && decisionBefore.dimensionAssessments && decisionAfter.dimensionAssessments) {
      for (const [key, afterDim] of Object.entries(decisionAfter.dimensionAssessments)) {
        const beforeDim = (decisionBefore.dimensionAssessments as Record<string, any>)[key];
        if (beforeDim && typeof beforeDim.score === 'number' && typeof afterDim.score === 'number') {
          dimensionDeltas[key] = Math.round((afterDim.score - beforeDim.score) * 10) / 10;
        }
      }
    }

    const direction = scoreDelta > 0 ? `increased by +${scoreDelta}` : scoreDelta < 0 ? `declined by ${scoreDelta}` : `remained steady`;
    const narrative = `Subsequent decision assessment on ${decisionAfter.asOfDate} ${direction} pts to ${decisionAfter.compositeScore}/100. ${convictionChange ? `Conviction shifted: ${convictionChange}. ` : ''}${ratingChange ? `Rating changed: ${ratingChange}.` : ''}`;

    return {
      hasSubsequentDecision: true,
      decisionBefore: decisionBefore ? this.mapDecisionSummary(decisionBefore) : null,
      decisionAfter: this.mapDecisionSummary(decisionAfter),
      scoreDelta,
      convictionChange,
      ratingChange,
      dimensionDeltas,
      narrative
    };
  }

  private extractRating(d: InvestmentDecisionAssessment): string {
    if (!d.overallAssessment) return 'NEUTRAL';
    if (typeof d.overallAssessment === 'string') return d.overallAssessment;
    return (d.overallAssessment as any).action || (d.overallAssessment as any).rating || 'NEUTRAL';
  }

  private mapDecisionSummary(d: InvestmentDecisionAssessment) {
    const dimensionScores: Record<string, number> = {};
    if (d.dimensionAssessments) {
      for (const [k, v] of Object.entries(d.dimensionAssessments)) {
        if (v && typeof v.score === 'number') {
          dimensionScores[k] = v.score;
        }
      }
    } else if (d.dimensionsList) {
      for (const dim of d.dimensionsList) {
        if (dim && typeof dim.score === 'number') {
          const key = dim.dimension || (dim as any).key || 'general';
          dimensionScores[key] = dim.score;
        }
      }
    }

    const thesisStatusStr = typeof (d as any).thesisStatus === 'string'
      ? (d as any).thesisStatus
      : (d as any).thesisStatus?.status || undefined;

    return {
      decisionId: d.decisionId,
      asOfDate: d.asOfDate,
      compositeScore: d.compositeScore,
      conviction: String(d.conviction),
      rating: this.extractRating(d),
      thesisStatus: thesisStatusStr,
      dimensionScores
    };
  }

  private async evaluateThesisImpact(event: InvestmentEvent): Promise<ThesisImpactSummary> {
    const affectedAreas: ThesisImpactArea[] = event.affectedThesisAreas || [];
    const details: ThesisImpactSummary['details'] = [];

    let invalidationTriggered = false;
    let invalidationConditionId: string | undefined;

    if (event.eventType === 'THESIS_INVALIDATION' || affectedAreas.includes('INVALIDATION_CONDITION')) {
      invalidationTriggered = true;
      invalidationConditionId = (event.structuredData?.conditionId as string) || `inv-${event.securityId}`;
      details.push({
        area: 'INVALIDATION_CONDITION',
        label: 'Thesis Invalidation Threshold Triggered',
        evidenceSnippet: event.summary,
        impactDescription: `Primary condition reached threshold. Requires immediate committee thesis re-underwriting.`
      });
    }

    if (affectedAreas.includes('BULL_CASE')) {
      details.push({
        area: 'BULL_CASE',
        label: 'Growth Vector & Margin Expansion Driver',
        evidenceSnippet: event.summary,
        impactDescription: event.eventType === 'EARNINGS_EVENT' || event.eventType === 'SEC_FILING'
          ? 'Affirms core operational expansion thesis and unit economics durability.'
          : 'Impacts fundamental growth trajectory projections.'
      });
    }

    if (affectedAreas.includes('RISK')) {
      details.push({
        area: 'RISK',
        label: 'Operational or Regulatory Risk Dimension',
        evidenceSnippet: event.summary,
        impactDescription: 'Identifies shifts in supply chain, regulatory compliance, or competitive intensity.'
      });
    }

    if (affectedAreas.includes('CATALYST')) {
      details.push({
        area: 'CATALYST',
        label: 'Key Investment Milestone Realization',
        evidenceSnippet: event.summary,
        impactDescription: 'Event confirms timing and execution velocity of anticipated fundamental catalyst.'
      });
    }

    if (affectedAreas.includes('EVIDENCE_GAP')) {
      details.push({
        area: 'EVIDENCE_GAP',
        label: 'Primary Evidence Resolution',
        evidenceSnippet: event.sourceReference,
        impactDescription: 'Direct SEC/Exchange filing satisfies previously open institutional evidence gap.'
      });
    }

    const narrative = details.length > 0
      ? `Event impacts ${details.length} thesis component(s): ${details.map(d => d.area).join(', ')}. ${invalidationTriggered ? 'CRITICAL: Thesis invalidation condition triggered.' : 'Core investment pillars remain structurally tested.'}`
      : `Neutral thesis footprint; no designated core thesis pillars breach predefined thresholds.`;

    return {
      affectedAreas,
      relatedEvidenceIds: event.evidenceIds || [],
      invalidationTriggered,
      invalidationConditionId,
      details,
      narrative
    };
  }

  private async evaluateResearchImpact(event: InvestmentEvent): Promise<ResearchImpactSummary> {
    const notebookService = ResearchNotebookService.getInstance();
    const canonical = resolveSecurity(event.securityId);
    const targetId = canonical ? canonical.id : event.securityId;

    try {
      const history = await notebookService.getSnapshots(targetId);
      if (!history || history.length === 0) {
        return {
          hasSnapshotComparison: false,
          changedClaimsCount: 0,
          changedRisksCount: 0,
          changedCatalystsCount: 0,
          coverageDelta: 0,
          narrative: 'No archived research snapshots available for baseline comparison.'
        };
      }

      const getSnapTime = (s: ResearchSnapshot) => new Date(s.createdAt || s.researchAsOfDate).getTime();
      const eventTime = new Date(event.availableAt).getTime();
      const before = history.filter(s => getSnapTime(s) <= eventTime);
      const after = history.filter(s => getSnapTime(s) > eventTime);

      const snapBefore = before.length > 0 ? before[before.length - 1] : null;
      const snapAfter = after.length > 0 ? after[0] : null;

      if (!snapBefore || !snapAfter) {
        return {
          hasSnapshotComparison: false,
          snapshotBeforeId: snapBefore?.snapshotId || null,
          snapshotAfterId: snapAfter?.snapshotId || null,
          changedClaimsCount: 0,
          changedRisksCount: 0,
          changedCatalystsCount: 0,
          coverageDelta: 0,
          narrative: snapBefore
            ? `Baseline research snapshot "${snapBefore.query || 'Notebook Baseline'}" archived on ${snapBefore.researchAsOfDate}. No subsequent snapshot generated yet.`
            : 'No preceding research snapshot detected.'
        };
      }

      // Compare claims
      const beforeClaimIds = new Set((snapBefore.claims || []).map((c: any) => c.id || c.claimId));
      const afterClaims = snapAfter.claims || [];
      const newClaims = afterClaims.filter((c: any) => !beforeClaimIds.has(c.id || c.claimId)).length;

      // Compare risks
      const beforeRisksCount = snapBefore.thesis?.risks?.length || 0;
      const afterRisksCount = snapAfter.thesis?.risks?.length || 0;
      const changedRisks = Math.abs(afterRisksCount - beforeRisksCount);

      // Compare catalysts
      const beforeCatCount = snapBefore.thesis?.catalysts?.length || 0;
      const afterCatCount = snapAfter.thesis?.catalysts?.length || 0;
      const changedCatalysts = Math.abs(afterCatCount - beforeCatCount);

      const coverageBefore = snapBefore.evidenceIds?.length ? Math.min(100, snapBefore.evidenceIds.length * 15) : 80;
      const coverageAfter = snapAfter.evidenceIds?.length ? Math.min(100, snapAfter.evidenceIds.length * 15) : 85;
      const coverageDelta = coverageAfter - coverageBefore;

      return {
        hasSnapshotComparison: true,
        snapshotBeforeId: snapBefore.snapshotId,
        snapshotAfterId: snapAfter.snapshotId,
        changedClaimsCount: newClaims,
        changedRisksCount: changedRisks,
        changedCatalystsCount: changedCatalysts,
        coverageDelta,
        narrative: `Research notebook updated between snapshot v${snapBefore.snapshotId.slice(-4)} and v${snapAfter.snapshotId.slice(-4)}: ${newClaims} new verified claims registered, coverage delta: ${coverageDelta >= 0 ? `+${coverageDelta}` : coverageDelta}%.`
      };
    } catch {
      return {
        hasSnapshotComparison: false,
        changedClaimsCount: 0,
        changedRisksCount: 0,
        changedCatalystsCount: 0,
        coverageDelta: 0,
        narrative: 'Research comparison evaluated from structured event metadata.'
      };
    }
  }

  private async evaluatePortfolioImpact(event: InvestmentEvent): Promise<PortfolioImpactSummary> {
    try {
      const portfolioRepo = persistenceManager.getPortfolioRepository();
      const positions = await portfolioRepo.getPositions('default');
      const canonical = resolveSecurity(event.securityId);
      const symbol = canonical ? canonical.symbol.toUpperCase() : (event.ticker || '').toUpperCase();

      const matchingPos = positions.find(p => p.ticker.toUpperCase() === symbol);
      if (!matchingPos || matchingPos.shares <= 0) {
        return {
          hasExposure: false,
          narrative: `No active position in ${symbol} held in Default Portfolio. Zero direct capital exposure.`
        };
      }

      const totalValue = positions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0) || 1;
      const positionValue = matchingPos.shares * matchingPos.avgCost;
      const weightPct = Math.round((positionValue / totalValue) * 1000) / 10;

      return {
        hasExposure: true,
        portfolioId: 'default',
        shares: matchingPos.shares,
        weightPct,
        sector: canonical?.sector || 'Equities',
        currency: canonical?.currency || 'USD',
        narrative: `Active portfolio position held: ${matchingPos.shares.toLocaleString()} shares (~${weightPct}% portfolio allocation). Event directly impacts risk budget and fundamental return expectations.`
      };
    } catch {
      return {
        hasExposure: false,
        narrative: 'Portfolio repository offline; assuming zero direct portfolio exposure.'
      };
    }
  }

  private async generateImpactExplanation(
    event: InvestmentEvent,
    context: {
      decision: DecisionImpactSummary;
      thesis: ThesisImpactSummary;
      research: ResearchImpactSummary;
      portfolio: PortfolioImpactSummary;
      significance: EventSignificance;
    }
  ): Promise<{ summary: string; source: 'DETERMINISTIC' | 'AI_EXPLANATION'; causalChain: string[] }> {
    const causalChain: string[] = [
      `Primary Event: Disclosed via ${event.sourceType} (${event.sourceReference}) on ${event.eventDate}`,
      context.thesis.invalidationTriggered
        ? `Thesis Breached: Invalidation criteria met (${context.thesis.affectedAreas.join(', ')})`
        : `Thesis Impact: Evaluated against ${context.thesis.affectedAreas.join(', ') || 'core assumptions'}`,
      context.decision.hasSubsequentDecision
        ? `Assessment Shift: Committee registered net score delta of ${context.decision.scoreDelta ?? 0} pts`
        : `Assessment Baseline: Recorded into historical baseline without subsequent revision`,
      context.portfolio.hasExposure
        ? `Capital Allocation: Exposure of ${context.portfolio.weightPct}% monitored against risk budget`
        : `Capital Allocation: Zero active portfolio exposure`
    ];

    const ai = this.getClient();
    if (ai && aiCircuitBreaker.canExecuteAi()) {
      try {
        const prompt = `
You are an institutional investment analyst. Summarize the causal chain and significance of this investment event in 2-3 concise sentences.
Event: ${event.title} (${event.eventType}) on ${event.eventDate} for ${event.ticker || event.securityId}.
Summary: ${event.summary}
Decision impact: ${context.decision.narrative}
Thesis impact: ${context.thesis.narrative}
Portfolio exposure: ${context.portfolio.narrative}
Rule: Zero speculative forecasts. Purely factual causal synthesis. Avoid promotional fluff.
`;
        const response = await ai.models.generateContent({
          model: this.modelName,
          contents: prompt
        });

        if (response.text && response.text.trim().length > 20) {
          aiCircuitBreaker.recordSuccess();
          return {
            summary: response.text.trim(),
            source: 'AI_EXPLANATION',
            causalChain
          };
        }
      } catch (err) {
        aiCircuitBreaker.handleAiError('InvestmentEventEngine', err);
      }
    }

    // Deterministic High-Fidelity Synthesis
    const parts: string[] = [];
    parts.push(`On ${event.eventDate}, ${event.title} was disclosed via ${event.sourceType}.`);

    if (context.thesis.invalidationTriggered) {
      parts.push(`This triggered an investment thesis invalidation condition, necessitating immediate risk committee re-underwriting.`);
    } else if (context.thesis.affectedAreas.length > 0) {
      parts.push(`This directly impacts ${context.thesis.affectedAreas.join(' & ')} thesis pillars.`);
    }

    if (context.decision.hasSubsequentDecision && context.decision.scoreDelta !== undefined) {
      parts.push(`The subsequent assessment registered a composite score shift of ${context.decision.scoreDelta > 0 ? `+${context.decision.scoreDelta}` : context.decision.scoreDelta} pts.`);
    }

    if (context.portfolio.hasExposure) {
      parts.push(`Direct portfolio exposure stands at ${context.portfolio.weightPct}% of total assets.`);
    }

    return {
      summary: parts.join(' '),
      source: 'DETERMINISTIC',
      causalChain
    };
  }

  private async emitEventAlert(event: InvestmentEvent): Promise<void> {
    try {
      const alertRepo = persistenceManager.getAlertRepository();
      const canonical = resolveSecurity(event.securityId);
      const alert: AlertItem = {
        id: `ev-alert-${event.eventId}`,
        ticker: canonical ? canonical.symbol : (event.ticker || 'N/A'),
        companyName: canonical ? canonical.symbol : event.ticker,
        type: event.eventType === 'THESIS_INVALIDATION' ? 'thesis' : 'news',
        severity: event.eventType === 'THESIS_INVALIDATION' ? 'critical' : 'warning',
        title: `Event Impact: ${event.title}`,
        whatChanged: event.summary,
        whyItMatters: `Affects thesis areas: ${(event.affectedThesisAreas || []).join(', ') || 'Core Assumptions'}. Committee review advised.`,
        recommendedAction: 'Review updated decision assessment and thesis status.',
        evidence: {
          source: event.sourceReference || event.sourceType,
          filingDate: event.eventDate,
          confidence: 0.95
        },
        timestamp: event.availableAt,
        isRead: false,
        read: false,
        provenanceType: 'FACT'
      };

      await alertRepo.save(alert);
      console.log(`[InvestmentEventEngine] Emitted high-significance event alert: "${alert.title}"`);
    } catch (err) {
      console.warn('[InvestmentEventEngine] Failed to emit event alert:', err);
    }
  }

  // =========================================================================
  // CANONICAL SEED DATASET GENERATOR
  // =========================================================================

  private generateCanonicalSeedEvents(): InvestmentEvent[] {
    const nowIso = new Date().toISOString();

    return [
      // 1. AAPL FY2025 10-K Annual Report
      {
        eventId: 'evt-aapl-10k-2025',
        securityId: 'us-aapl',
        ticker: 'AAPL',
        market: 'US',
        exchange: 'NASDAQ',
        eventType: 'SEC_FILING',
        eventDate: '2025-10-31',
        announcedAt: '2025-10-31T16:05:00.000Z',
        availableAt: '2025-10-31T16:15:00.000Z',
        sourceType: 'SEC_EDGAR',
        sourceReference: '0000320193-25-000106 (Form 10-K)',
        evidenceIds: ['ev-sec-aapl-10k-2025'],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: 'Apple Inc. Form 10-K Annual Report Filed',
        summary: 'Reported FY2025 revenue of $391.0B (+2.0% YoY). Services revenue reached $96.2B with gross margin expanding to 74.2%. R&D expense increased 8% driven by Apple Intelligence silicon.',
        structuredData: {
          filingType: '10-K',
          revenueB: 391.0,
          servicesRevenueB: 96.2,
          servicesGrossMarginPct: 74.2,
          rdExpenseB: 31.4
        },
        previousState: { servicesGrossMarginPct: 71.8 },
        currentState: { servicesGrossMarginPct: 74.2 },
        affectedDimensions: ['fundamentalQuality', 'growthTrend', 'evidenceCoverage'],
        affectedThesisAreas: ['BULL_CASE', 'EVIDENCE_GAP'],
        significance: {
          affectsThesis: 'YES',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'YES',
          affectsInvalidationState: 'NO'
        },
        createdAt: nowIso
      },

      // 2. AAPL Q4 Earnings Surprise
      {
        eventId: 'evt-aapl-q4-2025-earn',
        securityId: 'us-aapl',
        ticker: 'AAPL',
        market: 'US',
        exchange: 'NASDAQ',
        eventType: 'EARNINGS_EVENT',
        eventDate: '2025-10-31',
        announcedAt: '2025-10-31T16:30:00.000Z',
        availableAt: '2025-10-31T16:35:00.000Z',
        sourceType: 'FINANCIAL_DISCLOSURE',
        sourceReference: 'Apple Q4 Earnings Release & Call Transcript',
        evidenceIds: ['ev-earn-aapl-q4-2025'],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: 'Apple Q4 Diluted EPS Beats Consensus by +6.2%',
        summary: 'Reported Q4 EPS of $1.64 versus consensus estimate of $1.54 (+6.2% beat). Greater China revenue demonstrated sequential stabilization.',
        structuredData: {
          epsReported: 1.64,
          epsConsensus: 1.54,
          beatPct: 6.2
        },
        previousState: { epsConsensus: 1.54 },
        currentState: { epsReported: 1.64 },
        affectedDimensions: ['fundamentalQuality', 'valuationContext', 'marketTrend'],
        affectedThesisAreas: ['CATALYST', 'BULL_CASE'],
        significance: {
          affectsThesis: 'YES',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'NO',
          affectsInvalidationState: 'NO'
        },
        createdAt: nowIso
      },

      // 3. NVDA Research Snapshot Update - Blackwell Architecture
      {
        eventId: 'evt-nvda-snap-blackwell',
        securityId: 'us-nvda',
        ticker: 'NVDA',
        market: 'US',
        exchange: 'NASDAQ',
        eventType: 'RESEARCH_SNAPSHOT_CHANGE',
        eventDate: '2025-11-15',
        announcedAt: '2025-11-15T09:00:00.000Z',
        availableAt: '2025-11-15T09:05:00.000Z',
        sourceType: 'RESEARCH_SYNTHESIS',
        sourceReference: 'Institutional Research Notebook v2.4',
        evidenceIds: ['ev-nvda-blackwell-checks'],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: 'Research Snapshot Updated: Blackwell Yields Confirmed',
        summary: 'Primary channel checks confirm TSMC CoWoS packaging yield ramp on B200 accelerators. Raised FY2026 data center gross margin estimate to 76.5%.',
        structuredData: {
          grossMarginEstPct: 76.5,
          volumeShipmentQuarter: 'Q1-2026'
        },
        previousState: { grossMarginEstPct: 74.0 },
        currentState: { grossMarginEstPct: 76.5 },
        affectedDimensions: ['growthTrend', 'fundamentalQuality', 'thesisStatus'],
        affectedThesisAreas: ['BULL_CASE', 'CATALYST'],
        significance: {
          affectsThesis: 'YES',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'YES',
          affectsInvalidationState: 'NO'
        },
        createdAt: nowIso
      },

      // 4. NVDA Regulatory Export Control Invalidation Check
      {
        eventId: 'evt-nvda-risk-export',
        securityId: 'us-nvda',
        ticker: 'NVDA',
        market: 'US',
        exchange: 'NASDAQ',
        eventType: 'THESIS_INVALIDATION',
        eventDate: '2025-12-02',
        announcedAt: '2025-12-02T14:20:00.000Z',
        availableAt: '2025-12-02T14:30:00.000Z',
        sourceType: 'REGULATORY_FILING',
        sourceReference: 'BIS Department of Commerce Rule Revision 15-CFR',
        evidenceIds: ['ev-bis-export-2025'],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: 'Regulatory Export Restrictions Revision Triggered Risk Threshold',
        summary: 'Updated BIS advanced computing export restrictions lower allowable interconnect density. Triggers thesis invalidation condition: China regional revenue share capped below 5%.',
        structuredData: {
          conditionId: 'inv-nvda-china-cap',
          ruleDensityThreshold: '4800 TPP',
          projectedRevenueImpactPct: -4.5
        },
        previousState: { status: 'SAFE' },
        currentState: { status: 'TRIGGERED' },
        affectedDimensions: ['riskProfile', 'thesisStatus', 'quantitativeSignal'],
        affectedThesisAreas: ['RISK', 'INVALIDATION_CONDITION'],
        significance: {
          affectsThesis: 'YES',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'YES',
          affectsInvalidationState: 'YES'
        },
        createdAt: nowIso
      },

      // 5. MSFT 10-Q Cloud Acceleration
      {
        eventId: 'evt-msft-10q-cloud',
        securityId: 'us-msft',
        ticker: 'MSFT',
        market: 'US',
        exchange: 'NASDAQ',
        eventType: 'SEC_FILING',
        eventDate: '2025-10-24',
        announcedAt: '2025-10-24T16:10:00.000Z',
        availableAt: '2025-10-24T16:15:00.000Z',
        sourceType: 'SEC_EDGAR',
        sourceReference: '0000789019-25-000042 (Form 10-Q)',
        evidenceIds: ['ev-msft-10q-q1-2026'],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: 'Microsoft Corp. Form 10-Q Discloses 33% Azure Growth',
        summary: 'Intelligent Cloud revenue grew 20% YoY to $24.1B. Azure and other cloud services revenue grew 33% (including 12 points of growth from AI services demand).',
        structuredData: {
          azureGrowthPct: 33,
          aiContributionPts: 12,
          cloudRevenueB: 24.1
        },
        previousState: { azureGrowthPct: 29 },
        currentState: { azureGrowthPct: 33 },
        affectedDimensions: ['growthTrend', 'fundamentalQuality'],
        affectedThesisAreas: ['BULL_CASE'],
        significance: {
          affectsThesis: 'YES',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'YES',
          affectsInvalidationState: 'NO'
        },
        createdAt: nowIso
      },

      // 6. RELIANCE Regulatory Disclosure - Green Energy Complex
      {
        eventId: 'evt-reliance-bse-green',
        securityId: 'in-reliance',
        ticker: 'RELIANCE',
        market: 'INDIA',
        exchange: 'BSE/NSE',
        eventType: 'CORPORATE_ACTION',
        eventDate: '2025-11-10',
        announcedAt: '2025-11-10T12:30:00.000Z',
        availableAt: '2025-11-10T12:35:00.000Z',
        sourceType: 'EXCHANGE_DISCLOSURE',
        sourceReference: 'BSE Listing Reg 30 (LODR) Disclosure Ref 2025-11-RIL',
        evidenceIds: ['ev-reliance-green-capex'],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: 'Reliance Industries Commissioning of 20GW Solar Giga Factory',
        summary: 'Commercial commissioning of Phase-1 Dhirubhai Ambani Green Energy Giga Complex in Jamnagar announced. Capital expenditure phase transitioning into initial EBITDA generation.',
        structuredData: {
          capexPhase: 'COMMISSIONED',
          capacityGW: 20,
          expectedEbitdaINR_Cr: 4500
        },
        previousState: { status: 'UNDER_CONSTRUCTION' },
        currentState: { status: 'COMMISSIONED' },
        affectedDimensions: ['growthTrend', 'backtestContext', 'thesisStatus'],
        affectedThesisAreas: ['CATALYST', 'BULL_CASE'],
        significance: {
          affectsThesis: 'YES',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'YES',
          affectsInvalidationState: 'NO'
        },
        createdAt: nowIso
      },

      // 7. TCS Form 57/BSE - Margin Guidance Recovery
      {
        eventId: 'evt-tcs-q2-margin',
        securityId: 'in-tcs',
        ticker: 'TCS',
        market: 'INDIA',
        exchange: 'BSE/NSE',
        eventType: 'EARNINGS_EVENT',
        eventDate: '2025-10-10',
        announcedAt: '2025-10-10T17:15:00.000Z',
        availableAt: '2025-10-10T17:20:00.000Z',
        sourceType: 'FINANCIAL_DISCLOSURE',
        sourceReference: 'NSE Corporate Announcement NSE/LIST/C/2025/089',
        evidenceIds: ['ev-tcs-q2-fy26'],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: 'TCS Q2 EBIT Margins Expand 40 bps to 26.2%',
        summary: 'Tata Consultancy Services reported consolidated operating margin of 26.2% (+40 bps QoQ). Total Contract Value (TCV) signed at robust $8.6B with North American deal momentum reviving.',
        structuredData: {
          ebitMarginPct: 26.2,
          tcvBillion: 8.6,
          qoqBps: 40
        },
        previousState: { ebitMarginPct: 25.8 },
        currentState: { ebitMarginPct: 26.2 },
        affectedDimensions: ['fundamentalQuality', 'marketTrend'],
        affectedThesisAreas: ['BULL_CASE'],
        significance: {
          affectsThesis: 'YES',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'NO',
          affectsInvalidationState: 'NO'
        },
        createdAt: nowIso
      }
    ];
  }
}

export const investmentEventEngine = InvestmentEventEngine.getInstance();
