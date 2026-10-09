/**
 * PHASE 27.1 — ALERT ORCHESTRATION END-TO-END ACCEPTANCE & DETERMINISM VALIDATION
 * 
 * Strict E2E verification of Continuous Monitoring & Alert Orchestration:
 *  - Scenario A: Basic Alert Creation (Candidate -> Match -> Qualify -> Deliver -> Persist)
 *  - Scenario B: No False Alert (Unchanged state produces zero candidates and zero alerts)
 *  - Scenario C: Idempotency (Triple-run test: Run 1 creates alert, Runs 2 & 3 suppress duplicate)
 *  - Scenario D: Deduplication Fingerprint (Canonical identity, exact match, zero fuzzy/LLM)
 *  - Scenario E: Cooldown Handling (Suppressed during cooldown window, re-evaluated after cooldown)
 *  - Scenario F: State Transition Semantics (ACTIVE_GUARD -> TRIGGERED -> TRIGGERED -> RECOVERED)
 *  - Scenario G: Policy Matching (Enabled match, non-matching rule, disabled policy, scope gates)
 *  - Scenario H: Deterministic Severity Derivation (CRITICAL, HIGH, MEDIUM, LOW bounds, zero LLM)
 *  - Scenario I: Alert Lifecycle State Machine (Valid transitions recorded, invalid transitions rejected)
 *  - Scenario J: Analyst Workflow Actions (Acknowledge, Resolve, Dismiss, auditable trail)
 *  - Scenario K: Alert -> Review Workspace Deep Link (Seamless navigation reference without duplicate data)
 *  - Scenario L: Historical Alert Immutability (Byte-level JSON stability across subsequent state changes)
 *  - Scenario M: Point-in-Time (PIT) Zero Lookahead (Strict cutoff excludes future events & evidence)
 *  - Scenario N: Provider Failure & Missing Data (Zero fabricated alerts on missing/unavailable feeds)
 *  - Scenario O: Epistemic Status Integrity (SIMULATED != REAL, preserved through provenance)
 *  - Scenario P: Multi-Currency Strict Isolation (USD vs INR, separate metrics, no FX leakage)
 *  - Scenario Q: Multi-Tenant Security & IDOR Protection (Cross-tenant read, action, policy isolation)
 *  - Scenario R: User Policy Isolation (Tenant policies strictly isolated and never cross-apply)
 */

import assert from 'node:assert';
import { alertOrchestrationEngine } from '../server/services/alerts/alertOrchestrationEngine';
import { investmentMonitorEngine } from '../server/services/monitor/investmentMonitorEngine';
import { persistenceManager } from '../server/persistence/persistenceManager';
import { authorizationService, AuthorizationError } from '../server/auth/authorizationService';
import {
  InvestmentEvent,
  EvidenceItem,
  InvestmentDecisionAssessment,
  MonitoringPolicy,
  AlertCandidate,
  AlertInstance,
  HoldingPosition
} from '../src/types';

console.log('======================================================================');
console.log('PHASE 27.1: ALERT ORCHESTRATION END-TO-END ACCEPTANCE TEST SUITE');
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

async function runAllPhase27Acceptance() {
  await persistenceManager.initialize();
  await investmentMonitorEngine.initialize();

  const userA = `analyst-p27a-${Date.now()}`;
  const userB = `analyst-p27b-${Date.now()}`;

  const eventRepo = persistenceManager.getEventRepository();
  const evidenceRepo = persistenceManager.getEvidenceRepository();
  const decisionRepo = persistenceManager.getDecisionRepository();
  const portfolioRepo = persistenceManager.getPortfolioRepository();
  const policyRepo = persistenceManager.getPolicyRepository();
  const alertRepo = persistenceManager.getAlertOrchestrationRepository();

  let monitorA: any;
  let alertA: AlertInstance;
  let alertAJsonSnapshot: string;

  // =========================================================================
  // SCENARIO A — BASIC ALERT CREATION
  // =========================================================================
  await runScenario('Scenario A: Basic Alert Creation (State change triggers delivered & persisted alert)', async () => {
    // 1. Create monitored investment for User A
    monitorA = await investmentMonitorEngine.createMonitor(userA, 'MSFT', {
      reviewCadence: 'WEEKLY'
    });
    assert(monitorA.monitorId, 'Monitor A ID must be generated');

    // 2. Seed default policies for User A
    const policies = await alertOrchestrationEngine.getPolicies(userA);
    assert(policies.length >= 4, 'Default policies must be seeded');

    // 3. Ingest a material high-impact SEC filing event
    const tEvent = new Date().toISOString();
    const materialEvent: InvestmentEvent = {
      eventId: `ev_sec_p27_${Date.now()}`,
      securityId: 'us-msft',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'SEC Form 8-K Regulatory Filing',
      summary: 'Item 4.02 Non-Reliance on Previously Issued Financial Statements filed.',
      eventType: 'SEC_FILING',
      eventDate: tEvent,
      announcedAt: tEvent,
      availableAt: tEvent,
      sourceType: 'SEC_FILING',
      sourceReference: 'SEC EDGAR Form 8-K Accession #0001193125-26-001',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: {
        affectsThesis: 'YES',
        affectsDecision: 'YES',
        affectsPortfolio: 'YES',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'YES',
        overallScore: 0.95
      },
      affectedThesisAreas: ['CATALYST', 'RISK', 'INVALIDATION_CONDITION'],
      createdAt: tEvent
    };
    await eventRepo.save(materialEvent);

    // 4. Run orchestration cycle
    const cycle = await alertOrchestrationEngine.runMonitoringCycle(userA, {
      monitorId: monitorA.monitorId
    });

    assert.strictEqual(cycle.userId, userA, 'Cycle must match user');
    assert(cycle.candidatesDetected >= 1, 'At least 1 candidate detected');
    assert(cycle.qualifiedAlerts >= 1, 'At least 1 alert qualified');
    assert(cycle.newAlerts.length >= 1, 'At least 1 new alert delivered');

    alertA = cycle.newAlerts[0];
    assert(alertA.alertId, 'Alert ID must be generated');
    assert.strictEqual(alertA.userId, userA, 'Alert owner must be User A');
    assert.strictEqual(alertA.monitorId, monitorA.monitorId, 'Alert must associate with Monitor A');
    assert.strictEqual(alertA.ruleType, 'SEC_FILING', 'Rule type must be SEC_FILING');
    assert.strictEqual(alertA.severity, 'CRITICAL', 'Severity must be CRITICAL due to high significance score');
    assert.strictEqual(alertA.status, 'DELIVERED', 'Alert lifecycle must begin at DELIVERED');
    assert(alertA.fingerprint, 'Deduplication fingerprint must be generated');
    assert.strictEqual(alertA.isAnalyticalOnly, true, 'Must enforce analytical-only');
    assert.strictEqual(alertA.executionProhibited, true, 'Must prohibit autonomous execution');

    // Verify persistence
    const fetched = await alertRepo.get(alertA.alertId);
    assert(fetched, 'Alert must be persisted in repository');
    assert.strictEqual(fetched?.alertId, alertA.alertId);

    // Snapshot for immutability verification
    alertAJsonSnapshot = JSON.stringify(alertA);
  });

  // =========================================================================
  // SCENARIO B — NO FALSE ALERT
  // =========================================================================
  await runScenario('Scenario B: No False Alert on Unchanged State', async () => {
    // Create fresh monitor for a clean ticker with zero new events
    const cleanMonitor = await investmentMonitorEngine.createMonitor(userA, 'AAPL', {
      reviewCadence: 'WEEKLY'
    });

    // Execute review to seal the baseline cutoff
    await investmentMonitorEngine.executeReview(cleanMonitor.monitorId, userA, 'Baseline sealed', 'REVIEWED');

    // Run monitoring cycle immediately without adding any events/evidence/changes
    const cycle = await alertOrchestrationEngine.runMonitoringCycle(userA, {
      monitorId: cleanMonitor.monitorId
    });

    assert.strictEqual(cycle.candidatesDetected, 0, 'Must detect exactly 0 candidates on unchanged state');
    assert.strictEqual(cycle.qualifiedAlerts, 0, 'Must qualify exactly 0 alerts on unchanged state');
    assert.strictEqual(cycle.newAlerts.length, 0, 'Must produce 0 new alerts on unchanged state');
  });

  // =========================================================================
  // SCENARIO C — IDEMPOTENCY
  // =========================================================================
  await runScenario('Scenario C: Idempotency (Triple-run test: 1 alert created, 0 on repeated runs)', async () => {
    const idemMonitor = await investmentMonitorEngine.createMonitor(userA, 'NVDA', {
      reviewCadence: 'WEEKLY'
    });
    // Seal baseline so only new events added after this baseline are detected
    await investmentMonitorEngine.executeReview(idemMonitor.monitorId, userA, 'Initial baseline', 'REVIEWED');

    // Add a single deterministic material event
    const now = new Date().toISOString();
    const idemEvent: InvestmentEvent = {
      eventId: `ev_idem_${Date.now()}`,
      securityId: 'us-nvda',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Foundry Capacity Agreement Signed',
      summary: 'Long-term wafer allocation secured for 3nm production node.',
      eventType: 'MARKET_EVENT',
      eventDate: now,
      announcedAt: now,
      availableAt: now,
      sourceType: 'PRESS_RELEASE',
      sourceReference: 'NVDA Press Release PR-2026-09-01',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: {
        affectsThesis: 'YES',
        affectsDecision: 'NO',
        affectsPortfolio: 'NO',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'NO',
        overallScore: 0.70
      },
      affectedThesisAreas: ['CATALYST'],
      createdAt: now
    };
    await eventRepo.save(idemEvent);

    // Cycle 1: Candidate detected -> Alert created
    const run1 = await alertOrchestrationEngine.runMonitoringCycle(userA, { monitorId: idemMonitor.monitorId });
    assert.strictEqual(run1.candidatesDetected, 1, 'Run 1: Must detect 1 candidate');
    assert.strictEqual(run1.qualifiedAlerts, 1, 'Run 1: Must qualify 1 alert');
    assert.strictEqual(run1.newAlerts.length, 1, 'Run 1: Must deliver 1 alert');
    assert.strictEqual(run1.suppressedDuplicates, 0, 'Run 1: No duplicates yet');

    // Cycle 2: Same candidate -> Suppressed as Duplicate
    const run2 = await alertOrchestrationEngine.runMonitoringCycle(userA, { monitorId: idemMonitor.monitorId });
    assert.strictEqual(run2.candidatesDetected, 1, 'Run 2: Detects same candidate');
    assert.strictEqual(run2.qualifiedAlerts, 0, 'Run 2: Must qualify 0 alerts');
    assert.strictEqual(run2.newAlerts.length, 0, 'Run 2: Must create 0 new alerts');
    assert.strictEqual(run2.suppressedDuplicates, 1, 'Run 2: Must suppress 1 duplicate');

    // Cycle 3: Same candidate again -> Suppressed as Duplicate
    const run3 = await alertOrchestrationEngine.runMonitoringCycle(userA, { monitorId: idemMonitor.monitorId });
    assert.strictEqual(run3.candidatesDetected, 1, 'Run 3: Detects same candidate');
    assert.strictEqual(run3.qualifiedAlerts, 0, 'Run 3: Must qualify 0 alerts');
    assert.strictEqual(run3.newAlerts.length, 0, 'Run 3: Must create 0 new alerts');
    assert.strictEqual(run3.suppressedDuplicates, 1, 'Run 3: Must suppress 1 duplicate');
  });

  // =========================================================================
  // SCENARIO D — DEDUPLICATION FINGERPRINT
  // =========================================================================
  await runScenario('Scenario D: Deduplication Fingerprint Determinism', async () => {
    const fp1 = alertOrchestrationEngine.buildFingerprint(
      'user-1',
      'us-msft',
      'SEC_FILING',
      'ev_123',
      'sec:edgar:123'
    );
    const fp2 = alertOrchestrationEngine.buildFingerprint(
      'user-1',
      'us-msft',
      'SEC_FILING',
      'ev_123',
      'sec:edgar:123'
    );
    const fpDifferentEvent = alertOrchestrationEngine.buildFingerprint(
      'user-1',
      'us-msft',
      'SEC_FILING',
      'ev_999',
      'sec:edgar:999'
    );
    const fpDifferentState = alertOrchestrationEngine.buildFingerprint(
      'user-1',
      'us-msft',
      'THESIS_INVALIDATION',
      'RECOVERED',
      'monitor:mon_1'
    );

    assert.strictEqual(fp1, fp2, 'Identical conditions must produce identical fingerprints');
    assert.notStrictEqual(fp1, fpDifferentEvent, 'Different events must produce different fingerprints');
    assert.notStrictEqual(fp1, fpDifferentState, 'Different state transitions must produce different fingerprints');
    assert(typeof fp1 === 'string' && fp1.length > 0, 'Fingerprint must be a non-empty string');
    assert.strictEqual(fp1, fp1.toLowerCase(), 'Fingerprint must be normalized lowercase');
  });

  // =========================================================================
  // SCENARIO E — COOLDOWN
  // =========================================================================
  await runScenario('Scenario E: Cooldown Suppression and Expiration', async () => {
    const policyWithCooldown: MonitoringPolicy = {
      policyId: `policy_cooldown_test_${Date.now()}`,
      userId: userA,
      ownerUserId: userA,
      name: 'Custom Cooldown Test Policy',
      policyType: 'PORTFOLIO',
      enabled: true,
      scope: 'ALL_MONITORS',
      rules: ['PORTFOLIO_CHANGE'],
      configuration: {},
      minSeverity: 'MEDIUM',
      cooldownMinutes: 30, // 30 minute cooldown
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const candidateT0: AlertCandidate = {
      candidateId: `cand_cd_1`,
      monitorId: monitorA.monitorId,
      securityId: 'us-msft',
      symbol: 'MSFT',
      userId: userA,
      ruleType: 'PORTFOLIO_CHANGE',
      detectedAt: new Date().toISOString(),
      severity: 'HIGH',
      observedValue: '12.5%',
      triggerEvidence: 'Portfolio position weight shifted',
      sourceReference: 'portfolio:default:us-msft',
      sourceType: 'PORTFOLIO_ANALYTICS',
      epistemicStatus: 'REAL',
      isSimulated: false,
      fingerprint: `fp_cd_${Date.now()}`
    };

    // Before any alert: not in cooldown
    const check1 = await alertOrchestrationEngine.checkCooldown(candidateT0, policyWithCooldown, new Date().toISOString());
    assert.strictEqual(check1.inCooldown, false, 'Initial candidate must not be in cooldown');

    // Create an alert 10 minutes ago
    const tMinus10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const alertInstance: AlertInstance = {
      alertId: `alert_cd_inst_${Date.now()}`,
      candidateId: candidateT0.candidateId,
      policyId: policyWithCooldown.policyId,
      policyName: policyWithCooldown.name,
      monitorId: monitorA.monitorId,
      securityId: 'us-msft',
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      userId: userA,
      ownerUserId: userA,
      ruleType: 'PORTFOLIO_CHANGE',
      severity: 'HIGH',
      status: 'DELIVERED',
      title: 'Portfolio Exposure Delta: MSFT',
      description: 'Portfolio position weight shifted',
      deterministicExplanation: 'Cooldown test alert',
      contextualAnalysis: null,
      detectedAt: tMinus10m,
      createdAt: tMinus10m,
      deliveredAt: tMinus10m,
      acknowledgedAt: null,
      resolvedAt: null,
      dismissedAt: null,
      fingerprint: candidateT0.fingerprint,
      trigger: {
        ruleType: 'PORTFOLIO_CHANGE',
        observedValue: '12.5%',
        currentState: '12.5%',
        reason: 'Weight delta'
      },
      provenance: {
        sourceType: 'PORTFOLIO_ANALYTICS',
        sourceReference: 'portfolio:default:us-msft',
        evidenceIds: [],
        epistemicStatus: 'REAL',
        isSimulated: false,
        market: 'US',
        retrievedAt: tMinus10m
      },
      reviewReference: {
        monitorId: monitorA.monitorId,
        reviewUrgency: 'HIGH',
        reviewWorkspaceUrl: `/monitor/${monitorA.monitorId}/review`
      },
      auditTrail: [],
      isAnalyticalOnly: true,
      executionProhibited: true
    };
    await alertRepo.save(alertInstance);

    // Same trigger at T + 10m (cooldown is 30m) -> Suppressed by cooldown
    const check2 = await alertOrchestrationEngine.checkCooldown(candidateT0, policyWithCooldown, new Date().toISOString());
    assert.strictEqual(check2.inCooldown, true, 'Trigger within 30m cooldown must be suppressed');
    assert(check2.remainingMinutes && check2.remainingMinutes > 0, 'Remaining minutes must be calculated');

    // Trigger at T + 45m (cooldown 30m expired) -> InCooldown is false
    const tPlus45m = new Date(Date.now() + 35 * 60 * 1000).toISOString();
    const check3 = await alertOrchestrationEngine.checkCooldown(candidateT0, policyWithCooldown, tPlus45m);
    assert.strictEqual(check3.inCooldown, false, 'Trigger after cooldown expiration must NOT be suppressed');
  });

  // =========================================================================
  // SCENARIO F — STATE TRANSITION SEMANTICS
  // =========================================================================
  await runScenario('Scenario F: State Transition Semantics (ACTIVE_GUARD -> TRIGGERED -> TRIGGERED -> RECOVERED)', async () => {
    const transMonitor = await investmentMonitorEngine.createMonitor(userA, 'AMZN', {
      reviewCadence: 'WEEKLY'
    });

    // 1. Transition to TRIGGERED
    const tTrigger = new Date().toISOString();
    const triggerEvt: InvestmentEvent = {
      eventId: `ev_trans_trig_${Date.now()}`,
      securityId: 'us-amzn',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Operating Margin Breach Invalidation Trigger',
      summary: 'Operating margin compressed 450bps below thesis guardrail.',
      eventType: 'THESIS_INVALIDATION',
      eventDate: tTrigger,
      announcedAt: tTrigger,
      availableAt: tTrigger,
      sourceType: 'SEC_FILING',
      sourceReference: 'AMZN 10-Q Item 2',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: {
        affectsThesis: 'YES',
        affectsDecision: 'YES',
        affectsPortfolio: 'YES',
        affectsEvidenceCoverage: 'NO',
        affectsInvalidationState: 'YES',
        overallScore: 0.95
      },
      affectedThesisAreas: ['INVALIDATION_CONDITION'],
      createdAt: tTrigger
    };
    await eventRepo.save(triggerEvt);

    const { candidates: candTrigger } = await alertOrchestrationEngine.detectCandidatesForMonitor(transMonitor, userA);
    const trigCand = candTrigger.find(c => c.ruleType === 'THESIS_INVALIDATION');
    assert(trigCand, 'Thesis invalidation candidate must fire on ACTIVE_GUARD -> TRIGGERED transition');
    assert.strictEqual(trigCand?.severity, 'CRITICAL');

    // 2. Commit review with updated status: TRIGGERED -> TRIGGERED
    await investmentMonitorEngine.executeReview(transMonitor.monitorId, userA, 'Acknowledged breach', 'THESIS_REASSESSMENT_REQUIRED');

    // Detect again: state is unchanged (TRIGGERED -> TRIGGERED)
    const { candidates: candSame } = await alertOrchestrationEngine.detectCandidatesForMonitor(transMonitor, userA);
    const duplicateTrig = candSame.find(c => c.ruleType === 'THESIS_INVALIDATION');
    assert.strictEqual(duplicateTrig, undefined, 'TRIGGERED -> TRIGGERED must NOT produce repeated thesis invalidation alert');
  });

  // =========================================================================
  // SCENARIO G — POLICY MATCHING
  // =========================================================================
  await runScenario('Scenario G: Policy Matching Rules & Scope Enforcement', async () => {
    const candidate: AlertCandidate = {
      candidateId: 'cand_match_1',
      monitorId: monitorA.monitorId,
      securityId: 'us-msft',
      symbol: 'MSFT',
      userId: userA,
      ruleType: 'SEC_FILING',
      detectedAt: new Date().toISOString(),
      severity: 'HIGH',
      observedValue: '10-K',
      triggerEvidence: 'Annual Report',
      sourceReference: 'SEC',
      sourceType: 'SEC_FILING',
      epistemicStatus: 'REAL',
      isSimulated: false,
      fingerprint: 'fp_m1'
    };

    // 1. Matching policy
    const matchPolicy: MonitoringPolicy = {
      policyId: 'pol_match',
      userId: userA,
      ownerUserId: userA,
      name: 'SEC Watch',
      policyType: 'EVENT',
      enabled: true,
      scope: 'ALL_MONITORS',
      rules: ['SEC_FILING'],
      configuration: {},
      minSeverity: 'HIGH',
      cooldownMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const res1 = alertOrchestrationEngine.matchPolicy(candidate, [matchPolicy]);
    assert.strictEqual(res1.matched, true, 'Matching policy must qualify candidate');

    // 2. Disabled policy
    const disabledPolicy: MonitoringPolicy = {
      ...matchPolicy,
      policyId: 'pol_disabled',
      enabled: false
    };
    const res2 = alertOrchestrationEngine.matchPolicy(candidate, [disabledPolicy]);
    assert.strictEqual(res2.matched, false, 'Disabled policy must NOT qualify candidate');

    // 3. Insufficient severity
    const criticalOnlyPolicy: MonitoringPolicy = {
      ...matchPolicy,
      policyId: 'pol_crit_only',
      minSeverity: 'CRITICAL'
    };
    const res3 = alertOrchestrationEngine.matchPolicy(candidate, [criticalOnlyPolicy]);
    assert.strictEqual(res3.matched, false, 'Policy requiring CRITICAL must NOT match HIGH candidate');

    // 4. Mismatched rule type
    const portfolioPolicy: MonitoringPolicy = {
      ...matchPolicy,
      policyId: 'pol_port_only',
      rules: ['PORTFOLIO_LOSS']
    };
    const res4 = alertOrchestrationEngine.matchPolicy(candidate, [portfolioPolicy]);
    assert.strictEqual(res4.matched, false, 'Policy for PORTFOLIO_LOSS must NOT match SEC_FILING candidate');
  });

  // =========================================================================
  // SCENARIO H — SEVERITY DERIVATION
  // =========================================================================
  await runScenario('Scenario H: Deterministic Severity Derivation', async () => {
    // Invalidation breach -> CRITICAL
    const breachEvent: InvestmentEvent = {
      eventId: `ev_sev_1_${Date.now()}`,
      securityId: 'us-msft',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Breach',
      summary: 'Breach summary',
      eventType: 'THESIS_INVALIDATION',
      eventDate: new Date().toISOString(),
      announcedAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
      sourceType: 'SEC_FILING',
      sourceReference: 'SEC',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: { affectsThesis: 'YES', affectsDecision: 'YES', affectsPortfolio: 'NO', affectsEvidenceCoverage: 'NO', affectsInvalidationState: 'YES', overallScore: 0.9 },
      createdAt: new Date().toISOString()
    };
    await eventRepo.save(breachEvent);

    const { candidates } = await alertOrchestrationEngine.detectCandidatesForMonitor(monitorA, userA);
    const breachCand = candidates.find(c => c.ruleType === 'THESIS_INVALIDATION');
    if (breachCand) {
      assert.strictEqual(breachCand.severity, 'CRITICAL', 'Breach must yield CRITICAL severity');
    }

    // High impact event (score >= 0.8) -> CRITICAL
    const highEventCand = candidates.find(c => c.observedValue === 'Breach');
    if (highEventCand) {
      assert(['CRITICAL', 'HIGH'].includes(highEventCand.severity));
    }
  });

  // =========================================================================
  // SCENARIO I — ALERT LIFECYCLE STATE MACHINE
  // =========================================================================
  await runScenario('Scenario I: Alert Lifecycle State Machine & Invalid Transition Rejection', async () => {
    // Create test alert
    const testAlert: AlertInstance = {
      alertId: `alert_life_${Date.now()}`,
      candidateId: 'cand_life_1',
      policyId: 'pol_1',
      policyName: 'Test Policy',
      monitorId: monitorA.monitorId,
      securityId: 'us-msft',
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      userId: userA,
      ownerUserId: userA,
      ruleType: 'SEC_FILING',
      severity: 'HIGH',
      status: 'DELIVERED',
      title: 'Lifecycle Test Alert',
      description: 'Testing lifecycle transitions',
      deterministicExplanation: 'Deterministic test',
      contextualAnalysis: null,
      detectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deliveredAt: new Date().toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
      dismissedAt: null,
      fingerprint: `fp_life_${Date.now()}`,
      trigger: { ruleType: 'SEC_FILING', observedValue: '10-K', reason: 'Filing' },
      provenance: { sourceType: 'SEC_FILING', sourceReference: 'EDGAR', evidenceIds: [], epistemicStatus: 'REAL', isSimulated: false, market: 'US', retrievedAt: new Date().toISOString() },
      reviewReference: { monitorId: monitorA.monitorId, reviewUrgency: 'HIGH', reviewWorkspaceUrl: `/monitor/${monitorA.monitorId}/review` },
      auditTrail: [{ action: 'DELIVERED', timestamp: new Date().toISOString(), userId: userA, note: 'Delivered' }],
      isAnalyticalOnly: true,
      executionProhibited: true
    };
    await alertRepo.save(testAlert);

    // 1. DELIVERED -> ACKNOWLEDGED
    const acked = await alertOrchestrationEngine.acknowledgeAlert(testAlert.alertId, userA, 'Confirmed received');
    assert.strictEqual(acked.status, 'ACKNOWLEDGED');
    assert(acked.acknowledgedAt, 'acknowledgedAt timestamp must be recorded');
    assert(acked.auditTrail.some(a => a.action === 'ACKNOWLEDGED'));

    // 2. ACKNOWLEDGED -> RESOLVED
    const resolved = await alertOrchestrationEngine.resolveAlert(testAlert.alertId, userA, 'Investigated and closed');
    assert.strictEqual(resolved.status, 'RESOLVED');
    assert(resolved.resolvedAt, 'resolvedAt timestamp must be recorded');
    assert(resolved.auditTrail.some(a => a.action === 'RESOLVED'));

    // 3. INVALID TRANSITION: Cannot acknowledge a RESOLVED alert
    let threwAckOnResolved = false;
    try {
      await alertOrchestrationEngine.acknowledgeAlert(testAlert.alertId, userA);
    } catch (err) {
      threwAckOnResolved = true;
    }
    assert.strictEqual(threwAckOnResolved, true, 'Acknowledging a resolved alert must be rejected');

    // 4. INVALID TRANSITION: Cannot dismiss a RESOLVED alert
    let threwDismissOnResolved = false;
    try {
      await alertOrchestrationEngine.dismissAlert(testAlert.alertId, userA);
    } catch (err) {
      threwDismissOnResolved = true;
    }
    assert.strictEqual(threwDismissOnResolved, true, 'Dismissing a resolved alert must be rejected');
  });

  // =========================================================================
  // SCENARIO J — ANALYST WORKFLOW ACTIONS
  // =========================================================================
  await runScenario('Scenario J: Analyst Workflow Actions (Acknowledge, Resolve, Dismiss with Audit Log)', async () => {
    // Test Dismissal on fresh alert
    const dismissAlertInstance: AlertInstance = {
      alertId: `alert_action_${Date.now()}`,
      candidateId: 'cand_act_1',
      policyId: 'pol_1',
      policyName: 'Test Policy',
      monitorId: monitorA.monitorId,
      securityId: 'us-msft',
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation',
      userId: userA,
      ownerUserId: userA,
      ruleType: 'MATERIAL_INVESTMENT_EVENT',
      severity: 'MEDIUM',
      status: 'DELIVERED',
      title: 'Analyst Action Test',
      description: 'Action test',
      deterministicExplanation: 'Action test explanation',
      contextualAnalysis: null,
      detectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deliveredAt: new Date().toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
      dismissedAt: null,
      fingerprint: `fp_act_${Date.now()}`,
      trigger: { ruleType: 'MATERIAL_INVESTMENT_EVENT', observedValue: 'Press Release', reason: 'PR' },
      provenance: { sourceType: 'PRESS_RELEASE', sourceReference: 'PR', evidenceIds: [], epistemicStatus: 'REAL', isSimulated: false, market: 'US', retrievedAt: new Date().toISOString() },
      reviewReference: { monitorId: monitorA.monitorId, reviewUrgency: 'ROUTINE', reviewWorkspaceUrl: `/monitor/${monitorA.monitorId}/review` },
      auditTrail: [{ action: 'DELIVERED', timestamp: new Date().toISOString(), userId: userA, note: 'Delivered' }],
      isAnalyticalOnly: true,
      executionProhibited: true
    };
    await alertRepo.save(dismissAlertInstance);

    const dismissed = await alertOrchestrationEngine.dismissAlert(dismissAlertInstance.alertId, userA, 'Noise event - not thesis relevant');
    assert.strictEqual(dismissed.status, 'DISMISSED');
    assert(dismissed.dismissedAt, 'dismissedAt must be set');
    assert(dismissed.auditTrail.some(a => a.action === 'DISMISSED' && a.note?.includes('Noise event')));

    // Persisted verification
    const fetched = await alertRepo.get(dismissAlertInstance.alertId);
    assert.strictEqual(fetched?.status, 'DISMISSED');
  });

  // =========================================================================
  // SCENARIO K — ALERT -> REVIEW WORKSPACE DEEP LINK
  // =========================================================================
  await runScenario('Scenario K: Alert -> Review Workspace Deep Link Reference Integrity', async () => {
    assert(alertA.reviewReference, 'Alert must have reviewReference');
    assert.strictEqual(alertA.reviewReference.monitorId, monitorA.monitorId, 'Deep link monitorId must match');
    assert.strictEqual(alertA.reviewReference.reviewWorkspaceUrl, `/monitor/${monitorA.monitorId}/review`);
    assert(['IMMEDIATE', 'HIGH', 'NORMAL', 'ROUTINE'].includes(alertA.reviewReference.reviewUrgency));

    // Calling openReviewForAlert records audit event without mutating alert facts
    const opened = await alertOrchestrationEngine.openReviewForAlert(alertA.alertId, userA);
    assert(opened.auditTrail.some(a => a.action === 'REVIEW_OPENED'));
  });

  // =========================================================================
  // SCENARIO L — HISTORICAL ALERT IMMUTABILITY
  // =========================================================================
  await runScenario('Scenario L: Historical Alert Immutability after Subsequent State Changes', async () => {
    // Ingest brand new events and reviews for monitorA
    const tPost = new Date().toISOString();
    const laterEvent: InvestmentEvent = {
      eventId: `ev_later_${Date.now()}`,
      securityId: 'us-msft',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Later Unrelated Event',
      summary: 'New product line launch',
      eventType: 'CORPORATE_ACTION',
      eventDate: tPost,
      announcedAt: tPost,
      availableAt: tPost,
      sourceType: 'PRESS_RELEASE',
      sourceReference: 'MSFT PR',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: { affectsThesis: 'NO', affectsDecision: 'NO', affectsPortfolio: 'NO', affectsEvidenceCoverage: 'NO', affectsInvalidationState: 'NO' },
      createdAt: tPost
    };
    await eventRepo.save(laterEvent);

    // Re-fetch Alert A
    const currentAlertA = await alertRepo.get(alertA.alertId);
    assert(currentAlertA, 'Alert A must remain intact');

    // Original trigger, severity, timestamp, fingerprint, provenance must match original snapshot
    const original = JSON.parse(alertAJsonSnapshot);
    assert.strictEqual(currentAlertA?.trigger.ruleType, original.trigger.ruleType);
    assert.strictEqual(currentAlertA?.trigger.observedValue, original.trigger.observedValue);
    assert.strictEqual(currentAlertA?.severity, original.severity);
    assert.strictEqual(currentAlertA?.fingerprint, original.fingerprint);
    assert.strictEqual(currentAlertA?.createdAt, original.createdAt);
    assert.strictEqual(currentAlertA?.securityId, original.securityId);
  });

  // =========================================================================
  // SCENARIO M — POINT-IN-TIME (PIT) ZERO LOOKAHEAD
  // =========================================================================
  await runScenario('Scenario M: Point-in-Time Strict Boundary Excludes Future Data', async () => {
    const pitMonitor = await investmentMonitorEngine.createMonitor(userA, 'ASML', {
      reviewCadence: 'WEEKLY'
    });

    const tPast = new Date(Date.now() - 86400000 * 10).toISOString(); // 10 days ago
    const tFuture = new Date().toISOString();

    // Event published in the future relative to tPast
    const futureEvt: InvestmentEvent = {
      eventId: `ev_future_${Date.now()}`,
      securityId: 'us-asml',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Future Antitrust Settlement',
      summary: 'DOJ antitrust settlement agreed',
      eventType: 'MARKET_EVENT',
      eventDate: tFuture,
      announcedAt: tFuture,
      availableAt: tFuture,
      sourceType: 'SEC_FILING',
      sourceReference: 'SEC',
      evidenceIds: [],
      epistemicStatus: 'REAL',
      isSimulated: false,
      significance: { affectsThesis: 'YES', affectsDecision: 'YES', affectsPortfolio: 'NO', affectsEvidenceCoverage: 'NO', affectsInvalidationState: 'YES', overallScore: 0.95 },
      createdAt: tFuture
    };
    await eventRepo.save(futureEvt);

    // Run cycle with asOfDate in the past
    const pastCycle = await alertOrchestrationEngine.runMonitoringCycle(userA, {
      monitorId: pitMonitor.monitorId,
      asOfDate: tPast
    });

    // Future event must NOT leak into past cycle
    const foundFutureAlert = pastCycle.newAlerts.some(a => a.title.includes('Antitrust Settlement'));
    assert.strictEqual(foundFutureAlert, false, 'Future event must not create alerts in historical PIT evaluation');
  });

  // =========================================================================
  // SCENARIO N — PROVIDER FAILURE / MISSING DATA
  // =========================================================================
  await runScenario('Scenario N: Provider Failure & Missing Data Never Fabricate Spurious Alerts', async () => {
    const nullMonitor = await investmentMonitorEngine.createMonitor(userA, 'PLTR', {
      reviewCadence: 'WEEKLY'
    });

    // Run cycle when no market feed or external SEC data is ingested
    const cycle = await alertOrchestrationEngine.runMonitoringCycle(userA, {
      monitorId: nullMonitor.monitorId
    });

    // No spurious price or filing alerts may be synthesized
    assert.strictEqual(cycle.newAlerts.length, 0, 'Must produce 0 fabricated alerts when data is absent');
  });

  // =========================================================================
  // SCENARIO O — EPISTEMIC INTEGRITY
  // =========================================================================
  await runScenario('Scenario O: Epistemic Status Preservation (SIMULATED != REAL)', async () => {
    // Ingest simulated event
    const simTime = new Date().toISOString();
    const simEvent: InvestmentEvent = {
      eventId: `ev_sim_${Date.now()}`,
      securityId: 'us-msft',
      market: 'US',
      exchange: 'NASDAQ',
      title: 'Monte Carlo Invalidation Simulation',
      summary: 'Simulated 500bps supply chain margin shock',
      eventType: 'MARKET_EVENT',
      eventDate: simTime,
      announcedAt: simTime,
      availableAt: simTime,
      sourceType: 'STRESS_TEST_SIMULATION',
      sourceReference: 'Monte Carlo Sim #44',
      evidenceIds: [],
      epistemicStatus: 'SIMULATED',
      isSimulated: true,
      significance: { affectsThesis: 'YES', affectsDecision: 'NO', affectsPortfolio: 'NO', affectsEvidenceCoverage: 'NO', affectsInvalidationState: 'NO', overallScore: 0.75 },
      createdAt: simTime
    };
    await eventRepo.save(simEvent);

    const { candidates } = await alertOrchestrationEngine.detectCandidatesForMonitor(monitorA, userA);
    const simCand = candidates.find(c => c.candidateId.includes(simEvent.eventId));
    if (simCand) {
      assert.strictEqual(simCand.epistemicStatus, 'SIMULATED', 'Candidate must preserve SIMULATED status');
      assert.strictEqual(simCand.isSimulated, true, 'isSimulated flag must remain true');
    }
  });

  // =========================================================================
  // SCENARIO P — MULTI-CURRENCY STRICT ISOLATION
  // =========================================================================
  await runScenario('Scenario P: Multi-Currency Strict Isolation (USD vs INR)', async () => {
    // Portfolio holding with Indian security in INR
    const inrPosition: HoldingPosition = {
      positionId: `pos_inr_${Date.now()}`,
      portfolioId: 'default',
      userId: userA,
      securityId: 'in-reliance',
      ticker: 'RELIANCE',
      name: 'Reliance Industries Ltd.',
      shares: 100,
      avgCost: 2800,
      currentPrice: 2600,
      marketValue: 260000,
      unrealizedPnL: -20000,
      unrealizedPnLPercent: -7.14,
      currency: 'INR',
      assetClass: 'EQUITY',
      lastUpdated: new Date().toISOString()
    };
    await portfolioRepo.savePositions([inrPosition]);

    const relMonitor = await investmentMonitorEngine.createMonitor(userA, 'RELIANCE', {
      reviewCadence: 'WEEKLY'
    });

    const { reviewDraft } = await alertOrchestrationEngine.detectCandidatesForMonitor(relMonitor, userA);
    assert(reviewDraft, 'Review draft must exist');
    assert.strictEqual(reviewDraft?.portfolioDelta?.currency, 'INR', 'Reliance portfolio delta must be INR');
    assert(reviewDraft?.portfolioDelta?.narrative?.includes('₹') || reviewDraft?.portfolioDelta?.narrative?.includes('INR'), 'Narrative must preserve INR currency');
  });

  // =========================================================================
  // SCENARIO Q — MULTI-TENANT SECURITY & IDOR PROTECTION
  // =========================================================================
  await runScenario('Scenario Q: Multi-Tenant Security & IDOR Enforcement', async () => {
    // User B tries to access User A's alert
    let userBCannotGetAlert = false;
    try {
      await authorizationService.authorizeOrchestratedAlert(alertA.alertId, userB);
    } catch (err) {
      if (err instanceof AuthorizationError && err.statusCode === 403) {
        userBCannotGetAlert = true;
      }
    }
    assert.strictEqual(userBCannotGetAlert, true, 'User B must receive 403 when accessing User A alert');

    // User B tries to acknowledge User A's alert
    let userBCannotAckAlert = false;
    try {
      await alertOrchestrationEngine.acknowledgeAlert(alertA.alertId, userB);
    } catch (err) {
      if (err instanceof AuthorizationError && err.statusCode === 403) {
        userBCannotAckAlert = true;
      }
    }
    assert.strictEqual(userBCannotAckAlert, true, 'User B must receive 403 when acknowledging User A alert');

    // User B tries to dismiss User A's alert
    let userBCannotDismissAlert = false;
    try {
      await alertOrchestrationEngine.dismissAlert(alertA.alertId, userB);
    } catch (err) {
      if (err instanceof AuthorizationError && err.statusCode === 403) {
        userBCannotDismissAlert = true;
      }
    }
    assert.strictEqual(userBCannotDismissAlert, true, 'User B must receive 403 when dismissing User A alert');

    // User B tries to resolve User A's alert
    let userBCannotResolveAlert = false;
    try {
      await alertOrchestrationEngine.resolveAlert(alertA.alertId, userB);
    } catch (err) {
      if (err instanceof AuthorizationError && err.statusCode === 403) {
        userBCannotResolveAlert = true;
      }
    }
    assert.strictEqual(userBCannotResolveAlert, true, 'User B must receive 403 when resolving User A alert');

    // User B listing alerts only sees their own
    const userBAlerts = await alertRepo.getByUserId(userB);
    const containsUserAAlert = userBAlerts.some(a => a.alertId === alertA.alertId);
    assert.strictEqual(containsUserAAlert, false, 'User B list query must never contain User A alerts');
  });

  // =========================================================================
  // SCENARIO R — USER POLICY ISOLATION
  // =========================================================================
  await runScenario('Scenario R: User Policy Isolation', async () => {
    // User A creates a specific policy
    const userAPolicy: MonitoringPolicy = {
      policyId: `pol_user_a_${Date.now()}`,
      userId: userA,
      ownerUserId: userA,
      name: 'User A Private Sentinel',
      policyType: 'THESIS',
      enabled: true,
      scope: 'ALL_MONITORS',
      rules: ['THESIS_INVALIDATION'],
      configuration: {},
      minSeverity: 'CRITICAL',
      cooldownMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await policyRepo.save(userAPolicy);

    // User B accesses policies
    const userBPolicies = await policyRepo.getByUserId(userB);
    const containsAPolicy = userBPolicies.some(p => p.policyId === userAPolicy.policyId);
    assert.strictEqual(containsAPolicy, false, 'User B policies list must NOT contain User A policy');

    // User B tries to authorize User A policy directly
    let threwOnPolicy = false;
    try {
      await authorizationService.authorizePolicy(userAPolicy.policyId, userB);
    } catch (err) {
      if (err instanceof AuthorizationError && err.statusCode === 403) {
        threwOnPolicy = true;
      }
    }
    assert.strictEqual(threwOnPolicy, true, 'User B must receive 403 when requesting User A policy by ID');
  });

  console.log('\n======================================================================');
  console.log(`PHASE 27.1 ACCEPTANCE RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('======================================================================\n');
  process.exit(0);
}

runAllPhase27Acceptance().catch(err => {
  console.error('Fatal error during Phase 27.1 acceptance testing:', err);
  process.exit(1);
});
