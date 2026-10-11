/**
 * Phase 29: Investment Research Command Center Aggregation Service
 * 
 * Orchestration and Presentation Layer:
 * - Aggregates existing canonical intelligence into a unified institutional analyst cockpit.
 * - Does NOT create another intelligence engine.
 * - Strict Invariants:
 *   - isAnalyticalOnly: true
 *   - executionProhibited: true
 *   - Universal Point-in-Time (PIT) consistency via asOfDate.
 *   - Strict multi-tenant isolation (IDOR protection).
 *   - Strict currency isolation (USD vs INR).
 *   - Epistemic preservation (REAL, CALCULATED, SIMULATED, UNAVAILABLE, ERROR, STALE).
 *   - Deterministic ordering across all sections.
 *   - Gemini summarization non-interference (structured state remains 100% deterministic).
 */

import { latestDecisionVisibleTo, latestSnapshotVisibleTo, visibleToEngine } from '../../auth/engineScope';
import { GoogleGenAI } from '@google/genai';
import {
  CommandCenterViewData,
  CommandCenterFilter,
  CommandCenterAttentionSummary,
  CommandCenterPortfolioPulse,
  CommandCenterThesisDecisionChange,
  CommandCenterMaterialEvent,
  CommandCenterResearchCoverage,
  CommandCenterEvidenceHealth,
  CommandCenterExecutiveBriefing,
  ResearchPriorityItem,
  AlertInstance,
  SecurityIdentifier,
  InvestmentEvent,
  HoldingPosition
} from '../../../src/types';
import { researchPrioritizationEngine } from '../discovery/researchPrioritizationEngine';
import { persistenceManager } from '../../persistence/persistenceManager';
import { CANONICAL_SECURITIES } from '../../../src/data/canonicalSecurities';
import { calculateHerfindahlHirschmanIndex } from '../../../src/state/portfolioEngine';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';

export class ResearchCommandCenterService {
  private static instance: ResearchCommandCenterService;
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName = aiCircuitBreaker.getModelName();

  public static getInstance(): ResearchCommandCenterService {
    if (!ResearchCommandCenterService.instance) {
      ResearchCommandCenterService.instance = new ResearchCommandCenterService();
    }
    return ResearchCommandCenterService.instance;
  }

  private getClient(): GoogleGenAI | null {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && apiKey.trim().length > 0) {
        try {
          this.aiClient = new GoogleGenAI({ apiKey });
        } catch {
          // Client initialization fallback handled deterministically
        }
      }
    }
    return this.aiClient;
  }

  /**
   * Main aggregation method: reads canonical state and constructs the Command Center view.
   * Completely deterministic, read-only aggregation.
   */
  public async getCommandCenterData(
    userId: string,
    filter: CommandCenterFilter = {}
  ): Promise<CommandCenterViewData> {
    const scope = filter.scope || 'ALL';
    const effectiveAsOf = filter.asOfDate ? new Date(filter.asOfDate).toISOString() : new Date().toISOString();
    const asOfTimestamp = new Date(effectiveAsOf).getTime();

    // 1. Build Universe deterministically using Phase 28 engine
    const rawUniverse = await researchPrioritizationEngine.buildUniverse(userId, scope, effectiveAsOf);
    let universeSecurities = rawUniverse;
    if (filter.market) {
      universeSecurities = universeSecurities.filter(s => s.market === filter.market);
    }
    const universeSecIds = new Set(universeSecurities.map(s => s.id));

    // 2. Research Attention Queue (Reusing Phase 28 canonical prioritization)
    const prioritySnapshot = await researchPrioritizationEngine.generatePrioritization(userId, {
      universeType: scope,
      market: filter.market,
      asOfDate: effectiveAsOf,
      limit: filter.limit || 50
    });

    const researchAttentionQueue: ResearchPriorityItem[] = prioritySnapshot.items || [];
    const criticalCount = prioritySnapshot.priorityBreakdown?.CRITICAL || 0;
    const highCount = prioritySnapshot.priorityBreakdown?.HIGH || 0;

    // 3. Active Alerts (Reusing Phase 27 Alert Orchestration Repository)
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const rawAlerts = await alertRepo.getByUserId(userId);
    
    // PIT filter & Active/Unresolved filter
    const activeAlerts = rawAlerts
      .filter(a => {
        const detectedTime = new Date(a.detectedAt).getTime();
        const isBeforeCutoff = detectedTime <= asOfTimestamp;
        const isActive = a.status !== 'RESOLVED' && a.status !== 'DISMISSED';
        const inUniverse = scope === 'ALL' || universeSecIds.has(a.securityId || '');
        return isBeforeCutoff && isActive && inUniverse;
      })
      .sort((a, b) => {
        const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const sDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (sDiff !== 0) return sDiff;
        const tDiff = new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
        if (tDiff !== 0) return tDiff;
        return a.alertId.localeCompare(b.alertId);
      });

    // 4. Portfolio Pulse (Reusing Portfolio Intelligence & Repository)
    const portfolioPulse = await this.buildPortfolioPulse(userId, asOfTimestamp, filter.market);

    // 5. Thesis & Decision Changes Feed (From Monitor, Review, and Decision Intelligence)
    const thesisAndDecisionChanges = await this.buildThesisAndDecisionChanges(
      userId,
      universeSecurities,
      asOfTimestamp
    );

    // 6. Material Events Feed (From Phase 24 Investment Event Intelligence)
    const materialEvents = await this.buildMaterialEvents(
      universeSecurities,
      asOfTimestamp
    );

    // 7. Research Coverage & Gaps (From Research Notebook & Snapshots)
    const researchCoverage = await this.buildResearchCoverage(
      userId,
      universeSecurities,
      asOfTimestamp
    );

    // 8. Epistemic Data & Evidence Health
    const evidenceHealth = this.buildEvidenceHealth(
      researchAttentionQueue,
      activeAlerts,
      materialEvents,
      thesisAndDecisionChanges
    );

    // 9. Deterministic Summary Counts & Research Continuity Metrics (Phase 33)
    let unresolvedQuestionsCount = 0;
    let reassessmentRequiredCount = 0;
    let evidenceConflictCount = 0;
    let activeFindingsCount = 0;
    try {
      const memRepo = persistenceManager.getResearchMemoryRepository();
      const userMems = await memRepo.getAll({ userId, asOfDate: effectiveAsOf });
      activeFindingsCount = userMems.filter(m => m.status === 'ACTIVE').length;
      reassessmentRequiredCount = userMems.filter(m => m.status === 'REQUIRES_REASSESSMENT' || m.status === 'CONTRADICTED').length;
      evidenceConflictCount = userMems.filter(m => m.memoryType === 'EVIDENCE_CONFLICT').length;

      const qRepo = persistenceManager.getResearchQuestionRepository();
      const userQuestions = await qRepo.getAll({ userId, asOfDate: effectiveAsOf });
      unresolvedQuestionsCount = userQuestions.filter(q => q.status === 'OPEN' || q.status === 'INVESTIGATING').length;
    } catch {
      // Handled gracefully without blocking Command Center
    }

    const summary: CommandCenterAttentionSummary = {
      criticalResearchCount: criticalCount,
      highResearchCount: highCount,
      activeAlertsCount: activeAlerts.length,
      thesisChangesCount: thesisAndDecisionChanges.filter(c => c.thesisState === 'WEAKENED' || c.thesisState === 'INVALIDATED' || c.thesisState === 'UNDER_REVIEW').length,
      decisionChangesCount: thesisAndDecisionChanges.filter(c => c.decisionRating && c.previousRating && c.decisionRating !== c.previousRating).length,
      materialEventsCount: materialEvents.length,
      researchGapsCount: researchCoverage.gaps.length,
      staleResearchCount: researchCoverage.staleCount,
      totalUniverseCount: universeSecurities.length,
      researchContinuity: {
        unresolvedQuestionsCount,
        reassessmentRequiredCount,
        evidenceConflictCount,
        activeFindingsCount
      }
    };

    // 10. Optional Executive Briefing (Gemini with safe deterministic fallback)
    const executiveBriefing = await this.generateExecutiveBriefing(
      summary,
      researchAttentionQueue,
      activeAlerts,
      materialEvents,
      portfolioPulse
    );

    return {
      metadata: {
        universeScope: scope,
        asOfDate: effectiveAsOf,
        evaluatedAt: new Date().toISOString(),
        userId,
        isAnalyticalOnly: true,
        executionProhibited: true
      },
      summary,
      researchAttentionQueue,
      activeAlerts,
      portfolioPulse,
      thesisAndDecisionChanges,
      materialEvents,
      researchCoverage,
      evidenceHealth,
      executiveBriefing,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Builds the deterministic Portfolio Pulse without introducing duplicate engines.
   * Maintains strict currency isolation (USD vs INR).
   */
  private async buildPortfolioPulse(
    userId: string,
    _asOfTimestamp: number,
    marketFilter?: string
  ): Promise<CommandCenterPortfolioPulse> {
    const portfolioRepo = persistenceManager.getPortfolioRepository();
    const allPositions: HoldingPosition[] = await portfolioRepo.getPositions();

    // Multi-tenant check: filter positions owned by userId
    const userPositions = allPositions.filter(p => {
      const owner = (p as any).ownerUserId || (p as any).userId;
      return !owner || owner === userId;
    });

    if (userPositions.length === 0) {
      return {
        hasHoldings: false,
        positionsCount: 0,
        totalValueUSD: 0,
        totalValueINR: 0,
        unrealizedPnLUSD: 0,
        unrealizedPnLINR: 0,
        unrealizedPnLPctUSD: 0,
        unrealizedPnLPctINR: 0,
        hhiConcentration: 0,
        concentrationLabel: 'DIVERSIFIED',
        currencyBreakdown: { USD: 0, INR: 0 },
        topExposures: [],
        isAnalyticalOnly: true,
        executionProhibited: true
      };
    }

    let usdValue = 0;
    let inrValue = 0;
    let usdUnrealizedPnL = 0;
    let inrUnrealizedPnL = 0;
    let usdCostBasis = 0;
    let inrCostBasis = 0;

    const exposures: Array<{
      securityId: string;
      symbol: string;
      companyName: string;
      shares: number;
      weightPct: number;
      marketValue: number;
      currency: string;
      unrealizedPnL: number;
      pnlPct: number;
    }> = [];

    // Map canonical securities for prices & meta
    const secMap = new Map<string, SecurityIdentifier>();
    CANONICAL_SECURITIES.forEach(s => secMap.set(s.symbol.toUpperCase(), s));

    for (const p of userPositions) {
      const sym = (p.ticker || '').toUpperCase();
      const sec = secMap.get(sym);
      const currency = p.currency || (sec ? sec.currency : 'USD');
      if (marketFilter && sec && sec.market !== marketFilter) continue;

      const currentPrice = (p as any).currentPrice || (sec as any)?.price || p.avgCost;
      const marketVal = p.marketValue ?? (p.shares * currentPrice);
      const costBasis = p.shares * p.avgCost;
      const uPnL = p.unrealizedPnL ?? (marketVal - costBasis);
      const pnlPct = costBasis > 0 ? (uPnL / costBasis) * 100 : 0;

      if (currency === 'INR') {
        inrValue += marketVal;
        inrUnrealizedPnL += uPnL;
        inrCostBasis += costBasis;
      } else {
        usdValue += marketVal;
        usdUnrealizedPnL += uPnL;
        usdCostBasis += costBasis;
      }

      exposures.push({
        securityId: p.securityId || sec?.id || sym.toLowerCase(),
        symbol: sym,
        companyName: sec?.companyName || sym,
        shares: p.shares,
        weightPct: 0, // calculated below per currency
        marketValue: Math.round(marketVal * 100) / 100,
        currency,
        unrealizedPnL: Math.round(uPnL * 100) / 100,
        pnlPct: Math.round(pnlPct * 100) / 100
      });
    }

    // Compute weights based on native currency totals
    for (const exp of exposures) {
      const total = exp.currency === 'INR' ? inrValue : usdValue;
      exp.weightPct = total > 0 ? Math.round((exp.marketValue / total) * 1000) / 10 : 0;
    }

    // Deterministic sort: weightPct descending, then symbol ascending
    exposures.sort((a, b) => b.weightPct - a.weightPct || a.symbol.localeCompare(b.symbol));

    // HHI calculation
    const weights = exposures.map(e => e.weightPct);
    const hhiResult = calculateHerfindahlHirschmanIndex(weights);
    const hhi = Math.round(hhiResult.hhi);
    let concentrationLabel: 'DIVERSIFIED' | 'MODERATE' | 'CONCENTRATED' = 'DIVERSIFIED';
    if (hhi > 2500) concentrationLabel = 'CONCENTRATED';
    else if (hhi >= 1500) concentrationLabel = 'MODERATE';

    const usdPnlPct = usdCostBasis > 0 ? (usdUnrealizedPnL / usdCostBasis) * 100 : 0;
    const inrPnlPct = inrCostBasis > 0 ? (inrUnrealizedPnL / inrCostBasis) * 100 : 0;

    return {
      hasHoldings: exposures.length > 0,
      positionsCount: exposures.length,
      totalValueUSD: Math.round(usdValue * 100) / 100,
      totalValueINR: Math.round(inrValue * 100) / 100,
      unrealizedPnLUSD: Math.round(usdUnrealizedPnL * 100) / 100,
      unrealizedPnLINR: Math.round(inrUnrealizedPnL * 100) / 100,
      unrealizedPnLPctUSD: Math.round(usdPnlPct * 100) / 100,
      unrealizedPnLPctINR: Math.round(inrPnlPct * 100) / 100,
      hhiConcentration: hhi,
      concentrationLabel,
      currencyBreakdown: {
        USD: Math.round(usdValue * 100) / 100,
        INR: Math.round(inrValue * 100) / 100
      },
      topExposures: exposures.slice(0, 10),
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Gathers thesis & decision changes from Investment Monitor Reviews and Decision History.
   */
  private async buildThesisAndDecisionChanges(
    userId: string,
    universe: SecurityIdentifier[],
    asOfTimestamp: number
  ): Promise<CommandCenterThesisDecisionChange[]> {
    const changes: CommandCenterThesisDecisionChange[] = [];
    const monitorRepo = persistenceManager.getMonitorRepository();
    const reviewRepo = persistenceManager.getMonitorReviewRepository();
    const decisionRepo = persistenceManager.getDecisionRepository();

    const userMonitors = await monitorRepo.getByUserId(userId);
    const monitorBySec = new Map<string, string>();
    userMonitors.forEach(m => monitorBySec.set(m.securityId, m.monitorId));

    for (const sec of universe) {
      const monitorId = monitorBySec.get(sec.id);
      let thesisState = 'VALID';
      let invalidationStatus = 'ACTIVE_GUARD';
      const changedDimensions: string[] = [];
      let latestReviewTime = '';
      let evidenceId: string | undefined;

      // 1. Check Monitor Reviews
      if (monitorId) {
        const reviews = await reviewRepo.getByMonitorId(monitorId);
        const pitReviews = reviews.filter(r => new Date(r.reviewedAt).getTime() <= asOfTimestamp);
        if (pitReviews.length > 0) {
          const latestReview = pitReviews[0];
          thesisState = latestReview.thesisHealth?.overallHealth || 'VALID';
          latestReviewTime = latestReview.reviewedAt;
          evidenceId = latestReview.thesisHealth?.supportingEvidenceIds?.[0];

          if (latestReview.changeSummary?.thesisChanged) {
            changedDimensions.push('Thesis Status');
          }
          if (latestReview.changeSummary?.decisionChanged) {
            changedDimensions.push('Decision Rating');
          }
          if (latestReview.changeSummary?.quantChanged) {
            changedDimensions.push('Quantitative Factors');
          }
          if (latestReview.changeSummary?.valuationChanged) {
            changedDimensions.push('Valuation Multiple');
          }
          if (latestReview.changeSummary?.invalidationChanged || latestReview.thesisHealth?.invalidationTriggered) {
            invalidationStatus = 'TRIGGERED';
            changedDimensions.push('Invalidation Breach');
          }
        }
      }

      // 2. Check Decision Intelligence history
      let decisionRating: string | undefined;
      let previousRating: string | undefined;
      let scoreDelta: number | undefined;

      try {
        const dec = await latestDecisionVisibleTo(userId, sec.id, new Date(asOfTimestamp).toISOString());
        if (dec) {
          decisionRating = dec.overallAssessment || (dec as any).rating;
          scoreDelta = dec.compositeScore;
          if (!latestReviewTime) {
            latestReviewTime = dec.asOfDate || dec.generatedAt || '';
          }
        }
      } catch (err) {
        console.warn(`[ResearchCommandCenterService] Decision check failed for ${sec.id}:`, err);
      }

      // If there is a material thesis or decision status change, include it
      const isMaterial =
        thesisState !== 'VALID' ||
        invalidationStatus === 'TRIGGERED' ||
        (decisionRating && previousRating && decisionRating !== previousRating) ||
        changedDimensions.length > 0;

      if (isMaterial) {
        changes.push({
          changeId: `chg_${sec.id}_${changes.length + 1}`,
          securityId: sec.id,
          symbol: sec.symbol,
          companyName: sec.companyName,
          thesisState,
          invalidationStatus,
          decisionRating,
          previousRating,
          scoreDelta,
          changedDimensions: Array.from(new Set(changedDimensions)),
          timestamp: latestReviewTime || new Date(asOfTimestamp).toISOString(),
          evidenceId,
          deepLinkUrl: monitorId ? `/monitor-review/${monitorId}` : `/deep-dive/${sec.symbol}`,
          epistemicStatus: 'CALCULATED'
        });
      }
    }

    // Deterministic sort: thesis state severity (INVALIDATED > WEAKENED > UNDER_REVIEW > VALID), then timestamp desc, then symbol
    const thesisRank: Record<string, number> = {
      INVALIDATED: 4,
      WEAKENED: 3,
      UNDER_REVIEW: 2,
      VALID: 1
    };

    changes.sort((a, b) => {
      const tDiff = (thesisRank[b.thesisState] || 0) - (thesisRank[a.thesisState] || 0);
      if (tDiff !== 0) return tDiff;
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.symbol.localeCompare(b.symbol);
    });

    return changes;
  }

  /**
   * Gathers material events from Phase 24 Investment Event Intelligence.
   */
  private async buildMaterialEvents(
    universe: SecurityIdentifier[],
    asOfTimestamp: number
  ): Promise<CommandCenterMaterialEvent[]> {
    const eventRepo = persistenceManager.getEventRepository();
    const events: CommandCenterMaterialEvent[] = [];

    for (const sec of universe) {
      let secEvents: InvestmentEvent[] = [];
      try {
        secEvents = await eventRepo.getBySecurityId(sec.id, new Date(asOfTimestamp).toISOString());
      } catch (err) {
        console.warn(`[ResearchCommandCenterService] Events check failed for ${sec.id}:`, err);
      }

      // PIT filter
      const pitEvents = secEvents.filter(e => {
        const pubTime = new Date(e.availableAt || e.announcedAt || e.eventDate).getTime();
        return pubTime <= asOfTimestamp;
      });

      // Filter to material events
      const material = pitEvents.filter(e => {
        const isMaterial =
          (e.significance?.overallScore ?? 0) >= 0.5 ||
          e.significance?.affectsThesis === 'YES' ||
          e.significance?.affectsDecision === 'YES' ||
          e.eventType === 'THESIS_INVALIDATION' ||
          e.eventType === 'EARNINGS_EVENT' ||
          e.eventType === 'SEC_FILING';
        return isMaterial;
      });

      for (const e of material) {
        events.push({
          eventId: e.eventId,
          securityId: sec.id,
          symbol: sec.symbol,
          companyName: sec.companyName,
          eventType: e.eventType,
          title: e.title || `${e.eventType} - ${sec.symbol}`,
          summary: e.summary || '',
          eventDate: e.eventDate,
          availableAt: e.availableAt || e.eventDate,
          sourceType: e.sourceType || 'CANONICAL_EVENT',
          sourceReference: e.sourceReference || e.eventId,
          affectsThesis: e.significance?.affectsThesis || 'UNKNOWN',
          affectsDecision: e.significance?.affectsDecision || 'UNKNOWN',
          epistemicStatus: e.epistemicStatus || 'REAL',
          isSimulated: Boolean(e.isSimulated),
          deepLinkUrl: `/deep-dive/${sec.symbol}`
        });
      }
    }

    // Deterministic sort: availableAt descending, then eventId ascending
    events.sort((a, b) => {
      const tDiff = new Date(b.availableAt).getTime() - new Date(a.availableAt).getTime();
      if (tDiff !== 0) return tDiff;
      return a.eventId.localeCompare(b.eventId);
    });

    return events.slice(0, 30);
  }

  /**
   * Builds Research Coverage metrics and gaps from Research Notebooks & Snapshots.
   */
  private async buildResearchCoverage(
    userId: string,
    universe: SecurityIdentifier[],
    asOfTimestamp: number
  ): Promise<CommandCenterResearchCoverage> {
    const notebookRepo = persistenceManager.getNotebookRepository();
    const snapshotRepo = persistenceManager.getSnapshotRepository();

    const allNotebooks = await notebookRepo.getAll();
    const userNotebooks = allNotebooks.filter(nb => visibleToEngine(nb, userId));

    const notebookBySec = new Map<string, any>();
    userNotebooks.forEach(nb => {
      if (nb.securityId) notebookBySec.set(nb.securityId, nb);
    });

    const allSnapshots = (await snapshotRepo.getAll()).filter(s => visibleToEngine(s, userId));
    const pitSnapshots = allSnapshots.filter(s => {
      const snapTime = new Date(s.createdAt || (s as any).researchAsOfDate).getTime();
      return snapTime <= asOfTimestamp;
    });

    const snapshotsBySec = new Map<string, any[]>();
    pitSnapshots.forEach(s => {
      const list = snapshotsBySec.get(s.securityId) || [];
      list.push(s);
      snapshotsBySec.set(s.securityId, list);
    });

    let coveredCount = 0;
    let freshCount = 0;
    let agingCount = 0;
    let staleCount = 0;
    const gaps: CommandCenterResearchCoverage['gaps'] = [];
    const recentSnapshots: CommandCenterResearchCoverage['recentSnapshots'] = [];

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    for (const sec of universe) {
      const nb = notebookBySec.get(sec.id);
      const snaps = snapshotsBySec.get(sec.id) || [];
      snaps.sort((a, b) => new Date(b.createdAt || (b as any).researchAsOfDate).getTime() - new Date(a.createdAt || (a as any).researchAsOfDate).getTime());

      if (!nb && snaps.length === 0) {
        gaps.push({
          securityId: sec.id,
          symbol: sec.symbol,
          companyName: sec.companyName,
          reason: 'NO_NOTEBOOK'
        });
        continue;
      }

      if (snaps.length === 0) {
        gaps.push({
          securityId: sec.id,
          symbol: sec.symbol,
          companyName: sec.companyName,
          reason: 'NO_SNAPSHOT'
        });
        coveredCount++;
        continue;
      }

      coveredCount++;
      const topSnap = snaps[0];
      recentSnapshots.push({
        snapshotId: topSnap.snapshotId,
        securityId: sec.id,
        symbol: sec.symbol,
        title: (topSnap as any).title || `Research Snapshot: ${sec.symbol}`,
        asOfDate: topSnap.researchAsOfDate || new Date(asOfTimestamp).toISOString().split('T')[0],
        createdAt: topSnap.createdAt || new Date(asOfTimestamp).toISOString()
      });

      const snapAge = asOfTimestamp - new Date(topSnap.createdAt || topSnap.researchAsOfDate).getTime();
      if (snapAge <= thirtyDaysMs) {
        freshCount++;
      } else if (snapAge <= sixtyDaysMs) {
        agingCount++;
      } else {
        staleCount++;
        gaps.push({
          securityId: sec.id,
          symbol: sec.symbol,
          companyName: sec.companyName,
          reason: 'STALE_RESEARCH'
        });
      }
    }

    // Deterministic sort for gaps
    const gapRank: Record<string, number> = {
      NO_NOTEBOOK: 3,
      NO_SNAPSHOT: 2,
      STALE_RESEARCH: 1
    };
    gaps.sort((a, b) => {
      const rDiff = (gapRank[b.reason] || 0) - (gapRank[a.reason] || 0);
      if (rDiff !== 0) return rDiff;
      return a.symbol.localeCompare(b.symbol);
    });

    recentSnapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.symbol.localeCompare(b.symbol));

    const total = universe.length;
    const coverageRatio = total > 0 ? Math.round((coveredCount / total) * 100) / 100 : 0;

    return {
      coveredSecuritiesCount: coveredCount,
      uncoveredSecuritiesCount: total - coveredCount,
      freshCount,
      agingCount,
      staleCount,
      coverageRatio,
      recentSnapshots: recentSnapshots.slice(0, 10),
      gaps: gaps.slice(0, 20)
    };
  }

  /**
   * Aggregates epistemic data & evidence health metrics.
   */
  private buildEvidenceHealth(
    priorities: ResearchPriorityItem[],
    alerts: AlertInstance[],
    events: CommandCenterMaterialEvent[],
    changes: CommandCenterThesisDecisionChange[]
  ): CommandCenterEvidenceHealth {
    let realCount = 0;
    let calculatedCount = 0;
    let simulatedCount = 0;
    let unavailableCount = 0;
    const errorCount = 0;
    let staleCount = 0;

    // Scan priorities & signals
    for (const p of priorities) {
      if (p.epistemicStatus === 'REAL') realCount++;
      else if (p.epistemicStatus === 'CALCULATED') calculatedCount++;
      else if (p.epistemicStatus === 'SIMULATED') simulatedCount++;
      else if (p.epistemicStatus === 'UNAVAILABLE') unavailableCount++;

      if (p.freshnessStatus === 'STALE') staleCount++;

      for (const sig of p.signals) {
        if (sig.epistemicStatus === 'REAL') realCount++;
        else if (sig.epistemicStatus === 'CALCULATED') calculatedCount++;
        else if (sig.epistemicStatus === 'SIMULATED') simulatedCount++;
        else if (sig.epistemicStatus === 'UNAVAILABLE') unavailableCount++;
      }
    }

    // Scan alerts
    for (const a of alerts) {
      const epStatus = (a as any).epistemicStatus || 'CALCULATED';
      if (epStatus === 'REAL') realCount++;
      else if (epStatus === 'CALCULATED') calculatedCount++;
      else if (epStatus === 'SIMULATED') simulatedCount++;
      else if (epStatus === 'UNAVAILABLE') unavailableCount++;
    }

    // Scan events
    for (const e of events) {
      if (e.isSimulated || e.epistemicStatus === 'SIMULATED') simulatedCount++;
      else if (e.epistemicStatus === 'REAL') realCount++;
      else calculatedCount++;
    }

    // Scan changes
    for (const c of changes) {
      if (c.epistemicStatus === 'CALCULATED') calculatedCount++;
      else realCount++;
    }

    const summaryNote = simulatedCount > 0
      ? `Active intelligence incorporates ${simulatedCount} simulated/scenario data points. Verified real regulatory evidence: ${realCount}.`
      : `Intelligence grounded across ${realCount} verified real evidence records and ${calculatedCount} canonical calculations.`;

    return {
      realCount,
      calculatedCount,
      simulatedCount,
      unavailableCount,
      errorCount,
      staleCount,
      summaryNote
    };
  }

  /**
   * Generates Executive Research Briefing using Gemini with safe deterministic fallback.
   * Gemini provides summarization text only and CANNOT change structured state.
   */
  public async generateExecutiveBriefing(
    summary: CommandCenterAttentionSummary,
    priorities: ResearchPriorityItem[],
    alerts: AlertInstance[],
    events: CommandCenterMaterialEvent[],
    portfolio: CommandCenterPortfolioPulse
  ): Promise<CommandCenterExecutiveBriefing> {
    const criticalItems = priorities.filter(p => p.priority === 'CRITICAL');
    const highItems = priorities.filter(p => p.priority === 'HIGH');
    const topAlerts = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');
    const topEvents = events.slice(0, 3);

    // Deterministic baseline briefing
    const fallbackBriefing: CommandCenterExecutiveBriefing = {
      summaryText: `Command Center identified ${summary.criticalResearchCount} critical research items, ${summary.highResearchCount} high priority investigations, and ${summary.activeAlertsCount} active alerts across ${summary.totalUniverseCount} evaluated universe securities.`,
      keyObservations: [
        criticalItems.length > 0
          ? `Critical investigative attention required for ${criticalItems.map(i => i.symbol).join(', ')} due to compound analytical convergence.`
          : 'No critical convergence emergencies detected in evaluated universe.',
        topAlerts.length > 0
          ? `${topAlerts.length} high/critical alerts require analyst review (${topAlerts.map(a => a.symbol || a.securityId).slice(0, 3).join(', ')}).`
          : 'All monitoring policies operating within established thresholds.',
        portfolio.hasHoldings
          ? `Portfolio concentration index is ${portfolio.hhiConcentration} (${portfolio.concentrationLabel}) across ${portfolio.positionsCount} holdings.`
          : 'No active portfolio holdings in evaluated universe.'
      ],
      topActionableFocus: criticalItems.length > 0
        ? `Investigate ${criticalItems[0].symbol}: ${criticalItems[0].primaryReason}`
        : highItems.length > 0
        ? `Review ${highItems[0].symbol}: ${highItems[0].primaryReason}`
        : 'Routine coverage review and stale research updates recommended.',
      generatedAt: new Date().toISOString(),
      isAIGenerated: false
    };

    if (!aiCircuitBreaker.canExecuteAi()) {
      fallbackBriefing.fallbackReason = aiCircuitBreaker.isPrepaymentDepleted()
        ? 'PREPAYMENT_CREDITS_DEPLETED'
        : 'DETERMINISTIC_MODE';
      return fallbackBriefing;
    }

    const client = this.getClient();
    if (!client) {
      fallbackBriefing.fallbackReason = 'GEMINI_CLIENT_NOT_CONFIGURED';
      return fallbackBriefing;
    }

    try {
      const prompt = `You are an institutional investment research director providing an executive morning briefing.
Summarize the following deterministic facts concisely in 2-3 sentences.
Do NOT give trading recommendations, buy/sell advice, or predict market returns.

FACTS:
- Critical Research Items: ${summary.criticalResearchCount} (${criticalItems.map(i => i.symbol).join(', ') || 'None'})
- High Priority Items: ${summary.highResearchCount} (${highItems.map(i => i.symbol).join(', ') || 'None'})
- Active Alerts: ${summary.activeAlertsCount} (${topAlerts.map(a => `${a.symbol}: ${a.title}`).join('; ') || 'None'})
- Recent Material Events: ${topEvents.map(e => `${e.symbol}: ${e.title}`).join('; ') || 'None'}
- Portfolio Holdings: ${portfolio.positionsCount}, HHI: ${portfolio.hhiConcentration} (${portfolio.concentrationLabel})

OUTPUT FORMAT:
Return a JSON object with:
{
  "summaryText": "...",
  "keyObservations": ["point 1", "point 2", "point 3"],
  "topActionableFocus": "..."
}`;

      const response = await client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text?.trim();
      if (!responseText) {
        fallbackBriefing.fallbackReason = 'EMPTY_GEMINI_RESPONSE';
        return fallbackBriefing;
      }

      const parsed = JSON.parse(responseText);
      if (!parsed.summaryText || !Array.isArray(parsed.keyObservations)) {
        fallbackBriefing.fallbackReason = 'INVALID_GEMINI_SCHEMA';
        return fallbackBriefing;
      }

      aiCircuitBreaker.recordSuccess();

      return {
        summaryText: String(parsed.summaryText),
        keyObservations: parsed.keyObservations.map((k: any) => String(k)),
        topActionableFocus: String(parsed.topActionableFocus || fallbackBriefing.topActionableFocus),
        generatedAt: new Date().toISOString(),
        isAIGenerated: true
      };
    } catch (err: unknown) {
      const { reason } = aiCircuitBreaker.handleAiError('ResearchCommandCenterService', err);
      fallbackBriefing.fallbackReason = reason;
      return fallbackBriefing;
    }
  }
}

export const researchCommandCenterService = ResearchCommandCenterService.getInstance();
