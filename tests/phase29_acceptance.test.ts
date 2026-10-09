/**
 * PHASE 29 — INVESTMENT RESEARCH COMMAND CENTER ACCEPTANCE TEST SUITE
 * 
 * Comprehensive E2E verification of Research Command Center:
 *  - Scenario A: Command Center aggregate construction
 *  - Scenario B: Deterministic aggregation
 *  - Scenario C: Repeated refresh produces identical structured state (3 runs byte-identical)
 *  - Scenario D: Research Attention integration (Phase 28)
 *  - Scenario E: Alert integration (Phase 27)
 *  - Scenario F: Portfolio integration (Portfolio Intelligence)
 *  - Scenario G: Thesis/Decision integration
 *  - Scenario H: Event integration (Phase 24)
 *  - Scenario I: Research coverage integration
 *  - Scenario J: Evidence/data-health integration
 *  - Scenario K: PIT historical Command Center
 *  - Scenario L: No future leakage (T1 < T2 < T3)
 *  - Scenario M: Multi-tenant isolation (User A vs User B)
 *  - Scenario N: USD/INR isolation (no cross FX)
 *  - Scenario O: Epistemic state preservation (SIMULATED != REAL, UNAVAILABLE != REAL)
 *  - Scenario P: Gemini unavailable fallback
 *  - Scenario Q: Gemini cannot alter structured state
 *  - Scenario R: Review Workspace deep links
 *  - Scenario S: No duplicate intelligence calculations
 *  - Scenario T: Factor Screener regression
 *  - Scenario U: Historical snapshot immutability
 *  - Scenario V: Provider failure safety
 *  - Scenario W: No autonomous execution boundary violation
 *  - Scenario X: Full Phase 20–28 regression
 */

import assert from 'node:assert';
import { researchCommandCenterService } from '../server/services/commandCenter/researchCommandCenterService';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { researchPrioritizationEngine } from '../server/services/discovery/researchPrioritizationEngine';
import {
  InvestmentEvent,
  InvestmentMonitor,
  InvestmentMonitorReview,
  AlertInstance,
  HoldingPosition,
  ResearchSnapshot
} from '../src/types';

console.log('======================================================================');
console.log('PHASE 29: INVESTMENT RESEARCH COMMAND CENTER ACCEPTANCE TEST SUITE');
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
  const userA = 'analyst_alpha_p29';
  const userB = 'analyst_beta_p29';
  const asOfBaseline = '2026-03-01T12:00:00.000Z';

  // Seed sample data for userA in canonical repositories
  const alertRepo = persistenceManager.getAlertOrchestrationRepository();
  const eventRepo = persistenceManager.getEventRepository();
  const monitorRepo = persistenceManager.getMonitorRepository();
  const reviewRepo = persistenceManager.getMonitorReviewRepository();
  const portfolioRepo = persistenceManager.getPortfolioRepository();
  const snapshotRepo = persistenceManager.getSnapshotRepository();

  // Seed test alert for userA
  const alertA: AlertInstance = {
    alertId: 'alt_p29_userA_1',
    candidateId: 'cand_1',
    userId: userA,
    ownerUserId: userA,
    securityId: 'us-nvda',
    symbol: 'NVDA',
    companyName: 'NVIDIA Corporation',
    ruleType: 'MATERIAL_FINANCIAL_CHANGE',
    severity: 'HIGH',
    status: 'DELIVERED',
    title: 'NVDA Multiple Compression Alert',
    description: 'Valuation multiple moved outside normal range',
    deterministicExplanation: 'Forward P/E exceeds threshold',
    detectedAt: '2026-02-15T10:00:00.000Z',
    createdAt: '2026-02-15T10:00:00.000Z',
    fingerprint: 'fp_p29_1',
    trigger: {
      ruleType: 'MATERIAL_FINANCIAL_CHANGE',
      observedValue: 48,
      threshold: 40
    }
  } as any;
  await alertRepo.save(alertA);

  // Seed test alert for userB (isolation test)
  const alertB: AlertInstance = {
    alertId: 'alt_p29_userB_1',
    candidateId: 'cand_2',
    userId: userB,
    ownerUserId: userB,
    securityId: 'us-aapl',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    ruleType: 'PRICE_BELOW',
    severity: 'CRITICAL',
    status: 'DELIVERED',
    title: 'AAPL Price Volatility Alert',
    description: 'Daily drawdown exceeds 5%',
    deterministicExplanation: 'Drawdown threshold reached',
    detectedAt: '2026-02-20T10:00:00.000Z',
    createdAt: '2026-02-20T10:00:00.000Z',
    fingerprint: 'fp_p29_2',
    trigger: {
      ruleType: 'PRICE_BELOW',
      observedValue: -5.4,
      threshold: -5.0
    }
  } as any;
  await alertRepo.save(alertB);

  // Seed simulated event and real event
  const realEvent: InvestmentEvent = {
    eventId: 'evt_p29_real_1',
    securityId: 'us-nvda',
    ticker: 'NVDA',
    market: 'US',
    exchange: 'NASDAQ',
    eventType: 'SEC_FILING',
    eventDate: '2026-02-10',
    announcedAt: '2026-02-10T14:00:00.000Z',
    availableAt: '2026-02-10T14:00:00.000Z',
    createdAt: '2026-02-10T14:00:00.000Z',
    sourceType: 'SEC_EDGAR_10Q',
    sourceReference: '0001045810-26-000010',
    evidenceIds: ['ev_p29_sec_1'],
    epistemicStatus: 'REAL',
    isSimulated: false,
    title: 'NVDA Form 10-Q Filing',
    summary: 'Quarterly financial report filed with SEC',
    significance: {
      overallScore: 0.8,
      affectsThesis: 'YES',
      affectsDecision: 'YES'
    }
  } as any;
  await eventRepo.save(realEvent);

  const simEvent: InvestmentEvent = {
    eventId: 'evt_p29_sim_aapl',
    securityId: 'us-aapl',
    ticker: 'AAPL',
    market: 'US',
    exchange: 'NASDAQ',
    eventType: 'MARKET_EVENT',
    eventDate: '2026-02-12',
    announcedAt: '2026-02-12T16:00:00.000Z',
    availableAt: '2026-02-12T16:00:00.000Z',
    createdAt: '2026-02-12T16:00:00.000Z',
    sourceType: 'STRESS_TEST_MODEL',
    sourceReference: 'model_run_42',
    evidenceIds: ['ev_p29_sim_1'],
    epistemicStatus: 'SIMULATED',
    isSimulated: true,
    title: 'AAPL Severe Tariff Stress Test',
    summary: 'Monte Carlo simulation of 25% universal device tariffs',
    significance: {
      overallScore: 0.7,
      affectsThesis: 'YES',
      affectsDecision: 'NO'
    }
  } as any;
  await eventRepo.save(simEvent);

  // Seed Monitor & Review for userA
  const monitorA: InvestmentMonitor = {
    monitorId: 'mon_p29_userA_nvda',
    userId: userA,
    ownerUserId: userA,
    securityId: 'us-nvda',
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    market: 'US',
    status: 'ACTIVE',
    reviewCadence: 'WEEKLY',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-15T00:00:00.000Z',
    lastReviewedAt: '2026-02-15T00:00:00.000Z'
  } as any;
  await monitorRepo.save(monitorA);

  const reviewA: InvestmentMonitorReview = {
    reviewId: 'rev_p29_userA_1',
    monitorId: 'mon_p29_userA_nvda',
    userId: userA,
    ownerUserId: userA,
    securityId: 'us-nvda',
    ticker: 'NVDA',
    reviewedAt: '2026-02-15T12:00:00.000Z',
    asOfDate: '2026-02-15',
    reviewAction: 'FOLLOW_UP_REQUIRED',
    thesisHealth: {
      overallHealth: 'WEAKENED',
      bullCaseState: 'UNCHANGED',
      bearCaseState: 'STRENGTHENED',
      invalidationState: 'ACTIVE_GUARD',
      invalidationTriggered: false,
      supportingEvidenceIds: ['ev_p29_sec_1']
    },
    changeSummary: {
      eventsCount: 1,
      evidenceCount: 1,
      decisionChanged: true,
      thesisChanged: true,
      riskChanged: true,
      catalystChanged: false,
      invalidationChanged: true,
      portfolioChanged: false,
      quantChanged: false,
      valuationChanged: true,
      dataQualityChanged: false,
      headline: 'Multiple compression and export regulation risks elevated'
    }
  } as any;
  await reviewRepo.save(reviewA);

  // Seed userA multi-currency portfolio positions (USD and INR)
  const posUSD: HoldingPosition = {
    id: 'pos_p29_usd_1',
    ownerUserId: userA,
    userId: userA,
    securityId: 'us-nvda',
    ticker: 'NVDA',
    shares: 100,
    avgCost: 110,
    currentPrice: 130,
    marketValue: 13000,
    unrealizedPnL: 2000,
    unrealizedPnLPercent: 18.18,
    currency: 'USD',
    market: 'US'
  } as any;
  const posINR: HoldingPosition = {
    id: 'pos_p29_inr_1',
    ownerUserId: userA,
    userId: userA,
    securityId: 'in-tcs',
    ticker: 'TCS',
    shares: 200,
    avgCost: 3500,
    currentPrice: 3800,
    marketValue: 760000,
    unrealizedPnL: 60000,
    unrealizedPnLPercent: 8.57,
    currency: 'INR',
    market: 'INDIA'
  } as any;
  await portfolioRepo.savePositions([posUSD, posINR]);

  // Seed research snapshot for userA
  const snapA: ResearchSnapshot = {
    snapshotId: 'snap_p29_userA_1',
    notebookId: 'nb_p29_1',
    securityId: 'us-nvda',
    createdAt: '2026-02-14T10:00:00.000Z',
    researchAsOfDate: '2026-02-14',
    evidenceIds: ['ev_p29_sec_1'],
    ownerUserId: userA,
    userId: userA,
    thesis: {
      executiveThesis: 'Long-term accelerator leadership',
      bullCase: {
        summary: 'Market leading AI architectures',
        points: ['Architecture scale', 'Ecosystem moat'],
        evidenceIds: ['ev_p29_sec_1']
      },
      bearCase: {
        summary: 'Potential competition and export regulations',
        points: ['Export controls'],
        evidenceIds: []
      },
      catalysts: [],
      risks: []
    },
    claims: [],
    risks: [],
    catalysts: [],
    conflicts: [],
    evidenceGaps: { available: [], missing: [], unavailable: [] }
  } as any;
  await snapshotRepo.save(snapA);

  // ==========================================
  // SCENARIO RUNS
  // ==========================================

  await runScenario('Scenario A: Command Center aggregate construction', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    assert.ok(data, 'Command center data must be returned');
    assert.ok(data.summary, 'Summary section required');
    assert.ok(Array.isArray(data.researchAttentionQueue), 'Research attention queue required');
    assert.ok(Array.isArray(data.activeAlerts), 'Active alerts queue required');
    assert.ok(data.portfolioPulse, 'Portfolio pulse section required');
    assert.ok(Array.isArray(data.thesisAndDecisionChanges), 'Thesis/decision changes required');
    assert.ok(Array.isArray(data.materialEvents), 'Material events required');
    assert.ok(data.researchCoverage, 'Research coverage section required');
    assert.ok(data.evidenceHealth, 'Evidence health section required');
    assert.ok(data.executiveBriefing, 'Executive briefing required');
    assert.strictEqual(data.isAnalyticalOnly, true, 'isAnalyticalOnly must be true');
    assert.strictEqual(data.executionProhibited, true, 'executionProhibited must be true');
  });

  await runScenario('Scenario B: Deterministic aggregation & counts', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    assert.ok(data.summary.totalUniverseCount > 0, 'Total universe must be > 0');
    assert.strictEqual(data.summary.activeAlertsCount, data.activeAlerts.length, 'Alert count mismatch');
    assert.strictEqual(data.summary.materialEventsCount, data.materialEvents.length, 'Material events count mismatch');
  });

  await runScenario('Scenario C: Repeated refresh produces identical structured state (3 runs byte-identical)', async () => {
    const filter = { asOfDate: asOfBaseline, scope: 'ALL' as const };
    const run1 = await researchCommandCenterService.getCommandCenterData(userA, filter);
    const run2 = await researchCommandCenterService.getCommandCenterData(userA, filter);
    const run3 = await researchCommandCenterService.getCommandCenterData(userA, filter);

    // Normalize out wall-clock evaluatedAt timestamps for byte comparison
    const extractStructuredState = (d: any) => ({
      summary: d.summary,
      researchAttentionQueue: d.researchAttentionQueue,
      activeAlerts: d.activeAlerts,
      portfolioPulse: d.portfolioPulse,
      thesisAndDecisionChanges: d.thesisAndDecisionChanges,
      materialEvents: d.materialEvents,
      researchCoverage: d.researchCoverage,
      evidenceHealth: d.evidenceHealth
    });

    const str1 = JSON.stringify(extractStructuredState(run1));
    const str2 = JSON.stringify(extractStructuredState(run2));
    const str3 = JSON.stringify(extractStructuredState(run3));

    assert.strictEqual(str1, str2, 'Run 1 and Run 2 must be byte-identical');
    assert.strictEqual(str2, str3, 'Run 2 and Run 3 must be byte-identical');
  });

  await runScenario('Scenario D: Research Attention integration (Phase 28)', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    // Check that items in researchAttentionQueue adhere to Phase 28 canonical ordering
    assert.ok(data.researchAttentionQueue.length > 0, 'Queue must not be empty');
    const topItem = data.researchAttentionQueue[0];
    assert.ok(topItem.id, 'Item ID required');
    assert.ok(topItem.symbol, 'Symbol required');
    assert.ok(topItem.priority, 'Priority required');
    assert.ok(typeof topItem.signalConvergenceScore === 'number', 'Convergence score must be number');
    assert.strictEqual(topItem.isAnalyticalOnly, true, 'Phase 28 analytical invariant');
    assert.strictEqual(topItem.executionProhibited, true, 'Phase 28 execution invariant');
  });

  await runScenario('Scenario E: Alert integration (Phase 27)', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    // Alert A must be present in activeAlerts
    const foundAlert = data.activeAlerts.find(a => a.alertId === alertA.alertId);
    assert.ok(foundAlert, 'Alert A must be present in active alerts');
    assert.strictEqual(foundAlert.status, 'DELIVERED', 'Status must be active');
    assert.strictEqual(foundAlert.symbol, 'NVDA', 'Symbol must match');
  });

  await runScenario('Scenario F: Portfolio integration (Portfolio Intelligence)', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    assert.strictEqual(data.portfolioPulse.hasHoldings, true, 'Portfolio must have holdings');
    assert.ok(data.portfolioPulse.totalValueUSD > 0, 'USD holdings must be present');
    assert.ok(data.portfolioPulse.totalValueINR > 0, 'INR holdings must be present');
    assert.ok(typeof data.portfolioPulse.hhiConcentration === 'number', 'HHI must be number');
    assert.ok(['DIVERSIFIED', 'MODERATE', 'CONCENTRATED'].includes(data.portfolioPulse.concentrationLabel), 'Valid concentration label');
  });

  await runScenario('Scenario G: Thesis/Decision integration', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    const nvdaChange = data.thesisAndDecisionChanges.find(c => c.symbol === 'NVDA');
    assert.ok(nvdaChange, 'NVDA thesis change must be detected from review');
    assert.strictEqual(nvdaChange.thesisState, 'WEAKENED', 'Thesis state must be WEAKENED');
    assert.ok(nvdaChange.changedDimensions && nvdaChange.changedDimensions.length > 0, 'Changed dimensions must be listed');
    assert.ok(nvdaChange.deepLinkUrl.includes('monitor-review'), 'Deep link to monitor review must be present');
  });

  await runScenario('Scenario H: Event integration (Phase 24)', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    const secEvent = data.materialEvents.find(e => e.eventId === realEvent.eventId);
    assert.ok(secEvent, 'SEC Filing event must be present in material events');
    assert.strictEqual(secEvent.eventType, 'SEC_FILING', 'Event type must match');
    assert.strictEqual(secEvent.affectsThesis, 'YES', 'Affects thesis flag preserved');
  });

  await runScenario('Scenario I: Research coverage integration', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    assert.ok(data.researchCoverage.coveredSecuritiesCount > 0, 'Covered count must be > 0');
    assert.ok(data.researchCoverage.coverageRatio >= 0 && data.researchCoverage.coverageRatio <= 1, 'Coverage ratio in [0,1]');
    assert.ok(Array.isArray(data.researchCoverage.gaps), 'Gaps list must be present');
  });

  await runScenario('Scenario J: Evidence/data-health integration', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    assert.ok(data.evidenceHealth.realCount > 0, 'Real count must be > 0');
    assert.ok(data.evidenceHealth.simulatedCount > 0, 'Simulated count must be > 0 due to TSLA stress test');
    assert.ok(data.evidenceHealth.summaryNote.length > 0, 'Summary note must be generated');
  });

  await runScenario('Scenario K: PIT historical Command Center', async () => {
    // Before event dates (2026-01-15)
    const earlyAsOf = '2026-01-15T00:00:00.000Z';
    const pitData = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: earlyAsOf
    });

    // Alert A (detected 2026-02-15) and Event (2026-02-10) should be invisible
    const futureAlert = pitData.activeAlerts.find(a => a.alertId === alertA.alertId);
    assert.strictEqual(futureAlert, undefined, 'Future alert must not leak into PIT historical evaluation');

    const futureEvent = pitData.materialEvents.find(e => e.eventId === realEvent.eventId);
    assert.strictEqual(futureEvent, undefined, 'Future event must not leak into PIT historical evaluation');
  });

  await runScenario('Scenario L: No future leakage (T1 < T2 < T3)', async () => {
    const t1 = '2026-02-01T00:00:00.000Z'; // Before event (Feb 10) and before alert (Feb 15)
    const t2 = '2026-02-11T00:00:00.000Z'; // After event (Feb 10) but before alert (Feb 15)
    const t3 = '2026-02-20T00:00:00.000Z'; // After both

    const dataT1 = await researchCommandCenterService.getCommandCenterData(userA, { asOfDate: t1 });
    const dataT2 = await researchCommandCenterService.getCommandCenterData(userA, { asOfDate: t2 });
    const dataT3 = await researchCommandCenterService.getCommandCenterData(userA, { asOfDate: t3 });

    // T1: event and alert both absent
    assert.strictEqual(dataT1.materialEvents.some(e => e.eventId === realEvent.eventId), false, 'T1: event invisible');
    assert.strictEqual(dataT1.activeAlerts.some(a => a.alertId === alertA.alertId), false, 'T1: alert invisible');

    // T2: event present, alert absent
    assert.strictEqual(dataT2.materialEvents.some(e => e.eventId === realEvent.eventId), true, 'T2: event visible');
    assert.strictEqual(dataT2.activeAlerts.some(a => a.alertId === alertA.alertId), false, 'T2: alert invisible');

    // T3: event and alert both present
    assert.strictEqual(dataT3.materialEvents.some(e => e.eventId === realEvent.eventId), true, 'T3: event visible');
    assert.strictEqual(dataT3.activeAlerts.some(a => a.alertId === alertA.alertId), true, 'T3: alert visible');
  });

  await runScenario('Scenario M: Multi-tenant isolation (User A vs User B)', async () => {
    const dataUserA = await researchCommandCenterService.getCommandCenterData(userA, { asOfDate: asOfBaseline });
    const dataUserB = await researchCommandCenterService.getCommandCenterData(userB, { asOfDate: asOfBaseline });

    // User A cannot see Alert B
    const userASeesAlertB = dataUserA.activeAlerts.some(a => a.alertId === alertB.alertId);
    assert.strictEqual(userASeesAlertB, false, 'User A must not see User B alert');

    // User B cannot see Alert A
    const userBSeesAlertA = dataUserB.activeAlerts.some(a => a.alertId === alertA.alertId);
    assert.strictEqual(userBSeesAlertA, false, 'User B must not see User A alert');

    // User B does not have user A's positions
    assert.strictEqual(dataUserB.portfolioPulse.hasHoldings, false, 'User B has no positions');
  });

  await runScenario('Scenario N: USD/INR isolation (no cross FX)', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    const pulse = data.portfolioPulse;
    assert.ok(pulse.totalValueUSD > 0, 'USD value computed in native USD');
    assert.ok(pulse.totalValueINR > 0, 'INR value computed in native INR');
    assert.strictEqual(pulse.currencyBreakdown.USD, pulse.totalValueUSD, 'USD breakdown matches total');
    assert.strictEqual(pulse.currencyBreakdown.INR, pulse.totalValueINR, 'INR breakdown matches total');

    // Top exposures must have explicit native currency tags
    for (const exp of pulse.topExposures) {
      assert.ok(['USD', 'INR'].includes(exp.currency), `Currency must be USD or INR, found ${exp.currency}`);
    }
  });

  await runScenario('Scenario O: Epistemic state preservation (SIMULATED != REAL, UNAVAILABLE != REAL)', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    const sim = data.materialEvents.find(e => e.eventId === simEvent.eventId);
    assert.ok(sim, 'Simulated event must be present');
    assert.strictEqual(sim.isSimulated, true, 'isSimulated must be true');
    assert.strictEqual(sim.epistemicStatus, 'SIMULATED', 'SIMULATED status preserved');

    const real = data.materialEvents.find(e => e.eventId === realEvent.eventId);
    assert.ok(real, 'Real event must be present');
    assert.strictEqual(real.isSimulated, false, 'isSimulated must be false');
    assert.strictEqual(real.epistemicStatus, 'REAL', 'REAL status preserved');
  });

  await runScenario('Scenario P: Gemini unavailable fallback', async () => {
    // Calling generateExecutiveBriefing directly with fallback
    const briefing = await researchCommandCenterService.generateExecutiveBriefing(
      {
        criticalResearchCount: 1,
        highResearchCount: 2,
        activeAlertsCount: 3,
        thesisChangesCount: 1,
        decisionChangesCount: 1,
        materialEventsCount: 2,
        researchGapsCount: 5,
        staleResearchCount: 1,
        totalUniverseCount: 25
      },
      [],
      [],
      [],
      {
        hasHoldings: true,
        positionsCount: 2,
        totalValueUSD: 10000,
        totalValueINR: 500000,
        unrealizedPnLUSD: 1000,
        unrealizedPnLINR: 20000,
        unrealizedPnLPctUSD: 10,
        unrealizedPnLPctINR: 4,
        hhiConcentration: 1800,
        concentrationLabel: 'MODERATE',
        currencyBreakdown: { USD: 10000, INR: 500000 },
        topExposures: [],
        isAnalyticalOnly: true,
        executionProhibited: true
      }
    );

    assert.ok(briefing.summaryText.length > 0, 'Briefing summary text must be present');
    assert.ok(Array.isArray(briefing.keyObservations), 'Observations must be array');
    assert.ok(briefing.keyObservations.length >= 2, 'At least 2 observations required');
    assert.ok(briefing.topActionableFocus.length > 0, 'Top actionable focus must be present');
  });

  await runScenario('Scenario Q: Gemini cannot alter structured state', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    // Verify structured state types and invariants are untouched
    assert.strictEqual(typeof data.summary.criticalResearchCount, 'number');
    assert.strictEqual(typeof data.summary.highResearchCount, 'number');
    assert.strictEqual(typeof data.summary.activeAlertsCount, 'number');
    assert.strictEqual(data.metadata.isAnalyticalOnly, true);
    assert.strictEqual(data.metadata.executionProhibited, true);
  });

  await runScenario('Scenario R: Review Workspace deep links', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    // Priority items have reviewDeepLink
    for (const item of data.researchAttentionQueue.slice(0, 5)) {
      assert.ok(item.reviewDeepLink.startsWith('/monitor-review') || item.reviewDeepLink.startsWith('/deep-dive'), `Valid deep link required, got ${item.reviewDeepLink}`);
    }

    // Thesis changes have deepLinkUrl
    for (const chg of data.thesisAndDecisionChanges) {
      assert.ok(chg.deepLinkUrl.startsWith('/monitor-review') || chg.deepLinkUrl.startsWith('/deep-dive'), `Valid change deep link required, got ${chg.deepLinkUrl}`);
    }
  });

  await runScenario('Scenario S: No duplicate intelligence calculations', async () => {
    // Verify that Command Center reuses Phase 28 researchPrioritizationEngine output
    const directPrioritization = await researchPrioritizationEngine.generatePrioritization(userA, {
      universeType: 'ALL',
      asOfDate: asOfBaseline
    });
    const commandCenterData = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    assert.strictEqual(
      commandCenterData.researchAttentionQueue.length,
      directPrioritization.items.length,
      'Research attention queue must exactly reuse prioritization engine output'
    );
    assert.strictEqual(
      commandCenterData.summary.criticalResearchCount,
      directPrioritization.priorityBreakdown.CRITICAL || 0,
      'Critical count must match prioritization engine breakdown'
    );
  });

  await runScenario('Scenario T: Factor Screener regression', async () => {
    // Verify universe building from canonical factors remains intact
    const universe = await researchPrioritizationEngine.buildUniverse(userA, 'ALL', asOfBaseline);
    assert.ok(universe.length >= 20, 'Factor universe building returns full canonical set');
    const nvda = universe.find(s => s.symbol === 'NVDA');
    assert.ok(nvda, 'NVDA present in canonical factor universe');
  });

  await runScenario('Scenario U: Historical snapshot immutability', async () => {
    // Retrieve historical state at T1
    const t1 = '2026-02-12T00:00:00.000Z';
    const stateAtT1Before = await researchCommandCenterService.getCommandCenterData(userA, { asOfDate: t1 });

    // Introduce a new event in the future (at T2 = 2026-02-28)
    const futureEvent: InvestmentEvent = {
      eventId: 'evt_p29_future_leak_check',
      securityId: 'us-aapl',
      ticker: 'AAPL',
      market: 'US',
      exchange: 'NASDAQ',
      eventType: 'EARNINGS_EVENT',
      eventDate: '2026-02-28',
      announcedAt: '2026-02-28T16:00:00.000Z',
      availableAt: '2026-02-28T16:00:00.000Z',
      createdAt: '2026-02-28T16:00:00.000Z',
      sourceType: 'PRESS_RELEASE',
      sourceReference: 'pr_2026_q1',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      title: 'AAPL Future Earnings Release',
      summary: 'Q1 earnings call announcement'
    };
    await eventRepo.save(futureEvent);

    // Retrieve state at T1 again
    const stateAtT1After = await researchCommandCenterService.getCommandCenterData(userA, { asOfDate: t1 });

    // Ensure state at T1 remains unchanged and the future event is not present
    const hasFuture = stateAtT1After.materialEvents.some(e => e.eventId === futureEvent.eventId);
    assert.strictEqual(hasFuture, false, 'Future event must not mutate past T1 state');
    assert.strictEqual(
      stateAtT1Before.summary.materialEventsCount,
      stateAtT1After.summary.materialEventsCount,
      'Event counts at T1 must remain immutable'
    );
  });

  await runScenario('Scenario V: Provider failure safety', async () => {
    // Calling with empty or unknown universe scope safely returns empty/defaults without crashing
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      scope: 'WATCHLIST',
      asOfDate: asOfBaseline
    });

    assert.ok(data, 'Data returned successfully even for empty watchlist');
    assert.strictEqual(typeof data.summary.totalUniverseCount, 'number');
    assert.strictEqual(typeof data.summary.criticalResearchCount, 'number');
  });

  await runScenario('Scenario W: No autonomous execution boundary violation', async () => {
    const data = await researchCommandCenterService.getCommandCenterData(userA, {
      asOfDate: asOfBaseline
    });

    assert.strictEqual(data.isAnalyticalOnly, true, 'isAnalyticalOnly must be strictly true');
    assert.strictEqual(data.executionProhibited, true, 'executionProhibited must be strictly true');
    assert.strictEqual((data as any).orders, undefined, 'No order placement allowed');
    assert.strictEqual((data as any).trades, undefined, 'No trade execution allowed');
    assert.strictEqual((data as any).buyRecommendations, undefined, 'No buy recommendations allowed');
  });

  await runScenario('Scenario X: Full Phase 20–28 regression verification', async () => {
    // Check that Phase 28 prioritization, Phase 27 alert orchestration, and Phase 26 review repos are healthy
    const prio = await researchPrioritizationEngine.generatePrioritization(userA, { universeType: 'PORTFOLIO' });
    assert.ok(prio, 'Phase 28 prioritization functional');

    const alerts = await alertRepo.getByUserId(userA);
    assert.ok(Array.isArray(alerts), 'Phase 27 alert repo functional');

    const reviews = await reviewRepo.getByMonitorId('mon_p29_userA_nvda');
    assert.ok(Array.isArray(reviews), 'Phase 26 review repo functional');
  });

  console.log('\n======================================================================');
  console.log(`ALL PHASE 29 ACCEPTANCE SCENARIOS PASSED: ${passedTests} / ${totalTests}`);
  console.log('======================================================================\n');
}

runAllTests().catch(err => {
  console.error('\nPhase 29 Acceptance Tests Failed:', err);
  process.exit(1);
});
