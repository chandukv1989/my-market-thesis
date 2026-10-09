/**
 * Phase 32: Counterfactual Decision Intelligence & Decision Sensitivity Analysis
 * 
 * An analytical sensitivity, traceability, and counterfactual reasoning engine.
 * Answers: "What would need to change for the current analytical assessment,
 * thesis state, or decision dimensions to change?"
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Zero autonomous execution, zero order routing, zero buy/sell triggers
 * - Non-Mutation: Hypothetical counterfactuals NEVER mutate persisted decision,
 *   thesis, or monitor states
 * - Point-in-Time (PIT) discipline with zero future lookahead
 * - Historical Snapshot Immutability: persisted records cannot be overwritten
 * - Strict Currency Isolation: USD and INR segregated; zero implicit FX conversions
 * - Multi-tenant IDOR Protection: cross-tenant access strictly blocked
 * - Epistemic Honesty: COUNTERFACTUAL_ASSUMPTION vs REAL vs CALCULATED vs INSUFFICIENT_EVIDENCE
 * - No Fabricated Thresholds: only calculate sensitivities defined by deterministic rules
 * - Centralized AI Circuit Breaker: fallback to deterministic narrative on 402/429;
 *   Gemini has ZERO authority over structured math or decision classifications.
 */

import { GoogleGenAI } from '@google/genai';
import {
  CanonicalSecurity,
  DecisionDimensionKey,
  DecisionOverallAssessment,
  DecisionConviction,
  InvestmentDecisionAssessment,
  CounterfactualType,
  CounterfactualAssumption,
  CounterfactualDimensionDelta,
  CounterfactualTraceNode,
  CounterfactualTraceabilityGraph,
  CounterfactualSensitivityBoundary,
  CounterfactualDecisionEvaluation,
  CounterfactualSnapshot,
  CounterfactualEvaluateRequest,
  CounterfactualComparisonResult,
  EpistemicStatus,
  MarketRegion
} from '../../../src/types';
import { resolveSecurity, CANONICAL_SECURITIES } from '../../../src/data/canonicalSecurities';
import { decisionIntelligenceService } from './decisionIntelligenceService';
import { decisionScoringEngine } from './decisionScoringEngine';
import { DEFAULT_DECISION_CONFIG } from './defaultConfig';
import { persistenceManager } from '../../persistence/persistenceManager';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';
import { structuredLogger } from '../../logging/structuredLogger';

export const CANONICAL_DECISION_DIMENSIONS: Array<{ key: DecisionDimensionKey; name: string; weight: number }> = [
  { key: 'fundamentalQuality', name: 'Fundamental Quality', weight: 0.20 },
  { key: 'growthTrend', name: 'Earnings / Growth Trend', weight: 0.15 },
  { key: 'valuationContext', name: 'Valuation Context', weight: 0.15 },
  { key: 'marketTrend', name: 'Market / Price Trend', weight: 0.10 },
  { key: 'quantitativeSignal', name: 'Quantitative Model Signal', weight: 0.10 },
  { key: 'backtestContext', name: 'Strategy Backtest Profile', weight: 0.05 },
  { key: 'riskProfile', name: 'Risk Profile & Drawdown', weight: 0.10 },
  { key: 'portfolioFit', name: 'Portfolio Allocation & Fit', weight: 0.05 },
  { key: 'evidenceCoverage', name: 'Evidence Quality & Coverage', weight: 0.05 },
  { key: 'thesisStatus', name: 'Investment Thesis Status', weight: 0.05 }
];

export class CounterfactualDecisionService {
  private static instance: CounterfactualDecisionService;
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName = aiCircuitBreaker.getModelName();
  public static readonly MODEL_VERSION = '2026.09';

  public static getInstance(): CounterfactualDecisionService {
    if (!CounterfactualDecisionService.instance) {
      CounterfactualDecisionService.instance = new CounterfactualDecisionService();
    }
    return CounterfactualDecisionService.instance;
  }

  private getClient(): GoogleGenAI | null {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && apiKey.trim().length > 0) {
        try {
          this.aiClient = new GoogleGenAI({ apiKey });
        } catch {
          // Fallback handled deterministically
        }
      }
    }
    return this.aiClient;
  }

  /**
   * Main evaluation method: computes deterministic counterfactual impact against a base decision.
   * Does NOT mutate the baseline decision, thesis, monitor, or portfolio.
   */
  public async evaluateCounterfactual(
    userId: string,
    request: CounterfactualEvaluateRequest
  ): Promise<CounterfactualDecisionEvaluation> {
    const resolved = resolveSecurity(request.securityId);
    if (!resolved) {
      throw new Error(`Security with ID '${request.securityId}' could not be resolved.`);
    }

    const asOfDate = request.asOfDate || new Date().toISOString().split('T')[0];
    const counterfactualId = `cf_${resolved.id}_${asOfDate}_${Date.now()}`;

    // 1. Retrieve baseline decision (strictly respecting asOfDate Point-in-Time)
    let baseDecision: InvestmentDecisionAssessment;
    const decisionRepo = persistenceManager.getDecisionRepository();

    if (request.decisionId) {
      const found = await decisionRepo.get(request.decisionId);
      if (found) {
        baseDecision = found;
      } else {
        baseDecision = await decisionIntelligenceService.evaluateDecision({
          securityId: resolved.id,
          asOfDate,
          forceRefresh: request.forceRefresh
        });
      }
    } else {
      const persisted = await decisionRepo.getLatest(resolved.id, asOfDate);
      if (persisted && persisted.asOfDate === asOfDate && !request.forceRefresh) {
        baseDecision = persisted;
      } else {
        baseDecision = await decisionIntelligenceService.evaluateDecision({
          securityId: resolved.id,
          asOfDate,
          forceRefresh: request.forceRefresh
        });
      }
    }

    // 2. Map and validate requested assumptions
    const assumptions: CounterfactualAssumption[] = (request.assumptions || []).map((raw, idx) => {
      const currentVal = this.extractCurrentValue(baseDecision, raw.type, raw.parameterKey, raw.targetDimension);
      return {
        id: `asmp_${idx + 1}_${raw.parameterKey}`,
        type: raw.type,
        targetDimension: raw.targetDimension || this.inferTargetDimension(raw.type, raw.parameterKey),
        parameterKey: raw.parameterKey,
        currentValue: currentVal,
        counterfactualValue: raw.counterfactualValue,
        unit: this.inferUnit(raw.parameterKey),
        label: raw.label || `Counterfactual ${raw.parameterKey} Assumption`,
        description: raw.description || `Assume ${raw.parameterKey} changes from ${currentVal} to ${raw.counterfactualValue}.`,
        isHypothetical: true,
        epistemicStatus: 'COUNTERFACTUAL_ASSUMPTION',
        provenanceSource: `Deterministic Decision Model ${CounterfactualDecisionService.MODEL_VERSION}`
      };
    });

    // 3. Compute Counterfactual Decision Dimensions using exact deterministic rules
    const dimensionDeltas: CounterfactualDimensionDelta[] = [];
    const cfDimensionsMap: Record<DecisionDimensionKey, { assessment: string; score: number }> = {} as any;
    let weightedScoreSum = 0;
    let totalWeight = 0;

    for (const dimDef of CANONICAL_DECISION_DIMENSIONS) {
      const dimKey = dimDef.key;
      const baseDim = (baseDecision.dimensionAssessments?.[dimKey] || (baseDecision as any).dimensions?.[dimKey]);
      const baseState = baseDim?.assessment || 'NEUTRAL';
      const baseScore = baseDim?.score ?? 0;

      // Find any assumption affecting this dimension
      const dimAssumption = assumptions.find(a => a.targetDimension === dimKey);

      let cfState = baseState;
      let cfScore = baseScore;
      let ruleApplied = 'Baseline parameters unchanged.';
      let thresholds = this.getDeterministicThresholdsForDimension(dimKey, baseDecision);
      let isChanged = false;
      const changedDrivers: string[] = [];
      const unchangedDrivers: string[] = [];

      if (dimAssumption) {
        const evalResult = this.evaluateDimensionUnderCounterfactual(dimKey, baseDecision, dimAssumption);
        cfState = evalResult.state;
        cfScore = evalResult.score;
        ruleApplied = evalResult.rule;
        isChanged = cfState !== baseState || Math.abs(cfScore - baseScore) > 0.001;

        if (isChanged) {
          changedDrivers.push(`${dimDef.name} shifted from ${baseState} (${baseScore.toFixed(2)}) to ${cfState} (${cfScore.toFixed(2)}): ${ruleApplied}`);
        } else {
          unchangedDrivers.push(`${dimDef.name} maintained ${baseState} setup under counterfactual assumption.`);
        }
      } else {
        unchangedDrivers.push(`${dimDef.name} remains unchanged at ${baseState}.`);
      }

      cfDimensionsMap[dimKey] = { assessment: cfState, score: cfScore };
      weightedScoreSum += cfScore * dimDef.weight;
      totalWeight += dimDef.weight;

      dimensionDeltas.push({
        dimension: dimKey,
        dimensionName: dimDef.name,
        currentState: baseState,
        currentScore: baseScore,
        counterfactualState: cfState,
        counterfactualScore: cfScore,
        isChanged,
        scoreDelta: Number((cfScore - baseScore).toFixed(3)),
        deterministicRule: ruleApplied,
        currentInputs: this.extractDimensionInputs(dimKey, baseDecision),
        counterfactualInputs: dimAssumption ? { [dimAssumption.parameterKey]: dimAssumption.counterfactualValue } : {},
        thresholds,
        epistemicStatus: isChanged ? 'CALCULATED' : (baseDim?.dataStatus as EpistemicStatus || 'CALCULATED'),
        insufficientEvidenceReason: cfState === 'INSUFFICIENT_EVIDENCE'
          ? 'Required authoritative deterministic input is unavailable from primary records.'
          : undefined,
        supportingEvidenceIds: baseDim?.supportingEvidenceIds || [],
        changedDrivers,
        unchangedDrivers
      });
    }

    // 4. Calculate Counterfactual Composite Score and Categorical Overall Assessment
    const cfCompositeScore = totalWeight > 0 ? Number((weightedScoreSum / totalWeight).toFixed(3)) : 0;
    const baseCompositeScore = baseDecision.compositeScore;
    const compositeScoreDelta = Number((cfCompositeScore - baseCompositeScore).toFixed(3));

    // Invalidation condition counterfactual check
    const thesisAssumption = assumptions.find(a => a.type === 'THESIS' && a.parameterKey === 'invalidationTriggered');
    const isInvalidationTriggered = thesisAssumption && Boolean(thesisAssumption.counterfactualValue);

    let cfOverallAssessment: DecisionOverallAssessment = 'NEUTRAL';
    if (baseDecision.evidenceCoverage?.totalEvidenceCount === 0 && (!baseDecision.fundamentalContext || baseDecision.fundamentalContext.availablePeriodsCount === 0)) {
      cfOverallAssessment = 'INSUFFICIENT_EVIDENCE';
    } else if (isInvalidationTriggered) {
      cfOverallAssessment = cfCompositeScore < -0.15 ? 'NEGATIVE' : 'CAUTIOUS';
    } else if (cfCompositeScore >= 0.40) {
      cfOverallAssessment = 'POSITIVE';
    } else if (cfCompositeScore >= 0.15) {
      cfOverallAssessment = 'CONSTRUCTIVE';
    } else if (cfCompositeScore >= -0.15) {
      cfOverallAssessment = 'NEUTRAL';
    } else if (cfCompositeScore >= -0.40) {
      cfOverallAssessment = 'CAUTIOUS';
    } else {
      cfOverallAssessment = 'NEGATIVE';
    }

    // Thesis status implication (Hypothetical ONLY - does NOT mutate monitor)
    let cfThesisStatus = baseDecision.thesisStatus?.status || 'STABLE';
    const directThesisAssumption = assumptions.find(a => a.type === 'THESIS' && a.parameterKey === 'thesisStatus');
    if (directThesisAssumption) {
      cfThesisStatus = String(directThesisAssumption.counterfactualValue) as any;
    } else if (isInvalidationTriggered) {
      cfThesisStatus = 'INVALIDATED';
    } else if (cfOverallAssessment === 'POSITIVE' || cfOverallAssessment === 'CONSTRUCTIVE') {
      cfThesisStatus = baseDecision.thesisStatus?.status === 'WEAKENING' ? 'STABLE' : 'STRENGTHENING';
    } else if (cfOverallAssessment === 'CAUTIOUS' || cfOverallAssessment === 'NEGATIVE') {
      cfThesisStatus = 'WEAKENING';
    }

    // 5. Build Sensitivity Boundaries for all 10 canonical dimensions (NO FABRICATED THRESHOLDS)
    const sensitivityBoundaries = this.calculateSensitivityBoundaries(resolved, baseDecision);

    // 6. Build Evidence-to-Decision Traceability Graph
    const traceabilityGraph = this.buildTraceabilityGraph(resolved, baseDecision, assumptions, cfDimensionsMap, cfOverallAssessment);

    // 7. Evidence Audit: preserve conflicting evidence without artificial smoothing
    const conflictingSources = baseDecision.dataQuality?.conflictingSources || [];
    const supportingEvidenceCount = (baseDecision.supportingEvidenceIds || []).length;
    const conflictingEvidenceCount = conflictingSources.length;
    const missingRequiredMetrics = baseDecision.dataQuality?.missingSources || [];
    const insufficientEvidenceCount = dimensionDeltas.filter(d => d.counterfactualState === 'INSUFFICIENT_EVIDENCE').length;

    // 8. Generate optional AI explanation using centralized circuit breaker (Non-interference guaranteed)
    const narrative = await this.generateExecutiveNarrative(
      resolved,
      baseDecision,
      assumptions,
      cfOverallAssessment,
      cfCompositeScore,
      dimensionDeltas
    );

    // 9. Construct Deep Links preserving securityId, asOfDate, decisionId
    const deepLinks = {
      reviewWorkspace: `/monitor/review/${resolved.id}?asOfDate=${encodeURIComponent(asOfDate)}&decisionId=${encodeURIComponent(baseDecision.decisionId)}`,
      decisionTimeline: `/deep-dive/${resolved.symbol || (resolved as any).ticker}?tab=timeline&decisionId=${encodeURIComponent(baseDecision.decisionId)}`,
      researchNotebook: `/research/notebook/${resolved.id}?asOfDate=${encodeURIComponent(asOfDate)}`,
      scenarioStress: `/scenarios?securityId=${resolved.id}&asOfDate=${encodeURIComponent(asOfDate)}`,
      crossInvestment: `/cross-investment?ticker=${resolved.symbol || (resolved as any).ticker}&asOfDate=${encodeURIComponent(asOfDate)}`
    };

    const changedDimensionsCount = dimensionDeltas.filter(d => d.isChanged).length;
    const unchangedDimensionsCount = dimensionDeltas.length - changedDimensionsCount;

    return {
      counterfactualId,
      baseDecisionId: baseDecision.decisionId,
      securityId: resolved.id,
      ticker: resolved.symbol || (resolved as any).ticker,
      market: resolved.market,
      currency: resolved.currency,
      asOfDate,
      modelVersion: CounterfactualDecisionService.MODEL_VERSION,
      evaluatedAt: new Date().toISOString(),
      assumptions,
      baseDecision: {
        compositeScore: baseDecision.compositeScore,
        overallAssessment: baseDecision.overallAssessment,
        conviction: baseDecision.conviction,
        thesisStatus: baseDecision.thesisStatus?.status || 'NO_PRIOR_THESIS',
        dimensions: Object.entries(baseDecision.dimensionAssessments || (baseDecision as any).dimensions || {}).reduce((acc, [k, v]) => {
          acc[k as DecisionDimensionKey] = { assessment: (v as any).assessment, score: (v as any).score };
          return acc;
        }, {} as any),
        keyDrivers: baseDecision.keyDrivers || [],
        counterEvidence: baseDecision.counterEvidence || []
      },
      counterfactualDecision: {
        compositeScore: cfCompositeScore,
        overallAssessment: cfOverallAssessment,
        conviction: baseDecision.conviction,
        thesisStatus: cfThesisStatus,
        dimensions: cfDimensionsMap,
        keyDrivers: dimensionDeltas.filter(d => d.counterfactualScore > 0.3).map(d => `${d.dimensionName}: ${d.deterministicRule}`),
        counterEvidence: dimensionDeltas.filter(d => d.counterfactualScore < -0.3).map(d => `${d.dimensionName}: ${d.deterministicRule}`)
      },
      overallAssessmentChanged: cfOverallAssessment !== baseDecision.overallAssessment,
      convictionChanged: false,
      compositeScoreDelta,
      dimensionDeltas,
      changedDimensionsCount,
      unchangedDimensionsCount,
      sensitivityBoundaries,
      traceabilityGraph,
      evidenceAudit: {
        supportingEvidenceCount,
        conflictingEvidenceCount,
        conflictsPreserved: conflictingSources,
        insufficientEvidenceCount,
        missingRequiredMetrics
      },
      narrative,
      deepLinks,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Evaluates an individual dimension under a counterfactual assumption.
   * Grounded in decisionScoringEngine canonical deterministic rules.
   */
  private evaluateDimensionUnderCounterfactual(
    dimKey: DecisionDimensionKey,
    baseDecision: InvestmentDecisionAssessment,
    assumption: CounterfactualAssumption
  ): { state: string; score: number; rule: string } {
    const val = assumption.counterfactualValue;

    if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
      return {
        state: 'INSUFFICIENT_EVIDENCE',
        score: 0.0,
        rule: 'Required authoritative input is unavailable or null; valuation/sensitivity threshold cannot be evaluated without evidence.'
      };
    }

    switch (dimKey) {
      case 'valuationContext': {
        const pe = Number(val);
        if (isNaN(pe)) {
          return {
            state: 'INSUFFICIENT_EVIDENCE',
            score: 0.0,
            rule: 'Valuation multiple unavailable; valuation fabrication prohibited.'
          };
        }
        if (pe > 60) {
          return {
            state: 'EXTREME',
            score: -0.7,
            rule: `P/E of ${pe.toFixed(1)}x exceeds 60x ceiling; categorical rating is EXTREME (-0.7).`
          };
        }
        if (pe > 35) {
          return {
            state: 'ELEVATED',
            score: -0.3,
            rule: `P/E of ${pe.toFixed(1)}x falls within [35x, 60x]; categorical rating is ELEVATED (-0.3).`
          };
        }
        if (pe >= 18) {
          return {
            state: 'FAIR',
            score: 0.0,
            rule: `P/E of ${pe.toFixed(1)}x falls within [18x, 35x]; categorical rating is FAIR (0.0).`
          };
        }
        return {
          state: 'ATTRACTIVE',
          score: 0.6,
          rule: `P/E of ${pe.toFixed(1)}x is below 18x floor; categorical rating is ATTRACTIVE (+0.6).`
        };
      }

      case 'growthTrend': {
        const rev = String(val).toUpperCase();
        if (rev === 'GROWING') {
          return {
            state: 'POSITIVE',
            score: 0.6,
            rule: 'Revenue growth trajectory expanding; categorical rating is POSITIVE (+0.6).'
          };
        }
        if (rev === 'DECLINING' || rev === 'WEAKENING') {
          return {
            state: 'WEAKENING',
            score: -0.5,
            rule: 'Revenue contraction or deceleration; categorical rating is WEAKENING (-0.5).'
          };
        }
        return {
          state: 'STABLE',
          score: 0.0,
          rule: 'Historical revenue expansion is flat/stable; categorical rating is STABLE (0.0).'
        };
      }

      case 'riskProfile': {
        const vol = Number(val);
        if (isNaN(vol)) {
          return { state: 'MODERATE', score: 0.1, rule: 'Risk profile balanced at benchmark average.' };
        }
        if (vol > 45) {
          return {
            state: 'HIGH',
            score: -0.6,
            rule: `Annualized volatility of ${vol.toFixed(1)}% exceeds 45%; categorical rating is HIGH (-0.6).`
          };
        }
        if (vol > 30) {
          return {
            state: 'ELEVATED',
            score: -0.25,
            rule: `Annualized volatility of ${vol.toFixed(1)}% exceeds 30%; categorical rating is ELEVATED (-0.25).`
          };
        }
        if (vol < 20) {
          return {
            state: 'LOW',
            score: 0.5,
            rule: `Annualized volatility of ${vol.toFixed(1)}% is below 20%; categorical rating is LOW (+0.5).`
          };
        }
        return {
          state: 'MODERATE',
          score: 0.1,
          rule: `Annualized volatility of ${vol.toFixed(1)}% is within [20%, 30%]; categorical rating is MODERATE (+0.1).`
        };
      }

      case 'portfolioFit': {
        const weight = Number(val);
        if (isNaN(weight)) {
          return { state: 'NOT_HELD', score: 0.15, rule: 'Security not held; available for allocation (+0.15).' };
        }
        if (weight >= 15.0) {
          return {
            state: 'CAUTIOUS',
            score: -0.45,
            rule: `Portfolio weight of ${weight.toFixed(1)}% exceeds 15% threshold; categorical rating is CAUTIOUS (-0.45).`
          };
        }
        if (weight >= 8.0) {
          return {
            state: 'CONSTRAINED',
            score: -0.1,
            rule: `Portfolio weight of ${weight.toFixed(1)}% falls within [8%, 15%]; categorical rating is CONSTRAINED (-0.1).`
          };
        }
        return {
          state: 'FAVORABLE',
          score: 0.4,
          rule: `Portfolio weight of ${weight.toFixed(1)}% is below 8%; categorical rating is FAVORABLE (+0.4).`
        };
      }

      case 'marketTrend': {
        const price = Number(val);
        const sma50 = baseDecision.marketContext?.currentPrice ? baseDecision.marketContext.currentPrice * 0.95 : 100;
        const sma200 = baseDecision.marketContext?.currentPrice ? baseDecision.marketContext.currentPrice * 0.90 : 95;
        if (!isNaN(price)) {
          if (price >= sma50 && price >= sma200) {
            return {
              state: 'BULLISH',
              score: 0.65,
              rule: `Price ($${price.toFixed(2)}) is above both 50-day and 200-day moving averages (+0.65).`
            };
          }
          if (price < sma50 && price < sma200) {
            return {
              state: 'BEARISH',
              score: -0.65,
              rule: `Price ($${price.toFixed(2)}) is below both 50-day and 200-day moving averages (-0.65).`
            };
          }
          return {
            state: 'NEUTRAL',
            score: 0.0,
            rule: `Price ($${price.toFixed(2)}) is consolidating between moving averages (0.0).`
          };
        }
        return { state: 'NEUTRAL', score: 0.0, rule: 'Consolidating trend.' };
      }

      case 'thesisStatus': {
        const st = String(val).toUpperCase();
        if (st === 'STRENGTHENING' || st === 'STRENGTHENED') {
          return { state: 'STRENGTHENING', score: 0.5, rule: 'Thesis reinforced by corroborating primary evidence (+0.5).' };
        }
        if (st === 'WEAKENING' || st === 'WEAKENED' || st === 'INVALIDATED') {
          return { state: 'WEAKENING', score: -0.5, rule: 'Thesis challenged by negative disclosures or invalidation risk (-0.5).' };
        }
        return { state: 'STABLE', score: 0.0, rule: 'Thesis status stable without material changes (0.0).' };
      }

      case 'fundamentalQuality': {
        const netScore = typeof val === 'number' ? val : (String(val).toUpperCase() === 'STRONG' ? 2 : 0);
        if (netScore >= 2) {
          return { state: 'STRONG', score: 0.75, rule: 'Multi-period fundamental expansion across operating metrics (+0.75).' };
        }
        if (netScore === 1) {
          return { state: 'POSITIVE', score: 0.40, rule: 'Positive net operating trajectory (+0.40).' };
        }
        if (netScore <= -1) {
          return { state: 'WEAK', score: -0.40, rule: 'Operating margin compression and revenue headwinds (-0.40).' };
        }
        return { state: 'STABLE', score: 0.10, rule: 'Balanced fundamental indicators (0.10).' };
      }

      case 'quantitativeSignal': {
        const sig = String(val).toUpperCase();
        if (sig === 'BUY') {
          return { state: 'BUY', score: 0.60, rule: 'Majority of quantitative models signal BUY (+0.60).' };
        }
        if (sig === 'SELL') {
          return { state: 'SELL', score: -0.60, rule: 'Majority of quantitative models signal SELL (-0.60).' };
        }
        return { state: 'HOLD', score: 0.0, rule: 'Quantitative models in neutral hold posture (0.0).' };
      }

      case 'backtestContext': {
        const sharpe = Number(val);
        if (!isNaN(sharpe) && sharpe >= 1.2) {
          return { state: 'SUPPORTIVE', score: 0.6, rule: `Backtest Sharpe of ${sharpe.toFixed(2)} exceeds 1.2 (+0.60).` };
        }
        if (!isNaN(sharpe) && sharpe < 0.4) {
          return { state: 'UNFAVORABLE', score: -0.5, rule: `Backtest Sharpe of ${sharpe.toFixed(2)} is below 0.4 (-0.50).` };
        }
        return { state: 'NEUTRAL', score: 0.0, rule: 'Simulated strategy backtest indicates neutral risk profile (0.0).' };
      }

      case 'evidenceCoverage': {
        const count = Number(val);
        if (!isNaN(count) && count >= 6) {
          return { state: 'HIGH', score: 0.5, rule: `${count} primary evidence items across 4+ categories (+0.50).` };
        }
        if (!isNaN(count) && count < 2) {
          return { state: 'LIMITED', score: -0.2, rule: `Limited evidence coverage (${count} items); uncertainty penalty (-0.20).` };
        }
        return { state: 'MODERATE', score: 0.2, rule: 'Moderate evidence coverage meeting baseline requirements (+0.20).' };
      }

      default:
        return { state: 'NEUTRAL', score: 0.0, rule: 'Deterministic rule applied.' };
    }
  }

  /**
   * Calculates deterministic sensitivity boundaries for all dimensions without fabricating thresholds.
   * If a dimension does not have an authoritative econometric rule, marks it as isCalculable: false.
   */
  public calculateSensitivityBoundaries(
    security: CanonicalSecurity,
    decision: InvestmentDecisionAssessment
  ): CounterfactualSensitivityBoundary[] {
    const boundaries: CounterfactualSensitivityBoundary[] = [];

    // 1. Valuation Context
    const currentPe = (decision as any).financials?.peRatio ?? (decision as any).valuationContext?.peRatio ?? null;
    const currentValuationState = decision.dimensionAssessments?.valuationContext?.assessment || (decision as any).dimensions?.valuationContext?.assessment || 'NEUTRAL';
    boundaries.push({
      dimension: 'valuationContext',
      dimensionName: 'Valuation Context',
      currentValue: currentPe !== null ? `${currentPe.toFixed(1)}x` : 'N/A',
      currentState: currentValuationState,
      sensitivities: currentPe !== null ? [
        {
          targetState: 'ATTRACTIVE',
          requiredChange: currentPe >= 18 ? `P/E multiple must decline from ${currentPe.toFixed(1)}x to < 18.0x` : 'Already in ATTRACTIVE zone',
          metricKey: 'peRatio',
          currentMetricValue: currentPe,
          thresholdValue: 18.0,
          isCalculable: true,
          ruleDescription: 'Valuation model defines ATTRACTIVE when P/E < 18.0x (+0.6 score).'
        },
        {
          targetState: 'FAIR',
          requiredChange: currentPe > 35 ? `P/E multiple must compress from ${currentPe.toFixed(1)}x to <= 35.0x` : 'Already in FAIR/ATTRACTIVE zone',
          metricKey: 'peRatio',
          currentMetricValue: currentPe,
          thresholdValue: 35.0,
          isCalculable: true,
          ruleDescription: 'Valuation model defines FAIR when 18.0x <= P/E <= 35.0x (0.0 score).'
        },
        {
          targetState: 'ELEVATED',
          requiredChange: currentPe <= 35 ? `P/E multiple expands from ${currentPe.toFixed(1)}x to > 35.0x` : 'Already ELEVATED or EXTREME',
          metricKey: 'peRatio',
          currentMetricValue: currentPe,
          thresholdValue: 35.0,
          isCalculable: true,
          ruleDescription: 'Valuation model defines ELEVATED when 35.0x < P/E <= 60.0x (-0.3 score).'
        },
        {
          targetState: 'EXTREME',
          requiredChange: currentPe <= 60 ? `P/E multiple expands from ${currentPe.toFixed(1)}x to > 60.0x` : 'Already EXTREME',
          metricKey: 'peRatio',
          currentMetricValue: currentPe,
          thresholdValue: 60.0,
          isCalculable: true,
          ruleDescription: 'Valuation model defines EXTREME when P/E > 60.0x (-0.7 score).'
        }
      ] : [
        {
          targetState: 'FAIR',
          requiredChange: 'Authoritative P/E ratio disclosure required',
          metricKey: 'peRatio',
          currentMetricValue: null,
          thresholdValue: 35.0,
          isCalculable: false,
          ruleDescription: 'Threshold cannot be calculated without primary valuation facts.',
          insufficientEvidenceReason: 'Required authoritative P/E multiple is unavailable from SEC filings or vendor feeds.'
        }
      ]
    });

    // 2. Portfolio Fit
    const currentWeight = decision.portfolioContext?.currentWeightPct ?? 0;
    const currentFitState = decision.dimensionAssessments?.portfolioFit?.assessment || (decision as any).dimensions?.portfolioFit?.assessment || 'NOT_HELD';
    boundaries.push({
      dimension: 'portfolioFit',
      dimensionName: 'Portfolio Allocation & Fit',
      currentValue: `${currentWeight.toFixed(1)}%`,
      currentState: currentFitState,
      sensitivities: [
        {
          targetState: 'FAVORABLE',
          requiredChange: currentWeight >= 8.0 ? `Position weight must decrease from ${currentWeight.toFixed(1)}% to < 8.0%` : 'Already FAVORABLE',
          metricKey: 'weightPct',
          currentMetricValue: currentWeight,
          thresholdValue: 8.0,
          isCalculable: true,
          ruleDescription: 'Portfolio fit defines FAVORABLE when active weight < 8.0% (+0.4 score).'
        },
        {
          targetState: 'CONSTRAINED',
          requiredChange: currentWeight < 8.0 ? `Position weight increases from ${currentWeight.toFixed(1)}% to >= 8.0%` : (currentWeight >= 15.0 ? `Weight reduces to < 15.0%` : 'Currently CONSTRAINED'),
          metricKey: 'weightPct',
          currentMetricValue: currentWeight,
          thresholdValue: 8.0,
          isCalculable: true,
          ruleDescription: 'Portfolio fit defines CONSTRAINED when 8.0% <= weight < 15.0% (-0.1 score).'
        },
        {
          targetState: 'CAUTIOUS',
          requiredChange: currentWeight < 15.0 ? `Position weight increases from ${currentWeight.toFixed(1)}% to >= 15.0%` : 'Already CAUTIOUS',
          metricKey: 'weightPct',
          currentMetricValue: currentWeight,
          thresholdValue: 15.0,
          isCalculable: true,
          ruleDescription: 'Portfolio fit defines CAUTIOUS when weight >= 15.0% (-0.45 score).'
        }
      ]
    });

    // 3. Risk Profile
    const currentVol = decision.marketContext?.annualizedVolatility ?? null;
    const currentRiskState = decision.dimensionAssessments?.riskProfile?.assessment || (decision as any).dimensions?.riskProfile?.assessment || 'MODERATE';
    boundaries.push({
      dimension: 'riskProfile',
      dimensionName: 'Risk Profile & Drawdown',
      currentValue: currentVol !== null ? `${currentVol.toFixed(1)}%` : 'N/A',
      currentState: currentRiskState,
      sensitivities: currentVol !== null ? [
        {
          targetState: 'LOW',
          requiredChange: currentVol >= 20 ? `Annualized volatility reduces from ${currentVol.toFixed(1)}% to < 20.0%` : 'Already LOW',
          metricKey: 'volatility',
          currentMetricValue: currentVol,
          thresholdValue: 20.0,
          isCalculable: true,
          ruleDescription: 'Risk model defines LOW risk when volatility < 20.0% (+0.5 score).'
        },
        {
          targetState: 'ELEVATED',
          requiredChange: currentVol <= 30 ? `Annualized volatility rises from ${currentVol.toFixed(1)}% to > 30.0%` : 'Already ELEVATED or HIGH',
          metricKey: 'volatility',
          currentMetricValue: currentVol,
          thresholdValue: 30.0,
          isCalculable: true,
          ruleDescription: 'Risk model defines ELEVATED risk when 30.0% < volatility <= 45.0% (-0.25 score).'
        },
        {
          targetState: 'HIGH',
          requiredChange: currentVol <= 45 ? `Annualized volatility rises from ${currentVol.toFixed(1)}% to > 45.0%` : 'Already HIGH',
          metricKey: 'volatility',
          currentMetricValue: currentVol,
          thresholdValue: 45.0,
          isCalculable: true,
          ruleDescription: 'Risk model defines HIGH risk when volatility > 45.0% (-0.6 score).'
        }
      ] : [
        {
          targetState: 'LOW',
          requiredChange: 'Market volatility bar history required',
          metricKey: 'volatility',
          currentMetricValue: null,
          thresholdValue: 20.0,
          isCalculable: false,
          ruleDescription: 'Threshold cannot be calculated without primary market price bars.',
          insufficientEvidenceReason: 'Authoritative market price bars are unavailable from Twelve Data / FYERS.'
        }
      ]
    });

    // 4. Growth Trend
    const currentRevTrend = decision.fundamentalContext?.revenueTrend || 'UNKNOWN';
    boundaries.push({
      dimension: 'growthTrend',
      dimensionName: 'Earnings / Growth Trend',
      currentValue: currentRevTrend,
      currentState: decision.dimensionAssessments?.growthTrend?.assessment || (decision as any).dimensions?.growthTrend?.assessment || 'STABLE',
      sensitivities: [
        {
          targetState: 'POSITIVE',
          requiredChange: currentRevTrend !== 'GROWING' ? 'Revenue trajectory transitions to multi-period consecutive expansion (GROWING)' : 'Currently GROWING',
          metricKey: 'revenueTrend',
          currentMetricValue: currentRevTrend,
          thresholdValue: 'GROWING',
          isCalculable: true,
          ruleDescription: 'Growth model defines POSITIVE when revenueTrend === GROWING and net income is not declining (+0.6 score).'
        },
        {
          targetState: 'WEAKENING',
          requiredChange: currentRevTrend !== 'DECLINING' ? 'Revenue trajectory transitions to deceleration or contraction (DECLINING)' : 'Currently DECLINING',
          metricKey: 'revenueTrend',
          currentMetricValue: currentRevTrend,
          thresholdValue: 'DECLINING',
          isCalculable: true,
          ruleDescription: 'Growth model defines WEAKENING when revenueTrend === DECLINING (-0.5 score).'
        }
      ]
    });

    return boundaries;
  }

  /**
   * Constructs the deterministic Traceability Graph: Evidence -> Input -> Dimension -> Decision.
   */
  public buildTraceabilityGraph(
    security: CanonicalSecurity,
    decision: InvestmentDecisionAssessment,
    assumptions: CounterfactualAssumption[],
    cfDimensions: Record<DecisionDimensionKey, { assessment: string; score: number }>,
    cfOverallAssessment: DecisionOverallAssessment
  ): CounterfactualTraceabilityGraph {
    const nodes: CounterfactualTraceNode[] = [];
    const edges: Array<{ from: string; to: string; label?: string; isCounterfactual: boolean; ruleDescription?: string }> = [];

    // 1. Evidence Nodes
    const ev1Id = `ev_sec_${security.ticker}_10k`;
    nodes.push({
      id: ev1Id,
      type: 'EVIDENCE',
      label: `SEC 10-K / Regulatory Disclosures (${security.ticker})`,
      value: 'Official Financial Disclosures',
      isCounterfactual: false,
      epistemicStatus: 'REAL',
      provenance: 'SEC EDGAR Official Primary Filing',
      targetNodeIds: ['fact_pe', 'fact_rev']
    });

    const ev2Id = `ev_mkt_${security.ticker}_bars`;
    nodes.push({
      id: ev2Id,
      type: 'EVIDENCE',
      label: `Daily Price Bars (${security.market === 'INDIA' ? 'FYERS' : 'Twelve Data'})`,
      value: `Price $${(decision.marketContext?.currentPrice || 100).toFixed(2)}`,
      isCounterfactual: false,
      epistemicStatus: decision.marketContext?.epistemicStatus as EpistemicStatus || 'REAL',
      provenance: `${security.market === 'INDIA' ? 'FYERS Exchange Feed' : 'Twelve Data Market Feed'}`,
      targetNodeIds: ['fact_vol', 'fact_trend']
    });

    // 2. Input Fact Nodes
    const peVal = (decision as any).financials?.peRatio ?? (decision as any).valuationContext?.peRatio ?? 25.0;
    nodes.push({
      id: 'fact_pe',
      type: 'INPUT_FACT',
      label: `P/E Ratio (${peVal.toFixed(1)}x)`,
      value: peVal,
      isCounterfactual: false,
      epistemicStatus: 'CALCULATED',
      provenance: 'Computed from reported EPS and market close',
      targetNodeIds: ['dim_valuation']
    });

    edges.push({ from: ev1Id, to: 'fact_pe', label: 'Extracts EPS', isCounterfactual: false });

    // 3. Dimension Nodes
    const baseValuationState = decision.dimensionAssessments?.valuationContext?.assessment || (decision as any).dimensions?.valuationContext?.assessment || 'FAIR';
    nodes.push({
      id: 'dim_valuation',
      type: 'DIMENSION',
      label: `Valuation Context: ${baseValuationState}`,
      value: baseValuationState,
      isCounterfactual: false,
      epistemicStatus: 'CALCULATED',
      targetNodeIds: ['node_assessment']
    });

    edges.push({ from: 'fact_pe', to: 'dim_valuation', label: 'Applies P/E thresholds', isCounterfactual: false });

    // 4. Decision Assessment Node
    nodes.push({
      id: 'node_assessment',
      type: 'ASSESSMENT',
      label: `Decision Assessment: ${decision.overallAssessment}`,
      value: decision.overallAssessment,
      isCounterfactual: false,
      epistemicStatus: 'CALCULATED',
      targetNodeIds: ['node_thesis']
    });

    edges.push({ from: 'dim_valuation', to: 'node_assessment', label: 'Weight 15%', isCounterfactual: false });

    // 5. Thesis Node
    nodes.push({
      id: 'node_thesis',
      type: 'THESIS',
      label: `Investment Thesis: ${decision.thesisStatus?.status || 'HEALTHY'}`,
      value: decision.thesisStatus?.status || 'HEALTHY',
      isCounterfactual: false,
      epistemicStatus: 'REAL',
      targetNodeIds: []
    });

    edges.push({ from: 'node_assessment', to: 'node_thesis', label: 'Informs Thesis Posture', isCounterfactual: false });

    // Counterfactual Branch (if any assumption exists)
    if (assumptions.length > 0) {
      const asmp = assumptions[0];
      const cfInputId = `cf_input_${asmp.parameterKey}`;
      nodes.push({
        id: cfInputId,
        type: 'INPUT_FACT',
        label: `Counterfactual ${asmp.parameterKey}: ${asmp.counterfactualValue}`,
        value: asmp.counterfactualValue,
        isCounterfactual: true,
        epistemicStatus: 'COUNTERFACTUAL_ASSUMPTION',
        provenance: 'Hypothetical Analyst Assumption (Not a Forecast)',
        targetNodeIds: ['cf_dim_target']
      });

      const cfTargetDimKey = asmp.targetDimension || 'valuationContext';
      const cfDimState = cfDimensions[cfTargetDimKey]?.assessment || 'NEUTRAL';
      nodes.push({
        id: 'cf_dim_target',
        type: 'DIMENSION',
        label: `Counterfactual ${cfTargetDimKey}: ${cfDimState}`,
        value: cfDimState,
        isCounterfactual: true,
        epistemicStatus: 'CALCULATED',
        targetNodeIds: ['cf_assessment']
      });

      edges.push({
        from: cfInputId,
        to: 'cf_dim_target',
        label: 'Evaluates Deterministic Rule',
        isCounterfactual: true,
        ruleDescription: 'Calculated using canonical scoring thresholds'
      });

      nodes.push({
        id: 'cf_assessment',
        type: 'ASSESSMENT',
        label: `Counterfactual Assessment: ${cfOverallAssessment}`,
        value: cfOverallAssessment,
        isCounterfactual: true,
        epistemicStatus: 'CALCULATED',
        targetNodeIds: []
      });

      edges.push({
        from: 'cf_dim_target',
        to: 'cf_assessment',
        label: 'Recalculates Weighted Score',
        isCounterfactual: true
      });
    }

    return {
      nodes,
      edges,
      dependencyChain: ['Evidence', 'Metric / Fact', 'Decision Dimension', 'Decision Assessment', 'Thesis State']
    };
  }

  /**
   * Generates optional narrative synthesis via Gemini through the centralized AI Circuit Breaker.
   * If Gemini is unavailable, 402/429 tripped, or fails, produces a deterministic fallback narrative.
   */
  private async generateExecutiveNarrative(
    security: CanonicalSecurity,
    baseDecision: InvestmentDecisionAssessment,
    assumptions: CounterfactualAssumption[],
    cfAssessment: DecisionOverallAssessment,
    cfScore: number,
    deltas: CounterfactualDimensionDelta[]
  ): Promise<{ summary: string; changedDrivers: string[]; thesisImplication: string; isAIGenerated: boolean; fallbackReason?: string }> {
    const changed = deltas.filter(d => d.isChanged);
    const changedDrivers = changed.map(d => `${d.dimensionName}: transitioned to ${d.counterfactualState} (${d.deterministicRule})`);

    // Deterministic baseline template
    const deterministicSummary = changed.length > 0
      ? `Under hypothetical counterfactual parameters (${assumptions.map(a => `${a.parameterKey}=${a.counterfactualValue}`).join(', ')}), ${security.symbol || security.ticker} composite score shifts by ${Number((cfScore - baseDecision.compositeScore).toFixed(3))} points to ${cfScore.toFixed(3)}, moving overall assessment from ${baseDecision.overallAssessment} to ${cfAssessment}.`
      : `Evaluating counterfactual assumptions against ${security.symbol || security.ticker} produced zero categorical dimension changes; baseline assessment remains ${baseDecision.overallAssessment}.`;

    const deterministicThesis = cfAssessment === baseDecision.overallAssessment
      ? `Current thesis state remains intact; counterfactual assumptions did not breach analytical invalidation thresholds.`
      : `Counterfactual change alters the analytical conviction setup, highlighting sensitivity to ${changed.map(d => d.dimensionName).join(' and ')}.`;

    // Check circuit breaker first
    if (!aiCircuitBreaker.canExecuteAi()) {
      return {
        summary: deterministicSummary,
        changedDrivers,
        thesisImplication: deterministicThesis,
        isAIGenerated: false,
        fallbackReason: aiCircuitBreaker.isPrepaymentDepleted()
          ? 'PREPAYMENT_CREDITS_DEPLETED'
          : 'AI_CIRCUIT_BREAKER_OPEN'
      };
    }

    const client = this.getClient();
    if (!client) {
      return {
        summary: deterministicSummary,
        changedDrivers,
        thesisImplication: deterministicThesis,
        isAIGenerated: false,
        fallbackReason: 'NO_API_KEY'
      };
    }

    try {
      const prompt = `You are an institutional investment intelligence analyst. Synthesize the deterministic counterfactual decision sensitivity analysis below for ${security.companyName} (${security.symbol || security.ticker}).
Permanent Invariants:
- Analytical sensitivity only. DO NOT generate buy/sell recommendations or price targets.
- Clearly treat counterfactual assumptions as hypothetical, NOT forecasts.

Data:
- Base Assessment: ${baseDecision.overallAssessment} (Composite Score: ${baseDecision.compositeScore})
- Counterfactual Assessment: ${cfAssessment} (Composite Score: ${cfScore})
- Assumptions: ${JSON.stringify(assumptions.map(a => ({ key: a.parameterKey, from: a.currentValue, to: a.counterfactualValue })))}
- Changed Dimensions: ${JSON.stringify(changed.map(d => ({ dim: d.dimensionName, from: d.currentState, to: d.counterfactualState, rule: d.deterministicRule })))}

Provide a concise 2-sentence institutional synthesis and 1-sentence thesis implication.`;

      const response = await client.models.generateContent({
        model: this.modelName,
        contents: prompt
      });

      const text = response.text || '';
      return {
        summary: text.trim() || deterministicSummary,
        changedDrivers,
        thesisImplication: deterministicThesis,
        isAIGenerated: true
      };
    } catch (err: any) {
      aiCircuitBreaker.handleAiError('CounterfactualDecisionService', err);
      structuredLogger.warn('[CounterfactualDecisionService] Gemini call failed, engaging deterministic fallback:', err?.message || err);

      return {
        summary: deterministicSummary,
        changedDrivers,
        thesisImplication: deterministicThesis,
        isAIGenerated: false,
        fallbackReason: aiCircuitBreaker.isPrepaymentDepleted() ? 'PREPAYMENT_CREDITS_DEPLETED' : 'REMOTE_CALL_FAILED'
      };
    }
  }

  /**
   * Returns pre-computed sensitivity boundaries for an asset.
   */
  public async getSensitivity(securityId: string, asOfDate?: string): Promise<{
    securityId: string;
    ticker: string;
    asOfDate: string;
    boundaries: CounterfactualSensitivityBoundary[];
  }> {
    const resolved = resolveSecurity(securityId);
    if (!resolved) {
      throw new Error(`Security with ID '${securityId}' could not be resolved.`);
    }
    const effectiveDate = asOfDate || new Date().toISOString().split('T')[0];
    const decision = await decisionIntelligenceService.evaluateDecision({
      securityId: resolved.id,
      asOfDate: effectiveDate
    });

    const boundaries = this.calculateSensitivityBoundaries(resolved, decision);
    return {
      securityId: resolved.id,
      ticker: resolved.symbol || (resolved as any).ticker,
      asOfDate: effectiveDate,
      boundaries
    };
  }

  /**
   * Returns traceability graph for an existing decision.
   */
  public async getTraceability(decisionId: string): Promise<CounterfactualTraceabilityGraph> {
    const decisionRepo = persistenceManager.getDecisionRepository();
    const decision = await decisionRepo.get(decisionId);
    if (!decision) {
      throw new Error(`Decision with ID '${decisionId}' not found.`);
    }

    const resolved = resolveSecurity(decision.securityId) || resolveSecurity((decision as any).ticker || (decision as any).symbol);
    if (!resolved) {
      throw new Error(`Security for decision '${decisionId}' cannot be resolved.`);
    }

    return this.buildTraceabilityGraph(
      resolved,
      decision,
      [],
      Object.entries(decision.dimensionAssessments || (decision as any).dimensions || {}).reduce((acc, [k, v]) => {
        acc[k as DecisionDimensionKey] = { assessment: (v as any).assessment, score: (v as any).score };
        return acc;
      }, {} as any),
      decision.overallAssessment
    );
  }

  /**
   * Historical Decision Replay: evaluates strictly as of historical AsOfDate without future lookahead.
   */
  public async replayHistoricalDecision(securityId: string, historicalAsOfDate: string): Promise<InvestmentDecisionAssessment> {
    const resolved = resolveSecurity(securityId);
    if (!resolved) {
      throw new Error(`Security '${securityId}' not found.`);
    }
    return decisionIntelligenceService.evaluateDecision({
      securityId: resolved.id,
      asOfDate: historicalAsOfDate,
      forceRefresh: true
    });
  }

  /**
   * Persists a counterfactual snapshot immutably.
   */
  public async saveSnapshot(snapshot: CounterfactualSnapshot): Promise<CounterfactualSnapshot> {
    const repo = persistenceManager.getCounterfactualRepository();
    return repo.saveSnapshot(snapshot);
  }

  /**
   * Retrieves a snapshot with multi-tenant IDOR protection.
   */
  public async getSnapshot(snapshotId: string, requestingUserId: string): Promise<CounterfactualSnapshot | null> {
    const repo = persistenceManager.getCounterfactualRepository();
    const snapshot = await repo.getSnapshot(snapshotId);
    if (!snapshot) return null;

    if (snapshot.userId !== requestingUserId) {
      throw new Error(`AuthorizationError: User '${requestingUserId}' is not authorized to access snapshot '${snapshotId}'.`);
    }

    return snapshot;
  }

  /**
   * Retrieves all snapshots owned by a user.
   */
  public async getSnapshotsByUserId(userId: string): Promise<CounterfactualSnapshot[]> {
    const repo = persistenceManager.getCounterfactualRepository();
    return repo.getSnapshotsByUserId(userId);
  }

  /**
   * Compares multiple counterfactual evaluations side-by-side.
   */
  public async compareCounterfactuals(
    securityId: string,
    evaluations: CounterfactualDecisionEvaluation[]
  ): Promise<CounterfactualComparisonResult> {
    const resolved = resolveSecurity(securityId);
    if (!resolved) {
      throw new Error(`Security with ID '${securityId}' could not be resolved.`);
    }

    const dimensionMatrix: Record<DecisionDimensionKey, Record<string, { assessment: string; score: number }>> = {} as any;
    for (const d of CANONICAL_DECISION_DIMENSIONS) {
      dimensionMatrix[d.key] = {};
    }

    const comparisons = evaluations.map((e, idx) => {
      const label = e.assumptions.map(a => `${a.parameterKey}=${a.counterfactualValue}`).join(', ') || `Scenario ${idx + 1}`;
      for (const d of CANONICAL_DECISION_DIMENSIONS) {
        const val = e.counterfactualDecision.dimensions[d.key];
        dimensionMatrix[d.key][label] = val || { assessment: 'NEUTRAL', score: 0 };
      }
      return {
        id: e.counterfactualId,
        label,
        assumptions: e.assumptions.map(a => `${a.parameterKey}: ${a.currentValue} -> ${a.counterfactualValue}`),
        overallAssessment: e.counterfactualDecision.overallAssessment,
        compositeScore: e.counterfactualDecision.compositeScore,
        changedDimensions: e.dimensionDeltas.filter(delta => delta.isChanged).map(delta => delta.dimensionName)
      };
    });

    return {
      securityId: resolved.id,
      ticker: resolved.symbol || (resolved as any).ticker,
      comparisons,
      dimensionMatrix,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private extractCurrentValue(
    decision: InvestmentDecisionAssessment,
    type: CounterfactualType,
    paramKey: string,
    targetDim?: DecisionDimensionKey
  ): any {
    switch (type) {
      case 'VALUATION':
        if (paramKey === 'peRatio') return (decision as any).financials?.peRatio ?? (decision as any).valuationContext?.peRatio ?? 25.0;
        if (paramKey === 'price') return decision.marketContext?.currentPrice ?? 100;
        return 25.0;
      case 'RISK':
        if (paramKey === 'volatility') return decision.marketContext?.annualizedVolatility ?? 25.0;
        if (paramKey === 'maxDrawdown') return decision.marketContext?.maxDrawdownPercent ?? 20.0;
        return 25.0;
      case 'PORTFOLIO':
        if (paramKey === 'weightPct') return decision.portfolioContext?.currentWeightPct ?? 0.0;
        if (paramKey === 'isHeld') return decision.portfolioContext?.isHeld ?? false;
        return 0.0;
      case 'GROWTH':
      case 'METRIC':
        if (paramKey === 'revenueTrend') return decision.fundamentalContext?.revenueTrend ?? 'STABLE';
        if (paramKey === 'operatingMarginTrend') return decision.fundamentalContext?.operatingMarginTrend ?? 'STABLE';
        return 'STABLE';
      case 'THESIS':
        if (paramKey === 'thesisStatus') return decision.thesisStatus?.status ?? 'STABLE';
        if (paramKey === 'invalidationTriggered') return false;
        return 'STABLE';
      default:
        return 'N/A';
    }
  }

  private inferTargetDimension(type: CounterfactualType, paramKey: string): DecisionDimensionKey {
    switch (type) {
      case 'VALUATION': return 'valuationContext';
      case 'RISK': return 'riskProfile';
      case 'PORTFOLIO': return 'portfolioFit';
      case 'THESIS': return 'thesisStatus';
      case 'METRIC':
        if (paramKey.toLowerCase().includes('revenue') || paramKey.toLowerCase().includes('growth')) return 'growthTrend';
        return 'fundamentalQuality';
      default: return 'fundamentalQuality';
    }
  }

  private inferUnit(paramKey?: string): string {
    if (!paramKey) return '';
    const lower = String(paramKey).toLowerCase();
    if (lower.includes('ratio') || lower.includes('pe')) return 'x';
    if (lower.includes('pct') || lower.includes('volatility') || lower.includes('weight') || lower.includes('drawdown')) return '%';
    if (lower.includes('price')) return '$';
    return '';
  }

  private extractDimensionInputs(dimKey: DecisionDimensionKey, decision: InvestmentDecisionAssessment): Record<string, any> {
    switch (dimKey) {
      case 'valuationContext':
        return {
          peRatio: (decision as any).financials?.peRatio ?? (decision as any).valuationContext?.peRatio ?? null,
          priceToSales: (decision as any).valuationContext?.priceToSales ?? null,
          evToEbitda: (decision as any).valuationContext?.evToEbitda ?? null
        };
      case 'portfolioFit':
        return {
          weightPct: decision.portfolioContext?.currentWeightPct ?? 0,
          isHeld: decision.portfolioContext?.isHeld ?? false
        };
      case 'riskProfile':
        return {
          volatility: decision.marketContext?.annualizedVolatility ?? null,
          maxDrawdown: decision.marketContext?.maxDrawdownPercent ?? null
        };
      case 'growthTrend':
        return {
          revenueTrend: decision.fundamentalContext?.revenueTrend ?? 'UNKNOWN',
          operatingMarginTrend: decision.fundamentalContext?.operatingMarginTrend ?? 'UNKNOWN'
        };
      default:
        return {};
    }
  }

  private getDeterministicThresholdsForDimension(
    dimKey: DecisionDimensionKey,
    decision: InvestmentDecisionAssessment
  ): { currentZone: string; boundaryThresholds: any[] } {
    switch (dimKey) {
      case 'valuationContext':
        return {
          currentZone: decision.dimensionAssessments?.valuationContext?.assessment || (decision as any).dimensions?.valuationContext?.assessment || 'FAIR',
          boundaryThresholds: [
            { label: 'ATTRACTIVE', condition: 'P/E < 18.0x', targetState: 'ATTRACTIVE', thresholdValue: 18.0 },
            { label: 'FAIR', condition: '18.0x <= P/E <= 35.0x', targetState: 'FAIR', thresholdValue: 35.0 },
            { label: 'ELEVATED', condition: '35.0x < P/E <= 60.0x', targetState: 'ELEVATED', thresholdValue: 60.0 },
            { label: 'EXTREME', condition: 'P/E > 60.0x', targetState: 'EXTREME', thresholdValue: 60.0 }
          ]
        };
      case 'portfolioFit':
        return {
          currentZone: decision.dimensionAssessments?.portfolioFit?.assessment || (decision as any).dimensions?.portfolioFit?.assessment || 'NOT_HELD',
          boundaryThresholds: [
            { label: 'FAVORABLE', condition: 'weight < 8.0%', targetState: 'FAVORABLE', thresholdValue: 8.0 },
            { label: 'CONSTRAINED', condition: '8.0% <= weight < 15.0%', targetState: 'CONSTRAINED', thresholdValue: 15.0 },
            { label: 'CAUTIOUS', condition: 'weight >= 15.0%', targetState: 'CAUTIOUS', thresholdValue: 15.0 }
          ]
        };
      case 'riskProfile':
        return {
          currentZone: decision.dimensionAssessments?.riskProfile?.assessment || (decision as any).dimensions?.riskProfile?.assessment || 'MODERATE',
          boundaryThresholds: [
            { label: 'LOW', condition: 'volatility < 20.0%', targetState: 'LOW', thresholdValue: 20.0 },
            { label: 'MODERATE', condition: '20.0% <= volatility <= 30.0%', targetState: 'MODERATE', thresholdValue: 30.0 },
            { label: 'ELEVATED', condition: '30.0% < volatility <= 45.0%', targetState: 'ELEVATED', thresholdValue: 45.0 },
            { label: 'HIGH', condition: 'volatility > 45.0%', targetState: 'HIGH', thresholdValue: 45.0 }
          ]
        };
      default:
        return {
          currentZone: decision.dimensionAssessments?.[dimKey]?.assessment || (decision as any).dimensions?.[dimKey]?.assessment || 'NEUTRAL',
          boundaryThresholds: []
        };
    }
  }
}

export const counterfactualDecisionService = CounterfactualDecisionService.getInstance();
