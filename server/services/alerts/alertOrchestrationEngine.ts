/**
 * Phase 27: Continuous Monitoring & Alert Orchestration Engine
 * 
 * Strict architectural boundaries:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Deterministic orchestration layer above existing canonical engines.
 * - Does NOT duplicate calculations (uses investmentMonitorEngine, watchlistAlertService, etc.).
 * - Pure rule/policy matching (Gemini NEVER decides trigger qualification or alert creation).
 * - Full lifecycle: DETECTED -> QUALIFIED -> DELIVERED -> ACKNOWLEDGED -> RESOLVED.
 * - Idempotency, deduplication fingerprints, and configurable cooldown windows.
 * - Strict multi-tenant isolation (IDOR protection).
 * - USD and INR currency isolation.
 */

import {
  MonitoringPolicy,
  MonitoringPolicyType,
  AlertCandidate,
  AlertInstance,
  AlertLifecycleStatus,
  AlertSeverity,
  AlertRuleType,
  AlertAuditAction,
  MonitoringCycleOptions,
  MonitoringCycleResult,
  InvestmentMonitor,
  InvestmentMonitorReview,
  EpistemicStatus
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { investmentMonitorEngine } from '../monitor/investmentMonitorEngine';
import { watchlistAlertService } from './watchlistAlertService';
import { AuthorizationError } from '../../auth/authorizationService';

// Severity order: CRITICAL > HIGH > MEDIUM > LOW
const SEVERITY_LEVELS: Record<AlertSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

export class AlertOrchestrationEngine {
  private static instance: AlertOrchestrationEngine;

  public static getInstance(): AlertOrchestrationEngine {
    if (!AlertOrchestrationEngine.instance) {
      AlertOrchestrationEngine.instance = new AlertOrchestrationEngine();
    }
    return AlertOrchestrationEngine.instance;
  }

  // ==========================================================================
  // 1. DEFAULT POLICY SEEDING
  // ==========================================================================

  public async getPolicies(userId: string): Promise<MonitoringPolicy[]> {
    const policyRepo = persistenceManager.getPolicyRepository();
    let policies = await policyRepo.getByUserId(userId);
    if (policies.length === 0) {
      policies = await this.seedDefaultPolicies(userId);
    }
    return policies;
  }

  public async seedDefaultPolicies(userId: string): Promise<MonitoringPolicy[]> {
    const policyRepo = persistenceManager.getPolicyRepository();
    const now = new Date().toISOString();

    const defaultPolicies: MonitoringPolicy[] = [
      {
        policyId: `policy_${userId}_thesis_invalidation`,
        userId,
        ownerUserId: userId,
        name: 'Moat & Thesis Invalidation Sentinel',
        policyType: 'THESIS',
        enabled: true,
        scope: 'ALL_MONITORS',
        rules: [
          'THESIS_INVALIDATION',
          'THESIS_INVALIDATED',
          'INVALIDATION_CHANGE',
          'THESIS_CHANGE',
          'THESIS_RECOVERY',
          'THESIS_RECOVERED'
        ],
        configuration: {},
        minSeverity: 'CRITICAL',
        cooldownMinutes: 120,
        createdAt: now,
        updatedAt: now
      },
      {
        policyId: `policy_${userId}_high_impact_events`,
        userId,
        ownerUserId: userId,
        name: 'High-Impact Regulatory & Corporate Disclosures',
        policyType: 'EVENT',
        enabled: true,
        scope: 'ALL_MONITORS',
        rules: [
          'SEC_FILING',
          'NEW_SEC_FILING',
          'MATERIAL_INVESTMENT_EVENT',
          'EVIDENCE_CHANGE',
          'EVIDENCE_CONFLICT'
        ],
        configuration: {},
        minSeverity: 'HIGH',
        cooldownMinutes: 60,
        createdAt: now,
        updatedAt: now
      },
      {
        policyId: `policy_${userId}_decision_drift`,
        userId,
        ownerUserId: userId,
        name: 'Decision Quality & Thesis Drift Sentinel',
        policyType: 'MONITOR',
        enabled: true,
        scope: 'ALL_MONITORS',
        rules: [
          'DECISION_CHANGE',
          'RESEARCH_SNAPSHOT_CHANGE',
          'RESEARCH_SNAPSHOT_CHANGED',
          'VALUATION_CHANGE',
          'QUANT_CHANGE'
        ],
        configuration: {},
        minSeverity: 'MEDIUM',
        cooldownMinutes: 180,
        createdAt: now,
        updatedAt: now
      },
      {
        policyId: `policy_${userId}_portfolio_sentinel`,
        userId,
        ownerUserId: userId,
        name: 'Portfolio Exposure & Drawdown Sentinel',
        policyType: 'PORTFOLIO',
        enabled: true,
        scope: 'PORTFOLIO',
        rules: [
          'PORTFOLIO_LOSS',
          'PORTFOLIO_DAILY_LOSS_ABOVE',
          'DRAWDOWN',
          'PORTFOLIO_DRAWDOWN_ABOVE',
          'POSITION_WEIGHT',
          'POSITION_WEIGHT_ABOVE',
          'RISK_CONTRIBUTION',
          'PORTFOLIO_CHANGE'
        ],
        configuration: {},
        minSeverity: 'HIGH',
        cooldownMinutes: 60,
        createdAt: now,
        updatedAt: now
      }
    ];

    const saved: MonitoringPolicy[] = [];
    for (const p of defaultPolicies) {
      const s = await policyRepo.save(p);
      saved.push(s);
    }
    return saved;
  }

  // ==========================================================================
  // 2. CANDIDATE DETECTION VIA CANONICAL ENGINES
  // ==========================================================================

  /**
   * Evaluates candidate alerts for a monitor using canonical InvestmentMonitorEngine.
   */
  public async detectCandidatesForMonitor(
    monitor: InvestmentMonitor,
    userId: string,
    asOfDate?: string
  ): Promise<{ candidates: AlertCandidate[]; reviewDraft?: InvestmentMonitorReview }> {
    const candidates: AlertCandidate[] = [];
    const now = new Date().toISOString();

    // Invoke canonical change detection engine from Phase 25/26
    let review: InvestmentMonitorReview | null = null;
    try {
      review = await investmentMonitorEngine.detectAllChanges(monitor.monitorId, userId, asOfDate);
    } catch (err) {
      console.warn(`[AlertOrchestration] Change detection failed for monitor ${monitor.monitorId}:`, err);
      return { candidates: [] };
    }

    if (!review) return { candidates: [] };

    const epistemicStatus = monitor.epistemicStatus || 'REAL';
    const isSimulated = epistemicStatus === 'SIMULATED';

    // 1. Invalidation status change
    if (review.invalidationDelta?.invalidationStatusChanged) {
      const prev = review.invalidationDelta.previousStatus;
      const curr = review.invalidationDelta.currentStatus;
      const isBreached = curr === 'TRIGGERED' || curr === 'BREACHED';
      const isRecovered = prev === 'TRIGGERED' && (curr === 'ACTIVE_GUARD' || curr === 'MONITORING');

      const ruleType: AlertRuleType = isBreached
        ? 'THESIS_INVALIDATION'
        : isRecovered
        ? 'THESIS_RECOVERY'
        : 'INVALIDATION_CHANGE';

      const severity: AlertSeverity = isBreached ? 'CRITICAL' : isRecovered ? 'MEDIUM' : 'HIGH';

      candidates.push({
        candidateId: `cand_${monitor.monitorId}_inv_${Date.now()}`,
        monitorId: monitor.monitorId,
        securityId: monitor.securityId,
        symbol: monitor.ticker,
        userId,
        ruleType,
        detectedAt: now,
        severity,
        observedValue: curr,
        previousValue: prev,
        previousState: prev,
        currentState: curr,
        triggerEvidence: review.invalidationDelta.triggeredConditions?.map(c => typeof c === 'string' ? c : (c as any).name || (c as any).condition || String(c)).join(', ') || `Status changed to ${curr}`,
        sourceReference: `monitor:${monitor.monitorId}:invalidation`,
        sourceType: 'THESIS_INVALIDATION_GUARD',
        epistemicStatus,
        isSimulated,
        fingerprint: this.buildFingerprint(userId, monitor.securityId, ruleType, curr, `monitor:${monitor.monitorId}`)
      });
    }

    // 2. Thesis health change
    if (review.thesisDelta?.statusChanged) {
      const prev = review.thesisDelta.previousStatus;
      const curr = review.thesisDelta.currentStatus;
      const severity: AlertSeverity = curr === 'IMPAIRED' ? 'CRITICAL' : curr === 'AT_RISK' ? 'HIGH' : 'MEDIUM';

      candidates.push({
        candidateId: `cand_${monitor.monitorId}_thesis_${Date.now()}`,
        monitorId: monitor.monitorId,
        securityId: monitor.securityId,
        symbol: monitor.ticker,
        userId,
        ruleType: 'THESIS_CHANGE',
        detectedAt: now,
        severity,
        observedValue: curr,
        previousValue: prev,
        previousState: prev,
        currentState: curr,
        triggerEvidence: review.thesisDelta.summary || `Thesis health changed from ${prev} to ${curr}`,
        sourceReference: `monitor:${monitor.monitorId}:thesis`,
        sourceType: 'THESIS_HEALTH_ENGINE',
        epistemicStatus,
        isSimulated,
        fingerprint: this.buildFingerprint(userId, monitor.securityId, 'THESIS_CHANGE', curr, `monitor:${monitor.monitorId}`)
      });
    }

    // 3. Decision delta (rating or score shift)
    if (review.decisionDelta) {
      const ratingShift = review.decisionDelta.ratingShift;
      const scoreDelta = Math.abs(review.decisionDelta.compositeScoreDelta || 0);

      if (ratingShift || scoreDelta >= 0.10) {
        const severity: AlertSeverity = (ratingShift || scoreDelta >= 0.20) ? 'HIGH' : 'MEDIUM';
        const currRating = review.decisionDelta.currentRating || 'UNRATED';
        const prevRating = review.decisionDelta.previousRating || 'UNRATED';

        candidates.push({
          candidateId: `cand_${monitor.monitorId}_dec_${Date.now()}`,
          monitorId: monitor.monitorId,
          securityId: monitor.securityId,
          symbol: monitor.ticker,
          userId,
          ruleType: 'DECISION_CHANGE',
          detectedAt: now,
          severity,
          observedValue: review.decisionDelta.currentCompositeScore || currRating,
          previousValue: review.decisionDelta.previousCompositeScore || prevRating,
          previousState: prevRating,
          currentState: currRating,
          triggerEvidence: `Decision rating shifted from ${prevRating} to ${currRating} (Score delta: ${scoreDelta.toFixed(2)})`,
          sourceReference: `monitor:${monitor.monitorId}:decision`,
          sourceType: 'DECISION_ASSESSMENT',
          epistemicStatus,
          isSimulated,
          fingerprint: this.buildFingerprint(userId, monitor.securityId, 'DECISION_CHANGE', currRating, `monitor:${monitor.monitorId}`)
        });
      }
    }

    // 4. Material events detected since baseline
    if (review.eventDelta && review.eventDelta.newEvents && review.eventDelta.newEvents.length > 0) {
      for (const evt of review.eventDelta.newEvents) {
        const isFiling = evt.eventType?.includes('FILING') || evt.eventType?.includes('SEC') || evt.sourceType?.includes('SEC');
        const ruleType: AlertRuleType = isFiling ? 'SEC_FILING' : 'MATERIAL_INVESTMENT_EVENT';
        const sigScore = evt.significance?.overallScore ?? 0.5;
        const severity: AlertSeverity = sigScore >= 0.8 ? 'CRITICAL' : sigScore >= 0.6 ? 'HIGH' : 'MEDIUM';

        candidates.push({
          candidateId: `cand_${monitor.monitorId}_evt_${evt.eventId}`,
          monitorId: monitor.monitorId,
          securityId: monitor.securityId,
          symbol: monitor.ticker,
          userId,
          ruleType,
          detectedAt: now,
          severity,
          observedValue: evt.title,
          previousValue: null,
          currentState: evt.eventType,
          triggerEvidence: `${evt.title} (${evt.summary})`,
          sourceReference: evt.sourceReference || evt.eventId,
          sourceType: evt.sourceType || 'INVESTMENT_EVENT',
          epistemicStatus: evt.epistemicStatus || epistemicStatus,
          isSimulated: evt.isSimulated || isSimulated,
          fingerprint: this.buildFingerprint(userId, monitor.securityId, ruleType, evt.eventId, evt.sourceReference || evt.eventId)
        });
      }
    }

    // 5. Evidence delta (conflicts or critical new filings)
    if (review.evidenceDelta && review.evidenceDelta.conflictDetected && (review.evidenceDelta.newEvidenceCount || 0) > 0) {
      candidates.push({
        candidateId: `cand_${monitor.monitorId}_evd_${Date.now()}`,
        monitorId: monitor.monitorId,
        securityId: monitor.securityId,
        symbol: monitor.ticker,
        userId,
        ruleType: 'EVIDENCE_CONFLICT',
        detectedAt: now,
        severity: 'HIGH',
        observedValue: 'CONFLICT_DETECTED',
        triggerEvidence: review.evidenceDelta.conflictSummary || 'Conflict detected among evidence sources',
        sourceReference: `monitor:${monitor.monitorId}:evidence`,
        sourceType: 'EVIDENCE_ENGINE',
        epistemicStatus,
        isSimulated,
        fingerprint: this.buildFingerprint(userId, monitor.securityId, 'EVIDENCE_CONFLICT', 'CONFLICT', `monitor:${monitor.monitorId}`)
      });
    }

    // 6. Portfolio exposure delta
    if (review.portfolioDelta && review.portfolioDelta.hasExposure) {
      const weightDelta = Math.abs(review.portfolioDelta.weightDeltaPct || 0);
      const pnlDelta = review.portfolioDelta.unrealizedPnLDelta || 0;

      if (weightDelta >= 2.0 || pnlDelta < -500) {
        const isLoss = pnlDelta < -1000;
        const ruleType: AlertRuleType = isLoss ? 'PORTFOLIO_LOSS' : 'PORTFOLIO_CHANGE';
        const severity: AlertSeverity = isLoss ? 'HIGH' : 'MEDIUM';

        candidates.push({
          candidateId: `cand_${monitor.monitorId}_port_${Date.now()}`,
          monitorId: monitor.monitorId,
          securityId: monitor.securityId,
          symbol: monitor.ticker,
          portfolioId: 'default',
          userId,
          ruleType,
          detectedAt: now,
          severity,
          observedValue: `${review.portfolioDelta.weightPct?.toFixed(2)}%`,
          previousValue: `${review.portfolioDelta.previousWeightPct?.toFixed(2)}%`,
          triggerEvidence: `Portfolio weight delta: ${weightDelta.toFixed(2)}%, Unrealized PnL delta: ${review.portfolioDelta.currency || 'USD'} ${pnlDelta.toFixed(2)}`,
          sourceReference: `portfolio:default:${monitor.securityId}`,
          sourceType: 'PORTFOLIO_ANALYTICS',
          epistemicStatus,
          isSimulated,
          fingerprint: this.buildFingerprint(userId, monitor.securityId, ruleType, `${weightDelta.toFixed(1)}_${isLoss}`, 'portfolio')
        });
      }
    }

    return { candidates, reviewDraft: review };
  }

  // ==========================================================================
  // 3. DETERMINISTIC POLICY MATCHING
  // ==========================================================================

  /**
   * Pure deterministic policy matcher.
   * Gemini NEVER decides policy matching!
   */
  public matchPolicy(
    candidate: AlertCandidate,
    policies: MonitoringPolicy[]
  ): { matched: boolean; policy?: MonitoringPolicy; reason: string } {
    const candidateSeverityVal = SEVERITY_LEVELS[candidate.severity] || 1;

    for (const policy of policies) {
      if (!policy.enabled) continue;
      if (policy.userId !== candidate.userId && policy.ownerUserId !== candidate.userId) continue;

      // Scope match
      if (policy.scope === 'SPECIFIC_MONITOR' && policy.monitorId !== candidate.monitorId) {
        continue;
      }
      if (policy.scope === 'SPECIFIC_SECURITY' && policy.securityId !== candidate.securityId) {
        continue;
      }
      if (policy.scope === 'PORTFOLIO' && !candidate.portfolioId && candidate.ruleType !== 'PORTFOLIO_CHANGE' && candidate.ruleType !== 'PORTFOLIO_LOSS') {
        continue;
      }

      // Rule match (including canonical aliases)
      const ruleMatches = this.isRuleCoveredByPolicy(candidate.ruleType, policy.rules);
      if (!ruleMatches) continue;

      // Severity threshold check
      const policySeverityVal = SEVERITY_LEVELS[policy.minSeverity] || 1;
      if (candidateSeverityVal < policySeverityVal) {
        continue;
      }

      return {
        matched: true,
        policy,
        reason: `Matched policy "${policy.name}" (${policy.policyId}) on rule ${candidate.ruleType} with severity >= ${policy.minSeverity}`
      };
    }

    return {
      matched: false,
      reason: `No enabled policy matched candidate rule ${candidate.ruleType} with severity >= required threshold`
    };
  }

  private isRuleCoveredByPolicy(candidateRule: AlertRuleType, policyRules: AlertRuleType[]): boolean {
    if (policyRules.includes(candidateRule)) return true;

    // Aliases
    const aliases: Record<string, string[]> = {
      THESIS_INVALIDATION: ['THESIS_INVALIDATION', 'THESIS_INVALIDATED', 'INVALIDATION_CHANGE'],
      THESIS_INVALIDATED: ['THESIS_INVALIDATION', 'THESIS_INVALIDATED', 'INVALIDATION_CHANGE'],
      THESIS_RECOVERY: ['THESIS_RECOVERY', 'THESIS_RECOVERED'],
      THESIS_RECOVERED: ['THESIS_RECOVERY', 'THESIS_RECOVERED'],
      SEC_FILING: ['SEC_FILING', 'NEW_SEC_FILING'],
      NEW_SEC_FILING: ['SEC_FILING', 'NEW_SEC_FILING'],
      MATERIAL_INVESTMENT_EVENT: ['MATERIAL_INVESTMENT_EVENT'],
      PORTFOLIO_LOSS: ['PORTFOLIO_LOSS', 'PORTFOLIO_DAILY_LOSS_ABOVE', 'PORTFOLIO_CHANGE'],
      DRAWDOWN: ['DRAWDOWN', 'PORTFOLIO_DRAWDOWN_ABOVE'],
      POSITION_WEIGHT: ['POSITION_WEIGHT', 'POSITION_WEIGHT_ABOVE'],
      RESEARCH_SNAPSHOT_CHANGE: ['RESEARCH_SNAPSHOT_CHANGE', 'RESEARCH_SNAPSHOT_CHANGED']
    };

    const candidateAliases = aliases[candidateRule] || [candidateRule];
    return policyRules.some(pr => candidateAliases.includes(pr));
  }

  // ==========================================================================
  // 4. DEDUPLICATION & COOLDOWN
  // ==========================================================================

  public buildFingerprint(
    userId: string,
    targetId: string,
    ruleType: string,
    stateOrValue: string,
    sourceRef: string
  ): string {
    return `${userId}:${targetId}:${ruleType}:${stateOrValue}:${sourceRef}`.toLowerCase();
  }

  /**
   * Deduplication check: Prevents duplicate alert instances for identical state/event.
   */
  public async checkDeduplication(
    candidate: AlertCandidate
  ): Promise<{ isDuplicate: boolean; existingAlert?: AlertInstance; reason?: string }> {
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const existing = await alertRepo.getRecentByFingerprint(candidate.fingerprint);

    if (existing) {
      // Active alert with exact same fingerprint
      if (existing.status === 'DELIVERED' || existing.status === 'QUALIFIED' || existing.status === 'ACKNOWLEDGED') {
        return {
          isDuplicate: true,
          existingAlert: existing,
          reason: `Active alert ${existing.alertId} exists with identical fingerprint`
        };
      }

      // If resolved or dismissed within immediate 1-minute window, treat as duplicate
      const timeSince = Date.now() - new Date(existing.createdAt).getTime();
      if (timeSince < 60 * 1000) {
        return {
          isDuplicate: true,
          existingAlert: existing,
          reason: `Recent alert ${existing.alertId} resolved/dismissed within immediate deduplication buffer`
        };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Cooldown check: Prevents alert flooding on recurring conditions.
   */
  public async checkCooldown(
    candidate: AlertCandidate,
    policy: MonitoringPolicy,
    now: string
  ): Promise<{ inCooldown: boolean; remainingMinutes?: number; reason?: string }> {
    const cooldownMins = policy.cooldownMinutes ?? 60;
    if (cooldownMins <= 0) return { inCooldown: false };

    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const targetId = candidate.securityId || candidate.monitorId || candidate.symbol || 'default';
    const recent = await alertRepo.getRecentByRule(candidate.userId, targetId, candidate.ruleType);

    if (recent) {
      const elapsedMins = (new Date(now).getTime() - new Date(recent.createdAt).getTime()) / (60 * 1000);
      if (elapsedMins < cooldownMins) {
        // Genuine emergency state transitions (e.g. transitioning from healthy to TRIGGERED) are not suppressed
        const isEmergencyTransition = candidate.ruleType === 'THESIS_INVALIDATION' &&
                                      candidate.currentState === 'TRIGGERED' &&
                                      recent.trigger?.currentState !== 'TRIGGERED';

        if (!isEmergencyTransition) {
          const remainingMinutes = Math.ceil(cooldownMins - elapsedMins);
          return {
            inCooldown: true,
            remainingMinutes,
            reason: `Alert suppressed by cooldown: rule ${candidate.ruleType} fired ${elapsedMins.toFixed(0)}m ago (cooldown ${cooldownMins}m, ${remainingMinutes}m remaining)`
          };
        }
      }
    }

    return { inCooldown: false };
  }

  // ==========================================================================
  // 5. ORCHESTRATION CYCLE EXECUTION
  // ==========================================================================

  /**
   * Runs a complete deterministic monitoring cycle for a user.
   */
  public async runMonitoringCycle(
    userId: string,
    options?: MonitoringCycleOptions
  ): Promise<MonitoringCycleResult> {
    const cycleId = `cycle_${Date.now()}`;
    const now = new Date().toISOString();
    const asOfDate = options?.asOfDate;

    const monitorRepo = persistenceManager.getMonitorRepository();
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();

    // 1. Fetch monitors
    let monitors: InvestmentMonitor[] = [];
    if (options?.monitorId) {
      const single = await monitorRepo.get(options.monitorId);
      if (single && (single.userId === userId || single.ownerUserId === userId)) {
        monitors = [single];
      }
    } else {
      monitors = await monitorRepo.getByUserId(userId);
    }

    // 2. Fetch policies
    const policies = await this.getPolicies(userId);

    const evaluations: MonitoringCycleResult['evaluations'] = [];
    let candidatesDetected = 0;
    let qualifiedAlerts = 0;
    let suppressedDuplicates = 0;
    let suppressedCooldown = 0;
    const newAlerts: AlertInstance[] = [];

    // 3. Evaluate each monitor
    for (const monitor of monitors) {
      const { candidates, reviewDraft } = await this.detectCandidatesForMonitor(monitor, userId, asOfDate);
      candidatesDetected += candidates.length;

      for (const candidate of candidates) {
        // Policy matching
        const policyMatch = this.matchPolicy(candidate, policies);
        if (!policyMatch.matched || !policyMatch.policy) {
          evaluations.push({
            targetId: candidate.securityId || monitor.ticker,
            ruleType: candidate.ruleType,
            triggered: false,
            severity: candidate.severity,
            reason: policyMatch.reason
          });
          continue;
        }

        const policy = policyMatch.policy;

        // Deduplication
        const dedup = await this.checkDeduplication(candidate);
        if (dedup.isDuplicate) {
          suppressedDuplicates++;
          evaluations.push({
            targetId: candidate.securityId || monitor.ticker,
            ruleType: candidate.ruleType,
            triggered: false,
            severity: candidate.severity,
            reason: dedup.reason || 'Suppressed duplicate'
          });
          continue;
        }

        // Cooldown
        const cooldown = await this.checkCooldown(candidate, policy, now);
        if (cooldown.inCooldown) {
          suppressedCooldown++;
          evaluations.push({
            targetId: candidate.securityId || monitor.ticker,
            ruleType: candidate.ruleType,
            triggered: false,
            severity: candidate.severity,
            reason: cooldown.reason || 'Suppressed by policy cooldown'
          });
          continue;
        }

        // Candidate qualifies -> Deliver AlertInstance
        qualifiedAlerts++;
        const alertInstance = this.createAlertInstance(candidate, policy, monitor, reviewDraft, now);
        await alertRepo.save(alertInstance);
        newAlerts.push(alertInstance);

        evaluations.push({
          targetId: candidate.securityId || monitor.ticker,
          ruleType: candidate.ruleType,
          triggered: true,
          severity: candidate.severity,
          reason: `Delivered alert ${alertInstance.alertId} qualified by policy ${policy.name}`
        });
      }
    }

    return {
      cycleId,
      timestamp: now,
      userId,
      monitorsEvaluated: monitors.length,
      candidatesDetected,
      qualifiedAlerts,
      suppressedDuplicates,
      suppressedCooldown,
      newAlerts,
      evaluations,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  // ==========================================================================
  // 6. ALERT INSTANCE FACTORY
  // ==========================================================================

  private createAlertInstance(
    candidate: AlertCandidate,
    policy: MonitoringPolicy,
    monitor: InvestmentMonitor,
    reviewDraft: InvestmentMonitorReview | undefined,
    now: string
  ): AlertInstance {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const reviewUrgency = reviewDraft?.changeSummary?.recommendationReviewUrgency === 'IMMEDIATE' || reviewDraft?.changeSummary?.recommendedReviewCadence === 'EVENT_DRIVEN'
      ? 'IMMEDIATE'
      : (candidate.severity === 'CRITICAL' ? 'IMMEDIATE' : candidate.severity === 'HIGH' ? 'HIGH' : 'ROUTINE');

    const title = this.formatAlertTitle(candidate, monitor);
    const description = candidate.triggerEvidence;
    const deterministicExplanation = `[${candidate.severity}] ${candidate.ruleType} triggered on ${monitor.ticker} (${monitor.companyName}). Observed: "${candidate.observedValue}". Source: ${candidate.sourceReference}. Scope: ${policy.name}.`;

    const auditTrail: AlertAuditAction[] = [
      {
        action: 'GENERATED',
        timestamp: now,
        userId: candidate.userId,
        note: `Candidate generated by ${candidate.sourceType}`
      },
      {
        action: 'QUALIFIED',
        timestamp: now,
        userId: candidate.userId,
        note: `Qualified under policy "${policy.name}"`
      },
      {
        action: 'DELIVERED',
        timestamp: now,
        userId: candidate.userId,
        note: `Alert delivered to analyst attention queue`
      }
    ];

    return {
      alertId,
      candidateId: candidate.candidateId,
      policyId: policy.policyId,
      policyName: policy.name,
      monitorId: monitor.monitorId,
      securityId: monitor.securityId,
      symbol: monitor.ticker,
      companyName: monitor.companyName,
      portfolioId: candidate.portfolioId,
      userId: candidate.userId,
      ownerUserId: candidate.userId,
      ruleType: candidate.ruleType,
      severity: candidate.severity,
      status: 'DELIVERED',
      title,
      description,
      deterministicExplanation,
      contextualAnalysis: null,
      detectedAt: candidate.detectedAt,
      createdAt: now,
      deliveredAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      dismissedAt: null,
      fingerprint: candidate.fingerprint,
      trigger: {
        ruleType: candidate.ruleType,
        observedValue: candidate.observedValue,
        threshold: candidate.threshold,
        previousState: candidate.previousState,
        currentState: candidate.currentState,
        reason: candidate.triggerEvidence
      },
      provenance: {
        sourceType: candidate.sourceType,
        sourceReference: candidate.sourceReference,
        evidenceIds: [],
        epistemicStatus: candidate.epistemicStatus as any,
        isSimulated: candidate.isSimulated,
        market: monitor.market,
        retrievedAt: now
      },
      reviewReference: {
        monitorId: monitor.monitorId,
        reviewUrgency,
        reviewWorkspaceUrl: `/monitor/${monitor.monitorId}/review`
      },
      auditTrail,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  private formatAlertTitle(candidate: AlertCandidate, monitor: InvestmentMonitor): string {
    switch (candidate.ruleType) {
      case 'THESIS_INVALIDATION':
      case 'THESIS_INVALIDATED':
        return `Thesis Invalidation Guard Triggered: ${monitor.ticker}`;
      case 'THESIS_RECOVERY':
      case 'THESIS_RECOVERED':
        return `Thesis Invalidation Guard Recovered: ${monitor.ticker}`;
      case 'THESIS_CHANGE':
        return `Thesis Health Shift: ${monitor.ticker} is ${candidate.currentState}`;
      case 'DECISION_CHANGE':
        return `Investment Decision Delta: ${monitor.ticker} shifted to ${candidate.currentState}`;
      case 'SEC_FILING':
      case 'NEW_SEC_FILING':
        return `New SEC Regulatory Filing: ${monitor.ticker}`;
      case 'MATERIAL_INVESTMENT_EVENT':
        return `Material Investment Event: ${monitor.ticker}`;
      case 'EVIDENCE_CONFLICT':
        return `Evidence Conflict Detected: ${monitor.ticker}`;
      case 'PORTFOLIO_LOSS':
      case 'PORTFOLIO_CHANGE':
        return `Portfolio Exposure Delta: ${monitor.ticker}`;
      default:
        return `Monitoring Alert: ${monitor.ticker} (${candidate.ruleType})`;
    }
  }

  // ==========================================================================
  // 7. ANALYST WORKFLOW ACTIONS
  // ==========================================================================

  public async acknowledgeAlert(alertId: string, userId: string, note?: string): Promise<AlertInstance> {
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const alert = await alertRepo.get(alertId);
    if (!alert) {
      throw new AuthorizationError('Alert not found', 404);
    }
    if (alert.userId !== userId && alert.ownerUserId !== userId) {
      throw new AuthorizationError('Access denied: You do not own this alert', 403);
    }

    if (alert.status === 'RESOLVED' || alert.status === 'DISMISSED') {
      throw new Error(`Invalid lifecycle transition: Cannot acknowledge an alert with status ${alert.status}`);
    }

    const now = new Date().toISOString();
    const updatedTrail: AlertAuditAction[] = [
      ...(alert.auditTrail || []),
      {
        action: 'ACKNOWLEDGED',
        timestamp: now,
        userId,
        note: note || 'Analyst acknowledged alert'
      }
    ];

    const updated: AlertInstance = {
      ...alert,
      status: 'ACKNOWLEDGED',
      acknowledgedAt: now,
      auditTrail: updatedTrail
    };

    await alertRepo.save(updated);
    return updated;
  }

  public async openReviewForAlert(alertId: string, userId: string): Promise<AlertInstance> {
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const alert = await alertRepo.get(alertId);
    if (!alert) {
      throw new AuthorizationError('Alert not found', 404);
    }
    if (alert.userId !== userId && alert.ownerUserId !== userId) {
      throw new AuthorizationError('Access denied: You do not own this alert', 403);
    }

    const now = new Date().toISOString();
    const updatedTrail: AlertAuditAction[] = [
      ...(alert.auditTrail || []),
      {
        action: 'REVIEW_OPENED',
        timestamp: now,
        userId,
        note: 'Analyst navigated to Review Workspace from alert'
      }
    ];

    const updated: AlertInstance = {
      ...alert,
      auditTrail: updatedTrail
    };

    await alertRepo.save(updated);
    return updated;
  }

  public async dismissAlert(alertId: string, userId: string, note?: string): Promise<AlertInstance> {
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const alert = await alertRepo.get(alertId);
    if (!alert) {
      throw new AuthorizationError('Alert not found', 404);
    }
    if (alert.userId !== userId && alert.ownerUserId !== userId) {
      throw new AuthorizationError('Access denied: You do not own this alert', 403);
    }

    if (alert.status === 'RESOLVED') {
      throw new Error('Invalid lifecycle transition: Cannot dismiss an alert that is already RESOLVED');
    }

    const now = new Date().toISOString();
    const updatedTrail: AlertAuditAction[] = [
      ...(alert.auditTrail || []),
      {
        action: 'DISMISSED',
        timestamp: now,
        userId,
        note: note || 'Analyst dismissed alert'
      }
    ];

    const updated: AlertInstance = {
      ...alert,
      status: 'DISMISSED',
      dismissedAt: now,
      auditTrail: updatedTrail
    };

    await alertRepo.save(updated);
    return updated;
  }

  public async resolveAlert(alertId: string, userId: string, note?: string): Promise<AlertInstance> {
    const alertRepo = persistenceManager.getAlertOrchestrationRepository();
    const alert = await alertRepo.get(alertId);
    if (!alert) {
      throw new AuthorizationError('Alert not found', 404);
    }
    if (alert.userId !== userId && alert.ownerUserId !== userId) {
      throw new AuthorizationError('Access denied: You do not own this alert', 403);
    }

    if (alert.status === 'DISMISSED') {
      throw new Error('Invalid lifecycle transition: Cannot resolve an alert that is DISMISSED');
    }

    const now = new Date().toISOString();
    const updatedTrail: AlertAuditAction[] = [
      ...(alert.auditTrail || []),
      {
        action: 'RESOLVED',
        timestamp: now,
        userId,
        note: note || 'Analyst marked alert as resolved'
      }
    ];

    const updated: AlertInstance = {
      ...alert,
      status: 'RESOLVED',
      resolvedAt: now,
      auditTrail: updatedTrail
    };

    await alertRepo.save(updated);
    return updated;
  }
}

export const alertOrchestrationEngine = AlertOrchestrationEngine.getInstance();
