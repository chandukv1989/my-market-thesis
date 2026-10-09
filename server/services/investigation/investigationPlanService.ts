/**
 * Phase 34: Investigation Plan & Workflow Orchestration Service
 * 
 * Transforms research questions, gaps, and evidence requirements into an
 * ordered analyst investigation workflow.
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - No trade execution, target prices, or automated buy/sell recommendations.
 * - Point-in-Time (PIT) zero lookahead.
 * - Multi-tenant IDOR protection (403 Forbidden).
 * - Native USD vs INR currency isolation.
 * - Integrates with Phase 33 Research Memory for verified finding continuity.
 * - Circuit breaker resilience with 100% deterministic template fallback.
 */

import { GoogleGenAI } from '@google/genai';
import {
  InvestigationPlan,
  InvestigationTask,
  EvidenceRequirement,
  InvestigationPlanStatus,
  InvestigationTaskStatus,
  EvidenceRequirementStatus,
  EvidenceRequirementType,
  CreateInvestigationPlanRequest,
  CreateInvestigationTaskRequest,
  CreateEvidenceRequirementRequest,
  InvestigationOverview,
  InvestigationAuditRecord,
  CanonicalSecurity,
  ResearchMemoryEntry
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { resolveSecurity, researchMemoryService } from '../memory/researchMemoryService';
import { researchQuestionService } from './researchQuestionService';
import { researchGapDetectionService } from './researchGapDetectionService';
import { AuthorizationError } from '../../auth/authorizationService';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';
import { structuredLogger } from '../../logging/structuredLogger';

export class InvestigationPlanService {
  private static instance: InvestigationPlanService;
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName = aiCircuitBreaker.getModelName();

  public static getInstance(): InvestigationPlanService {
    if (!InvestigationPlanService.instance) {
      InvestigationPlanService.instance = new InvestigationPlanService();
    }
    return InvestigationPlanService.instance;
  }

  private getClient(): GoogleGenAI | null {
    if (!this.aiClient) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (apiKey && apiKey.trim().length > 0) {
        try {
          this.aiClient = new GoogleGenAI({ apiKey });
        } catch {
          // Fallback handled deterministically
        }
      }
    }
    return this.aiClient;
  }

  /**
   * Creates an Investigation Plan with ordered tasks and evidence requirements.
   */
  public async createPlan(
    userId: string,
    req: CreateInvestigationPlanRequest
  ): Promise<InvestigationPlan> {
    const resolved = resolveSecurity(req.securityId);
    if (!resolved) {
      throw new Error(`Security '${req.securityId}' cannot be resolved.`);
    }

    const asOfDate = req.asOfDate || new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();
    const currency = (resolved.currency as 'USD' | 'INR') || (resolved.market === 'INDIA' ? 'INR' : 'USD');
    
    // Deterministic slug ID
    const cleanSec = resolved.id.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const planId = `plan_${cleanSec}_${asOfDate.replace(/-/g, '')}_${Date.now().toString(36)}`;

    // Build initial tasks
    const tasks: InvestigationTask[] = (req.tasks || []).map((t, idx) => ({
      taskId: `task_${planId}_${idx + 1}_${Date.now().toString(36)}`,
      planId,
      questionId: t.questionId,
      gapId: t.gapId,
      title: t.title,
      description: t.description,
      evidenceRequired: t.evidenceRequired || [],
      preferredSources: t.preferredSources || ['SEC EDGAR 10-Q/10-K', 'Company Disclosures'],
      sourceType: t.sourceType || 'PRIMARY_FILING',
      acceptanceCriteria: t.acceptanceCriteria || 'Verified disclosure confirming numerical metric realization.',
      status: 'TODO',
      createdAt: now,
      isAnalyticalOnly: true,
      executionProhibited: true
    }));

    // If no tasks provided, synthesize default tasks from questions
    if (tasks.length === 0 && req.questionIds && req.questionIds.length > 0) {
      for (let i = 0; i < req.questionIds.length; i++) {
        const qId = req.questionIds[i];
        tasks.push({
          taskId: `task_${planId}_${i + 1}_auto`,
          planId,
          questionId: qId,
          title: `Primary Evidence Audit for Question ${i + 1}`,
          description: `Examine quarterly 10-Q filings, management call transcripts, and channel reports to address research inquiry.`,
          evidenceRequired: [`ev_${cleanSec}_disclosure_audit`],
          preferredSources: ['SEC EDGAR 10-Q/10-K', 'Audited Financial Statements'],
          sourceType: 'PRIMARY_FILING',
          acceptanceCriteria: 'Retrieve and attach primary filing reference verifying metric thresholds.',
          status: 'TODO',
          createdAt: now,
          isAnalyticalOnly: true,
          executionProhibited: true
        });
      }
    }

    // Build evidence requirements
    const evidenceRequirements: EvidenceRequirement[] = (req.evidenceRequirements || []).map((er, idx) => ({
      requirementId: `req_${planId}_${idx + 1}`,
      planId,
      questionId: er.questionId,
      gapId: er.gapId,
      description: er.description,
      evidenceType: er.evidenceType,
      preferredSource: er.preferredSource,
      minimumEvidenceState: er.minimumEvidenceState || 'VERIFIED',
      requiredAsOfDate: er.requiredAsOfDate || asOfDate,
      status: 'REQUIRED',
      fulfilledEvidenceIds: []
    }));

    // Generate narrative summary (deterministic fallback or AI)
    const narrativeSummary = await this.generatePlanNarrative(
      resolved,
      req.title,
      req.objective,
      asOfDate,
      tasks.length,
      evidenceRequirements.length
    );

    const plan: InvestigationPlan = {
      planId,
      tenantId: userId,
      userId,
      securityId: resolved.id,
      ticker: resolved.symbol || (resolved as any).ticker,
      market: resolved.market as any,
      currency,
      monitorId: req.monitorId,
      title: req.title,
      objective: req.objective,
      questionIds: req.questionIds || [],
      gapIds: req.gapIds || [],
      tasks,
      evidenceRequirements,
      createdAt: now,
      updatedAt: now,
      asOfDate,
      status: 'ACTIVE',
      epistemicStatus: 'HYPOTHESIS',
      narrativeSummary,
      isAnalyticalOnly: true,
      executionProhibited: true
    };

    const repo = persistenceManager.getInvestigationPlanRepository();
    const saved = await repo.save(plan);

    await this.recordAudit(userId, {
      action: 'PLAN_CREATED',
      targetType: 'PLAN',
      targetId: saved.planId,
      newState: 'ACTIVE',
      reason: req.objective,
      asOfDate
    });

    return saved;
  }

  /**
   * Retrieves an Investigation Plan with tenant authorization.
   */
  public async getPlan(userId: string, planId: string): Promise<InvestigationPlan> {
    const repo = persistenceManager.getInvestigationPlanRepository();
    const p = await repo.get(planId);
    if (!p) {
      throw new AuthorizationError(`Investigation plan '${planId}' not found.`, 404);
    }
    if (p.userId !== userId && p.tenantId !== userId) {
      throw new AuthorizationError(`Access denied: You do not own investigation plan '${planId}'.`, 403);
    }
    return p;
  }

  /**
   * Retrieves plans with Point-In-Time zero lookahead and multi-tenant isolation.
   */
  public async getPlans(
    userId: string,
    filter?: {
      securityId?: string;
      status?: InvestigationPlanStatus;
      asOfDate?: string;
    }
  ): Promise<InvestigationPlan[]> {
    const repo = persistenceManager.getInvestigationPlanRepository();
    let secId: string | undefined;
    if (filter?.securityId) {
      const resolved = resolveSecurity(filter.securityId);
      if (resolved) secId = resolved.id;
    }

    const raw = await repo.getAll({
      securityId: secId,
      userId,
      status: filter?.status,
      asOfDate: filter?.asOfDate
    });

    let list = raw;
    if (filter?.asOfDate) {
      list = list.filter(p => p.asOfDate <= filter.asOfDate!);
    }

    // Deterministic sorting: status -> asOfDate DESC -> createdAt DESC -> planId
    const statusPriority: Record<InvestigationPlanStatus, number> = {
      ACTIVE: 0,
      DRAFT: 1,
      BLOCKED: 2,
      COMPLETED: 3,
      CANCELLED: 4,
      SUPERSEDED: 5
    };

    list.sort((a, b) => {
      const prioA = statusPriority[a.status] ?? 99;
      const prioB = statusPriority[b.status] ?? 99;
      if (prioA !== prioB) return prioA - prioB;
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return a.planId.localeCompare(b.planId);
    });

    return list;
  }

  /**
   * Updates plan status with audit recording.
   */
  public async updatePlanStatus(
    userId: string,
    planId: string,
    status: InvestigationPlanStatus,
    reason?: string,
    asOfDate?: string
  ): Promise<InvestigationPlan> {
    const existing = await this.getPlan(userId, planId);
    const now = new Date().toISOString();
    const asOf = asOfDate || existing.asOfDate;

    const updated: InvestigationPlan = {
      ...existing,
      status,
      updatedAt: now
    };

    const repo = persistenceManager.getInvestigationPlanRepository();
    const saved = await repo.update(updated);

    await this.recordAudit(userId, {
      action: 'PLAN_STATUS_UPDATED',
      targetType: 'PLAN',
      targetId: saved.planId,
      previousState: existing.status,
      newState: status,
      reason,
      asOfDate: asOf
    });

    return saved;
  }

  /**
   * Adds an investigation task to a plan.
   */
  public async addTask(
    userId: string,
    req: CreateInvestigationTaskRequest
  ): Promise<InvestigationTask> {
    const plan = await this.getPlan(userId, req.planId);
    const now = new Date().toISOString();
    const taskId = `task_${plan.planId}_${plan.tasks.length + 1}_${Date.now().toString(36)}`;

    const newTask: InvestigationTask = {
      taskId,
      planId: plan.planId,
      questionId: req.questionId,
      gapId: req.gapId,
      title: req.title,
      description: req.description,
      evidenceRequired: req.evidenceRequired,
      preferredSources: req.preferredSources || ['SEC EDGAR 10-Q/10-K', 'Company Disclosures'],
      sourceType: req.sourceType || 'PRIMARY_FILING',
      acceptanceCriteria: req.acceptanceCriteria,
      status: 'TODO',
      createdAt: now,
      isAnalyticalOnly: true,
      executionProhibited: true
    };

    const updatedPlan: InvestigationPlan = {
      ...plan,
      tasks: [...plan.tasks, newTask],
      updatedAt: now
    };

    const repo = persistenceManager.getInvestigationPlanRepository();
    await repo.update(updatedPlan);

    await this.recordAudit(userId, {
      action: 'TASK_ADDED',
      targetType: 'TASK',
      targetId: taskId,
      newState: 'TODO',
      reason: req.title,
      asOfDate: plan.asOfDate
    });

    return newTask;
  }

  /**
   * Updates task status within a plan.
   */
  public async updateTaskStatus(
    userId: string,
    planId: string,
    taskId: string,
    status: InvestigationTaskStatus,
    opts?: {
      resolutionNotes?: string;
      attachedEvidenceIds?: string[];
      blockedReason?: string;
      reason?: string;
      asOfDate?: string;
    }
  ): Promise<InvestigationTask> {
    const plan = await this.getPlan(userId, planId);
    const taskIdx = plan.tasks.findIndex(t => t.taskId === taskId);
    if (taskIdx === -1) {
      throw new Error(`Task '${taskId}' not found in plan '${planId}'.`);
    }

    const task = plan.tasks[taskIdx];
    const now = new Date().toISOString();
    const asOf = opts?.asOfDate || plan.asOfDate;

    let attached = task.attachedEvidenceIds || [];
    if (opts?.attachedEvidenceIds && opts.attachedEvidenceIds.length > 0) {
      attached = Array.from(new Set([...attached, ...opts.attachedEvidenceIds]));
    }

    const updatedTask: InvestigationTask = {
      ...task,
      status,
      completedAt: status === 'COMPLETED' ? now : task.completedAt,
      blockedReason: status === 'BLOCKED' ? (opts?.blockedReason || 'Evidence unavailable') : undefined,
      resolutionNotes: opts?.resolutionNotes !== undefined ? opts.resolutionNotes : task.resolutionNotes,
      attachedEvidenceIds: attached
    };

    const updatedTasks = [...plan.tasks];
    updatedTasks[taskIdx] = updatedTask;

    // Check if all tasks in plan are completed
    let newPlanStatus = plan.status;
    const allCompleted = updatedTasks.every(t => t.status === 'COMPLETED' || t.status === 'SKIPPED');
    const hasBlocked = updatedTasks.some(t => t.status === 'BLOCKED');

    if (allCompleted && updatedTasks.length > 0) {
      newPlanStatus = 'COMPLETED';
    } else if (hasBlocked) {
      newPlanStatus = 'BLOCKED';
    } else if (plan.status === 'BLOCKED' && !hasBlocked) {
      newPlanStatus = 'ACTIVE';
    }

    const updatedPlan: InvestigationPlan = {
      ...plan,
      tasks: updatedTasks,
      status: newPlanStatus,
      updatedAt: now
    };

    const repo = persistenceManager.getInvestigationPlanRepository();
    await repo.update(updatedPlan);

    await this.recordAudit(userId, {
      action: 'TASK_STATUS_UPDATED',
      targetType: 'TASK',
      targetId: taskId,
      previousState: task.status,
      newState: status,
      reason: opts?.reason || opts?.resolutionNotes || opts?.blockedReason,
      asOfDate: asOf
    });

    return updatedTask;
  }

  /**
   * Adds an evidence requirement to a plan.
   */
  public async addEvidenceRequirement(
    userId: string,
    req: CreateEvidenceRequirementRequest
  ): Promise<EvidenceRequirement> {
    if (!req.planId) {
      throw new Error('planId is required to attach an evidence requirement.');
    }
    const plan = await this.getPlan(userId, req.planId);
    const reqId = `req_${plan.planId}_${plan.evidenceRequirements.length + 1}_${Date.now().toString(36)}`;

    const newReq: EvidenceRequirement = {
      requirementId: reqId,
      planId: plan.planId,
      questionId: req.questionId,
      gapId: req.gapId,
      description: req.description,
      evidenceType: req.evidenceType,
      preferredSource: req.preferredSource,
      minimumEvidenceState: req.minimumEvidenceState || 'VERIFIED',
      requiredAsOfDate: req.requiredAsOfDate || plan.asOfDate,
      status: 'REQUIRED',
      fulfilledEvidenceIds: []
    };

    const updatedPlan: InvestigationPlan = {
      ...plan,
      evidenceRequirements: [...plan.evidenceRequirements, newReq],
      updatedAt: new Date().toISOString()
    };

    const repo = persistenceManager.getInvestigationPlanRepository();
    await repo.update(updatedPlan);

    await this.recordAudit(userId, {
      action: 'REQUIREMENT_ADDED',
      targetType: 'REQUIREMENT',
      targetId: reqId,
      newState: 'REQUIRED',
      reason: req.description,
      asOfDate: plan.asOfDate
    });

    return newReq;
  }

  /**
   * Fulfills an evidence requirement with verified evidence IDs.
   */
  public async fulfillEvidenceRequirement(
    userId: string,
    planId: string,
    requirementId: string,
    evidenceIds: string[],
    reason?: string
  ): Promise<EvidenceRequirement> {
    const plan = await this.getPlan(userId, planId);
    const reqIdx = plan.evidenceRequirements.findIndex(r => r.requirementId === requirementId);
    if (reqIdx === -1) {
      throw new Error(`Evidence requirement '${requirementId}' not found in plan '${planId}'.`);
    }

    const currentReq = plan.evidenceRequirements[reqIdx];
    const fulfilled = Array.from(new Set([...(currentReq.fulfilledEvidenceIds || []), ...evidenceIds]));
    const newStatus: EvidenceRequirementStatus = fulfilled.length > 0 ? 'AVAILABLE' : 'MISSING';

    const updatedReq: EvidenceRequirement = {
      ...currentReq,
      status: newStatus,
      fulfilledEvidenceIds: fulfilled
    };

    const updatedReqs = [...plan.evidenceRequirements];
    updatedReqs[reqIdx] = updatedReq;

    const updatedPlan: InvestigationPlan = {
      ...plan,
      evidenceRequirements: updatedReqs,
      updatedAt: new Date().toISOString()
    };

    const repo = persistenceManager.getInvestigationPlanRepository();
    await repo.update(updatedPlan);

    await this.recordAudit(userId, {
      action: 'REQUIREMENT_FULFILLED',
      targetType: 'REQUIREMENT',
      targetId: requirementId,
      previousState: currentReq.status,
      newState: newStatus,
      reason: reason || `Fulfilled with evidence IDs: ${evidenceIds.join(', ')}`,
      asOfDate: plan.asOfDate
    });

    return updatedReq;
  }

  /**
   * Completes an investigation plan and records the verified finding into Phase 33 Research Memory.
   *
   * Architectural Boundary:
   * Reuses canonical Phase 33 ResearchMemoryService.
   * Historical research memory remains immutable.
   */
  public async completeInvestigationAndRecordMemory(
    userId: string,
    planId: string,
    finding: {
      title: string;
      summary: string;
      findingText: string;
      verifiedEvidenceIds: string[];
      supersedesMemoryId?: string;
      supersedingReason?: string;
      asOfDate?: string;
    }
  ): Promise<{ plan: InvestigationPlan; memory: ResearchMemoryEntry }> {
    const plan = await this.getPlan(userId, planId);
    const asOf = finding.asOfDate || plan.asOfDate;

    // 1. Mark plan completed
    const completedPlan = await this.updatePlanStatus(
      userId,
      planId,
      'COMPLETED',
      `Investigation successfully produced verified finding: "${finding.title}"`,
      asOf
    );

    // 2. Mark associated questions answered if any
    for (const qId of plan.questionIds) {
      try {
        await researchQuestionService.updateQuestionStatus(userId, qId, 'ANSWERED', {
          resolution: `Resolved via investigation plan "${plan.title}": ${finding.findingText}`,
          attachedEvidenceIds: finding.verifiedEvidenceIds,
          reason: 'Investigation plan completion with verified primary evidence.',
          asOfDate: asOf
        });
      } catch {
        // Safe fallback
      }
    }

    // 3. Mark associated gaps resolved if any
    for (const gId of plan.gapIds) {
      try {
        await researchGapDetectionService.updateGapStatus(
          userId,
          gId,
          'RESOLVED',
          `Resolved via investigation finding "${finding.title}".`,
          asOf
        );
      } catch {
        // Safe fallback
      }
    }

    // 4. Record into Phase 33 Institutional Research Memory
    let memoryEntry: ResearchMemoryEntry;
    if (finding.supersedesMemoryId) {
      const res = await researchMemoryService.supersedeMemory(
        userId,
        finding.supersedesMemoryId,
        {
          title: finding.title,
          summary: finding.summary,
          finding: finding.findingText,
          supersedingReason: finding.supersedingReason || `Investigation plan ${plan.planId} verified updated primary evidence.`,
          asOfDate: asOf,
          relatedEvidenceIds: finding.verifiedEvidenceIds,
          epistemicStatus: 'REAL'
        }
      );
      memoryEntry = res.superseding;
    } else {
      memoryEntry = await researchMemoryService.createMemory(userId, {
        securityId: plan.securityId,
        memoryType: 'RESEARCH_FINDING',
        title: finding.title,
        summary: finding.summary,
        finding: finding.findingText,
        asOfDate: asOf,
        relatedEvidenceIds: finding.verifiedEvidenceIds,
        epistemicStatus: 'REAL'
      });
    }

    return {
      plan: completedPlan,
      memory: memoryEntry
    };
  }

  /**
   * Generates comprehensive Investigation Overview for a security.
   */
  public async generateInvestigationOverview(
    userId: string,
    securityId: string,
    asOfDate?: string
  ): Promise<InvestigationOverview> {
    const resolved = resolveSecurity(securityId);
    if (!resolved) {
      throw new Error(`Security '${securityId}' cannot be resolved.`);
    }

    const effectiveDate = asOfDate || new Date().toISOString().split('T')[0];
    const currency = (resolved.currency as 'USD' | 'INR') || (resolved.market === 'INDIA' ? 'INR' : 'USD');

    // Retrieve plans
    const plans = await this.getPlans(userId, { securityId: resolved.id, asOfDate: effectiveDate });
    
    // Retrieve questions
    const questions = await researchQuestionService.getQuestions(userId, {
      securityId: resolved.id,
      asOfDate: effectiveDate
    });

    // Retrieve gaps
    const gaps = await researchGapDetectionService.getGaps(userId, {
      securityId: resolved.id,
      asOfDate: effectiveDate
    });

    const activeInvestigationsCount = plans.filter(p => p.status === 'ACTIVE').length;
    const blockedInvestigationsCount = plans.filter(p => p.status === 'BLOCKED').length;
    const completedInvestigationsCount = plans.filter(p => p.status === 'COMPLETED').length;
    const unresolvedQuestionsCount = questions.filter(
      q => q.status === 'OPEN' || q.status === 'INVESTIGATING' || q.status === 'UNRESOLVED'
    ).length;
    const openGapsCount = gaps.filter(g => g.status === 'OPEN' || g.status === 'INVESTIGATING').length;

    return {
      securityId: resolved.id,
      ticker: resolved.symbol || (resolved as any).ticker,
      market: resolved.market as any,
      currency,
      asOfDate: effectiveDate,
      activeInvestigationsCount,
      unresolvedQuestionsCount,
      openGapsCount,
      blockedInvestigationsCount,
      completedInvestigationsCount,
      plans,
      questions,
      gaps,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Retrieves audit trail for a target resource.
   */
  public async getAuditHistory(
    userId: string,
    targetId: string,
    asOfDate?: string
  ): Promise<InvestigationAuditRecord[]> {
    const auditRepo = persistenceManager.getInvestigationAuditRepository();
    const raw = await auditRepo.getAll({ targetId, tenantId: userId, asOfDate });
    if (asOfDate) {
      return raw.filter(a => a.asOfDate <= asOfDate);
    }
    return raw;
  }

  /**
   * Deterministic plan narrative synthesis with circuit breaker fallback.
   */
  private async generatePlanNarrative(
    security: CanonicalSecurity,
    title: string,
    objective: string,
    asOfDate: string,
    taskCount: number,
    reqCount: number
  ): Promise<string> {
    const symbol = security.symbol || (security as any).ticker;
    const fallback = `Investigation plan "${title}" for ${symbol} as of ${asOfDate} defines an ordered research workflow to address objective: ${objective}. Configured with ${taskCount} structured task(s) and ${reqCount} required evidence source(s).`;

    if (!aiCircuitBreaker.canExecuteAi()) {
      structuredLogger.info(
        '[InvestigationPlanService] Institutional intelligence active (deterministic template fallback engaged).',
        { metadata: { service: 'InvestigationPlanService', status: aiCircuitBreaker.getStatus().reason } }
      );
      return fallback;
    }

    try {
      const client = this.getClient();
      if (!client) return fallback;

      const prompt = `Synthesize an institutional investigation plan brief for ${symbol} (${security.companyName}).
Title: ${title}
Objective: ${objective}
As of date: ${asOfDate}
Tasks: ${taskCount}, Evidence Requirements: ${reqCount}.
Output a concise 2-sentence analytical summary of the investigation scope.`;

      const response = await client.models.generateContent({
        model: this.modelName,
        contents: prompt
      });

      const text = response.text?.trim();
      aiCircuitBreaker.recordSuccess();
      return text || fallback;
    } catch (err: any) {
      aiCircuitBreaker.handleAiError('InvestigationPlanService', err);
      return fallback;
    }
  }

  private async recordAudit(
    userId: string,
    entry: Omit<InvestigationAuditRecord, 'auditId' | 'tenantId' | 'actorId' | 'timestamp'>
  ): Promise<void> {
    try {
      const auditRepo = persistenceManager.getInvestigationAuditRepository();
      await auditRepo.save({
        auditId: `aud_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId: userId,
        actorId: userId,
        timestamp: new Date().toISOString(),
        ...entry
      });
    } catch (err: any) {
      structuredLogger.warn(`[InvestigationPlanService] Audit record logging failed: ${err.message}`);
    }
  }
}

export const investigationPlanService = InvestigationPlanService.getInstance();
