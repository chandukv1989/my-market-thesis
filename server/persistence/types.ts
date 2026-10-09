/**
 * Phase 16: Persistence Layer Repository Interfaces & Domain Contracts
 * 
 * Strict architectural boundaries:
 * - Domain services depend on repository interfaces, never directly on SQL.
 * - Historical artifacts (Evidence, Snapshots, Decisions, Backtests) are immutable.
 * - Point-in-time timestamps and epistemic provenance are preserved.
 */

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
  ResearchPriorityItem,
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
} from '../../src/types';

export interface ISecurityRepository {
  get(id: string): Promise<CanonicalSecurity | null>;
  getByTicker(ticker: string, market?: string): Promise<CanonicalSecurity | null>;
  getAll(): Promise<CanonicalSecurity[]>;
  save(security: CanonicalSecurity): Promise<CanonicalSecurity>;
  saveMany(securities: CanonicalSecurity[]): Promise<number>;
  count(): Promise<number>;
}

export interface IResearchDocumentRepository {
  get(documentId: string): Promise<ResearchDocument | null>;
  getByHash(contentHash: string): Promise<ResearchDocument | null>;
  getAll(filter?: { securityId?: string; documentType?: string; userId?: string }): Promise<ResearchDocument[]>;
  save(doc: ResearchDocument): Promise<{ saved: boolean; isDuplicate: boolean; document: ResearchDocument }>;
  updateStatus(documentId: string, status: DocumentProcessingStatus, metadata?: any): Promise<boolean>;
  count(): Promise<number>;
}

export interface IPersistentEvidenceRepository {
  addEvidence(item: EvidenceItem): Promise<boolean>;
  getEvidence(evidenceId: string): Promise<EvidenceItem | null>;
  get?(evidenceId: string): Promise<EvidenceItem | null>;
  queryEvidence(filter: EvidenceFilter): Promise<EvidenceItem[]>;
  getBySecurityId?(securityId: string, asOfDate?: string): Promise<EvidenceItem[]>;
  getHistoricalEvidence(evidenceId: string, asOfDate?: string): Promise<EvidenceItem | null>;
  getEvidenceLineage(evidenceId: string): Promise<EvidenceItem[]>;
  count(): Promise<number>;
  getAll(): Promise<EvidenceItem[]>;
}

export interface IResearchNotebookRepository {
  get(notebookId: string): Promise<ResearchNotebook | null>;
  getBySecurityId(securityId: string): Promise<ResearchNotebook | null>;
  save(notebook: ResearchNotebook): Promise<ResearchNotebook>;
  getAll(): Promise<ResearchNotebook[]>;
  count(): Promise<number>;
}

export interface IResearchSnapshotRepository {
  get(snapshotId: string): Promise<ResearchSnapshot | null>;
  getByNotebookId(notebookId: string): Promise<ResearchSnapshot[]>;
  getBySecurityId(securityId: string): Promise<ResearchSnapshot[]>;
  getLatest(securityId: string, asOfDate?: string): Promise<ResearchSnapshot | null>;
  save(snapshot: ResearchSnapshot): Promise<ResearchSnapshot>; // IMMUTABLE
  getAll(): Promise<ResearchSnapshot[]>;
  count(): Promise<number>;
}

export interface IDecisionRepository {
  get(decisionId: string): Promise<InvestmentDecisionAssessment | null>;
  getLatest(securityId: string, asOfDate?: string): Promise<InvestmentDecisionAssessment | null>;
  getHistory(securityId: string): Promise<InvestmentDecisionAssessment[]>;
  save(decision: InvestmentDecisionAssessment): Promise<InvestmentDecisionAssessment>; // IMMUTABLE
  getAll(): Promise<InvestmentDecisionAssessment[]>;
  count(): Promise<number>;
}

export interface IStrategyRepository {
  get(strategyId: string, version?: string): Promise<Strategy | null>;
  getAll(): Promise<Strategy[]>;
  save(strategy: Strategy): Promise<Strategy>;
  count(): Promise<number>;
}

export interface IBacktestRepository {
  get(backtestId: string): Promise<BacktestResult | null>;
  getByStrategyId(strategyId: string): Promise<BacktestResult[]>;
  getAll(): Promise<BacktestResult[]>;
  save(backtest: BacktestResult): Promise<BacktestResult>; // IMMUTABLE
  count(): Promise<number>;
}

export interface IWatchlistRepository {
  getWatchlist(id?: string): Promise<string[]>;
  saveWatchlist(tickers: string[], id?: string): Promise<void>;
  addTicker(ticker: string, id?: string): Promise<void>;
  removeTicker(ticker: string, id?: string): Promise<void>;
}

export interface IAlertRepository {
  get(alertId: string): Promise<AlertItem | null>;
  getAll(): Promise<AlertItem[]>;
  save(alert: AlertItem): Promise<AlertItem>;
  saveMany(alerts: AlertItem[]): Promise<number>;
  update(alertId: string, updates: Partial<AlertItem>): Promise<boolean>;
  count(): Promise<number>;
}

export interface IPortfolioRepository {
  getPositions(portfolioId?: string): Promise<HoldingPosition[]>;
  savePositions(positions: HoldingPosition[], portfolioId?: string): Promise<void>;
  updatePosition(ticker: string, shares: number, avgCost: number, portfolioId?: string): Promise<void>;
}

export interface IResearchQueryRepository {
  get(queryId: string): Promise<ResearchQueryItem | null>;
  getAll(): Promise<ResearchQueryItem[]>;
  save(query: ResearchQueryItem): Promise<ResearchQueryItem>;
  count(): Promise<number>;
}

export interface IUserRepository {
  get(userId: string): Promise<User | null>;
  getByEmail(normalizedEmail: string): Promise<User | null>;
  save(user: User): Promise<User>;
  update(userId: string, updates: Partial<User>): Promise<boolean>;
  count(): Promise<number>;
  getAll(): Promise<User[]>;
}

export interface ISessionRepository {
  get(sessionId: string): Promise<AuthenticatedSession | null>;
  save(session: AuthenticatedSession): Promise<AuthenticatedSession>;
  invalidate(sessionId: string): Promise<boolean>;
  invalidateAllForUser(userId: string): Promise<number>;
  cleanupExpired(): Promise<number>;
  count(): Promise<number>;
  getAll(): Promise<AuthenticatedSession[]>;
}

export interface IInvestmentEventRepository {
  get(eventId: string): Promise<InvestmentEvent | null>;
  getBySecurityId(securityId: string, asOfDate?: string): Promise<InvestmentEvent[]>;
  getAll(): Promise<InvestmentEvent[]>;
  save(event: InvestmentEvent): Promise<InvestmentEvent>; // IMMUTABLE
  saveBatch(events: InvestmentEvent[]): Promise<number>;
  count(): Promise<number>;
}

export interface IInvestmentMonitorRepository {
  get(monitorId: string): Promise<InvestmentMonitor | null>;
  getBySecurityId(securityId: string, userId?: string): Promise<InvestmentMonitor | null>;
  getByUserId(userId: string): Promise<InvestmentMonitor[]>;
  getAll(): Promise<InvestmentMonitor[]>;
  save(monitor: InvestmentMonitor): Promise<InvestmentMonitor>;
  update(monitorId: string, updates: Partial<InvestmentMonitor>): Promise<boolean>;
  delete(monitorId: string): Promise<boolean>;
  count(): Promise<number>;
  addNote(monitorId: string, note: AnalystReviewNote): Promise<AnalystReviewNote>;
  getNotes(monitorId: string): Promise<AnalystReviewNote[]>;
}

export interface IInvestmentMonitorReviewRepository {
  get(reviewId: string): Promise<InvestmentMonitorReview | null>;
  getByMonitorId(monitorId: string): Promise<InvestmentMonitorReview[]>;
  getAll(): Promise<InvestmentMonitorReview[]>;
  save(review: InvestmentMonitorReview): Promise<InvestmentMonitorReview>; // IMMUTABLE
  count(): Promise<number>;
}

export interface IMonitoringPolicyRepository {
  get(policyId: string): Promise<MonitoringPolicy | null>;
  getByUserId(userId: string): Promise<MonitoringPolicy[]>;
  getAll(): Promise<MonitoringPolicy[]>;
  save(policy: MonitoringPolicy): Promise<MonitoringPolicy>;
  update(policyId: string, updates: Partial<MonitoringPolicy>): Promise<boolean>;
  delete(policyId: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface IAlertOrchestrationRepository {
  get(alertId: string): Promise<AlertInstance | null>;
  getByUserId(userId: string, filter?: {
    status?: AlertLifecycleStatus;
    severity?: AlertSeverity;
    monitorId?: string;
    securityId?: string;
    limit?: number;
  }): Promise<AlertInstance[]>;
  getRecentByFingerprint(fingerprint: string): Promise<AlertInstance | null>;
  getRecentByRule(userId: string, targetId: string, ruleType: AlertRuleType): Promise<AlertInstance | null>;
  getAll(): Promise<AlertInstance[]>;
  save(alert: AlertInstance): Promise<AlertInstance>;
  update(alertId: string, updates: Partial<AlertInstance>): Promise<boolean>;
  delete(alertId: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface IResearchPriorityRepository {
  getSnapshot(snapshotId: string): Promise<ResearchPrioritySnapshot | null>;
  getLatestSnapshot(userId: string, universeType?: string): Promise<ResearchPrioritySnapshot | null>;
  getSnapshotsByUserId(userId: string): Promise<ResearchPrioritySnapshot[]>;
  saveSnapshot(snapshot: ResearchPrioritySnapshot): Promise<ResearchPrioritySnapshot>;
  getAll(): Promise<ResearchPrioritySnapshot[]>;
  count(): Promise<number>;
}

export interface ICrossInvestmentSnapshotRepository {
  getSnapshot(snapshotId: string): Promise<CrossInvestmentSnapshot | null>;
  getSnapshotsByUserId(userId: string): Promise<CrossInvestmentSnapshot[]>;
  saveSnapshot(snapshot: CrossInvestmentSnapshot): Promise<CrossInvestmentSnapshot>;
  getAll(): Promise<CrossInvestmentSnapshot[]>;
  count(): Promise<number>;
}

export interface IPortfolioScenarioRepository {
  getSnapshot(snapshotId: string): Promise<PortfolioScenarioSnapshot | null>;
  getSnapshotsByUserId(userId: string): Promise<PortfolioScenarioSnapshot[]>;
  saveSnapshot(snapshot: PortfolioScenarioSnapshot): Promise<PortfolioScenarioSnapshot>;
  getAll(): Promise<PortfolioScenarioSnapshot[]>;
  count(): Promise<number>;
}

export interface ICounterfactualRepository {
  getSnapshot(snapshotId: string): Promise<CounterfactualSnapshot | null>;
  getSnapshotsByUserId(userId: string): Promise<CounterfactualSnapshot[]>;
  saveSnapshot(snapshot: CounterfactualSnapshot): Promise<CounterfactualSnapshot>;
  getAll(): Promise<CounterfactualSnapshot[]>;
  count(): Promise<number>;
}

export interface IResearchMemoryRepository {
  get(id: string): Promise<ResearchMemoryEntry | null>;
  getAll(filter?: {
    securityId?: string;
    userId?: string;
    asOfDate?: string;
    memoryType?: ResearchMemoryType;
    status?: ResearchMemoryStatus;
  }): Promise<ResearchMemoryEntry[]>;
  save(entry: ResearchMemoryEntry): Promise<ResearchMemoryEntry>; // IMMUTABLE: duplicate ID overwrite prohibited
  update(entry: ResearchMemoryEntry): Promise<ResearchMemoryEntry>;
  count(): Promise<number>;
}

export interface IResearchQuestionRepository {
  get(id: string): Promise<ResearchQuestionEntry | null>;
  getAll(filter?: {
    securityId?: string;
    userId?: string;
    status?: ResearchQuestionStatus;
    asOfDate?: string;
  }): Promise<ResearchQuestionEntry[]>;
  save(question: ResearchQuestionEntry): Promise<ResearchQuestionEntry>;
  update(question: ResearchQuestionEntry): Promise<ResearchQuestionEntry>;
  count(): Promise<number>;
}

export interface IResearchGapRepository {
  get(id: string): Promise<ResearchGapRecord | null>;
  getAll(filter?: {
    securityId?: string;
    userId?: string;
    status?: ResearchGapStatus;
    asOfDate?: string;
    gapType?: ResearchGapType;
  }): Promise<ResearchGapRecord[]>;
  save(gap: ResearchGapRecord): Promise<ResearchGapRecord>;
  update(gap: ResearchGapRecord): Promise<ResearchGapRecord>;
  count(): Promise<number>;
}

export interface IInvestigationPlanRepository {
  get(id: string): Promise<InvestigationPlan | null>;
  getAll(filter?: {
    securityId?: string;
    userId?: string;
    status?: InvestigationPlanStatus;
    asOfDate?: string;
  }): Promise<InvestigationPlan[]>;
  save(plan: InvestigationPlan): Promise<InvestigationPlan>;
  update(plan: InvestigationPlan): Promise<InvestigationPlan>;
  count(): Promise<number>;
}

export interface IInvestigationAuditRepository {
  get(id: string): Promise<InvestigationAuditRecord | null>;
  getAll(filter?: {
    targetId?: string;
    tenantId?: string;
    targetType?: string;
    asOfDate?: string;
  }): Promise<InvestigationAuditRecord[]>;
  save(audit: InvestigationAuditRecord): Promise<InvestigationAuditRecord>;
  count(): Promise<number>;
}

export interface IEvidenceCollectionRepository {
  get(collectionId: string): Promise<EvidenceCollectionRecord | null>;
  getBySourceFingerprint(fingerprint: string, tenantId?: string): Promise<EvidenceCollectionRecord | null>;
  getAll(filter?: {
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
  }): Promise<EvidenceCollectionRecord[]>;
  save(record: EvidenceCollectionRecord): Promise<EvidenceCollectionRecord>;
  update(record: EvidenceCollectionRecord): Promise<EvidenceCollectionRecord>;
  count(): Promise<number>;
}

export interface IEvidenceRelationshipRepository {
  get(relationshipId: string): Promise<EvidenceResearchRelationship | null>;
  getAll(filter?: {
    sourceId?: string;
    targetId?: string;
    targetType?: string;
    relationshipType?: EvidenceRelationshipType;
    tenantId?: string;
    asOfDate?: string;
  }): Promise<EvidenceResearchRelationship[]>;
  save(rel: EvidenceResearchRelationship): Promise<EvidenceResearchRelationship>;
  delete(relationshipId: string): Promise<boolean>;
  count(): Promise<number>;
}

export interface IEvidenceAuditRepository {
  get(auditId: string): Promise<EvidenceAuditRecord | null>;
  getAll(filter?: {
    collectionId?: string;
    tenantId?: string;
    action?: EvidenceAuditAction;
    asOfDate?: string;
  }): Promise<EvidenceAuditRecord[]>;
  save(audit: EvidenceAuditRecord): Promise<EvidenceAuditRecord>;
  count(): Promise<number>;
}

export interface IPersistenceAdapter {
  readonly status: PersistenceStatusCode;
  readonly provider: PersistenceProviderType;
  readonly isConnected: boolean;

  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<boolean>;

  runTransaction<T>(work: () => Promise<T>): Promise<T>;

  getSecurityRepository(): ISecurityRepository;
  getDocumentRepository(): IResearchDocumentRepository;
  getEvidenceRepository(): IPersistentEvidenceRepository;
  getNotebookRepository(): IResearchNotebookRepository;
  getSnapshotRepository(): IResearchSnapshotRepository;
  getDecisionRepository(): IDecisionRepository;
  getStrategyRepository(): IStrategyRepository;
  getBacktestRepository(): IBacktestRepository;
  getWatchlistRepository(): IWatchlistRepository;
  getAlertRepository(): IAlertRepository;
  getPortfolioRepository(): IPortfolioRepository;
  getQueryRepository(): IResearchQueryRepository;
  getUserRepository(): IUserRepository;
  getSessionRepository(): ISessionRepository;
  getEventRepository(): IInvestmentEventRepository;
  getMonitorRepository(): IInvestmentMonitorRepository;
  getMonitorReviewRepository(): IInvestmentMonitorReviewRepository;
  getPolicyRepository(): IMonitoringPolicyRepository;
  getAlertOrchestrationRepository(): IAlertOrchestrationRepository;
  getResearchPriorityRepository(): IResearchPriorityRepository;
  getCrossInvestmentSnapshotRepository(): ICrossInvestmentSnapshotRepository;
  getPortfolioScenarioRepository(): IPortfolioScenarioRepository;
  getCounterfactualRepository(): ICounterfactualRepository;
  getResearchMemoryRepository(): IResearchMemoryRepository;
  getResearchQuestionRepository(): IResearchQuestionRepository;
  getResearchGapRepository(): IResearchGapRepository;
  getInvestigationPlanRepository(): IInvestigationPlanRepository;
  getInvestigationAuditRepository(): IInvestigationAuditRepository;
  getEvidenceCollectionRepository(): IEvidenceCollectionRepository;
  getEvidenceRelationshipRepository(): IEvidenceRelationshipRepository;
  getEvidenceAuditRepository(): IEvidenceAuditRepository;

  getStatus(): Promise<PersistenceStatusResponse>;
}
