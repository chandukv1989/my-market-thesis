/**
 * Phase 35: Institutional Evidence Collection & Research Execution Ledger
 * 
 * Core Mission:
 * "For the research investigation we planned, what evidence was actually collected,
 * where did it come from, what did it establish or contradict, what remains missing,
 * and how did it change institutional knowledge?"
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Point-in-Time (PIT) zero lookahead.
 * - Multi-tenant IDOR protection (403 Forbidden).
 * - Native USD vs INR currency isolation.
 * - Hypotheses and synthetic assumptions NEVER become REAL evidence.
 * - Conflicting evidence is preserved deterministically; no autonomous reconciliation.
 * - Historical records and findings are immutable; revisions require supersession lineage.
 * - 100% deterministic template fallback when AI is unavailable.
 */

import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  EvidenceCollectionRecord,
  EvidenceResearchRelationship,
  EvidenceAuditRecord,
  EvidenceReconciliationResult,
  EvidenceOverview,
  CreateEvidenceCollectionRequest,
  ValidateEvidenceRequest,
  RejectEvidenceRequest,
  SupersedeEvidenceRequest,
  CollectionStatus,
  EvidenceSourceClass,
  EvidenceQualityGrade,
  EvidenceRelationshipType,
  EvidenceReconciliationState,
  EvidenceAuditAction,
  CanonicalSecurity,
  EpistemicStatus,
  ResearchQuestionEntry,
  ResearchGapRecord,
  InvestigationPlan,
  InvestigationTask,
  ResearchMemoryEntry
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { resolveSecurity, researchMemoryService } from '../memory/researchMemoryService';
import { researchQuestionService } from '../investigation/researchQuestionService';
import { researchGapDetectionService } from '../investigation/researchGapDetectionService';
import { investigationPlanService } from '../investigation/investigationPlanService';
import { AuthorizationError } from '../../auth/authorizationService';
import { aiCircuitBreaker } from '../ai/aiCircuitBreaker';
import { structuredLogger } from '../../logging/structuredLogger';

export class EvidenceCollectionService {
  private static instance: EvidenceCollectionService;
  private aiClient: GoogleGenAI | null = null;
  private readonly modelName = aiCircuitBreaker.getModelName();

  // Strict Lifecycle Transition Rules
  private readonly ALLOWED_TRANSITIONS: Record<CollectionStatus, CollectionStatus[]> = {
    DISCOVERED: ['REQUESTED', 'AVAILABLE', 'COLLECTED', 'UNAVAILABLE', 'REJECTED'],
    REQUESTED: ['AVAILABLE', 'COLLECTED', 'UNAVAILABLE', 'REJECTED'],
    AVAILABLE: ['COLLECTED', 'UNAVAILABLE', 'REJECTED', 'STALE'],
    COLLECTED: ['VALIDATED', 'REJECTED', 'CONFLICTING', 'STALE'],
    VALIDATED: ['VALIDATED', 'CONFLICTING', 'STALE', 'SUPERSEDED'],
    CONFLICTING: ['VALIDATED', 'SUPERSEDED', 'STALE'],
    STALE: ['SUPERSEDED'],
    REJECTED: ['REJECTED', 'SUPERSEDED'], // Terminal rejection unless explicitly superseded
    UNAVAILABLE: ['COLLECTED', 'SUPERSEDED'],
    SUPERSEDED: [] // Terminal supersession
  };

  public static getInstance(): EvidenceCollectionService {
    if (!EvidenceCollectionService.instance) {
      EvidenceCollectionService.instance = new EvidenceCollectionService();
    }
    return EvidenceCollectionService.instance;
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
   * Deterministically computes SHA-256 content hash.
   */
  public generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content || '').digest('hex');
  }

  /**
   * Deterministically computes source fingerprint from canonical metadata.
   */
  public generateSourceFingerprint(
    sourceType: string,
    publisher: string,
    reference: string,
    publishedAt: string
  ): string {
    const raw = `${sourceType.trim()}::${publisher.trim().toLowerCase()}::${reference.trim().toLowerCase()}::${publishedAt.trim()}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Deterministically derives evidence quality grade based on source class and status.
   */
  public deriveQualityGrade(sourceType: EvidenceSourceClass, status?: CollectionStatus): EvidenceQualityGrade {
    if (status === 'CONFLICTING') return 'CONFLICTING';
    if (status === 'STALE') return 'STALE';
    if (status === 'UNAVAILABLE') return 'UNAVAILABLE';

    switch (sourceType) {
      case 'SEC_FILING':
      case 'REGULATORY_FILING':
      case 'FINANCIAL_STATEMENT':
      case 'PRIMARY_DOCUMENT':
        return 'PRIMARY_VERIFIED';
      case 'COMPANY_DISCLOSURE':
      case 'EARNINGS_REPORT':
      case 'CORPORATE_ACTION':
      case 'MARKET_DATA':
      case 'INSTITUTIONAL_RESEARCH':
        return 'SECONDARY_CORROBORATED';
      case 'INTERNAL_RESEARCH':
        return 'INTERNAL_ANALYSIS';
      default:
        return 'UNVERIFIED';
    }
  }

  /**
   * Collects and registers an explicit evidence item in the institutional execution ledger.
   * Enforces deduplication via source fingerprinting.
   */
  public async collectEvidence(
    userId: string,
    req: CreateEvidenceCollectionRequest
  ): Promise<EvidenceCollectionRecord> {
    const resolved = resolveSecurity(req.securityId);
    if (!resolved) {
      throw new Error(`Security '${req.securityId}' cannot be resolved.`);
    }

    const asOfDate = req.asOfDate || new Date().toISOString().split('T')[0];
    const publishedAt = req.publishedAt;
    const availableAt = req.availableAt || publishedAt;
    const collectedAt = new Date().toISOString();
    const currency = (resolved.currency as 'USD' | 'INR') || (resolved.market === 'INDIA' ? 'INR' : 'USD');

    // Cryptographic hashes
    const content = req.rawContent || `${req.sourceTitle}\n${req.sourceReference}\n${req.findingsSummary || ''}`;
    const contentHash = this.generateContentHash(content);
    const sourceFingerprint = this.generateSourceFingerprint(
      req.sourceType,
      req.sourcePublisher,
      req.sourceReference,
      publishedAt
    );

    // Check for duplicate source in active status for this tenant
    const repo = persistenceManager.getEvidenceCollectionRepository();
    const existing = await repo.getBySourceFingerprint(sourceFingerprint, userId);
    if (existing) {
      structuredLogger.info(
        `[EvidenceCollectionService] Deduplication: Existing source matched fingerprint ${sourceFingerprint}.`,
        { metadata: { collectionId: existing.collectionId, securityId: resolved.id } }
      );
      return existing;
    }

    const cleanSec = resolved.id.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const cleanType = req.sourceType.toLowerCase();
    const collectionId = `col_${cleanSec}_${cleanType}_${asOfDate.replace(/-/g, '')}_${contentHash.substring(0, 10)}`;

    const collectionStatus: CollectionStatus = req.collectionStatus || 'COLLECTED';
    const qualityGrade: EvidenceQualityGrade = req.qualityGrade || this.deriveQualityGrade(req.sourceType, collectionStatus);
    const epistemicStatus: EpistemicStatus = (req.epistemicStatus as EpistemicStatus) || 'REAL';

    const record: EvidenceCollectionRecord = {
      collectionId,
      tenantId: userId,
      userId,
      securityId: resolved.id,
      ticker: resolved.symbol || (resolved as any).ticker,
      market: resolved.market as any,
      currency,
      monitorId: req.monitorId,
      planId: req.planId,
      taskId: req.taskId,
      questionId: req.questionId,
      gapId: req.gapId,

      sourceId: `src_${cleanType}_${contentHash.substring(0, 8)}`,
      sourceType: req.sourceType,
      sourceTitle: req.sourceTitle,
      sourcePublisher: req.sourcePublisher,
      sourceReference: req.sourceReference,
      sourceUrl: req.sourceUrl,

      publishedAt,
      availableAt,
      collectedAt,
      asOfDate,

      evidenceType: req.evidenceType || 'PRIMARY_FILING',
      epistemicStatus,
      collectionStatus,
      qualityGrade,

      contentHash,
      sourceFingerprint,
      rawSnippet: req.rawContent,
      findingsSummary: req.findingsSummary,

      supportsQuestion: req.supportsQuestion,
      contradictsQuestion: req.contradictsQuestion,
      supportsFinding: req.supportsFinding,
      contradictsFinding: req.contradictsFinding,
      relevance: req.relevance || 'Primary analytical corroboration for fundamental verification.',
      provenance: req.provenance || `${req.sourcePublisher} (${req.sourceReference}) published ${publishedAt}`,

      isAnalyticalOnly: true,
      executionProhibited: true
    };

    const saved = await repo.save(record);

    // Audit log
    await this.recordAudit(userId, {
      action: collectionStatus === 'DISCOVERED' ? 'DISCOVER' : 'COLLECT',
      collectionId: saved.collectionId,
      newState: collectionStatus,
      reason: req.findingsSummary || req.sourceTitle,
      asOfDate
    });

    // Auto-map relationships if workflow references provided
    if (req.questionId) {
      const relType: EvidenceRelationshipType = req.contradictsQuestion
        ? 'CONTRADICTS'
        : req.supportsQuestion
        ? 'SUPPORTS'
        : 'CONTEXTUALIZES';
      await this.attachEvidenceToQuestion(userId, saved.collectionId, req.questionId, relType, req.findingsSummary || 'Direct question evidence attachment', asOfDate);
    }

    if (req.gapId) {
      await this.attachEvidenceToGap(userId, saved.collectionId, req.gapId, 'SUPPORTS', 'Research gap evidence fulfillment', asOfDate);
    }

    if (req.taskId) {
      await this.attachEvidenceToTask(userId, saved.collectionId, req.taskId, req.planId || '', 'SUPPORTS', 'Investigation task evidence fulfillment', asOfDate);
    }

    return saved;
  }

  /**
   * Retrieves single evidence collection record with strict multi-tenant authorization.
   */
  public async getEvidence(userId: string, collectionId: string): Promise<EvidenceCollectionRecord> {
    const repo = persistenceManager.getEvidenceCollectionRepository();
    const record = await repo.get(collectionId);
    if (!record) {
      throw new AuthorizationError(`Evidence collection record '${collectionId}' not found.`, 404);
    }
    if (record.tenantId !== userId && record.userId !== userId) {
      throw new AuthorizationError(`Access denied: You do not own evidence collection record '${collectionId}'.`, 403);
    }
    return record;
  }

  /**
   * Retrieves evidence records with strict Point-In-Time zero lookahead and tenant isolation.
   */
  public async getEvidenceList(
    userId: string,
    filter?: {
      securityId?: string;
      planId?: string;
      taskId?: string;
      questionId?: string;
      gapId?: string;
      status?: CollectionStatus;
      sourceType?: EvidenceSourceClass;
      epistemicStatus?: EpistemicStatus;
      asOfDate?: string;
    }
  ): Promise<EvidenceCollectionRecord[]> {
    const repo = persistenceManager.getEvidenceCollectionRepository();
    let secId: string | undefined;
    if (filter?.securityId) {
      const resolved = resolveSecurity(filter.securityId);
      if (resolved) secId = resolved.id;
    }

    const list = await repo.getAll({
      securityId: secId,
      userId,
      tenantId: userId,
      planId: filter?.planId,
      taskId: filter?.taskId,
      questionId: filter?.questionId,
      gapId: filter?.gapId,
      status: filter?.status,
      sourceType: filter?.sourceType,
      epistemicStatus: filter?.epistemicStatus,
      asOfDate: filter?.asOfDate
    });

    return list;
  }

  /**
   * Validates an evidence record with strict state machine validation.
   */
  public async validateEvidence(
    userId: string,
    collectionId: string,
    req?: ValidateEvidenceRequest
  ): Promise<EvidenceCollectionRecord> {
    const existing = await this.getEvidence(userId, collectionId);
    this.assertValidTransition(existing.collectionStatus, 'VALIDATED');

    const asOf = req?.asOfDate || existing.asOfDate;
    const qualityGrade = req?.qualityGrade || this.deriveQualityGrade(existing.sourceType, 'VALIDATED');

    const updated: EvidenceCollectionRecord = {
      ...existing,
      collectionStatus: 'VALIDATED',
      qualityGrade,
      validationNotes: req?.validationNotes || 'Verified against primary filing standards.',
      supportsQuestion: req?.supportsQuestion !== undefined ? req.supportsQuestion : existing.supportsQuestion,
      contradictsQuestion: req?.contradictsQuestion !== undefined ? req.contradictsQuestion : existing.contradictsQuestion
    };

    const repo = persistenceManager.getEvidenceCollectionRepository();
    const saved = await repo.update(updated);

    await this.recordAudit(userId, {
      action: 'VALIDATE',
      collectionId: saved.collectionId,
      previousState: existing.collectionStatus,
      newState: 'VALIDATED',
      reason: req?.validationNotes,
      asOfDate: asOf
    });

    return saved;
  }

  /**
   * Rejects an evidence record with explicit rejection reason.
   */
  public async rejectEvidence(
    userId: string,
    collectionId: string,
    req: RejectEvidenceRequest
  ): Promise<EvidenceCollectionRecord> {
    const existing = await this.getEvidence(userId, collectionId);
    this.assertValidTransition(existing.collectionStatus, 'REJECTED');

    const asOf = req.asOfDate || existing.asOfDate;

    const updated: EvidenceCollectionRecord = {
      ...existing,
      collectionStatus: 'REJECTED',
      qualityGrade: 'UNVERIFIED',
      rejectionReason: req.rejectionReason
    };

    const repo = persistenceManager.getEvidenceCollectionRepository();
    const saved = await repo.update(updated);

    await this.recordAudit(userId, {
      action: 'REJECT',
      collectionId: saved.collectionId,
      previousState: existing.collectionStatus,
      newState: 'REJECTED',
      reason: req.rejectionReason,
      asOfDate: asOf
    });

    return saved;
  }

  /**
   * Supersedes an evidence record with an updated record, preserving historical immutability.
   */
  public async supersedeEvidence(
    userId: string,
    collectionId: string,
    req: SupersedeEvidenceRequest
  ): Promise<{ superseding: EvidenceCollectionRecord; historical: EvidenceCollectionRecord }> {
    const existing = await this.getEvidence(userId, collectionId);
    this.assertValidTransition(existing.collectionStatus, 'SUPERSEDED');

    const asOf = req.asOfDate || existing.asOfDate;
    const now = new Date().toISOString();

    // 1. Create superseding collection record
    const updatedContent = req.rawContent || `${req.sourceTitle || existing.sourceTitle}\n${req.sourceReference || existing.sourceReference}\n${req.findingsSummary || existing.findingsSummary || ''}`;
    const newContentHash = this.generateContentHash(updatedContent);

    const supersedingRecord: EvidenceCollectionRecord = {
      ...existing,
      collectionId: `col_${existing.securityId.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${existing.sourceType.toLowerCase()}_${asOf.replace(/-/g, '')}_${newContentHash.substring(0, 10)}`,
      sourceTitle: req.sourceTitle || existing.sourceTitle,
      sourcePublisher: req.sourcePublisher || existing.sourcePublisher,
      sourceReference: req.sourceReference || existing.sourceReference,
      sourceUrl: req.sourceUrl !== undefined ? req.sourceUrl : existing.sourceUrl,
      publishedAt: req.publishedAt || existing.publishedAt,
      availableAt: req.availableAt || existing.availableAt,
      collectedAt: now,
      asOfDate: asOf,
      contentHash: newContentHash,
      rawSnippet: req.rawContent || existing.rawSnippet,
      findingsSummary: req.findingsSummary || existing.findingsSummary,
      collectionStatus: 'VALIDATED',
      qualityGrade: this.deriveQualityGrade(existing.sourceType, 'VALIDATED'),
      supersedesCollectionId: existing.collectionId,
      supersessionReason: req.supersedingReason
    };

    // 2. Mark existing record as SUPERSEDED (preserving historical state)
    const updatedHistorical: EvidenceCollectionRecord = {
      ...existing,
      collectionStatus: 'SUPERSEDED',
      supersededByCollectionId: supersedingRecord.collectionId,
      supersessionReason: req.supersedingReason
    };

    const repo = persistenceManager.getEvidenceCollectionRepository();
    await repo.update(updatedHistorical);
    const savedSuperseding = await repo.save(supersedingRecord);

    await this.recordAudit(userId, {
      action: 'SUPERSEDE',
      collectionId: existing.collectionId,
      previousState: existing.collectionStatus,
      newState: 'SUPERSEDED',
      reason: req.supersedingReason,
      asOfDate: asOf
    });

    return {
      superseding: savedSuperseding,
      historical: updatedHistorical
    };
  }

  /**
   * Maps an evidence record to a Research Question.
   */
  public async attachEvidenceToQuestion(
    userId: string,
    collectionId: string,
    questionId: string,
    relationshipType: EvidenceRelationshipType,
    rationale: string,
    asOfDate?: string
  ): Promise<EvidenceResearchRelationship> {
    const evidence = await this.getEvidence(userId, collectionId);
    const question = await researchQuestionService.getQuestion(userId, questionId);

    const effectiveDate = asOfDate || evidence.asOfDate;
    const relRepo = persistenceManager.getEvidenceRelationshipRepository();

    const relationship: EvidenceResearchRelationship = {
      relationshipId: `rel_q_${collectionId}_${questionId}`,
      tenantId: userId,
      sourceId: collectionId,
      targetId: questionId,
      targetType: 'QUESTION',
      relationshipType,
      rationale,
      createdAt: new Date().toISOString(),
      asOfDate: effectiveDate,
      epistemicStatus: evidence.epistemicStatus as EpistemicStatus
    };

    const saved = await relRepo.save(relationship);

    // Update question's related evidence IDs
    const existingEvidence = question.relatedEvidenceIds || [];
    if (!existingEvidence.includes(collectionId)) {
      const updatedIds = [...existingEvidence, collectionId];
      await researchQuestionService.updateQuestionStatus(userId, questionId, question.status, {
        attachedEvidenceIds: updatedIds,
        reason: `Attached evidence ${collectionId} (${relationshipType}).`,
        asOfDate: effectiveDate
      });
    }

    await this.recordAudit(userId, {
      action: 'ATTACH_TO_QUESTION',
      collectionId,
      reason: `Attached to question ${questionId} as ${relationshipType}: ${rationale}`,
      asOfDate: effectiveDate
    });

    return saved;
  }

  /**
   * Maps an evidence record to a Research Gap.
   */
  public async attachEvidenceToGap(
    userId: string,
    collectionId: string,
    gapId: string,
    relationshipType: EvidenceRelationshipType,
    rationale: string,
    asOfDate?: string
  ): Promise<EvidenceResearchRelationship> {
    const evidence = await this.getEvidence(userId, collectionId);
    const gap = await researchGapDetectionService.getGap(userId, gapId);

    const effectiveDate = asOfDate || evidence.asOfDate;
    const relRepo = persistenceManager.getEvidenceRelationshipRepository();

    const relationship: EvidenceResearchRelationship = {
      relationshipId: `rel_gap_${collectionId}_${gapId}`,
      tenantId: userId,
      sourceId: collectionId,
      targetId: gapId,
      targetType: 'GAP',
      relationshipType,
      rationale,
      createdAt: new Date().toISOString(),
      asOfDate: effectiveDate,
      epistemicStatus: evidence.epistemicStatus as EpistemicStatus
    };

    const saved = await relRepo.save(relationship);

    // Update gap status if evidence is validated
    if (evidence.collectionStatus === 'VALIDATED') {
      await researchGapDetectionService.updateGapStatus(
        userId,
        gapId,
        'EVIDENCE_FOUND',
        `Validated evidence ${collectionId} attached: ${rationale}`,
        effectiveDate
      );
    }

    await this.recordAudit(userId, {
      action: 'ATTACH_TO_GAP',
      collectionId,
      reason: `Attached to gap ${gapId}: ${rationale}`,
      asOfDate: effectiveDate
    });

    return saved;
  }

  /**
   * Maps an evidence record to an Investigation Task.
   */
  public async attachEvidenceToTask(
    userId: string,
    collectionId: string,
    taskId: string,
    planId: string,
    relationshipType: EvidenceRelationshipType,
    rationale: string,
    asOfDate?: string
  ): Promise<EvidenceResearchRelationship> {
    const evidence = await this.getEvidence(userId, collectionId);
    const effectiveDate = asOfDate || evidence.asOfDate;
    const relRepo = persistenceManager.getEvidenceRelationshipRepository();

    const relationship: EvidenceResearchRelationship = {
      relationshipId: `rel_tsk_${collectionId}_${taskId}`,
      tenantId: userId,
      sourceId: collectionId,
      targetId: taskId,
      targetType: 'TASK',
      relationshipType,
      rationale,
      createdAt: new Date().toISOString(),
      asOfDate: effectiveDate,
      epistemicStatus: evidence.epistemicStatus as EpistemicStatus
    };

    const saved = await relRepo.save(relationship);

    // Attach to plan task
    if (planId) {
      try {
        const plan = await investigationPlanService.getPlan(userId, planId);
        const task = plan.tasks.find(t => t.taskId === taskId);
        if (task) {
          const currentAttached = task.attachedEvidenceIds || [];
          if (!currentAttached.includes(collectionId)) {
            await investigationPlanService.updateTaskStatus(userId, planId, taskId, task.status, {
              attachedEvidenceIds: [...currentAttached, collectionId],
              resolutionNotes: `Attached evidence ${collectionId}: ${rationale}`,
              asOfDate: effectiveDate
            });
          }
        }
      } catch (err: any) {
        structuredLogger.warn(`[EvidenceCollectionService] Could not update task attached evidence: ${err.message}`);
      }
    }

    await this.recordAudit(userId, {
      action: 'ATTACH_TO_TASK',
      collectionId,
      reason: `Attached to task ${taskId}: ${rationale}`,
      asOfDate: effectiveDate
    });

    return saved;
  }

  /**
   * Deterministically reconciles all evidence collected for a research question.
   *
   * Reconciliation Rules:
   * - Contradictory evidence exists -> CONFLICTING. Question status -> CONFLICTING.
   * - Only supporting evidence exists and count >= required -> CONVERGENT. Question status -> ANSWERED.
   * - Only supporting evidence exists and count < required -> PARTIAL. Question status -> PARTIALLY_ANSWERED.
   * - No validated evidence exists -> INSUFFICIENT.
   * - All evidence is unavailable -> UNAVAILABLE.
   */
  public async reconcileEvidenceForQuestion(
    userId: string,
    questionId: string,
    asOfDate?: string
  ): Promise<EvidenceReconciliationResult> {
    const question = await researchQuestionService.getQuestion(userId, questionId);
    const effectiveDate = asOfDate || question.asOfDate;

    // Get relationships for this question
    const relRepo = persistenceManager.getEvidenceRelationshipRepository();
    const relationships = await relRepo.getAll({
      targetId: questionId,
      tenantId: userId,
      asOfDate: effectiveDate
    });

    // Retrieve active evidence records (PIT zero lookahead)
    const evidenceList = await this.getEvidenceList(userId, {
      asOfDate: effectiveDate
    });

    const relevantEvidence = evidenceList.filter(e =>
      e.questionId === questionId ||
      relationships.some(r => r.sourceId === e.collectionId) ||
      (question.relatedEvidenceIds && question.relatedEvidenceIds.includes(e.collectionId))
    );

    const supportingEvidenceIds: string[] = [];
    const contradictingEvidenceIds: string[] = [];
    const partialEvidenceIds: string[] = [];
    const unavailableEvidenceIds: string[] = [];

    for (const ev of relevantEvidence) {
      if (ev.collectionStatus === 'UNAVAILABLE' || ev.epistemicStatus === 'UNAVAILABLE') {
        unavailableEvidenceIds.push(ev.collectionId);
        continue;
      }

      const rel = relationships.find(r => r.sourceId === ev.collectionId);
      const isContradictory =
        ev.contradictsQuestion === true ||
        rel?.relationshipType === 'CONTRADICTS' ||
        rel?.relationshipType === 'REFUTES';

      const isSupporting =
        ev.supportsQuestion === true ||
        rel?.relationshipType === 'SUPPORTS';

      const isPartial =
        rel?.relationshipType === 'PARTIALLY_SUPPORTS';

      if (isContradictory) {
        contradictingEvidenceIds.push(ev.collectionId);
      } else if (isSupporting) {
        supportingEvidenceIds.push(ev.collectionId);
      } else if (isPartial) {
        partialEvidenceIds.push(ev.collectionId);
      }
    }

    const requiredCount = question.requiredEvidenceCount || 2;
    let state: EvidenceReconciliationState = 'INSUFFICIENT';
    let conflictDescription: string | undefined;
    let resolutionRequired = false;
    let recommendedFollowup: string | undefined;

    if (contradictingEvidenceIds.length > 0) {
      state = 'CONFLICTING';
      resolutionRequired = true;
      conflictDescription = `Contradicting evidence identified between ${supportingEvidenceIds.length} supporting and ${contradictingEvidenceIds.length} contradictory sources regarding: "${question.question}".`;
      recommendedFollowup = 'Investigate primary SEC regulatory filings or audit footnotes to isolate reporting discrepancies.';

      // Deterministically update research question state to CONFLICTING
      try {
        await researchQuestionService.updateQuestionStatus(userId, questionId, 'CONFLICTING', {
          resolution: conflictDescription,
          reason: 'Evidence reconciliation detected contradictory filing disclosures.',
          asOfDate: effectiveDate
        });
      } catch {
        // Safe fallback
      }
    } else if (supportingEvidenceIds.length >= requiredCount) {
      state = 'CONVERGENT';
      resolutionRequired = false;

      // Update question to ANSWERED
      try {
        await researchQuestionService.updateQuestionStatus(userId, questionId, 'ANSWERED', {
          resolution: `Question answered with ${supportingEvidenceIds.length} verified supporting evidence sources.`,
          reason: 'Deterministic evidence convergence satisfied required threshold.',
          attachedEvidenceIds: supportingEvidenceIds,
          asOfDate: effectiveDate
        });
      } catch {
        // Safe fallback
      }
    } else if (supportingEvidenceIds.length > 0 || partialEvidenceIds.length > 0) {
      state = 'PARTIAL';
      resolutionRequired = false;

      // Update question to PARTIALLY_ANSWERED
      try {
        await researchQuestionService.updateQuestionStatus(userId, questionId, 'PARTIALLY_ANSWERED', {
          resolution: `Partially verified: ${supportingEvidenceIds.length} of ${requiredCount} required evidence sources collected.`,
          reason: 'Insufficient evidence volume for full thesis confirmation.',
          attachedEvidenceIds: [...supportingEvidenceIds, ...partialEvidenceIds],
          asOfDate: effectiveDate
        });
      } catch {
        // Safe fallback
      }
    } else if (unavailableEvidenceIds.length > 0 && relevantEvidence.length === unavailableEvidenceIds.length) {
      state = 'UNAVAILABLE';
      resolutionRequired = true;
      conflictDescription = 'Primary evidence sources are currently unavailable or non-existent in repositories.';
    }

    // Informational narrative synthesis (circuit breaker resilient)
    const synthesisNarrative = await this.generateReconciliationNarrative(
      question,
      state,
      supportingEvidenceIds.length,
      contradictingEvidenceIds.length,
      requiredCount,
      effectiveDate
    );

    return {
      questionId,
      securityId: question.securityId,
      ticker: question.ticker,
      asOfDate: effectiveDate,
      state,
      supportingEvidenceIds,
      contradictingEvidenceIds,
      partialEvidenceIds,
      missingEvidenceTypes: supportingEvidenceIds.length < requiredCount ? ['PRIMARY_FILING', 'SEC_FOOTNOTE'] : [],
      conflictDescription,
      resolutionRequired,
      recommendedFollowup,
      synthesisNarrative,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Evaluates research task completion strictly based on validated evidence.
   * AI narrative alone CANNOT complete a research task.
   */
  public async evaluateTaskCompletionWithEvidence(
    userId: string,
    planId: string,
    taskId: string,
    asOfDate?: string
  ): Promise<{ task: InvestigationTask; isCompleted: boolean; validatedEvidenceCount: number }> {
    const plan = await investigationPlanService.getPlan(userId, planId);
    const task = plan.tasks.find(t => t.taskId === taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found in plan '${planId}'.`);
    }

    const effectiveDate = asOfDate || plan.asOfDate;
    const evidenceList = await this.getEvidenceList(userId, {
      planId,
      taskId,
      status: 'VALIDATED',
      asOfDate: effectiveDate
    });

    const validatedCount = evidenceList.length;
    // Task requires at least 1 validated evidence item or matches required count
    const isCompleted = validatedCount >= (task.evidenceRequired.length || 1);

    if (isCompleted && task.status !== 'COMPLETED') {
      const updated = await investigationPlanService.updateTaskStatus(
        userId,
        planId,
        taskId,
        'COMPLETED',
        {
          resolutionNotes: `Task completed deterministically via ${validatedCount} validated primary evidence sources.`,
          attachedEvidenceIds: evidenceList.map(e => e.collectionId),
          asOfDate: effectiveDate
        }
      );
      return { task: updated, isCompleted: true, validatedEvidenceCount: validatedCount };
    }

    return { task, isCompleted: task.status === 'COMPLETED', validatedEvidenceCount: validatedCount };
  }

  /**
   * Commits a validated evidence finding into Phase 33 Institutional Research Memory.
   * Preserves exact source evidence IDs and immutability.
   */
  public async commitEvidenceFindingToMemory(
    userId: string,
    planId: string,
    finding: {
      title: string;
      summary: string;
      findingText: string;
      verifiedCollectionIds: string[];
      supersedesMemoryId?: string;
      supersedingReason?: string;
      asOfDate?: string;
    }
  ): Promise<{ plan: InvestigationPlan; memory: ResearchMemoryEntry }> {
    const plan = await investigationPlanService.getPlan(userId, planId);
    const effectiveDate = finding.asOfDate || plan.asOfDate;

    // Verify evidence items exist and are owned by user
    for (const cId of finding.verifiedCollectionIds) {
      await this.getEvidence(userId, cId);
    }

    // Call Phase 34 completeInvestigationAndRecordMemory
    const result = await investigationPlanService.completeInvestigationAndRecordMemory(
      userId,
      planId,
      {
        title: finding.title,
        summary: finding.summary,
        findingText: finding.findingText,
        verifiedEvidenceIds: finding.verifiedCollectionIds,
        supersedesMemoryId: finding.supersedesMemoryId,
        supersedingReason: finding.supersedingReason,
        asOfDate: effectiveDate
      }
    );

    // Record audit
    await this.recordAudit(userId, {
      action: 'COMMIT_FINDING',
      collectionId: finding.verifiedCollectionIds[0] || planId,
      reason: `Committed verified finding into Phase 33 Memory: ${finding.title}`,
      asOfDate: effectiveDate
    });

    return result;
  }

  /**
   * Generates comprehensive Evidence Overview for a security.
   */
  public async generateEvidenceOverview(
    userId: string,
    securityId: string,
    asOfDate?: string
  ): Promise<EvidenceOverview> {
    const resolved = resolveSecurity(securityId);
    if (!resolved) {
      throw new Error(`Security '${securityId}' cannot be resolved.`);
    }

    const effectiveDate = asOfDate || new Date().toISOString().split('T')[0];
    const currency = (resolved.currency as 'USD' | 'INR') || (resolved.market === 'INDIA' ? 'INR' : 'USD');

    const records = await this.getEvidenceList(userId, {
      securityId: resolved.id,
      asOfDate: effectiveDate
    });

    // Reconcile all questions for security
    const questions = await researchQuestionService.getQuestions(userId, {
      securityId: resolved.id,
      asOfDate: effectiveDate
    });

    const reconciliations: EvidenceReconciliationResult[] = [];
    for (const q of questions) {
      try {
        const res = await this.reconcileEvidenceForQuestion(userId, q.id, effectiveDate);
        reconciliations.push(res);
      } catch {
        // Safe fallback
      }
    }

    return {
      securityId: resolved.id,
      ticker: resolved.symbol || (resolved as any).ticker,
      market: resolved.market as any,
      currency,
      asOfDate: effectiveDate,
      totalCount: records.length,
      discoveredCount: records.filter(r => r.collectionStatus === 'DISCOVERED').length,
      collectedCount: records.filter(r => r.collectionStatus === 'COLLECTED').length,
      validatedCount: records.filter(r => r.collectionStatus === 'VALIDATED').length,
      conflictingCount: records.filter(r => r.collectionStatus === 'CONFLICTING').length,
      missingCount: reconciliations.reduce((acc, r) => acc + r.missingEvidenceTypes.length, 0),
      staleCount: records.filter(r => r.collectionStatus === 'STALE').length,
      unavailableCount: records.filter(r => r.collectionStatus === 'UNAVAILABLE').length,
      records,
      reconciliations,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }

  /**
   * Retrieves audit trail for an evidence collection record.
   */
  public async getEvidenceAuditTrail(
    userId: string,
    collectionId: string,
    asOfDate?: string
  ): Promise<EvidenceAuditRecord[]> {
    const auditRepo = persistenceManager.getEvidenceAuditRepository();
    const list = await auditRepo.getAll({
      collectionId,
      tenantId: userId,
      asOfDate
    });
    return list;
  }

  private assertValidTransition(current: CollectionStatus, next: CollectionStatus): void {
    const allowed = this.ALLOWED_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid evidence lifecycle transition from ${current} to ${next}.`);
    }
  }

  private async generateReconciliationNarrative(
    question: ResearchQuestionEntry,
    state: EvidenceReconciliationState,
    supportCount: number,
    contradictCount: number,
    requiredCount: number,
    asOfDate: string
  ): Promise<string> {
    const fallback = `Evidence reconciliation for inquiry "${question.question}" as of ${asOfDate} determined state: ${state}. Observed ${supportCount} supporting and ${contradictCount} contradictory source(s) against required threshold of ${requiredCount}.`;

    if (!aiCircuitBreaker.canExecuteAi()) {
      structuredLogger.info(
        '[EvidenceCollectionService] Institutional intelligence active (deterministic template fallback engaged).',
        { metadata: { service: 'EvidenceCollectionService', status: aiCircuitBreaker.getStatus().reason } }
      );
      return fallback;
    }

    try {
      const client = this.getClient();
      if (!client) return fallback;

      const prompt = `Synthesize an institutional evidence reconciliation brief.
Inquiry: ${question.question}
State: ${state}
Supporting Evidence: ${supportCount}
Contradicting Evidence: ${contradictCount}
Required Evidence: ${requiredCount}
As of date: ${asOfDate}
Output a concise 2-sentence analytical synthesis without making automated trade recommendations.`;

      const response = await client.models.generateContent({
        model: this.modelName,
        contents: prompt
      });

      const text = response.text?.trim();
      aiCircuitBreaker.recordSuccess();
      return text || fallback;
    } catch (err: any) {
      aiCircuitBreaker.handleAiError('EvidenceCollectionService', err);
      return fallback;
    }
  }

  private async recordAudit(
    userId: string,
    entry: Omit<EvidenceAuditRecord, 'auditId' | 'tenantId' | 'actorId' | 'timestamp'>
  ): Promise<void> {
    try {
      const auditRepo = persistenceManager.getEvidenceAuditRepository();
      await auditRepo.save({
        auditId: `aud_ev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId: userId,
        actorId: userId,
        timestamp: new Date().toISOString(),
        ...entry
      });
    } catch (err: any) {
      structuredLogger.warn(`[EvidenceCollectionService] Audit record logging failed: ${err.message}`);
    }
  }
}

export const evidenceCollectionService = EvidenceCollectionService.getInstance();
