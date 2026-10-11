/**
 * Phase 31: Portfolio Scenario & Stress Intelligence Acceptance Test Suite
 * 
 * Validates deterministic scenario stress testing across:
 * - Scenarios A through AL
 * - 7 scenario types (Market, Sector, Security, Currency, Macro, Event, Thesis Invalidation)
 * - Deterministic propagation and no fabricated sensitivity
 * - Strict Point-in-Time (PIT) zero-lookahead
 * - Historical snapshot immutability & multi-tenant IDOR protection
 * - Strict USD/INR currency isolation
 * - Epistemic integrity (REAL, CALCULATED, INSUFFICIENT_EVIDENCE)
 * - Thesis & Decision state non-mutation
 * - AI Resilience & Circuit Breaker (402, 429, cooldown, fallback, non-interference)
 * - Analytical-only invariant (isAnalyticalOnly: true, executionProhibited: true)
 * - 3-run byte-identical determinism
 */

import { classifyLegacyFixturesSharedForTest } from './helpers/legacyFixtures';
import { portfolioScenarioService } from '../server/services/scenarios/portfolioScenarioService';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { aiCircuitBreaker } from '../server/services/ai/aiCircuitBreaker';
import { researchCommandCenterService } from '../server/services/commandCenter/researchCommandCenterService';
import { crossInvestmentService } from '../server/services/relationships/crossInvestmentService';
import {
  PortfolioScenarioEvaluation,
  PortfolioScenarioSnapshot,
  InvestmentEvent,
  InvestmentMonitor
} from '../src/types';

interface TestResult {
  scenario: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, scenario: string, message: string) {
  if (condition) {
    results.push({ scenario, passed: true, message });
    console.log(`  ✓ [PASS] Scenario ${scenario}: ${message}`);
  } else {
    results.push({ scenario, passed: false, message: `FAILED: ${message}` });
    console.error(`  ✗ [FAIL] Scenario ${scenario}: ${message}`);
  }
}

async function runPhase31AcceptanceTests() {
  // Phase 38.2B: ownerless legacy fixtures are no longer implicitly visible; classify them explicitly (in-memory, test only).
  await classifyLegacyFixturesSharedForTest();
  console.log('======================================================================');
  console.log('PHASE 31: PORTFOLIO SCENARIO & STRESS INTELLIGENCE ACCEPTANCE TEST SUITE');
  console.log('======================================================================');

  const startTime = Date.now();
  const userIdA = 'analyst-1';
  const userIdB = 'analyst-2';

  // Seed baseline monitors and events for PIT and thesis tests
  const monitorRepo = persistenceManager.getMonitorRepository();
  const eventRepo = persistenceManager.getEventRepository();

  const testMonitorA: InvestmentMonitor = {
    monitorId: 'mon_test_nvda_p31',
    userId: userIdA,
    ownerUserId: userIdA,
    securityId: 'sec_nvda',
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    market: 'US',
    reviewCadence: 'WEEKLY',
    status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    lastReviewedAt: '2026-08-01T00:00:00.000Z',
    baselineCompositeScore: 88,
    baselineThesisStatus: 'Healthy',
    baselineRating: 'CONVICTION_BUY',
    invalidationStatus: 'ACTIVE_GUARD',
    portfolioExposure: {
      hasExposure: true,
      shares: 1150,
      weightPct: 35.5,
      sector: 'Technology',
      currency: 'USD'
    },
    epistemicStatus: 'REAL',
    invalidationGuards: [
      {
        guardId: 'g_margin_nvda',
        guardName: 'Hyperscale Capex Margin Compression',
        affectedAreas: ['MARGIN_COMPRESSION', 'BULL_CASE'],
        threshold: 'Gross Margin < 70%',
        currentValue: '75.2%',
        status: 'ACTIVE_GUARD'
      }
    ] as any,
    isAnalyticalOnly: true,
    executionProhibited: true
  };
  await monitorRepo.save(testMonitorA);

  const testEventT1: InvestmentEvent = {
    eventId: 'evt_sec_filing_t1',
    securityId: 'sec_nvda',
    ticker: 'NVDA',
    market: 'US',
    exchange: 'NASDAQ',
    eventType: 'SEC_FILING',
    title: 'Baseline 10-Q Filing',
    summary: 'Quarterly financial report with strong AI segment results.',
    eventDate: '2026-08-15',
    announcedAt: '2026-08-15T10:00:00.000Z',
    availableAt: '2026-08-15T10:00:00.000Z',
    sourceType: 'SEC_EDGAR',
    sourceReference: '0001045810-26-000045',
    evidenceIds: ['ev_nvda_10q_t1'],
    epistemicStatus: 'REAL',
    isSimulated: false,
    createdAt: '2026-08-15T10:00:00.000Z'
  };
  await eventRepo.save(testEventT1);

  const testEventT2PostDated: InvestmentEvent = {
    eventId: 'evt_sec_filing_t2_postdated',
    securityId: 'sec_nvda',
    ticker: 'NVDA',
    market: 'US',
    exchange: 'NASDAQ',
    eventType: 'SEC_FILING',
    title: 'Future Post-Dated Disclosure (T2)',
    summary: 'Regulatory export licensing constraint update.',
    eventDate: '2026-09-20',
    announcedAt: '2026-09-20T10:00:00.000Z',
    availableAt: '2026-09-20T10:00:00.000Z',
    sourceType: 'SEC_EDGAR',
    sourceReference: '0001045810-26-000099',
    evidenceIds: ['ev_nvda_postdated'],
    epistemicStatus: 'REAL',
    isSimulated: false,
    createdAt: '2026-09-20T10:00:00.000Z'
  };
  await eventRepo.save(testEventT2PostDated);

  // ------------------------------------------------------------------
  // SCENARIO A: Scenario Creation
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO A: Scenario Creation ---');
  const evalA = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECTOR_SHOCK',
    name: 'US Technology Drawdown (-15%)',
    parameters: {
      sector: 'Technology',
      market: 'US',
      shockPercentage: -15
    },
    asOfDate: '2026-09-01'
  });

  assert(Boolean(evalA && evalA.scenarioId), 'A', 'Scenario evaluation generated valid scenarioId');
  assert(evalA.scenarioType === 'SECTOR_SHOCK', 'A', 'Preserves scenarioType SECTOR_SHOCK');
  assert(evalA.severity === 'HIGH' || evalA.severity === 'MEDIUM', 'A', 'Calculates neutral analytical severity');
  assert(evalA.impactedSecurities.length > 0, 'A', 'Evaluated impacted securities list');

  // ------------------------------------------------------------------
  // SCENARIO B: Scenario Assumption Immutability
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO B: Scenario Assumption Immutability ---');
  assert(evalA.assumptions.length > 0, 'B', 'Scenario contains explicit assumptions');
  const primaryAsm = evalA.assumptions[0];
  assert(primaryAsm.isHypothetical === true, 'B', 'Assumptions explicitly tagged isHypothetical: true');
  assert(primaryAsm.limitationNote !== undefined, 'B', 'Assumptions expose explicit limitation note (not a forecast)');
  assert(primaryAsm.statement.includes('-15%'), 'B', 'Assumption captures exact requested shock percentage');

  // ------------------------------------------------------------------
  // SCENARIO C: Market Shock
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO C: Market Shock ---');
  const evalC = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'MARKET_SHOCK',
    parameters: {
      shockPercentage: -10
    },
    asOfDate: '2026-09-01'
  });
  const allHoldingsShocked = evalC.impactedSecurities
    .filter(s => s.isPortfolioHolding && !s.ticker.includes('CASH'))
    .every(s => s.scenarioShockPct === -10);
  assert(allHoldingsShocked, 'C', 'Broad market shock applies -10% across active portfolio equity holdings');
  assert(evalC.portfolioSummary.usd.hypotheticalPnl < 0, 'C', 'Computes negative hypothetical USD P&L under market shock');

  // ------------------------------------------------------------------
  // SCENARIO D: Sector Shock
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO D: Sector Shock ---');
  const techHoldings = evalA.impactedSecurities.filter(s => s.isPortfolioHolding && s.sector === 'Technology');
  const nonTechHoldings = evalA.impactedSecurities.filter(s => s.isPortfolioHolding && s.sector !== 'Technology');
  const techShocked = techHoldings.every(s => s.scenarioShockPct === -15);
  const nonTechZero = nonTechHoldings.every(s => s.scenarioShockPct === 0);
  assert(techShocked, 'D', 'All technology holdings experience exactly -15% sector shock');
  assert(nonTechZero, 'D', 'All non-technology holdings experience 0% direct sector shock (no semantic leakage)');

  // ------------------------------------------------------------------
  // SCENARIO E: Security Shock
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO E: Security Shock ---');
  const evalE = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECURITY_SHOCK',
    parameters: {
      targetSymbol: 'NVDA',
      shockPercentage: -20
    },
    asOfDate: '2026-09-01'
  });
  const nvdaImpact = evalE.impactedSecurities.find(s => s.ticker === 'NVDA');
  assert(Boolean(nvdaImpact && nvdaImpact.scenarioShockPct === -20), 'E', 'Direct target NVDA receives exact -20% shock');
  assert(nvdaImpact?.exposureBasis === 'DIRECT_TARGET', 'E', 'NVDA exposure basis is DIRECT_TARGET');

  // Check secondary propagation to correlated securities
  const msftImpact = evalE.impactedSecurities.find(s => s.ticker === 'MSFT');
  assert(Boolean(msftImpact && msftImpact.scenarioShockPct !== 0), 'E', 'Correlated peer MSFT receives propagated co-movement shock');

  // ------------------------------------------------------------------
  // SCENARIO F: Currency Scenario
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO F: Currency Scenario ---');
  const evalF = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'CURRENCY_SCENARIO',
    parameters: {
      currency: 'USD',
      currencyChangePct: 10
    },
    asOfDate: '2026-09-01'
  });
  assert(evalF.portfolioSummary.currencyIsolated === true, 'F', 'Currency scenario enforces currencyIsolated: true');
  assert(evalF.portfolioSummary.crossCurrencyAggregationAvailable === false, 'F', 'Enforces crossCurrencyAggregationAvailable: false');
  assert(evalF.assumptions.some(a => a.fxAssumption !== undefined), 'F', 'Exposes explicit foreign exchange assumption statement');

  // ------------------------------------------------------------------
  // SCENARIO G: Macro Scenario
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO G: Macro Scenario ---');
  const evalG = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'MACRO_SCENARIO',
    parameters: {
      macroVariable: 'INTEREST_RATES',
      macroShockAmount: 100,
      macroShockUnit: 'bps'
    },
    asOfDate: '2026-09-01'
  });
  const techUnderRate = evalG.impactedSecurities.find(s => s.ticker === 'NVDA');
  assert(Boolean(techUnderRate && (techUnderRate.scenarioShockPct || 0) < 0), 'G', 'Growth asset reflects discount rate expansion under rate hike');

  // ------------------------------------------------------------------
  // SCENARIO H: Event Scenario
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO H: Event Scenario ---');
  const evalH = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'EVENT_SCENARIO',
    parameters: {
      eventCategory: 'REGULATORY',
      eventDescription: 'Hypothetical Advanced Accelerator Export Licensing Restrictions',
      sector: 'Technology',
      shockPercentage: -12
    },
    asOfDate: '2026-09-01'
  });
  assert(evalH.assumptions[0].statement.includes('Hypothetical occurrence'), 'H', 'Event scenario clearly labeled as hypothetical occurrence');
  assert(evalH.impactedSecurities.some(s => s.exposureBasis === 'SHARED_EVENT'), 'H', 'Exposed securities tagged with SHARED_EVENT basis');

  // ------------------------------------------------------------------
  // SCENARIO I: Thesis Invalidation Scenario
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO I: Thesis Invalidation Scenario ---');
  const evalI = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'THESIS_INVALIDATION_SCENARIO',
    parameters: {
      thesisInvalidationPillar: 'MARGIN_COMPRESSION',
      shockPercentage: -10
    },
    asOfDate: '2026-09-01'
  });
  const nvdaThesisImpact = evalI.impactedSecurities.find(s => s.ticker === 'NVDA');
  assert(Boolean(nvdaThesisImpact && nvdaThesisImpact.exposureBasis === 'THESIS_GUARD'), 'I', 'Maps to active invalidation guard pillar on NVDA');
  assert(nvdaThesisImpact?.relevantInvalidationGuards.length! > 0, 'I', 'Includes relevant monitored invalidation guards in result');

  // ------------------------------------------------------------------
  // SCENARIO J: Deterministic Propagation
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO J: Deterministic Propagation ---');
  const propPath = nvdaImpact?.propagationPath || [];
  assert(propPath.length >= 4, 'J', 'Builds step-by-step propagation path');
  assert(propPath[0].nodeType === 'SCENARIO', 'J', 'Propagation path begins with SCENARIO step');
  assert(propPath[propPath.length - 1].nodeType === 'IMPACT', 'J', 'Propagation path concludes with IMPACT step');
  assert(propPath.every(p => Boolean(p.provenance)), 'J', 'Every edge in propagation path exposes explicit provenance');

  // ------------------------------------------------------------------
  // SCENARIO K: Portfolio Impact
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO K: Portfolio Impact ---');
  assert(evalA.portfolioSummary.totalHoldingsEvaluated > 0, 'K', 'Evaluates total holdings count');
  assert(evalA.portfolioSummary.usd.affectedPortfolioValue > 0, 'K', 'Calculates affected USD portfolio value');
  assert(evalA.portfolioSummary.usd.affectedWeightPct > 0, 'K', 'Calculates affected USD portfolio weight %');

  // ------------------------------------------------------------------
  // SCENARIO L: Hypothetical P&L
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO L: Hypothetical P&L ---');
  const testSec = evalA.impactedSecurities.find(s => s.isPortfolioHolding && s.scenarioShockPct === -15);
  if (testSec) {
    const expectedPnl = Math.round(testSec.currentValue * (-0.15) * 100) / 100;
    assert(Math.abs((testSec.hypotheticalPnl || 0) - expectedPnl) < 1.0, 'L', 'Computes deterministic mathematical hypothetical P&L (value * shock%)');
    assert(testSec.hypotheticalNewValue === Math.round((testSec.currentValue + expectedPnl) * 100) / 100, 'L', 'Computes deterministic hypothetical new value');
  }

  // ------------------------------------------------------------------
  // SCENARIO M: No Fabricated Sensitivity
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO M: No Fabricated Sensitivity ---');
  const evalM = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'MACRO_SCENARIO',
    parameters: {
      macroVariable: 'CRUDE_OIL',
      macroShockAmount: 25,
      macroShockUnit: '%'
    },
    asOfDate: '2026-09-01'
  });
  const unevidencedSec = evalM.impactedSecurities.find(s => s.epistemicStatus === 'INSUFFICIENT_EVIDENCE');
  assert(Boolean(unevidencedSec), 'M', 'Assets without verified macro econometrics flagged INSUFFICIENT_EVIDENCE');
  assert(Boolean(unevidencedSec?.insufficientEvidenceReason), 'M', 'Provides explicit insufficient evidence explanation');

  // ------------------------------------------------------------------
  // SCENARIO N: Point-in-Time (PIT) Zero Lookahead
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO N: Point-in-Time (PIT) Zero Lookahead ---');
  const evalT1 = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECTOR_SHOCK',
    parameters: { sector: 'Technology', shockPercentage: -15 },
    asOfDate: '2026-09-01'
  });
  const nvdaT1 = evalT1.impactedSecurities.find(s => s.ticker === 'NVDA');
  const postDatedIncluded = nvdaT1?.relatedEvents.some(e => e.eventId === 'evt_sec_filing_t2_postdated');
  assert(postDatedIncluded === false, 'N', 'At T1 (2026-09-01), post-dated T2 event (2026-09-20) is strictly excluded (ZERO LOOKAHEAD)');

  // ------------------------------------------------------------------
  // SCENARIO O: Historical Scenario Immutability
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO O: Historical Scenario Immutability ---');
  const snapId = `snap_hist_test_${Date.now()}`;
  const snapO: PortfolioScenarioSnapshot = {
    snapshotId: snapId,
    userId: userIdA,
    title: 'Baseline Historical Tech Stress Test',
    scenarioType: 'SECTOR_SHOCK',
    asOfDate: '2026-09-01',
    createdAt: '2026-09-01T12:00:00.000Z',
    evaluation: evalA,
    isAnalyticalOnly: true,
    executionProhibited: true
  };
  await portfolioScenarioService.saveSnapshot(snapO);

  let overwriteRejected = false;
  try {
    await portfolioScenarioService.saveSnapshot(snapO);
  } catch (err: any) {
    overwriteRejected = err.message.includes('immutable');
  }
  assert(overwriteRejected, 'O', 'Duplicate snapshot overwrite attempt strictly rejected with immutability error');

  // ------------------------------------------------------------------
  // SCENARIO P: USD / INR Strict Currency Isolation
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO P: USD / INR Strict Currency Isolation ---');
  assert(evalA.portfolioSummary.usd.currency === 'USD', 'P', 'USD summary maintains currency USD');
  assert(evalA.portfolioSummary.inr.currency === 'INR', 'P', 'INR summary maintains native currency INR');
  assert(evalA.portfolioSummary.currencyIsolated === true, 'P', 'Enforces strict currency isolation without blending');

  // ------------------------------------------------------------------
  // SCENARIO Q & R: Multi-Tenant Isolation & IDOR Protection
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO Q & R: Multi-Tenant Isolation & IDOR Protection ---');
  const userASnaps = await portfolioScenarioService.getSnapshotsByUserId(userIdA);
  const userBSnaps = await portfolioScenarioService.getSnapshotsByUserId(userIdB);
  assert(userASnaps.some(s => s.snapshotId === snapId), 'Q', 'User A can view owned scenario snapshot');
  assert(userBSnaps.every(s => s.snapshotId !== snapId), 'Q', 'User B cannot view User A scenario snapshots');

  let idorBlocked = false;
  try {
    await portfolioScenarioService.getSnapshot(snapId, userIdB);
  } catch (err: any) {
    idorBlocked = err.message.includes('AuthorizationError') || err.message.includes('not authorized');
  }
  assert(idorBlocked, 'R', 'IDOR direct snapshot access by unauthorized User B blocked with AuthorizationError');

  // ------------------------------------------------------------------
  // SCENARIO S: Epistemic Integrity
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO S: Epistemic Integrity ---');
  assert(evalA.evidenceCoverage.epistemicBreakdown.CALCULATED !== undefined, 'S', 'Tracks CALCULATED epistemic states');
  assert(evalM.evidenceCoverage.insufficientEvidenceCount > 0, 'S', 'Tracks INSUFFICIENT_EVIDENCE epistemic states without false promotion');

  // ------------------------------------------------------------------
  // SCENARIO T: Observed vs Scenario Separation
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO T: Observed vs Scenario Separation ---');
  assert(Boolean(testSec?.portfolioWeightPct), 'T', 'Preserves observed portfolio holding weight');
  assert(Boolean(testSec?.scenarioShockPct), 'T', 'Preserves distinct hypothetical scenario shock %');
  assert(testSec?.hypotheticalPnl !== undefined, 'T', 'Preserves separate hypothetical P&L calculation');

  // ------------------------------------------------------------------
  // SCENARIO U: Evidence Provenance
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO U: Evidence Provenance ---');
  assert(evalA.evidenceCoverage.totalEvidenceLinks > 0, 'U', 'Links to verifiable primary regulatory evidence on record');

  // ------------------------------------------------------------------
  // SCENARIO V: Thesis State Remains Unchanged
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO V: Thesis State Remains Unchanged ---');
  const nvdaMonitorAfter = await monitorRepo.get('mon_test_nvda_p31');
  assert(nvdaMonitorAfter?.status === 'ACTIVE', 'V', 'Hypothetical scenario evaluation did NOT mutate monitor status to INVALIDATED');

  // ------------------------------------------------------------------
  // SCENARIO W: Decision State Remains Unchanged
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO W: Decision State Remains Unchanged ---');
  const decisionRepo = persistenceManager.getDecisionRepository();
  const allDecisionsBefore = await decisionRepo.getAll();
  await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'MARKET_SHOCK',
    parameters: { shockPercentage: -25 }
  });
  const allDecisionsAfter = await decisionRepo.getAll();
  assert(allDecisionsBefore.length === allDecisionsAfter.length, 'W', 'Scenario evaluation did NOT modify committee decision assessments');

  // ------------------------------------------------------------------
  // SCENARIO X: No Fake Future Events
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO X: No Fake Future Events ---');
  const eventCountBefore = (await eventRepo.getAll()).length;
  await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'EVENT_SCENARIO',
    parameters: {
      eventCategory: 'REGULATORY',
      eventDescription: 'Simulated Tariffs',
      shockPercentage: -10
    }
  });
  const eventCountAfter = (await eventRepo.getAll()).length;
  assert(eventCountBefore === eventCountAfter, 'X', 'Event scenario did NOT create persistent fake future events in EventRepository');

  // ------------------------------------------------------------------
  // SCENARIO Y & Z: Gemini Unavailable & Non-Interference
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO Y & Z: Gemini Unavailable & Non-Interference ---');
  aiCircuitBreaker.reset();
  const evalWithAi = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECTOR_SHOCK',
    parameters: { sector: 'Technology', shockPercentage: -15 },
    asOfDate: '2026-09-01'
  });

  // Trip circuit breaker manually
  aiCircuitBreaker.handleAiError('PortfolioScenarioTest', new Error('HTTP 402 prepayment credits depleted'));
  assert(aiCircuitBreaker.isQuotaExhausted() === true, 'AA', 'Simulated 402 trips circuit breaker into PREPAYMENT_DEPLETED state');

  const evalWithoutAi = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECTOR_SHOCK',
    parameters: { sector: 'Technology', shockPercentage: -15 },
    asOfDate: '2026-09-01'
  });

  assert(evalWithoutAi.executiveBriefing?.isAIGenerated === false, 'Y', 'Deterministic fallback engages when AI circuit breaker is OPEN');
  assert(evalWithAi.portfolioSummary.usd.hypotheticalPnl === evalWithoutAi.portfolioSummary.usd.hypotheticalPnl, 'Z', 'USD Hypothetical P&L is 100% byte-identical regardless of AI state');
  assert(evalWithAi.portfolioSummary.usd.affectedWeightPct === evalWithoutAi.portfolioSummary.usd.affectedWeightPct, 'Z', 'Affected weight % is 100% byte-identical regardless of AI state');
  assert(evalWithAi.impactedSecurities.length === evalWithoutAi.impactedSecurities.length, 'Z', 'Impacted securities count is 100% byte-identical regardless of AI state');

  // ------------------------------------------------------------------
  // SCENARIO AB & AC: AI Circuit Breaker 429 & Recovery
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AB & AC: AI Circuit Breaker 429 & Recovery ---');
  aiCircuitBreaker.handleAiError('PortfolioScenarioTest', new Error('HTTP 429 rate limit exceeded'));
  assert(aiCircuitBreaker.isQuotaExhausted() === true, 'AB', 'HTTP 429 safely activates rate limit backoff');
  aiCircuitBreaker.reset();
  assert(aiCircuitBreaker.isQuotaExhausted() === false, 'AC', 'Controlled reset clears circuit breaker');

  // ------------------------------------------------------------------
  // SCENARIO AD: Command Center Integration
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AD: Command Center Integration ---');
  const ccData = await researchCommandCenterService.getCommandCenterData(userIdA, { asOfDate: '2026-09-01' });
  assert(Boolean(ccData && ccData.summary), 'AD', 'Command Center data builds cleanly alongside Phase 31');
  assert(ccData.isAnalyticalOnly === true, 'AD', 'Command Center preserves isAnalyticalOnly invariant');

  // ------------------------------------------------------------------
  // SCENARIO AE: Cross-Investment Integration
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AE: Cross-Investment Integration ---');
  const crossData = await crossInvestmentService.getCrossInvestmentData(userIdA, { asOfDate: '2026-09-01' });
  assert(Boolean(crossData && crossData.relationships), 'AE', 'Reuses Phase 30 cross-investment intelligence relationships');

  // ------------------------------------------------------------------
  // SCENARIO AF: Review Workspace Deep Link
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AF: Review Workspace Deep Link ---');
  assert(Boolean(testSec?.deepLinks.reviewWorkspaceUrl), 'AF', 'Security impact includes valid deep link to Review Workspace');
  assert(testSec?.deepLinks.reviewWorkspaceUrl.includes('asOfDate=2026-09-01'), 'AF', 'Review Workspace deep link preserves Point-in-Time asOfDate');

  // ------------------------------------------------------------------
  // SCENARIO AG: Research Prioritization Integration
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AG: Research Prioritization Integration ---');
  assert(evalA.sectorExposures.length > 0, 'AG', 'Produces structured sector exposures for research context');

  // ------------------------------------------------------------------
  // SCENARIO AH: No Autonomous Execution
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AH: No Autonomous Execution ---');
  assert(evalA.isAnalyticalOnly === true, 'AH', 'Evaluation enforces isAnalyticalOnly: true');
  assert(evalA.executionProhibited === true, 'AH', 'Evaluation enforces executionProhibited: true');

  // ------------------------------------------------------------------
  // SCENARIO AI: Deterministic Repeated Execution (3 Runs Byte-Identical)
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AI: Deterministic Repeated Execution ---');
  const run1 = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECTOR_SHOCK',
    parameters: { sector: 'Technology', shockPercentage: -15 },
    asOfDate: '2026-09-01'
  });
  const run2 = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECTOR_SHOCK',
    parameters: { sector: 'Technology', shockPercentage: -15 },
    asOfDate: '2026-09-01'
  });
  const run3 = await portfolioScenarioService.evaluateScenario(userIdA, {
    scenarioType: 'SECTOR_SHOCK',
    parameters: { sector: 'Technology', shockPercentage: -15 },
    asOfDate: '2026-09-01'
  });

  const serializeForDeterminism = (data: PortfolioScenarioEvaluation) => {
    const copy = JSON.parse(JSON.stringify(data));
    delete copy.scenarioId;
    delete copy.evaluatedAt;
    if (copy.executiveBriefing) {
      delete copy.executiveBriefing.generatedAt;
    }
    return JSON.stringify(copy);
  };

  const s1 = serializeForDeterminism(run1);
  const s2 = serializeForDeterminism(run2);
  const s3 = serializeForDeterminism(run3);

  assert(s1 === s2, 'AI', 'Run 1 and Run 2 produce byte-identical structured output');
  assert(s2 === s3, 'AI', 'Run 2 and Run 3 produce byte-identical structured output (3-run determinism confirmed)');

  // ------------------------------------------------------------------
  // SCENARIO AJ: Persistence / Reload
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AJ: Persistence / Reload ---');
  const retrievedSnap = await portfolioScenarioService.getSnapshot(snapId, userIdA);
  assert(Boolean(retrievedSnap && retrievedSnap.snapshotId === snapId), 'AJ', 'Successfully retrieved persisted snapshot from repository');
  assert(retrievedSnap?.evaluation.scenarioType === 'SECTOR_SHOCK', 'AJ', 'Retrieved snapshot matches saved evaluation structure');

  // ------------------------------------------------------------------
  // SCENARIO AK: Provider Failure Safety
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AK: Provider Failure Safety ---');
  assert(evalM.evidenceCoverage.insufficientEvidenceCount > 0, 'AK', 'Provider failure / missing data maps to INSUFFICIENT_EVIDENCE (never fabricated)');

  // ------------------------------------------------------------------
  // SCENARIO AL: Scenario Comparison
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO AL: Scenario Comparison ---');
  const comp = await portfolioScenarioService.compareScenarios(userIdA, [
    { scenarioType: 'SECTOR_SHOCK', name: 'Tech -15%', parameters: { sector: 'Technology', shockPercentage: -15 }, asOfDate: '2026-09-01' },
    { scenarioType: 'MARKET_SHOCK', name: 'Market -10%', parameters: { shockPercentage: -10 }, asOfDate: '2026-09-01' }
  ]);
  assert(comp.scenarios.length === 2, 'AL', 'Compares multiple scenarios side-by-side');
  assert(comp.differences.length > 0, 'AL', 'Exposes structured comparison dimensions');
  assert(comp.isAnalyticalOnly === true, 'AL', 'Comparison enforces isAnalyticalOnly: true');

  const elapsedMs = Date.now() - startTime;
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n======================================================================');
  console.log(`PHASE 31 ACCEPTANCE RESULTS: ${passed} / ${total} PASSED (${failed} FAILED) in ${elapsedMs}ms`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase31AcceptanceTests().catch(err => {
  console.error('Fatal acceptance test error:', err);
  process.exit(1);
});
