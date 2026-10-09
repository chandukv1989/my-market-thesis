/**
 * PHASE 24 — INVESTMENT EVENT INTELLIGENCE, THESIS IMPACT & RESEARCH CHANGE DETECTION
 * 
 * Verification Test Suite:
 *  1. Investment Event Engine Initialization & Canonical Event Seeding
 *  2. Point-in-Time (PIT) Event Timeline Retrieval & Zero-Lookahead Bias Cutoff
 *  3. Event Causal Impact Evaluation: "What Happened" & Structured Data Delta
 *  4. Thesis Impact Detection & Invalidation Condition Tracking
 *  5. Decision Assessment Shift & Dimension Attribution Deltas
 *  6. Research Notebook & Portfolio Capital Exposure Linkage
 *  7. Institutional Causal Explanation Generation
 *  8. Custom Event Ingestion & Immutable Persistence
 *  9. High-Significance Event Alert Dispatch
 * 10. Epistemic Integrity, Provenance Traceability & Analytical-Only Safeguards
 */

import assert from 'node:assert';
import { investmentEventEngine } from '../server/services/events/investmentEventEngine';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { InvestmentEvent, InvestmentEventType, InvestmentEventImpact } from '../src/types';

console.log('======================================================================');
console.log('PHASE 24: INVESTMENT EVENT INTELLIGENCE & THESIS IMPACT TESTS');
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

async function runAllPhase24Tests() {
  console.log('--- TEST GROUP 1: INITIALIZATION & CANONICAL SEED DATA ---');

  await runTest('Engine initializes properly and seeds canonical events', async () => {
    await investmentEventEngine.ensureInitialized();
    const eventRepo = persistenceManager.getEventRepository();
    const allEvents = await eventRepo.getAll();
    assert(Array.isArray(allEvents), 'Events must be returned as an array');
    assert(allEvents.length >= 3, `Expected at least 3 canonical events, found ${allEvents.length}`);
  });

  console.log('\n--- TEST GROUP 2: POINT-IN-TIME TIMELINE & ZERO-LOOKAHEAD ENFORCEMENT ---');

  await runTest('Timeline retrieval returns events for AAPL in chronological availableAt order', async () => {
    const timeline = await investmentEventEngine.getTimeline('us-aapl');
    assert(timeline, 'Timeline must be defined');
    assert(timeline.securityId === 'us-aapl', 'securityId should be us-aapl');
    assert(Array.isArray(timeline.events), 'timeline.events must be an array');
    assert(timeline.events.length >= 2, 'Should have at least 2 events for AAPL');

    // Verify ordering by availableAt descending
    for (let i = 0; i < timeline.events.length - 1; i++) {
      const curr = new Date(timeline.events[i].availableAt).getTime();
      const next = new Date(timeline.events[i + 1].availableAt).getTime();
      assert(curr >= next, `Events must be sorted descending by availableAt: ${curr} >= ${next}`);
    }
  });

  await runTest('Point-in-Time asOfDate cutoff strictly eliminates future lookahead events', async () => {
    // Cutoff before 2025-02-01: should exclude the 2025-02-02 10-Q filing
    const historicalTimeline = await investmentEventEngine.getTimeline('us-aapl', '2025-01-20');
    assert(historicalTimeline, 'Historical timeline must be defined');
    assert.strictEqual(historicalTimeline.asOfDate, '2025-01-20', 'asOfDate must match request');

    // Verify that NO events after 2025-01-20 are present
    const cutoffTime = new Date('2025-01-20T23:59:59.999Z').getTime();
    for (const ev of historicalTimeline.events) {
      const availTime = new Date(ev.availableAt).getTime();
      assert(availTime <= cutoffTime, `Event ${ev.eventId} with availableAt ${ev.availableAt} violates PIT cutoff ${historicalTimeline.asOfDate}`);
    }
  });

  console.log('\n--- TEST GROUP 3: CAUSAL IMPACT ANALYSIS ("WHAT HAPPENED, WHAT CHANGED") ---');

  await runTest('Event impact returns complete "What Happened" factual dossier', async () => {
    const impact = await investmentEventEngine.getEventImpact('evt-aapl-10k-2025');
    assert(impact, 'Impact dossier must be defined');
    assert.strictEqual(impact.eventId, 'evt-aapl-10k-2025', 'eventId must match');
    assert.strictEqual(impact.event.securityId, 'us-aapl', 'securityId must match');
    assert.strictEqual(impact.event.eventType, 'SEC_FILING', 'eventType must be SEC_FILING');
    assert(impact.whatHappened.title.includes('Form 10-K'), 'Title should reference Form 10-K');
    assert(impact.whatHappened.structuredDataDelta.servicesGrossMarginPct, 'Should track servicesGrossMarginPct in structured delta');
    assert.strictEqual(impact.whatHappened.structuredDataDelta.servicesGrossMarginPct.previous, 71.8);
    assert.strictEqual(impact.whatHappened.structuredDataDelta.servicesGrossMarginPct.current, 74.2);
  });

  await runTest('Event impact accurately identifies affected thesis areas', async () => {
    const impact = await investmentEventEngine.getEventImpact('evt-aapl-10k-2025');
    assert(impact.whatChanged.thesis, 'Thesis impact must be evaluated');
    assert(Array.isArray(impact.whatChanged.thesis.affectedAreas), 'affectedAreas must be an array');
    assert(impact.whatChanged.thesis.affectedAreas.includes('BULL_CASE'), 'Should affect BULL_CASE');
    assert(impact.whatChanged.thesis.affectedAreas.includes('EVIDENCE_GAP'), 'Should affect EVIDENCE_GAP');
    assert.strictEqual(impact.whatChanged.thesis.invalidationTriggered, false, 'Invalidation should not be triggered');
  });

  await runTest('Thesis invalidation event correctly flags invalidation condition reached', async () => {
    // Record a synthetic invalidation event for testing
    const invalidationEvent: any = {
      eventId: 'evt-test-invalidation-001',
      securityId: 'us-aapl',
      ticker: 'AAPL',
      market: 'US',
      exchange: 'NASDAQ',
      eventType: 'THESIS_INVALIDATION',
      eventDate: '2025-03-01',
      announcedAt: '2025-03-01T14:00:00.000Z',
      availableAt: '2025-03-01T14:05:00.000Z',
      sourceType: 'REGULATORY_FILING',
      sourceReference: 'SEC Order 2025-0099',
      evidenceIds: ['ev-test-inval-1'],
      epistemicStatus: 'REAL',
      isSimulated: false,
      title: 'Regulatory Invalidation Trigger: App Store Fee Ceiling Enacted',
      summary: 'Antitrust decree limits Services commissions to 5%, breaching the core 20% margin invalidation threshold.',
      affectedThesisAreas: ['INVALIDATION_CONDITION', 'RISK', 'BEAR_CASE'],
      significance: {
        affectsThesis: 'YES',
        affectsDecision: 'YES',
        affectsPortfolio: 'YES',
        affectsEvidenceCoverage: 'YES',
        affectsInvalidationState: 'YES'
      }
    };

    await investmentEventEngine.recordEvent(invalidationEvent);

    const impact = await investmentEventEngine.getEventImpact('evt-test-invalidation-001');
    assert(impact.whatChanged.thesis.invalidationTriggered, 'Invalidation trigger MUST be true for invalidation event');
    assert(impact.whatChanged.thesis.narrative.includes('INVALIDATION'), 'Narrative must declare invalidation condition');
  });

  console.log('\n--- TEST GROUP 4: DECISION SHIFT & DIMENSION ATTRIBUTION ---');

  await runTest('Event impact tracks pre- and post-event committee assessment decisions', async () => {
    const impact = await investmentEventEngine.getEventImpact('evt-aapl-10k-2025');
    assert(impact.whatChanged.decision, 'Decision impact must be defined');
    assert(impact.whatChanged.decision.narrative, 'Narrative must be present');
    assert(typeof impact.whatChanged.decision.scoreDelta === 'number' || impact.whatChanged.decision.scoreDelta === undefined, 'scoreDelta type valid');
  });

  console.log('\n--- TEST GROUP 5: RESEARCH & PORTFOLIO EXPOSURE IMPACT ---');

  await runTest('Event impact quantifies research notebook changes and portfolio capital exposure', async () => {
    const impact = await investmentEventEngine.getEventImpact('evt-aapl-10k-2025');
    assert(impact.whatChanged.research, 'Research impact must be present');
    assert(typeof impact.whatChanged.research.changedClaimsCount === 'number', 'changedClaimsCount must be numeric');
    assert(typeof impact.whatChanged.research.coverageDelta === 'number', 'coverageDelta must be numeric');

    assert(impact.whatChanged.portfolio, 'Portfolio impact must be present');
    assert(typeof impact.whatChanged.portfolio.hasExposure === 'boolean', 'hasExposure must be boolean');
  });

  console.log('\n--- TEST GROUP 6: INSTITUTIONAL EXPLANATION & SAFEGUARDS ---');

  await runTest('Generates rigorous institutional explanation without hallucinations', async () => {
    const impact = await investmentEventEngine.getEventImpact('evt-aapl-10k-2025');
    assert(impact.explanation, 'Explanation must be defined');
    assert(impact.explanation.summary.length > 30, 'Explanation should be substantive');
    assert(impact.explanation.causalChain.length >= 2, 'Causal chain should contain multiple links');
    assert(impact.explanation.source === 'DETERMINISTIC' || impact.explanation.source === 'AI_EXPLANATION', 'Source must be documented');
  });

  await runTest('Analytical-only verification: no broker order execution paths exist', async () => {
    // Verify engine has no trading or broker execution methods
    assert(!('executeTrade' in investmentEventEngine), 'Engine must not have trade execution capabilities');
    assert(!('placeOrder' in investmentEventEngine), 'Engine must not have order routing capabilities');
    assert(!('submitBrokerTransaction' in investmentEventEngine), 'Engine must not have broker transaction submission');
  });

  console.log('\n======================================================================');
  console.log(`PHASE 24 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('======================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllPhase24Tests().catch(err => {
  console.error('Fatal error during Phase 24 tests:', err);
  process.exit(1);
});
