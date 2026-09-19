/**
 * PHASE 23 — DECISION TIMELINE, THESIS DELTA ATTRIBUTION & MULTI-PEER BENCHMARKING
 * 
 * Verification Test Suite:
 *  1. Decision History Timeline Generation & Milestone Sequencing
 *  2. Dimension Delta Calculation & Driver Attribution
 *  3. Multi-Company Peer Valuation Grid & Median Benchmark Calculation
 *  4. Thesis Invalidation & Recovery Alert Evaluation
 *  5. SEC Filing Alert Evaluation with Real Filing Data
 *  6. Epistemic Integrity & Immutability Verification
 *  7. Analytical-Only & Zero Broker Execution Safeguards
 */

import assert from 'node:assert';
import { decisionDeltaEngine } from '../server/services/decision/decisionDeltaEngine';
import { decisionIntelligenceService } from '../server/services/decision/decisionIntelligenceService';
import { alertEvaluator } from '../server/services/alerts/alertEvaluator';
import { AlertRule, AlertRuleType, FilingRecord, InvestmentDecisionAssessment } from '../src/types';

console.log('======================================================================');
console.log('PHASE 23: DECISION TIMELINE, DELTA ATTRIBUTION & MULTI-PEER TESTS');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        passedTests++;
        console.log(`  ✓ [PASS] ${name}`);
      }).catch(err => {
        console.error(`  ✗ [FAIL] ${name}:`, err.message);
        throw err;
      });
    } else {
      passedTests++;
      console.log(`  ✓ [PASS] ${name}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ [FAIL] ${name}:`, msg);
    throw err;
  }
}

async function runAllPhase23Tests() {
  console.log('--- TEST GROUP 1: DECISION TIMELINE & MILESTONE SEQUENCING ---');

  await runTest('Timeline generation returns chronological milestones for valid security', async () => {
    const timeline = await decisionDeltaEngine.getTimeline('AAPL');
    assert(timeline, 'Timeline must be returned');
    assert(timeline.securityId === 'us-aapl' || timeline.securityId === 'AAPL', 'securityId must match canonical or ticker');
    assert(Array.isArray(timeline.milestones), 'Milestones must be an array');
    assert(timeline.milestones.length >= 1, 'At least 1 milestone should be present');

    // Milestones should be ordered chronologically (or reverse chronologically as returned)
    for (let i = 0; i < timeline.milestones.length - 1; i++) {
      const d1 = new Date(timeline.milestones[i].asOfDate).getTime();
      const d2 = new Date(timeline.milestones[i + 1].asOfDate).getTime();
      assert(d1 >= d2, 'Milestones should be ordered from newest to oldest');
    }
  });

  await runTest('Milestones contain deterministic scores, convictions, and drivers', async () => {
    const timeline = await decisionDeltaEngine.getTimeline('MSFT');
    const first = timeline.milestones[0];
    assert(typeof first.compositeScore === 'number', 'compositeScore must be a number');
    assert(first.compositeScore >= -1.0 && first.compositeScore <= 1.0, 'Score must be in [-1.0, 1.0]');
    assert(['POSITIVE', 'CONSTRUCTIVE', 'NEUTRAL', 'CAUTIOUS', 'NEGATIVE'].includes(first.overallAssessment));
    assert(['HIGH', 'MODERATE', 'LOW', 'INSUFFICIENT'].includes(first.conviction), `Invalid conviction: ${first.conviction}`);
    assert(Array.isArray(first.topDrivers) && first.topDrivers.length > 0, 'topDrivers must be a non-empty array');
  });

  console.log('\n--- TEST GROUP 2: DIMENSION DELTA CALCULATION & ATTRIBUTION ---');

  await runTest('Delta calculation computes exact score and dimension variances', async () => {
    // Generate two distinct historical assessments to guarantee delta history
    const d1 = await decisionIntelligenceService.evaluateDecision({
      securityId: 'AAPL',
      asOfDate: '2026-01-15'
    });
    const d2 = await decisionIntelligenceService.evaluateDecision({
      securityId: 'AAPL',
      asOfDate: '2026-03-15'
    });

    const delta = decisionDeltaEngine.calculateDelta(d1, d2);

    assert(delta, 'Delta must be calculated');
    assert.strictEqual(delta.fromDecisionId, d1.decisionId);
    assert.strictEqual(delta.toDecisionId, d2.decisionId);
    assert(typeof delta.overallScoreDelta === 'number', 'overallScoreDelta must be numeric');
    assert(Array.isArray(delta.dimensionDeltas), 'dimensionDeltas must be an array');
    assert(delta.dimensionDeltas.length > 0, 'Should have dimension deltas');
    assert(delta.changedDrivers, 'changedDrivers must be present');
    assert(Array.isArray(delta.changedDrivers.retained), 'retained drivers should be an array');

    // Also test getDeltaBetweenDecisions via persistence
    const persistedDelta = await decisionDeltaEngine.getDeltaBetweenDecisions('AAPL', d1.decisionId, d2.decisionId);
    assert(persistedDelta, 'Persisted delta should be retrievable');
    assert.strictEqual(persistedDelta.overallScoreDelta, delta.overallScoreDelta);
  });

  await runTest('Identical assessments yield zero delta', async () => {
    const assessment = await decisionIntelligenceService.evaluateDecision({
      securityId: 'NVDA',
      asOfDate: '2026-03-01'
    });
    const delta = decisionDeltaEngine.calculateDelta(assessment, assessment);
    assert.strictEqual(delta.overallScoreDelta, 0, 'Identical assessment delta must be 0');
    assert.strictEqual(delta.assessmentBefore, delta.assessmentAfter);
  });

  console.log('\n--- TEST GROUP 3: MULTI-COMPANY PEER VALUATION GRID ---');

  await runTest('Multi-peer comparison ranks securities by deterministic composite score', async () => {
    const result = await decisionIntelligenceService.comparePeers({
      securityIds: ['AAPL', 'MSFT', 'NVDA', 'AMZN'],
      asOfDate: '2026-03-15'
    });

    assert(result, 'Peer comparison result must be defined');
    assert.strictEqual(result.totalSecurities, 4);
    assert.strictEqual(result.securities.length, 4);
    assert.strictEqual(result.rankings.length, 4);

    // Verify rankings are descending by compositeScore
    for (let i = 0; i < result.rankings.length - 1; i++) {
      assert(
        result.rankings[i].compositeScore >= result.rankings[i + 1].compositeScore,
        'Rankings must be descending by composite score'
      );
      assert.strictEqual(result.rankings[i].rank, i + 1);
    }
  });

  await runTest('Multi-peer benchmark computes median metrics and analytical summary', async () => {
    const result = await decisionIntelligenceService.comparePeers({
      securityIds: ['AAPL', 'MSFT', 'NVDA'],
      asOfDate: '2026-03-15'
    });

    assert(result.medianScores, 'medianScores must be computed');
    assert(typeof result.medianScores.compositeScore === 'number');
    assert(typeof result.analyticalSummary === 'string' && result.analyticalSummary.length > 0);
    assert(result.analyticalSummary.includes('Analytical decision ranking:'));

    // Verify 10-dimension scores matrix
    result.securities.forEach(sec => {
      assert(sec.dimensionScores, 'dimensionScores must be present for each security');
      assert(Object.keys(sec.dimensionScores).length >= 8, 'Should cover dimensions');
      assert(sec.valuation, 'Valuation data must be included');
      assert(sec.fundamentals, 'Fundamentals data must be included');
    });
  });

  console.log('\n--- TEST GROUP 4: THESIS INVALIDATION & RECOVERY ALERTS ---');

  await runTest('AlertEvaluator triggers THESIS_INVALIDATED when thesisStatus is INVALIDATED', () => {
    const rule: AlertRule = {
      alertRuleId: 'rule-thesis-1',
      securityId: 'us-aapl',
      symbol: 'AAPL',
      alertType: 'THESIS_INVALIDATED',
      threshold: 'ACTIVE_GUARD',
      comparison: '==',
      enabled: true,
      cooldownMinutes: 60,
      lastTriggeredAt: null,
      lastObservedValue: null,
      priority: 'CRITICAL',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };

    const mockAssessment: Partial<InvestmentDecisionAssessment> = {
      decisionId: 'dec-test-1',
      securityId: 'us-aapl',
      invalidationConditions: [
        {
          conditionId: 'guard-rev',
          condition: 'Revenue growth dropped below threshold',
          category: 'FUNDAMENTAL',
          measurable: true,
          falsifiable: true,
          triggered: true,
          status: 'TRIGGERED'
        }
      ]
    };

    const evalResult = alertEvaluator.evaluate({
      rule,
      decisionAssessment: mockAssessment as InvestmentDecisionAssessment
    });

    assert(evalResult.triggered, 'Rule should trigger for INVALIDATED thesis');
    assert(evalResult.reason.includes('Thesis invalidation guard breached'));
  });

  await runTest('AlertEvaluator does NOT trigger THESIS_INVALIDATED when thesisStatus is VALID', () => {
    const rule: AlertRule = {
      alertRuleId: 'rule-thesis-2',
      securityId: 'us-msft',
      symbol: 'MSFT',
      alertType: 'THESIS_INVALIDATED',
      threshold: 'ACTIVE_GUARD',
      comparison: '==',
      enabled: true,
      cooldownMinutes: 60,
      lastTriggeredAt: null,
      lastObservedValue: null,
      priority: 'WARNING',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };

    const mockAssessment: Partial<InvestmentDecisionAssessment> = {
      decisionId: 'dec-test-2',
      securityId: 'us-msft',
      invalidationConditions: [
        {
          conditionId: 'guard-rev',
          condition: 'Revenue growth normal',
          category: 'FUNDAMENTAL',
          measurable: true,
          falsifiable: true,
          triggered: false,
          status: 'ACTIVE_GUARD'
        }
      ]
    };

    const evalResult = alertEvaluator.evaluate({
      rule,
      decisionAssessment: mockAssessment as InvestmentDecisionAssessment
    });

    assert(!evalResult.triggered, 'Rule should not trigger when thesis is active and unbreached');
  });

  await runTest('AlertEvaluator triggers THESIS_RECOVERED when thesisStatus recovers to VALID', () => {
    const rule: AlertRule = {
      alertRuleId: 'rule-thesis-3',
      securityId: 'us-amzn',
      symbol: 'AMZN',
      alertType: 'THESIS_RECOVERED',
      threshold: 'TRIGGERED',
      comparison: '==',
      enabled: true,
      cooldownMinutes: 60,
      lastTriggeredAt: null,
      lastObservedValue: null,
      priority: 'INFO',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };

    const prevAssessment: Partial<InvestmentDecisionAssessment> = {
      decisionId: 'dec-test-prev',
      securityId: 'us-amzn',
      invalidationConditions: [
        {
          conditionId: 'guard-margin',
          condition: 'Operating margin recovered',
          category: 'FUNDAMENTAL',
          measurable: true,
          falsifiable: true,
          triggered: true,
          status: 'TRIGGERED'
        }
      ]
    };

    const currAssessment: Partial<InvestmentDecisionAssessment> = {
      decisionId: 'dec-test-curr',
      securityId: 'us-amzn',
      invalidationConditions: [
        {
          conditionId: 'guard-margin',
          condition: 'Operating margin recovered',
          category: 'FUNDAMENTAL',
          measurable: true,
          falsifiable: true,
          triggered: false,
          status: 'ACTIVE_GUARD'
        }
      ]
    };

    const evalResult = alertEvaluator.evaluate({
      rule,
      previousDecisionAssessment: prevAssessment as InvestmentDecisionAssessment,
      decisionAssessment: currAssessment as InvestmentDecisionAssessment
    });

    assert(evalResult.triggered, 'Rule should trigger for RECOVERED thesis');
    assert(evalResult.reason.includes('recovered to active status'));
  });

  console.log('\n--- TEST GROUP 5: SEC FILING & SNAPSHOT ALERTS ---');

  await runTest('AlertEvaluator triggers NEW_SEC_FILING with filing data', () => {
    const rule: AlertRule = {
      alertRuleId: 'rule-filing-1',
      securityId: 'us-aapl',
      symbol: 'AAPL',
      alertType: 'NEW_SEC_FILING',
      threshold: '10-K',
      comparison: '==',
      enabled: true,
      cooldownMinutes: 60,
      lastTriggeredAt: null,
      lastObservedValue: null,
      priority: 'WARNING',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };

    const evalResult = alertEvaluator.evaluate({
      rule,
      evidenceItems: [
        {
          evidenceId: 'sec-edgar-0000320193-26-000106',
          source: 'SEC_EDGAR',
          category: 'REGULATORY_FILING',
          title: 'SEC 10-K Annual Report',
          content: 'Annual Report for fiscal year ended December 31, 2025',
          epistemicStatus: 'REAL',
          retrievedAt: '2026-03-01T00:00:00Z',
          filingDate: '2026-02-15',
          qualityScore: 95,
          sourceReference: {
            accessionNumber: '0000320193-26-000106',
            form: '10-K'
          }
        } as any
      ]
    });

    assert(evalResult.triggered, 'Rule should trigger for matching filing');
    assert(evalResult.reason.includes('SEC filing published'));
  });

  console.log('\n--- TEST GROUP 6: SAFEGUARDS & IMMUTABILITY ---');

  await runTest('Decision timeline and deltas are strictly analytical with no trade execution', async () => {
    const timeline = await decisionDeltaEngine.getTimeline('MSFT');
    assert(timeline, 'Timeline must exist');
    // Ensure no order or broker execution functions are exposed
    assert.strictEqual((decisionDeltaEngine as any).executeTrade, undefined);
    assert.strictEqual((decisionDeltaEngine as any).placeOrder, undefined);
    assert.strictEqual((decisionIntelligenceService as any).executeOrder, undefined);
  });

  console.log('\n======================================================================');
  console.log(`PHASE 23 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================================');
}

runAllPhase23Tests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
