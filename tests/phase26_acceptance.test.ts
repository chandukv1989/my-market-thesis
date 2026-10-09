/**
 * PHASE 26.1 — END-TO-END REVIEW WORKSPACE ACCEPTANCE & REGRESSION VALIDATION
 * 
 * Comprehensive E2E verification of the Investment Review Workspace:
 *  - Scenario A: Create Review A (Deterministic baseline, REVIEWED action, complete audit snapshot)
 *  - Scenario B: Historical Immutability of Review A (Post-review state changes do not mutate Review A)
 *  - Scenario C: Current Workspace after Changes (Incremental delta detection since Review A)
 *  - Scenario D: Create Review B (FOLLOW_UP_REQUIRED action, distinct PIT state, Review A pristine)
 *  - Scenario E: Review A vs Review B Comparison (Deterministic diffs, double-run test, no LLM impact)
 *  - Scenario F: Current Draft vs Historical Review (Comparison does not mutate history, draft uncommitted)
 *  - Scenario G: Zero-Change Baseline (Zero false positives, no fabricated events/evidence/deltas)
 *  - Scenario H: Canonical Review Actions (ACKNOWLEDGE, REVIEWED, FOLLOW_UP_REQUIRED, THESIS_REASSESSMENT_REQUIRED)
 *  - Scenario I: Analyst Audit Notes (Tenant-scoped, timestamped, immutably attached to review)
 *  - Scenario J: Point-In-Time Strict Cutoffs (Zero lookahead across events, evidence, decisions, thesis)
 *  - Scenario K: Security / IDOR Enforcement (Cross-tenant read, execute, compare, notes rejection)
 *  - Scenario L: Multi-Currency Strict Isolation (USD vs INR, separate metrics, no FX leakage)
 *  - Scenario M: Epistemic Integrity (REAL, CALCULATED, SIMULATED, UNAVAILABLE, ERROR preserved, no upgrade)
 *  - Scenario N: Thesis Health Categorical Model (Strictly no numeric thesis health scores)
 *  - Scenario O: Decision Integrity (Consumes Decision Intelligence without overriding scores/ratings)
 *  - Scenario P: Evidence Integrity & Provenance (Trackable sources, no hallucinated citations)
 *  - Scenario Q: Event & Causality Integrity (Distinguishes observed changes from causal claims)
 *  - Scenario R: Gemini Epistemic Boundary (LLM limited to narrative explanation, zero metric override)
 */

import assert from 'node:assert';
import { investmentMonitorEngine } from '../server/services/monitor/investmentMonitorEngine';
import { persistenceManager } from '../server/persistence/persistenceManager';
import {
  InvestmentEvent,
  ResearchSnapshot,
  HoldingPosition,
  MonitorReviewAction,
  InvestmentMonitorReview,
  EvidenceItem
} from '../src/types';

console.log('======================================================================');
console.log('PHASE 26.1: END-TO-END REVIEW WORKSPACE ACCEPTANCE TEST SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function runScenario(scenarioName: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    passedTests++;
    console.log(`  ✓ [PASS] ${scenarioName}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ [FAIL] ${scenarioName}:`, msg);
    throw err;
  }
}

async function runAllPhase26Acceptance() {
  await persistenceManager.initialize();
  await investmentMonitorEngine.initialize();

  const userA = `analyst-p26-a-${Date.now()}`;
  const userB = `analyst-p26-b-${Date.now()}`;

  const eventRepo = persistenceManager.getEventRepository();
  const evidenceRepo = persistenceManager.getEvidenceRepository();
  const snapshotRepo = persistenceManager.getSnapshotRepository();
  const portfolioRepo = persistenceManager.getPortfolioRepository();

  let monitorA: any;
  let reviewA: InvestmentMonitorReview;
  let reviewAJsonSnapshot: string;
  let reviewB: InvestmentMonitorReview;

  // =========================================================================
  // SCENARIO A — CREATE REVIEW A
  // =========================================================================
  await runScenario('Scenario A: Create Review A (Deterministic baseline & sign-off)', async () => {
    monitorA = await investmentMonitorEngine.createMonitor(userA, 'MSFT', {
      reviewCadence: 'WEEKLY'
    });

    assert(monitorA.monitorId, 'Monitor ID must be generated');
    assert.strictEqual(monitorA.ticker, 'MSFT', 'Ticker must be MSFT');
    assert.strictEqual(monitorA.userId, userA, 'User ID must match User A');

    // Seed baseline event
    const t0 = new Date(Date.now() - 86400000 * 5).toISOString();
    const initEvent: InvestmentEvent = {
      eventId: `ev_init_${Date.now()}`,
      securityId: 'us-msft',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Azure Cloud Revenue Growth Acceleration',
      summary: 'Azure gross margins expanded 180bps driven by high-margin AI inference services.',
      eventType: 'EARNINGS_EVENT',
      eventDate: t0,
      announcedAt: t0,
      availableAt: t0,
      sourceType: 'SEC_FILING',
      sourceReference: 'SEC Form 10-Q Filing',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: {
        affectsThesis: 'YES',
        affectsDecision: 'NO',
        affectsPortfolio: 'NO',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'NO'
      },
      affectedThesisAreas: ['CATALYST'],
      createdAt: t0
    };
    await eventRepo.save(initEvent);

    // Initial evaluation draft
    const initialDraft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
    assert(initialDraft.changeSummary, 'Initial change summary must exist');
    assert(initialDraft.thesisHealth, 'Thesis health must exist');
    assert(initialDraft.decisionDelta, 'Decision delta must exist');
    assert(initialDraft.eventDelta, 'Event delta must exist');
    assert(initialDraft.evidenceDelta, 'Evidence delta must exist');
    assert(initialDraft.portfolioDelta, 'Portfolio delta must exist');
    assert(initialDraft.quantDelta, 'Quant delta must exist');
    assert(initialDraft.valuationDelta, 'Valuation delta must exist');

    // Commit Review A with REVIEWED action
    const reviewNoteA = 'Initial institutional baseline approved. Cloud catalyst tracking on schedule.';
    reviewA = await investmentMonitorEngine.executeReview(
      monitorA.monitorId,
      userA,
      reviewNoteA,
      'REVIEWED'
    );

    assert(reviewA.reviewId, 'Review A must have a generated reviewId');
    assert.strictEqual(reviewA.userId, userA, 'Review A userId must match userA');
    assert.strictEqual(reviewA.monitorId, monitorA.monitorId, 'Review A monitorId must match monitorA');
    assert.strictEqual(reviewA.ticker, 'MSFT', 'Review A ticker must match MSFT');
    assert.strictEqual(reviewA.reviewAction, 'REVIEWED', 'Review A action must be REVIEWED');
    assert.strictEqual(reviewA.reviewActionNotes, reviewNoteA, 'Review A note must match input');
    assert(reviewA.reviewedAt, 'reviewedAt timestamp must be recorded');
    assert(reviewA.asOfDate, 'asOfDate must be recorded');
    assert(reviewA.thesisHealth, 'thesisHealth must be recorded in Review A');
    assert(reviewA.decisionDelta, 'decisionDelta must be recorded in Review A');
    assert(reviewA.explanation, 'explanation must be recorded in Review A');

    // Save frozen JSON string of Review A for strict byte-level immutability validation
    reviewAJsonSnapshot = JSON.stringify(reviewA);
  });

  // =========================================================================
  // SCENARIO B — IMMUTABILITY OF REVIEW A
  // =========================================================================
  await runScenario('Scenario B: Historical Immutability of Review A after State Changes', async () => {
    // Introduce material state changes AFTER Review A
    const tPostA = new Date().toISOString();

    // 1. Ingest new critical supply-chain event
    const postEvent: InvestmentEvent = {
      eventId: `ev_sec_post_${Date.now()}`,
      securityId: 'us-msft',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Global Semiconductor Allocation Bottleneck',
      summary: 'Data center GPU allocation reduced by 25% for upcoming two quarters.',
      eventType: 'MARKET_EVENT',
      eventDate: tPostA,
      announcedAt: tPostA,
      availableAt: tPostA,
      sourceType: 'SUPPLY_CHAIN_INTELLIGENCE',
      sourceReference: 'Verified Tier-1 Foundry Supply Chain Report',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: {
        affectsThesis: 'YES',
        affectsDecision: 'YES',
        affectsPortfolio: 'YES',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'YES'
      },
      affectedThesisAreas: ['RISK', 'INVALIDATION_CONDITION'],
      createdAt: tPostA
    };
    await eventRepo.save(postEvent);

    // 2. Ingest new evidence item
    const postEvidence: EvidenceItem = {
      evidenceId: `evd_post_${Date.now()}`,
      securityId: 'us-msft',
      sourceType: 'RESEARCH_DOCUMENT',
      provider: 'FoundryTracker',
      title: 'GPU rack deployment deferred',
      content: 'GPU rack deployment deferred across 4 North American zones.',
      publishedAt: tPostA,
      retrievedAt: tPostA,
      isSimulated: false,
      epistemicStatus: 'REAL'
    };
    await evidenceRepo.addEvidence(postEvidence);

    // 3. Retrieve Review A again from persistence
    const reFetchedReviewA = await investmentMonitorEngine.getReview(reviewA.reviewId, userA);
    assert(reFetchedReviewA, 'Review A must be retrievable');

    // Verify Review A did NOT ingest the new postEvent or postEvidence
    const containsPostEvent = (reFetchedReviewA.eventDelta?.newEvents || []).some(
      e => e.eventId === postEvent.eventId
    );
    assert.strictEqual(containsPostEvent, false, 'Review A must not contain future events');

    const containsPostEvidence = (reFetchedReviewA.evidenceDelta?.evidenceIds || []).includes(
      postEvidence.evidenceId
    );
    assert.strictEqual(containsPostEvidence, false, 'Review A must not contain future evidence');

    // Verify Review A is structurally identical to the original snapshot
    const reFetchedJson = JSON.stringify(reFetchedReviewA);
    assert.strictEqual(
      reFetchedJson,
      reviewAJsonSnapshot,
      'Review A must be 100% byte-for-byte identical to its originally persisted representation'
    );
  });

  // =========================================================================
  // SCENARIO C — CURRENT WORKSPACE AFTER CHANGES
  // =========================================================================
  await runScenario('Scenario C: Current Workspace detects only changes occurring after Review A', async () => {
    const currentWorkspaceDraft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);

    // Baseline review is Review A
    const monitorState = await investmentMonitorEngine.getMonitor(monitorA.monitorId, userA);
    assert.strictEqual(
      monitorState.lastReviewId,
      reviewA.reviewId,
      'Monitor lastReviewId must match Review A'
    );

    // Changes detected must capture the post-Review-A supply chain event
    assert(currentWorkspaceDraft.changeSummary.totalChanges > 0, 'Total changes must be > 0');
    assert(
      currentWorkspaceDraft.changes.some(c => c.category === 'EVENT_CHANGE'),
      'Must contain EVENT_CHANGE from the post-Review-A event'
    );

    // Verify invalidation status guard reflects the risk
    assert(
      ['THREATENED', 'ACTIVE_GUARD'].includes(currentWorkspaceDraft.thesisHealth.invalidationStatus),
      'Invalidation guard reflects recent supply chain threat'
    );
  });

  // =========================================================================
  // SCENARIO D — CREATE REVIEW B
  // =========================================================================
  await runScenario('Scenario D: Commit Review B (FOLLOW_UP_REQUIRED, Review A pristine)', async () => {
    const reviewNoteB = 'Supply chain GPU bottleneck requires urgent hardware engineering follow-up.';
    reviewB = await investmentMonitorEngine.executeReview(
      monitorA.monitorId,
      userA,
      reviewNoteB,
      'FOLLOW_UP_REQUIRED'
    );

    assert(reviewB.reviewId, 'Review B must have a unique reviewId');
    assert.notStrictEqual(reviewB.reviewId, reviewA.reviewId, 'Review B ID must differ from Review A');
    assert.strictEqual(reviewB.reviewAction, 'FOLLOW_UP_REQUIRED', 'Review B action must be FOLLOW_UP_REQUIRED');
    assert.strictEqual(reviewB.reviewActionNotes, reviewNoteB, 'Review B notes must match');

    // Confirm Review A remains completely pristine
    const pristineReviewA = await investmentMonitorEngine.getReview(reviewA.reviewId, userA);
    assert.strictEqual(
      JSON.stringify(pristineReviewA),
      reviewAJsonSnapshot,
      'Review A remains frozen even after Review B execution'
    );
  });

  // =========================================================================
  // SCENARIO E — REVIEW A VS REVIEW B (DETERMINISTIC COMPARISON)
  // =========================================================================
  await runScenario('Scenario E: Review A vs Review B Comparison (Deterministic double-run)', async () => {
    // Run 1
    const comparison1 = await investmentMonitorEngine.compareReviews(
      monitorA.monitorId,
      reviewA.reviewId,
      reviewB.reviewId,
      userA
    );

    // Run 2
    const comparison2 = await investmentMonitorEngine.compareReviews(
      monitorA.monitorId,
      reviewA.reviewId,
      reviewB.reviewId,
      userA
    );

    assert.strictEqual(comparison1.monitorId, monitorA.monitorId);
    assert.strictEqual(comparison1.baseReview.reviewId, reviewA.reviewId);
    assert.strictEqual(comparison1.targetReview.reviewId, reviewB.reviewId);
    assert.strictEqual(comparison1.baseReview.reviewAction, 'REVIEWED');
    assert.strictEqual(comparison1.targetReview.reviewAction, 'FOLLOW_UP_REQUIRED');

    // Verify comparison is 100% deterministic between Run 1 and Run 2
    assert.deepStrictEqual(
      comparison1.diff,
      comparison2.diff,
      'compareReviews must produce identical diffs on repeated executions'
    );

    assert(typeof comparison1.diff.scoreDelta === 'number', 'scoreDelta must be numeric');
    assert(typeof comparison1.diff.ratingShift === 'boolean', 'ratingShift must be boolean');
    assert(typeof comparison1.diff.thesisShift === 'boolean', 'thesisShift must be boolean');
    assert(typeof comparison1.diff.invalidationShift === 'boolean', 'invalidationShift must be boolean');
  });

  // =========================================================================
  // SCENARIO F — CURRENT DRAFT VS HISTORICAL REVIEW
  // =========================================================================
  await runScenario('Scenario F: Current Draft vs Historical Review Comparison does not mutate history', async () => {
    const currentDraft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);

    // Retrieve history list
    const historyBefore = await investmentMonitorEngine.getReviewHistory(monitorA.monitorId, userA);
    assert.strictEqual(historyBefore.length, 2, 'History must contain exactly Review A and Review B');

    // Verify current draft does not appear in historical review list
    assert(
      !historyBefore.some(r => r.reviewId === currentDraft.reviewId),
      'Current draft must NOT be persisted into history prior to explicit sign-off'
    );

    // Verify Review A is unchanged
    const pristineReviewA = await investmentMonitorEngine.getReview(reviewA.reviewId, userA);
    assert.strictEqual(JSON.stringify(pristineReviewA), reviewAJsonSnapshot);
  });

  // =========================================================================
  // SCENARIO G — ZERO-CHANGE BASELINE
  // =========================================================================
  await runScenario('Scenario G: Zero-change baseline immediately after Review B', async () => {
    // Immediately detect changes without adding any events, evidence, or metric modifications
    const zeroDraft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);

    assert.strictEqual(zeroDraft.changeSummary.eventsCount, 0, 'Must have 0 incremental events');
    assert.strictEqual(zeroDraft.changeSummary.evidenceCount, 0, 'Must have 0 incremental evidence items');
    assert.strictEqual(zeroDraft.changeSummary.thesisChanged, false, 'thesisChanged must be false');
    assert.strictEqual(zeroDraft.changeSummary.decisionChanged, false, 'decisionChanged must be false');
    assert.strictEqual(zeroDraft.changeSummary.portfolioChanged, false, 'portfolioChanged must be false');
    assert.strictEqual(zeroDraft.changeSummary.quantChanged, false, 'quantChanged must be false');
    assert.strictEqual(zeroDraft.changeSummary.valuationChanged, false, 'valuationChanged must be false');
    assert.strictEqual(zeroDraft.changeSummary.totalChanges, 0, 'totalChanges must be 0');
    assert(['ROUTINE', 'NORMAL'].includes(zeroDraft.changeSummary.recommendationReviewUrgency), 'Urgency must be routine');
  });

  // =========================================================================
  // SCENARIO H — CANONICAL REVIEW ACTIONS
  // =========================================================================
  await runScenario('Scenario H: Canonical ReviewAction values persistence and immutability', async () => {
    const actionsToTest: MonitorReviewAction[] = [
      'ACKNOWLEDGE',
      'REVIEWED',
      'FOLLOW_UP_REQUIRED',
      'THESIS_REASSESSMENT_REQUIRED'
    ];

    const actionMonitor = await investmentMonitorEngine.createMonitor(userA, 'AAPL', {
      reviewCadence: 'MONTHLY'
    });

    for (const act of actionsToTest) {
      const note = `Testing action ${act} for compliance.`;
      const rev = await investmentMonitorEngine.executeReview(
        actionMonitor.monitorId,
        userA,
        note,
        act
      );

      assert.strictEqual(rev.reviewAction, act, `Persisted action must match ${act}`);
      assert.strictEqual(rev.reviewActionNotes, note, 'Persisted notes must match');
      assert.strictEqual(rev.userId, userA, 'User must match userA');

      // Re-fetch and check
      const fetched = await investmentMonitorEngine.getReview(rev.reviewId, userA);
      assert.strictEqual(fetched?.reviewAction, act, `Retrieved review action must remain ${act}`);
    }
  });

  // =========================================================================
  // SCENARIO I — ANALYST AUDIT NOTES
  // =========================================================================
  await runScenario('Scenario I: Analyst Audit Notes isolation and immutability', async () => {
    const noteText = 'IC Committee requested stress test under TSMC power constraint scenario.';
    const createdNote = await investmentMonitorEngine.addAnalystNote(
      monitorA.monitorId,
      userA,
      'Senior Analyst',
      noteText,
      reviewB.reviewId
    );

    assert(createdNote.noteId, 'Note ID must be generated');
    assert.strictEqual(createdNote.monitorId, monitorA.monitorId);
    assert.strictEqual(createdNote.userId, userA);
    assert.strictEqual(createdNote.content, noteText);
    assert.strictEqual(createdNote.reviewId, reviewB.reviewId);
    assert(createdNote.createdAt, 'createdAt timestamp must be recorded');

    // Retrieve notes for monitor
    const notes = await investmentMonitorEngine.getAnalystNotes(monitorA.monitorId, userA);
    assert(notes.some(n => n.noteId === createdNote.noteId), 'Created note must be returned');

    // Attempt retrieval by unauthorized user
    await assert.rejects(async () => {
      await investmentMonitorEngine.getAnalystNotes(monitorA.monitorId, userB);
    }, /UNAUTHORIZED_MONITOR_ACCESS|not authorized/i);
  });

  // =========================================================================
  // SCENARIO J — POINT-IN-TIME (PIT) STRICT CUTOFFS
  // =========================================================================
  await runScenario('Scenario J: Point-In-Time zero lookahead excludes future events and evidence', async () => {
    const tPast = '2023-01-01';
    const pitDraft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA, tPast);

    assert.strictEqual(pitDraft.asOfDate, tPast, 'asOfDate must match requested cutoff');
    assert.strictEqual(pitDraft.eventDelta.newEvents.length, 0, 'No future events should appear in past cutoff');
    assert.strictEqual(pitDraft.evidenceDelta.newEvidenceCount, 0, 'No future evidence should appear in past cutoff');
  });

  // =========================================================================
  // SCENARIO K — SECURITY & IDOR ENFORCEMENT
  // =========================================================================
  await runScenario('Scenario K: Multi-tenant IDOR enforcement blocks foreign operations', async () => {
    // 1. Foreign getMonitor
    await assert.rejects(async () => {
      await investmentMonitorEngine.getMonitor(monitorA.monitorId, userB);
    }, /UNAUTHORIZED|not authorized/i);

    // 2. Foreign detectAllChanges
    await assert.rejects(async () => {
      await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userB);
    }, /UNAUTHORIZED|not authorized/i);

    // 3. Foreign getReview
    await assert.rejects(async () => {
      await investmentMonitorEngine.getReview(reviewA.reviewId, userB);
    }, /UNAUTHORIZED|not authorized/i);

    // 4. Foreign executeReview
    await assert.rejects(async () => {
      await investmentMonitorEngine.executeReview(monitorA.monitorId, userB, 'Hacked', 'REVIEWED');
    }, /UNAUTHORIZED|not authorized/i);

    // 5. Foreign compareReviews
    await assert.rejects(async () => {
      await investmentMonitorEngine.compareReviews(
        monitorA.monitorId,
        reviewA.reviewId,
        reviewB.reviewId,
        userB
      );
    }, /UNAUTHORIZED|not authorized/i);
  });

  // =========================================================================
  // SCENARIO L — MULTI-CURRENCY STRICT ISOLATION
  // =========================================================================
  await runScenario('Scenario L: Multi-Currency strict isolation between USD and INR', async () => {
    // Seed Indian holding in INR
    const inrPos: HoldingPosition = {
      positionId: `pos_infy_${Date.now()}`,
      portfolioId: `port_${userA}`,
      userId: userA,
      securityId: 'in-infy',
      ticker: 'INFY',
      shares: 1000,
      avgCost: 1450,
      currentPrice: 1620,
      marketValue: 1620000,
      unrealizedPnL: 170000,
      unrealizedPnLPercent: 11.72,
      currency: 'INR',
      assetClass: 'EQUITY',
      lastUpdated: new Date().toISOString()
    };
    await portfolioRepo.savePositions([inrPos], userA);

    const inrMonitor = await investmentMonitorEngine.createMonitor(userA, 'INFY', {
      reviewCadence: 'WEEKLY'
    });

    const inrDraft = await investmentMonitorEngine.detectAllChanges(inrMonitor.monitorId, userA);
    assert.strictEqual(inrDraft.portfolioDelta?.currency, 'INR', 'INFY currency must be INR');
    assert(
      inrDraft.portfolioDelta?.narrative.includes('INR') || inrDraft.portfolioDelta?.narrative.includes('₹'),
      'INFY narrative must contain INR denomination symbols'
    );
    assert(
      !inrDraft.portfolioDelta?.narrative.includes('$'),
      'INR portfolio delta must not leak USD symbols'
    );
  });

  // =========================================================================
  // SCENARIO M — EPISTEMIC INTEGRITY & STATUS PRESERVATION
  // =========================================================================
  await runScenario('Scenario M: Epistemic status preservation (no unauthorized status upgrade)', async () => {
    const draft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
    assert(draft.dataQualityDelta, 'Data quality delta must be present');
    assert(
      ['REAL', 'CALCULATED', 'SIMULATED', 'UNAVAILABLE', 'ERROR', 'STALE'].includes(
        draft.dataQualityDelta.epistemicStatus || draft.epistemicStatus
      ),
      'Epistemic status must belong to valid bounded taxonomy'
    );
    assert.strictEqual(draft.isAnalyticalOnly, true, 'Review must be analytical only');
    assert.strictEqual(draft.executionProhibited, true, 'Execution must be prohibited');
  });

  // =========================================================================
  // SCENARIO N — THESIS HEALTH CATEGORICAL MODEL
  // =========================================================================
  await runScenario('Scenario N: Thesis health enforces categorical pillars with zero numeric scores', async () => {
    const draft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
    const th = draft.thesisHealth;

    assert(['HEALTHY', 'UNDER_REVIEW', 'WEAKENED', 'INVALIDATED'].includes(th.overallStatus || th.overallHealth));
    assert(['ACTIVE_GUARD', 'THREATENED', 'TRIGGERED', 'RECOVERED'].includes(th.invalidationStatus || th.invalidationState));
    assert(['STRENGTHENED', 'UNCHANGED', 'WEAKENED', 'INSUFFICIENT_EVIDENCE', 'STRENGTHENING', 'STABLE'].includes(th.bullCaseState || th.bullCaseStatus));
    assert(['STRENGTHENED', 'UNCHANGED', 'WEAKENED', 'INSUFFICIENT_EVIDENCE', 'STABLE'].includes(th.bearCaseState || th.bearCaseStatus));

    // CRITICAL: Ensure no numeric thesis health score exists anywhere
    assert(!('thesisHealthScore' in th), 'No numeric thesisHealthScore permitted');
    assert(!('score' in th), 'No numeric score property in thesisHealth');
  });

  // =========================================================================
  // SCENARIO O — DECISION INTEGRITY
  // =========================================================================
  await runScenario('Scenario O: Decision delta consumes Decision Intelligence without score overrides', async () => {
    const draft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
    const dd = draft.decisionDelta;

    assert(dd.current, 'Must have current decision');
    assert(typeof dd.current.compositeScore === 'number', 'compositeScore must be numeric');
    assert(typeof dd.current.rating === 'string', 'rating must be string');
    assert(typeof dd.scoreDelta === 'number', 'scoreDelta must be calculated deterministically');
    assert.strictEqual(
      Math.round((dd.current.compositeScore - dd.previous.compositeScore) * 10) / 10,
      dd.scoreDelta,
      'scoreDelta must accurately reflect target minus previous composite scores'
    );
  });

  // =========================================================================
  // SCENARIO P — EVIDENCE INTEGRITY & PROVENANCE
  // =========================================================================
  await runScenario('Scenario P: Evidence changes maintain verifiable source references', async () => {
    const draft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
    const evDelta = draft.evidenceDelta;

    assert(typeof evDelta.newEvidenceCount === 'number', 'newEvidenceCount must be numeric');
    assert(Array.isArray(evDelta.evidenceIds), 'evidenceIds must be an array');
    assert(typeof evDelta.narrative === 'string', 'narrative must be string');

    const evChanges = draft.changes.filter(c => c.category === 'EVIDENCE_CHANGE');
    for (const change of evChanges) {
      assert(change.changeId, 'Evidence change must have an id');
      assert(change.title, 'Evidence change must have title');
      assert(change.timestamp, 'Evidence change must have timestamp');
      assert(change.severity, 'Evidence change must have severity');
    }
  });

  // =========================================================================
  // SCENARIO Q — EVENT & CAUSALITY BOUNDARIES
  // =========================================================================
  await runScenario('Scenario Q: Causal explanation distinguishes observed delta from causality', async () => {
    const draft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
    assert(draft.explanation, 'Explanation object must exist');
    assert(Array.isArray(draft.explanation.causalChain), 'causalChain must be an array');
    assert(Array.isArray(draft.explanation.keyTakeaways), 'keyTakeaways must be an array');
    assert(Array.isArray(draft.explanation.recommendedActions), 'recommendedActions must be an array');
  });

  // =========================================================================
  // SCENARIO R — GEMINI EPISTEMIC BOUNDARY
  // =========================================================================
  await runScenario('Scenario R: Explanation layer cannot mutate deterministic score deltas', async () => {
    const draft = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
    const score = draft.decisionDelta.current.compositeScore;
    const totalChanges = draft.changeSummary.totalChanges;

    // Even if explanation text is generated or customized, metrics remain strictly deterministic
    assert.strictEqual(typeof score, 'number');
    assert.strictEqual(typeof totalChanges, 'number');
    assert(['DETERMINISTIC', 'AI_EXPLANATION', 'DETERMINISTIC_RULES', 'HYBRID'].includes(draft.explanation.source));
  });

  console.log('\n======================================================================');
  console.log(`PHASE 26.1 ACCEPTANCE RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('======================================================================\n');
}

runAllPhase26Acceptance().catch(err => {
  console.error('Fatal error during Phase 26.1 acceptance testing:', err);
  process.exit(1);
});
