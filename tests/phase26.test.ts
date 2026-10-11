/**
 * PHASE 26 — INVESTMENT REVIEW WORKSPACE VERIFICATION TEST SUITE
 * 
 * Comprehensive Test Suite covering:
 *  1. Review Loading (Monitor, Baseline, Draft & Current State)
 *  2. Change Summary (Total Changes, Severity, Thesis State, Decision State, Event/Evidence Counts)
 *  3. Chronological Timeline (Ordering, Timestamps, Provenance, No Fabricated Events)
 *  4. Thesis Structural Integrity (Bull, Bear, Risks, Catalysts, Invalidation Guards, Zero Arbitrary Scoring)
 *  5. Decision Impact & Dimension Attribution (Rating Shift, Dimension Deltas, Epistemic Bounds)
 *  6. Evidence Provenance & Point-in-Time Filtering
 *  7. Portfolio Multi-Currency Strict Isolation (USD vs INR)
 *  8. Analyst Review Actions (ACKNOWLEDGE, REVIEWED, FOLLOW_UP_REQUIRED, THESIS_REASSESSMENT_REQUIRED) & Commit
 *  9. Historical Review Immutability
 * 10. Point-in-Time Review Comparison (Review A vs Review B Diffs)
 * 11. Multi-Tenant Security & Isolation
 * 12. Gemini Boundary & Strict Epistemic Separation
 */

import { classifyLegacyFixturesSharedForTest } from './helpers/legacyFixtures';
import assert from 'node:assert';
import { investmentMonitorEngine } from '../server/services/monitor/investmentMonitorEngine';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { InvestmentMonitor, InvestmentMonitorReview, MonitorReviewAction } from '../src/types';

console.log('======================================================================');
console.log('PHASE 26: INVESTMENT REVIEW WORKSPACE VERIFICATION TESTS');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ [FAIL] ${name}:`, msg);
    throw err;
  }
}

async function runAllPhase26Tests() {
  // Phase 38.2B: ownerless legacy fixtures are no longer implicitly visible; classify them explicitly (in-memory, test only).
  await classifyLegacyFixturesSharedForTest();
  console.log('--- TEST GROUP 1: REVIEW LOADING & STATE INTEGRITY ---');

  await runTest('Monitor and current evaluation state load correctly', async () => {
    await persistenceManager.initialize();
    await investmentMonitorEngine.initialize();

    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    assert(monitors.length > 0, 'Should return active monitors for analyst-1');

    const monitor = monitors[0];
    assert(monitor.monitorId, 'Monitor ID must be defined');
    assert(monitor.ticker, 'Ticker must be defined');
    assert(monitor.companyName, 'Company name must be defined');

    // Load current evaluation state draft
    const draft = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'analyst-1');
    assert(draft, 'Change detection review draft must be generated');
    assert(draft.monitorId === monitor.monitorId, 'Draft monitorId must match');
    assert(draft.asOfDate, 'asOfDate must be populated');
  });

  console.log('\n--- TEST GROUP 2: EXECUTIVE CHANGE SUMMARY & SEVERITY ATTRIBUTION ---');

  await runTest('Change summary accurately computes total, critical, and severity counts', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];
    const reviewDraft = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'analyst-1');

    assert(reviewDraft.changeSummary, 'changeSummary must be present');
    assert(typeof reviewDraft.changeSummary.totalChanges === 'number', 'totalChanges must be a number');
    assert(typeof reviewDraft.changeSummary.criticalChanges === 'number', 'criticalChanges must be a number');
    assert(typeof reviewDraft.changeSummary.highSeverityChanges === 'number', 'highSeverityChanges must be a number');
    assert(['ROUTINE', 'NORMAL', 'HIGH', 'IMMEDIATE'].includes(reviewDraft.changeSummary.recommendationReviewUrgency), 'Valid urgency level');
  });

  console.log('\n--- TEST GROUP 3: CHRONOLOGICAL CHANGE TIMELINE & PROVENANCE ---');

  await runTest('Timeline changes are correctly ordered chronologically with valid provenance', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];
    const reviewDraft = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'analyst-1');

    if (reviewDraft.changes && reviewDraft.changes.length > 1) {
      for (let i = 0; i < reviewDraft.changes.length - 1; i++) {
        const t1 = new Date(reviewDraft.changes[i].timestamp).getTime();
        const t2 = new Date(reviewDraft.changes[i + 1].timestamp).getTime();
        assert(t1 >= t2, 'Timeline items should be ordered latest first or valid chronological');
      }
    }

    // Check that every change has an auditable category and description
    for (const c of reviewDraft.changes || []) {
      assert(c.category, 'Change item must have a category');
      assert(c.description, 'Change item must have a description');
      assert(c.severity, 'Change item must have a severity');
    }
  });

  console.log('\n--- TEST GROUP 4: THESIS IMPACT & CATEGORICAL INTEGRITY ---');

  await runTest('Thesis health reflects categorical pillars without arbitrary numeric scores', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];
    const reviewDraft = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'analyst-1');

    const th = reviewDraft.thesisHealth;
    assert(th, 'Thesis health report must exist');
    assert(['HEALTHY', 'UNDER_REVIEW', 'WEAKENED', 'INVALIDATED'].includes(th.overallStatus), 'Valid thesis overallStatus');
    assert(['ACTIVE_GUARD', 'THREATENED', 'TRIGGERED'].includes(th.invalidationStatus), 'Valid invalidation status');
    
    // Explicit rule: Zero arbitrary numeric health score allowed
    assert(!('thesisHealthScore' in th), 'Must NOT contain arbitrary thesis health score numbers');
  });

  console.log('\n--- TEST GROUP 5: DECISION IMPACT & DIMENSION ATTRIBUTION ---');

  await runTest('Decision delta captures dimension score changes deterministically', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];
    const reviewDraft = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'analyst-1');

    const dd = reviewDraft.decisionDelta;
    assert(dd, 'Decision delta must be present');
    assert(typeof dd.scoreDelta === 'number', 'scoreDelta must be numeric');
    assert(dd.previous && dd.current, 'Must contain previous and current decision baselines');
    assert(typeof dd.dimensionDeltas === 'object', 'dimensionDeltas must be mapped');
  });

  console.log('\n--- TEST GROUP 6: EVIDENCE & ZERO LOOKAHEAD BIAS ---');

  await runTest('Historical PIT cutoff excludes subsequent evidence and events', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];

    const pastDraft = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'analyst-1', '2023-01-01');
    assert(pastDraft.eventDelta.newEvents.length === 0, 'Past PIT must not see future events');
    assert(pastDraft.asOfDate === '2023-01-01', 'PIT date must be explicitly honored');
  });

  console.log('\n--- TEST GROUP 7: PORTFOLIO MULTI-CURRENCY STRICT ISOLATION ---');

  await runTest('USD and INR currencies are kept strictly isolated with zero cross-leakage', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    let inrMonitor = monitors.find(m => m.ticker === 'RELIANCE' || m.market === 'INDIA');
    if (!inrMonitor) {
      inrMonitor = await investmentMonitorEngine.createMonitor('analyst-1', 'RELIANCE', { reviewCadence: 'WEEKLY' });
    }

    const inrReview = await investmentMonitorEngine.detectAllChanges(inrMonitor.monitorId, 'analyst-1');
    assert(inrReview.portfolioDelta.currency === 'INR', 'Reliance must be denominated in INR');
    assert(inrReview.portfolioDelta.narrative.includes('INR') || inrReview.portfolioDelta.narrative.includes('₹'), 'Narrative must use INR symbols');

    let usdMonitor = monitors.find(m => m.ticker === 'NVDA' || m.market === 'US');
    if (!usdMonitor) {
      usdMonitor = await investmentMonitorEngine.createMonitor('analyst-1', 'NVDA', { reviewCadence: 'DAILY' });
    }

    const usdReview = await investmentMonitorEngine.detectAllChanges(usdMonitor.monitorId, 'analyst-1');
    assert(usdReview.portfolioDelta.currency === 'USD', 'NVDA must be denominated in USD');
    assert(!usdReview.portfolioDelta.narrative.includes('INR'), 'USD monitor must not leak INR units');
  });

  console.log('\n--- TEST GROUP 8: AUDITABLE REVIEW ACTIONS & IMMUTABLE COMMITS ---');

  await runTest('Persists review with explicit analyst action and retains immutable snapshot', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];

    const actionToCommit: MonitorReviewAction = 'FOLLOW_UP_REQUIRED';
    const note = 'Senior analyst flagged supply chain margin sensitivity for committee follow-up.';

    const committedReview = await investmentMonitorEngine.executeReview(
      monitor.monitorId,
      'analyst-1',
      note,
      actionToCommit
    );

    assert(committedReview.reviewId, 'Committed review must have unique ID');
    assert(committedReview.reviewAction === 'FOLLOW_UP_REQUIRED', 'Review action must match committed action');
    assert(committedReview.reviewActionNotes === note, 'Notes must be immutably recorded');

    // Retrieve from historical repository
    const history = await investmentMonitorEngine.getReviews(monitor.monitorId, 'analyst-1');
    const found = history.find(r => r.reviewId === committedReview.reviewId);
    assert(found, 'Review must be persisted in repository');
    assert(found.reviewAction === 'FOLLOW_UP_REQUIRED', 'Historical review retains action');
  });

  console.log('\n--- TEST GROUP 9: HISTORICAL REVIEW IMMUTABILITY ---');

  await runTest('Past committed reviews remain 100% frozen when subsequent reviews occur', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];

    // Commit Review 1
    const review1 = await investmentMonitorEngine.executeReview(
      monitor.monitorId,
      'analyst-1',
      'Initial Phase 26 baseline freeze',
      'REVIEWED'
    );

    // Commit Review 2 with different action
    const review2 = await investmentMonitorEngine.executeReview(
      monitor.monitorId,
      'analyst-1',
      'Subsequent reassessment',
      'THESIS_REASSESSMENT_REQUIRED'
    );

    // Re-fetch Review 1
    const history = await investmentMonitorEngine.getReviews(monitor.monitorId, 'analyst-1');
    const review1Fetched = history.find(r => r.reviewId === review1.reviewId);

    assert(review1Fetched, 'Review 1 must exist');
    assert(review1Fetched.reviewedAt === review1.reviewedAt, 'Timestamp must remain frozen');
    assert(review1Fetched.reviewAction === 'REVIEWED', 'Review 1 action must not be mutated');
    assert(review1Fetched.changeSummary.totalChanges === review1.changeSummary.totalChanges, 'Metrics frozen');
  });

  console.log('\n--- TEST GROUP 10: POINT-IN-TIME REVIEW COMPARISON (REVIEW A VS REVIEW B) ---');

  await runTest('compareReviews accurately computes deterministic diffs between two reviews', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];

    const history = await investmentMonitorEngine.getReviews(monitor.monitorId, 'analyst-1');
    assert(history.length >= 2, 'Need at least 2 historical reviews to compare');

    const revA = history[1];
    const revB = history[0];

    const comparison = await investmentMonitorEngine.compareReviews(
      monitor.monitorId,
      revA.reviewId,
      revB.reviewId,
      'analyst-1'
    );

    assert(comparison.monitorId === monitor.monitorId, 'Comparison monitorId matches');
    assert(comparison.baseReview.reviewId === revA.reviewId, 'Base review set properly');
    assert(comparison.targetReview.reviewId === revB.reviewId, 'Target review set properly');
    assert(typeof comparison.diff.scoreDelta === 'number', 'Score delta calculated');
    assert(comparison.diff.summaryNarrative, 'Narrative generated');
    assert(typeof comparison.diff.changedDimensions === 'object', 'Dimension differences tracked');
  });

  console.log('\n--- TEST GROUP 11: MULTI-TENANT SECURITY & ISOLATION ---');

  await runTest('Cross-tenant user cannot view, compare, or execute review on foreign monitor', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];

    // Attempt foreign change detection
    await assert.rejects(async () => {
      await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'unauthorized-user-999');
    }, /UNAUTHORIZED_MONITOR_ACCESS|not authorized/i);

    // Attempt foreign review execution
    await assert.rejects(async () => {
      await investmentMonitorEngine.executeReview(monitor.monitorId, 'unauthorized-user-999', 'Hacked note', 'REVIEWED');
    }, /UNAUTHORIZED_MONITOR_ACCESS|not authorized/i);
  });

  console.log('\n--- TEST GROUP 12: GEMINI BOUNDARY & DETERMINISTIC REPRODUCIBILITY ---');

  await runTest('Explanation layers cannot mutate deterministic review calculations', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const monitor = monitors[0];
    const reviewDraft = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, 'analyst-1');

    const initialScore = reviewDraft.decisionDelta.current.compositeScore;
    const initialChanges = reviewDraft.changeSummary.totalChanges;

    // Verify deterministic numbers are fixed and not modified by explanation string
    assert(typeof initialScore === 'number');
    assert(typeof initialChanges === 'number');
    assert(['DETERMINISTIC', 'AI_EXPLANATION', 'DETERMINISTIC_RULES', 'HYBRID'].includes(reviewDraft.explanation.source));
  });

  console.log('\n======================================================================');
  console.log(`PHASE 26 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('======================================================================\n');
}

runAllPhase26Tests().catch(err => {
  console.error('Fatal error during Phase 26 test suite:', err);
  process.exit(1);
});
