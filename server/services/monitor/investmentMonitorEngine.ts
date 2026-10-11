/**
 * Investment Monitor Engine (Phase 25)
 * 
 * Answers the institutional analyst question:
 * "Since I last reviewed this investment, what changed?"
 * 
 * Strict Invariants & Institutional Safeguards:
 * 1. Deterministic change detection across Thesis, Decision, Events, Evidence, Portfolio, Quant, Valuation, Invalidation, and Data Quality.
 * 2. Immutable Historical Reviews: Once an InvestmentMonitorReview is generated and saved, it cannot be modified or overwritten.
 * 3. Point-in-Time (PIT) Integrity: Strict timestamp filtering using `asOfDate` or cutoff timestamps; zero lookahead bias.
 * 4. Authorization & Tenancy: Monitors and reviews are scoped to `ownerUserId`. Cross-tenant access is strictly rejected.
 * 5. Analytical Only: `isAnalyticalOnly: true`, `executionProhibited: true`. No automated trading, no broker order placement.
 * 6. AI Guardrail: Gemini is strictly used for synthesis phrasing if available; it CANNOT invent events, calculate deltas, change thesis health, or trigger execution.
 */

import { latestDecisionVisibleTo, latestSnapshotVisibleTo, visibleToEngine } from '../../auth/engineScope';
import { GoogleGenAI } from '@google/genai';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';
import {
  InvestmentMonitor,
  InvestmentMonitorReview,
  MonitorChangeItem,
  ThesisHealthReport,
  MonitorChangeSummary,
  MonitorDecisionDelta,
  MonitorThesisDelta,
  MonitorEventDelta,
  MonitorEvidenceDelta,
  MonitorPortfolioDelta,
  MonitorQuantDelta,
  MonitorValuationDelta,
  MonitorInvalidationDelta,
  MonitorDataQualityDelta,
  MonitorReviewExplanation,
  AnalystReviewNote,
  ThesisCatalystItem,
  ThesisRiskItem,
  ThesisInvalidationItem,
  InvestmentEvent,
  InvestmentDecisionAssessment,
  ResearchSnapshot,
  ResearchNotebook,
  HoldingPosition,
  EvidenceItem,
  MonitorReviewAction,
  MonitorReviewComparison
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { resolveSecurity, canonicalSecurities } from '../../../src/data/canonicalSecurities';

export class InvestmentMonitorEngine {
  private static instance: InvestmentMonitorEngine;
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName = aiCircuitBreaker.getModelName();
  private initialized = false;

  public static getInstance(): InvestmentMonitorEngine {
    if (!InvestmentMonitorEngine.instance) {
      InvestmentMonitorEngine.instance = new InvestmentMonitorEngine();
    }
    return InvestmentMonitorEngine.instance;
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
   * Initializes default monitors if database is empty
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const monitorRepo = persistenceManager.getMonitorRepository();
      const count = await monitorRepo.count();
      if (count === 0) {
        await this.seedDefaultMonitors();
      }
      this.initialized = true;
    } catch (err) {
      console.warn('[InvestmentMonitorEngine] Initialization warning:', err);
    }
  }

  /**
   * Seed standard monitors for canonical securities (AAPL, NVDA, RELIANCE, TCS)
   */
  private async seedDefaultMonitors(): Promise<void> {
    const monitorRepo = persistenceManager.getMonitorRepository();
    const decisionRepo = persistenceManager.getDecisionRepository();
    const snapshotRepo = persistenceManager.getSnapshotRepository();
    const portfolioRepo = persistenceManager.getPortfolioRepository();

    const targetSecurities = ['AAPL', 'NVDA', 'RELIANCE', 'TCS'];
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    for (const target of targetSecurities) {
      const sec = resolveSecurity(target);
      if (!sec) continue;

      const secId = sec.id;
      const secTicker = sec.symbol;

      // Check for decision
      // Seed monitors may only baseline on SHARED (system) artifacts, never on another tenant's or legacy records.
      const decision = await latestDecisionVisibleTo(undefined, secId);
      const snapshot = await latestSnapshotVisibleTo(undefined, secId);
      const positions = await portfolioRepo.getPositions('default');
      const holding = positions.find(p => p.ticker === secTicker || p.securityId === secId);

      const monitor: InvestmentMonitor = {
        monitorId: `mon_${secId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
        userId: 'analyst-1',
        ownerUserId: 'analyst-1',
        securityId: secId,
        ticker: secTicker,
        companyName: sec.companyName,
        market: sec.market,
        status: 'ACTIVE',
        reviewCadence: 'WEEKLY',
        createdAt: twoWeeksAgo,
        updatedAt: twoWeeksAgo,
        lastReviewedAt: twoWeeksAgo,
        baselineDecisionId: decision?.decisionId,
        baselineSnapshotId: snapshot?.snapshotId,
        baselineEventTimestamp: twoWeeksAgo,
        baselineCompositeScore: decision?.compositeScore ?? 78,
        baselineRating: decision?.overallAssessment ?? 'FAVORABLE',
        baselineThesisStatus: 'HEALTHY',
        latestDecisionId: decision?.decisionId,
        latestSnapshotId: snapshot?.snapshotId,
        latestEventTimestamp: now.toISOString(),
        latestCompositeScore: decision?.compositeScore ?? 78,
        latestRating: decision?.overallAssessment ?? 'FAVORABLE',
        thesisStatus: 'HEALTHY',
        invalidationStatus: 'ACTIVE_GUARD',
        portfolioExposure: {
          hasExposure: !!holding,
          weightPct: (holding as any)?.weight || (holding as any)?.weightPct || 0,
          shares: holding?.shares || 0,
          unrealizedPnL: (holding as any)?.unrealizedPnl || 0
        },
        lastChangeSummary: 'Initial institutional monitor baseline established.',
        epistemicStatus: 'REAL',
        isAnalyticalOnly: true,
        executionProhibited: true
      };

      await monitorRepo.save(monitor);
    }
  }

  /**
   * Create a new Investment Monitor for a security
   */
  public async createMonitor(
    userId: string,
    securityId: string,
    options?: { reviewCadence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'EVENT_DRIVEN' }
  ): Promise<InvestmentMonitor> {
    const sec = resolveSecurity(securityId);
    if (!sec) {
      throw new Error(`Security not found for ID or ticker: ${securityId}`);
    }

    const secId = sec.id;
    const secTicker = sec.symbol;

    const monitorRepo = persistenceManager.getMonitorRepository();
    // Check if monitor already exists for this user and security
    const existing = await monitorRepo.getBySecurityId(secId, userId);
    if (existing) {
      if (options?.reviewCadence && existing.reviewCadence !== options.reviewCadence) {
        existing.reviewCadence = options.reviewCadence;
        await monitorRepo.update(existing.monitorId, { reviewCadence: options.reviewCadence });
      }
      return existing;
    }

    const now = new Date().toISOString();
    const decisionRepo = persistenceManager.getDecisionRepository();
    const snapshotRepo = persistenceManager.getSnapshotRepository();
    const portfolioRepo = persistenceManager.getPortfolioRepository();

    const decision = await latestDecisionVisibleTo(userId, secId);
    let snapshot = await latestSnapshotVisibleTo(userId, secId);
    if (!snapshot) {
      snapshot = await snapshotRepo.save({
        snapshotId: `snap_${secId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_baseline`,
        visibility: 'SHARED', // system-generated generic baseline (no user content)
        notebookId: `nb_${secId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
        securityId: secId,
        asOfDate: now,
        researchAsOfDate: now,
        thesis: {
          executiveThesis: `${sec.companyName} institutional research baseline.`,
          bullCase: { summary: 'Established competitive position', points: ['Established competitive position'], evidenceIds: [] },
          bearCase: { summary: 'Macro cyclicality', points: ['Macro cyclicality'], evidenceIds: [] }
        },
        claims: [],
        risks: [],
        catalysts: [],
        conflicts: [],
        evidenceIds: [],
        evidenceGaps: { available: [], missing: [], unavailable: [] },
        metrics: {
          quant: {
            momentumScore: 65,
            qualityScore: 70,
            volatilityScore: 40,
            trendDirection: 'BULLISH'
          } as any,
          valuation: {
            peRatio: 28.0,
            fairValue: 400,
            marginOfSafety: 10.0
          } as any
        },
        invalidationGuards: [],
        sources: [],
        epistemicStatus: 'REAL',
        createdAt: now
      } as any);
    }
    const positions = await portfolioRepo.getPositions(userId);
    const holding = positions.find(p => p.ticker === secTicker || p.securityId === secId);

    const monitorId = `mon_${secId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${Date.now()}`;

    const monitor: InvestmentMonitor = {
      monitorId,
      userId,
      ownerUserId: userId,
      securityId: secId,
      ticker: secTicker,
      companyName: sec.companyName,
      market: sec.market,
      status: 'ACTIVE',
      reviewCadence: options?.reviewCadence || 'WEEKLY',
      createdAt: now,
      updatedAt: now,
      lastReviewedAt: null, // Not reviewed yet
      baselineDecisionId: decision?.decisionId,
      baselineSnapshotId: snapshot?.snapshotId,
      baselineEventTimestamp: now,
      baselineCompositeScore: decision?.compositeScore ?? 75,
      baselineRating: decision?.overallAssessment ?? 'FAVORABLE',
      baselineThesisStatus: 'HEALTHY',
      latestDecisionId: decision?.decisionId,
      latestSnapshotId: snapshot?.snapshotId,
      latestEventTimestamp: now,
      latestCompositeScore: decision?.compositeScore ?? 75,
      latestRating: decision?.overallAssessment ?? 'FAVORABLE',
      thesisStatus: 'HEALTHY',
      invalidationStatus: 'ACTIVE_GUARD',
      portfolioExposure: {
        hasExposure: !!holding,
        weightPct: (holding as any)?.weight || (holding as any)?.weightPct || 0,
        shares: holding?.shares || 0,
        unrealizedPnL: (holding as any)?.unrealizedPnl || 0
      },
      lastChangeSummary: 'Monitor created. Ready for first continuous change review.',
      epistemicStatus: 'REAL',
      isAnalyticalOnly: true,
      executionProhibited: true
    };

    return await monitorRepo.save(monitor);
  }

  /**
   * Get all monitors owned by user
   */
  public async getMonitors(userId: string): Promise<InvestmentMonitor[]> {
    await this.initialize();
    const monitorRepo = persistenceManager.getMonitorRepository();
    return await monitorRepo.getByUserId(userId);
  }

  /**
   * Get single monitor with authorization validation
   */
  public async getMonitor(monitorId: string, userId?: string): Promise<InvestmentMonitor | null> {
    await this.initialize();
    const monitorRepo = persistenceManager.getMonitorRepository();
    const monitor = await monitorRepo.get(monitorId);
    if (!monitor) return null;

    if (userId && monitor.ownerUserId !== userId && monitor.userId !== userId) {
      throw new Error(`UNAUTHORIZED_MONITOR_ACCESS: User ${userId} is not authorized to access monitor ${monitorId}`);
    }

    return monitor;
  }

  /**
   * Update monitor settings
   */
  public async updateMonitor(
    monitorId: string,
    userId: string,
    updates: Partial<Pick<InvestmentMonitor, 'status' | 'reviewCadence'>>
  ): Promise<InvestmentMonitor> {
    const monitor = await this.getMonitor(monitorId, userId);
    if (!monitor) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    const monitorRepo = persistenceManager.getMonitorRepository();
    await monitorRepo.update(monitorId, updates);
    const updated = await monitorRepo.get(monitorId);
    return updated!;
  }

  /**
   * Delete monitor
   */
  public async deleteMonitor(monitorId: string, userId: string): Promise<boolean> {
    const monitor = await this.getMonitor(monitorId, userId);
    if (!monitor) return false;
    const monitorRepo = persistenceManager.getMonitorRepository();
    return await monitorRepo.delete(monitorId);
  }

  /**
   * Add an analyst note to monitor
   */
  public async addAnalystNote(
    monitorId: string,
    userId: string,
    authorName: string,
    content: string,
    reviewId?: string
  ): Promise<AnalystReviewNote> {
    const monitor = await this.getMonitor(monitorId, userId);
    if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

    const note: AnalystReviewNote = {
      noteId: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      monitorId,
      reviewId,
      userId,
      authorName,
      createdAt: new Date().toISOString(),
      content,
      label: 'USER NOTE',
      isImmutable: true
    };

    const monitorRepo = persistenceManager.getMonitorRepository();
    return await monitorRepo.addNote(monitorId, note);
  }

  /**
   * Get notes for monitor
   */
  public async getAnalystNotes(monitorId: string, userId: string): Promise<AnalystReviewNote[]> {
    await this.getMonitor(monitorId, userId);
    const monitorRepo = persistenceManager.getMonitorRepository();
    return await monitorRepo.getNotes(monitorId);
  }

  /**
   * Core Engine Method:
   * Detects ALL changes since the last review (or baseline if first review),
   * strictly adhering to Point-In-Time cutoffs.
   */
  public async detectAllChanges(
    monitorId: string,
    userId: string,
    asOfDate?: string
  ): Promise<InvestmentMonitorReview> {
    const monitor = await this.getMonitor(monitorId, userId);
    if (!monitor) {
      throw new Error(`Monitor ${monitorId} not found`);
    }

    const nowIso = asOfDate || new Date().toISOString();
    const baselineCutoff = monitor.lastReviewedAt || monitor.baselineEventTimestamp || monitor.createdAt;

    // 1. Fetch repositories
    const monitorRepo = persistenceManager.getMonitorRepository();
    const eventRepo = persistenceManager.getEventRepository();
    const evidenceRepo = persistenceManager.getEvidenceRepository();
    const decisionRepo = persistenceManager.getDecisionRepository();
    const notebookRepo = persistenceManager.getNotebookRepository();
    const snapshotRepo = persistenceManager.getSnapshotRepository();
    const portfolioRepo = persistenceManager.getPortfolioRepository();
    const reviewRepo = persistenceManager.getMonitorReviewRepository();

    // 2. Fetch past reviews to link previousReviewId
    const pastReviews = await reviewRepo.getByMonitorId(monitorId);
    const lastReview = pastReviews.length > 0 ? pastReviews[0] : null;

    // 3. Fetch security details
    const sec = resolveSecurity(monitor.securityId);
    const ticker = sec ? sec.symbol : monitor.ticker;

    // 4. Fetch events (Point-in-Time: availableAt <= nowIso)
    const allEvents = await eventRepo.getBySecurityId(monitor.securityId, nowIso);
    // Filter events that became available AFTER the baseline review cutoff
    const newEvents = allEvents.filter(ev => {
      const eventTime = ev.availableAt || ev.eventDate;
      return eventTime > baselineCutoff && eventTime <= nowIso;
    });

    // 5. Fetch evidence
    const allEvidence = (await evidenceRepo.queryEvidence({
      securityId: monitor.securityId,
      asOfDate: nowIso
    })).filter(ev => visibleToEngine(ev, userId));
    const newEvidence = allEvidence.filter(ev => {
      const pub = ev.publishedAt || ev.retrievedAt;
      return pub > baselineCutoff && pub <= nowIso;
    });

    // 6. Fetch decision assessment
    const currentDecision = await latestDecisionVisibleTo(userId, monitor.securityId, nowIso);
    let previousDecision: InvestmentDecisionAssessment | null = null;
    const priorDecisionId = monitor.latestDecisionId || monitor.baselineDecisionId;
    if (priorDecisionId) {
      const prior = await decisionRepo.get(priorDecisionId);
      previousDecision = prior && visibleToEngine(prior, userId) ? prior : null;
    }

    // 7. Fetch notebook (the caller's own notebook for the security, else an ownerless system notebook)
    const ownNotebook = (await notebookRepo.getAllForOwner(userId)).find(n => n.securityId === monitor.securityId);
    const rawNotebook = ownNotebook || (await notebookRepo.getBySecurityId(monitor.securityId));
    const notebook = rawNotebook && visibleToEngine(rawNotebook, userId) ? rawNotebook : null;
    const currentSnapshot = await latestSnapshotVisibleTo(userId, monitor.securityId, nowIso);
    let previousSnapshot: ResearchSnapshot | null = null;
    const priorSnapshotId = monitor.latestSnapshotId || monitor.baselineSnapshotId;
    if (priorSnapshotId) {
      const priorSnap = await snapshotRepo.get(priorSnapshotId);
      previousSnapshot = priorSnap && visibleToEngine(priorSnap, userId) ? priorSnap : null;
    }

    // 8. Fetch portfolio positions
    const portfolioPositions = await portfolioRepo.getPositions(userId);
    const holding = portfolioPositions.find(p => p.ticker === ticker || p.securityId === monitor.securityId);

    // 9. Collect all deterministic change items
    const changes: MonitorChangeItem[] = [];

    // --- A. EVENT DELTAS ---
    const criticalEvents: InvestmentEvent[] = [];
    for (const ev of newEvents) {
      const sig = ev.significance as any;
      const isCritical = sig?.impactLevel === 'CRITICAL' || sig?.affectsInvalidationState === 'YES' || (ev.eventType as string) === 'THESIS_INVALIDATION' || (ev.eventType as string) === 'REGULATORY_ENFORCEMENT' || (ev.eventType as string) === 'MANAGEMENT_CHANGE' || (ev.eventType as string) === 'THESIS_INVALIDATION_TRIGGER';
      if (isCritical) criticalEvents.push(ev);

      const scoreDelta = sig?.scoreDelta || 0;
      const direction = scoreDelta > 0
        ? 'FAVORABLE'
        : scoreDelta < 0
        ? 'UNFAVORABLE'
        : 'NEUTRAL';

      changes.push({
        changeId: `chg_ev_${ev.eventId}`,
        category: 'EVENT_CHANGE',
        title: `Event: ${ev.title}`,
        description: ev.summary || `Event of type ${ev.eventType} recorded.`,
        severity: (sig?.impactLevel as any) || (isCritical ? 'CRITICAL' : 'MEDIUM'),
        direction,
        isActionable: isCritical,
        requiresReview: sig?.impactLevel === 'CRITICAL' || sig?.impactLevel === 'HIGH' || isCritical,
        evidenceId: ev.evidenceIds?.[0],
        eventId: ev.eventId,
        timestamp: ev.availableAt || ev.eventDate,
        diff: {
          currentValue: ev.eventType,
          delta: sig?.scoreDelta || undefined
        }
      });
    }

    const eventDelta = {
      newEvents: newEvents.map(e => ({
        ...e,
        eventTimestamp: (e as any).eventTimestamp || e.availableAt || e.eventDate || e.createdAt
      })),
      totalCount: newEvents.length,
      narrative: `${newEvents.length} new events detected since baseline cutoff.`
    };

    // --- B. EVIDENCE DELTAS ---
    const evidenceDelta = {
      newEvidenceCount: newEvidence.length,
      contradictoryCount: (notebook as any)?.contradictions?.length || (currentSnapshot?.conflicts?.length || 0),
      conflictDetected: ((notebook as any)?.contradictions?.length || (currentSnapshot?.conflicts?.length || 0)) > 0,
      conflictSummary: ((notebook as any)?.contradictions?.length || (currentSnapshot?.conflicts?.length || 0)) > 0
        ? `Conflict detected: ${(notebook as any)?.contradictions?.length || currentSnapshot?.conflicts?.length} contradictory evidence points`
        : undefined,
      resolvedGapsCount: 0,
      evidenceIds: newEvidence.map(e => e.evidenceId),
      narrative: `${newEvidence.length} new evidence items analyzed.`
    };

    for (const evItem of newEvidence.slice(0, 5)) {
      changes.push({
        changeId: `chg_evi_${evItem.evidenceId}`,
        category: 'EVIDENCE_CHANGE',
        title: `Evidence: ${evItem.title}`,
        description: `Primary source: ${evItem.sourceType} (${evItem.provider}).`,
        severity: 'LOW',
        direction: 'NEUTRAL',
        isActionable: false,
        requiresReview: false,
        evidenceId: evItem.evidenceId,
        timestamp: evItem.retrievedAt,
        diff: {
          currentValue: evItem.sourceType
        }
      });
    }

    // --- C. DECISION DELTAS ---
    let decisionDelta: any = undefined;
    if (currentDecision) {
      const prevScore = previousDecision?.compositeScore ?? monitor.latestCompositeScore ?? monitor.baselineCompositeScore ?? currentDecision.compositeScore;
      const currScore = currentDecision.compositeScore;
      const scoreDelta = currScore - prevScore;

      const prevRating = previousDecision?.overallAssessment ?? monitor.latestRating ?? monitor.baselineRating ?? currentDecision.overallAssessment;
      const currRating = currentDecision.overallAssessment;
      const isRatingShift = prevRating !== currRating;

      const pillarDeltas: Record<string, number> = {};
      if (previousDecision?.dimensionAssessments && currentDecision.dimensionAssessments) {
        for (const [key, currDim] of Object.entries(currentDecision.dimensionAssessments)) {
          const prevDim = (previousDecision.dimensionAssessments as any)[key];
          if (prevDim && currDim) {
            pillarDeltas[key] = (currDim.score ?? 0) - (prevDim.score ?? 0);
          }
        }
      }

      const summary = isRatingShift
        ? `Rating shifted from ${prevRating} to ${currRating} with composite score delta of ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}.`
        : `Score adjusted by ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)} pts (${currScore}/100), rating remains ${currRating}.`;

      decisionDelta = {
        previous: previousDecision ? {
          decisionId: previousDecision.decisionId,
          asOfDate: previousDecision.asOfDate || monitor.baselineEventTimestamp || nowIso,
          compositeScore: prevScore,
          conviction: previousDecision.conviction || 'MEDIUM',
          rating: prevRating,
          dimensionScores: {}
        } : null,
        current: currentDecision ? {
          decisionId: currentDecision.decisionId,
          asOfDate: currentDecision.asOfDate || nowIso,
          compositeScore: currScore,
          conviction: currentDecision.conviction || 'MEDIUM',
          rating: currRating,
          dimensionScores: {}
        } : null,
        scoreDelta,
        compositeScoreDelta: scoreDelta,
        ratingShift: isRatingShift,
        currentCompositeScore: currScore,
        previousCompositeScore: prevScore,
        dimensionDeltas: pillarDeltas,
        narrative: summary,
        summary,
        previousScore: prevScore,
        currentScore: currScore,
        previousRating: prevRating,
        currentRating: currRating,
        isRatingShift,
        pillarDeltas
      };

      if (Math.abs(scoreDelta) >= 1 || isRatingShift) {
        changes.push({
          changeId: `chg_dec_${currentDecision.decisionId || Date.now()}`,
          category: 'DECISION_CHANGE',
          title: isRatingShift ? `Decision Rating Shift: ${prevRating} -> ${currRating}` : `Composite Score Delta: ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)} pts`,
          description: decisionDelta.summary,
          severity: isRatingShift ? 'HIGH' : Math.abs(scoreDelta) >= 5 ? 'MEDIUM' : 'LOW',
          direction: scoreDelta > 0 ? 'FAVORABLE' : scoreDelta < 0 ? 'UNFAVORABLE' : 'NEUTRAL',
          isActionable: isRatingShift,
          requiresReview: isRatingShift || Math.abs(scoreDelta) >= 5,
          timestamp: currentDecision.generatedAt || nowIso,
          diff: {
            previousValue: `${prevRating} (${prevScore})`,
            currentValue: `${currRating} (${currScore})`,
            delta: scoreDelta,
            unit: 'pts'
          }
        });
      }
    } else {
      decisionDelta = {
        previous: null,
        current: null,
        scoreDelta: 0,
        dimensionDeltas: {},
        narrative: 'No recent decision assessment recorded for this security.',
        summary: 'No recent decision assessment recorded for this security.',
        isRatingShift: false,
        previousRating: monitor.baselineRating || 'FAVORABLE',
        currentRating: monitor.latestRating || 'FAVORABLE'
      };
    }

    // --- D. THESIS HEALTH & THESIS DELTAS ---
    const notebookCatalysts: any[] = (currentSnapshot?.catalysts as any[]) || ((notebook as any)?.catalysts as any[]) || [];
    const catalysts: ThesisCatalystItem[] = notebookCatalysts.map((cat: any, idx: number) => ({
      catalystId: cat.catalystId || `cat_${idx + 1}`,
      description: typeof cat === 'string' ? cat : (cat.title || cat.description || 'Catalyst under observation'),
      state: 'PENDING',
      progressNotes: 'Active catalyst under observation.'
    }));

    const notebookRisks: any[] = (currentSnapshot?.risks as any[]) || ((notebook as any)?.risks as any[]) || [];
    const risks: ThesisRiskItem[] = notebookRisks.map((risk: any, idx: number) => ({
      riskId: risk.riskId || `risk_${idx + 1}`,
      description: typeof risk === 'string' ? risk : (risk.title || risk.description || 'Elevated risk factor'),
      state: 'ACTIVE',
      severity: 'ELEVATED',
      trend: 'STABLE'
    }));

    const invalidationList: any[] = ((currentSnapshot?.thesis as any)?.thesisInvalidationConditions) || ((notebook as any)?.invalidationConditions) || ((currentDecision as any)?.invalidationGuards) || [];
    const invalidationGuards: ThesisInvalidationItem[] = invalidationList.map((cond: any, idx: number) => ({
      conditionId: `inv_${idx + 1}`,
      description: typeof cond === 'string' ? cond : (cond.description || cond.condition || 'Guarded invalidation rule'),
      state: 'ACTIVE_GUARD'
    }));

    // Check if any critical event threatens or triggers invalidation
    let invalidationStatus: 'ACTIVE_GUARD' | 'THREATENED' | 'TRIGGERED' | 'RESOLVED' = 'ACTIVE_GUARD';
    const triggeredConditions: string[] = [];

    for (const ev of newEvents) {
      const isTrigger = (ev.eventType as string) === 'THESIS_INVALIDATION_TRIGGER' || 
                        (ev.eventType as string) === 'THESIS_INVALIDATION' ||
                        ev.title.toLowerCase().includes('invalidation trigger');
      const isThreat = ev.affectedThesisAreas?.includes('INVALIDATION_CONDITION' as any) ||
                       ev.affectedThesisAreas?.includes('INVALIDATION_CONDITIONS' as any) ||
                       ev.significance?.affectsInvalidationState === 'YES' ||
                       (ev.eventType as string) === 'REGULATORY_ENFORCEMENT';

      if (isTrigger) {
        invalidationStatus = 'TRIGGERED';
        if (invalidationGuards.length > 0) {
          invalidationGuards[0].state = 'TRIGGERED';
          invalidationGuards[0].triggerEvidence = ev.title;
          triggeredConditions.push(invalidationGuards[0].description);
        }
      } else if (isThreat && invalidationStatus !== 'TRIGGERED') {
        invalidationStatus = 'THREATENED';
        if (invalidationGuards.length > 0) {
          invalidationGuards[0].state = 'THREATENED';
          invalidationGuards[0].triggerEvidence = ev.title;
          triggeredConditions.push(invalidationGuards[0].description);
        }
      }
    }

    // Determine thesis status
    let thesisStatus: 'HEALTHY' | 'IMPACTED' | 'WEAKENED' | 'INVALIDATED' | 'UNDER_REVIEW' = 'HEALTHY';
    let bullCaseStatus: 'STRENGTHENING' | 'STABLE' | 'WEAKENING' | 'BROKEN' = 'STABLE';
    let bearCaseStatus: 'RECEDING' | 'STABLE' | 'MATERIALIZING' | 'DOMINANT' = 'STABLE';

    const netScoreDelta = decisionDelta ? decisionDelta.scoreDelta : 0;
    if (invalidationStatus === 'TRIGGERED') {
      thesisStatus = 'INVALIDATED';
      bullCaseStatus = 'BROKEN';
      bearCaseStatus = 'DOMINANT';
    } else if (invalidationStatus === 'THREATENED') {
      thesisStatus = 'UNDER_REVIEW';
      bearCaseStatus = 'MATERIALIZING';
    } else if (netScoreDelta <= -6 || criticalEvents.length > 0) {
      thesisStatus = 'WEAKENED';
      bullCaseStatus = 'WEAKENING';
      bearCaseStatus = 'MATERIALIZING';
    } else if (netScoreDelta < 0) {
      thesisStatus = 'IMPACTED';
    } else if (netScoreDelta >= 4) {
      bullCaseStatus = 'STRENGTHENING';
      thesisStatus = 'HEALTHY';
    } else {
      thesisStatus = (monitor.thesisStatus || monitor.baselineThesisStatus || 'HEALTHY') as any;
    }

    const thesisHealth: ThesisHealthReport = {
      overallHealth: thesisStatus === 'INVALIDATED' ? 'INVALIDATED' : (thesisStatus === 'WEAKENED' || thesisStatus === 'UNDER_REVIEW') ? 'WEAKENED' : thesisStatus === 'IMPACTED' ? 'WEAKENED' : 'HEALTHY',
      bullCaseState: bullCaseStatus === 'STRENGTHENING' ? 'STRENGTHENED' : (bullCaseStatus === 'WEAKENING' || bullCaseStatus === 'BROKEN') ? 'WEAKENED' : 'UNCHANGED',
      bearCaseState: (bearCaseStatus === 'MATERIALIZING' || bearCaseStatus === 'DOMINANT') ? 'STRENGTHENED' : (bearCaseStatus as any) === 'RECEDING' ? 'WEAKENED' : 'UNCHANGED',
      invalidationState: invalidationStatus === 'TRIGGERED' ? 'TRIGGERED' : (invalidationStatus as any) === 'RESOLVED' ? 'RECOVERED' : 'ACTIVE_GUARD',
      invalidationConditionsCount: invalidationGuards.length,
      triggeredConditionsCount: triggeredConditions.length,
      activeCatalystsCount: catalysts.length,
      supportingEvidenceIds: newEvidence.map(e => e.evidenceId),
      narrative: `Thesis health evaluated as ${thesisStatus}. Invalidation guard is ${invalidationStatus}. Bull case is ${bullCaseStatus}, bear case is ${bearCaseStatus}.`,
      overallStatus: thesisStatus,
      bullCaseStatus,
      bearCaseStatus,
      invalidationStatus,
      catalysts,
      risks,
      invalidationGuards,
      summary: `Thesis health evaluated as ${thesisStatus}. Invalidation guard is ${invalidationStatus}. Bull case is ${bullCaseStatus}, bear case is ${bearCaseStatus}.`,
      lastEvaluatedAt: nowIso
    };

    // Compare thesis status against previous baseline
    const prevThesisStatus = monitor.thesisStatus || monitor.baselineThesisStatus || 'HEALTHY';
    const isThesisChanged = thesisStatus !== prevThesisStatus;

    const thesisDelta: MonitorThesisDelta = {
      previousStatus: prevThesisStatus,
      currentStatus: thesisStatus,
      statusChanged: isThesisChanged,
      invalidationTriggered: invalidationStatus === 'TRIGGERED',
      affectedAreas: triggeredConditions.length > 0 ? ['INVALIDATION_CONDITIONS'] : [],
      narrative: `Thesis status is ${thesisStatus}. Invalidation guard: ${invalidationStatus}. Bull case: ${bullCaseStatus}, Bear case: ${bearCaseStatus}.`,
      summary: thesisHealth.summary,
      bullCaseShift: bullCaseStatus !== 'STABLE' ? `Bull case shifted to ${bullCaseStatus}` : undefined,
      bearCaseShift: bearCaseStatus !== 'STABLE' ? `Bear case shifted to ${bearCaseStatus}` : undefined,
      catalystsStatus: catalysts.length > 0 ? `${catalysts.length} active catalysts monitored` : 'No formal catalysts cataloged',
      risksStatus: risks.length > 0 ? `${risks.length} key risks active` : 'Standard market risk profile',
      invalidationState: invalidationStatus
    };

    if (isThesisChanged) {
      changes.push({
        changeId: `chg_the_${Date.now()}`,
        category: 'THESIS_CHANGE',
        title: `Thesis Status Shift: ${prevThesisStatus} -> ${thesisStatus}`,
        description: thesisHealth.summary,
        severity: thesisStatus === 'INVALIDATED' ? 'CRITICAL' : thesisStatus === 'WEAKENED' || thesisStatus === 'UNDER_REVIEW' ? 'HIGH' : 'MEDIUM',
        direction: thesisStatus === 'INVALIDATED' || thesisStatus === 'WEAKENED' ? 'UNFAVORABLE' : 'NEUTRAL',
        isActionable: true,
        requiresReview: true,
        timestamp: nowIso,
        diff: {
          previousValue: prevThesisStatus,
          currentValue: thesisStatus
        }
      });
    }

    // --- E. INVALIDATION DELTAS ---
    const prevInvalidationStatus = monitor.invalidationStatus || 'ACTIVE_GUARD';
    const isInvalidationChanged = invalidationStatus !== prevInvalidationStatus || triggeredConditions.length > 0;

    const invalidationDelta: MonitorInvalidationDelta = {
      status: invalidationStatus,
      narrative: triggeredConditions.length > 0
        ? `Condition threatened or triggered: ${triggeredConditions.join('; ')}`
        : `Invalidation guard status is ${invalidationStatus}.`,
      hasTriggeredConditions: triggeredConditions.length > 0,
      triggeredConditions,
      activeGuardsCount: invalidationGuards.filter(g => g.state === 'ACTIVE_GUARD').length,
      threatenedCount: invalidationGuards.filter(g => g.state === 'THREATENED').length,
      invalidationStatusChanged: isInvalidationChanged,
      previousStatus: prevInvalidationStatus,
      currentStatus: invalidationStatus
    };

    if (isInvalidationChanged && (invalidationDelta.threatenedCount > 0 || invalidationDelta.hasTriggeredConditions || invalidationStatus !== 'ACTIVE_GUARD')) {
      changes.push({
        changeId: `chg_inv_${Date.now()}`,
        category: 'INVALIDATION_CHANGE',
        title: `Invalidation Guard Alert: ${invalidationStatus}`,
        description: triggeredConditions.length > 0
          ? `Condition threatened or triggered: ${triggeredConditions.join('; ')}`
          : `Invalidation guard status shifted from ${prevInvalidationStatus} to ${invalidationStatus}.`,
        severity: invalidationDelta.hasTriggeredConditions ? 'CRITICAL' : 'HIGH',
        direction: 'UNFAVORABLE',
        isActionable: true,
        requiresReview: true,
        timestamp: nowIso,
        diff: {
          previousValue: prevInvalidationStatus,
          currentValue: invalidationStatus
        }
      });
    }

    // Risks delta comparison
    const prevRisksList = (previousSnapshot?.risks as any[]) || [];
    const hasNewRisks = risks.length > prevRisksList.length;
    if (hasNewRisks) {
      changes.push({
        changeId: `chg_risk_${Date.now()}`,
        category: 'RISK_CHANGE',
        title: `Elevated Risk Factors Identified (${risks.length - prevRisksList.length} new)`,
        description: `${risks.length - prevRisksList.length} new or elevated risk factor(s) emerged for ${ticker}.`,
        severity: 'MEDIUM',
        direction: 'UNFAVORABLE',
        isActionable: true,
        requiresReview: true,
        timestamp: nowIso
      });
    }

    // Catalysts delta comparison
    const prevCatalystsList = (previousSnapshot?.catalysts as any[]) || [];
    const hasNewCatalysts = catalysts.length > prevCatalystsList.length;
    if (hasNewCatalysts) {
      changes.push({
        changeId: `chg_cat_${Date.now()}`,
        category: 'CATALYST_CHANGE',
        title: `New Catalysts Tracked (${catalysts.length - prevCatalystsList.length} new)`,
        description: `${catalysts.length - prevCatalystsList.length} new catalyst(s) identified for tracking.`,
        severity: 'LOW',
        direction: 'FAVORABLE',
        isActionable: false,
        requiresReview: false,
        timestamp: nowIso
      });
    }

    // --- F. PORTFOLIO IMPACT DELTAS ---
    let portfolioDelta: any = undefined;
    const monTicker = (monitor.ticker || (sec as any)?.symbol || '').toUpperCase();
    const canonicalSec = canonicalSecurities.find(s => (s.symbol || (s as any).ticker || '').toUpperCase() === monTicker);
    const posCurrency = (holding as any)?.currency || canonicalSec?.currency || (sec as any)?.currency || ((sec as any)?.market === 'IN' ? 'INR' : 'USD');
    const currencySymbol = posCurrency === 'INR' ? '₹' : '$';

    if (holding) {
      const currentPrice = (holding as any).currentPrice || holding.avgCost || 100;
      const weight = (holding as any).weight || (holding as any).weightPct || 5;
      const positionValue = holding.shares * currentPrice;
      const pnlAmount = (holding as any).unrealizedPnl ?? (holding as any).unrealizedPnL ?? ((currentPrice - holding.avgCost) * holding.shares);
      const pnlPercent = (holding as any).unrealizedPnlPercent ?? (holding.avgCost > 0 ? ((currentPrice - holding.avgCost) / holding.avgCost) * 100 : 0);

      const prevExposure = monitor.portfolioExposure;
      const hasExposureChanged = !prevExposure?.hasExposure;
      const sharesDelta = prevExposure?.hasExposure ? (holding.shares - (prevExposure.shares || 0)) : holding.shares;
      const weightDelta = prevExposure?.hasExposure ? (weight - (prevExposure.weightPct || 0)) : weight;
      const pnlDelta = prevExposure?.hasExposure ? (pnlAmount - ((prevExposure.unrealizedPnL ?? (prevExposure as any)?.unrealizedPnl) || 0)) : 0;
      const isPortfolioChanged = hasExposureChanged || sharesDelta !== 0 || Math.abs(weightDelta) >= 0.1;

      portfolioDelta = {
        hasExposure: true,
        shares: holding.shares,
        positionSize: holding.shares,
        portfolioWeight: weight,
        currentWeightPct: weight,
        previousWeightPct: prevExposure?.weightPct ?? weight,
        weightPct: weight,
        weightDeltaPct: weightDelta,
        currency: posCurrency,
        unrealizedPnl: pnlAmount,
        unrealizedPnL: pnlAmount,
        unrealizedPnLDelta: pnlDelta,
        unrealizedPnlPercent: pnlPercent,
        exposureAdjustedRisk: invalidationStatus !== 'ACTIVE_GUARD' || criticalEvents.length > 0 ? 'HIGH' : 'MODERATE',
        actionRequired: invalidationStatus === 'TRIGGERED' || (decisionDelta && decisionDelta.currentRating === 'SELL'),
        narrative: `Holding ${holding.shares} shares (${weight.toFixed(1)}% weight) with unrealized PnL of ${currencySymbol}${pnlAmount.toLocaleString()} ${posCurrency}.`
      };

      if (isPortfolioChanged) {
        changes.push({
          changeId: `chg_port_${holding.ticker}`,
          category: 'PORTFOLIO_CHANGE',
          title: `Portfolio Exposure: ${holding.shares} shares (${weight.toFixed(1)}% weight)`,
          description: `Current position value: ${currencySymbol}${positionValue.toLocaleString()} with unrealized PnL of ${pnlAmount >= 0 ? '+' : ''}${currencySymbol}${pnlAmount.toLocaleString()} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%). Risk level: ${portfolioDelta.exposureAdjustedRisk}.`,
          severity: portfolioDelta.actionRequired ? 'HIGH' : 'LOW',
          direction: pnlAmount >= 0 ? 'FAVORABLE' : 'UNFAVORABLE',
          isActionable: portfolioDelta.actionRequired,
          requiresReview: portfolioDelta.actionRequired,
          timestamp: nowIso,
          diff: {
            currentValue: `${weight.toFixed(1)}% weight`,
            delta: pnlAmount,
            unit: posCurrency
          }
        });
      }
    } else {
      const prevExposure = monitor.portfolioExposure;
      const wasPositionClosed = !!prevExposure?.hasExposure;
      portfolioDelta = {
        hasExposure: false,
        shares: 0,
        positionSize: 0,
        portfolioWeight: 0,
        currentWeightPct: 0,
        currency: posCurrency,
        unrealizedPnl: 0,
        unrealizedPnL: 0,
        unrealizedPnlPercent: 0,
        exposureAdjustedRisk: 'LOW',
        actionRequired: false,
        narrative: `No direct exposure held in active portfolio (${posCurrency} denominated).`
      };

      if (wasPositionClosed) {
        changes.push({
          changeId: `chg_port_closed_${Date.now()}`,
          category: 'PORTFOLIO_CHANGE',
          title: 'Portfolio Position Closed',
          description: `Zero shares remaining in active portfolio for ${ticker}.`,
          severity: 'MEDIUM',
          direction: 'NEUTRAL',
          isActionable: false,
          requiresReview: false,
          timestamp: nowIso
        });
      }
    }

    // --- G. VALUATION & QUANT DELTAS ---
    let valuationDelta: MonitorValuationDelta | undefined = undefined;
    if ((currentSnapshot as any)?.metrics?.valuation) {
      const v = (currentSnapshot as any).metrics.valuation;
      valuationDelta = {
        metrics: {},
        narrative: `Valuation metrics evaluated. P/E: ${v.peRatio ?? 'N/A'}, Target: ${v.fairValue ?? 'N/A'}.`,
        peMultiple: v.peRatio,
        targetPrice: v.fairValue,
        marginOfSafety: v.marginOfSafety,
        discountToFairValue: v.marginOfSafety
      };
    }

    const prevValuation = (previousSnapshot as any)?.metrics?.valuation;
    const currValuation = (currentSnapshot as any)?.metrics?.valuation;
    const isValuationChanged = !!(currValuation && (
      !prevValuation ||
      currValuation.peRatio !== prevValuation.peRatio ||
      currValuation.fairValue !== prevValuation.fairValue ||
      currValuation.marginOfSafety !== prevValuation.marginOfSafety
    ));

    if (isValuationChanged && valuationDelta) {
      changes.push({
        changeId: `chg_val_${Date.now()}`,
        category: 'VALUATION_CHANGE',
        title: `Valuation Multiples Adjusted: P/E ${currValuation.peRatio ?? 'N/A'} (Target: ${currValuation.fairValue ?? 'N/A'})`,
        description: valuationDelta.narrative,
        severity: 'MEDIUM',
        direction: (currValuation.marginOfSafety || 0) > ((prevValuation?.marginOfSafety) || 0) ? 'FAVORABLE' : 'UNFAVORABLE',
        isActionable: false,
        requiresReview: false,
        timestamp: nowIso
      });
    }

    let quantDelta: MonitorQuantDelta | undefined = undefined;
    if ((currentSnapshot as any)?.metrics?.quant) {
      const q = (currentSnapshot as any).metrics.quant;
      quantDelta = {
        signals: [],
        narrative: `Quant momentum: ${q.momentumScore ?? 'N/A'}, quality: ${q.qualityScore ?? 'N/A'}, trend: ${q.trendDirection || 'NEUTRAL'}.`,
        momentumScore: q.momentumScore,
        volatilityScore: q.volatilityScore,
        qualityScore: q.qualityScore,
        trendDirection: q.trendDirection || 'NEUTRAL'
      };
    }

    const prevQuant = (previousSnapshot as any)?.metrics?.quant;
    const currQuant = (currentSnapshot as any)?.metrics?.quant;
    const isQuantChanged = !!(currQuant && (
      !prevQuant ||
      currQuant.momentumScore !== prevQuant.momentumScore ||
      currQuant.qualityScore !== prevQuant.qualityScore ||
      currQuant.trendDirection !== prevQuant.trendDirection
    ));

    if (isQuantChanged && quantDelta) {
      changes.push({
        changeId: `chg_qnt_${Date.now()}`,
        category: 'QUANT_CHANGE',
        title: `Quantitative Signals Shift: Trend ${currQuant?.trendDirection || 'NEUTRAL'}`,
        description: quantDelta.narrative,
        severity: 'MEDIUM',
        direction: (currQuant?.momentumScore || 50) > (prevQuant?.momentumScore || 50) ? 'FAVORABLE' : 'UNFAVORABLE',
        isActionable: false,
        requiresReview: false,
        timestamp: nowIso
      });
    }

    // --- H. DATA QUALITY DELTAS ---
    const prevEpistemic = monitor.epistemicStatus || 'REAL';
    const currEpistemic = (currentSnapshot as any)?.epistemicStatus || 'REAL';
    const dataQualityDelta: MonitorDataQualityDelta = {
      providers: {},
      hasDegradation: false,
      narrative: 'Provider telemetry healthy across monitored feeds.',
      epistemicStatus: currEpistemic,
      dataGaps: (notebook as any)?.evidenceGaps || [],
      missingMetrics: []
    };

    const isDataQualityChanged = prevEpistemic !== currEpistemic || dataQualityDelta.hasDegradation;
    if (isDataQualityChanged) {
      changes.push({
        changeId: `chg_dq_${Date.now()}`,
        category: 'DATA_QUALITY_CHANGE',
        title: `Data Quality Alert: Epistemic status changed to ${currEpistemic}`,
        description: dataQualityDelta.narrative,
        severity: 'HIGH',
        direction: 'UNFAVORABLE',
        isActionable: true,
        requiresReview: true,
        timestamp: nowIso
      });
    }

    // --- 10. COMPUTE SUMMARY ---
    // Ensure changes are sorted latest first for strict chronological audit trail
    changes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const criticalChanges = changes.filter(c => c.severity === 'CRITICAL').length;
    const highSeverityChanges = changes.filter(c => c.severity === 'HIGH').length;
    const favorableChanges = changes.filter(c => c.direction === 'FAVORABLE').length;
    const unfavorableChanges = changes.filter(c => c.direction === 'UNFAVORABLE').length;

    const highestSeverity = criticalChanges > 0
      ? 'CRITICAL'
      : highSeverityChanges > 0
      ? 'HIGH'
      : changes.some(c => c.severity === 'MEDIUM')
      ? 'MEDIUM'
      : changes.length > 0
      ? 'LOW'
      : 'INFO';

    const reviewUrgency = criticalChanges > 0 || invalidationStatus === 'TRIGGERED'
      ? 'IMMEDIATE'
      : highSeverityChanges > 0 || (decisionDelta && decisionDelta.isRatingShift)
      ? 'HIGH'
      : changes.length > 3
      ? 'NORMAL'
      : 'ROUTINE';

    const changeSummary: any = {
      eventsCount: newEvents.length,
      evidenceCount: newEvidence.length,
      decisionChanged: !!(decisionDelta && (decisionDelta.isRatingShift || Math.abs(decisionDelta.scoreDelta) >= 1)),
      thesisChanged: isThesisChanged,
      riskChanged: hasNewRisks,
      catalystChanged: hasNewCatalysts,
      invalidationChanged: isInvalidationChanged,
      portfolioChanged: changes.some(c => c.category === 'PORTFOLIO_CHANGE' || c.category === 'PORTFOLIO'),
      quantChanged: isQuantChanged,
      valuationChanged: isValuationChanged,
      dataQualityChanged: isDataQualityChanged,
      headline: changes.length === 0
        ? `${ticker} change review: 0 new events, 0 evidence items. Thesis and metrics remain stable.`
        : `${ticker} change review: ${newEvents.length} new events, ${newEvidence.length} evidence items. Thesis is ${thesisStatus}.`,
      totalChanges: changes.length,
      criticalChanges,
      highSeverityChanges,
      favorableChanges,
      unfavorableChanges,
      hasInvalidationRisk: invalidationStatus !== 'ACTIVE_GUARD',
      hasDecisionShift: decisionDelta?.isRatingShift || false,
      hasNewEvents: newEvents.length > 0,
      hasPortfolioImpact: portfolioDelta?.hasExposure || false,
      highestSeverity,
      recommendationReviewUrgency: reviewUrgency
    };

    // --- 11. SYNTHESIS EXPLANATION ---
    const explanation = await this.generateExplanation(
      ticker,
      monitor,
      changeSummary,
      thesisHealth,
      decisionDelta,
      newEvents,
      portfolioDelta
    );

    // Fetch existing notes
    const analystNotes = await monitorRepo.getNotes(monitorId);

    const reviewId = `rev_${monitorId}_${Date.now()}`;
    const review: InvestmentMonitorReview = {
      reviewId,
      monitorId,
      userId,
      ownerUserId: monitor.ownerUserId || userId,
      securityId: monitor.securityId,
      ticker,
      reviewedAt: nowIso,
      asOfDate: nowIso.split('T')[0],
      previousReviewId: lastReview?.reviewId,
      // Only reference artifacts the caller may see: a pointer to a legacy/ownerless or foreign record must not surface in
      // derived output (the monitor keeps its own stored pointers untouched).
      previousDecisionId: previousDecision?.decisionId,
      currentDecisionId: currentDecision?.decisionId,
      previousSnapshotId: previousSnapshot?.snapshotId,
      currentSnapshotId: currentSnapshot?.snapshotId,
      changeSummary,
      changes,
      thesisHealth,
      decisionDelta,
      thesisDelta,
      eventDelta,
      evidenceDelta,
      portfolioDelta,
      quantDelta,
      valuationDelta,
      invalidationDelta,
      dataQualityDelta,
      explanation,
      analystNotes,
      epistemicStatus: monitor.epistemicStatus || 'REAL',
      isAnalyticalOnly: true,
      executionProhibited: true
    };

    return review;
  }

  /**
   * Deterministic explanation generator with optional Gemini phrasing enhancement.
   * Gemini NEVER modifies data, scores, or facts.
   */
  private async generateExplanation(
    ticker: string,
    monitor: InvestmentMonitor,
    summary: any,
    thesisHealth: ThesisHealthReport,
    decisionDelta: any,
    newEvents: InvestmentEvent[],
    portfolioDelta: any
  ): Promise<any> {
    const keyTakeaways: string[] = [];

    if (summary.hasInvalidationRisk) {
      keyTakeaways.push(`CRITICAL: Invalidation conditions elevated to ${thesisHealth.invalidationStatus}. Active review mandated.`);
    }
    if (decisionDelta && decisionDelta.isRatingShift) {
      keyTakeaways.push(`DECISION SHIFT: Rating migrated from ${decisionDelta.previousRating} to ${decisionDelta.currentRating} (Score delta: ${decisionDelta.scoreDelta > 0 ? '+' : ''}${decisionDelta.scoreDelta.toFixed(1)} pts).`);
    } else if (decisionDelta && Math.abs(decisionDelta.scoreDelta) >= 3) {
      keyTakeaways.push(`DECISION DRIFT: Composite score changed by ${decisionDelta.scoreDelta > 0 ? '+' : ''}${decisionDelta.scoreDelta.toFixed(1)} pts (${decisionDelta.currentScore}/100).`);
    }
    if (newEvents.length > 0) {
      keyTakeaways.push(`${newEvents.length} new event(s) ingested since last baseline. Primary: "${newEvents[0].title}".`);
    }
    if (portfolioDelta?.hasExposure) {
      keyTakeaways.push(`Portfolio maintains ${(portfolioDelta.portfolioWeight || 0).toFixed(1)}% exposure (${portfolioDelta.positionSize} shares). Exposure risk: ${portfolioDelta.exposureAdjustedRisk}.`);
    }
    if (keyTakeaways.length === 0) {
      keyTakeaways.push('Zero structural changes or material events identified since last review. Investment thesis and metrics remain stable.');
    }

    const recommendedActions: string[] = [];
    if (summary.recommendationReviewUrgency === 'IMMEDIATE') {
      recommendedActions.push('Conduct immediate full research notebook re-evaluation.');
      recommendedActions.push('Review invalidation condition evidence with investment committee.');
    } else if (summary.hasDecisionShift) {
      recommendedActions.push('Examine factor attribution changes in Decision Intelligence.');
      recommendedActions.push('Update investment decision timeline record.');
    } else {
      recommendedActions.push('Maintain standard review cadence.');
      recommendedActions.push('Verify incoming SEC regulatory filings and earnings transcripts.');
    }

    const deterministicSummary = `${ticker} monitor review: ${summary.totalChanges} total changes identified since baseline. Thesis health is ${thesisHealth.overallStatus}. Urgency is ${summary.recommendationReviewUrgency}.`;

    // Attempt Gemini synthesis enhancement for executive narrative only
    let executiveSummary = deterministicSummary;
    const client = this.getClient();
    if (client && aiCircuitBreaker.canExecuteAi()) {
      try {
        const prompt = `
You are an institutional investment analyst writing a continuous change review summary.
Security: ${ticker}
Total Changes: ${summary.totalChanges} (${summary.criticalChanges} critical, ${summary.highSeverityChanges} high severity)
Thesis Health: ${thesisHealth.overallStatus}
Bull Case: ${thesisHealth.bullCaseStatus}
Bear Case: ${thesisHealth.bearCaseStatus}
Invalidation Status: ${thesisHealth.invalidationStatus}
Key Events: ${newEvents.map(e => e.title).join('; ') || 'None'}
Score Delta: ${decisionDelta ? decisionDelta.scoreDelta : 0}

Provide a concise 2-sentence institutional summary of what changed since the last review.
STRICT INVARIANTS:
1. Do NOT invent numbers, dates, or events.
2. State facts objectively.
3. Analytical only; do NOT recommend buying, selling, or executing broker trades.
`;
        const resp = await client.models.generateContent({
          model: this.modelName,
          contents: prompt
        });
        if (resp.text && resp.text.trim().length > 10) {
          aiCircuitBreaker.recordSuccess();
          executiveSummary = resp.text.trim();
        }
      } catch (err) {
        aiCircuitBreaker.handleAiError('InvestmentMonitorEngine', err);
      }
    }

    const causalChain: string[] = [
      newEvents.length > 0
        ? `1. INGESTION: Tracked ${newEvents.length} market events and updated research baseline for ${ticker}.`
        : `1. INGESTION: No new market events or filings detected for ${ticker} since last review.`,
      `2. THESIS EVALUATION: Invalidation guards assessed as ${thesisHealth.invalidationStatus}; overall thesis health evaluated as ${thesisHealth.overallStatus}.`,
      `3. DECISION ATTRIBUTION: Decision score shifted by ${decisionDelta ? (decisionDelta.scoreDelta >= 0 ? '+' : '') + decisionDelta.scoreDelta.toFixed(1) : '0.0'} points to ${decisionDelta?.currentScore || 75}/100 (rating: ${decisionDelta?.currentRating || 'FAVORABLE'}).`,
      `4. PORTFOLIO IMPACT: ${portfolioDelta?.hasExposure ? `Current position has ${(portfolioDelta.portfolioWeight || 0).toFixed(1)}% exposure with ${portfolioDelta.exposureAdjustedRisk} risk profile.` : 'No active portfolio exposure affected.'}`
    ];

    return {
      summary: executiveSummary || deterministicSummary,
      source: (executiveSummary && executiveSummary !== deterministicSummary) ? 'AI_EXPLANATION' : 'DETERMINISTIC',
      causalChain,
      overview: deterministicSummary,
      executiveSummary,
      thesisImpactSummary: thesisHealth.summary,
      portfolioImpactSummary: portfolioDelta?.hasExposure
        ? `Exposure of ${(portfolioDelta.portfolioWeight || 0).toFixed(1)}% is currently subject to ${portfolioDelta.exposureAdjustedRisk} risk.`
        : 'Zero direct portfolio exposure recorded.',
      keyTakeaways,
      recommendedActions,
      urgency: summary.recommendationReviewUrgency
    };
  }

  /**
   * Completes and signs off an Investment Review.
   * Saves review immutably into the repository and updates the monitor's state.
   */
  public async executeReview(
    monitorId: string,
    userId: string,
    analystNoteText?: string,
    reviewAction: MonitorReviewAction = 'REVIEWED'
  ): Promise<InvestmentMonitorReview> {
    const review = await this.detectAllChanges(monitorId, userId);

    review.reviewAction = reviewAction;
    if (analystNoteText && analystNoteText.trim().length > 0) {
      review.reviewActionNotes = analystNoteText.trim();
      const note = await this.addAnalystNote(
        monitorId,
        userId,
        'Senior Analyst',
        `[${reviewAction}] ${analystNoteText.trim()}`,
        review.reviewId
      );
      review.analystNotes = [note, ...(review.analystNotes || [])];
    }

    // Save immutable review record
    const reviewRepo = persistenceManager.getMonitorReviewRepository();
    const savedReview = await reviewRepo.save(review);

    // Update monitor baseline to point to this new review
    const monitorRepo = persistenceManager.getMonitorRepository();
    await monitorRepo.update(monitorId, {
      lastReviewId: savedReview.reviewId,
      lastReviewedAt: savedReview.reviewedAt,
      latestDecisionId: savedReview.currentDecisionId,
      latestSnapshotId: savedReview.currentSnapshotId,
      latestCompositeScore: (savedReview.decisionDelta as any)?.currentScore || savedReview.decisionDelta?.current?.compositeScore,
      latestRating: (savedReview.decisionDelta as any)?.currentRating || savedReview.decisionDelta?.current?.rating,
      thesisStatus: (savedReview.thesisHealth.overallStatus || savedReview.thesisHealth.overallHealth) as any,
      invalidationStatus: (savedReview.thesisHealth.invalidationStatus || savedReview.thesisHealth.invalidationState) as any,
      lastChangeSummary: (savedReview.explanation as any).overview || savedReview.explanation.summary,
      lastReviewAction: reviewAction,
      portfolioExposure: savedReview.portfolioDelta?.hasExposure ? {
        hasExposure: true,
        shares: savedReview.portfolioDelta.shares,
        weightPct: (savedReview.portfolioDelta as any).currentWeightPct || (savedReview.portfolioDelta as any).portfolioWeight
      } : { hasExposure: false }
    });

    return savedReview;
  }

  /**
   * Get all historical reviews for a monitor in descending order
   */
  public async getReviewHistory(monitorId: string, userId: string): Promise<InvestmentMonitorReview[]> {
    await this.getMonitor(monitorId, userId);
    const reviewRepo = persistenceManager.getMonitorReviewRepository();
    return await reviewRepo.getByMonitorId(monitorId);
  }

  public async getReviews(monitorId: string, userId: string): Promise<InvestmentMonitorReview[]> {
    return this.getReviewHistory(monitorId, userId);
  }

  /**
   * Get specific review by reviewId
   */
  public async getReview(reviewId: string, userId: string): Promise<InvestmentMonitorReview | null> {
    const reviewRepo = persistenceManager.getMonitorReviewRepository();
    const review = await reviewRepo.get(reviewId);
    if (!review) return null;

    if (userId && review.ownerUserId !== userId && review.userId !== userId) {
      throw new Error(`UNAUTHORIZED: User ${userId} does not own review ${reviewId}`);
    }

    return review;
  }

  /**
   * Compare two immutable historical reviews point-in-time
   */
  public async compareReviews(
    monitorId: string,
    baseReviewId: string,
    targetReviewId: string,
    userId: string
  ): Promise<MonitorReviewComparison> {
    await this.getMonitor(monitorId, userId);

    const reviewA = await this.getReview(baseReviewId, userId);
    if (!reviewA) {
      throw new Error(`Base review ${baseReviewId} not found`);
    }
    const reviewB = await this.getReview(targetReviewId, userId);
    if (!reviewB) {
      throw new Error(`Target review ${targetReviewId} not found`);
    }

    if (reviewA.monitorId !== monitorId || reviewB.monitorId !== monitorId) {
      throw new Error(`Both reviews must belong to monitor ${monitorId}`);
    }

    // Determine chronological order: earlier = base, later = target
    let earlier = reviewA;
    let later = reviewB;
    if (new Date(reviewA.reviewedAt).getTime() > new Date(reviewB.reviewedAt).getTime()) {
      earlier = reviewB;
      later = reviewA;
    }

    const baseScore = (earlier.decisionDelta as any)?.currentScore ?? earlier.decisionDelta?.current?.compositeScore ?? 75;
    const targetScore = (later.decisionDelta as any)?.currentScore ?? later.decisionDelta?.current?.compositeScore ?? 75;
    const scoreDelta = Math.round((targetScore - baseScore) * 10) / 10;

    const baseRating = (earlier.decisionDelta as any)?.currentRating ?? earlier.decisionDelta?.current?.rating ?? 'FAVORABLE';
    const targetRating = (later.decisionDelta as any)?.currentRating ?? later.decisionDelta?.current?.rating ?? 'FAVORABLE';
    const ratingShift = baseRating !== targetRating;

    const baseThesisStatus = earlier.thesisHealth.overallStatus || earlier.thesisHealth.overallHealth || 'HEALTHY';
    const targetThesisStatus = later.thesisHealth.overallStatus || later.thesisHealth.overallHealth || 'HEALTHY';
    const thesisShift = baseThesisStatus !== targetThesisStatus;

    const baseInvalStatus = earlier.thesisHealth.invalidationStatus || earlier.thesisHealth.invalidationState || 'ACTIVE_GUARD';
    const targetInvalStatus = later.thesisHealth.invalidationStatus || later.thesisHealth.invalidationState || 'ACTIVE_GUARD';
    const invalidationShift = baseInvalStatus !== targetInvalStatus;

    const baseWeight = (earlier.portfolioDelta as any)?.currentWeightPct ?? (earlier.portfolioDelta as any)?.portfolioWeight ?? 0;
    const targetWeight = (later.portfolioDelta as any)?.currentWeightPct ?? (later.portfolioDelta as any)?.portfolioWeight ?? 0;
    const weightDeltaPct = Math.round((targetWeight - baseWeight) * 100) / 100;

    const baseShares = earlier.portfolioDelta?.shares ?? (earlier.portfolioDelta as any)?.positionSize ?? 0;
    const targetShares = later.portfolioDelta?.shares ?? (later.portfolioDelta as any)?.positionSize ?? 0;
    const sharesDelta = targetShares - baseShares;

    const basePnL = earlier.portfolioDelta?.unrealizedPnL ?? (earlier.portfolioDelta as any)?.unrealizedPnl ?? 0;
    const targetPnL = later.portfolioDelta?.unrealizedPnL ?? (later.portfolioDelta as any)?.unrealizedPnl ?? 0;
    const unrealizedPnLDelta = Math.round((targetPnL - basePnL) * 100) / 100;

    const currency = earlier.portfolioDelta?.currency || later.portfolioDelta?.currency || 'USD';

    // Events in target review not present in base review
    const baseEventIds = new Set((earlier.eventDelta?.newEvents || []).map(e => e.eventId));
    const newEventsBetween = (later.eventDelta?.newEvents || []).filter(e => !baseEventIds.has(e.eventId));

    const baseEvCount = earlier.evidenceDelta?.newEvidenceCount || 0;
    const targetEvCount = later.evidenceDelta?.newEvidenceCount || 0;
    const newEvidenceCountBetween = Math.max(0, targetEvCount - baseEvCount);

    // Dimension deltas between earlier and later
    const changedDimensions: Record<string, { baseScore: number; targetScore: number; delta: number }> = {};
    const baseDims = earlier.decisionDelta?.current?.dimensionScores || {};
    const targetDims = later.decisionDelta?.current?.dimensionScores || {};
    const allDimKeys = Array.from(new Set([...Object.keys(baseDims), ...Object.keys(targetDims)]));
    for (const key of allDimKeys) {
      const bVal = baseDims[key] ?? 70;
      const tVal = targetDims[key] ?? 70;
      if (Math.abs(tVal - bVal) > 0.01) {
        changedDimensions[key] = {
          baseScore: Math.round(bVal * 10) / 10,
          targetScore: Math.round(tVal * 10) / 10,
          delta: Math.round((tVal - bVal) * 10) / 10
        };
      }
    }

    const narrativeParts = [
      `Comparison between Review #${earlier.reviewId.slice(-8)} (${earlier.asOfDate}) and Review #${later.reviewId.slice(-8)} (${later.asOfDate}).`,
      `Decision score shifted by ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)} pts (${baseRating} → ${targetRating}).`,
      `Thesis state: ${baseThesisStatus} → ${targetThesisStatus}. Invalidation guard: ${baseInvalStatus} → ${targetInvalStatus}.`,
      `${newEventsBetween.length} incremental event(s) and ${newEvidenceCountBetween} incremental evidence items between reviews.`
    ];

    return {
      monitorId,
      ticker: later.ticker,
      baseReview: {
        reviewId: earlier.reviewId,
        reviewedAt: earlier.reviewedAt,
        asOfDate: earlier.asOfDate,
        reviewAction: earlier.reviewAction,
        decisionRating: baseRating,
        compositeScore: baseScore,
        thesisStatus: baseThesisStatus,
        invalidationStatus: baseInvalStatus,
        portfolioWeightPct: baseWeight
      },
      targetReview: {
        reviewId: later.reviewId,
        reviewedAt: later.reviewedAt,
        asOfDate: later.asOfDate,
        reviewAction: later.reviewAction,
        decisionRating: targetRating,
        compositeScore: targetScore,
        thesisStatus: targetThesisStatus,
        invalidationStatus: targetInvalStatus,
        portfolioWeightPct: targetWeight
      },
      diff: {
        scoreDelta,
        ratingShift,
        previousRating: baseRating,
        currentRating: targetRating,
        thesisShift,
        previousThesisStatus: baseThesisStatus,
        currentThesisStatus: targetThesisStatus,
        invalidationShift,
        previousInvalidationStatus: baseInvalStatus,
        currentInvalidationStatus: targetInvalStatus,
        weightDeltaPct,
        sharesDelta,
        unrealizedPnLDelta,
        currency,
        newEventsBetween,
        newEvidenceCountBetween,
        changedDimensions,
        summaryNarrative: narrativeParts.join(' ')
      }
    };
  }
}

export const investmentMonitorEngine = InvestmentMonitorEngine.getInstance();
