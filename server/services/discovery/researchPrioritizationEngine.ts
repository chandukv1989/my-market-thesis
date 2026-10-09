/**
 * Phase 28: Investment Discovery & Research Prioritization Engine
 * 
 * Answers: "Across the securities and investments available to me,
 * what deserves my research attention next, and why?"
 * 
 * Strict Product Boundary:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Deterministic research attention queue, NOT a trading recommendation engine.
 * - No broker execution, no autonomous trading, no portfolio rebalancing.
 * - Point-in-time correctness (asOfDate) with zero lookahead.
 * - Epistemic status preservation (SIMULATED != REAL).
 * - Strict multi-tenant isolation (User A never sees User B's portfolio, watchlists, monitors, or research).
 * - Multi-currency strict separation (USD vs INR).
 */

import {
  CanonicalSecurity,
  ResearchPriorityLevel,
  DiscoverySignalItem,
  ResearchPriorityItem,
  ResearchPrioritySnapshot,
  DiscoveryUniverseFilter,
  EpistemicStatus,
  InvestmentEvent,
  AlertInstance,
  MarketRegion,
  SecurityIdentifier
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { CANONICAL_SECURITIES } from '../../../src/data/canonicalSecurities';
import { GoogleGenAI } from '@google/genai';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';

export class ResearchPrioritizationEngine {
  private static instance: ResearchPrioritizationEngine;

  public static getInstance(): ResearchPrioritizationEngine {
    if (!ResearchPrioritizationEngine.instance) {
      ResearchPrioritizationEngine.instance = new ResearchPrioritizationEngine();
    }
    return ResearchPrioritizationEngine.instance;
  }

  /**
   * Resolve an identifier or ticker to canonical security or synthesize a deterministic reference.
   */
  public resolveSecurity(
    idOrTicker: string,
    fallback?: { symbol?: string; companyName?: string; market?: MarketRegion; currency?: string }
  ): SecurityIdentifier {
    const lower = idOrTicker.toLowerCase();
    const upper = idOrTicker.toUpperCase();
    const match = CANONICAL_SECURITIES.find(
      s => s.id.toLowerCase() === lower || s.symbol.toUpperCase() === upper || ((s as any).securityId && String((s as any).securityId).toLowerCase() === lower)
    );
    if (match) return match;
    return {
      id: idOrTicker,
      symbol: fallback?.symbol || idOrTicker.toUpperCase(),
      companyName: fallback?.companyName || idOrTicker,
      market: fallback?.market || 'US',
      exchange: fallback?.market === 'INDIA' ? 'NSE' : 'NASDAQ',
      country: fallback?.market === 'INDIA' ? 'IN' : 'US',
      currency: fallback?.currency || (fallback?.market === 'INDIA' ? 'INR' : 'USD')
    };
  }

  /**
   * Helper to normalize a security identifier into a consistent canonical reference.
   */
  private normalizeSecurity(sec: SecurityIdentifier | CanonicalSecurity): {
    securityId: string;
    symbol: string;
    name: string;
    market: MarketRegion;
    currency: string;
    exchange: string;
  } {
    const sId = (sec as any).securityId || sec.id;
    const sym = (sec as any).ticker || sec.symbol;
    const name = sec.companyName || sym;
    const market = sec.market || 'US';
    const currency = sec.currency || (market === 'INDIA' ? 'INR' : 'USD');
    const exchange = sec.exchange || (market === 'INDIA' ? 'NSE' : 'NASDAQ');

    return {
      securityId: sId,
      symbol: sym,
      name,
      market,
      currency,
      exchange
    };
  }

  /**
   * Build the deterministic discovery universe for a given user.
   * Respects user ownership strictly.
   */
  public async buildUniverse(
    userId: string,
    universeType: string = 'ALL',
    _asOfDate?: string
  ): Promise<SecurityIdentifier[]> {
    const portfolioRepo = persistenceManager.getPortfolioRepository();
    const watchlistRepo = persistenceManager.getWatchlistRepository();
    const monitorRepo = persistenceManager.getMonitorRepository();
    const notebookRepo = persistenceManager.getNotebookRepository();

    const securitiesMap = new Map<string, SecurityIdentifier>();

    // 1. Portfolio holdings for userId
    const positions = await portfolioRepo.getPositions();
    const userPositions = positions.filter(p => {
      const owner = p.ownerUserId || p.userId;
      return !owner || owner === userId;
    });

    // 2. Watchlist for userId
    const watchlistTickers = await watchlistRepo.getWatchlist(userId);

    // 3. Monitors for userId
    const userMonitors = await monitorRepo.getByUserId(userId);

    // 4. Research notebooks for userId
    const allNotebooks = await notebookRepo.getAll();
    const userNotebooks = allNotebooks.filter(nb => {
      const owner = nb.ownerUserId || nb.userId;
      return !owner || owner === userId;
    });

    if (universeType === 'PORTFOLIO') {
      for (const pos of userPositions) {
        const sec = this.resolveSecurity(pos.securityId || pos.ticker, { symbol: pos.ticker, market: pos.market, currency: pos.currency });
        securitiesMap.set(sec.id, sec);
      }
    } else if (universeType === 'WATCHLIST') {
      for (const ticker of watchlistTickers) {
        const sec = this.resolveSecurity(ticker, { symbol: ticker });
        securitiesMap.set(sec.id, sec);
      }
    } else if (universeType === 'MONITORED') {
      for (const m of userMonitors) {
        const sec = this.resolveSecurity(m.securityId || m.ticker, { symbol: m.ticker, companyName: m.companyName, market: m.market });
        securitiesMap.set(sec.id, sec);
      }
    } else if (universeType === 'RESEARCHED') {
      for (const nb of userNotebooks) {
        const sec = this.resolveSecurity(nb.securityId || nb.symbol, { symbol: nb.symbol, companyName: (nb as any).companyName || nb.title });
        securitiesMap.set(sec.id, sec);
      }
    } else {
      // 'ALL': Combine portfolio, watchlist, monitors, research, and canonical securities
      for (const pos of userPositions) {
        const sec = this.resolveSecurity(pos.securityId || pos.ticker, { symbol: pos.ticker, market: pos.market, currency: pos.currency });
        securitiesMap.set(sec.id, sec);
      }
      for (const ticker of watchlistTickers) {
        const sec = this.resolveSecurity(ticker, { symbol: ticker });
        securitiesMap.set(sec.id, sec);
      }
      for (const m of userMonitors) {
        const sec = this.resolveSecurity(m.securityId || m.ticker, { symbol: m.ticker, companyName: m.companyName, market: m.market });
        securitiesMap.set(sec.id, sec);
      }
      for (const nb of userNotebooks) {
        const sec = this.resolveSecurity(nb.securityId || nb.symbol, { symbol: nb.symbol, companyName: (nb as any).companyName || nb.title });
        securitiesMap.set(sec.id, sec);
      }

      // Include supported canonical universe
      for (const sec of CANONICAL_SECURITIES) {
        if (!securitiesMap.has(sec.id)) {
          securitiesMap.set(sec.id, sec);
        }
      }
    }

    const universeList = Array.from(securitiesMap.values());
    universeList.sort((a, b) => a.id.localeCompare(b.id));
    return universeList;
  }

  /**
   * Evaluate all canonical signals for a single security up to asOfDate.
   */
  public async evaluateSecuritySignals(
    userId: string,
    rawSecurity: SecurityIdentifier | CanonicalSecurity,
    asOfDate?: string
  ): Promise<{
    signals: DiscoverySignalItem[];
    evidenceStatus: { totalCount: number; conflictCount: number; gapCount: number; isStale: boolean };
    portfolioExposure?: {
      hasPosition: boolean;
      shares?: number;
      weightPct?: number;
      currency?: string;
      unrealizedPnL?: number;
      unrealizedPnLPercent?: number;
    };
    monitorId?: string;
    thesisState?: string;
    activeAlerts: AlertInstance[];
    lastResearchUpdate?: string;
    freshnessStatus: 'FRESH' | 'AGING' | 'STALE' | 'UNRESEARCHED';
    epistemicStatus: EpistemicStatus;
    isSimulated: boolean;
  }> {
    const effectiveAsOf = asOfDate ? new Date(asOfDate).getTime() : Date.now();
    const security = this.normalizeSecurity(rawSecurity);
    const signals: DiscoverySignalItem[] = [];

    let overallEpistemicStatus: EpistemicStatus = 'REAL';
    let isSimulated = false;

    // Repositories
    const eventRepo = persistenceManager.getEventRepository();
    const monitorRepo = persistenceManager.getMonitorRepository();
    const monitorReviewRepo = persistenceManager.getMonitorReviewRepository();
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const portfolioRepo = persistenceManager.getPortfolioRepository();
    const decisionRepo = persistenceManager.getDecisionRepository();

    // 1. Check Investment Events up to asOfDate (Safe provider access)
    let allEvents: InvestmentEvent[] = [];
    try {
      allEvents = await eventRepo.getBySecurityId(security.securityId, asOfDate);
    } catch (err) {
      console.warn(`[ResearchPrioritizationEngine] Event repository unavailable for ${security.securityId}:`, err);
    }

    const pitEvents = allEvents.filter(e => {
      const pubTime = new Date(e.availableAt || e.announcedAt || e.eventDate).getTime();
      return pubTime <= effectiveAsOf;
    });

    pitEvents.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

    // Most recent material event (within 30 days of effectiveAsOf)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const recentMaterialEvents = pitEvents.filter(e => {
      const eTime = new Date(e.eventDate).getTime();
      const isRecent = effectiveAsOf - eTime <= thirtyDaysMs;
      const isMaterial =
        (e.significance?.overallScore ?? 0) >= 0.6 ||
        e.significance?.affectsThesis === 'YES' ||
        e.significance?.affectsDecision === 'YES' ||
        e.eventType === 'THESIS_INVALIDATION' ||
        e.eventType === 'EARNINGS_EVENT';
      return isRecent && isMaterial;
    });

    let topEventId: string | undefined;
    if (recentMaterialEvents.length > 0) {
      const topEvent = recentMaterialEvents[0];
      topEventId = topEvent.eventId;
      const severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' =
        topEvent.significance?.affectsThesis === 'YES' || topEvent.eventType === 'THESIS_INVALIDATION'
          ? 'HIGH'
          : 'MEDIUM';

      if (topEvent.epistemicStatus === 'SIMULATED' || topEvent.isSimulated) {
        overallEpistemicStatus = 'SIMULATED';
        isSimulated = true;
      }

      signals.push({
        signalId: `sig_evt_${topEvent.eventId}`,
        signalType: 'MATERIAL_EVENT',
        title: `Material Event: ${topEvent.title}`,
        summary: topEvent.summary,
        severity,
        detectedAt: topEvent.eventDate,
        observedDelta: `Event announced on ${topEvent.announcedAt?.slice(0, 10)}. Thesis impact: ${topEvent.significance?.affectsThesis}.`,
        causalNote: 'Observed temporal association; causal linkage requires analyst thesis validation.',
        epistemicStatus: topEvent.epistemicStatus || 'REAL',
        isSimulated: Boolean(topEvent.isSimulated),
        sourceType: topEvent.sourceType || 'CANONICAL_EVENT',
        sourceReference: topEvent.sourceReference || topEvent.eventId,
        engine: 'InvestmentEventEngine'
      });
    }

    // 2. Check User's Investment Monitor & Thesis
    let userMonitors: any[] = [];
    try {
      userMonitors = await monitorRepo.getByUserId(userId);
    } catch (err) {
      console.warn(`[ResearchPrioritizationEngine] Monitor repository unavailable for ${userId}:`, err);
    }

    const monitor = userMonitors.find(m => m.securityId === security.securityId || m.ticker === security.symbol);
    let monitorId: string | undefined;
    let thesisState: string | undefined;
    let lastResearchUpdate: string | undefined;

    if (monitor) {
      monitorId = monitor.monitorId;
      lastResearchUpdate = monitor.lastReviewedAt || monitor.createdAt;
      thesisState = monitor.thesisStatus;

      // Get latest monitor review up to asOfDate
      let reviews: any[] = [];
      try {
        reviews = await monitorReviewRepo.getByMonitorId(monitor.monitorId);
      } catch (err) {
        console.warn(`[ResearchPrioritizationEngine] Monitor review repo unavailable for ${monitor.monitorId}:`, err);
      }
      const pitReviews = reviews.filter(r => new Date(r.reviewedAt).getTime() <= effectiveAsOf);
      pitReviews.sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
      const latestReview = pitReviews[0];

      if (latestReview) {
        const reviewThesisStatus = latestReview.thesisDelta?.currentStatus || monitor.thesisStatus;
        if (reviewThesisStatus) {
          thesisState = reviewThesisStatus;
        }
        if (latestReview.reviewedAt) {
          lastResearchUpdate = latestReview.reviewedAt;
        }

        if (thesisState === 'INVALIDATED' || latestReview.thesisDelta?.invalidationTriggered) {
          signals.push({
            signalId: `sig_th_${monitor.monitorId}_inval`,
            signalType: 'THESIS_CHANGE',
            title: 'Thesis Invalidated',
            summary: `Monitor thesis has moved to INVALIDATED status: ${latestReview.thesisDelta?.summary || 'Core thesis pillars breached.'}`,
            severity: 'CRITICAL',
            detectedAt: latestReview.reviewedAt,
            observedDelta: 'Thesis status changed to INVALIDATED.',
            causalNote: 'Direct invalidation condition observed in monitored evidence.',
            epistemicStatus: 'CALCULATED',
            isSimulated: false,
            sourceType: 'MONITOR_REVIEW',
            sourceReference: latestReview.reviewId,
            engine: 'InvestmentMonitorEngine'
          });
        } else if (thesisState === 'WEAKENED' || thesisState === 'UNDER_REVIEW') {
          signals.push({
            signalId: `sig_th_${monitor.monitorId}_weak`,
            signalType: 'THESIS_CHANGE',
            title: `Thesis ${thesisState}`,
            summary: `Monitor thesis is currently ${thesisState}: ${latestReview.thesisDelta?.summary || 'Analytical review recommended.'}`,
            severity: 'HIGH',
            detectedAt: latestReview.reviewedAt,
            observedDelta: `Thesis status is ${thesisState}.`,
            causalNote: 'Evidence indicates stress on core investment thesis pillars.',
            epistemicStatus: 'CALCULATED',
            isSimulated: false,
            sourceType: 'MONITOR_REVIEW',
            sourceReference: latestReview.reviewId,
            engine: 'InvestmentMonitorEngine'
          });
        } else if (thesisState === 'STRENGTHENED') {
          signals.push({
            signalId: `sig_th_${monitor.monitorId}_str`,
            signalType: 'THESIS_CHANGE',
            title: 'Thesis Strengthened',
            summary: 'Monitor thesis confirmed and strengthened by recent evidence.',
            severity: 'MEDIUM',
            detectedAt: latestReview.reviewedAt,
            observedDelta: 'Positive evidence confirmation across thesis pillars.',
            causalNote: 'Observed evidence alignment with baseline investment thesis.',
            epistemicStatus: 'CALCULATED',
            isSimulated: false,
            sourceType: 'MONITOR_REVIEW',
            sourceReference: latestReview.reviewId,
            engine: 'InvestmentMonitorEngine'
          });
        }

        // Check evidence conflicts in review
        if (latestReview.evidenceDelta?.conflictDetected) {
          signals.push({
            signalId: `sig_ev_conf_${latestReview.reviewId}`,
            signalType: 'EVIDENCE_CONFLICT',
            title: 'Evidence Conflict Detected',
            summary: latestReview.evidenceDelta.conflictSummary || 'Discrepancy or contradictory data identified across recent filings or sources.',
            severity: 'HIGH',
            detectedAt: latestReview.reviewedAt,
            observedDelta: 'Contradictory evidence detected in evidence review delta.',
            causalNote: 'Opposing empirical claims require analyst resolution.',
            epistemicStatus: 'CALCULATED',
            isSimulated: false,
            sourceType: 'MONITOR_REVIEW',
            sourceReference: latestReview.reviewId,
            engine: 'InvestmentMonitorEngine'
          });
        }
      }
    }

    // 3. Check Decision Intelligence up to asOfDate
    let pitDecisions: any[] = [];
    try {
      const decisions = await decisionRepo.getHistory(security.securityId);
      pitDecisions = decisions.filter(d => new Date(d.generatedAt || d.asOfDate).getTime() <= effectiveAsOf);
      pitDecisions.sort((a, b) => new Date(b.generatedAt || b.asOfDate).getTime() - new Date(a.generatedAt || a.asOfDate).getTime());
    } catch (err) {
      console.warn(`[ResearchPrioritizationEngine] Decision repo unavailable for ${security.securityId}:`, err);
    }

    if (pitDecisions.length > 0) {
      const latestDecision = pitDecisions[0];
      if (pitDecisions.length > 1) {
        const prevDecision = pitDecisions[1];
        if (latestDecision.overallAssessment !== prevDecision.overallAssessment) {
          signals.push({
            signalId: `sig_dec_${latestDecision.decisionId}`,
            signalType: 'DECISION_DRIFT',
            title: `Decision Assessment Shift: ${prevDecision.overallAssessment} -> ${latestDecision.overallAssessment}`,
            summary: `Decision intelligence framework shifted assessment from ${prevDecision.overallAssessment} to ${latestDecision.overallAssessment}.`,
            severity: latestDecision.overallAssessment === 'NEGATIVE' || latestDecision.overallAssessment === 'CAUTIOUS' ? 'HIGH' : 'MEDIUM',
            detectedAt: latestDecision.generatedAt || latestDecision.asOfDate,
            observedDelta: `Assessment transitioned from ${prevDecision.overallAssessment} to ${latestDecision.overallAssessment}.`,
            causalNote: 'Composite dimension shift evaluated deterministically by Decision Engine.',
            epistemicStatus: 'CALCULATED',
            isSimulated: false,
            sourceType: 'DECISION_ASSESSMENT',
            sourceReference: latestDecision.decisionId,
            engine: 'DecisionEngine'
          });
        }
      }
    }

    // 4. Check Active Phase 27 Orchestrated Alerts up to asOfDate
    let pitAlerts: AlertInstance[] = [];
    try {
      const userAlerts = await alertRepo.getByUserId(userId, {
        securityId: security.securityId,
        status: 'DELIVERED'
      });
      pitAlerts = userAlerts.filter(a => new Date(a.createdAt).getTime() <= effectiveAsOf);
    } catch (err) {
      console.warn(`[ResearchPrioritizationEngine] Alert repo unavailable for ${userId}:`, err);
    }

    if (pitAlerts.length > 0) {
      const topAlert = pitAlerts.sort((a, b) => {
        const score = (s: string) => (s === 'CRITICAL' ? 3 : s === 'HIGH' ? 2 : 1);
        return score(b.severity) - score(a.severity);
      })[0];

      // Check if alert correlates directly with the material event above to preserve causal provenance
      const isCorrelatedWithEvent = topEventId && (
        (topAlert as any).sourceEventId === topEventId ||
        (topAlert.trigger as any)?.sourceReference === topEventId ||
        (topAlert.provenance as any)?.sourceReference === topEventId
      );

      signals.push({
        signalId: `sig_alt_${topAlert.alertId}`,
        signalType: 'ALERT_ACTIVE',
        title: `Active Alert: ${topAlert.title}`,
        summary: topAlert.description,
        severity: topAlert.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM',
        detectedAt: topAlert.createdAt,
        observedDelta: `Rule: ${topAlert.trigger.ruleType}, observed value: ${topAlert.trigger.observedValue}`,
        causalNote: isCorrelatedWithEvent
          ? `${topAlert.deterministicExplanation} (Correlated with event: ${topEventId})`
          : topAlert.deterministicExplanation,
        epistemicStatus: (topAlert.provenance?.epistemicStatus as EpistemicStatus) || 'CALCULATED',
        isSimulated: Boolean(topAlert.provenance?.isSimulated),
        sourceType: 'ALERT_INSTANCE',
        sourceReference: topAlert.alertId,
        engine: 'AlertOrchestrationEngine'
      });
    }

    // 5. Check Portfolio Exposure (Isolated by user and currency)
    let positions: any[] = [];
    try {
      positions = await portfolioRepo.getPositions();
    } catch (err) {
      console.warn(`[ResearchPrioritizationEngine] Portfolio repo unavailable:`, err);
    }

    const userPositions = positions.filter(p => {
      const owner = p.ownerUserId || p.userId;
      return !owner || owner === userId;
    });

    // Compute user portfolio total value to determine position weight accurately
    let totalPortfolioValue = 0;
    userPositions.forEach(p => {
      const val = p.marketValue ?? (p.shares * p.avgCost);
      totalPortfolioValue += val;
    });

    const position = userPositions.find(p => p.securityId === security.securityId || p.ticker === security.symbol);
    let portfolioExposure: {
      hasPosition: boolean;
      shares?: number;
      weightPct?: number;
      currency?: string;
      unrealizedPnL?: number;
      unrealizedPnLPercent?: number;
    } | undefined;

    if (position && position.shares > 0) {
      const posVal = position.marketValue ?? (position.shares * position.avgCost);
      const weight = totalPortfolioValue > 0 ? (posVal / totalPortfolioValue) * 100 : 0;
      const pnlPct = position.unrealizedPnLPercent ?? 0;
      const currency = position.currency || security.currency || 'USD';

      portfolioExposure = {
        hasPosition: true,
        shares: position.shares,
        weightPct: weight,
        currency,
        unrealizedPnL: position.unrealizedPnL,
        unrealizedPnLPercent: pnlPct
      };

      // Material exposure signal
      if (weight >= 10 || pnlPct <= -12) {
        signals.push({
          signalId: `sig_port_${position.positionId || position.ticker}`,
          signalType: 'PORTFOLIO_EXPOSURE',
          title: `Material Portfolio Exposure: ${position.ticker}`,
          summary: `Position weight is ${weight.toFixed(1)}% of portfolio with unrealized P&L of ${pnlPct.toFixed(1)}% (${currency}).`,
          severity: weight >= 15 || pnlPct <= -15 ? 'HIGH' : 'MEDIUM',
          detectedAt: position.lastUpdated || new Date(effectiveAsOf).toISOString(),
          observedDelta: `Holding weight: ${weight.toFixed(1)}%, Unrealized P&L: ${pnlPct.toFixed(1)}% (${currency}).`,
          causalNote: 'Portfolio concentration and risk contribution evaluated deterministically.',
          epistemicStatus: 'CALCULATED',
          isSimulated: false,
          sourceType: 'PORTFOLIO_POSITION',
          sourceReference: position.positionId || position.ticker,
          engine: 'PortfolioIntelligence'
        });
      }
    }

    // 6. Research Freshness Check
    let freshnessStatus: 'FRESH' | 'AGING' | 'STALE' | 'UNRESEARCHED' = 'UNRESEARCHED';
    if (lastResearchUpdate) {
      const daysSinceResearch = (effectiveAsOf - new Date(lastResearchUpdate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceResearch <= 30) {
        freshnessStatus = 'FRESH';
      } else if (daysSinceResearch <= 60) {
        freshnessStatus = 'AGING';
      } else {
        freshnessStatus = 'STALE';
        if (position || monitor) {
          const posVal = position ? (position.marketValue ?? (position.shares * position.avgCost)) : 0;
          const posWeight = totalPortfolioValue > 0 ? (posVal / totalPortfolioValue) * 100 : 0;

          signals.push({
            signalId: `sig_stale_${security.securityId}`,
            signalType: 'RESEARCH_STALENESS',
            title: `Research Stale (> ${Math.floor(daysSinceResearch)} days)`,
            summary: `Last research or review was conducted ${Math.floor(daysSinceResearch)} days ago. Cadence requires fresh analytical review.`,
            severity: position && posWeight >= 5 ? 'HIGH' : 'MEDIUM',
            detectedAt: new Date(effectiveAsOf).toISOString(),
            observedDelta: `${Math.floor(daysSinceResearch)} days elapsed since last review.`,
            causalNote: 'Time-elapsed degradation of research freshness.',
            epistemicStatus: 'CALCULATED',
            isSimulated: false,
            sourceType: 'RESEARCH_CADENCE',
            sourceReference: lastResearchUpdate,
            engine: 'ResearchPrioritizationEngine'
          });
        }
      }
    } else if (position || monitor) {
      freshnessStatus = 'UNRESEARCHED';
      signals.push({
        signalId: `sig_unres_${security.securityId}`,
        signalType: 'RESEARCH_STALENESS',
        title: 'Unresearched Active Asset',
        summary: 'Security is present in active portfolio or monitor but lacks an initial research baseline.',
        severity: 'MEDIUM',
        detectedAt: new Date(effectiveAsOf).toISOString(),
        observedDelta: 'No historical research snapshots or monitor reviews recorded.',
        causalNote: 'Missing analytical coverage baseline.',
        epistemicStatus: 'CALCULATED',
        isSimulated: false,
        sourceType: 'RESEARCH_CADENCE',
        sourceReference: security.securityId,
        engine: 'ResearchPrioritizationEngine'
      });
    }

    // Calculate Evidence Status
    const conflictSignals = signals.filter(s => s.signalType === 'EVIDENCE_CONFLICT');
    const gapSignals = signals.filter(s => s.signalType === 'EVIDENCE_GAP');
    const evidenceStatus = {
      totalCount: pitEvents.length + pitDecisions.length,
      conflictCount: conflictSignals.length,
      gapCount: gapSignals.length,
      isStale: freshnessStatus === 'STALE'
    };

    return {
      signals,
      evidenceStatus,
      portfolioExposure,
      monitorId,
      thesisState,
      activeAlerts: pitAlerts,
      lastResearchUpdate,
      freshnessStatus,
      epistemicStatus: overallEpistemicStatus,
      isSimulated
    };
  }

  /**
   * Deterministically compute research priority classification from active signals and context.
   */
  public computeDeterministicPriority(
    signals: DiscoverySignalItem[],
    portfolioExposure?: { weightPct?: number; unrealizedPnLPercent?: number },
    thesisState?: string,
    activeAlerts: AlertInstance[] = []
  ): {
    priority: ResearchPriorityLevel;
    primaryReason: string;
    reasons: string[];
    convergenceScore: number;
  } {
    const reasons: string[] = [];
    const criticalSignals = signals.filter(s => s.severity === 'CRITICAL');
    const highSignals = signals.filter(s => s.severity === 'HIGH');
    const mediumSignals = signals.filter(s => s.severity === 'MEDIUM');

    // Distinct signal categories firing without inflating correlated signals from the same underlying fact
    const distinctCategories = new Set<string>();
    signals.forEach(s => {
      if (s.signalType === 'ALERT_ACTIVE' && s.causalNote?.includes('Correlated with event:')) {
        // Group with the correlated event dimension to avoid double-counting
        distinctCategories.add('MATERIAL_EVENT');
      } else {
        distinctCategories.add(s.signalType);
      }
    });
    const convergenceScore = distinctCategories.size;

    signals.forEach(s => {
      reasons.push(s.title);
    });

    // Check for Critical Conditions
    const hasCriticalAlert = activeAlerts.some(a => a.severity === 'CRITICAL');
    const isThesisInvalidated = thesisState === 'INVALIDATED';
    const isHighConcentrationRisk =
      (portfolioExposure?.weightPct || 0) >= 10 && (highSignals.length > 0 || isThesisInvalidated);

    if (hasCriticalAlert || isThesisInvalidated || criticalSignals.length > 0 || isHighConcentrationRisk || (distinctCategories.size >= 4 && highSignals.length >= 2)) {
      const primary = isThesisInvalidated
        ? 'Thesis Invalidated — Immediate analytical reassessment required'
        : hasCriticalAlert
        ? `Active Critical Alert — ${activeAlerts.find(a => a.severity === 'CRITICAL')?.title || 'Immediate investigation needed'}`
        : isHighConcentrationRisk
        ? `High Portfolio Concentration (${portfolioExposure?.weightPct?.toFixed(1)}%) with Active Material Signal`
        : `Multi-Signal Convergence (${distinctCategories.size} distinct analytical signals firing)`;

      return {
        priority: 'CRITICAL',
        primaryReason: primary,
        reasons,
        convergenceScore
      };
    }

    // Check for High Priority Conditions
    const hasHighAlert = activeAlerts.some(a => a.severity === 'HIGH');
    const isThesisUnderReview = thesisState === 'UNDER_REVIEW' || thesisState === 'WEAKENED';
    const hasMaterialPortfolioExposure = (portfolioExposure?.weightPct || 0) >= 5 && signals.length > 0;

    if (hasHighAlert || isThesisUnderReview || highSignals.length > 0 || distinctCategories.size >= 3 || hasMaterialPortfolioExposure) {
      const primary = isThesisUnderReview
        ? `Thesis ${thesisState} — Pillar review recommended`
        : hasHighAlert
        ? `Active Alert: ${activeAlerts.find(a => a.severity === 'HIGH')?.title || 'High severity alert'}`
        : distinctCategories.size >= 3
        ? `Convergence of ${distinctCategories.size} Analytical Signals`
        : highSignals.length > 0
        ? highSignals[0].title
        : 'Material Portfolio Exposure with Analytical Changes';

      return {
        priority: 'HIGH',
        primaryReason: primary,
        reasons,
        convergenceScore
      };
    }

    // Check for Medium Priority
    if (mediumSignals.length > 0 || signals.length > 0) {
      return {
        priority: 'MEDIUM',
        primaryReason: signals[0].title,
        reasons,
        convergenceScore
      };
    }

    // Routine / No Action Needed
    return {
      priority: 'ROUTINE',
      primaryReason: 'No material research changes detected; steady-state monitoring.',
      reasons: ['Baseline unchanged', 'No active alerts', 'Research cadence current'],
      convergenceScore: 0
    };
  }

  /**
   * Evaluate a full Research Prioritization Snapshot across the specified universe.
   */
  public async generatePrioritization(
    userId: string,
    filter: DiscoveryUniverseFilter = {}
  ): Promise<ResearchPrioritySnapshot> {
    const asOfDate = filter.asOfDate || new Date().toISOString();
    const universeType = filter.universeType || 'ALL';

    // 1. Build Universe
    const rawSecurities = await this.buildUniverse(userId, universeType, asOfDate);

    // If specific securityIds requested, ensure they are present in rawSecurities
    if (filter.securityIds && filter.securityIds.length > 0) {
      for (const reqId of filter.securityIds) {
        if (!rawSecurities.some(s => s.id === reqId || (s as any).securityId === reqId)) {
          rawSecurities.push(this.resolveSecurity(reqId));
        }
      }
    }

    // 2. Evaluate each security
    const items: ResearchPriorityItem[] = [];

    for (const rawSec of rawSecurities) {
      const sec = this.normalizeSecurity(rawSec);

      if (filter.market && sec.market !== filter.market) continue;
      if (filter.securityIds && !filter.securityIds.includes(sec.securityId)) continue;

      const evalResult = await this.evaluateSecuritySignals(userId, rawSec, asOfDate);

      // Filter by signalTypes if requested
      if (filter.signalTypes && filter.signalTypes.length > 0) {
        const hasMatchingSignal = evalResult.signals.some(s => filter.signalTypes!.includes(s.signalType));
        if (!hasMatchingSignal) continue;
      }

      // Compute deterministic priority
      const { priority, primaryReason, reasons, convergenceScore } = this.computeDeterministicPriority(
        evalResult.signals,
        evalResult.portfolioExposure,
        evalResult.thesisState,
        evalResult.activeAlerts
      );

      // Filter by minPriority / priority if requested
      if (filter.priority && priority !== filter.priority) continue;
      if (filter.minPriority) {
        const priorityOrder: Record<ResearchPriorityLevel, number> = {
          CRITICAL: 4,
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1,
          ROUTINE: 0
        };
        if (priorityOrder[priority] < priorityOrder[filter.minPriority]) continue;
      }

      // Filter by search
      if (filter.search && filter.search.trim()) {
        const q = filter.search.toLowerCase();
        const matches =
          sec.symbol.toLowerCase().includes(q) ||
          sec.name.toLowerCase().includes(q) ||
          primaryReason.toLowerCase().includes(q);
        if (!matches) continue;
      }

      // Construct Item
      const latestSignal = evalResult.signals[0];
      const deepLink = evalResult.monitorId
        ? `/monitor-review/${evalResult.monitorId}?securityId=${sec.securityId}&asOfDate=${encodeURIComponent(asOfDate)}`
        : `/monitor-review/new?securityId=${sec.securityId}&ticker=${sec.symbol}`;

      const effectiveAsOfTime = asOfDate ? new Date(asOfDate).getTime() : 0;
      const item: ResearchPriorityItem = {
        id: `pri_${userId}_${sec.securityId}_${effectiveAsOfTime}`,
        securityId: sec.securityId,
        symbol: sec.symbol,
        companyName: sec.name,
        market: sec.market,
        currency: sec.currency,
        userId,
        ownerUserId: userId,
        priority,
        primaryReason,
        reasons,
        signals: evalResult.signals,
        signalCount: evalResult.signals.length,
        signalConvergenceScore: convergenceScore,
        latestMaterialChange: latestSignal
          ? {
              type: latestSignal.signalType,
              summary: latestSignal.summary,
              timestamp: latestSignal.detectedAt
            }
          : undefined,
        evidenceStatus: evalResult.evidenceStatus,
        portfolioExposure: evalResult.portfolioExposure,
        monitorId: evalResult.monitorId,
        activeAlertCount: evalResult.activeAlerts.length,
        lastResearchUpdate: evalResult.lastResearchUpdate,
        freshnessStatus: evalResult.freshnessStatus,
        asOfDate,
        epistemicStatus: evalResult.epistemicStatus,
        isSimulated: evalResult.isSimulated,
        isAnalyticalOnly: true,
        executionProhibited: true,
        reviewDeepLink: deepLink,
        createdAt: asOfDate || new Date().toISOString(),
        updatedAt: asOfDate || new Date().toISOString()
      };

      items.push(item);
    }

    // 3. Deterministic Sorting with full tie-breaking cascade down to canonical securityId
    const priorityWeight: Record<ResearchPriorityLevel, number> = {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      ROUTINE: 1
    };

    const sortBy = filter.sortBy || 'PRIORITY';
    const isAsc = filter.sortOrder === 'ASC';

    items.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'PRIORITY') {
        comparison = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (comparison === 0) {
          comparison = b.signalConvergenceScore - a.signalConvergenceScore;
        }
        if (comparison === 0) {
          comparison = b.signalCount - a.signalCount;
        }
        if (comparison === 0) {
          const tA = a.latestMaterialChange ? new Date(a.latestMaterialChange.timestamp).getTime() : 0;
          const tB = b.latestMaterialChange ? new Date(b.latestMaterialChange.timestamp).getTime() : 0;
          comparison = tB - tA;
        }
        if (comparison === 0) {
          comparison = a.securityId.localeCompare(b.securityId);
        }
      } else if (sortBy === 'SIGNAL_COUNT') {
        comparison = b.signalCount - a.signalCount;
        if (comparison === 0) {
          comparison = priorityWeight[b.priority] - priorityWeight[a.priority];
        }
        if (comparison === 0) {
          comparison = b.signalConvergenceScore - a.signalConvergenceScore;
        }
        if (comparison === 0) {
          comparison = a.securityId.localeCompare(b.securityId);
        }
      } else if (sortBy === 'PORTFOLIO_WEIGHT') {
        const wA = a.portfolioExposure?.weightPct || 0;
        const wB = b.portfolioExposure?.weightPct || 0;
        comparison = wB - wA;
        if (comparison === 0) {
          comparison = priorityWeight[b.priority] - priorityWeight[a.priority];
        }
        if (comparison === 0) {
          comparison = a.securityId.localeCompare(b.securityId);
        }
      } else if (sortBy === 'RECENCY') {
        const tA = a.latestMaterialChange ? new Date(a.latestMaterialChange.timestamp).getTime() : 0;
        const tB = b.latestMaterialChange ? new Date(b.latestMaterialChange.timestamp).getTime() : 0;
        comparison = tB - tA;
        if (comparison === 0) {
          comparison = priorityWeight[b.priority] - priorityWeight[a.priority];
        }
        if (comparison === 0) {
          comparison = a.securityId.localeCompare(b.securityId);
        }
      }
      return isAsc ? -comparison : comparison;
    });

    const finalItems = filter.limit ? items.slice(0, filter.limit) : items;

    // Breakdown
    const priorityBreakdown: Record<ResearchPriorityLevel, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      ROUTINE: 0
    };
    finalItems.forEach(i => {
      priorityBreakdown[i.priority]++;
    });

    const snapshot: ResearchPrioritySnapshot = {
      snapshotId: `snap_pri_${userId}_${Date.now()}`,
      userId,
      asOfDate,
      universeType,
      items: finalItems,
      totalSecuritiesEvaluated: finalItems.length,
      priorityBreakdown,
      createdAt: new Date().toISOString(),
      isAnalyticalOnly: true,
      executionProhibited: true
    };

    // Save immutable snapshot
    const priorityRepo = persistenceManager.getResearchPriorityRepository();
    await priorityRepo.saveSnapshot(snapshot);

    return snapshot;
  }

  /**
   * Get priority item for a single security.
   */
  public async getSecurityPriority(
    userId: string,
    securityId: string,
    asOfDate?: string
  ): Promise<ResearchPriorityItem | null> {
    const snapshot = await this.generatePrioritization(userId, {
      securityIds: [securityId],
      asOfDate,
      universeType: 'ALL'
    });

    return snapshot.items.find(i => i.securityId === securityId) || null;
  }

  /**
   * Optional Gemini analytical synthesis.
   * If Gemini is unavailable, rate limited, or disabled, returns a deterministic synthesis.
   * Gemini NEVER computes the priority or signal detection!
   */
  public async generateAnalyticalBriefing(
    item: ResearchPriorityItem
  ): Promise<string> {
    const fallbackBriefing = `Research Priority: ${item.priority}. ${item.primaryReason}. Identified ${item.signalCount} active signals across canonical intelligence engines. Review recommended.`;

    if (!aiCircuitBreaker.canExecuteAi()) {
      return fallbackBriefing;
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return fallbackBriefing;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are an institutional investment research intelligence analyst.
Summarize why the security ${item.symbol} (${item.companyName}) has been prioritized as ${item.priority} for analyst review.
Signals observed:
${item.signals.map(s => `- [${s.signalType}] ${s.title}: ${s.summary}`).join('\n')}

Rules:
1. Provide a neutral, objective 2-sentence institutional synthesis.
2. DO NOT make buy, sell, or trade recommendations.
3. Keep isAnalyticalOnly: true.
4. Highlight the primary driver and multi-signal convergence.`;

      const response = await ai.models.generateContent({
        model: aiCircuitBreaker.getModelName(),
        contents: prompt
      });

      aiCircuitBreaker.recordSuccess();
      return response.text?.trim() || fallbackBriefing;
    } catch (err) {
      aiCircuitBreaker.handleAiError('ResearchPrioritizationEngine', err);
      return fallbackBriefing;
    }
  }
}

export const researchPrioritizationEngine = ResearchPrioritizationEngine.getInstance();
