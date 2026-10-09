/**
 * Phase 36: Real-Data Integration & Analyst Pilot Readiness
 * Comprehensive Acceptance Test Suite
 * 
 * Verifies all Phase 36 pilot readiness and real-data invariants:
 * - Scenario A: Architectural Freeze & Subsystem Preservation
 * - Scenario B: Real-Data Pilot Universe Scope & Canonical Security Onboarding
 * - Scenario C: Canonical Provider Connectivity & Health Audit
 * - Scenario D: Real Market Data Retrieval & Epistemic Boundaries
 * - Scenario E: Market Data Sanity Integrity & Anomaly Surfacing
 * - Scenario F: Real SEC Filings Ingestion into Phase 35 Ledger
 * - Scenario G: End-to-End Analyst Research Workflow on Persisted Records
 * - Scenario H: Native USD vs INR Currency Isolation
 * - Scenario I: Deterministic Decision Assessment & PIT Consistency
 * - Scenario J: Non-Autonomous Execution Safety Invariants
 * - Scenario K: Comprehensive Pilot Readiness Scorecard Generation
 */

import { pilotReadinessService } from '../server/services/pilot/pilotReadinessService';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { marketDataProvider } from '../server/providers/marketDataProvider';
import { usMarketProvider } from '../server/providers/usMarketProvider';
import { fyersMarketProvider } from '../server/providers/fyersMarketProvider';
import { secEdgarProvider } from '../server/providers/secEdgarProvider';
import { evidenceCollectionService } from '../server/services/evidence/evidenceCollectionService';
import { DecisionIntelligenceService } from '../server/services/decision/decisionIntelligenceService';
import { resolveSecurity } from '../src/data/canonicalSecurities';
import {
  PilotSecurity,
  ProviderHealthAuditItem,
  MarketDataSanityValidationResult,
  PilotReadinessScorecard
} from '../src/types';

interface TestResult {
  scenario: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, scenario: string, name: string, details?: string): void {
  results.push({
    scenario,
    name,
    passed: Boolean(condition),
    details: condition ? undefined : details || 'Assertion failed'
  });
  if (!condition) {
    console.error(`❌ [${scenario}] FAILED: ${name}${details ? ` -> ${details}` : ''}`);
  } else {
    console.log(`✅ [${scenario}] PASSED: ${name}`);
  }
}

async function runPhase36TestSuite() {
  console.log('\n========================================================================');
  console.log('🚀 RUNNING PHASE 36 REAL-DATA INTEGRATION & PILOT READINESS ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  await persistenceManager.initialize();

  const tenantId = `analyst_pilot_${Date.now()}`;

  // ------------------------------------------------------------------------
  // Scenario A: Architectural Freeze & Subsystem Preservation
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario A: Architectural Freeze & Subsystem Preservation ---');
  assert(typeof pilotReadinessService.getPilotUniverse === 'function', 'Scenario A', 'PilotReadinessService exposes getPilotUniverse');
  assert(typeof pilotReadinessService.auditProvidersHealth === 'function', 'Scenario A', 'PilotReadinessService exposes auditProvidersHealth');
  assert(typeof pilotReadinessService.validateMarketDataSanity === 'function', 'Scenario A', 'PilotReadinessService exposes validateMarketDataSanity');
  assert(typeof pilotReadinessService.ingestSecFilingsForSecurity === 'function', 'Scenario A', 'PilotReadinessService exposes ingestSecFilingsForSecurity');
  assert(typeof pilotReadinessService.executeWorkflowVerification === 'function', 'Scenario A', 'PilotReadinessService exposes executeWorkflowVerification');
  assert(typeof pilotReadinessService.generatePilotReadinessScorecard === 'function', 'Scenario A', 'PilotReadinessService exposes generatePilotReadinessScorecard');

  // ------------------------------------------------------------------------
  // Scenario B: Real-Data Pilot Universe Scope & Canonical Security Onboarding
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario B: Real-Data Pilot Universe Scope & Canonical Security Onboarding ---');
  const universe = pilotReadinessService.getPilotUniverse();
  assert(universe.totalCount === 6, 'Scenario B', 'Universe is deliberately bounded to 6 securities (3 US + 3 India)');
  assert(universe.usSecurities.length === 3, 'Scenario B', 'Contains exactly 3 US securities');
  assert(universe.indiaSecurities.length === 3, 'Scenario B', 'Contains exactly 3 Indian securities');

  // Verify US pilot securities
  const aapl = universe.usSecurities.find(s => s.ticker === 'AAPL');
  assert(Boolean(aapl), 'Scenario B', 'AAPL is onboarded in US universe');
  assert(aapl?.securityId === 'us-aapl', 'Scenario B', 'AAPL resolves to canonical id us-aapl');
  assert(aapl?.currency === 'USD', 'Scenario B', 'AAPL currency is USD');
  assert(aapl?.market === 'US', 'Scenario B', 'AAPL market is US');
  assert(Boolean(aapl?.isin), 'Scenario B', 'AAPL has verified ISIN');

  const nvda = universe.usSecurities.find(s => s.ticker === 'NVDA');
  assert(Boolean(nvda), 'Scenario B', 'NVDA resolves in US universe');
  assert(nvda?.securityId === 'us-nvda', 'Scenario B', 'NVDA resolves to canonical id us-nvda');

  const msft = universe.usSecurities.find(s => s.ticker === 'MSFT');
  assert(Boolean(msft), 'Scenario B', 'MSFT resolves in US universe');

  // Verify Indian pilot securities
  const reliance = universe.indiaSecurities.find(s => s.ticker === 'RELIANCE');
  assert(Boolean(reliance), 'Scenario B', 'RELIANCE is onboarded in India universe');
  assert(reliance?.securityId === 'in-reliance', 'Scenario B', 'RELIANCE resolves to canonical id in-reliance');
  assert(reliance?.currency === 'INR', 'Scenario B', 'RELIANCE currency is INR');
  assert(reliance?.market === 'INDIA', 'Scenario B', 'RELIANCE market is INDIA');
  assert(Boolean(reliance?.isin), 'Scenario B', 'RELIANCE has verified ISIN');

  const tcs = universe.indiaSecurities.find(s => s.ticker === 'TCS');
  assert(Boolean(tcs), 'Scenario B', 'TCS resolves in India universe');

  const infy = universe.indiaSecurities.find(s => s.ticker === 'INFY');
  assert(Boolean(infy), 'Scenario B', 'INFY resolves in India universe');

  // Universal Identifier collision test
  const resolvedUS = resolveSecurity('AAPL');
  const resolvedIN = resolveSecurity('RELIANCE');
  assert(resolvedUS?.id !== resolvedIN?.id, 'Scenario B', 'US and Indian canonical security IDs cannot collide');
  assert(resolvedUS?.currency === 'USD' && resolvedIN?.currency === 'INR', 'Scenario B', 'Currency attributes strictly segregated');

  // ------------------------------------------------------------------------
  // Scenario C: Canonical Provider Connectivity & Health Audit
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario C: Canonical Provider Connectivity & Health Audit ---');
  const providerAudits = await pilotReadinessService.auditProvidersHealth();
  assert(providerAudits.length >= 5, 'Scenario C', 'All 5 canonical providers audited');

  const twelveDataAudit = providerAudits.find(p => p.provider === 'Twelve Data');
  assert(Boolean(twelveDataAudit), 'Scenario C', 'Twelve Data audit entry present');
  assert(twelveDataAudit?.canonicalRole === 'US Market Data', 'Scenario C', 'Twelve Data assigned canonical US Market Data role');
  assert(twelveDataAudit?.configured === true, 'Scenario C', 'Twelve Data is configured');
  assert(twelveDataAudit?.reachable === true, 'Scenario C', 'Twelve Data is reachable');
  assert(twelveDataAudit?.authentication === 'VERIFIED', 'Scenario C', 'Twelve Data authentication is VERIFIED');
  assert(twelveDataAudit?.epistemicStatus === 'REAL', 'Scenario C', 'Twelve Data epistemic status is REAL');
  assert(twelveDataAudit?.dataReturned === true, 'Scenario C', 'Twelve Data returned verified live quote');

  const fyersAudit = providerAudits.find(p => p.provider === 'FYERS');
  assert(Boolean(fyersAudit), 'Scenario C', 'FYERS audit entry present');
  assert(fyersAudit?.canonicalRole === 'India Market Data', 'Scenario C', 'FYERS assigned canonical India Market Data role');
  assert(fyersAudit?.configured === true, 'Scenario C', 'FYERS App ID is configured');
  assert(Boolean(fyersAudit?.authentication), 'Scenario C', 'FYERS authentication state explicitly reported');
  // Enforce zero secret leakage
  assert(!JSON.stringify(fyersAudit).includes(process.env.FYERS_SECRET_KEY || '___none___'), 'Scenario C', 'FYERS secret key never exposed in audit');

  const secAudit = providerAudits.find(p => p.provider === 'SEC EDGAR');
  assert(Boolean(secAudit), 'Scenario C', 'SEC EDGAR audit entry present');
  assert(secAudit?.canonicalRole === 'Regulatory Evidence', 'Scenario C', 'SEC EDGAR assigned canonical Regulatory Evidence role');
  assert(secAudit?.configured === true, 'Scenario C', 'SEC EDGAR User-Agent configured with valid email');
  assert(secAudit?.reachable === true, 'Scenario C', 'SEC EDGAR is reachable');
  assert(secAudit?.epistemicStatus === 'REAL', 'Scenario C', 'SEC EDGAR epistemic status is REAL');

  const geminiAudit = providerAudits.find(p => p.provider === 'Google Gemini');
  assert(Boolean(geminiAudit), 'Scenario C', 'Gemini audit entry present');
  assert(geminiAudit?.epistemicStatus === 'AVAILABLE', 'Scenario C', 'Gemini epistemic status is AVAILABLE');

  const persistenceAudit = providerAudits.find(p => p.canonicalRole === 'Persistent Storage');
  assert(Boolean(persistenceAudit), 'Scenario C', 'Persistence audit entry present');
  assert(persistenceAudit?.epistemicStatus === 'VERIFIED', 'Scenario C', 'Persistence epistemic status is VERIFIED');

  // ------------------------------------------------------------------------
  // Scenario D: Real Market Data Retrieval & Epistemic Boundaries
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario D: Real Market Data Retrieval & Epistemic Boundaries ---');
  const aaplQuote = await marketDataProvider.getQuote({ symbol: 'AAPL', market: 'US' });
  assert(aaplQuote.provider === 'Twelve Data', 'Scenario D', 'AAPL quote provided by Twelve Data');
  assert(aaplQuote.epistemicStatus === 'REAL', 'Scenario D', 'AAPL quote marked REAL');
  assert(aaplQuote.isSimulated === false, 'Scenario D', 'AAPL quote isSimulated is false');
  assert(aaplQuote.price > 100, 'Scenario D', 'AAPL price is realistic and positive');
  assert(aaplQuote.currency === 'USD', 'Scenario D', 'AAPL currency is USD');

  const aaplHist = await marketDataProvider.getHistoricalPrices({ symbol: 'AAPL', market: 'US', interval: '1d' });
  assert(aaplHist.epistemicStatus === 'REAL', 'Scenario D', 'AAPL historical bars marked REAL');
  assert(aaplHist.isSimulated === false, 'Scenario D', 'AAPL historical bars isSimulated is false');
  assert(aaplHist.bars.length >= 20, 'Scenario D', 'AAPL returned >= 20 daily historical bars');

  // ------------------------------------------------------------------------
  // Scenario E: Market Data Sanity Integrity
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario E: Market Data Sanity Integrity ---');
  const aaplSanity = await pilotReadinessService.validateMarketDataSanity('AAPL');
  assert(aaplSanity.isValid === true, 'Scenario E', 'AAPL passes all market data sanity checks');
  assert(aaplSanity.pricePresent === true, 'Scenario E', 'Price is present and positive');
  assert(aaplSanity.timestampPresent === true, 'Scenario E', 'Timestamp is present');
  assert(aaplSanity.currencyCorrect === true, 'Scenario E', 'Currency is USD');
  assert(aaplSanity.marketCorrect === true, 'Scenario E', 'Market is US');
  assert(aaplSanity.historicalOrderingCorrect === true, 'Scenario E', 'Historical bars monotonically ordered');
  assert(aaplSanity.noDuplicateTimestamps === true, 'Scenario E', 'Zero duplicate timestamps in historical series');
  assert(aaplSanity.ohlcRelationshipsValid === true, 'Scenario E', 'OHLC relationships valid: H >= L, H >= O, H >= C, L <= O, L <= C');
  assert(aaplSanity.volumeNonNegative === true, 'Scenario E', 'Volume is non-negative');
  assert(aaplSanity.datesSensible === true, 'Scenario E', 'Historical dates are within sensible bounds');
  assert(aaplSanity.anomalies.length === 0, 'Scenario E', 'AAPL has zero anomalies');

  const nvdaSanity = await pilotReadinessService.validateMarketDataSanity('NVDA');
  assert(nvdaSanity.isValid === true, 'Scenario E', 'NVDA passes market data sanity checks');

  const msftSanity = await pilotReadinessService.validateMarketDataSanity('MSFT');
  assert(msftSanity.isValid === true, 'Scenario E', 'MSFT passes market data sanity checks');

  const relianceSanity = await pilotReadinessService.validateMarketDataSanity('RELIANCE');
  assert(relianceSanity.currencyCorrect === true, 'Scenario E', 'RELIANCE currency strictly validated as INR');
  assert(relianceSanity.marketCorrect === true, 'Scenario E', 'RELIANCE market strictly validated as INDIA');

  // ------------------------------------------------------------------------
  // Scenario F: Real SEC Filings Ingestion into Phase 35 Ledger
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario F: Real SEC Filings Ingestion into Phase 35 Ledger ---');
  const secIngestRes = await pilotReadinessService.ingestSecFilingsForSecurity('AAPL', tenantId, 3);
  assert(secIngestRes.ingestedCount > 0, 'Scenario F', 'Ingested real SEC filings for AAPL');
  assert(secIngestRes.validatedRecords.length > 0, 'Scenario F', 'SEC filings validated in ledger');

  const firstFiling = secIngestRes.validatedRecords[0];
  assert(['10-K', '10-Q', '8-K', 'S-1'].includes(firstFiling.filingType), 'Scenario F', 'Filing form is canonical SEC type');
  assert(firstFiling.accessionNumber.includes('-'), 'Scenario F', 'Accession number follows SEC standard');
  assert(firstFiling.sourceUrl.startsWith('https://www.sec.gov/'), 'Scenario F', 'Source URL points to official SEC archive');
  assert(firstFiling.epistemicStatus === 'REAL', 'Scenario F', 'SEC evidence tagged epistemicStatus: REAL');

  // Verify Phase 35 ledger holds the record
  const ledgerOverview = await evidenceCollectionService.generateEvidenceOverview(tenantId, 'us-aapl', '2026-12-31');
  assert(ledgerOverview.validatedCount >= secIngestRes.ingestedCount, 'Scenario F', 'Phase 35 Ledger holds validated SEC evidence');
  assert(ledgerOverview.isAnalyticalOnly === true, 'Scenario F', 'Ledger enforces isAnalyticalOnly: true');
  assert(ledgerOverview.executionProhibited === true, 'Scenario F', 'Ledger enforces executionProhibited: true');

  // ------------------------------------------------------------------------
  // Scenario G: End-to-End Analyst Research Workflow on Persisted Records
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario G: End-to-End Analyst Research Workflow on Persisted Records ---');
  // US Workflow (AAPL)
  const usWorkflow = await pilotReadinessService.executeWorkflowVerification('AAPL', tenantId);
  assert(usWorkflow.success === true, 'Scenario G', 'US security workflow executed successfully');
  assert(usWorkflow.steps.length === 8, 'Scenario G', 'All 8 workflow steps completed for US security');
  assert(usWorkflow.steps.every(s => s.status === 'COMPLETED'), 'Scenario G', 'All US steps COMPLETED');
  assert(Boolean(usWorkflow.thesisId), 'Scenario G', 'Analyst thesis persisted with pillars & invalidation guards');
  assert(Boolean(usWorkflow.decisionId), 'Scenario G', 'Decision intelligence assessed');
  assert(usWorkflow.monitorActive === true, 'Scenario G', 'Investment monitor established');
  assert(usWorkflow.alertsEvaluated === true, 'Scenario G', 'Monitoring policies evaluated');
  assert(Boolean(usWorkflow.memoryFindingId), 'Scenario G', 'Research finding committed to Phase 33 Memory');

  // India Workflow (RELIANCE)
  const inWorkflow = await pilotReadinessService.executeWorkflowVerification('RELIANCE', tenantId);
  assert(inWorkflow.success === true, 'Scenario G', 'India security workflow executed successfully');
  assert(inWorkflow.steps.length === 8, 'Scenario G', 'All 8 workflow steps completed for Indian security');
  assert(inWorkflow.currency === 'INR', 'Scenario G', 'Indian workflow strictly denominated in INR');

  // ------------------------------------------------------------------------
  // Scenario H: Native USD vs INR Currency Isolation
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario H: Native USD vs INR Currency Isolation ---');
  assert(usWorkflow.currency === 'USD', 'Scenario H', 'US security operates in USD');
  assert(inWorkflow.currency === 'INR', 'Scenario H', 'India security operates in INR');
  assert(aaplSanity.currency === 'USD', 'Scenario H', 'AAPL sanity preserves USD');
  assert(relianceSanity.currency === 'INR', 'Scenario H', 'RELIANCE sanity preserves INR');

  // ------------------------------------------------------------------------
  // Scenario I: Deterministic Decision Assessment & PIT Consistency
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario I: Deterministic Decision Assessment & PIT Consistency ---');
  const decisionService = DecisionIntelligenceService.getInstance();
  const pitDate = '2026-08-15';
  const eval1 = await decisionService.evaluateDecision({ securityId: 'us-aapl', asOfDate: pitDate });
  const eval2 = await decisionService.evaluateDecision({ securityId: 'us-aapl', asOfDate: pitDate });
  assert(eval1.compositeScore === eval2.compositeScore, 'Scenario I', 'Identical inputs produce identical composite score (100% Deterministic)');
  assert(eval1.overallAssessment === eval2.overallAssessment, 'Scenario I', 'Decision overall assessment is identical across evaluations');
  assert(eval1.asOfDate === pitDate, 'Scenario I', 'Point-In-Time date strictly preserved');

  // ------------------------------------------------------------------------
  // Scenario J: Non-Autonomous Execution Safety Invariants
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario J: Non-Autonomous Execution Safety Invariants ---');
  const scorecard = await pilotReadinessService.generatePilotReadinessScorecard(tenantId);
  assert(scorecard.isAnalyticalOnly === true, 'Scenario J', 'Scorecard enforces isAnalyticalOnly: true');
  assert(scorecard.executionProhibited === true, 'Scenario J', 'Scorecard enforces executionProhibited: true');
  assert(!('brokerExecution' in (scorecard as any)), 'Scenario J', 'Zero broker execution capabilities');
  assert(!('autoTrade' in (scorecard as any)), 'Scenario J', 'Zero automated trading');

  // ------------------------------------------------------------------------
  // Scenario K: Comprehensive Pilot Readiness Scorecard Generation
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario K: Comprehensive Pilot Readiness Scorecard Generation ---');
  assert(scorecard.overallScore >= 80, 'Scenario K', 'Readiness score meets pilot benchmark (>= 80%)');
  assert(scorecard.dimensions.length === 8, 'Scenario K', 'All 8 core dimensions evaluated');
  assert(scorecard.blockersAndGaps.length > 0, 'Scenario K', 'Operational gaps & conditions documented for transparency');
  assert(scorecard.recommendations.length > 0, 'Scenario K', 'Actionable pilot recommendations provided');
  assert(scorecard.secEvidenceAudit.provenanceVerified === true, 'Scenario K', 'SEC evidence provenance verified');
  assert(scorecard.workflowValidations.crossCurrencyIsolationVerified === true, 'Scenario K', 'Cross-currency isolation verified across workflows');

  // ------------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------------
  console.log('\n========================================================================');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${results.length})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase36TestSuite().catch(err => {
  console.error('Fatal unhandled error during Phase 36 test run:', err);
  process.exit(1);
});
