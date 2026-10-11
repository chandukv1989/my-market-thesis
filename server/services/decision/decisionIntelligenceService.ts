/**
 * Phase 15 - Decision Intelligence Service
 * 
 * Central orchestrator combining:
 * - Market Data (Twelve Data / FYERS)
 * - SEC Financial Facts & Filings (SEC EDGAR)
 * - Evidence Repository & Hybrid RAG
 * - Research Notebook & Snapshot History
 * - Quant Strategy Engine
 * - Backtest Analytics
 * - Portfolio Intelligence
 * 
 * Strict Invariants:
 * 1. 100% Deterministic evaluation with auditable scoring rules.
 * 2. Strict Point-in-Time discipline (bars, filings, and evidence <= asOfDate).
 * 3. Never predicts future returns or guarantees performance.
 * 4. Zero broker execution capability (isAnalyticalOnly: true, executionProhibited: true).
 * 5. Provider credential isolation: secrets never leak to response payloads.
 */

import { createHash } from 'crypto';
import { normalizePrincipalId } from '../../auth/accessPolicy';
import { visibleToEngine } from '../../auth/engineScope';
import {
  InvestmentDecisionAssessment,
  SecurityDecisionComparison,
  DecisionEvaluateRequest,
  DecisionCompareRequest,
  MultiPeerComparisonRequest,
  MultiPeerComparisonResult,
  PeerComparisonSecurityData,
  MarketRegion,
  CanonicalSecurity,
  EvidenceQuery,
  DecisionDimensionKey
} from '../../../src/types';
import { resolveSecurity, CANONICAL_SECURITIES } from '../../../src/data/canonicalSecurities';
import { financialDataService } from '../financialDataService';
import { evidenceRepository } from '../evidence/evidenceRepository';
import { quantStrategyEngine } from '../quant/quantStrategyEngine';
import { backtestService } from '../backtest/backtestService';
import { portfolioIntelligenceService } from '../portfolio/portfolioIntelligenceService';
import { researchNotebookService } from '../research/notebookService';
import { decisionScoringEngine, DecisionScoringInputs } from './decisionScoringEngine';
import { decisionExplanationEngine } from './decisionExplanationEngine';
import { DEFAULT_DECISION_CONFIG } from './defaultConfig';
import { persistenceManager } from '../../persistence/persistenceManager';

/**
 * Momentum (~6 months), annualized volatility and max drawdown, computed from real daily closes.
 * Each value is omitted when there are too few bars to compute it honestly.
 */
export function computeMarketStats(bars: Array<{ close: number }>): { momentum?: number; volatility?: number; maxDrawdown?: number } {
  const closes = bars.map(b => b.close).filter(c => Number.isFinite(c) && c > 0);
  const out: { momentum?: number; volatility?: number; maxDrawdown?: number } = {};
  if (closes.length >= 127) {
    out.momentum = Math.round((closes[closes.length - 1] / closes[closes.length - 127] - 1) * 1000) / 10;
  }
  if (closes.length >= 22) {
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const mean = rets.reduce((a, r) => a + r, 0) / rets.length;
    const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
    out.volatility = Math.round(Math.sqrt(variance) * Math.sqrt(252) * 1000) / 10;
    let peak = closes[0];
    let maxDd = 0;
    for (const c of closes) {
      if (c > peak) peak = c;
      maxDd = Math.max(maxDd, (peak - c) / peak);
    }
    out.maxDrawdown = Math.round(maxDd * 1000) / 10;
  }
  return out;
}

export class DecisionIntelligenceService {
  private static instance: DecisionIntelligenceService;

  // In-memory deterministic cache: key -> assessment
  private decisionCache: Map<string, InvestmentDecisionAssessment> = new Map();

  public static getInstance(): DecisionIntelligenceService {
    if (!DecisionIntelligenceService.instance) {
      DecisionIntelligenceService.instance = new DecisionIntelligenceService();
    }
    return DecisionIntelligenceService.instance;
  }

  public clearCache(): void {
    this.decisionCache.clear();
  }

  /**
   * Evaluates a security deterministically as of a specific date.
   */
  public async evaluateDecision(request: DecisionEvaluateRequest): Promise<InvestmentDecisionAssessment> {
    const resolved = resolveSecurity(request.securityId);
    if (!resolved) {
      throw new Error(`Security with ID '${request.securityId}' could not be resolved.`);
    }

    const security: CanonicalSecurity = {
      id: resolved.id,
      canonicalId: resolved.id,
      ticker: resolved.symbol,
      symbol: resolved.symbol,
      companyName: resolved.companyName,
      market: resolved.market,
      exchange: resolved.exchange,
      currency: resolved.currency,
      country: resolved.country,
      sector: resolved.sector,
      industry: resolved.industry,
      assetType: resolved.assetType
    } as any;

    const asOfDate = request.asOfDate || new Date().toISOString().split('T')[0];
    const config = { ...DEFAULT_DECISION_CONFIG, ...(request.configuration || {}) };
    // Phase 38.2A: assessments requested on behalf of an authenticated owner are owner-scoped (cache namespace,
    // persisted lookup, identity and ownership stamp). Callers without an owner (system/internal) keep the
    // original deterministic identity and produce ownerless (restricted) records.
    const owner = normalizePrincipalId(request.ownerUserId);
    // Phase 38.2D: an ownerless evaluation with a caller-supplied configuration is NOT the canonical shared assessment:
    // it gets its own cache namespace and is never classified SHARED.
    const customConfig = !owner && !!request.configuration && Object.keys(request.configuration).length > 0;
    const cacheKey = `${owner || (customConfig ? `system-custom:${JSON.stringify(request.configuration)}` : 'system')}|${security.canonicalId || security.id}:${asOfDate}:${config.version}`;

    if (!request.forceRefresh && this.decisionCache.has(cacheKey)) {
      return this.decisionCache.get(cacheKey)!;
    }

    // Check persistent repository on cache miss if not forceRefresh
    if (!request.forceRefresh) {
      try {
        const persisted = owner
          ? (await persistenceManager.getDecisionRepository().getHistoryForOwner(security.id, owner))
              .find(d => d.asOfDate === asOfDate) || null
          : null;
        if (persisted && persisted.asOfDate === asOfDate) {
          this.decisionCache.set(cacheKey, persisted);
          return persisted;
        }
      } catch (err) {
        console.warn('[DecisionIntelligenceService] Persistence lookup error:', err);
      }
    }

    // Gather analytical inputs from existing subsystems
    const inputs = await this.gatherDecisionInputs(security, asOfDate, config, owner);

    // Run deterministic scoring engine
    let assessment = decisionScoringEngine.evaluate(inputs);
    if (!owner) {
      // Phase 38.2D: SHARED only when every input was filtered through the visibility policy with no principal
      // (evidence, backtests and notebook snapshots are restricted to explicitly SHARED records in gatherDecisionInputs)
      // AND no caller-supplied configuration was used. Otherwise the assessment stays restricted (ownerless + PRIVATE =>
      // LEGACY_UNOWNED): fail-closed, never inferred public.
      assessment = { ...assessment, visibility: customConfig ? 'PRIVATE' : 'SHARED' } as InvestmentDecisionAssessment;
    }
    if (owner) {
      const suffix = createHash('sha256').update(owner).digest('hex').slice(0, 8);
      assessment = {
        ...assessment,
        decisionId: `${assessment.decisionId}-u${suffix}`,
        ownerUserId: owner,
        userId: owner,
        visibility: 'PRIVATE'
      } as InvestmentDecisionAssessment;
    }

    // Enrich with explanation engine (uses Gemini if accessible, else clean fallback)
    try {
      const explanation = await decisionExplanationEngine.enrichExplanation(assessment);
      assessment = {
        ...assessment,
        explanation
      };
    } catch {
      // Deterministic explanation already exists on assessment
    }

    this.decisionCache.set(cacheKey, assessment);

    // Persist immutable decision assessment
    try {
      await persistenceManager.getDecisionRepository().save(assessment);
    } catch (err) {
      console.warn('[DecisionIntelligenceService] Failed to persist decision:', err);
    }

    return assessment;
  }

  /**
   * Retrieve a decision by exact decisionId from memory or persistent store.
   */
  public async getDecisionById(decisionId: string): Promise<InvestmentDecisionAssessment | null> {
    for (const d of this.decisionCache.values()) {
      if (d.decisionId === decisionId) return d;
    }
    return persistenceManager.getDecisionRepository().get(decisionId);
  }

  /**
   * Retrieve historical decisions for a security from persistence.
   */
  public async getHistoricalDecisions(securityId: string): Promise<InvestmentDecisionAssessment[]> {
    const resolved = resolveSecurity(securityId);
    const targetId = resolved ? resolved.id : securityId;
    return persistenceManager.getDecisionRepository().getHistory(targetId);
  }

  /** Tenant-scoped history (mandatory scope; owner's assessments only). */
  public async getHistoricalDecisionsForOwner(securityId: string, ownerUserId: string): Promise<InvestmentDecisionAssessment[]> {
    const resolved = resolveSecurity(securityId);
    const targetId = resolved ? resolved.id : securityId;
    return persistenceManager.getDecisionRepository().getHistoryForOwner(targetId, ownerUserId);
  }

  /**
   * Retrieve a cached decision or evaluate on demand.
   */
  public async getDecision(securityId: string, asOfDate?: string): Promise<InvestmentDecisionAssessment | null> {
    const date = asOfDate || new Date().toISOString().split('T')[0];
    const resolved = resolveSecurity(securityId);
    if (!resolved) return null;

    const cacheKey = `system|${resolved.id}:${date}:${DEFAULT_DECISION_CONFIG.version}`;
    if (this.decisionCache.has(cacheKey)) {
      return this.decisionCache.get(cacheKey)!;
    }

    return this.evaluateDecision({ securityId, asOfDate: date });
  }

  /**
   * Deterministic comparison between two securities as of a common date.
   */
  public async compareDecisions(request: DecisionCompareRequest): Promise<SecurityDecisionComparison> {
    const asOfDate = request.asOfDate || new Date().toISOString().split('T')[0];
    
    const [assessmentA, assessmentB] = await Promise.all([
      this.evaluateDecision({ securityId: request.securityIdA, asOfDate, configuration: request.configuration, ownerUserId: request.ownerUserId }),
      this.evaluateDecision({ securityId: request.securityIdB, asOfDate, configuration: request.configuration, ownerUserId: request.ownerUserId })
    ]);

    const dimensions: DecisionDimensionKey[] = [
      'fundamentalQuality',
      'growthTrend',
      'valuationContext',
      'marketTrend',
      'quantitativeSignal',
      'backtestContext',
      'riskProfile',
      'portfolioFit',
      'evidenceCoverage',
      'thesisStatus'
    ];

    const dimensionComparisons = dimensions.map(dimKey => {
      const dimA = assessmentA.dimensionAssessments[dimKey];
      const dimB = assessmentB.dimensionAssessments[dimKey];
      const diff = (dimA?.score ?? 0) - (dimB?.score ?? 0);

      let advantage: 'SECURITY_A' | 'SECURITY_B' | 'TIED' | 'INCOMPARABLE' = 'TIED';
      let reason = `${dimA.dimensionName} is comparable across both instruments.`;

      if (diff >= 0.20) {
        advantage = 'SECURITY_A';
        reason = `${assessmentA.canonicalSecurity.ticker} shows higher analytical rating (${dimA.assessment}) than ${assessmentB.canonicalSecurity.ticker} (${dimB.assessment}).`;
      } else if (diff <= -0.20) {
        advantage = 'SECURITY_B';
        reason = `${assessmentB.canonicalSecurity.ticker} shows higher analytical rating (${dimB.assessment}) than ${assessmentA.canonicalSecurity.ticker} (${dimA.assessment}).`;
      }

      return {
        dimension: dimKey,
        dimensionName: dimA.dimensionName,
        securityAAssessment: dimA.assessment,
        securityBAssessment: dimB.assessment,
        advantage,
        reason
      };
    });

    const scoreDiff = assessmentA.compositeScore - assessmentB.compositeScore;
    let overallAdvantage: 'SECURITY_A' | 'SECURITY_B' | 'BALANCED' | 'INSUFFICIENT_EVIDENCE' = 'BALANCED';
    if (assessmentA.overallAssessment === 'INSUFFICIENT_EVIDENCE' || assessmentB.overallAssessment === 'INSUFFICIENT_EVIDENCE') {
      overallAdvantage = 'INSUFFICIENT_EVIDENCE';
    } else if (scoreDiff >= 0.15) {
      overallAdvantage = 'SECURITY_A';
    } else if (scoreDiff <= -0.15) {
      overallAdvantage = 'SECURITY_B';
    }

    const tickerA = assessmentA.canonicalSecurity.ticker;
    const tickerB = assessmentB.canonicalSecurity.ticker;
    const summary = overallAdvantage === 'SECURITY_A'
      ? `${tickerA} exhibits a stronger analytical setup (Composite: ${assessmentA.compositeScore}) compared to ${tickerB} (Composite: ${assessmentB.compositeScore}) based on deterministic decision rules.`
      : overallAdvantage === 'SECURITY_B'
      ? `${tickerB} exhibits a stronger analytical setup (Composite: ${assessmentB.compositeScore}) compared to ${tickerA} (Composite: ${assessmentA.compositeScore}) based on deterministic decision rules.`
      : `${tickerA} and ${tickerB} demonstrate balanced comparative analytical characteristics (Composite: ${assessmentA.compositeScore} vs ${assessmentB.compositeScore}).`;

    return {
      comparisonId: `comp-${assessmentA.canonicalSecurity.canonicalId}-${assessmentB.canonicalSecurity.canonicalId}-${asOfDate}`,
      asOfDate,
      generatedAt: new Date().toISOString(),
      securityA: assessmentA,
      securityB: assessmentB,
      dimensionComparisons,
      overallAdvantage,
      summary,
      disclaimer: 'Past simulated performance does not guarantee future results. Comparative analytical scores are deterministic and do not constitute order recommendations.',
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Deterministic multi-peer comparison supporting 3 to 10 securities.
   */
  public async comparePeers(request: MultiPeerComparisonRequest): Promise<MultiPeerComparisonResult> {
    const { securityIds, asOfDate = new Date().toISOString().split('T')[0], configuration } = request;

    if (!Array.isArray(securityIds)) {
      throw new Error('securityIds must be an array of canonical security identifiers.');
    }

    if (securityIds.length < 3) {
      throw new Error(`Multi-peer comparison requires at least 3 securities (received ${securityIds.length}).`);
    }

    if (securityIds.length > 10) {
      throw new Error(`Multi-peer comparison supports a maximum of 10 securities (received ${securityIds.length}).`);
    }

    // Reject duplicate securities
    const normalizedIds = securityIds.map(s => s.toLowerCase().trim());
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      throw new Error('Duplicate securities detected in comparison list. Each security must be unique.');
    }

    // Resolve all canonical securities
    const resolvedSecurities: CanonicalSecurity[] = [];
    for (const id of securityIds) {
      const resolved = resolveSecurity(id);
      if (!resolved) {
        throw new Error(`Security not found or non-canonical: "${id}". Only canonical securities are supported.`);
      }
      resolvedSecurities.push(resolved);
    }

    // Evaluate each security as of the common asOfDate
    const assessments = await Promise.all(
      resolvedSecurities.map(sec =>
        this.evaluateDecision({ securityId: sec.id, asOfDate, configuration, ownerUserId: request.ownerUserId })
      )
    );

    // Build structured peer data preserving epistemic status and without fabricated winners
    const peers: PeerComparisonSecurityData[] = assessments.map((assessment, idx) => {
      const sec = resolvedSecurities[idx];
      const mkt = assessment.marketContext;
      const val = assessment.valuationContext;
      const fund = assessment.fundamentalContext;
      const quant = assessment.quantitativeContext;
      const port = assessment.portfolioContext;

      // Extract dimension summary
      const dimensionsSummary = {} as Record<DecisionDimensionKey, { score: number; assessment: string; category: string }>;
      for (const [key, valAssessment] of Object.entries(assessment.dimensionAssessments)) {
        dimensionsSummary[key as DecisionDimensionKey] = {
          score: valAssessment.score,
          assessment: valAssessment.assessment,
          category: valAssessment.category
        };
      }

      const fundamentalStatus: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE' =
        fund.status === 'INSUFFICIENT_EVIDENCE' ? 'UNAVAILABLE' : (assessment.dataQuality?.epistemicSummary?.REAL ? 'REAL' : 'CALCULATED');

      const valuationStatus: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE' =
        val.status === 'UNAVAILABLE' || val.status === 'INSUFFICIENT_EVIDENCE' ? 'UNAVAILABLE' : 'REAL';

      return {
        identity: {
          securityId: sec.id,
          canonicalId: sec.canonicalId,
          ticker: sec.ticker,
          companyName: sec.name,
          market: sec.market,
          exchange: sec.exchange,
          currency: sec.currency,
          sector: sec.sector || 'Technology',
          industry: sec.industry || 'General'
        },
        fundamentals: {
          revenue: null,
          revenueGrowth: fund.revenueGrowthPct ?? null,
          netIncome: null,
          operatingMargin: fund.operatingMarginPct ?? null,
          freeCashFlow: null,
          fcfYield: val.priceToFCF ? parseFloat((100 / val.priceToFCF).toFixed(2)) : null,
          roic: null,
          status: fundamentalStatus
        },
        valuation: {
          peRatio: val.peRatio ?? null,
          psRatio: val.priceToSales ?? null,
          evEbitda: val.evToEbitda ?? null,
          priceToFCF: val.priceToFCF ?? null,
          valuationStatus: val.status,
          status: valuationStatus
        },
        market: {
          price: mkt.currentPrice,
          dailyChange: null,
          dailyChangePercent: mkt.momentumPercent ?? null,
          trend: mkt.trend,
          momentumPercent: mkt.momentumPercent ?? null,
          aboveSma50: mkt.aboveSma50 ?? null,
          aboveSma200: mkt.aboveSma200 ?? null,
          status: mkt.epistemicStatus
        },
        quant: {
          compositeSignal: quant.compositeSignal,
          signalTimestamp: asOfDate,
          isAnalyticalOnly: true,
          status: 'CALCULATED'
        },
        risk: {
          beta: port.portfolioBetaContribution ?? null,
          annualizedVolatility: mkt.annualizedVolatility ?? null,
          maxDrawdownPercent: mkt.maxDrawdownPercent ?? null,
          status: 'CALCULATED'
        },
        decision: {
          decisionId: assessment.decisionId,
          compositeScore: assessment.compositeScore,
          overallAssessment: assessment.overallAssessment,
          conviction: assessment.conviction,
          thesisStatus: assessment.thesisStatus?.status || 'NO_PRIOR_THESIS',
          evidenceCoverageRating: assessment.evidenceCoverage?.rating || 'LIMITED',
          totalEvidenceCount: assessment.evidenceCoverage?.totalEvidenceCount || 0,
          dimensionsSummary
        },
        dimensionScores: Object.fromEntries(
          Object.entries(dimensionsSummary).map(([k, v]) => [k, v.score])
        ),
        epistemicStatus: assessment.dataQuality?.hasSimulatedData ? 'SIMULATED' : 'REAL'
      };
    });

    const marketsRepresented = Array.from(new Set(peers.map(p => p.identity.market)));

    // Median scores
    const validPe = peers.map(p => p.valuation.peRatio).filter((v): v is number => v !== null && v !== undefined);
    const sortedPe = [...validPe].sort((a, b) => a - b);
    const medianPe = sortedPe.length > 0 ? sortedPe[Math.floor(sortedPe.length / 2)] : undefined;

    const validComposite = peers.map(p => p.decision.compositeScore);
    const sortedComposite = [...validComposite].sort((a, b) => a - b);
    const medianComposite = sortedComposite.length > 0 ? sortedComposite[Math.floor(sortedComposite.length / 2)] : undefined;

    // Rankings sorted descending by compositeScore
    const sortedByScore = [...peers].sort((a, b) => b.decision.compositeScore - a.decision.compositeScore);
    const rankings = sortedByScore.map((p, idx) => ({
      securityId: p.identity.securityId,
      ticker: p.identity.ticker,
      compositeScore: p.decision.compositeScore,
      rank: idx + 1
    }));

    const summaryParts = sortedByScore.map(p => `${p.identity.ticker} (${p.decision.overallAssessment}, Score: ${p.decision.compositeScore})`);
    const summary = `Multi-peer deterministic benchmark across ${peers.length} securities as of ${asOfDate}: Analytical decision ranking: ${summaryParts.join('; ')}. Evaluated without arbitrary winners using 10 canonical dimensions.`;

    return {
      comparisonId: `multi-comp-${Date.now().toString(36)}-${peers.map(p => p.identity.ticker).join('-')}`,
      asOfDate,
      generatedAt: new Date().toISOString(),
      peers,
      securities: peers,
      totalPeers: peers.length,
      totalSecurities: peers.length,
      marketsRepresented,
      summary,
      analyticalSummary: summary,
      medianScores: {
        compositeScore: medianComposite,
        peRatio: medianPe
      },
      rankings,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  // ==========================================================================
  // INPUT GATHERING
  // ==========================================================================

  private async gatherDecisionInputs(
    security: CanonicalSecurity,
    asOfDate: string,
    config: any,
    ownerUserId?: string
  ): Promise<DecisionScoringInputs> {
    // 1. Evidence Query with strict PIT filter, restricted to what the requesting principal may use as an input
    //    (own records + explicitly SHARED). Ownerless/unclassified legacy and other tenants' evidence never qualify.
    const evidenceQuery: EvidenceQuery = {
      securityId: security.canonicalId,
      asOfDate
    };
    const evidenceItems = evidenceRepository.query(evidenceQuery).filter(e => visibleToEngine(e, ownerUserId)).slice(0, 100);

    // 2. Financials from financialDataService
    let financialsInput: DecisionScoringInputs['financials'] = undefined;
    try {
      const finData = await financialDataService.getSecurityFinancials(security.ticker);
      if (finData && finData.facts && finData.facts.length > 0) {
        // Filter facts PIT <= asOfDate (strictly enforce publication/filing date; reject undated facts)
        const pitFacts = finData.facts.filter(f => {
          const effectiveDate = f.filedDate || f.periodEnd;
          if (!effectiveDate) return false;
          return effectiveDate <= asOfDate;
        });

        // Trends are computed from real, point-in-time quarterly figures: the latest discrete quarter against the same
        // quarter one year earlier (like for like). If a comparison cannot be derived, the trend stays undefined (unknown);
        // nothing is assumed.
        const pitQuarters = (finData.historicalQuarters || finData.derivedQuarters || [])
          .filter(q => q.periodEnd && q.filedDate && q.filedDate <= asOfDate && q.periodEnd <= asOfDate)
          .sort((x, y) => (x.periodEnd! > y.periodEnd! ? 1 : -1));
        const latestQ = pitQuarters[pitQuarters.length - 1];
        const yearAgoQ = latestQ
          ? pitQuarters.find(q => {
              const d = (Date.parse(latestQ.periodEnd!) - Date.parse(q.periodEnd!)) / 86400000;
              return d >= 350 && d <= 380;
            })
          : undefined;

        const growthTrend = (cur: number, prev: number): 'GROWING' | 'FLAT' | 'DECLINING' | undefined => {
          if (!(prev > 0)) return undefined;
          const ratio = cur / prev;
          return ratio > 1.02 ? 'GROWING' : ratio < 0.98 ? 'DECLINING' : 'FLAT';
        };

        let revenueTrend: 'GROWING' | 'FLAT' | 'DECLINING' | undefined;
        let netIncomeTrend: 'GROWING' | 'FLAT' | 'DECLINING' | undefined;
        let operatingMarginTrend: 'EXPANDING' | 'STABLE' | 'CONTRACTING' | undefined;
        let operatingCashFlowTrend: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | undefined;
        let revenueGrowthPct: number | undefined;
        let operatingMarginPct: number | undefined;
        if (latestQ && yearAgoQ && yearAgoQ.revenue > 0 && latestQ.revenue > 0) {
          revenueTrend = growthTrend(latestQ.revenue, yearAgoQ.revenue);
          revenueGrowthPct = Math.round((latestQ.revenue / yearAgoQ.revenue - 1) * 1000) / 10;
          netIncomeTrend = growthTrend(latestQ.netIncome, yearAgoQ.netIncome);
          const mNow = (latestQ.operatingIncome / latestQ.revenue) * 100;
          const mPrev = (yearAgoQ.operatingIncome / yearAgoQ.revenue) * 100;
          operatingMarginPct = Math.round(mNow * 10) / 10;
          operatingMarginTrend = mNow - mPrev > 1 ? 'EXPANDING' : mNow - mPrev < -1 ? 'CONTRACTING' : 'STABLE';
        }
        if (latestQ) {
          operatingCashFlowTrend = latestQ.operatingCashFlow > 0 ? 'POSITIVE' : latestQ.operatingCashFlow < 0 ? 'NEGATIVE' : 'NEUTRAL';
        }

        // Check if real SEC facts exist
        const isRealSec = finData.facts.some(f => f.filedDate !== undefined);

        financialsInput = {
          hasData: pitFacts.length > 0,
          revenueTrend,
          operatingMarginTrend,
          netIncomeTrend,
          operatingCashFlowTrend,
          revenueGrowthPct,
          operatingMarginPct,
          periodsCount: pitFacts.length,
          // Valuation multiples need EPS/sales-per-share inputs that are not sourced yet: report unknown, not a guess.
          peRatio: null,
          priceToSales: null,
          evidenceIds: pitFacts.slice(0, 5).map((f, i) => `fact-${security.ticker}-${f.metric}-${i}`),
          isRealSecData: isRealSec
        };
      }
    } catch {
      // Fallback if financials cannot be retrieved
    }

    // If financialsInput is still undefined, check if any evidence items provide financial facts
    if (!financialsInput && evidenceItems.some(e => e.sourceType === 'SEC_EDGAR')) {
      const filingEv = evidenceItems.filter(e => e.sourceType === 'SEC_EDGAR');
      financialsInput = {
        hasData: true,
        // Filing evidence exists but no structured figures: trends are unknown (not assumed favorable).
        periodsCount: filingEv.length,
        peRatio: null,
        evidenceIds: filingEv.map(e => e.evidenceId),
        isRealSecData: true
      };
    }

    // 3. Market Data & Price Bars
    let marketDataInput: DecisionScoringInputs['marketData'] = undefined;
    let priceBars: any[] = [];
    try {
      const hist = await financialDataService.getHistoricalPrices({
        symbol: security.symbol || security.ticker || '',
        exchange: security.exchange,
        period: '1Y',
        interval: '1d'
      });
      if (hist && hist.bars && hist.bars.length > 0) {
        priceBars = hist.bars.filter(b => b.timestamp <= asOfDate);
        const lastBar = priceBars[priceBars.length - 1] || hist.bars[hist.bars.length - 1];
        
        // Calculate SMA50 and SMA200 if sufficient bars exist
        let sma50: number | undefined;
        let sma200: number | undefined;
        if (priceBars.length >= 50) {
          const slice50 = priceBars.slice(-50);
          sma50 = slice50.reduce((sum, b) => sum + b.close, 0) / 50;
        }
        if (priceBars.length >= 200) {
          const slice200 = priceBars.slice(-200);
          sma200 = slice200.reduce((sum, b) => sum + b.close, 0) / 200;
        }

        marketDataInput = {
          currentPrice: lastBar ? lastBar.close : 0,
          currency: security.currency,
          bars: priceBars,
          provider: hist.provider || 'Twelve Data',
          epistemicStatus: hist.epistemicStatus || 'REAL',
          sma50,
          sma200,
          // Computed from the real price bars; undefined (unknown) when there are too few bars. Never a constant.
          ...computeMarketStats(priceBars)
        };
      }
    } catch {
      // Market data provider unavailable
    }

    if (!marketDataInput) {
      marketDataInput = {
        currentPrice: 0,
        currency: security.currency,
        bars: [],
        provider: 'UNAVAILABLE',
        epistemicStatus: 'UNAVAILABLE'
      };
    }

    // 4. Quantitative Signals from quantStrategyEngine
    const quantSignals: DecisionScoringInputs['quantSignals'] = [];
    try {
      if (priceBars.length >= 20) {
        const builtinStrategies = quantStrategyEngine.getBuiltinStrategies();
        for (const strat of builtinStrategies.slice(0, 3)) {
          const evalRes = await quantStrategyEngine.evaluateStrategy({
            strategy: strat,
            bars: priceBars,
            asOfDate
          });
          if (evalRes && (evalRes.signal || (evalRes as any).latestSignal)) {
            const sig = evalRes.signal || (evalRes as any).latestSignal;
            quantSignals.push({
              strategyId: strat.strategyId,
              strategyName: strat.name,
              signal: sig.direction === 'BUY' ? 'BUY' : sig.direction === 'SELL' ? 'SELL' : 'HOLD',
              indicatorValues: (evalRes.indicators as any) || {},
              signalTimestamp: sig.timestamp,
              epistemicStatus: (evalRes.epistemicStatus === 'UNAVAILABLE' ? 'CALCULATED' : evalRes.epistemicStatus) as any || 'CALCULATED'
            });
          }
        }
      }
    } catch {
      // Skip if strategy evaluation fails
    }

    // 5. Backtest Metrics
    let backtestMetrics: DecisionScoringInputs['backtestMetrics'] = undefined;
    try {
      // Only backtests the principal may use (own or explicitly SHARED); private/legacy results never feed a decision.
      const allBacktests = backtestService.getAllBacktests().filter(b => visibleToEngine(b, ownerUserId));
      const secTicker = security.symbol || security.ticker || '';
      const match = allBacktests.find(b => (b as any).configuration?.symbol === secTicker || (b as any).symbol === secTicker);
      // Only a real, visible backtest result feeds the decision. No benchmark/default figures are substituted:
      // without a matching result (or without a Sharpe ratio) the dimension is reported as unavailable.
      if (match && typeof match.sharpeRatio === 'number' && Number.isFinite(match.sharpeRatio)) {
        backtestMetrics = {
          available: true,
          strategyName: match.strategyTitle || (match as any).configuration?.strategyName || 'Quantitative Strategy',
          sharpeRatio: match.sharpeRatio,
          cagr: match.cagr ?? null,
          maxDrawdown: match.maxDrawdown ?? null,
          winRate: match.winRate ?? null,
          profitFactor: match.profitFactor ?? null
        };
      }
    } catch {
      // Backtest not available
    }

    // 6. Portfolio Holding from portfolioIntelligenceService
    let portfolioHolding: DecisionScoringInputs['portfolioHolding'] = undefined;
    try {
      const portMetrics = portfolioIntelligenceService.getPortfolioMetrics();
      const secTicker = security.symbol || security.ticker || '';
      const holding = portMetrics.positions?.find(p => p.symbol === secTicker || (p as any).ticker === secTicker);
      if (holding) {
        portfolioHolding = {
          isHeld: true,
          weightPct: holding.weightPct || 0,
          shares: holding.shares || 0,
          marketValue: holding.marketValue || 0,
          unrealizedPnLPct: holding.unrealizedReturnPct || 0,
          portfolioBetaContribution: holding.beta?.value,
          sectorWeightPct: undefined
        };
      } else {
        portfolioHolding = {
          isHeld: false
        };
      }
    } catch {
      portfolioHolding = { isHeld: false };
    }

    // 7. Research Notebook Snapshot
    let notebookSnapshot: DecisionScoringInputs['notebookSnapshot'] = undefined;
    try {
      const secLookupKey = security.canonicalId || security.id || security.symbol || security.ticker || '';
      const notebook = await researchNotebookService.getOrCreateNotebook(secLookupKey, asOfDate);
      if (notebook && notebook.notebookId) {
        const latestSnap = researchNotebookService.getLatestSnapshotVisibleTo(notebook.notebookId, ownerUserId);
        if (latestSnap) {
          const diff = (latestSnap as any).diff || latestSnap.thesis?.whatChanged;
          const thesisImpact = diff?.thesisImpact;
          notebookSnapshot = {
            available: true,
            notebookId: notebook.notebookId,
            snapshotId: latestSnap.snapshotId,
            thesisStatus: (thesisImpact?.bullCaseImpact === 'Weakened' ? 'WEAKENING' : 'STABLE') as any,
            bullCasePoints: latestSnap.thesis?.bullCase?.points || [],
            bearCasePoints: latestSnap.thesis?.bearCase?.points || [],
            risks: (latestSnap.thesis?.risks || latestSnap.risks || []).map(r => ({
              title: r.title || r.description?.slice(0, 40) || 'Risk',
              severity: r.severity || 'MEDIUM',
              description: r.description
            })),
            catalysts: (latestSnap.thesis?.catalysts || latestSnap.catalysts || []).map(c => ({
              title: c.title || c.description?.slice(0, 40) || 'Catalyst',
              type: (c as any).type || 'DISCLOSED',
              description: c.description
            })),
            diff: diff ? {
              status: diff.status,
              deltaEvidenceCount: (diff as any).deltaEvidenceCount || 0,
              thesisImpact: diff.thesisImpact
            } : undefined
          };
        }
    }
  } catch {
    // Research notebook snapshot optional
  }

    // 8. Provider health statuses
    const providerStatuses: Record<string, string> = {};
    try {
      const health = financialDataService.getDataSourcesHealth();
      if (health.secEdgar) providerStatuses['SEC EDGAR'] = health.secEdgar.status;
      if (health.usMarketData) providerStatuses['Twelve Data'] = health.usMarketData.status;
      if (health.fyersMarketData) providerStatuses['FYERS'] = health.fyersMarketData.status;
    } catch {
      // Health retrieval fallback
    }

    return {
      security,
      asOfDate,
      config,
      financials: financialsInput,
      marketData: marketDataInput,
      quantSignals,
      backtestMetrics,
      portfolioHolding,
      researchEvidence: evidenceItems as any,
      notebookSnapshot,
      providerStatuses
    };
  }
}

export const decisionIntelligenceService = DecisionIntelligenceService.getInstance();
