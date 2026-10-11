/**
 * Phase 16: Disk-Backed Development Persistence Adapter
 * 
 * Provides robust persistence for the development environment.
 * Backed by atomic disk serialization to survive server restarts and process reinitializations.
 * 
 * Strict invariants:
 * - Accurately reports status: 'DEVELOPMENT_ADAPTER', provider: 'DISK_STORAGE'.
 * - NEVER claims to be PostgreSQL.
 * - Historical artifacts (Evidence, Snapshots, Decisions, Backtests) are immutable.
 * - Point-in-time filtering strictly respected.
 */

import { canRead, requireTenantScope } from '../../auth/accessPolicy';
import { isAvailableAsOf } from '../pit';

/** Phase 38.2B: an upsert may never change (or take over) the owner of an existing record. */
function assertSameOwner(existing: any, incoming: any, label: string): void {
  if (!existing) return;
  const a = existing.ownerUserId || existing.userId || existing.tenantId || '';
  const b = incoming.ownerUserId || incoming.userId || incoming.tenantId || '';
  if (a !== b) throw new Error(`${label} belongs to a different owner; overwrite refused.`);
}
import fs from 'fs';
import path from 'path';
import {
  IPersistenceAdapter,
  ISecurityRepository,
  IResearchDocumentRepository,
  IPersistentEvidenceRepository,
  IResearchNotebookRepository,
  IResearchSnapshotRepository,
  IDecisionRepository,
  IStrategyRepository,
  IBacktestRepository,
  IWatchlistRepository,
  IAlertRepository,
  IPortfolioRepository,
  IResearchQueryRepository,
  IUserRepository,
  ISessionRepository,
  IInvestmentEventRepository,
  IInvestmentMonitorRepository,
  IInvestmentMonitorReviewRepository,
  IMonitoringPolicyRepository,
  IAlertOrchestrationRepository,
  IResearchPriorityRepository,
  ICrossInvestmentSnapshotRepository,
  IPortfolioScenarioRepository,
  ICounterfactualRepository,
  IResearchMemoryRepository,
  IResearchQuestionRepository,
  IResearchGapRepository,
  IInvestigationPlanRepository,
  IInvestigationAuditRepository,
  IEvidenceCollectionRepository,
  IEvidenceRelationshipRepository,
  IEvidenceAuditRepository
} from '../types';
import {
  CanonicalSecurity,
  ResearchDocument,
  EvidenceItem,
  EvidenceFilter,
  ResearchNotebook,
  ResearchSnapshot,
  InvestmentDecisionAssessment,
  Strategy,
  BacktestResult,
  AlertItem,
  HoldingPosition,
  ResearchQueryItem,
  DocumentProcessingStatus,
  PersistenceStatusResponse,
  PersistenceStatusCode,
  PersistenceProviderType,
  User,
  AuthenticatedSession,
  InvestmentEvent,
  InvestmentMonitor,
  InvestmentMonitorReview,
  AnalystReviewNote,
  MonitoringPolicy,
  AlertInstance,
  AlertLifecycleStatus,
  AlertSeverity,
  AlertRuleType,
  ResearchPrioritySnapshot,
  CrossInvestmentSnapshot,
  PortfolioScenarioSnapshot,
  CounterfactualSnapshot,
  ResearchMemoryEntry,
  ResearchQuestionEntry,
  ResearchMemoryType,
  ResearchMemoryStatus,
  ResearchQuestionStatus,
  ResearchGapRecord,
  InvestigationPlan,
  InvestigationAuditRecord,
  ResearchGapStatus,
  InvestigationPlanStatus,
  ResearchGapType,
  EvidenceCollectionRecord,
  EvidenceResearchRelationship,
  EvidenceAuditRecord,
  CollectionStatus,
  EvidenceSourceClass,
  EvidenceRelationshipType,
  EvidenceAuditAction,
  EpistemicStatus
} from '../../../src/types';

interface PersistentStoreState {
  version: number;
  lastPersistedAt: string;
  securities: Record<string, CanonicalSecurity>;
  documents: Record<string, ResearchDocument>;
  evidence: Record<string, EvidenceItem>;
  notebooks: Record<string, ResearchNotebook>;
  snapshots: Record<string, ResearchSnapshot>;
  decisions: Record<string, InvestmentDecisionAssessment>;
  strategies: Record<string, Strategy>;
  backtests: Record<string, BacktestResult>;
  watchlists: Record<string, string[]>;
  alerts: Record<string, AlertItem>;
  portfolio: Record<string, HoldingPosition[]>;
  queries: Record<string, ResearchQueryItem>;
  users: Record<string, User>;
  sessions: Record<string, AuthenticatedSession>;
  events: Record<string, InvestmentEvent>;
  monitors: Record<string, InvestmentMonitor>;
  monitorReviews: Record<string, InvestmentMonitorReview>;
  analystNotes: Record<string, AnalystReviewNote[]>;
  monitoringPolicies: Record<string, MonitoringPolicy>;
  orchestratedAlerts: Record<string, AlertInstance>;
  researchPriorities: Record<string, ResearchPrioritySnapshot>;
  crossInvestmentSnapshots?: Record<string, CrossInvestmentSnapshot>;
  portfolioScenarioSnapshots?: Record<string, PortfolioScenarioSnapshot>;
  counterfactualSnapshots?: Record<string, CounterfactualSnapshot>;
  researchMemories?: Record<string, ResearchMemoryEntry>;
  researchQuestions?: Record<string, ResearchQuestionEntry>;
  researchGaps?: Record<string, ResearchGapRecord>;
  investigationPlans?: Record<string, InvestigationPlan>;
  investigationAudits?: Record<string, InvestigationAuditRecord>;
  evidenceCollections?: Record<string, EvidenceCollectionRecord>;
  evidenceRelationships?: Record<string, EvidenceResearchRelationship>;
  evidenceAudits?: Record<string, EvidenceAuditRecord>;
}

export class DevelopmentPersistenceAdapter implements IPersistenceAdapter {
  public readonly status: PersistenceStatusCode = 'DEVELOPMENT_ADAPTER';
  public readonly provider: PersistenceProviderType = 'DISK_STORAGE';
  public isConnected = true;

  private storageDir: string;
  private storageFile: string;
  private state: PersistentStoreState;

  private securityRepo: ISecurityRepository;
  private documentRepo: IResearchDocumentRepository;
  private evidenceRepo: IPersistentEvidenceRepository;
  private notebookRepo: IResearchNotebookRepository;
  private snapshotRepo: IResearchSnapshotRepository;
  private decisionRepo: IDecisionRepository;
  private strategyRepo: IStrategyRepository;
  private backtestRepo: IBacktestRepository;
  private watchlistRepo: IWatchlistRepository;
  private alertRepo: IAlertRepository;
  private portfolioRepo: IPortfolioRepository;
  private queryRepo: IResearchQueryRepository;
  private userRepo: IUserRepository;
  private sessionRepo: ISessionRepository;
  private eventRepo: IInvestmentEventRepository;
  private monitorRepo: IInvestmentMonitorRepository;
  private monitorReviewRepo: IInvestmentMonitorReviewRepository;
  private policyRepo: IMonitoringPolicyRepository;
  private alertOrchestrationRepo: IAlertOrchestrationRepository;
  private researchPriorityRepo: IResearchPriorityRepository;
  private crossInvestmentSnapshotRepo: ICrossInvestmentSnapshotRepository;
  private portfolioScenarioRepo: IPortfolioScenarioRepository;
  private counterfactualRepo: ICounterfactualRepository;
  private researchMemoryRepo: IResearchMemoryRepository;
  private researchQuestionRepo: IResearchQuestionRepository;
  private researchGapRepo: IResearchGapRepository;
  private investigationPlanRepo: IInvestigationPlanRepository;
  private investigationAuditRepo: IInvestigationAuditRepository;
  private evidenceCollectionRepo: IEvidenceCollectionRepository;
  private evidenceRelationshipRepo: IEvidenceRelationshipRepository;
  private evidenceAuditRepo: IEvidenceAuditRepository;

  constructor(customStorageDir?: string) {
    this.storageDir = customStorageDir || path.resolve(process.cwd(), 'data', 'persistence');
    this.storageFile = path.join(this.storageDir, 'store.json');

    this.state = this.createEmptyState();

    // Initialize repositories
    this.securityRepo = this.createSecurityRepo();
    this.documentRepo = this.createDocumentRepo();
    this.evidenceRepo = this.createEvidenceRepo();
    this.notebookRepo = this.createNotebookRepo();
    this.snapshotRepo = this.createSnapshotRepo();
    this.decisionRepo = this.createDecisionRepo();
    this.strategyRepo = this.createStrategyRepo();
    this.backtestRepo = this.createBacktestRepo();
    this.watchlistRepo = this.createWatchlistRepo();
    this.alertRepo = this.createAlertRepo();
    this.portfolioRepo = this.createPortfolioRepo();
    this.queryRepo = this.createQueryRepo();
    this.userRepo = this.createUserRepo();
    this.sessionRepo = this.createSessionRepo();
    this.eventRepo = this.createEventRepo();
    this.monitorRepo = this.createMonitorRepo();
    this.monitorReviewRepo = this.createMonitorReviewRepo();
    this.policyRepo = this.createPolicyRepo();
    this.alertOrchestrationRepo = this.createAlertOrchestrationRepo();
    this.researchPriorityRepo = this.createResearchPriorityRepo();
    this.crossInvestmentSnapshotRepo = this.createCrossInvestmentSnapshotRepo();
    this.portfolioScenarioRepo = this.createPortfolioScenarioRepo();
    this.counterfactualRepo = this.createCounterfactualRepo();
    this.researchMemoryRepo = this.createResearchMemoryRepo();
    this.researchQuestionRepo = this.createResearchQuestionRepo();
    this.researchGapRepo = this.createResearchGapRepo();
    this.investigationPlanRepo = this.createInvestigationPlanRepo();
    this.investigationAuditRepo = this.createInvestigationAuditRepo();
    this.evidenceCollectionRepo = this.createEvidenceCollectionRepo();
    this.evidenceRelationshipRepo = this.createEvidenceRelationshipRepo();
    this.evidenceAuditRepo = this.createEvidenceAuditRepo();
  }

  private createEmptyState(): PersistentStoreState {
    return {
      version: 1,
      lastPersistedAt: new Date().toISOString(),
      securities: {},
      documents: {},
      evidence: {},
      notebooks: {},
      snapshots: {},
      decisions: {},
      strategies: {},
      backtests: {},
      watchlists: { default: [] },
      alerts: {},
      portfolio: { default: [] },
      queries: {},
      users: {},
      sessions: {},
      events: {},
      monitors: {},
      monitorReviews: {},
      analystNotes: {},
      monitoringPolicies: {},
      orchestratedAlerts: {},
      researchPriorities: {},
      crossInvestmentSnapshots: {},
      portfolioScenarioSnapshots: {},
      counterfactualSnapshots: {},
      researchMemories: {},
      researchQuestions: {},
      researchGaps: {},
      investigationPlans: {},
      investigationAudits: {},
      evidenceCollections: {},
      evidenceRelationships: {},
      evidenceAudits: {}
    };
  }

  public async initialize(): Promise<void> {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          this.state = {
            ...this.createEmptyState(),
            ...parsed
          };
        }
      } else {
        this.flushToDisk();
      }
      this.isConnected = true;
    } catch (err) {
      console.error('[DevelopmentPersistenceAdapter] Failed to load store:', err);
      this.state = this.createEmptyState();
      this.isConnected = true;
    }
  }

  public async shutdown(): Promise<void> {
    this.flushToDisk();
  }

  public async healthCheck(): Promise<boolean> {
    return this.isConnected;
  }

  public async runTransaction<T>(work: () => Promise<T>): Promise<T> {
    // Development adapter executes work and flushes on success
    const result = await work();
    this.flushToDisk();
    return result;
  }

  public flushToDisk(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      this.state.lastPersistedAt = new Date().toISOString();
      const tmpFile = `${this.storageFile}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tmpFile, this.storageFile);
    } catch (err) {
      console.error('[DevelopmentPersistenceAdapter] Flush failed:', err);
    }
  }

  public clearAll(): void {
    this.state = this.createEmptyState();
    this.flushToDisk();
  }

  public getSecurityRepository(): ISecurityRepository { return this.securityRepo; }
  public getDocumentRepository(): IResearchDocumentRepository { return this.documentRepo; }
  public getEvidenceRepository(): IPersistentEvidenceRepository { return this.evidenceRepo; }
  public getNotebookRepository(): IResearchNotebookRepository { return this.notebookRepo; }
  public getSnapshotRepository(): IResearchSnapshotRepository { return this.snapshotRepo; }
  public getDecisionRepository(): IDecisionRepository { return this.decisionRepo; }
  public getStrategyRepository(): IStrategyRepository { return this.strategyRepo; }
  public getBacktestRepository(): IBacktestRepository { return this.backtestRepo; }
  public getWatchlistRepository(): IWatchlistRepository { return this.watchlistRepo; }
  public getAlertRepository(): IAlertRepository { return this.alertRepo; }
  public getPortfolioRepository(): IPortfolioRepository { return this.portfolioRepo; }
  public getQueryRepository(): IResearchQueryRepository { return this.queryRepo; }
  public getUserRepository(): IUserRepository { return this.userRepo; }
  public getSessionRepository(): ISessionRepository { return this.sessionRepo; }
  public getEventRepository(): IInvestmentEventRepository { return this.eventRepo; }
  public getMonitorRepository(): IInvestmentMonitorRepository { return this.monitorRepo; }
  public getMonitorReviewRepository(): IInvestmentMonitorReviewRepository { return this.monitorReviewRepo; }
  public getPolicyRepository(): IMonitoringPolicyRepository { return this.policyRepo; }
  public getAlertOrchestrationRepository(): IAlertOrchestrationRepository { return this.alertOrchestrationRepo; }
  public getResearchPriorityRepository(): IResearchPriorityRepository { return this.researchPriorityRepo; }
  public getCrossInvestmentSnapshotRepository(): ICrossInvestmentSnapshotRepository { return this.crossInvestmentSnapshotRepo; }
  public getPortfolioScenarioRepository(): IPortfolioScenarioRepository { return this.portfolioScenarioRepo; }
  public getCounterfactualRepository(): ICounterfactualRepository { return this.counterfactualRepo; }
  public getResearchMemoryRepository(): IResearchMemoryRepository { return this.researchMemoryRepo; }
  public getResearchQuestionRepository(): IResearchQuestionRepository { return this.researchQuestionRepo; }
  public getResearchGapRepository(): IResearchGapRepository { return this.researchGapRepo; }
  public getInvestigationPlanRepository(): IInvestigationPlanRepository { return this.investigationPlanRepo; }
  public getInvestigationAuditRepository(): IInvestigationAuditRepository { return this.investigationAuditRepo; }
  public getEvidenceCollectionRepository(): IEvidenceCollectionRepository { return this.evidenceCollectionRepo; }
  public getEvidenceRelationshipRepository(): IEvidenceRelationshipRepository { return this.evidenceRelationshipRepo; }
  public getEvidenceAuditRepository(): IEvidenceAuditRepository { return this.evidenceAuditRepo; }

  public getStorageDir(): string {
    return this.storageDir;
  }

  public async getStatus(): Promise<PersistenceStatusResponse> {
    return {
      status: 'DEVELOPMENT_ADAPTER',
      provider: 'DISK_STORAGE',
      environment: process.env.NODE_ENV || 'development',
      isPostgresConfigured: false,
      migrationVersion: this.state.version,
      entityCounts: {
        securities: Object.keys(this.state.securities).length,
        documents: Object.keys(this.state.documents).length,
        evidence: Object.keys(this.state.evidence).length,
        notebooks: Object.keys(this.state.notebooks).length,
        snapshots: Object.keys(this.state.snapshots).length,
        decisions: Object.keys(this.state.decisions).length,
        strategies: Object.keys(this.state.strategies).length,
        backtests: Object.keys(this.state.backtests).length,
        alerts: Object.keys(this.state.alerts).length,
        queries: Object.keys(this.state.queries).length,
        events: this.state.events ? Object.keys(this.state.events).length : 0,
        monitors: this.state.monitors ? Object.keys(this.state.monitors).length : 0,
        reviews: this.state.monitorReviews ? Object.keys(this.state.monitorReviews).length : 0,
        policies: this.state.monitoringPolicies ? Object.keys(this.state.monitoringPolicies).length : 0,
        orchestratedAlerts: this.state.orchestratedAlerts ? Object.keys(this.state.orchestratedAlerts).length : 0,
        researchPriorities: this.state.researchPriorities ? Object.keys(this.state.researchPriorities).length : 0,
        researchMemories: this.state.researchMemories ? Object.keys(this.state.researchMemories).length : 0,
        researchQuestions: this.state.researchQuestions ? Object.keys(this.state.researchQuestions).length : 0,
        researchGaps: this.state.researchGaps ? Object.keys(this.state.researchGaps).length : 0,
        investigationPlans: this.state.investigationPlans ? Object.keys(this.state.investigationPlans).length : 0,
        investigationAudits: this.state.investigationAudits ? Object.keys(this.state.investigationAudits).length : 0
      },
      details: {
        diskBacked: true,
        storagePath: this.storageFile,
        schemaVersion: '1.0.0',
        lastPersistedAt: this.state.lastPersistedAt
      }
    };
  }

  // --- REPOSITORY FACTORIES ---

  private createSecurityRepo(): ISecurityRepository {
    return {
      get: async (id: string) => this.state.securities[id] || null,
      getByTicker: async (ticker: string, market?: string) => {
        const t = ticker.toUpperCase();
        const found = Object.values(this.state.securities).find(s =>
          s.ticker.toUpperCase() === t && (!market || s.market.toUpperCase() === market.toUpperCase())
        );
        return found || null;
      },
      getAll: async () => Object.values(this.state.securities),
      save: async (sec: CanonicalSecurity) => {
        this.state.securities[sec.id] = { ...sec };
        this.flushToDisk();
        return this.state.securities[sec.id];
      },
      saveMany: async (securities: CanonicalSecurity[]) => {
        for (const sec of securities) {
          this.state.securities[sec.id] = { ...sec };
        }
        this.flushToDisk();
        return securities.length;
      },
      count: async () => Object.keys(this.state.securities).length
    };
  }

  private createDocumentRepo(): IResearchDocumentRepository {
    return {
      get: async (id: string) => this.state.documents[id] || null,
      getByHash: async (hash: string) => {
        // NOTE: returns the first match across owners; callers needing tenant-safe dedup use save()'s per-owner check.
        return Object.values(this.state.documents).find(d => d.contentHash === hash) || null;
      },
      getAll: async (filter?: { securityId?: string; documentType?: string }) => {
        let docs = Object.values(this.state.documents);
        if (filter?.documentType) {
          docs = docs.filter(d => d.documentType === filter.documentType);
        }
        if (filter?.securityId) {
          docs = docs.filter(d => d.securityId === filter.securityId || (d as any).securityAssociations?.some((s: any) => s.securityId === filter.securityId));
        }
        return docs;
      },
      save: async (doc: ResearchDocument) => {
        // Phase 38.2B: duplicate detection is per owner (identical content from another tenant is NOT a duplicate)
        const ownerKey = (d: any) => d.ownerUserId || d.userId || '';
        const existing = Object.values(this.state.documents).find(d => d.contentHash === doc.contentHash && ownerKey(d) === ownerKey(doc));
        if (existing) {
          return { saved: false, isDuplicate: true, document: existing };
        }
        this.state.documents[doc.documentId] = { ...doc };
        this.flushToDisk();
        return { saved: true, isDuplicate: false, document: this.state.documents[doc.documentId] };
      },
      updateStatus: async (documentId: string, status: DocumentProcessingStatus, metadata?: any) => {
        if (!this.state.documents[documentId]) return false;
        this.state.documents[documentId].processingStatus = status;
        if (metadata) {
          this.state.documents[documentId].metadata = {
            ...this.state.documents[documentId].metadata,
            ...metadata
          };
        }
        this.flushToDisk();
        return true;
      },
      deleteForOwner: async (documentId: string, ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        const doc: any = this.state.documents[documentId];
        if (!doc || (doc.ownerUserId || doc.userId) !== scope) return false;
        delete this.state.documents[documentId];
        this.flushToDisk();
        return true;
      },
      getAllForOwner: async (ownerUserId: string, filter?: { securityId?: string; documentType?: string }) => {
        const scope = requireTenantScope(ownerUserId);
        let docs = Object.values(this.state.documents).filter(d => canRead(d as any, scope));
        if (filter?.documentType) {
          docs = docs.filter(d => d.documentType === filter.documentType);
        }
        if (filter?.securityId) {
          docs = docs.filter(d => d.securityId === filter.securityId || (d as any).securityAssociations?.some((x: any) => x.securityId === filter.securityId));
        }
        return docs;
      },
      count: async () => Object.keys(this.state.documents).length
    };
  }

  private createEvidenceRepo(): IPersistentEvidenceRepository {
    return {
      addEvidence: async (item: EvidenceItem) => {
        if (!item || !item.evidenceId) return false;
        if (this.state.evidence[item.evidenceId]) {
          return false; // Immutable
        }
        this.state.evidence[item.evidenceId] = { ...item };
        this.flushToDisk();
        return true;
      },
      getEvidence: async (id: string) => this.state.evidence[id] || null,
      get: async (id: string) => this.state.evidence[id] || null,
      queryEvidence: async (filter: EvidenceFilter) => {
        let items = Object.values(this.state.evidence);
        if (filter.securityId) {
          items = items.filter(e => e.securityId === filter.securityId);
        }
        if (filter.sourceType) {
          const types = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
          items = items.filter(e => types.includes(e.sourceType));
        }
        if (filter.epistemicStatus) {
          const statuses = Array.isArray(filter.epistemicStatus) ? filter.epistemicStatus : [filter.epistemicStatus];
          items = items.filter(e => statuses.includes(e.epistemicStatus));
        }
        if (filter.asOfDate) {
          // Shared PIT rule: date-only = end of day inclusive; undated evidence is never "available as of" a date.
          items = items.filter(e => isAvailableAsOf(e.publishedAt, filter.asOfDate));
        }
        return items;
      },
      deleteForOwner: async (evidenceId: string, ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        const ev: any = this.state.evidence[evidenceId];
        if (!ev || (ev.ownerUserId || ev.userId) !== scope) return false;
        delete this.state.evidence[evidenceId];
        this.flushToDisk();
        return true;
      },
      queryEvidenceForOwner: async (ownerUserId: string, filter: EvidenceFilter) => {
        const scope = requireTenantScope(ownerUserId);
        const items = await this.evidenceRepo.queryEvidence(filter);
        return items.filter(e => canRead(e as any, scope));
      },
      getHistoricalEvidence: async (id: string, asOfDate?: string) => {
        const item = this.state.evidence[id];
        if (!item) return null;
        if (asOfDate && !isAvailableAsOf(item.publishedAt, asOfDate)) {
          return null;
        }
        return item;
      },
      getEvidenceLineage: async (id: string) => {
        const item = this.state.evidence[id];
        return item ? [item] : [];
      },
      count: async () => Object.keys(this.state.evidence).length,
      getAll: async () => Object.values(this.state.evidence)
    };
  }

  private createNotebookRepo(): IResearchNotebookRepository {
    return {
      get: async (id: string) => this.state.notebooks[id] || null,
      getBySecurityId: async (securityId: string) => {
        const found = Object.values(this.state.notebooks).find(nb => nb.securityId === securityId || (nb as any).security?.id === securityId);
        return found || null;
      },
      save: async (notebook: ResearchNotebook) => {
        assertSameOwner(this.state.notebooks[notebook.notebookId], notebook, `Notebook "${notebook.notebookId}"`);
        this.state.notebooks[notebook.notebookId] = { ...notebook };
        this.flushToDisk();
        return this.state.notebooks[notebook.notebookId];
      },
      getAll: async () => Object.values(this.state.notebooks),
      getAllForOwner: async (ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        return Object.values(this.state.notebooks).filter(n => canRead(n as any, scope));
      },
      count: async () => Object.keys(this.state.notebooks).length
    };
  }

  private createSnapshotRepo(): IResearchSnapshotRepository {
    return {
      get: async (id: string) => this.state.snapshots[id] || null,
      getByNotebookId: async (notebookId: string) => {
        return Object.values(this.state.snapshots).filter(s => s.notebookId === notebookId);
      },
      getBySecurityId: async (securityId: string) => {
        return Object.values(this.state.snapshots).filter(s => s.securityId === securityId);
      },
      getBySecurityIdForOwner: async (securityId: string, ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        return Object.values(this.state.snapshots).filter(s => s.securityId === securityId && canRead(s as any, scope));
      },
      getLatest: async (securityId: string, asOfDate?: string) => {
        let snaps = Object.values(this.state.snapshots).filter(s => s.securityId === securityId);
        if (asOfDate) {
          snaps = snaps.filter(s => (s.researchAsOfDate || (s as any).asOfDate) <= asOfDate);
        }
        snaps.sort((a, b) => ((b.researchAsOfDate || (b as any).asOfDate || '')).localeCompare(a.researchAsOfDate || (a as any).asOfDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
        return snaps[0] || null;
      },
      save: async (snapshot: ResearchSnapshot) => {
        // IMMUTABLE: never overwrite
        if (this.state.snapshots[snapshot.snapshotId]) {
          return this.state.snapshots[snapshot.snapshotId];
        }
        this.state.snapshots[snapshot.snapshotId] = { ...snapshot };
        this.flushToDisk();
        return this.state.snapshots[snapshot.snapshotId];
      },
      getAll: async () => Object.values(this.state.snapshots),
      count: async () => Object.keys(this.state.snapshots).length
    };
  }

  private createDecisionRepo(): IDecisionRepository {
    return {
      get: async (id: string) => this.state.decisions[id] || null,
      getLatest: async (securityId: string, asOfDate?: string) => {
        let decs = Object.values(this.state.decisions).filter(d => d.securityId === securityId);
        if (asOfDate) {
          decs = decs.filter(d => d.asOfDate <= asOfDate);
        }
        decs.sort((a, b) => (b.asOfDate || '').localeCompare(a.asOfDate || '') || (b.generatedAt || '').localeCompare(a.generatedAt || ''));
        return decs[0] || null;
      },
      getHistory: async (securityId: string) => {
        const decs = Object.values(this.state.decisions).filter(d => d.securityId === securityId);
        decs.sort((a, b) => (b.asOfDate || '').localeCompare(a.asOfDate || '') || (b.generatedAt || '').localeCompare(a.generatedAt || ''));
        return decs;
      },
      getHistoryForOwner: async (securityId: string, ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        const decs = Object.values(this.state.decisions).filter(d => d.securityId === securityId && canRead(d as any, scope));
        decs.sort((a, b) => (b.asOfDate || '').localeCompare(a.asOfDate || '') || (b.generatedAt || '').localeCompare(a.generatedAt || ''));
        return decs;
      },
      save: async (decision: InvestmentDecisionAssessment) => {
        // IMMUTABLE: never overwrite
        if (this.state.decisions[decision.decisionId]) {
          return this.state.decisions[decision.decisionId];
        }
        this.state.decisions[decision.decisionId] = { ...decision };
        this.flushToDisk();
        return this.state.decisions[decision.decisionId];
      },
      getAll: async () => Object.values(this.state.decisions),
      count: async () => Object.keys(this.state.decisions).length
    };
  }

  private createStrategyRepo(): IStrategyRepository {
    return {
      get: async (id: string) => this.state.strategies[id] || null,
      getAll: async () => Object.values(this.state.strategies),
      getAllForOwner: async (ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        return Object.values(this.state.strategies).filter(x => canRead(x as any, scope));
      },
      save: async (strategy: Strategy) => {
        const id = strategy.id || (strategy as any).strategyId;
        assertSameOwner(this.state.strategies[id], strategy, `Strategy "${id}"`);
        this.state.strategies[id] = { ...strategy };
        this.flushToDisk();
        return this.state.strategies[id];
      },
      count: async () => Object.keys(this.state.strategies).length
    };
  }

  private createBacktestRepo(): IBacktestRepository {
    return {
      get: async (id: string) => this.state.backtests[id] || null,
      getByStrategyId: async (strategyId: string) => {
        return Object.values(this.state.backtests).filter(b => b.strategyId === strategyId || (b as any).configuration?.strategyId === strategyId);
      },
      getAll: async () => Object.values(this.state.backtests),
      getAllForOwner: async (ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        return Object.values(this.state.backtests).filter(b => canRead(b as any, scope));
      },
      save: async (backtest: BacktestResult) => {
        // IMMUTABLE: never rerun or overwrite
        if (this.state.backtests[backtest.backtestId]) {
          return this.state.backtests[backtest.backtestId];
        }
        this.state.backtests[backtest.backtestId] = { ...backtest };
        this.flushToDisk();
        return this.state.backtests[backtest.backtestId];
      },
      count: async () => Object.keys(this.state.backtests).length
    };
  }

  private createWatchlistRepo(): IWatchlistRepository {
    return {
      getWatchlist: async (id = 'default') => this.state.watchlists[id] || [],
      saveWatchlist: async (tickers: string[], id = 'default') => {
        this.state.watchlists[id] = [...tickers];
        this.flushToDisk();
      },
      addTicker: async (ticker: string, id = 'default') => {
        if (!this.state.watchlists[id]) this.state.watchlists[id] = [];
        if (!this.state.watchlists[id].includes(ticker)) {
          this.state.watchlists[id].push(ticker);
          this.flushToDisk();
        }
      },
      removeTicker: async (ticker: string, id = 'default') => {
        if (!this.state.watchlists[id]) return;
        this.state.watchlists[id] = this.state.watchlists[id].filter(t => t !== ticker);
        this.flushToDisk();
      }
    };
  }

  private createAlertRepo(): IAlertRepository {
    return {
      get: async (id: string) => this.state.alerts[id] || null,
      getAll: async () => Object.values(this.state.alerts),
      getAllForOwner: async (ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        return Object.values(this.state.alerts).filter(x => canRead(x as any, scope));
      },
      save: async (alert: AlertItem) => {
        assertSameOwner(this.state.alerts[alert.id], alert, `Alert "${alert.id}"`);
        this.state.alerts[alert.id] = { ...alert };
        this.flushToDisk();
        return this.state.alerts[alert.id];
      },
      saveMany: async (alerts: AlertItem[]) => {
        for (const a of alerts) {
          this.state.alerts[a.id] = { ...a };
        }
        this.flushToDisk();
        return alerts.length;
      },
      update: async (alertId: string, updates: Partial<AlertItem>) => {
        if (!this.state.alerts[alertId]) return false;
        this.state.alerts[alertId] = { ...this.state.alerts[alertId], ...updates };
        this.flushToDisk();
        return true;
      },
      count: async () => Object.keys(this.state.alerts).length
    };
  }

  private createPortfolioRepo(): IPortfolioRepository {
    return {
      getPositions: async (portfolioId = 'default') => this.state.portfolio[portfolioId] || [],
      savePositions: async (positions: HoldingPosition[], portfolioId = 'default') => {
        this.state.portfolio[portfolioId] = [...positions];
        this.flushToDisk();
      },
      updatePosition: async (ticker: string, shares: number, avgCost: number, portfolioId = 'default') => {
        if (!this.state.portfolio[portfolioId]) this.state.portfolio[portfolioId] = [];
        const idx = this.state.portfolio[portfolioId].findIndex(p => p.ticker === ticker);
        if (idx >= 0) {
          this.state.portfolio[portfolioId][idx] = { ticker, shares, avgCost };
        } else {
          this.state.portfolio[portfolioId].push({ ticker, shares, avgCost });
        }
        this.flushToDisk();
      }
    };
  }

  private createQueryRepo(): IResearchQueryRepository {
    return {
      get: async (id: string) => this.state.queries[id] || null,
      getAll: async () => Object.values(this.state.queries),
      getAllForOwner: async (ownerUserId: string) => {
        const scope = requireTenantScope(ownerUserId);
        return Object.values(this.state.queries).filter(x => canRead(x as any, scope));
      },
      save: async (query: ResearchQueryItem) => {
        const id = (query as any).queryId || query.id;
        this.state.queries[id] = { ...query };
        this.flushToDisk();
        return this.state.queries[id];
      },
      count: async () => Object.keys(this.state.queries).length
    };
  }

  private createUserRepo(): IUserRepository {
    return {
      get: async (id: string) => this.state.users[id] || null,
      getByEmail: async (email: string) => {
        const norm = email.trim().toLowerCase();
        return Object.values(this.state.users).find(u => u.normalizedEmail === norm) || null;
      },
      save: async (user: User) => {
        this.state.users[user.userId] = { ...user };
        this.flushToDisk();
        return this.state.users[user.userId];
      },
      update: async (userId: string, updates: Partial<User>) => {
        if (!this.state.users[userId]) return false;
        this.state.users[userId] = {
          ...this.state.users[userId],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        this.flushToDisk();
        return true;
      },
      count: async () => Object.keys(this.state.users).length,
      getAll: async () => Object.values(this.state.users)
    };
  }

  private createSessionRepo(): ISessionRepository {
    return {
      get: async (sessionId: string) => {
        const sess = this.state.sessions[sessionId];
        if (!sess) return null;
        if (!sess.isValid) return null;
        if (new Date(sess.expiresAt).getTime() <= Date.now()) {
          sess.isValid = false;
          this.flushToDisk();
          return null;
        }
        return sess;
      },
      save: async (session: AuthenticatedSession) => {
        this.state.sessions[session.sessionId] = { ...session };
        this.flushToDisk();
        return this.state.sessions[session.sessionId];
      },
      invalidate: async (sessionId: string) => {
        if (!this.state.sessions[sessionId]) return false;
        this.state.sessions[sessionId].isValid = false;
        this.flushToDisk();
        return true;
      },
      invalidateAllForUser: async (userId: string) => {
        let count = 0;
        for (const s of Object.values(this.state.sessions)) {
          if (s.userId === userId && s.isValid) {
            s.isValid = false;
            count++;
          }
        }
        if (count > 0) this.flushToDisk();
        return count;
      },
      cleanupExpired: async () => {
        const now = Date.now();
        let count = 0;
        for (const [id, s] of Object.entries(this.state.sessions)) {
          if (!s.isValid || new Date(s.expiresAt).getTime() <= now) {
            delete this.state.sessions[id];
            count++;
          }
        }
        if (count > 0) this.flushToDisk();
        return count;
      },
      count: async () => Object.values(this.state.sessions).filter(s => s.isValid && new Date(s.expiresAt).getTime() > Date.now()).length,
      getAll: async () => Object.values(this.state.sessions)
    };
  }

  private createEventRepo(): IInvestmentEventRepository {
    return {
      get: async (eventId: string) => {
        if (!this.state.events) this.state.events = {};
        const ev = this.state.events[eventId];
        if (ev && !ev.availableAt) {
          const fallback = (ev as any).provenance?.ingestedAt || (ev as any).announcedAt || ev.eventDate || new Date().toISOString();
          return { ...ev, availableAt: fallback };
        }
        return ev || null;
      },
      getBySecurityId: async (securityId: string, asOfDate?: string) => {
        if (!this.state.events) this.state.events = {};
        const secNorm = (securityId || '').trim().toLowerCase();
        let evts = Object.values(this.state.events).filter(e => {
          const matchSec = (e.securityId || '').trim().toLowerCase() === secNorm;
          const matchSym = (e.ticker || '').trim().toLowerCase() === secNorm;
          return matchSec || matchSym;
        }).map(e => {
          if (!e.availableAt) {
            const fallback = (e as any).provenance?.ingestedAt || (e as any).announcedAt || e.eventDate || new Date().toISOString();
            return { ...e, availableAt: fallback };
          }
          return e;
        });

        if (asOfDate) {
          const asOfIso = asOfDate.includes('T') ? asOfDate : `${asOfDate}T23:59:59.999Z`;
          const asOfTime = new Date(asOfIso).getTime();
          evts = evts.filter(e => {
            const availTime = new Date(e.availableAt || e.eventDate || e.announcedAt || '').getTime();
            return !isNaN(availTime) && availTime <= asOfTime;
          });
        }

        // Chronologically descending by availableAt
        evts.sort((a, b) => (b.availableAt || b.eventDate || '').localeCompare(a.availableAt || a.eventDate || ''));
        return evts;
      },
      getAll: async () => {
        if (!this.state.events) this.state.events = {};
        return Object.values(this.state.events).map(e => {
          if (!e.availableAt) {
            const fallback = (e as any).provenance?.ingestedAt || (e as any).announcedAt || e.eventDate || new Date().toISOString();
            return { ...e, availableAt: fallback };
          }
          return e;
        });
      },
      save: async (event: InvestmentEvent) => {
        if (!this.state.events) this.state.events = {};
        const toSave = { ...event };
        if (!toSave.availableAt) {
          toSave.availableAt = (toSave as any).provenance?.ingestedAt || (toSave as any).announcedAt || toSave.eventDate || new Date().toISOString();
        }
        // IMMUTABLE: If already exists, return existing
        if (this.state.events[event.eventId]) {
          if (!this.state.events[event.eventId].availableAt) {
            this.state.events[event.eventId].availableAt = toSave.availableAt;
            this.flushToDisk();
          }
          return this.state.events[event.eventId];
        }
        this.state.events[event.eventId] = toSave;
        this.flushToDisk();
        return this.state.events[event.eventId];
      },
      saveBatch: async (events: InvestmentEvent[]) => {
        if (!this.state.events) this.state.events = {};
        let count = 0;
        for (const ev of events) {
          if (!this.state.events[ev.eventId]) {
            this.state.events[ev.eventId] = { ...ev };
            count++;
          }
        }
        if (count > 0) this.flushToDisk();
        return count;
      },
      count: async () => {
        if (!this.state.events) this.state.events = {};
        return Object.keys(this.state.events).length;
      }
    };
  }

  private createMonitorRepo(): IInvestmentMonitorRepository {
    return {
      get: async (monitorId: string) => {
        if (!this.state.monitors) this.state.monitors = {};
        const m = this.state.monitors[monitorId];
        return m ? { ...m } : null;
      },
      getBySecurityId: async (securityId: string, userId?: string) => {
        if (!this.state.monitors) this.state.monitors = {};
        const matches = Object.values(this.state.monitors).filter(m => {
          if (m.securityId !== securityId) return false;
          if (userId && m.ownerUserId !== userId && m.userId !== userId) return false;
          return true;
        });
        return matches.length > 0 ? { ...matches[0] } : null;
      },
      getByUserId: async (userId: string) => {
        if (!this.state.monitors) this.state.monitors = {};
        return Object.values(this.state.monitors)
          .filter(m => m.ownerUserId === userId || m.userId === userId)
          .map(m => ({ ...m }));
      },
      getAll: async () => {
        if (!this.state.monitors) this.state.monitors = {};
        return Object.values(this.state.monitors).map(m => ({ ...m }));
      },
      save: async (monitor: InvestmentMonitor) => {
        if (!this.state.monitors) this.state.monitors = {};
        assertSameOwner(this.state.monitors[monitor.monitorId], monitor, `Monitor "${monitor.monitorId}"`);
        this.state.monitors[monitor.monitorId] = { ...monitor };
        this.flushToDisk();
        return { ...this.state.monitors[monitor.monitorId] };
      },
      update: async (monitorId: string, updates: Partial<InvestmentMonitor>) => {
        if (!this.state.monitors) this.state.monitors = {};
        const existing = this.state.monitors[monitorId];
        if (!existing) return false;
        this.state.monitors[monitorId] = {
          ...existing,
          ...updates,
          updatedAt: new Date().toISOString()
        };
        this.flushToDisk();
        return true;
      },
      delete: async (monitorId: string) => {
        if (!this.state.monitors) this.state.monitors = {};
        if (!this.state.monitors[monitorId]) return false;
        delete this.state.monitors[monitorId];
        this.flushToDisk();
        return true;
      },
      count: async () => {
        if (!this.state.monitors) this.state.monitors = {};
        return Object.keys(this.state.monitors).length;
      },
      addNote: async (monitorId: string, note: AnalystReviewNote) => {
        if (!this.state.analystNotes) this.state.analystNotes = {};
        if (!this.state.analystNotes[monitorId]) this.state.analystNotes[monitorId] = [];
        const noteWithGuarantees: AnalystReviewNote = {
          ...note,
          label: 'USER NOTE',
          isImmutable: true
        };
        this.state.analystNotes[monitorId].push(noteWithGuarantees);
        this.flushToDisk();
        return { ...noteWithGuarantees };
      },
      getNotes: async (monitorId: string) => {
        if (!this.state.analystNotes) this.state.analystNotes = {};
        return (this.state.analystNotes[monitorId] || []).map(n => ({ ...n }));
      }
    };
  }

  private createMonitorReviewRepo(): IInvestmentMonitorReviewRepository {
    return {
      get: async (reviewId: string) => {
        if (!this.state.monitorReviews) this.state.monitorReviews = {};
        const r = this.state.monitorReviews[reviewId];
        return r ? { ...r } : null;
      },
      getByMonitorId: async (monitorId: string) => {
        if (!this.state.monitorReviews) this.state.monitorReviews = {};
        return Object.values(this.state.monitorReviews)
          .filter(r => r.monitorId === monitorId)
          .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
          .map(r => ({ ...r }));
      },
      getAll: async () => {
        if (!this.state.monitorReviews) this.state.monitorReviews = {};
        return Object.values(this.state.monitorReviews).map(r => ({ ...r }));
      },
      save: async (review: InvestmentMonitorReview) => {
        if (!this.state.monitorReviews) this.state.monitorReviews = {};
        // IMMUTABLE: cannot overwrite existing historical review
        if (this.state.monitorReviews[review.reviewId]) {
          return { ...this.state.monitorReviews[review.reviewId] };
        }
        this.state.monitorReviews[review.reviewId] = { ...review };
        this.flushToDisk();
        return { ...this.state.monitorReviews[review.reviewId] };
      },
      count: async () => {
        if (!this.state.monitorReviews) this.state.monitorReviews = {};
        return Object.keys(this.state.monitorReviews).length;
      }
    };
  }

  private createPolicyRepo(): IMonitoringPolicyRepository {
    return {
      get: async (policyId: string) => {
        if (!this.state.monitoringPolicies) this.state.monitoringPolicies = {};
        const p = this.state.monitoringPolicies[policyId];
        return p ? { ...p } : null;
      },
      getByUserId: async (userId: string) => {
        if (!this.state.monitoringPolicies) this.state.monitoringPolicies = {};
        return Object.values(this.state.monitoringPolicies)
          .filter(p => p.userId === userId || p.ownerUserId === userId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(p => ({ ...p }));
      },
      getAll: async () => {
        if (!this.state.monitoringPolicies) this.state.monitoringPolicies = {};
        return Object.values(this.state.monitoringPolicies).map(p => ({ ...p }));
      },
      save: async (policy: MonitoringPolicy) => {
        if (!this.state.monitoringPolicies) this.state.monitoringPolicies = {};
        assertSameOwner(this.state.monitoringPolicies[policy.policyId], policy, `Policy "${policy.policyId}"`);
        this.state.monitoringPolicies[policy.policyId] = { ...policy };
        this.flushToDisk();
        return { ...this.state.monitoringPolicies[policy.policyId] };
      },
      update: async (policyId: string, updates: Partial<MonitoringPolicy>) => {
        if (!this.state.monitoringPolicies) this.state.monitoringPolicies = {};
        const existing = this.state.monitoringPolicies[policyId];
        if (!existing) return false;
        this.state.monitoringPolicies[policyId] = {
          ...existing,
          ...updates,
          updatedAt: new Date().toISOString()
        };
        this.flushToDisk();
        return true;
      },
      delete: async (policyId: string) => {
        if (!this.state.monitoringPolicies) this.state.monitoringPolicies = {};
        if (!this.state.monitoringPolicies[policyId]) return false;
        delete this.state.monitoringPolicies[policyId];
        this.flushToDisk();
        return true;
      },
      count: async () => {
        if (!this.state.monitoringPolicies) this.state.monitoringPolicies = {};
        return Object.keys(this.state.monitoringPolicies).length;
      }
    };
  }

  private createAlertOrchestrationRepo(): IAlertOrchestrationRepository {
    return {
      get: async (alertId: string) => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        const a = this.state.orchestratedAlerts[alertId];
        return a ? { ...a } : null;
      },
      getByUserId: async (userId: string, filter?: {
        status?: AlertLifecycleStatus;
        severity?: AlertSeverity;
        monitorId?: string;
        securityId?: string;
        limit?: number;
      }) => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        let matches = Object.values(this.state.orchestratedAlerts).filter(a =>
          a.userId === userId || a.ownerUserId === userId
        );
        if (filter?.status) {
          matches = matches.filter(a => a.status === filter.status);
        }
        if (filter?.severity) {
          matches = matches.filter(a => a.severity === filter.severity);
        }
        if (filter?.monitorId) {
          matches = matches.filter(a => a.monitorId === filter.monitorId);
        }
        if (filter?.securityId) {
          matches = matches.filter(a => a.securityId === filter.securityId);
        }
        matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (filter?.limit && filter.limit > 0) {
          matches = matches.slice(0, filter.limit);
        }
        return matches.map(a => ({ ...a }));
      },
      getRecentByFingerprint: async (fingerprint: string) => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        const matches = Object.values(this.state.orchestratedAlerts).filter(a => a.fingerprint === fingerprint);
        if (matches.length === 0) return null;
        matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return { ...matches[0] };
      },
      getRecentByRule: async (userId: string, targetId: string, ruleType: AlertRuleType) => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        const matches = Object.values(this.state.orchestratedAlerts).filter(a =>
          (a.userId === userId || a.ownerUserId === userId) &&
          (a.securityId === targetId || a.monitorId === targetId || a.symbol?.toUpperCase() === targetId.toUpperCase()) &&
          a.ruleType === ruleType
        );
        if (matches.length === 0) return null;
        matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return { ...matches[0] };
      },
      getAll: async () => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        return Object.values(this.state.orchestratedAlerts).map(a => ({ ...a }));
      },
      save: async (alert: AlertInstance) => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        assertSameOwner(this.state.orchestratedAlerts[alert.alertId], alert, `Orchestrated alert "${alert.alertId}"`);
        this.state.orchestratedAlerts[alert.alertId] = { ...alert };
        this.flushToDisk();
        return { ...this.state.orchestratedAlerts[alert.alertId] };
      },
      update: async (alertId: string, updates: Partial<AlertInstance>) => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        const existing = this.state.orchestratedAlerts[alertId];
        if (!existing) return false;
        this.state.orchestratedAlerts[alertId] = {
          ...existing,
          ...updates
        };
        this.flushToDisk();
        return true;
      },
      delete: async (alertId: string) => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        if (!this.state.orchestratedAlerts[alertId]) return false;
        delete this.state.orchestratedAlerts[alertId];
        this.flushToDisk();
        return true;
      },
      count: async () => {
        if (!this.state.orchestratedAlerts) this.state.orchestratedAlerts = {};
        return Object.keys(this.state.orchestratedAlerts).length;
      }
    };
  }

  private createResearchPriorityRepo(): IResearchPriorityRepository {
    return {
      getSnapshot: async (snapshotId: string) => {
        if (!this.state.researchPriorities) this.state.researchPriorities = {};
        const snap = this.state.researchPriorities[snapshotId];
        return snap ? JSON.parse(JSON.stringify(snap)) : null;
      },
      getLatestSnapshot: async (userId: string, universeType?: string) => {
        if (!this.state.researchPriorities) this.state.researchPriorities = {};
        const snaps = Object.values(this.state.researchPriorities).filter(s => {
          if (s.userId !== userId) return false;
          if (universeType && universeType !== 'ALL' && s.universeType !== universeType) return false;
          return true;
        });
        if (snaps.length === 0) return null;
        snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return JSON.parse(JSON.stringify(snaps[0]));
      },
      getSnapshotsByUserId: async (userId: string) => {
        if (!this.state.researchPriorities) this.state.researchPriorities = {};
        const snaps = Object.values(this.state.researchPriorities).filter(s => s.userId === userId);
        snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return JSON.parse(JSON.stringify(snaps));
      },
      saveSnapshot: async (snapshot: ResearchPrioritySnapshot) => {
        if (!this.state.researchPriorities) this.state.researchPriorities = {};
        this.state.researchPriorities[snapshot.snapshotId] = JSON.parse(JSON.stringify(snapshot));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.researchPriorities[snapshot.snapshotId]));
      },
      getAll: async () => {
        if (!this.state.researchPriorities) this.state.researchPriorities = {};
        return Object.values(this.state.researchPriorities).map(s => JSON.parse(JSON.stringify(s)));
      },
      count: async () => {
        if (!this.state.researchPriorities) this.state.researchPriorities = {};
        return Object.keys(this.state.researchPriorities).length;
      }
    };
  }

  private createCrossInvestmentSnapshotRepo(): ICrossInvestmentSnapshotRepository {
    return {
      getSnapshot: async (snapshotId: string) => {
        if (!this.state.crossInvestmentSnapshots) this.state.crossInvestmentSnapshots = {};
        const snap = this.state.crossInvestmentSnapshots[snapshotId];
        return snap ? JSON.parse(JSON.stringify(snap)) : null;
      },
      getSnapshotsByUserId: async (userId: string) => {
        if (!this.state.crossInvestmentSnapshots) this.state.crossInvestmentSnapshots = {};
        const snaps = Object.values(this.state.crossInvestmentSnapshots).filter(s => s.userId === userId);
        snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return JSON.parse(JSON.stringify(snaps));
      },
      saveSnapshot: async (snapshot: CrossInvestmentSnapshot) => {
        if (!this.state.crossInvestmentSnapshots) this.state.crossInvestmentSnapshots = {};
        // Scenario L: Historical Immutability - Overwrite rejected
        if (this.state.crossInvestmentSnapshots[snapshot.snapshotId]) {
          throw new Error(`Snapshot with ID "${snapshot.snapshotId}" already exists. Historical relationship snapshots are strictly immutable.`);
        }
        this.state.crossInvestmentSnapshots[snapshot.snapshotId] = JSON.parse(JSON.stringify(snapshot));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.crossInvestmentSnapshots[snapshot.snapshotId]));
      },
      getAll: async () => {
        if (!this.state.crossInvestmentSnapshots) this.state.crossInvestmentSnapshots = {};
        return Object.values(this.state.crossInvestmentSnapshots).map(s => JSON.parse(JSON.stringify(s)));
      },
      count: async () => {
        if (!this.state.crossInvestmentSnapshots) this.state.crossInvestmentSnapshots = {};
        return Object.keys(this.state.crossInvestmentSnapshots).length;
      }
    };
  }

  private createPortfolioScenarioRepo(): IPortfolioScenarioRepository {
    return {
      getSnapshot: async (snapshotId: string) => {
        if (!this.state.portfolioScenarioSnapshots) this.state.portfolioScenarioSnapshots = {};
        const snap = this.state.portfolioScenarioSnapshots[snapshotId];
        return snap ? JSON.parse(JSON.stringify(snap)) : null;
      },
      getSnapshotsByUserId: async (userId: string) => {
        if (!this.state.portfolioScenarioSnapshots) this.state.portfolioScenarioSnapshots = {};
        const snaps = Object.values(this.state.portfolioScenarioSnapshots).filter(s => s.userId === userId);
        snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return JSON.parse(JSON.stringify(snaps));
      },
      saveSnapshot: async (snapshot: PortfolioScenarioSnapshot) => {
        if (!this.state.portfolioScenarioSnapshots) this.state.portfolioScenarioSnapshots = {};
        // Scenario O: Historical Immutability - Overwrite rejected
        if (this.state.portfolioScenarioSnapshots[snapshot.snapshotId]) {
          throw new Error(`Scenario snapshot with ID "${snapshot.snapshotId}" already exists. Historical scenario snapshots are strictly immutable.`);
        }
        this.state.portfolioScenarioSnapshots[snapshot.snapshotId] = JSON.parse(JSON.stringify(snapshot));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.portfolioScenarioSnapshots[snapshot.snapshotId]));
      },
      getAll: async () => {
        if (!this.state.portfolioScenarioSnapshots) this.state.portfolioScenarioSnapshots = {};
        return Object.values(this.state.portfolioScenarioSnapshots).map(s => JSON.parse(JSON.stringify(s)));
      },
      count: async () => {
        if (!this.state.portfolioScenarioSnapshots) this.state.portfolioScenarioSnapshots = {};
        return Object.keys(this.state.portfolioScenarioSnapshots).length;
      }
    };
  }

  private createCounterfactualRepo(): ICounterfactualRepository {
    return {
      getSnapshot: async (snapshotId: string) => {
        if (!this.state.counterfactualSnapshots) this.state.counterfactualSnapshots = {};
        const snap = this.state.counterfactualSnapshots[snapshotId];
        return snap ? JSON.parse(JSON.stringify(snap)) : null;
      },
      getSnapshotsByUserId: async (userId: string) => {
        if (!this.state.counterfactualSnapshots) this.state.counterfactualSnapshots = {};
        const snaps = Object.values(this.state.counterfactualSnapshots).filter(s => s.userId === userId);
        snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return JSON.parse(JSON.stringify(snaps));
      },
      saveSnapshot: async (snapshot: CounterfactualSnapshot) => {
        if (!this.state.counterfactualSnapshots) this.state.counterfactualSnapshots = {};
        // Scenario S: Historical Immutability - Overwrite rejected
        if (this.state.counterfactualSnapshots[snapshot.snapshotId]) {
          throw new Error(`Counterfactual snapshot with ID "${snapshot.snapshotId}" already exists. Historical counterfactual snapshots are strictly immutable.`);
        }
        this.state.counterfactualSnapshots[snapshot.snapshotId] = JSON.parse(JSON.stringify(snapshot));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.counterfactualSnapshots[snapshot.snapshotId]));
      },
      getAll: async () => {
        if (!this.state.counterfactualSnapshots) this.state.counterfactualSnapshots = {};
        return Object.values(this.state.counterfactualSnapshots).map(s => JSON.parse(JSON.stringify(s)));
      },
      count: async () => {
        if (!this.state.counterfactualSnapshots) this.state.counterfactualSnapshots = {};
        return Object.keys(this.state.counterfactualSnapshots).length;
      }
    };
  }

  private createResearchMemoryRepo(): IResearchMemoryRepository {
    return {
      get: async (id: string) => {
        if (!this.state.researchMemories) this.state.researchMemories = {};
        const mem = this.state.researchMemories[id];
        return mem ? JSON.parse(JSON.stringify(mem)) : null;
      },
      getAll: async (filter?: {
        securityId?: string;
        userId?: string;
        asOfDate?: string;
        memoryType?: ResearchMemoryType;
        status?: ResearchMemoryStatus;
      }) => {
        if (!this.state.researchMemories) this.state.researchMemories = {};
        let list = Object.values(this.state.researchMemories);

        if (filter?.securityId) {
          const targetSec = filter.securityId.toLowerCase();
          list = list.filter(m =>
            m.securityId.toLowerCase() === targetSec ||
            m.ticker.toLowerCase() === targetSec ||
            m.securityId.toLowerCase().includes(targetSec)
          );
        }

        if (filter?.userId) {
          list = list.filter(m => m.userId === filter.userId);
        }

        if (filter?.asOfDate) {
          // Strict Point-in-Time (PIT) zero-lookahead filter
          list = list.filter(m => m.asOfDate <= filter.asOfDate!);
        }

        if (filter?.memoryType) {
          list = list.filter(m => m.memoryType === filter.memoryType);
        }

        if (filter?.status) {
          list = list.filter(m => m.status === filter.status);
        }

        // Deterministic sorting: asOfDate DESC -> createdAt DESC -> id DESC
        list.sort((a, b) => {
          if (b.asOfDate !== a.asOfDate) {
            return b.asOfDate.localeCompare(a.asOfDate);
          }
          if (b.createdAt !== a.createdAt) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          return b.id.localeCompare(a.id);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (entry: ResearchMemoryEntry) => {
        if (!this.state.researchMemories) this.state.researchMemories = {};
        // Scenario S / C: Historical Immutability - Overwrite rejected
        if (this.state.researchMemories[entry.id]) {
          throw new Error(`Research memory with ID "${entry.id}" already exists. Historical research memories are strictly immutable.`);
        }
        this.state.researchMemories[entry.id] = JSON.parse(JSON.stringify(entry));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.researchMemories[entry.id]));
      },
      update: async (entry: ResearchMemoryEntry) => {
        if (!this.state.researchMemories) this.state.researchMemories = {};
        if (!this.state.researchMemories[entry.id]) {
          throw new Error(`Research memory with ID "${entry.id}" not found.`);
        }
        assertSameOwner(this.state.researchMemories[entry.id], entry, `Research memory "${entry.id}"`);
        this.state.researchMemories[entry.id] = JSON.parse(JSON.stringify(entry));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.researchMemories[entry.id]));
      },
      count: async () => {
        if (!this.state.researchMemories) this.state.researchMemories = {};
        return Object.keys(this.state.researchMemories).length;
      }
    };
  }

  private createResearchQuestionRepo(): IResearchQuestionRepository {
    return {
      get: async (id: string) => {
        if (!this.state.researchQuestions) this.state.researchQuestions = {};
        const q = this.state.researchQuestions[id];
        return q ? JSON.parse(JSON.stringify(q)) : null;
      },
      getAll: async (filter?: {
        securityId?: string;
        userId?: string;
        status?: ResearchQuestionStatus;
        asOfDate?: string;
      }) => {
        if (!this.state.researchQuestions) this.state.researchQuestions = {};
        let list = Object.values(this.state.researchQuestions);

        if (filter?.securityId) {
          const targetSec = filter.securityId.toLowerCase();
          list = list.filter(q =>
            q.securityId.toLowerCase() === targetSec ||
            q.ticker.toLowerCase() === targetSec ||
            q.securityId.toLowerCase().includes(targetSec)
          );
        }

        if (filter?.userId) {
          list = list.filter(q => q.userId === filter.userId);
        }

        if (filter?.status) {
          list = list.filter(q => q.status === filter.status);
        }

        if (filter?.asOfDate) {
          list = list.filter(q => q.asOfDate <= filter.asOfDate!);
        }

        // Deterministic sorting: updatedAt DESC -> createdAt DESC -> id DESC
        list.sort((a, b) => {
          if (b.updatedAt !== a.updatedAt) {
            return b.updatedAt.localeCompare(a.updatedAt);
          }
          if (b.createdAt !== a.createdAt) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          return b.id.localeCompare(a.id);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (question: ResearchQuestionEntry) => {
        if (!this.state.researchQuestions) this.state.researchQuestions = {};
        assertSameOwner(this.state.researchQuestions[question.id], question, `Research question "${question.id}"`);
        this.state.researchQuestions[question.id] = JSON.parse(JSON.stringify(question));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.researchQuestions[question.id]));
      },
      update: async (question: ResearchQuestionEntry) => {
        if (!this.state.researchQuestions) this.state.researchQuestions = {};
        if (!this.state.researchQuestions[question.id]) {
          throw new Error(`Research question with ID "${question.id}" not found.`);
        }
        assertSameOwner(this.state.researchQuestions[question.id], question, `Research question "${question.id}"`);
        this.state.researchQuestions[question.id] = JSON.parse(JSON.stringify(question));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.researchQuestions[question.id]));
      },
      count: async () => {
        if (!this.state.researchQuestions) this.state.researchQuestions = {};
        return Object.keys(this.state.researchQuestions).length;
      }
    };
  }

  private createResearchGapRepo(): IResearchGapRepository {
    return {
      get: async (id: string) => {
        if (!this.state.researchGaps) this.state.researchGaps = {};
        const gap = this.state.researchGaps[id];
        return gap ? JSON.parse(JSON.stringify(gap)) : null;
      },
      getAll: async (filter?: {
        securityId?: string;
        userId?: string;
        status?: ResearchGapStatus;
        asOfDate?: string;
        gapType?: ResearchGapType;
      }) => {
        if (!this.state.researchGaps) this.state.researchGaps = {};
        let list = Object.values(this.state.researchGaps);

        if (filter?.securityId) {
          const targetSec = filter.securityId.toLowerCase();
          list = list.filter(g =>
            g.securityId.toLowerCase() === targetSec ||
            g.ticker.toLowerCase() === targetSec ||
            g.securityId.toLowerCase().includes(targetSec)
          );
        }

        if (filter?.userId) {
          list = list.filter(g => g.userId === filter.userId || g.tenantId === filter.userId);
        }

        if (filter?.status) {
          list = list.filter(g => g.status === filter.status);
        }

        if (filter?.gapType) {
          list = list.filter(g => g.gapType === filter.gapType);
        }

        if (filter?.asOfDate) {
          // Strict Point-in-Time (PIT) zero-lookahead filter
          list = list.filter(g => g.asOfDate <= filter.asOfDate!);
        }

        // Deterministic sorting: asOfDate DESC -> createdAt DESC -> gapId DESC
        list.sort((a, b) => {
          if (b.asOfDate !== a.asOfDate) {
            return b.asOfDate.localeCompare(a.asOfDate);
          }
          if (b.createdAt !== a.createdAt) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          return b.gapId.localeCompare(a.gapId);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (gap: ResearchGapRecord) => {
        if (!this.state.researchGaps) this.state.researchGaps = {};
        if (this.state.researchGaps[gap.gapId]) {
          throw new Error(`Research gap with ID "${gap.gapId}" already exists. Overwrite prohibited.`);
        }
        this.state.researchGaps[gap.gapId] = JSON.parse(JSON.stringify(gap));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.researchGaps[gap.gapId]));
      },
      update: async (gap: ResearchGapRecord) => {
        if (!this.state.researchGaps) this.state.researchGaps = {};
        if (!this.state.researchGaps[gap.gapId]) {
          throw new Error(`Research gap with ID "${gap.gapId}" not found.`);
        }
        assertSameOwner(this.state.researchGaps[gap.gapId], gap, `Research gap "${gap.gapId}"`);
        this.state.researchGaps[gap.gapId] = JSON.parse(JSON.stringify(gap));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.researchGaps[gap.gapId]));
      },
      count: async () => {
        if (!this.state.researchGaps) this.state.researchGaps = {};
        return Object.keys(this.state.researchGaps).length;
      }
    };
  }

  private createInvestigationPlanRepo(): IInvestigationPlanRepository {
    return {
      get: async (id: string) => {
        if (!this.state.investigationPlans) this.state.investigationPlans = {};
        const plan = this.state.investigationPlans[id];
        return plan ? JSON.parse(JSON.stringify(plan)) : null;
      },
      getAll: async (filter?: {
        securityId?: string;
        userId?: string;
        status?: InvestigationPlanStatus;
        asOfDate?: string;
      }) => {
        if (!this.state.investigationPlans) this.state.investigationPlans = {};
        let list = Object.values(this.state.investigationPlans);

        if (filter?.securityId) {
          const targetSec = filter.securityId.toLowerCase();
          list = list.filter(p =>
            p.securityId.toLowerCase() === targetSec ||
            p.ticker.toLowerCase() === targetSec ||
            p.securityId.toLowerCase().includes(targetSec)
          );
        }

        if (filter?.userId) {
          list = list.filter(p => p.userId === filter.userId || p.tenantId === filter.userId);
        }

        if (filter?.status) {
          list = list.filter(p => p.status === filter.status);
        }

        if (filter?.asOfDate) {
          // Strict Point-in-Time (PIT) zero-lookahead filter
          list = list.filter(p => p.asOfDate <= filter.asOfDate!);
        }

        // Deterministic sorting: asOfDate DESC -> createdAt DESC -> planId DESC
        list.sort((a, b) => {
          if (b.asOfDate !== a.asOfDate) {
            return b.asOfDate.localeCompare(a.asOfDate);
          }
          if (b.createdAt !== a.createdAt) {
            return b.createdAt.localeCompare(a.createdAt);
          }
          return b.planId.localeCompare(a.planId);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (plan: InvestigationPlan) => {
        if (!this.state.investigationPlans) this.state.investigationPlans = {};
        if (this.state.investigationPlans[plan.planId]) {
          throw new Error(`Investigation plan with ID "${plan.planId}" already exists. Overwrite prohibited.`);
        }
        this.state.investigationPlans[plan.planId] = JSON.parse(JSON.stringify(plan));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.investigationPlans[plan.planId]));
      },
      update: async (plan: InvestigationPlan) => {
        if (!this.state.investigationPlans) this.state.investigationPlans = {};
        if (!this.state.investigationPlans[plan.planId]) {
          throw new Error(`Investigation plan with ID "${plan.planId}" not found.`);
        }
        assertSameOwner(this.state.investigationPlans[plan.planId], plan, `Investigation plan "${plan.planId}"`);
        this.state.investigationPlans[plan.planId] = JSON.parse(JSON.stringify(plan));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.investigationPlans[plan.planId]));
      },
      count: async () => {
        if (!this.state.investigationPlans) this.state.investigationPlans = {};
        return Object.keys(this.state.investigationPlans).length;
      }
    };
  }

  private createInvestigationAuditRepo(): IInvestigationAuditRepository {
    return {
      get: async (id: string) => {
        if (!this.state.investigationAudits) this.state.investigationAudits = {};
        const audit = this.state.investigationAudits[id];
        return audit ? JSON.parse(JSON.stringify(audit)) : null;
      },
      getAll: async (filter?: {
        targetId?: string;
        tenantId?: string;
        targetType?: string;
        asOfDate?: string;
      }) => {
        if (!this.state.investigationAudits) this.state.investigationAudits = {};
        let list = Object.values(this.state.investigationAudits);

        if (filter?.targetId) {
          list = list.filter(a => a.targetId === filter.targetId);
        }

        if (filter?.tenantId) {
          list = list.filter(a => a.tenantId === filter.tenantId);
        }

        if (filter?.targetType) {
          list = list.filter(a => a.targetType === filter.targetType);
        }

        if (filter?.asOfDate) {
          list = list.filter(a => a.asOfDate <= filter.asOfDate!);
        }

        // Deterministic sorting: timestamp DESC -> auditId DESC
        list.sort((a, b) => {
          if (b.timestamp !== a.timestamp) {
            return b.timestamp.localeCompare(a.timestamp);
          }
          return b.auditId.localeCompare(a.auditId);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (audit: InvestigationAuditRecord) => {
        if (!this.state.investigationAudits) this.state.investigationAudits = {};
        if (this.state.investigationAudits[audit.auditId]) {
          throw new Error(`Investigation audit record with ID "${audit.auditId}" already exists. Append-only enforced.`);
        }
        this.state.investigationAudits[audit.auditId] = JSON.parse(JSON.stringify(audit));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.investigationAudits[audit.auditId]));
      },
      count: async () => {
        if (!this.state.investigationAudits) this.state.investigationAudits = {};
        return Object.keys(this.state.investigationAudits).length;
      }
    };
  }

  private createEvidenceCollectionRepo(): IEvidenceCollectionRepository {
    return {
      get: async (collectionId: string) => {
        if (!this.state.evidenceCollections) this.state.evidenceCollections = {};
        const rec = this.state.evidenceCollections[collectionId];
        return rec ? JSON.parse(JSON.stringify(rec)) : null;
      },
      getBySourceFingerprint: async (fingerprint: string, tenantId?: string) => {
        if (!this.state.evidenceCollections) this.state.evidenceCollections = {};
        const all = Object.values(this.state.evidenceCollections);
        const match = all.find(r =>
          r.sourceFingerprint === fingerprint &&
          (!tenantId || r.tenantId === tenantId || r.userId === tenantId) &&
          r.collectionStatus !== 'SUPERSEDED'
        );
        return match ? JSON.parse(JSON.stringify(match)) : null;
      },
      getAll: async (filter?: {
        securityId?: string;
        userId?: string;
        tenantId?: string;
        planId?: string;
        taskId?: string;
        questionId?: string;
        gapId?: string;
        status?: CollectionStatus;
        sourceType?: EvidenceSourceClass;
        epistemicStatus?: EpistemicStatus;
        asOfDate?: string;
      }) => {
        if (!this.state.evidenceCollections) this.state.evidenceCollections = {};
        let list = Object.values(this.state.evidenceCollections);

        if (filter?.securityId) {
          const target = filter.securityId.toLowerCase();
          list = list.filter(r =>
            r.securityId.toLowerCase() === target ||
            r.ticker.toLowerCase() === target ||
            r.securityId.toLowerCase().includes(target)
          );
        }

        const effectiveTenant = filter?.tenantId || filter?.userId;
        if (effectiveTenant) {
          list = list.filter(r => r.tenantId === effectiveTenant || r.userId === effectiveTenant);
        }

        if (filter?.planId) {
          list = list.filter(r => r.planId === filter.planId);
        }

        if (filter?.taskId) {
          list = list.filter(r => r.taskId === filter.taskId);
        }

        if (filter?.questionId) {
          list = list.filter(r => r.questionId === filter.questionId);
        }

        if (filter?.gapId) {
          list = list.filter(r => r.gapId === filter.gapId);
        }

        if (filter?.status) {
          list = list.filter(r => r.collectionStatus === filter.status);
        }

        if (filter?.sourceType) {
          list = list.filter(r => r.sourceType === filter.sourceType);
        }

        if (filter?.epistemicStatus) {
          list = list.filter(r => r.epistemicStatus === filter.epistemicStatus);
        }

        // Strict PIT Zero Lookahead:
        // Evidence cannot influence historical research state before it became available to the analyst
        if (filter?.asOfDate) {
          list = list.filter(r => r.asOfDate <= filter.asOfDate! && r.availableAt <= filter.asOfDate!);
        }

        // Canonical deterministic sorting: status -> asOfDate DESC -> collectedAt DESC -> collectionId
        const statusPriority: Record<CollectionStatus, number> = {
          VALIDATED: 0,
          COLLECTED: 1,
          AVAILABLE: 2,
          REQUESTED: 3,
          DISCOVERED: 4,
          CONFLICTING: 5,
          STALE: 6,
          UNAVAILABLE: 7,
          REJECTED: 8,
          SUPERSEDED: 9
        };

        list.sort((a, b) => {
          const prioA = statusPriority[a.collectionStatus] ?? 99;
          const prioB = statusPriority[b.collectionStatus] ?? 99;
          if (prioA !== prioB) return prioA - prioB;
          if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
          if (b.collectedAt !== a.collectedAt) return b.collectedAt.localeCompare(a.collectedAt);
          return a.collectionId.localeCompare(b.collectionId);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (record: EvidenceCollectionRecord) => {
        if (!this.state.evidenceCollections) this.state.evidenceCollections = {};
        if (this.state.evidenceCollections[record.collectionId]) {
          throw new Error(`Evidence collection record with ID "${record.collectionId}" already exists. Overwrite prohibited.`);
        }
        this.state.evidenceCollections[record.collectionId] = JSON.parse(JSON.stringify(record));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.evidenceCollections[record.collectionId]));
      },
      update: async (record: EvidenceCollectionRecord) => {
        if (!this.state.evidenceCollections) this.state.evidenceCollections = {};
        if (!this.state.evidenceCollections[record.collectionId]) {
          throw new Error(`Evidence collection record with ID "${record.collectionId}" not found.`);
        }
        assertSameOwner(this.state.evidenceCollections[record.collectionId], record, `Evidence collection "${record.collectionId}"`);
        this.state.evidenceCollections[record.collectionId] = JSON.parse(JSON.stringify(record));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.evidenceCollections[record.collectionId]));
      },
      count: async () => {
        if (!this.state.evidenceCollections) this.state.evidenceCollections = {};
        return Object.keys(this.state.evidenceCollections).length;
      }
    };
  }

  private createEvidenceRelationshipRepo(): IEvidenceRelationshipRepository {
    return {
      get: async (relationshipId: string) => {
        if (!this.state.evidenceRelationships) this.state.evidenceRelationships = {};
        const rel = this.state.evidenceRelationships[relationshipId];
        return rel ? JSON.parse(JSON.stringify(rel)) : null;
      },
      getAll: async (filter?: {
        sourceId?: string;
        targetId?: string;
        targetType?: string;
        relationshipType?: EvidenceRelationshipType;
        tenantId?: string;
        asOfDate?: string;
      }) => {
        if (!this.state.evidenceRelationships) this.state.evidenceRelationships = {};
        let list = Object.values(this.state.evidenceRelationships);

        if (filter?.sourceId) {
          list = list.filter(r => r.sourceId === filter.sourceId);
        }
        if (filter?.targetId) {
          list = list.filter(r => r.targetId === filter.targetId);
        }
        if (filter?.targetType) {
          list = list.filter(r => r.targetType === filter.targetType);
        }
        if (filter?.relationshipType) {
          list = list.filter(r => r.relationshipType === filter.relationshipType);
        }
        if (filter?.tenantId) {
          list = list.filter(r => r.tenantId === filter.tenantId);
        }
        if (filter?.asOfDate) {
          list = list.filter(r => r.asOfDate <= filter.asOfDate!);
        }

        list.sort((a, b) => {
          if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
          if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
          return a.relationshipId.localeCompare(b.relationshipId);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (rel: EvidenceResearchRelationship) => {
        if (!this.state.evidenceRelationships) this.state.evidenceRelationships = {};
        assertSameOwner(this.state.evidenceRelationships[rel.relationshipId], rel, `Evidence relationship "${rel.relationshipId}"`);
        this.state.evidenceRelationships[rel.relationshipId] = JSON.parse(JSON.stringify(rel));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.evidenceRelationships[rel.relationshipId]));
      },
      delete: async (relationshipId: string) => {
        if (!this.state.evidenceRelationships) this.state.evidenceRelationships = {};
        if (this.state.evidenceRelationships[relationshipId]) {
          delete this.state.evidenceRelationships[relationshipId];
          this.flushToDisk();
          return true;
        }
        return false;
      },
      count: async () => {
        if (!this.state.evidenceRelationships) this.state.evidenceRelationships = {};
        return Object.keys(this.state.evidenceRelationships).length;
      }
    };
  }

  private createEvidenceAuditRepo(): IEvidenceAuditRepository {
    return {
      get: async (id: string) => {
        if (!this.state.evidenceAudits) this.state.evidenceAudits = {};
        const audit = this.state.evidenceAudits[id];
        return audit ? JSON.parse(JSON.stringify(audit)) : null;
      },
      getAll: async (filter?: {
        collectionId?: string;
        tenantId?: string;
        action?: EvidenceAuditAction;
        asOfDate?: string;
      }) => {
        if (!this.state.evidenceAudits) this.state.evidenceAudits = {};
        let list = Object.values(this.state.evidenceAudits);

        if (filter?.collectionId) {
          list = list.filter(a => a.collectionId === filter.collectionId);
        }
        if (filter?.tenantId) {
          list = list.filter(a => a.tenantId === filter.tenantId);
        }
        if (filter?.action) {
          list = list.filter(a => a.action === filter.action);
        }
        if (filter?.asOfDate) {
          list = list.filter(a => a.asOfDate <= filter.asOfDate!);
        }

        list.sort((a, b) => {
          if (b.timestamp !== a.timestamp) {
            return b.timestamp.localeCompare(a.timestamp);
          }
          return b.auditId.localeCompare(a.auditId);
        });

        return JSON.parse(JSON.stringify(list));
      },
      save: async (audit: EvidenceAuditRecord) => {
        if (!this.state.evidenceAudits) this.state.evidenceAudits = {};
        if (this.state.evidenceAudits[audit.auditId]) {
          throw new Error(`Evidence audit record with ID "${audit.auditId}" already exists. Append-only enforced.`);
        }
        this.state.evidenceAudits[audit.auditId] = JSON.parse(JSON.stringify(audit));
        this.flushToDisk();
        return JSON.parse(JSON.stringify(this.state.evidenceAudits[audit.auditId]));
      },
      count: async () => {
        if (!this.state.evidenceAudits) this.state.evidenceAudits = {};
        return Object.keys(this.state.evidenceAudits).length;
      }
    };
  }
}

