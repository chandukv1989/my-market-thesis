/**
 * PHASE 28 — INVESTMENT DISCOVERY & RESEARCH PRIORITIZATION ACCEPTANCE TEST SUITE
 * 
 * Strict E2E verification of Research Discovery & Prioritization Engine:
 *  - Scenario A: Deterministic Universe Building (PORTFOLIO, WATCHLIST, MONITORED, RESEARCHED, ALL)
 *  - Scenario B: Signal Evaluation from Canonical Engines (Events, Thesis, Decisions, Alerts, Concentration)
 *  - Scenario C: Deterministic Priority Classification (CRITICAL, HIGH, MEDIUM, LOW, ROUTINE)
 *  - Scenario D: Multi-Signal Convergence Scoring (Distinct analytical categories firing)
 *  - Scenario E: Point-in-Time (PIT) Zero Lookahead (Strict cutoff excludes future events & decisions)
 *  - Scenario F: Epistemic Status Preservation (SIMULATED != REAL preserved through provenance)
 *  - Scenario G: Multi-Tenant Isolation & IDOR Protection (User A never sees User B's priorities or snapshots)
 *  - Scenario H: Multi-Currency Strict Isolation (USD vs INR native currency preserved, no FX mixing)
 *  - Scenario I: Strict Analytical Boundary (isAnalyticalOnly: true, executionProhibited: true)
 *  - Scenario J: Review Workspace Integration & Deep Links
 *  - Scenario K: Snapshot Persistence & Historical Retrieval
 *  - Scenario L: Gemini Briefing Safe Fallback & Non-Interference with Deterministic Rank
 */

import assert from 'node:assert';
import { researchPrioritizationEngine } from '../server/services/discovery/researchPrioritizationEngine';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { authorizationService, AuthorizationError } from '../server/auth/authorizationService';
import {
  InvestmentEvent,
  InvestmentMonitor,
  InvestmentMonitorReview,
  InvestmentDecisionAssessment,
  AlertInstance,
  HoldingPosition,
  ResearchPrioritySnapshot,
  ResearchPriorityItem
} from '../src/types';

console.log('======================================================================');
console.log('PHASE 28: INVESTMENT DISCOVERY & PRIORITIZATION ACCEPTANCE TEST SUITE');
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

async function runAllTests() {
  const userA = 'analyst_alpha_p28';
  const userB = 'analyst_beta_p28';

  const portfolioRepo = persistenceManager.getPortfolioRepository();
  const watchlistRepo = persistenceManager.getWatchlistRepository();
  const monitorRepo = persistenceManager.getMonitorRepository();
  const monitorReviewRepo = persistenceManager.getMonitorReviewRepository();
  const eventRepo = persistenceManager.getEventRepository();
  const decisionRepo = persistenceManager.getDecisionRepository();
  const alertRepo = persistenceManager.getAlertOrchestrationRepository();
  const priorityRepo = persistenceManager.getResearchPriorityRepository();

  // --------------------------------------------------------------------------
  // SCENARIO A: Deterministic Universe Building
  // --------------------------------------------------------------------------
  await runScenario('Scenario A: Deterministic Universe Building', async () => {
    // Seed portfolio for User A
    const posA: HoldingPosition = {
      ticker: 'NVDA',
      securityId: 'us-nvda',
      shares: 50,
      avgCost: 110,
      marketValue: 6000,
      currency: 'USD',
      market: 'US',
      userId: userA,
      ownerUserId: userA
    };
    await portfolioRepo.savePositions([posA]);

    // Seed watchlist for User A
    await watchlistRepo.saveWatchlist(['MSFT'], userA);

    const portfolioUniverse = await researchPrioritizationEngine.buildUniverse(userA, 'PORTFOLIO');
    assert.strictEqual(portfolioUniverse.length, 1, 'Should contain exactly 1 portfolio holding');
    assert.strictEqual(portfolioUniverse[0].symbol, 'NVDA');

    const watchlistUniverse = await researchPrioritizationEngine.buildUniverse(userA, 'WATCHLIST');
    assert.strictEqual(watchlistUniverse.length, 1, 'Should contain exactly 1 watchlist item');
    assert.strictEqual(watchlistUniverse[0].symbol, 'MSFT');

    const allUniverse = await researchPrioritizationEngine.buildUniverse(userA, 'ALL');
    assert(allUniverse.length > 5, 'ALL universe should include portfolio, watchlist, and canonical securities');
    assert(allUniverse.some(s => s.symbol === 'NVDA'));
    assert(allUniverse.some(s => s.symbol === 'MSFT'));
  });

  // --------------------------------------------------------------------------
  // SCENARIO B: Deterministic Signal Evaluation from Canonical Engines
  // --------------------------------------------------------------------------
  await runScenario('Scenario B: Deterministic Signal Evaluation from Canonical Engines', async () => {
    const secId = 'us-aapl';

    // 1. Seed an Investment Event
    const event: InvestmentEvent = {
      eventId: 'evt_p28_apple_antitrust',
      securityId: secId,
      ticker: 'AAPL',
      title: 'DoJ Antitrust Trial Commences',
      summary: 'Regulatory scrutiny over App Store practices enters trial phase.',
      eventDate: '2026-06-15T12:00:00Z',
      availableAt: '2026-06-15T12:05:00Z',
      announcedAt: '2026-06-15T12:00:00Z',
      eventType: 'SEC_FILING',
      sourceType: 'SEC_8K',
      sourceReference: '0000320193-26-00001',
      significance: {
        overallScore: 0.85,
        affectsThesis: 'YES',
        affectsDecision: 'YES',
        affectsPortfolio: 'YES',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'YES'
      },
      epistemicStatus: 'REAL',
      isSimulated: false,
      market: 'US',
      exchange: 'NASDAQ',
      evidenceIds: [],
      createdAt: '2026-06-15T12:05:00Z'
    };
    await eventRepo.save(event);

    // 2. Seed an Investment Monitor with Invalidation
    const monitor: InvestmentMonitor = {
      monitorId: 'mon_p28_aapl',
      userId: userA,
      ownerUserId: userA,
      securityId: secId,
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      market: 'US',
      status: 'ACTIVE',
      reviewCadence: 'WEEKLY',
      thesisStatus: 'INVALIDATED',
      invalidationStatus: 'TRIGGERED',
      portfolioExposure: { hasExposure: true, weightPct: 12 },
      epistemicStatus: 'REAL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-06-16T00:00:00Z',
      lastReviewedAt: '2026-06-16T10:00:00Z',
      isAnalyticalOnly: true,
      executionProhibited: true
    };
    await monitorRepo.save(monitor);

    const review: InvestmentMonitorReview = {
      reviewId: 'rev_p28_aapl_1',
      monitorId: monitor.monitorId,
      userId: userA,
      ownerUserId: userA,
      securityId: secId,
      ticker: 'AAPL',
      reviewedAt: '2026-06-16T10:00:00Z',
      asOfDate: '2026-06-16T10:00:00Z',
      thesisDelta: {
        currentStatus: 'INVALIDATED',
        invalidationTriggered: true,
        summary: 'Regulatory breach triggered primary thesis invalidation.'
      } as any,
      thesisHealth: {} as any,
      changes: [],
      changeSummary: { headline: 'Thesis Invalidation' } as any,
      explanation: {
        summary: 'Thesis invalidated due to regulatory enforcement.',
        source: 'DETERMINISTIC',
        causalChain: ['Regulatory enforcement', 'Core pillar breached']
      },
      analystNotes: [],
      epistemicStatus: 'REAL',
      isAnalyticalOnly: true,
      executionProhibited: true
    };
    await monitorReviewRepo.save(review);

    const evalResult = await researchPrioritizationEngine.evaluateSecuritySignals(
      userA,
      { id: secId, symbol: 'AAPL', companyName: 'Apple Inc.', market: 'US', exchange: 'NASDAQ', country: 'US', currency: 'USD' },
      '2026-06-20T00:00:00Z'
    );

    assert(evalResult.signals.length >= 2, 'Should identify event and thesis signals');
    assert(evalResult.signals.some(s => s.signalType === 'MATERIAL_EVENT'), 'Should detect material event');
    assert(evalResult.signals.some(s => s.signalType === 'THESIS_CHANGE'), 'Should detect thesis change');
    assert.strictEqual(evalResult.thesisState, 'INVALIDATED');
  });

  // --------------------------------------------------------------------------
  // SCENARIO C: Deterministic Priority Classification
  // --------------------------------------------------------------------------
  await runScenario('Scenario C: Deterministic Priority Classification (Zero LLM)', () => {
    // 1. Test CRITICAL Priority triggers
    const criticalResult = researchPrioritizationEngine.computeDeterministicPriority(
      [
        {
          signalId: 's1',
          signalType: 'THESIS_CHANGE',
          title: 'Thesis Invalidated',
          summary: 'Core pillar breached',
          severity: 'CRITICAL',
          detectedAt: '2026-06-16T00:00:00Z',
          epistemicStatus: 'CALCULATED',
          isSimulated: false,
          sourceType: 'MONITOR_REVIEW',
          sourceReference: 'rev1',
          engine: 'InvestmentMonitorEngine'
        }
      ],
      { weightPct: 15 },
      'INVALIDATED'
    );
    assert.strictEqual(criticalResult.priority, 'CRITICAL');
    assert(criticalResult.primaryReason.includes('Thesis Invalidated'));

    // 2. Test HIGH Priority triggers
    const highResult = researchPrioritizationEngine.computeDeterministicPriority(
      [
        {
          signalId: 's2',
          signalType: 'MATERIAL_EVENT',
          title: 'Regulatory Investigation',
          summary: 'Formal notice received',
          severity: 'HIGH',
          detectedAt: '2026-06-16T00:00:00Z',
          epistemicStatus: 'REAL',
          isSimulated: false,
          sourceType: 'EVENT',
          sourceReference: 'evt1',
          engine: 'InvestmentEventEngine'
        }
      ],
      { weightPct: 6 },
      'ACTIVE'
    );
    assert.strictEqual(highResult.priority, 'HIGH');

    // 3. Test ROUTINE Priority
    const routineResult = researchPrioritizationEngine.computeDeterministicPriority([], { weightPct: 2 }, 'ACTIVE');
    assert.strictEqual(routineResult.priority, 'ROUTINE');
  });

  // --------------------------------------------------------------------------
  // SCENARIO D: Multi-Signal Convergence Scoring
  // --------------------------------------------------------------------------
  await runScenario('Scenario D: Multi-Signal Convergence Scoring', () => {
    const signals: any[] = [
      { signalId: '1', signalType: 'MATERIAL_EVENT', severity: 'HIGH' },
      { signalId: '2', signalType: 'DECISION_DRIFT', severity: 'MEDIUM' },
      { signalId: '3', signalType: 'PORTFOLIO_EXPOSURE', severity: 'HIGH' }
    ];

    const result = researchPrioritizationEngine.computeDeterministicPriority(signals);
    assert.strictEqual(result.convergenceScore, 3, 'Convergence score must equal distinct signal category count');
    assert.strictEqual(result.priority, 'HIGH', '3 distinct signal categories should elevate to HIGH');
  });

  // --------------------------------------------------------------------------
  // SCENARIO E: Point-in-Time (PIT) Zero Lookahead
  // --------------------------------------------------------------------------
  await runScenario('Scenario E: Point-in-Time (PIT) Zero Lookahead', async () => {
    const secId = 'us-msft';

    // Event occurring on 2026-08-01
    const futureEvent: InvestmentEvent = {
      eventId: 'evt_p28_future_event',
      securityId: secId,
      ticker: 'MSFT',
      title: 'Future Acquisition Announcement',
      summary: 'Major acquisition announced in future.',
      eventDate: '2026-08-01T12:00:00Z',
      availableAt: '2026-08-01T12:00:00Z',
      announcedAt: '2026-08-01T12:00:00Z',
      eventType: 'CORPORATE_ACTION',
      sourceType: 'PRESS_RELEASE',
      sourceReference: 'pr_future',
      significance: {
        overallScore: 0.9,
        affectsThesis: 'YES',
        affectsDecision: 'YES',
        affectsPortfolio: 'NO',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'YES'
      },
      epistemicStatus: 'REAL',
      isSimulated: false,
      market: 'US',
      exchange: 'NASDAQ',
      evidenceIds: [],
      createdAt: '2026-08-01T12:00:00Z'
    };
    await eventRepo.save(futureEvent);

    // Evaluate AS OF 2026-07-01 (before future event)
    const pitResult = await researchPrioritizationEngine.evaluateSecuritySignals(
      userA,
      { id: secId, symbol: 'MSFT', companyName: 'Microsoft Corp', market: 'US', exchange: 'NASDAQ', country: 'US', currency: 'USD' },
      '2026-07-01T00:00:00Z'
    );

    const hasFutureSignal = pitResult.signals.some(s => s.signalId === 'sig_evt_evt_p28_future_event');
    assert.strictEqual(hasFutureSignal, false, 'Future event must NOT be detected prior to its publication date (zero lookahead)');

    // Evaluate AS OF 2026-08-10 (after future event)
    const postResult = await researchPrioritizationEngine.evaluateSecuritySignals(
      userA,
      { id: secId, symbol: 'MSFT', companyName: 'Microsoft Corp', market: 'US', exchange: 'NASDAQ', country: 'US', currency: 'USD' },
      '2026-08-10T00:00:00Z'
    );
    const detectedAfter = postResult.signals.some(s => s.signalId === 'sig_evt_evt_p28_future_event');
    assert.strictEqual(detectedAfter, true, 'Event must be detected when asOfDate is after publication date');
  });

  // --------------------------------------------------------------------------
  // SCENARIO F: Epistemic Status Integrity (SIMULATED != REAL)
  // --------------------------------------------------------------------------
  await runScenario('Scenario F: Epistemic Status Integrity (SIMULATED != REAL)', async () => {
    const secId = 'us-tsla';

    const simEvent: InvestmentEvent = {
      eventId: 'evt_p28_simulated',
      securityId: secId,
      ticker: 'TSLA',
      title: 'Simulated Stress Test Shock',
      summary: 'Synthetic macro demand shock scenario applied.',
      eventDate: '2026-06-01T00:00:00Z',
      availableAt: '2026-06-01T00:00:00Z',
      announcedAt: '2026-06-01T00:00:00Z',
      eventType: 'MARKET_EVENT',
      sourceType: 'SYNTHETIC_SHOCK',
      sourceReference: 'sim_shock_1',
      significance: {
        overallScore: 0.9,
        affectsThesis: 'YES',
        affectsDecision: 'YES',
        affectsPortfolio: 'YES',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'YES'
      },
      epistemicStatus: 'SIMULATED',
      isSimulated: true,
      market: 'US',
      exchange: 'NASDAQ',
      evidenceIds: [],
      createdAt: '2026-06-01T00:00:00Z'
    };
    await eventRepo.save(simEvent);

    const evalResult = await researchPrioritizationEngine.evaluateSecuritySignals(
      userA,
      { id: secId, symbol: 'TSLA', companyName: 'Tesla Inc.', market: 'US', exchange: 'NASDAQ', country: 'US', currency: 'USD' },
      '2026-06-10T00:00:00Z'
    );

    assert.strictEqual(evalResult.epistemicStatus, 'SIMULATED', 'Snapshot item must inherit SIMULATED epistemic status');
    assert.strictEqual(evalResult.isSimulated, true, 'isSimulated must be true for simulated events');
  });

  // --------------------------------------------------------------------------
  // SCENARIO G: Multi-Tenant Isolation & IDOR Protection
  // --------------------------------------------------------------------------
  await runScenario('Scenario G: Multi-Tenant Isolation & IDOR Protection', async () => {
    // Generate snapshot for User A
    const snapA = await researchPrioritizationEngine.generatePrioritization(userA, { universeType: 'PORTFOLIO' });
    assert.strictEqual(snapA.userId, userA);

    // User A can access their own snapshot
    const authorized = await authorizationService.authorizeResearchPrioritySnapshot(snapA.snapshotId, userA);
    assert.strictEqual(authorized.snapshotId, snapA.snapshotId);

    // User B trying to access User A's snapshot must be REJECTED
    let caughtAuthError = false;
    try {
      await authorizationService.authorizeResearchPrioritySnapshot(snapA.snapshotId, userB);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        caughtAuthError = true;
        assert.strictEqual(err.statusCode, 403);
      }
    }
    assert.strictEqual(caughtAuthError, true, 'User B must be forbidden from accessing User A snapshot');
  });

  // --------------------------------------------------------------------------
  // SCENARIO H: Multi-Currency Strict Isolation (USD vs INR)
  // --------------------------------------------------------------------------
  await runScenario('Scenario H: Multi-Currency Strict Isolation (USD vs INR)', async () => {
    const usSec = { id: 'us-nvda', symbol: 'NVDA', companyName: 'NVIDIA', market: 'US' as any, currency: 'USD', exchange: 'NASDAQ' as any, country: 'US' };
    const inSec = { id: 'in-reliance', symbol: 'RELIANCE', companyName: 'Reliance Industries', market: 'INDIA' as any, currency: 'INR', exchange: 'NSE' as any, country: 'IN' };

    const resUS = await researchPrioritizationEngine.evaluateSecuritySignals(userA, usSec);
    const resIN = await researchPrioritizationEngine.evaluateSecuritySignals(userA, inSec);

    assert.strictEqual(usSec.currency, 'USD');
    assert.strictEqual(inSec.currency, 'INR');

    // Confirm generated priority items preserve native currency without FX contamination
    const snap = await researchPrioritizationEngine.generatePrioritization(userA, {
      securityIds: ['us-nvda', 'in-reliance'],
      universeType: 'ALL'
    });

    const itemUS = snap.items.find(i => i.symbol === 'NVDA');
    const itemIN = snap.items.find(i => i.symbol === 'RELIANCE');

    assert(itemUS, 'US item must exist');
    assert(itemIN, 'Indian item must exist');
    assert.strictEqual(itemUS.currency, 'USD');
    assert.strictEqual(itemIN.currency, 'INR');
    assert.strictEqual(itemUS.market, 'US');
    assert.strictEqual(itemIN.market, 'INDIA');
  });

  // --------------------------------------------------------------------------
  // SCENARIO I: Strict Analytical Boundary
  // --------------------------------------------------------------------------
  await runScenario('Scenario I: Strict Analytical Boundary (isAnalyticalOnly & executionProhibited)', async () => {
    const snap = await researchPrioritizationEngine.generatePrioritization(userA, { universeType: 'PORTFOLIO' });
    assert.strictEqual(snap.isAnalyticalOnly, true, 'Snapshot must enforce isAnalyticalOnly: true');
    assert.strictEqual(snap.executionProhibited, true, 'Snapshot must enforce executionProhibited: true');

    snap.items.forEach(item => {
      assert.strictEqual(item.isAnalyticalOnly, true, 'Item must enforce isAnalyticalOnly: true');
      assert.strictEqual(item.executionProhibited, true, 'Item must enforce executionProhibited: true');
    });
  });

  // --------------------------------------------------------------------------
  // SCENARIO J: Review Workspace Deep-Linking
  // --------------------------------------------------------------------------
  await runScenario('Scenario J: Review Workspace Deep-Linking', async () => {
    const item = await researchPrioritizationEngine.getSecurityPriority(userA, 'us-aapl');
    assert(item, 'Item must exist');
    assert(item.reviewDeepLink.includes('securityId=us-aapl'), 'Deep link must route directly to investment review for security');
  });

  // --------------------------------------------------------------------------
  // SCENARIO K: Snapshot Persistence & Historical Retrieval
  // --------------------------------------------------------------------------
  await runScenario('Scenario K: Snapshot Persistence & Historical Retrieval', async () => {
    const created = await researchPrioritizationEngine.generatePrioritization(userA, { universeType: 'ALL', limit: 5 });
    const fetched = await priorityRepo.getSnapshot(created.snapshotId);
    assert(fetched, 'Snapshot must be retrievable from repository');
    assert.strictEqual(fetched.snapshotId, created.snapshotId);
    assert.strictEqual(fetched.items.length, created.items.length);

    const userSnapshots = await priorityRepo.getSnapshotsByUserId(userA);
    assert(userSnapshots.length >= 1, 'User must have at least 1 saved snapshot');
  });

  // --------------------------------------------------------------------------
  // SCENARIO L: Gemini Briefing Safe Fallback & Non-Interference
  // --------------------------------------------------------------------------
  await runScenario('Scenario L: Gemini Briefing Safe Fallback & Non-Interference', async () => {
    const item: ResearchPriorityItem = {
      id: 'test_item_1',
      securityId: 'us-nvda',
      symbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      market: 'US',
      currency: 'USD',
      userId: userA,
      ownerUserId: userA,
      priority: 'HIGH',
      primaryReason: 'Concentration risk with active material event',
      reasons: ['Portfolio concentration > 15%', 'Earnings filing released'],
      signals: [
        {
          signalId: 's1',
          signalType: 'MATERIAL_EVENT',
          title: 'Earnings Release',
          summary: 'Q2 revenue grew 122% YoY.',
          severity: 'HIGH',
          detectedAt: '2026-06-01T00:00:00Z',
          epistemicStatus: 'REAL',
          isSimulated: false,
          sourceType: 'SEC_FILING',
          sourceReference: '8-K',
          engine: 'InvestmentEventEngine'
        }
      ],
      signalCount: 1,
      signalConvergenceScore: 1,
      evidenceStatus: { totalCount: 5, conflictCount: 0, gapCount: 0, isStale: false },
      activeAlertCount: 0,
      freshnessStatus: 'FRESH',
      asOfDate: '2026-06-01T00:00:00Z',
      epistemicStatus: 'REAL',
      isSimulated: false,
      isAnalyticalOnly: true,
      executionProhibited: true,
      reviewDeepLink: '/monitor-review/nvda',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z'
    };

    const briefing = await researchPrioritizationEngine.generateAnalyticalBriefing(item);
    assert(typeof briefing === 'string' && briefing.length > 20, 'Briefing must return an institutional synthesis string');
    assert.strictEqual(item.priority, 'HIGH', 'Priority rank must remain strictly deterministic and unmutated by briefing');
  });

  console.log('\n======================================================================');
  console.log(`ALL PHASE 28 ACCEPTANCE TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('======================================================================\n');
}

runAllTests().catch(err => {
  console.error('\nFATAL ERROR IN ACCEPTANCE SUITE:', err);
  process.exit(1);
});
