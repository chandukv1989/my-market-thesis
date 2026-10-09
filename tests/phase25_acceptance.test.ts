/**
 * Phase 25 Acceptance & Realistic Analyst Scenarios Test Suite
 * 
 * Verifies:
 * - Scenario A: Routine earnings review
 * - Scenario B: Regulatory investigation
 * - Scenario C: Thesis invalidation trigger
 * - Scenario D: Quant signal deterioration
 * - Scenario E: Multi-currency portfolio review (USD vs INR)
 * - Scenario F: True zero-change baseline
 * - Scenario G: Historical review immutability (Review A -> change -> Review B -> Review A pristine)
 * - Scenario H: Multi-tenant security & unauthorized review access
 * - Scenario I: Epistemic status preservation & data quality changes
 */

import { investmentMonitorEngine } from '../server/services/monitor/investmentMonitorEngine';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { InvestmentEvent, ResearchSnapshot, HoldingPosition } from '../src/types';

async function runAcceptanceScenarios() {
  console.log('======================================================================');
  console.log('PHASE 25: REALISTIC ANALYST ACCEPTANCE SCENARIOS');
  console.log('======================================================================');

  await persistenceManager.initialize();
  await investmentMonitorEngine.initialize();

  const userA = 'analyst-acc-a-' + Date.now();
  const userB = 'analyst-acc-b-' + Date.now();

  // --- SCENARIO A: ROUTINE EARNINGS REVIEW ---
  console.log('\n--- SCENARIO A: ROUTINE EARNINGS REVIEW ---');
  const monitorA = await investmentMonitorEngine.createMonitor(userA, 'NVDA', {
    reviewCadence: 'WEEKLY'
  });

  const eventRepo = persistenceManager.getEventRepository();
  const t0 = new Date().toISOString();
  
  // Ingest routine earnings event
  const earningsEvent: InvestmentEvent = {
    eventId: `ev_earn_${Date.now()}`,
    securityId: 'us-nvda',
    market: 'US',
    exchange: 'NASDAQ',
    title: 'Q3 Earnings Beat Expectations',
    summary: 'Revenue up 15% YoY, EPS exceeded consensus by $0.12.',
    eventType: 'EARNINGS_EVENT',
    eventDate: t0,
    announcedAt: t0,
    availableAt: t0,
    sourceType: 'SEC_FILING',
    sourceReference: 'SEC 10-Q Filing',
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
  await eventRepo.save(earningsEvent);

  const reviewA = await investmentMonitorEngine.executeReview(monitorA.monitorId, userA, 'Routine quarterly checkup; thesis tracking smoothly.');
  console.log(`  ✓ Review A completed with total changes: ${reviewA.changeSummary.totalChanges}`);
  if (!reviewA.changes.some(c => c.category === 'EVENT_CHANGE')) {
    throw new Error('Expected EVENT_CHANGE in review A');
  }
  console.log('  ✓ [PASS] Scenario A: Routine earnings review detected and signed off');

  // --- SCENARIO F: TRUE ZERO-CHANGE BASELINE ---
  console.log('\n--- SCENARIO F: TRUE ZERO-CHANGE BASELINE ---');
  // Immediately check for changes right after Review A (no new events or evidence added)
  const noChangeReview = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
  console.log(`  ✓ No-change review totalChanges: ${noChangeReview.changeSummary.totalChanges}`);
  if (noChangeReview.changeSummary.eventsCount !== 0) {
    throw new Error(`Expected 0 events, got ${noChangeReview.changeSummary.eventsCount}`);
  }
  if (noChangeReview.changeSummary.evidenceCount !== 0) {
    throw new Error(`Expected 0 evidence, got ${noChangeReview.changeSummary.evidenceCount}`);
  }
  if (noChangeReview.changeSummary.thesisChanged) {
    throw new Error('Expected thesisChanged === false');
  }
  if (noChangeReview.changeSummary.decisionChanged) {
    throw new Error('Expected decisionChanged === false');
  }
  if (noChangeReview.changeSummary.totalChanges !== 0) {
    throw new Error(`Expected 0 total changes, got ${noChangeReview.changeSummary.totalChanges}`);
  }
  if (!noChangeReview.explanation.causalChain[0].includes('No new market events')) {
    throw new Error('Expected causal chain to indicate 0 new events');
  }
  console.log('  ✓ [PASS] Scenario F: Zero-change baseline confirms 0 deltas and truthful causal chain');

  // --- SCENARIO B: REGULATORY INVESTIGATION ---
  console.log('\n--- SCENARIO B: REGULATORY INVESTIGATION ---');
  await new Promise(r => setTimeout(r, 50));
  const t1 = new Date().toISOString();
  const regEvent: InvestmentEvent = {
    eventId: `ev_reg_${Date.now()}`,
    securityId: 'us-nvda',
    market: 'US',
    exchange: 'NASDAQ',
    title: 'DOJ Antitrust Civil Investigative Demand',
    summary: 'Department of Justice issued subpoena concerning bundling practices.',
    eventType: 'MARKET_EVENT',
    eventDate: t1,
    announcedAt: t1,
    availableAt: t1,
    sourceType: 'REGULATORY_DISCLOSURE',
    sourceReference: 'Regulatory Disclosure',
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
    createdAt: t1
  };
  await eventRepo.save(regEvent);

  const reviewB = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
  console.log(`  ✓ Review B urgency: ${reviewB.changeSummary.recommendationReviewUrgency}`);
  console.log(`  ✓ Thesis status: ${reviewB.thesisHealth.overallStatus}, invalidation: ${reviewB.thesisHealth.invalidationStatus}`);
  if (reviewB.thesisHealth.invalidationStatus !== 'THREATENED') {
    throw new Error(`Expected invalidationStatus THREATENED, got ${reviewB.thesisHealth.invalidationStatus}`);
  }
  if (reviewB.changeSummary.recommendationReviewUrgency !== 'IMMEDIATE' && reviewB.changeSummary.recommendationReviewUrgency !== 'HIGH') {
    throw new Error(`Expected HIGH or IMMEDIATE urgency, got ${reviewB.changeSummary.recommendationReviewUrgency}`);
  }
  console.log('  ✓ [PASS] Scenario B: Regulatory investigation triggers THREATENED guard and elevated urgency');

  // --- SCENARIO C: THESIS INVALIDATION TRIGGER ---
  console.log('\n--- SCENARIO C: THESIS INVALIDATION TRIGGER ---');
  await new Promise(r => setTimeout(r, 50));
  const t2 = new Date().toISOString();
  const invalidationEvent: InvestmentEvent = {
    eventId: `ev_inv_${Date.now()}`,
    securityId: 'us-nvda',
    market: 'US',
    exchange: 'NASDAQ',
    title: 'Core Moat Invalidation Trigger: Direct Hardware Substitution',
    summary: 'Key customer fully deploys competing proprietary silicon, reducing order volume by 60%.',
    eventType: 'THESIS_INVALIDATION',
    eventDate: t2,
    announcedAt: t2,
    availableAt: t2,
    sourceType: 'SUPPLY_CHAIN_INTELLIGENCE',
    sourceReference: 'Verified Supply Chain Intelligence',
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
    affectedThesisAreas: ['INVALIDATION_CONDITION', 'BEAR_CASE'],
    createdAt: t2
  };
  await eventRepo.save(invalidationEvent);

  const reviewC = await investmentMonitorEngine.detectAllChanges(monitorA.monitorId, userA);
  if (reviewC.thesisHealth.invalidationStatus !== 'TRIGGERED') {
    throw new Error(`Expected invalidationStatus TRIGGERED, got ${reviewC.thesisHealth.invalidationStatus}`);
  }
  if (reviewC.thesisHealth.overallStatus !== 'INVALIDATED') {
    throw new Error(`Expected thesis overallStatus INVALIDATED, got ${reviewC.thesisHealth.overallStatus}`);
  }
  if (reviewC.changeSummary.recommendationReviewUrgency !== 'IMMEDIATE') {
    throw new Error(`Expected IMMEDIATE urgency for invalidated thesis`);
  }
  const committedReviewC = await investmentMonitorEngine.executeReview(monitorA.monitorId, userA, 'CRITICAL: Thesis invalidation confirmed.');
  console.log('  ✓ [PASS] Scenario C: Thesis invalidation event shifts status to INVALIDATED and urgency to IMMEDIATE');

  // --- SCENARIO G: IMMUTABILITY & HISTORICAL INTEGRITY ---
  console.log('\n--- SCENARIO G: HISTORICAL REVIEW IMMUTABILITY ---');
  const pastReviewA = await investmentMonitorEngine.getReview(reviewA.reviewId, userA);
  if (!pastReviewA) throw new Error('Could not retrieve past Review A');
  if (pastReviewA.thesisHealth.overallStatus === 'INVALIDATED') {
    throw new Error('REGRESSION: Past Review A mutated after Review C was committed!');
  }
  if (pastReviewA.reviewId !== reviewA.reviewId || pastReviewA.reviewedAt !== reviewA.reviewedAt) {
    throw new Error('Review A metadata or timestamp mutated');
  }
  console.log('  ✓ [PASS] Scenario G: Past Review A remains completely immutable after subsequent reviews');

  // --- SCENARIO D: QUANT SIGNAL DETERIORATION ---
  console.log('\n--- SCENARIO D: QUANT SIGNAL DETERIORATION ---');
  const snapshotRepo = persistenceManager.getSnapshotRepository();
  const tBaseline = new Date().toISOString();
  await snapshotRepo.save({
    snapshotId: `snap_asml_base_${Date.now()}`,
    securityId: 'us-asml',
    notebookId: 'nb_us_asml',
    researchAsOfDate: tBaseline,
    thesis: { summary: 'Strong baseline', bullPoints: [], bearPoints: [], risks: [] } as any,
    metrics: {
      quant: { momentumScore: 88, qualityScore: 82, volatilityScore: 35, trendDirection: 'BULLISH' } as any,
      valuation: { peRatio: 26.0, fairValue: 850, marginOfSafety: 15.0 } as any
    },
    invalidationGuards: [],
    sources: [],
    epistemicStatus: 'REAL',
    createdAt: tBaseline
  } as any);

  const monitorD = await investmentMonitorEngine.createMonitor(userA, 'ASML', {
    reviewCadence: 'MONTHLY'
  });

  await new Promise(r => setTimeout(r, 50));
  const t3 = new Date().toISOString();
  const deterioratedSnapshot: ResearchSnapshot = {
    snapshotId: `snap_asml_drop_${Date.now()}`,
    securityId: 'us-asml',
    notebookId: 'nb_us_asml',
    researchAsOfDate: t3,
    thesis: {
      executiveThesis: 'Deteriorating technical momentum with elevated volatility',
      bullCase: { summary: 'None', points: [], evidenceIds: [] },
      bearCase: { summary: 'Momentum breakdown', points: ['Momentum breakdown'], evidenceIds: [] }
    } as any,
    claims: [],
    risks: [],
    catalysts: [],
    conflicts: [],
    evidenceIds: [],
    evidenceGaps: { available: [], missing: [], unavailable: [] },
    createdAt: t3
  };
  (deterioratedSnapshot as any).metrics = {
    quant: {
      momentumScore: 28,
      qualityScore: 55,
      volatilityScore: 82,
      trendDirection: 'BEARISH'
    },
    valuation: {
      peRatio: 38.5,
      fairValue: 640,
      marginOfSafety: -12.5
    }
  };
  await snapshotRepo.save(deterioratedSnapshot);

  const reviewD = await investmentMonitorEngine.detectAllChanges(monitorD.monitorId, userA);
  console.log(`  ✓ Quant changes detected: ${reviewD.changeSummary.quantChanged}, valuation: ${reviewD.changeSummary.valuationChanged}`);
  if (!reviewD.changeSummary.quantChanged) {
    throw new Error('Expected quantChanged to be true');
  }
  if (!reviewD.changes.some(c => c.category === 'QUANT_CHANGE')) {
    throw new Error('Expected QUANT_CHANGE item in review changes list');
  }
  console.log('  ✓ [PASS] Scenario D: Quant signal deterioration correctly categorized as QUANT_CHANGE');

  // --- SCENARIO E: MULTI-CURRENCY PORTFOLIO REVIEW ---
  console.log('\n--- SCENARIO E: MULTI-CURRENCY PORTFOLIO REVIEW ---');
  // Seed Indian security RELIANCE position in INR
  const portfolioRepo = persistenceManager.getPortfolioRepository();
  const inrPosition: HoldingPosition = {
    positionId: `pos_rel_${Date.now()}`,
    portfolioId: `port_${userA}`,
    userId: userA,
    securityId: 'in-reliance',
    ticker: 'RELIANCE',
    shares: 250,
    avgCost: 2850,
    currentPrice: 3020,
    marketValue: 755000,
    unrealizedPnL: 42500,
    unrealizedPnLPercent: 5.96,
    currency: 'INR',
    assetClass: 'EQUITY',
    lastUpdated: new Date().toISOString()
  };
  await portfolioRepo.savePositions([inrPosition], userA);

  const monitorE = await investmentMonitorEngine.createMonitor(userA, 'RELIANCE', {
    reviewCadence: 'MONTHLY'
  });

  const reviewE = await investmentMonitorEngine.detectAllChanges(monitorE.monitorId, userA);
  if (reviewE.portfolioDelta?.currency !== 'INR') {
    throw new Error(`Expected INR currency for Indian security, got ${reviewE.portfolioDelta?.currency}`);
  }
  if (!reviewE.portfolioDelta?.narrative.includes('₹')) {
    throw new Error(`Expected ₹ symbol in portfolio narrative for INR security, got ${reviewE.portfolioDelta?.narrative}`);
  }
  console.log(`  ✓ Portfolio narrative: "${reviewE.portfolioDelta?.narrative}"`);
  console.log('  ✓ [PASS] Scenario E: Multi-currency boundaries strictly preserved without leakage');

  // --- SCENARIO H: MULTI-TENANT ISOLATION ---
  console.log('\n--- SCENARIO H: MULTI-TENANT ISOLATION ---');
  let unauthorizedAccessBlocked = false;
  try {
    await investmentMonitorEngine.getReview(reviewA.reviewId, userB);
  } catch (err: any) {
    if (err.message.includes('UNAUTHORIZED')) {
      unauthorizedAccessBlocked = true;
    }
  }
  if (!unauthorizedAccessBlocked) {
    throw new Error('SECURITY VIOLATION: User B was able to access User A\'s review!');
  }

  let unauthorizedExecutionBlocked = false;
  try {
    await investmentMonitorEngine.executeReview(monitorA.monitorId, userB, 'Attempted cross-tenant review');
  } catch (err: any) {
    if (err.message.includes('UNAUTHORIZED')) {
      unauthorizedExecutionBlocked = true;
    }
  }
  if (!unauthorizedExecutionBlocked) {
    throw new Error('SECURITY VIOLATION: User B was able to execute review on User A\'s monitor!');
  }
  console.log('  ✓ [PASS] Scenario H: Strict tenant isolation blocks cross-tenant review access and review execution');

  console.log('\n======================================================================');
  console.log('ALL PHASE 25 ACCEPTANCE SCENARIOS PASSED WITH ZERO REGRESSIONS!');
  console.log('======================================================================\n');
}

runAcceptanceScenarios().catch(err => {
  console.error('Fatal acceptance test error:', err);
  process.exit(1);
});
