/**
 * Phase 35: Institutional Evidence Collection & Research Execution Ledger
 * Comprehensive Acceptance Test Suite
 * 
 * Verifies all institutional evidence collection and execution ledger invariants:
 * - Scenario A: Deterministic Evidence Collection Record & Cryptographic Fingerprinting
 * - Scenario B: Deterministic Collection Status Lifecycle & Invalid Transition Rejection
 * - Scenario C: Source Provenance Classes & Epistemic Safety Invariants
 * - Scenario D: Evidence-to-Research Mapping (Questions, Gaps, Tasks)
 * - Scenario E: Deterministic Evidence Reconciliation (No Forced Single-Truth Resolution)
 * - Scenario F: Evidence Quality Grading Hierarchy
 * - Scenario G: Point-In-Time (PIT) Zero Lookahead Guarantee
 * - Scenario H: Historical Immutability & Explicit Supersession Lineage
 * - Scenario I: Content Fingerprinting & Deterministic Deduplication
 * - Scenario J: Research Task Completion Gated Strictly by Validated Evidence
 * - Scenario K: Research Question State Integration & Feedback
 * - Scenario L: Phase 33 Institutional Research Memory Integration
 * - Scenario M: Evidence Conflict Workflow (Question Conflicting, Gap Open, Task Followup)
 * - Scenario N: Multi-Tenant Isolation & IDOR Protection (403 Forbidden)
 * - Scenario O: Native USD vs INR Currency Isolation
 * - Scenario P: AI Circuit Breaker Resilience & Deterministic Fallback
 * - Scenario Q: Collection Audit Trail Verification
 * - Scenario R: Non-Autonomous Execution Safety Invariants
 */

import { evidenceCollectionService } from '../server/services/evidence/evidenceCollectionService';
import { researchQuestionService } from '../server/services/investigation/researchQuestionService';
import { researchGapDetectionService } from '../server/services/investigation/researchGapDetectionService';
import { investigationPlanService } from '../server/services/investigation/investigationPlanService';
import { researchMemoryService } from '../server/services/memory/researchMemoryService';
import { aiCircuitBreaker } from '../server/services/ai/aiCircuitBreaker';
import { AuthorizationError } from '../server/auth/authorizationService';
import {
  EvidenceCollectionRecord,
  EvidenceResearchRelationship,
  EvidenceReconciliationResult,
  EvidenceOverview,
  CollectionStatus,
  EvidenceSourceClass,
  EvidenceQualityGrade
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

async function runPhase35TestSuite(): Promise<void> {
  console.log('========================================================================');
  console.log('🚀 RUNNING PHASE 35 EVIDENCE COLLECTION & EXECUTION LEDGER ACCEPTANCE SUITE');
  console.log('========================================================================\n');

  const runTag = Date.now().toString(36);
  const userA = `analyst-alpha-${runTag}`;
  const userB = `analyst-beta-${runTag}`;

  // ------------------------------------------------------------------------
  // Scenario A: Deterministic Evidence Collection Record & Cryptographic Fingerprinting
  // ------------------------------------------------------------------------
  console.log('--- Scenario A: Deterministic Evidence Collection Record ---');
  const recordA = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'SEC_FILING',
    sourceTitle: 'Form 10-Q Q2 2026 Comprehensive Segment Revenue and Footnotes',
    sourcePublisher: 'U.S. Securities and Exchange Commission',
    sourceReference: 'SEC File No. 000-23985',
    sourceUrl: 'https://www.sec.gov/edgar/data/1045810/000104581026000045/nvda-20260726.htm',
    publishedAt: '2026-08-15',
    availableAt: '2026-08-15',
    asOfDate: '2026-08-15',
    rawContent: 'Data Center revenue was $26.3 billion, up 154% year over year. Gross margin was 75.1% under GAAP.',
    findingsSummary: 'Primary SEC filing confirms Data Center acceleration and sustained 75%+ GAAP gross margins.',
    supportsQuestion: true,
    contradictsQuestion: false,
    collectionStatus: 'COLLECTED'
  });

  assert(Boolean(recordA.collectionId), 'Scenario A', 'Collection record created with deterministic ID');
  assert(recordA.tenantId === userA, 'Scenario A', 'Tenant ID matches creating analyst');
  assert(recordA.securityId === 'us-nvda', 'Scenario A', 'Canonical security ID resolved to us-nvda');
  assert(recordA.currency === 'USD', 'Scenario A', 'Currency correctly isolated to USD');
  assert(Boolean(recordA.contentHash), 'Scenario A', 'Cryptographic contentHash generated');
  assert(Boolean(recordA.sourceFingerprint), 'Scenario A', 'Deterministic sourceFingerprint generated');
  assert(recordA.qualityGrade === 'PRIMARY_VERIFIED', 'Scenario A', 'SEC_FILING classified as PRIMARY_VERIFIED');
  assert(recordA.isAnalyticalOnly === true, 'Scenario A', 'Enforces isAnalyticalOnly: true');
  assert(recordA.executionProhibited === true, 'Scenario A', 'Enforces executionProhibited: true');

  // ------------------------------------------------------------------------
  // Scenario B: Deterministic Collection Status Lifecycle & Invalid Transition Rejection
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario B: Deterministic Collection Status Lifecycle ---');
  // COLLECTED -> VALIDATED
  const validatedA = await evidenceCollectionService.validateEvidence(userA, recordA.collectionId, {
    validationNotes: 'Confirmed against EDGAR primary filing.',
    asOfDate: '2026-08-16'
  });
  assert(validatedA.collectionStatus === 'VALIDATED', 'Scenario B', 'Successfully transitioned COLLECTED -> VALIDATED');

  // Create another record to test REJECTED
  const rejectableRecord = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'OTHER',
    sourceTitle: 'Anonymous Forum Post Regarding Supply Bottlenecks',
    sourcePublisher: 'Online Forum',
    sourceReference: 'Post #99482',
    publishedAt: '2026-08-10',
    asOfDate: '2026-08-10',
    rawContent: 'Unverified hearsay about packaging yields.',
    collectionStatus: 'COLLECTED'
  });

  const rejectedRecord = await evidenceCollectionService.rejectEvidence(userA, rejectableRecord.collectionId, {
    rejectionReason: 'Unverified source lacking institutional provenance.',
    asOfDate: '2026-08-11'
  });
  assert(rejectedRecord.collectionStatus === 'REJECTED', 'Scenario B', 'Successfully transitioned COLLECTED -> REJECTED');

  // Attempt invalid transition: REJECTED directly to VALIDATED must fail
  let invalidTransitionThrew = false;
  try {
    await evidenceCollectionService.validateEvidence(userA, rejectedRecord.collectionId);
  } catch (err: any) {
    invalidTransitionThrew = true;
    assert(err.message.includes('Invalid evidence lifecycle transition'), 'Scenario B', 'Invalid transition error message clear');
  }
  assert(invalidTransitionThrew, 'Scenario B', 'Strict state machine rejects invalid REJECTED -> VALIDATED transition');

  // ------------------------------------------------------------------------
  // Scenario C: Source Provenance Classes & Epistemic Safety Invariants
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario C: Source Provenance Classes & Epistemic Safety ---');
  const unavailableRecord = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'COMPANY_DISCLOSURE',
    sourceTitle: 'Proprietary Unannounced Architecture Whitepaper',
    sourcePublisher: 'Internal Source',
    sourceReference: 'Undisclosed Ref',
    publishedAt: '2026-08-01',
    epistemicStatus: 'UNAVAILABLE',
    collectionStatus: 'UNAVAILABLE'
  });
  assert(unavailableRecord.epistemicStatus === 'UNAVAILABLE', 'Scenario C', 'Unavailable source marked epistemicStatus = UNAVAILABLE');
  assert(unavailableRecord.collectionStatus === 'UNAVAILABLE', 'Scenario C', 'Unavailable source marked collectionStatus = UNAVAILABLE');

  const scenarioAssumptionRecord = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'INTERNAL_RESEARCH',
    sourceTitle: 'Stress Test Scenario Yield Model 2027',
    sourcePublisher: 'Internal Strategy Desk',
    sourceReference: 'Scenario #S-4',
    publishedAt: '2026-08-05',
    epistemicStatus: 'SCENARIO_ASSUMPTION',
    collectionStatus: 'COLLECTED'
  });
  assert(scenarioAssumptionRecord.epistemicStatus === 'SCENARIO_ASSUMPTION', 'Scenario C', 'Scenario assumption preserved as SCENARIO_ASSUMPTION');
  assert(scenarioAssumptionRecord.epistemicStatus !== 'REAL', 'Scenario C', 'Scenario assumption NEVER silently converts to REAL');

  // ------------------------------------------------------------------------
  // Scenario D: Evidence-to-Research Mapping (Questions, Gaps, Tasks)
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario D: Evidence-to-Research Mapping ---');
  // Create a research question via Phase 34
  const qD = await researchQuestionService.createQuestion(userA, {
    securityId: 'NVDA',
    category: 'THESIS',
    question: 'Are gross margins sustainable above 74% across next 4 quarters?',
    context: 'Core valuation multiplier depends on operating margin defense.',
    requiredEvidenceCount: 2,
    asOfDate: '2026-08-01'
  });

  // Attach evidence to question
  const relQ = await evidenceCollectionService.attachEvidenceToQuestion(
    userA,
    recordA.collectionId,
    qD.id,
    'SUPPORTS',
    'Q2 10-Q filing provides audited gross margin confirmation at 75.1%.',
    '2026-08-16'
  );
  assert(relQ.targetId === qD.id, 'Scenario D', 'Relationship attached to question');
  assert(relQ.relationshipType === 'SUPPORTS', 'Scenario D', 'Relationship marked SUPPORTS');

  // Create research gap and attach
  const gapD = await researchGapDetectionService.createGap(userA, {
    securityId: 'NVDA',
    gapType: 'UNVERIFIED_SCENARIO_ASSUMPTION',
    title: 'Wafer allocation pricing elasticity',
    description: 'Requires primary foundry contract pricing verification.',
    whyItMatters: 'Wafer allocation pricing impacts gross margin defense directly.',
    requiredEvidence: ['PRIMARY_CONTRACT_DISCLOSURE'],
    asOfDate: '2026-08-01'
  });
  const relGap = await evidenceCollectionService.attachEvidenceToGap(
    userA,
    recordA.collectionId,
    gapD.gapId,
    'SUPPORTS',
    'Filing details commitments with key suppliers.',
    '2026-08-16'
  );
  assert(relGap.targetId === gapD.gapId, 'Scenario D', 'Relationship attached to gap');

  // ------------------------------------------------------------------------
  // Scenario E: Deterministic Evidence Reconciliation (No Forced Single-Truth)
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario E: Deterministic Evidence Reconciliation ---');
  // Create a contradictory piece of evidence for question qD
  const recordContradict = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'FINANCIAL_STATEMENT',
    sourceTitle: 'Foundry Subcontractor Tariff Surcharge Notice',
    sourcePublisher: 'Supply Chain Disclosure',
    sourceReference: 'Supplier Notice 2026-B',
    publishedAt: '2026-08-18',
    asOfDate: '2026-08-18',
    rawContent: 'Effective Q3, advanced packaging assembly fees increase by 18%, compressing client margins.',
    findingsSummary: 'Direct packaging cost escalation threatens forward gross margins below 73%.',
    questionId: qD.id,
    supportsQuestion: false,
    contradictsQuestion: true,
    collectionStatus: 'COLLECTED'
  });

  // Reconcile evidence for qD
  const reconciliation = await evidenceCollectionService.reconcileEvidenceForQuestion(userA, qD.id, '2026-08-19');
  assert(reconciliation.state === 'CONFLICTING', 'Scenario E', 'Contradictory evidence deterministically produces CONFLICTING state');
  assert(reconciliation.resolutionRequired === true, 'Scenario E', 'resolutionRequired is flagged true on conflict');
  assert(reconciliation.supportingEvidenceIds.length >= 1, 'Scenario E', 'Supporting evidence IDs identified');
  assert(reconciliation.contradictingEvidenceIds.length >= 1, 'Scenario E', 'Contradicting evidence IDs identified');
  assert(Boolean(reconciliation.conflictDescription), 'Scenario E', 'Analytical conflict description populated');
  assert(Boolean(reconciliation.synthesisNarrative), 'Scenario E', 'Reconciliation synthesis narrative provided without automatic truth selection');

  // Verify research question qD status was deterministically set to CONFLICTING
  const updatedQD = await researchQuestionService.getQuestion(userA, qD.id);
  assert(updatedQD.status === 'CONFLICTING', 'Scenario E', 'Research question transitioned to CONFLICTING without arbitrary resolution');

  // ------------------------------------------------------------------------
  // Scenario F: Evidence Quality Grading Hierarchy
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario F: Evidence Quality Grading Hierarchy ---');
  assert(evidenceCollectionService.deriveQualityGrade('SEC_FILING') === 'PRIMARY_VERIFIED', 'Scenario F', 'SEC_FILING is PRIMARY_VERIFIED');
  assert(evidenceCollectionService.deriveQualityGrade('FINANCIAL_STATEMENT') === 'PRIMARY_VERIFIED', 'Scenario F', 'FINANCIAL_STATEMENT is PRIMARY_VERIFIED');
  assert(evidenceCollectionService.deriveQualityGrade('EARNINGS_REPORT') === 'SECONDARY_CORROBORATED', 'Scenario F', 'EARNINGS_REPORT is SECONDARY_CORROBORATED');
  assert(evidenceCollectionService.deriveQualityGrade('INTERNAL_RESEARCH') === 'INTERNAL_ANALYSIS', 'Scenario F', 'INTERNAL_RESEARCH is INTERNAL_ANALYSIS');
  assert(evidenceCollectionService.deriveQualityGrade('OTHER') === 'UNVERIFIED', 'Scenario F', 'OTHER is UNVERIFIED');

  // ------------------------------------------------------------------------
  // Scenario G: Point-In-Time (PIT) Zero Lookahead Guarantee
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario G: Point-In-Time Zero Lookahead Guarantee ---');
  // Evidence published on 2026-09-20
  await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'SEC_FILING',
    sourceTitle: 'Late Autumn 8-K Regulatory Filing',
    sourcePublisher: 'SEC EDGAR',
    sourceReference: 'SEC File No. 000-99881',
    publishedAt: '2026-09-20',
    availableAt: '2026-09-20',
    asOfDate: '2026-09-20',
    rawContent: 'Material event disclosure on autumn wafer deliveries.',
    collectionStatus: 'COLLECTED'
  });

  // Query as of 2026-09-01 (before 2026-09-20)
  const pitCutoffEvidence = await evidenceCollectionService.getEvidenceList(userA, {
    securityId: 'NVDA',
    asOfDate: '2026-09-01'
  });
  const hasFutureEvidence = pitCutoffEvidence.some(e => e.publishedAt > '2026-09-01');
  assert(!hasFutureEvidence, 'Scenario G', 'Zero Lookahead: Evidence published after cutoff is strictly excluded');

  // Query as of 2026-09-25 (after 2026-09-20)
  const pitFutureEvidence = await evidenceCollectionService.getEvidenceList(userA, {
    securityId: 'NVDA',
    asOfDate: '2026-09-25'
  });
  const foundFutureEvidence = pitFutureEvidence.some(e => e.publishedAt === '2026-09-20');
  assert(foundFutureEvidence, 'Scenario G', 'Evidence appears once asOfDate reaches its publication timestamp');

  // ------------------------------------------------------------------------
  // Scenario H: Historical Immutability & Explicit Supersession Lineage
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario H: Historical Immutability & Supersession ---');
  const supersedeResult = await evidenceCollectionService.supersedeEvidence(userA, recordA.collectionId, {
    sourceTitle: 'Form 10-Q/A Q2 2026 Amended Segment Revenue and Restated Footnotes',
    findingsSummary: 'Amended filing refines gross margin to 75.3% post-audit reconciliation.',
    supersedingReason: 'Form 10-Q/A restatement filed with SEC.',
    asOfDate: '2026-08-25'
  });

  assert(supersedeResult.historical.collectionStatus === 'SUPERSEDED', 'Scenario H', 'Historical record marked SUPERSEDED');
  assert(supersedeResult.historical.supersededByCollectionId === supersedeResult.superseding.collectionId, 'Scenario H', 'Historical record points to superseding ID');
  assert(supersedeResult.superseding.supersedesCollectionId === recordA.collectionId, 'Scenario H', 'Superseding record points back to superseded ID');
  assert(supersedeResult.superseding.supersessionReason === 'Form 10-Q/A restatement filed with SEC.', 'Scenario H', 'Supersession reason preserved');

  // ------------------------------------------------------------------------
  // Scenario I: Content Fingerprinting & Deterministic Deduplication
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario I: Content Fingerprinting & Deduplication ---');
  const hash1 = evidenceCollectionService.generateContentHash('Deterministic test content for hashing.');
  const hash2 = evidenceCollectionService.generateContentHash('Deterministic test content for hashing.');
  const hash3 = evidenceCollectionService.generateContentHash('Different content entirely.');
  assert(hash1 === hash2, 'Scenario I', 'Identical content produces identical SHA-256 hash');
  assert(hash1 !== hash3, 'Scenario I', 'Different content produces distinct hash');

  const fp1 = evidenceCollectionService.generateSourceFingerprint('SEC_FILING', 'SEC', 'Ref-101', '2026-08-01');
  const fp2 = evidenceCollectionService.generateSourceFingerprint('SEC_FILING', 'sec', 'ref-101', '2026-08-01');
  assert(fp1 === fp2, 'Scenario I', 'Source fingerprinting is case-insensitive and canonical');

  // Collecting duplicate evidence returns existing record without duplication
  const dedupOriginal = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'SEC_FILING',
    sourceTitle: 'Form 8-K Executive Appointment',
    sourcePublisher: 'SEC EDGAR Desk',
    sourceReference: 'SEC File No. 000-88899',
    publishedAt: '2026-08-02',
    asOfDate: '2026-08-02',
    rawContent: 'Announcement of VP Finance appointment.'
  });

  const dedupDuplicate = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'SEC_FILING',
    sourceTitle: 'Form 8-K Executive Appointment (Duplicate Ingestion)',
    sourcePublisher: 'SEC EDGAR Desk',
    sourceReference: 'SEC File No. 000-88899',
    publishedAt: '2026-08-02',
    asOfDate: '2026-08-02',
    rawContent: 'Announcement of VP Finance appointment.'
  });

  assert(dedupOriginal.collectionId === dedupDuplicate.collectionId, 'Scenario I', 'Deduplication preserves single canonical evidence record');

  // ------------------------------------------------------------------------
  // Scenario J: Research Task Completion Gated Strictly by Validated Evidence
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario J: Research Task Completion Gated by Validated Evidence ---');
  // Create investigation plan and task via Phase 34
  const planJ = await investigationPlanService.createPlan(userA, {
    securityId: 'NVDA',
    title: 'Verification of High-Performance Networking ASPs',
    objective: 'Confirm average selling prices across Quantum-2 InfiniBand switches.',
    tasks: [
      {
        questionId: qD.id,
        title: 'Audit InfiniBand ASP Footnotes in SEC 10-K',
        description: 'Examine detailed hardware ASP tables in footnotes.',
        evidenceRequired: ['PRIMARY_FILING'],
        acceptanceCriteria: 'Footnote pricing details must corroborate base model'
      }
    ],
    asOfDate: '2026-08-01'
  });

  const targetTask = planJ.tasks[0];

  // Evaluate task completion before collecting evidence -> Must be incomplete
  const evalBefore = await evidenceCollectionService.evaluateTaskCompletionWithEvidence(
    userA,
    planJ.planId,
    targetTask.taskId,
    '2026-08-01'
  );
  assert(evalBefore.isCompleted === false, 'Scenario J', 'Task without validated evidence CANNOT complete');

  // Collect and validate evidence linked to task
  const taskEvidence = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'SEC_FILING',
    sourceTitle: 'SEC 10-K Footnote 14: Networking Hardware ASP Realization',
    sourcePublisher: 'SEC EDGAR',
    sourceReference: 'SEC File No. 10-K-Footnote-14',
    publishedAt: '2026-08-01',
    asOfDate: '2026-08-01',
    planId: planJ.planId,
    taskId: targetTask.taskId,
    collectionStatus: 'COLLECTED'
  });
  await evidenceCollectionService.validateEvidence(userA, taskEvidence.collectionId);

  // Evaluate task completion after validated evidence
  const evalAfter = await evidenceCollectionService.evaluateTaskCompletionWithEvidence(
    userA,
    planJ.planId,
    targetTask.taskId,
    '2026-08-01'
  );
  assert(evalAfter.isCompleted === true, 'Scenario J', 'Task transitions to COMPLETED when validated evidence criteria met');
  assert(evalAfter.validatedEvidenceCount >= 1, 'Scenario J', 'Validated evidence count tracked');

  // ------------------------------------------------------------------------
  // Scenario K: Research Question State Integration & Convergence
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario K: Research Question Convergence ---');
  const qK = await researchQuestionService.createQuestion(userA, {
    securityId: 'NVDA',
    category: 'DECISION_DRIFT',
    question: 'Is R&D expenditure growing faster than revenue over the past 3 fiscal years?',
    context: 'Operating efficiency test.',
    requiredEvidenceCount: 2,
    asOfDate: '2026-08-01'
  });

  // Attach 2 supporting validated evidence items
  const evK1 = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'FINANCIAL_STATEMENT',
    sourceTitle: 'Consolidated Statement of Operations FY2024-2026',
    sourcePublisher: 'SEC EDGAR',
    sourceReference: 'Financial Statement Line 44',
    publishedAt: '2026-08-01',
    asOfDate: '2026-08-01',
    questionId: qK.id,
    supportsQuestion: true,
    collectionStatus: 'COLLECTED'
  });
  await evidenceCollectionService.validateEvidence(userA, evK1.collectionId);

  const evK2 = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'NVDA',
    sourceType: 'PRIMARY_DOCUMENT',
    sourceTitle: 'Audit Committee R&D Expenditure Audit Memorandum',
    sourcePublisher: 'External Independent Auditor',
    sourceReference: 'Audit Memo #2026-RND',
    publishedAt: '2026-08-02',
    asOfDate: '2026-08-02',
    questionId: qK.id,
    supportsQuestion: true,
    collectionStatus: 'COLLECTED'
  });
  await evidenceCollectionService.validateEvidence(userA, evK2.collectionId);

  // Reconcile evidence -> Convergence expected
  const reconK = await evidenceCollectionService.reconcileEvidenceForQuestion(userA, qK.id, '2026-08-03');
  assert(reconK.state === 'CONVERGENT', 'Scenario K', 'Sufficient supporting evidence deterministically produces CONVERGENT state');

  const updatedQK = await researchQuestionService.getQuestion(userA, qK.id);
  assert(updatedQK.status === 'ANSWERED', 'Scenario K', 'Question successfully answered via evidence convergence');

  // ------------------------------------------------------------------------
  // Scenario L: Phase 33 Institutional Research Memory Integration
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario L: Phase 33 Research Memory Integration ---');
  const commitMemoryResult = await evidenceCollectionService.commitEvidenceFindingToMemory(userA, planJ.planId, {
    title: 'InfiniBand Quantum-2 Hardware ASPs Stabilize with 12% YoY Gains',
    summary: 'Audited segment footnotes confirm resilient network hardware pricing.',
    findingText: 'Detailed verification of Footnote 14 confirms $42k blended average selling price across enterprise clusters.',
    verifiedCollectionIds: [taskEvidence.collectionId],
    asOfDate: '2026-08-01'
  });

  assert(Boolean(commitMemoryResult.memory.id), 'Scenario L', 'Committed finding to Phase 33 Research Memory');
  assert(commitMemoryResult.memory.title === 'InfiniBand Quantum-2 Hardware ASPs Stabilize with 12% YoY Gains', 'Scenario L', 'Memory title preserved');
  assert(commitMemoryResult.memory.relatedEvidenceIds.includes(taskEvidence.collectionId), 'Scenario L', 'Memory links directly to verified collection record ID');

  const fetchedFromP33 = await researchMemoryService.getMemory(userA, commitMemoryResult.memory.id);
  assert(Boolean(fetchedFromP33), 'Scenario L', 'Committed memory retrievable via canonical Phase 33 ResearchMemoryService');

  // ------------------------------------------------------------------------
  // Scenario M: Evidence Conflict Workflow
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario M: Evidence Conflict Workflow ---');
  assert(reconciliation.conflictDescription !== undefined, 'Scenario M', 'Conflict workflow specifies what conflicts');
  assert(reconciliation.contradictingEvidenceIds.length > 0, 'Scenario M', 'Conflict workflow identifies which sources conflict');
  assert(reconciliation.recommendedFollowup !== undefined, 'Scenario M', 'Conflict workflow recommends follow-up investigation action');

  // ------------------------------------------------------------------------
  // Scenario N: Multi-Tenant Isolation & IDOR Protection (403 Forbidden)
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario N: Multi-Tenant Isolation & IDOR Protection ---');
  let unauthorizedGetBlocked = false;
  try {
    await evidenceCollectionService.getEvidence(userB, recordA.collectionId);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      unauthorizedGetBlocked = true;
    }
  }
  assert(unauthorizedGetBlocked, 'Scenario N', 'User B directly fetching User A evidence throws 403 Forbidden');

  let unauthorizedValidateBlocked = false;
  try {
    await evidenceCollectionService.validateEvidence(userB, recordA.collectionId);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      unauthorizedValidateBlocked = true;
    }
  }
  assert(unauthorizedValidateBlocked, 'Scenario N', 'User B modifying User A evidence throws 403 Forbidden');

  let unauthorizedSupersedeBlocked = false;
  try {
    await evidenceCollectionService.supersedeEvidence(userB, recordA.collectionId, {
      sourceTitle: 'Illegitimate supersede attempt',
      supersedingReason: 'IDOR penetration test'
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      unauthorizedSupersedeBlocked = true;
    }
  }
  assert(unauthorizedSupersedeBlocked, 'Scenario N', 'User B superseding User A evidence throws 403 Forbidden');

  // Tenant list isolation
  const userBEvidence = await evidenceCollectionService.getEvidenceList(userB);
  const leakedUserAItems = userBEvidence.filter(e => e.tenantId === userA);
  assert(leakedUserAItems.length === 0, 'Scenario N', 'User B list query returns zero records belonging to User A');

  // ------------------------------------------------------------------------
  // Scenario O: Native USD vs INR Currency Isolation
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario O: Native Currency Isolation ---');
  const inrRecord = await evidenceCollectionService.collectEvidence(userA, {
    securityId: 'RELIANCE',
    sourceType: 'FINANCIAL_STATEMENT',
    sourceTitle: 'Quarterly Standalone Financial Results Q1 FY2026',
    sourcePublisher: 'BSE / NSE Corporate Announcement',
    sourceReference: 'BSE Filing 500325',
    publishedAt: '2026-07-20',
    asOfDate: '2026-07-20',
    rawContent: 'Consolidated revenue from operations was ₹2,57,823 crore.'
  });
  assert(inrRecord.currency === 'INR', 'Scenario O', 'Indian security preserves native INR currency');
  assert(recordA.currency === 'USD', 'Scenario O', 'US security preserves native USD currency');

  // ------------------------------------------------------------------------
  // Scenario P: AI Circuit Breaker Resilience & Deterministic Fallback
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario P: AI Circuit Breaker Resilience ---');
  for (let i = 0; i < 5; i++) {
    aiCircuitBreaker.handleAiError('EvidenceCollectionService', new Error('Simulated HTTP 429 quota exhausted'));
  }
  const breakerStatus = aiCircuitBreaker.getStatus();
  assert(breakerStatus.canExecute === false, 'Scenario P', 'Circuit breaker tripped into open state');

  const breakerReconciliation = await evidenceCollectionService.reconcileEvidenceForQuestion(userA, qD.id, '2026-08-19');
  assert(Boolean(breakerReconciliation.synthesisNarrative), 'Scenario P', 'Synthesis narrative generated via deterministic template fallback');
  assert(breakerReconciliation.synthesisNarrative!.includes('Evidence reconciliation for inquiry'), 'Scenario P', 'Deterministic template text present');

  aiCircuitBreaker.reset();

  // ------------------------------------------------------------------------
  // Scenario Q: Collection Audit Trail Verification
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario Q: Collection Audit Trail Verification ---');
  const auditLogs = await evidenceCollectionService.getEvidenceAuditTrail(userA, recordA.collectionId);
  assert(auditLogs.length >= 1, 'Scenario Q', 'Audit trail records collection lifecycle events');
  assert(auditLogs.some(a => a.action === 'COLLECT' || a.action === 'DISCOVER'), 'Scenario Q', 'Initial collection audit recorded');
  assert(auditLogs.some(a => a.action === 'VALIDATE'), 'Scenario Q', 'Validation action recorded in audit log');
  assert(auditLogs.every(a => a.tenantId === userA), 'Scenario Q', 'Audit entries strictly isolated to tenantId');

  // ------------------------------------------------------------------------
  // Scenario R: Non-Autonomous Execution Safety Invariants
  // ------------------------------------------------------------------------
  console.log('\n--- Scenario R: Non-Autonomous Execution Safety Invariants ---');
  const overview = await evidenceCollectionService.generateEvidenceOverview(userA, 'NVDA', '2026-08-20');
  assert(overview.isAnalyticalOnly === true, 'Scenario R', 'Evidence overview enforces isAnalyticalOnly: true');
  assert(overview.executionProhibited === true, 'Scenario R', 'Evidence overview enforces executionProhibited: true');
  assert(!('targetPrice' in (overview as any)), 'Scenario R', 'Zero target prices in evidence ledger');
  assert(!('buySellRecommendation' in (overview as any)), 'Scenario R', 'Zero buy/sell trade recommendations');

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

runPhase35TestSuite().catch(err => {
  console.error('Fatal unhandled error during Phase 35 test run:', err);
  process.exit(1);
});
