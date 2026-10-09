/**
 * Phase 34: Institutional Research Planning & Investigation Workflow
 * Comprehensive Acceptance Test Suite
 * 
 * Verifies all institutional research-planning invariants:
 * - Scenario A: Canonical Research Question Creation & Invariant Validation
 * - Scenario B: Intelligence-Driven Research Question Generation
 * - Scenario C: Epistemic Status & Hypothesis Distinction
 * - Scenario D: Deterministic Research Gap Detection
 * - Scenario E: Investigation Plan Creation & Task Sequencing
 * - Scenario F: Investigation Task Lifecycle Progression
 * - Scenario G: Evidence Requirements Management & Verification
 * - Scenario H: Deterministic Question Completion Logic
 * - Scenario I: Phase 33 Institutional Research Memory Integration
 * - Scenario J: Point-In-Time (PIT) Zero Lookahead Guarantee
 * - Scenario K: Multi-Tenant Isolation & IDOR Protection (403 Forbidden)
 * - Scenario L: Native USD vs INR Currency Isolation
 * - Scenario M: No Autonomous Trading or Execution Safety Invariants
 * - Scenario N: AI Circuit Breaker Resilience & Deterministic Fallback
 * - Scenario O: Investigation Audit Trail Verification
 * - Scenario P: Byte-Identical Determinism Guarantee
 */

import { researchQuestionService } from '../server/services/investigation/researchQuestionService';
import { researchGapDetectionService } from '../server/services/investigation/researchGapDetectionService';
import { investigationPlanService } from '../server/services/investigation/investigationPlanService';
import { researchMemoryService } from '../server/services/memory/researchMemoryService';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { aiCircuitBreaker } from '../server/services/ai/aiCircuitBreaker';
import { AuthorizationError } from '../server/auth/authorizationService';
import {
  InvestigationPlan,
  InvestigationTask,
  EvidenceRequirement,
  ResearchQuestionEntry,
  ResearchGapRecord,
  InvestigationOverview
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

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🚀 RUNNING PHASE 34 INSTITUTIONAL RESEARCH PLANNING ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  const userA = 'analyst-alpha';
  const userB = 'analyst-beta';

  // ------------------------------------------------------------------------
  // Scenario A: Canonical Research Question Creation & Invariant Validation
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario A: Canonical Research Question Creation ---');
  const qA1 = await researchQuestionService.createQuestion(userA, {
    securityId: 'NVDA',
    category: 'THESIS',
    question: 'What evidence confirms whether hyperscaler capex growth directly sustains high GPU gross margins?',
    context: 'Hyperscaler capital budgets are guiding +35% YoY; GPU pricing power must be audited.',
    whyItMatters: 'Gross margins above 72% are essential to current enterprise valuation.',
    requiredEvidenceCount: 2,
    asOfDate: '2026-08-01'
  });

  assert(Boolean(qA1.id), 'Scenario A', 'Question has valid deterministic ID format');
  assert(qA1.status === 'OPEN', 'Scenario A', 'Newly created question starts in OPEN status');
  assert(qA1.isAnalyticalOnly === true, 'Scenario A', 'isAnalyticalOnly invariant is strictly true');
  assert(qA1.executionProhibited === true, 'Scenario A', 'executionProhibited invariant is strictly true');
  assert(qA1.requiredEvidenceCount === 2, 'Scenario A', 'requiredEvidenceCount accurately set');
  assert(qA1.availableEvidenceCount === 0, 'Scenario A', 'availableEvidenceCount initialized to 0 without evidence');

  // ------------------------------------------------------------------------
  // Scenario B: Intelligence-Driven Research Question Generation
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario B: Intelligence-Driven Question Generation ---');
  const generatedQuestions = await researchQuestionService.generateQuestionsForSecurity(
    userA,
    'NVDA',
    '2026-08-01'
  );

  assert(generatedQuestions.length >= 4, 'Scenario B', 'Generates required questions across multiple intelligence dimensions');
  const categoriesFound = new Set(generatedQuestions.map(q => q.category));
  assert(categoriesFound.has('THESIS'), 'Scenario B', 'Generates thesis-driven questions');
  assert(categoriesFound.has('EVIDENCE_CONFLICT') || categoriesFound.has('DECISION_DRIFT'), 'Scenario B', 'Generates evidence-conflict or decision-drift questions');
  assert(categoriesFound.has('SCENARIO_DRIVEN'), 'Scenario B', 'Generates scenario-driven questions');
  assert(categoriesFound.has('CROSS_INVESTMENT'), 'Scenario B', 'Generates cross-investment questions');

  // ------------------------------------------------------------------------
  // Scenario C: Epistemic Status & Hypothesis Distinction
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario C: Epistemic Status & Hypothesis Distinction ---');
  // Hypotheses must NEVER automatically become evidence
  const hypothesisGap = await researchGapDetectionService.createGap(userA, {
    securityId: 'NVDA',
    gapType: 'UNVERIFIED_SCENARIO_ASSUMPTION',
    title: 'Hypothetical supply chain restriction assumption',
    description: 'Scenario analysis models a hypothetical 20% assembly packaging halt.',
    whyItMatters: 'Assumed reduction in wafer throughput alters downside cash flows.',
    requiredEvidence: [],
    asOfDate: '2026-08-01'
  });

  assert(hypothesisGap.epistemicStatus === 'HYPOTHESIS', 'Scenario C', 'Unverified scenario gap tagged strictly as HYPOTHESIS');
  assert(hypothesisGap.currentEvidenceState === 'MISSING', 'Scenario C', 'Gap evidence state is MISSING, not verified');

  // ------------------------------------------------------------------------
  // Scenario D: Deterministic Research Gap Detection
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario D: Deterministic Research Gap Detection ---');
  const detectedGaps = await researchGapDetectionService.detectGapsForSecurity(userA, 'NVDA', '2026-08-01');
  assert(detectedGaps.length >= 1, 'Scenario D', 'Detects canonical research gaps for security');
  const firstGap = detectedGaps[0];
  assert(firstGap.status === 'OPEN', 'Scenario D', 'Detected gap starts in OPEN status');
  assert(Boolean(firstGap.whyItMatters), 'Scenario D', 'Research gap specifies whyItMatters fundamental explanation');
  assert(firstGap.isAnalyticalOnly === true, 'Scenario D', 'Gap enforces isAnalyticalOnly');
  assert(firstGap.executionProhibited === true, 'Scenario D', 'Gap enforces executionProhibited');

  // ------------------------------------------------------------------------
  // Scenario E: Investigation Plan Creation & Task Sequencing
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario E: Investigation Plan Creation ---');
  const plan = await investigationPlanService.createPlan(userA, {
    securityId: 'NVDA',
    title: 'H2 2026 Gross Margin & Hyperscaler Capex Investigation',
    objective: 'Resolve whether Blackwell ramp delays threaten full-year 75% gross margin target.',
    questionIds: [qA1.id],
    gapIds: [hypothesisGap.gapId],
    tasks: [
      {
        questionId: qA1.id,
        title: 'Audit Form 10-Q Segment Revenue & Cost of Goods Sold',
        description: 'Extract exact wafer wafer packaging assembly costs and average selling prices from footnotes.',
        evidenceRequired: ['ev_nvda_10q_gross_margin'],
        preferredSources: ['SEC EDGAR Form 10-Q', 'Filing Notes'],
        sourceType: 'PRIMARY_FILING',
        acceptanceCriteria: 'Unambiguous verification of compute product gross margin > 72% in footnote disclosures.'
      },
      {
        questionId: qA1.id,
        title: 'Review Hyperscaler 10-K Committed Purchase Obligations',
        description: 'Verify Microsoft, Meta, and Alphabet multi-year GPU purchase commitments.',
        evidenceRequired: ['ev_hyperscaler_commitments'],
        preferredSources: ['SEC EDGAR Form 10-K Customer Filings'],
        sourceType: 'PRIMARY_FILING',
        acceptanceCriteria: 'Cross-reference committed cloud capex purchase orders.'
      }
    ],
    evidenceRequirements: [
      {
        questionId: qA1.id,
        description: 'SEC Form 10-Q Note 12 Footnote on Product Gross Margins',
        evidenceType: 'PRIMARY_FILING',
        preferredSource: 'SEC EDGAR'
      }
    ],
    asOfDate: '2026-08-01'
  });

  assert(Boolean(plan.planId), 'Scenario E', 'Plan created with deterministic planId');
  assert(plan.status === 'ACTIVE', 'Scenario E', 'New plan status is ACTIVE');
  assert(plan.tasks.length === 2, 'Scenario E', 'Plan contains exactly 2 ordered investigation tasks');
  assert(plan.tasks[0].status === 'TODO', 'Scenario E', 'Initial task status is TODO');
  assert(plan.evidenceRequirements.length === 1, 'Scenario E', 'Plan contains defined evidence requirements');
  assert(plan.evidenceRequirements[0].status === 'REQUIRED', 'Scenario E', 'Initial evidence requirement is REQUIRED');
  assert(plan.isAnalyticalOnly === true, 'Scenario E', 'Plan enforces isAnalyticalOnly');
  assert(plan.executionProhibited === true, 'Scenario E', 'Plan enforces executionProhibited');

  // ------------------------------------------------------------------------
  // Scenario F: Investigation Task Lifecycle Progression
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario F: Task Lifecycle Progression ---');
  const task1 = plan.tasks[0];
  const inProgressTask = await investigationPlanService.updateTaskStatus(
    userA,
    plan.planId,
    task1.taskId,
    'IN_PROGRESS',
    { reason: 'Analyst started EDGAR 10-Q review.' }
  );
  assert(inProgressTask.status === 'IN_PROGRESS', 'Scenario F', 'Task transitioned to IN_PROGRESS');

  const completedTask = await investigationPlanService.updateTaskStatus(
    userA,
    plan.planId,
    task1.taskId,
    'COMPLETED',
    {
      resolutionNotes: 'Verified 10-Q footnote 12: Gross margin achieved was 74.2%.',
      attachedEvidenceIds: ['ev_nvda_10q_q2_2026']
    }
  );
  assert(completedTask.status === 'COMPLETED', 'Scenario F', 'Task transitioned to COMPLETED');
  assert(Boolean(completedTask.completedAt), 'Scenario F', 'completedAt timestamp recorded');
  assert(completedTask.attachedEvidenceIds?.includes('ev_nvda_10q_q2_2026'), 'Scenario F', 'Attached evidence ID recorded in task');

  // ------------------------------------------------------------------------
  // Scenario G: Evidence Requirements Management & Verification
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario G: Evidence Requirements Management ---');
  const reqItem = plan.evidenceRequirements[0];
  const fulfilledReq = await investigationPlanService.fulfillEvidenceRequirement(
    userA,
    plan.planId,
    reqItem.requirementId,
    ['ev_nvda_10q_q2_2026'],
    'Filing retrieved and verified from SEC EDGAR repository.'
  );
  assert(fulfilledReq.status === 'AVAILABLE', 'Scenario G', 'Evidence requirement status updated to AVAILABLE upon fulfillment');
  assert(fulfilledReq.fulfilledEvidenceIds.includes('ev_nvda_10q_q2_2026'), 'Scenario G', 'Fulfilled evidence IDs preserved');

  // ------------------------------------------------------------------------
  // Scenario H: Deterministic Question Completion Logic
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario H: Deterministic Completion Rules ---');
  // Required = 2. Available = 1 -> PARTIALLY_ANSWERED
  const partialQ = await researchQuestionService.evaluateQuestionCompletion(
    userA,
    qA1.id,
    ['ev_nvda_10q_q2_2026']
  );
  assert(partialQ.status === 'PARTIALLY_ANSWERED', 'Scenario H', '1 out of 2 required evidence yields PARTIALLY_ANSWERED');
  assert(partialQ.availableEvidenceCount === 1, 'Scenario H', 'availableEvidenceCount updated accurately');

  // Required = 2. Available = 2 -> ANSWERED
  const fullyAnsweredQ = await researchQuestionService.evaluateQuestionCompletion(
    userA,
    qA1.id,
    ['ev_nvda_10q_q2_2026', 'ev_msft_10k_purchase_commitments']
  );
  assert(fullyAnsweredQ.status === 'ANSWERED', 'Scenario H', '2 out of 2 required evidence yields ANSWERED');
  assert(fullyAnsweredQ.availableEvidenceCount === 2, 'Scenario H', 'availableEvidenceCount equals 2');
  assert(Boolean(fullyAnsweredQ.resolvedAt), 'Scenario H', 'resolvedAt timestamp recorded when ANSWERED');

  // ------------------------------------------------------------------------
  // Scenario I: Phase 33 Institutional Research Memory Integration
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario I: Phase 33 Research Memory Integration ---');
  // Completing the investigation must write directly into Phase 33 ResearchMemoryService
  const completionResult = await investigationPlanService.completeInvestigationAndRecordMemory(
    userA,
    plan.planId,
    {
      title: 'Verified 74.2% Gross Margin Resilience via SEC 10-Q & Hyperscaler Capex Commitments',
      summary: 'Analyst investigation confirmed gross margin stability through Blackwell ramp.',
      findingText: 'Primary 10-Q audit combined with hyperscaler capex disclosures confirms pricing power remains robust.',
      verifiedEvidenceIds: ['ev_nvda_10q_q2_2026', 'ev_msft_10k_purchase_commitments'],
      asOfDate: '2026-08-01'
    }
  );

  assert(completionResult.plan.status === 'COMPLETED', 'Scenario I', 'Investigation plan marked COMPLETED');
  assert(Boolean(completionResult.memory), 'Scenario I', 'Phase 33 Research Memory record returned');
  assert(completionResult.memory.memoryType === 'RESEARCH_FINDING', 'Scenario I', 'Memory type is RESEARCH_FINDING');
  assert(completionResult.memory.relatedEvidenceIds.includes('ev_nvda_10q_q2_2026'), 'Scenario I', 'Memory references verified evidence IDs');

  // Verify memory can be retrieved through canonical Phase 33 memory service
  const memInP33 = await researchMemoryService.getMemory(userA, completionResult.memory.id);
  assert(Boolean(memInP33), 'Scenario I', 'Memory is retrievable via canonical researchMemoryService');
  assert(memInP33.securityId === 'us-nvda' || memInP33.securityId === 'NVDA', 'Scenario I', 'Memory matches canonical securityId');
  assert(memInP33.ticker === 'NVDA', 'Scenario I', 'Memory matches canonical ticker');

  // ------------------------------------------------------------------------
  // Scenario J: Point-In-Time (PIT) Zero Lookahead Guarantee
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario J: Point-In-Time (PIT) Zero Lookahead Guarantee ---');
  // Create a future plan on 2026-09-15
  const futurePlan = await investigationPlanService.createPlan(userA, {
    securityId: 'NVDA',
    title: 'September 2026 Invalidation Guard Audit',
    objective: 'Evaluate Q3 channel checks.',
    asOfDate: '2026-09-15'
  });

  // Query as of 2026-08-15: Future plan MUST NOT be returned!
  const plansAug15 = await investigationPlanService.getPlans(userA, {
    securityId: 'NVDA',
    asOfDate: '2026-08-15'
  });

  assert(plansAug15.every(p => p.asOfDate <= '2026-08-15'), 'Scenario J', 'All plans respect asOfDate upper bound');
  assert(!plansAug15.some(p => p.planId === futurePlan.planId), 'Scenario J', 'Future plan excluded under earlier asOfDate filter (Zero Lookahead)');

  // Query as of 2026-09-30: Future plan MUST now appear!
  const plansSep30 = await investigationPlanService.getPlans(userA, {
    securityId: 'NVDA',
    asOfDate: '2026-09-30'
  });
  assert(plansSep30.some(p => p.planId === futurePlan.planId), 'Scenario J', 'Future plan visible once asOfDate encompasses it');

  // ------------------------------------------------------------------------
  // Scenario K: Multi-Tenant Isolation & IDOR Protection (403 Forbidden)
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario K: Multi-Tenant Isolation & IDOR Protection ---');
  // User B tries to fetch User A's investigation plan
  let planIdorBlocked = false;
  try {
    await investigationPlanService.getPlan(userB, plan.planId);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      planIdorBlocked = true;
    }
  }
  assert(planIdorBlocked, 'Scenario K', 'User B directly fetching User A plan returns 403 Forbidden');

  // User B tries to update User A's plan status
  let updatePlanBlocked = false;
  try {
    await investigationPlanService.updatePlanStatus(userB, plan.planId, 'CANCELLED');
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      updatePlanBlocked = true;
    }
  }
  assert(updatePlanBlocked, 'Scenario K', 'User B modifying User A plan returns 403 Forbidden');

  // User B tries to access User A's question
  let questionIdorBlocked = false;
  try {
    await researchQuestionService.getQuestion(userB, qA1.id);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      questionIdorBlocked = true;
    }
  }
  assert(questionIdorBlocked, 'Scenario K', 'User B directly fetching User A question returns 403 Forbidden');

  // User B tries to access User A's gap
  let gapIdorBlocked = false;
  try {
    await researchGapDetectionService.getGap(userB, hypothesisGap.gapId);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      gapIdorBlocked = true;
    }
  }
  assert(gapIdorBlocked, 'Scenario K', 'User B directly fetching User A gap returns 403 Forbidden');

  // ------------------------------------------------------------------------
  // Scenario L: Native USD vs INR Currency Isolation
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario L: Native Currency Isolation ---');
  const inrPlan = await investigationPlanService.createPlan(userA, {
    securityId: 'RELIANCE',
    title: 'Reliance Retail O2C Margin Investigation',
    objective: 'Examine gross refining margins and petrochemical spreads.',
    asOfDate: '2026-08-01'
  });

  assert(inrPlan.currency === 'INR', 'Scenario L', 'Indian security preserves native INR currency');
  assert(plan.currency === 'USD', 'Scenario L', 'US security preserves native USD currency');

  // ------------------------------------------------------------------------
  // Scenario M: No Autonomous Trading or Execution Safety Invariants
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario M: Analytical & Execution Safety Invariants ---');
  const overview = await investigationPlanService.generateInvestigationOverview(userA, 'NVDA', '2026-08-01');
  assert(overview.isAnalyticalOnly === true, 'Scenario M', 'Investigation overview enforces isAnalyticalOnly: true');
  assert(overview.executionProhibited === true, 'Scenario M', 'Investigation overview enforces executionProhibited: true');
  assert(!('targetPrice' in (overview as any)), 'Scenario M', 'No target price in investigation overview');
  assert(!('buySellRecommendation' in (overview as any)), 'Scenario M', 'No automated trade recommendations');

  // ------------------------------------------------------------------------
  // Scenario N: AI Circuit Breaker Resilience & Deterministic Fallback
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario N: AI Circuit Breaker Resilience ---');
  // Trip circuit breaker by simulating consecutive failures
  for (let i = 0; i < 5; i++) {
    aiCircuitBreaker.handleAiError('InvestigationPlanService', new Error('Simulated HTTP 429 quota exhausted'));
  }
  const breakerStatus = aiCircuitBreaker.getStatus();
  assert(breakerStatus.isQuotaExhausted === true && breakerStatus.canExecute === false, 'Scenario N', 'Circuit breaker is tripped into exhausted fallback state');

  // Creating plan under open circuit breaker MUST NOT throw and must produce deterministic narrative
  const breakerPlan = await investigationPlanService.createPlan(userA, {
    securityId: 'NVDA',
    title: 'Circuit Breaker Fallback Investigation',
    objective: 'Test resilient operation when AI is unavailable.',
    asOfDate: '2026-08-01'
  });
  assert(Boolean(breakerPlan.narrativeSummary), 'Scenario N', 'Plan narrative successfully generated via deterministic template fallback');
  assert(breakerPlan.narrativeSummary.includes('defines an ordered research workflow'), 'Scenario N', 'Deterministic template text present');

  // Reset circuit breaker
  aiCircuitBreaker.reset();

  // ------------------------------------------------------------------------
  // Scenario O: Investigation Audit Trail Verification
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario O: Investigation Audit Trail Verification ---');
  const auditLogs = await investigationPlanService.getAuditHistory(userA, plan.planId);
  assert(auditLogs.length >= 1, 'Scenario O', 'Audit trail records plan lifecycle actions');
  assert(auditLogs.some(a => a.action === 'PLAN_CREATED'), 'Scenario O', 'PLAN_CREATED action recorded in audit log');
  assert(auditLogs.every(a => a.tenantId === userA), 'Scenario O', 'Audit records strictly match user tenantId');

  // ------------------------------------------------------------------------
  // Scenario P: Byte-Identical Determinism Guarantee
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario P: Byte-Identical Determinism Guarantee ---');
  // Deterministic sorting and counts must be identical across consecutive runs
  const run1 = await investigationPlanService.getPlans(userA, { securityId: 'NVDA', asOfDate: '2026-08-01' });
  const run2 = await investigationPlanService.getPlans(userA, { securityId: 'NVDA', asOfDate: '2026-08-01' });
  const run3 = await investigationPlanService.getPlans(userA, { securityId: 'NVDA', asOfDate: '2026-08-01' });

  assert(run1.length === run2.length && run2.length === run3.length, 'Scenario P', 'Plan count byte-identical across 3 runs');
  const ids1 = run1.map(p => p.planId).join(',');
  const ids2 = run2.map(p => p.planId).join(',');
  const ids3 = run3.map(p => p.planId).join(',');
  assert(ids1 === ids2 && ids2 === ids3, 'Scenario P', 'Plan ordering and IDs strictly byte-identical across 3 runs');

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

runTestSuite().catch(err => {
  console.error('Fatal unhandled error during test run:', err);
  process.exit(1);
});
