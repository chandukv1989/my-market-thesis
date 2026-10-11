/**
 * Decision Delta Engine (Phase 23)
 * 
 * Computes deterministic deltas and historical timeline milestones across
 * immutable investment decision assessments.
 * 
 * Strict Invariants:
 * 1. Historical decisions are retrieved from persistence exactly as stored.
 * 2. They are NEVER regenerated with current market data.
 * 3. Dimension delta attribution is purely deterministic and factual.
 * 4. Analytical only; zero broker execution.
 */

import { canRead } from '../../auth/accessPolicy';
import {
  InvestmentDecisionAssessment,
  DecisionDelta,
  DecisionTimelineMilestone,
  DecisionTimelineResponse,
  DimensionDeltaItem,
  DimensionDeltaClassification,
  DecisionDimensionKey,
  DecisionKeyRisk,
  DecisionCatalyst
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { resolveSecurity } from '../../../src/data/canonicalSecurities';

const CANONICAL_DIMENSIONS: Array<{ key: DecisionDimensionKey; name: string }> = [
  { key: 'fundamentalQuality', name: 'Fundamental Quality' },
  { key: 'growthTrend', name: 'Growth Trend' },
  { key: 'valuationContext', name: 'Valuation Context' },
  { key: 'marketTrend', name: 'Market Trend & Technicals' },
  { key: 'quantitativeSignal', name: 'Quantitative Model Signal' },
  { key: 'backtestContext', name: 'Strategy Backtest Profile' },
  { key: 'riskProfile', name: 'Risk Profile & Drawdown' },
  { key: 'portfolioFit', name: 'Portfolio Allocation & Fit' },
  { key: 'evidenceCoverage', name: 'Evidence Quality & Coverage' },
  { key: 'thesisStatus', name: 'Investment Thesis Status' }
];

export class DecisionDeltaEngine {
  /**
   * Retrieves the chronological historical decision milestones for a security.
   * Records are retrieved strictly from persistence without regeneration.
   */
  public async getTimeline(securityId: string, ownerUserId?: string): Promise<DecisionTimelineResponse> {
    const resolved = resolveSecurity(securityId);
    if (!resolved) {
      throw new Error(`Unknown or non-canonical security ID: ${securityId}`);
    }

    const decisionRepo = persistenceManager.getDecisionRepository();
    
    // Query history by security ID and symbol
    // Phase 38.2A: when an owner scope is supplied (all HTTP callers) only that owner's assessments are read.
    const readHistory = (id: string) => ownerUserId
      ? decisionRepo.getHistoryForOwner(id, ownerUserId)
      : decisionRepo.getHistory(id);
    const historyA = await readHistory(resolved.id);
    const historyB = resolved.id !== resolved.symbol
      ? await readHistory(resolved.symbol)
      : [];

    // Combine and deduplicate by decisionId
    const seenIds = new Set<string>();
    const combined: InvestmentDecisionAssessment[] = [];

    for (const d of [...historyA, ...historyB]) {
      if (d && d.decisionId && !seenIds.has(d.decisionId)) {
        seenIds.add(d.decisionId);
        combined.push(d);
      }
    }

    // Sort chronologically descending (newest to oldest)
    combined.sort((a, b) => {
      const dateCompare = (b.asOfDate || '').localeCompare(a.asOfDate || '');
      if (dateCompare !== 0) return dateCompare;
      return (b.generatedAt || '').localeCompare(a.generatedAt || '');
    });

    const milestones: DecisionTimelineMilestone[] = combined.map(d => {
      const activeGuards = (d.invalidationConditions || []).filter(c => c.status === 'ACTIVE_GUARD').length;
      const triggeredGuards = (d.invalidationConditions || []).filter(c => c.status === 'TRIGGERED').length;

      return {
        decisionId: d.decisionId,
        securityId: d.securityId || resolved.id,
        asOfDate: d.asOfDate,
        generatedAt: d.generatedAt,
        compositeScore: d.compositeScore,
        overallAssessment: d.overallAssessment,
        conviction: d.conviction,
        thesisStatus: d.thesisStatus?.status || 'NO_PRIOR_THESIS',
        invalidationStatus: {
          totalConditions: (d.invalidationConditions || []).length,
          activeGuards,
          triggeredGuards
        },
        evidenceCoverage: {
          rating: d.evidenceCoverage?.rating || 'LIMITED',
          totalEvidenceCount: d.evidenceCoverage?.totalEvidenceCount || 0
        },
        topDrivers: d.keyDrivers && d.keyDrivers.length > 0
          ? d.keyDrivers.slice(0, 3)
          : ['Core business execution and financial performance'],
        frameworkVersion: d.frameworkVersion || '1.0.0'
      };
    });

    return {
      securityId: resolved.id,
      canonicalSecurity: resolved,
      milestones,
      totalMilestones: milestones.length,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Calculates a pure deterministic delta between two historical decision assessments.
   */
  public calculateDelta(
    decisionBefore: InvestmentDecisionAssessment,
    decisionAfter: InvestmentDecisionAssessment
  ): DecisionDelta {
    const overallScoreBefore = decisionBefore.compositeScore;
    const overallScoreAfter = decisionAfter.compositeScore;
    const overallScoreDelta = parseFloat((overallScoreAfter - overallScoreBefore).toFixed(4));

    // 1. Canonical Dimension Deltas
    const dimensionDeltas: DimensionDeltaItem[] = CANONICAL_DIMENSIONS.map(({ key, name }) => {
      const dimBefore = decisionBefore.dimensionAssessments ? decisionBefore.dimensionAssessments[key] : undefined;
      const dimAfter = decisionAfter.dimensionAssessments ? decisionAfter.dimensionAssessments[key] : undefined;

      const scoreBefore = dimBefore && typeof dimBefore.score === 'number' && !isNaN(dimBefore.score)
        ? dimBefore.score
        : null;
      const scoreAfter = dimAfter && typeof dimAfter.score === 'number' && !isNaN(dimAfter.score)
        ? dimAfter.score
        : null;

      let classification: DimensionDeltaClassification = 'UNCHANGED';
      let delta = 0;
      let rationaleChange = '';

      if (scoreBefore === null && scoreAfter !== null) {
        classification = 'NEW';
        delta = scoreAfter;
        rationaleChange = `Dimension newly evaluated at score ${scoreAfter.toFixed(2)}`;
      } else if (scoreBefore !== null && scoreAfter === null) {
        classification = 'REMOVED';
        delta = -scoreBefore;
        rationaleChange = `Dimension previously evaluated at score ${scoreBefore.toFixed(2)} is now unavailable`;
      } else if (scoreBefore === null && scoreAfter === null) {
        classification = 'UNAVAILABLE';
        delta = 0;
        rationaleChange = 'Dimension unavailable in both assessments';
      } else if (scoreBefore !== null && scoreAfter !== null) {
        delta = parseFloat((scoreAfter - scoreBefore).toFixed(4));
        if (Math.abs(delta) < 0.001) {
          classification = 'UNCHANGED';
          rationaleChange = `Score remained constant at ${scoreBefore.toFixed(2)}`;
        } else if (delta > 0) {
          classification = 'IMPROVED';
          rationaleChange = `Score improved by +${delta.toFixed(2)} (from ${scoreBefore.toFixed(2)} to ${scoreAfter.toFixed(2)})`;
        } else {
          classification = 'DECLINED';
          rationaleChange = `Score declined by ${delta.toFixed(2)} (from ${scoreBefore.toFixed(2)} to ${scoreAfter.toFixed(2)})`;
        }
      }

      return {
        dimension: key,
        dimensionName: name,
        scoreBefore,
        scoreAfter,
        delta,
        assessmentBefore: dimBefore?.assessment,
        assessmentAfter: dimAfter?.assessment,
        classification,
        rationaleChange
      };
    });

    // 2. Changed Drivers
    const beforeDrivers = decisionBefore.keyDrivers || [];
    const afterDrivers = decisionAfter.keyDrivers || [];
    const changedDrivers = {
      added: afterDrivers.filter(d => !beforeDrivers.includes(d)),
      removed: beforeDrivers.filter(d => !afterDrivers.includes(d)),
      retained: afterDrivers.filter(d => beforeDrivers.includes(d))
    };

    // 3. Changed Risks
    const beforeRisks = decisionBefore.keyRisks || [];
    const afterRisks = decisionAfter.keyRisks || [];
    const beforeRiskDescs = new Set(beforeRisks.map(r => r.description.toLowerCase().trim()));
    const afterRiskDescs = new Set(afterRisks.map(r => r.description.toLowerCase().trim()));

    const changedRisks = {
      added: afterRisks.filter(r => !beforeRiskDescs.has(r.description.toLowerCase().trim())),
      removed: beforeRisks.filter(r => !afterRiskDescs.has(r.description.toLowerCase().trim())),
      retained: afterRisks.filter(r => beforeRiskDescs.has(r.description.toLowerCase().trim()))
    };

    // 4. Changed Catalysts
    const beforeCatalysts = decisionBefore.catalysts || [];
    const afterCatalysts = decisionAfter.catalysts || [];
    const beforeCatTitles = new Set(beforeCatalysts.map(c => c.title.toLowerCase().trim()));
    const afterCatTitles = new Set(afterCatalysts.map(c => c.title.toLowerCase().trim()));

    const changedCatalysts = {
      added: afterCatalysts.filter(c => !beforeCatTitles.has(c.title.toLowerCase().trim())),
      removed: beforeCatalysts.filter(c => !afterCatTitles.has(c.title.toLowerCase().trim())),
      retained: afterCatalysts.filter(c => beforeCatTitles.has(c.title.toLowerCase().trim()))
    };

    // 5. Invalidation Condition Changes
    const beforeGuards = decisionBefore.invalidationConditions || [];
    const afterGuards = decisionAfter.invalidationConditions || [];
    const guardMap = new Map<string, { before?: typeof beforeGuards[0]; after?: typeof afterGuards[0] }>();

    for (const g of beforeGuards) {
      const key = g.conditionId || g.condition;
      guardMap.set(key, { before: g });
    }
    for (const g of afterGuards) {
      const key = g.conditionId || g.condition;
      const existing = guardMap.get(key) || {};
      existing.after = g;
      guardMap.set(key, existing);
    }

    const invalidationChanges: DecisionDelta['invalidationChanges'] = [];
    for (const [key, { before, after }] of guardMap.entries()) {
      const statusBefore = before?.status || 'NOT_APPLICABLE';
      const statusAfter = after?.status || 'NOT_APPLICABLE';
      let transition: 'TRIGGERED' | 'RECOVERED' | 'UNCHANGED' = 'UNCHANGED';

      if (statusBefore === 'ACTIVE_GUARD' && statusAfter === 'TRIGGERED') {
        transition = 'TRIGGERED';
      } else if (statusBefore === 'TRIGGERED' && statusAfter === 'ACTIVE_GUARD') {
        transition = 'RECOVERED';
      }

      invalidationChanges.push({
        conditionId: key,
        condition: after?.condition || before?.condition || key,
        statusBefore,
        statusAfter,
        transition
      });
    }

    // 6. Evidence Coverage Changes
    const covBefore = {
      rating: decisionBefore.evidenceCoverage?.rating || 'LIMITED',
      totalEvidenceCount: decisionBefore.evidenceCoverage?.totalEvidenceCount || 0
    };
    const covAfter = {
      rating: decisionAfter.evidenceCoverage?.rating || 'LIMITED',
      totalEvidenceCount: decisionAfter.evidenceCoverage?.totalEvidenceCount || 0
    };

    const beforeCats = decisionBefore.evidenceCoverage?.availableCategories || [];
    const afterCats = decisionAfter.evidenceCoverage?.availableCategories || [];
    const addedCategories = afterCats.filter(c => !beforeCats.includes(c));
    const removedCategories = beforeCats.filter(c => !afterCats.includes(c));

    const evidenceChanges = {
      totalDelta: covAfter.totalEvidenceCount - covBefore.totalEvidenceCount,
      addedCategories,
      removedCategories
    };

    return {
      securityId: decisionAfter.securityId || decisionBefore.securityId,
      fromDecisionId: decisionBefore.decisionId,
      toDecisionId: decisionAfter.decisionId,
      fromAsOfDate: decisionBefore.asOfDate,
      toAsOfDate: decisionAfter.asOfDate,
      overallScoreBefore,
      overallScoreAfter,
      overallScoreDelta,
      assessmentBefore: decisionBefore.overallAssessment,
      assessmentAfter: decisionAfter.overallAssessment,
      convictionBefore: decisionBefore.conviction,
      convictionAfter: decisionAfter.conviction,
      dimensionDeltas,
      changedDrivers,
      changedRisks,
      changedCatalysts,
      thesisStatusBefore: decisionBefore.thesisStatus?.status || 'NO_PRIOR_THESIS',
      thesisStatusAfter: decisionAfter.thesisStatus?.status || 'NO_PRIOR_THESIS',
      invalidationChanges,
      evidenceCoverageBefore: covBefore,
      evidenceCoverageAfter: covAfter,
      evidenceChanges,
      generatedAt: new Date().toISOString(),
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Retrieves two specific historical decisions and computes their deterministic delta.
   */
  public async getDeltaBetweenDecisions(
    securityId: string,
    fromDecisionId: string,
    toDecisionId: string,
    ownerUserId?: string
  ): Promise<DecisionDelta> {
    const decisionRepo = persistenceManager.getDecisionRepository();
    const [rawBefore, rawAfter] = await Promise.all([
      decisionRepo.get(fromDecisionId),
      decisionRepo.get(toDecisionId)
    ]);
    // Phase 38.2A: with an owner scope, a decision the caller does not own is indistinguishable from a missing one.
    const visible = (d: InvestmentDecisionAssessment | null) =>
      d && (!ownerUserId || canRead(d as any, ownerUserId)) ? d : null;
    const decBefore = visible(rawBefore);
    const decAfter = visible(rawAfter);

    if (!decBefore) {
      throw new Error(`Historical decision assessment not found for ID: ${fromDecisionId}`);
    }
    if (!decAfter) {
      throw new Error(`Historical decision assessment not found for ID: ${toDecisionId}`);
    }

    return this.calculateDelta(decBefore, decAfter);
  }

  /**
   * Computes the deterministic delta between a decision and its chronologically previous decision.
   */
  public async getAdjacentDelta(securityId: string, toDecisionId: string, ownerUserId?: string): Promise<DecisionDelta | null> {
    const timeline = await this.getTimeline(securityId, ownerUserId);
    const milestones = timeline.milestones;
    const targetIdx = milestones.findIndex(m => m.decisionId === toDecisionId);

    if (targetIdx === -1) {
      throw new Error(`Target decision ${toDecisionId} not found in historical timeline for ${securityId}`);
    }

    if (targetIdx === 0) {
      return null; // Baseline milestone: no prior historical decision
    }

    const prevMilestone = milestones[targetIdx - 1];
    return this.getDeltaBetweenDecisions(securityId, prevMilestone.decisionId, toDecisionId, ownerUserId);
  }
}

export const decisionDeltaEngine = new DecisionDeltaEngine();
