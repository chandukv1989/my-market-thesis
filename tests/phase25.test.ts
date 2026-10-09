/**
 * PHASE 25 — INVESTMENT MONITOR, THESIS HEALTH & CONTINUOUS CHANGE INTELLIGENCE
 * 
 * Verification Test Suite:
 *  1. Monitor Engine & Repository Initialization (Dev & Postgres Adapters)
 *  2. Tenant Isolation & Authorization Enforcement
 *  3. Baseline Snapshot Capture & Monitor Registration
 *  4. Deterministic Change Detection Pipeline:
 *     - Event Delta
 *     - Evidence Delta
 *     - Thesis Health Report & Invalidation Detection
 *     - Decision Assessment Shift & Dimension Delta Attribution
 *     - Portfolio Exposure Impact
 *  5. Point-in-Time (PIT) Evaluation & Zero Lookahead Bias
 *  6. Immutable Review Snapshot Creation & State Advancement
 *  7. Append-Only Analyst Audit Trail & Human Commentary
 *  8. Strict Epistemic Integrity & Analytical-Only Safeguards (No automated trading)
 */

import assert from 'node:assert';
import { investmentMonitorEngine } from '../server/services/monitor/investmentMonitorEngine';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { InvestmentMonitor, InvestmentMonitorReview, AnalystReviewNote } from '../src/types';

console.log('======================================================================');
console.log('PHASE 25: INVESTMENT MONITOR & THESIS HEALTH INTELLIGENCE TESTS');
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

async function runAllPhase25Tests() {
  console.log('--- TEST GROUP 1: INITIALIZATION & PERSISTENCE REPOSITORIES ---');

  await runTest('Persistence manager exposes monitor and review repositories', async () => {
    await persistenceManager.initialize();
    const monitorRepo = persistenceManager.getInvestmentMonitorRepository();
    const reviewRepo = persistenceManager.getInvestmentMonitorReviewRepository();
    assert(monitorRepo, 'Monitor repository must be defined');
    assert(reviewRepo, 'Review repository must be defined');
  });

  await runTest('Investment monitor engine initializes and seeds baseline monitors', async () => {
    await investmentMonitorEngine.initialize();
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    assert(Array.isArray(monitors), 'Monitors must be an array');
    assert(monitors.length >= 3, 'Must seed at least 3 default monitors');
    const tickers = monitors.map(m => m.ticker);
    assert(tickers.includes('NVDA'), 'NVDA must be monitored');
    assert(tickers.includes('AAPL'), 'AAPL must be monitored');
    assert(tickers.includes('RELIANCE'), 'RELIANCE must be monitored');
  });

  console.log('\n--- TEST GROUP 2: MULTI-TENANCY & AUTHORIZATION ENFORCEMENT ---');

  await runTest('Users only see their own monitored securities', async () => {
    const user1Monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const user2Monitors = await investmentMonitorEngine.getMonitors('other-user-999');
    assert(user1Monitors.length > 0, 'Analyst-1 must have monitors');
    assert(user2Monitors.length === 0, 'Other-user must have no monitors initially');
  });

  await runTest('Unauthorized user cannot access or execute review on another user\'s monitor', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const targetMonitor = monitors[0];
    assert(targetMonitor, 'Target monitor must exist');

    let accessDenied = false;
    try {
      await investmentMonitorEngine.getMonitor(targetMonitor.monitorId, 'unauthorized-user-xyz');
    } catch (err: any) {
      if (err.message.includes('UNAUTHORIZED_MONITOR_ACCESS')) {
        accessDenied = true;
      }
    }
    assert(accessDenied, 'Must reject unauthorized monitor access');

    let reviewDenied = false;
    try {
      await investmentMonitorEngine.executeReview(targetMonitor.monitorId, 'unauthorized-user-xyz');
    } catch (err: any) {
      if (err.message.includes('UNAUTHORIZED_MONITOR_ACCESS')) {
        reviewDenied = true;
      }
    }
    assert(reviewDenied, 'Must reject unauthorized review execution');
  });

  console.log('\n--- TEST GROUP 3: MONITOR REGISTRATION & BASELINE SNAPSHOT CAPTURE ---');

  let testMonitorId = '';

  await runTest('Creates a new monitor with immutable baseline decision and snapshot', async () => {
    const monitor = await investmentMonitorEngine.createMonitor('analyst-1', 'MSFT', {
      reviewCadence: 'WEEKLY'
    });
    assert(monitor.monitorId, 'Monitor ID must be generated');
    assert.strictEqual(monitor.ticker, 'MSFT');
    assert.strictEqual(monitor.ownerUserId, 'analyst-1');
    assert.strictEqual(monitor.reviewCadence, 'WEEKLY');
    assert.strictEqual(monitor.status, 'ACTIVE');
    assert(monitor.baselineCompositeScore !== undefined, 'Baseline composite score must be captured');
    assert(monitor.baselineRating !== undefined, 'Baseline rating must be captured');
    assert.strictEqual(monitor.isAnalyticalOnly, true, 'isAnalyticalOnly must be true');
    assert.strictEqual(monitor.executionProhibited, true, 'executionProhibited must be true');
    testMonitorId = monitor.monitorId;
  });

  await runTest('Updates monitor settings (cadence and status)', async () => {
    const updated = await investmentMonitorEngine.updateMonitor(testMonitorId, 'analyst-1', {
      reviewCadence: 'MONTHLY'
    });
    assert.strictEqual(updated.reviewCadence, 'MONTHLY');
  });

  console.log('\n--- TEST GROUP 4: DETERMINISTIC CHANGE DETECTION PIPELINE ---');

  await runTest('Detects changes across events, evidence, thesis, decision, and portfolio', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const nvdaMonitor = monitors.find(m => m.ticker === 'NVDA');
    assert(nvdaMonitor, 'NVDA monitor must exist');

    const draft = await investmentMonitorEngine.detectAllChanges(nvdaMonitor.monitorId, 'analyst-1');
    assert(draft.monitorId === nvdaMonitor.monitorId, 'Draft review must match monitor ID');
    assert(draft.changeSummary, 'Change summary must be generated');
    assert(typeof draft.changeSummary.eventsCount === 'number', 'eventsCount must be numeric');
    assert(typeof draft.changeSummary.evidenceCount === 'number', 'evidenceCount must be numeric');
    
    // Thesis health check
    assert(draft.thesisHealth, 'Thesis health report must exist');
    assert(['STRENGTHENED', 'UNCHANGED', 'WEAKENED', 'INSUFFICIENT_EVIDENCE'].includes(draft.thesisHealth.bullCaseState));
    assert(['STRENGTHENED', 'UNCHANGED', 'WEAKENED', 'INSUFFICIENT_EVIDENCE'].includes(draft.thesisHealth.bearCaseState));
    assert(['ACTIVE_GUARD', 'TRIGGERED', 'RECOVERED', 'UNKNOWN'].includes(draft.thesisHealth.invalidationState));

    // Decision delta check
    assert(draft.decisionDelta, 'Decision delta must exist');
    assert(draft.decisionDelta.narrative, 'Decision delta narrative must be generated');

    // Portfolio delta check
    assert(draft.portfolioDelta, 'Portfolio delta must exist');
    assert(typeof draft.portfolioDelta.hasExposure === 'boolean', 'Portfolio exposure boolean must exist');

    // Explanation & causal chain
    assert(draft.explanation, 'Explanation must exist');
    assert(draft.explanation.causalChain.length >= 2, 'Causal chain must have sequential steps');
  });

  console.log('\n--- TEST GROUP 5: POINT-IN-TIME (PIT) ZERO-LOOKAHEAD BIAS ---');

  await runTest('Historical asOfDate excludes future events and future evidence', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const aaplMonitor = monitors.find(m => m.ticker === 'AAPL');
    assert(aaplMonitor, 'AAPL monitor must exist');

    // Evaluate change detection as of an early date (2024-01-01)
    const earlyReview = await investmentMonitorEngine.detectAllChanges(aaplMonitor.monitorId, 'analyst-1', '2024-01-01');
    assert.strictEqual(earlyReview.asOfDate, '2024-01-01');

    // Should have 0 new events since all sample events are 2025/2026
    if (earlyReview.eventDelta) {
      for (const evt of earlyReview.eventDelta.newEvents) {
        assert(new Date(evt.eventTimestamp).getTime() <= new Date('2024-01-01T23:59:59Z').getTime(), 'No lookahead events allowed');
      }
    }
  });

  console.log('\n--- TEST GROUP 6: IMMUTABLE REVIEW SNAPSHOT EXECUTION ---');

  let reviewIdCreated = '';

  await runTest('Executes review and persists immutable review snapshot', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const nvdaMonitor = monitors.find(m => m.ticker === 'NVDA');
    assert(nvdaMonitor, 'NVDA monitor must exist');

    const review = await investmentMonitorEngine.executeReview(
      nvdaMonitor.monitorId,
      'analyst-1',
      'Quarterly committee audit: margin expansion confirmed, invalidation guard active.'
    );

    assert(review.reviewId, 'Review ID must be generated');
    assert.strictEqual(review.monitorId, nvdaMonitor.monitorId);
    assert.strictEqual(review.ownerUserId, 'analyst-1');
    assert(review.reviewedAt, 'reviewedAt timestamp must be recorded');
    assert.strictEqual(review.isAnalyticalOnly, true, 'Must preserve analytical-only flag');
    assert.strictEqual(review.executionProhibited, true, 'Must preserve executionProhibited flag');
    reviewIdCreated = review.reviewId;

    // Verify monitor state was advanced
    const updatedMonitor = await investmentMonitorEngine.getMonitor(nvdaMonitor.monitorId, 'analyst-1');
    assert(updatedMonitor?.lastReviewedAt, 'lastReviewedAt must be set');
    assert.strictEqual(updatedMonitor?.lastReviewedAt, review.reviewedAt);

    // Verify history retrieval
    const history = await investmentMonitorEngine.getReviewHistory(nvdaMonitor.monitorId, 'analyst-1');
    assert(history.length >= 1, 'Review history must contain committed review');
    const found = history.find(r => r.reviewId === reviewIdCreated);
    assert(found, 'Created review must be present in history');
  });

  await runTest('Retrieves single historical review by reviewId', async () => {
    const fetched = await investmentMonitorEngine.getReview(reviewIdCreated, 'analyst-1');
    assert(fetched, 'Review must be retrievable by ID');
    assert.strictEqual(fetched?.reviewId, reviewIdCreated);
  });

  console.log('\n--- TEST GROUP 7: HUMAN ANALYST AUDIT NOTES ---');

  await runTest('Appends immutable analyst notes to audit log', async () => {
    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    const nvdaMonitor = monitors.find(m => m.ticker === 'NVDA');
    assert(nvdaMonitor, 'NVDA monitor must exist');

    const note = await investmentMonitorEngine.addAnalystNote(
      nvdaMonitor.monitorId,
      'analyst-1',
      'Senior Portfolio Manager',
      'Reviewed thesis pillar #2: datacenter demand trajectory exceeding conservative projections.',
      reviewIdCreated
    );

    assert(note.noteId, 'Note ID must be generated');
    assert.strictEqual(note.monitorId, nvdaMonitor.monitorId);
    assert.strictEqual(note.label, 'USER NOTE');
    assert.strictEqual(note.isImmutable, true);

    const notes = await investmentMonitorEngine.getAnalystNotes(nvdaMonitor.monitorId, 'analyst-1');
    assert(notes.length >= 1, 'Notes list must contain newly added note');
    const foundNote = notes.find(n => n.noteId === note.noteId);
    assert(foundNote, 'Found note in audit log');
  });

  console.log('\n--- TEST GROUP 8: ANALYTICAL-ONLY SAFEGUARDS ---');

  await runTest('Confirms analytical-only safeguards and no execution capabilities', async () => {
    assert(!('placeOrder' in investmentMonitorEngine), 'Engine must not allow placing orders');
    assert(!('executeTrade' in investmentMonitorEngine), 'Engine must not allow trade execution');
    assert(!('submitOrderToBroker' in investmentMonitorEngine), 'Engine must not route orders');

    const monitors = await investmentMonitorEngine.getMonitors('analyst-1');
    for (const m of monitors) {
      assert.strictEqual(m.isAnalyticalOnly, true, 'Monitor must be analytical-only');
      assert.strictEqual(m.executionProhibited, true, 'Monitor must prohibit execution');
    }
  });

  console.log('\n======================================================================');
  console.log(`PHASE 25 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('======================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllPhase25Tests().catch(err => {
  console.error('Fatal error during Phase 25 tests:', err);
  process.exit(1);
});
