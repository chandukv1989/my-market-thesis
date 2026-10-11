/**
 * Phase 16: PostgreSQL Persistence Adapter
 * 
 * Production adapter for real PostgreSQL database connections.
 * Automatically runs idempotent versioned migrations on initialization.
 */

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
  PersistenceStatusResponse,
  PersistenceStatusCode,
  PersistenceProviderType
} from '../../../src/types';
import { PostgresClient } from './postgresClient';
import { MigrationRunner } from '../migrations/migrationRunner';
import { MIGRATIONS, Migration } from '../migrations/schema';
import {
  PostgresSecurityRepository,
  PostgresResearchDocumentRepository,
  PostgresEvidenceRepository,
  PostgresResearchNotebookRepository,
  PostgresResearchSnapshotRepository,
  PostgresDecisionRepository,
  PostgresStrategyRepository,
  PostgresBacktestRepository,
  PostgresWatchlistRepository,
  PostgresAlertRepository,
  PostgresPortfolioRepository,
  PostgresResearchQueryRepository,
  PostgresUserRepository,
  PostgresSessionRepository,
  PostgresInvestmentEventRepository,
  PostgresInvestmentMonitorRepository,
  PostgresInvestmentMonitorReviewRepository,
  PostgresMonitoringPolicyRepository,
  PostgresAlertOrchestrationRepository,
  PostgresResearchPriorityRepository,
  PostgresCrossInvestmentSnapshotRepository,
  PostgresPortfolioScenarioRepository,
  PostgresCounterfactualRepository,
  PostgresResearchMemoryRepository,
  PostgresResearchQuestionRepository,
  PostgresResearchGapRepository,
  PostgresInvestigationPlanRepository,
  PostgresInvestigationAuditRepository,
  PostgresEvidenceCollectionRepository,
  PostgresEvidenceRelationshipRepository,
  PostgresEvidenceAuditRepository
} from './postgresRepositories';
import { getDatabaseConfig } from '../databaseConfig';

export class PostgresPersistenceAdapter implements IPersistenceAdapter {
  public readonly status: PersistenceStatusCode = 'CONNECTED';
  public readonly provider: PersistenceProviderType = 'POSTGRES';

  private client: PostgresClient;
  private migrationRunner: MigrationRunner | null = null;
  private currentMigrationVersion = 0;

  private securityRepo!: ISecurityRepository;
  private documentRepo!: IResearchDocumentRepository;
  private evidenceRepo!: IPersistentEvidenceRepository;
  private notebookRepo!: IResearchNotebookRepository;
  private snapshotRepo!: IResearchSnapshotRepository;
  private decisionRepo!: IDecisionRepository;
  private strategyRepo!: IStrategyRepository;
  private backtestRepo!: IBacktestRepository;
  private watchlistRepo!: IWatchlistRepository;
  private alertRepo!: IAlertRepository;
  private portfolioRepo!: IPortfolioRepository;
  private queryRepo!: IResearchQueryRepository;
  private userRepo!: IUserRepository;
  private sessionRepo!: ISessionRepository;
  private eventRepo!: IInvestmentEventRepository;
  private monitorRepo!: IInvestmentMonitorRepository;
  private monitorReviewRepo!: IInvestmentMonitorReviewRepository;
  private policyRepo!: IMonitoringPolicyRepository;
  private alertOrchestrationRepo!: IAlertOrchestrationRepository;
  private researchPriorityRepo!: IResearchPriorityRepository;
  private crossInvestmentSnapshotRepo!: ICrossInvestmentSnapshotRepository;
  private portfolioScenarioRepo!: IPortfolioScenarioRepository;
  private counterfactualRepo!: ICounterfactualRepository;
  private researchMemoryRepo!: IResearchMemoryRepository;
  private researchQuestionRepo!: IResearchQuestionRepository;
  private researchGapRepo!: IResearchGapRepository;
  private investigationPlanRepo!: IInvestigationPlanRepository;
  private investigationAuditRepo!: IInvestigationAuditRepository;
  private evidenceCollectionRepo!: IEvidenceCollectionRepository;
  private evidenceRelationshipRepo!: IEvidenceRelationshipRepository;
  private evidenceAuditRepo!: IEvidenceAuditRepository;

  private migrations: Migration[];

  constructor(client?: PostgresClient, options: { migrations?: Migration[] } = {}) {
    this.client = client || new PostgresClient();
    this.migrations = options.migrations || MIGRATIONS;
  }

  public get isConnected(): boolean {
    return this.client.isConnected();
  }

  public async initialize(): Promise<void> {
    const connected = await this.client.connect();
    if (!connected) {
      throw new Error('Failed to connect to PostgreSQL database.');
    }

    // Run migrations
    this.migrationRunner = new MigrationRunner(this.client.getPool(), this.migrations);
    const migrationResult = await this.migrationRunner.runMigrations();
    this.currentMigrationVersion = migrationResult.currentVersion;

    // Instantiate repositories
    this.securityRepo = new PostgresSecurityRepository(this.client);
    this.documentRepo = new PostgresResearchDocumentRepository(this.client);
    this.evidenceRepo = new PostgresEvidenceRepository(this.client);
    this.notebookRepo = new PostgresResearchNotebookRepository(this.client);
    this.snapshotRepo = new PostgresResearchSnapshotRepository(this.client);
    this.decisionRepo = new PostgresDecisionRepository(this.client);
    this.strategyRepo = new PostgresStrategyRepository(this.client);
    this.backtestRepo = new PostgresBacktestRepository(this.client);
    this.watchlistRepo = new PostgresWatchlistRepository(this.client);
    this.alertRepo = new PostgresAlertRepository(this.client);
    this.portfolioRepo = new PostgresPortfolioRepository(this.client);
    this.queryRepo = new PostgresResearchQueryRepository(this.client);
    this.userRepo = new PostgresUserRepository(this.client);
    this.sessionRepo = new PostgresSessionRepository(this.client);
    this.eventRepo = new PostgresInvestmentEventRepository(this.client);
    this.monitorRepo = new PostgresInvestmentMonitorRepository(this.client);
    this.monitorReviewRepo = new PostgresInvestmentMonitorReviewRepository(this.client);
    this.policyRepo = new PostgresMonitoringPolicyRepository(this.client);
    this.alertOrchestrationRepo = new PostgresAlertOrchestrationRepository(this.client);
    this.researchPriorityRepo = new PostgresResearchPriorityRepository(this.client);
    this.crossInvestmentSnapshotRepo = new PostgresCrossInvestmentSnapshotRepository(this.client);
    this.portfolioScenarioRepo = new PostgresPortfolioScenarioRepository(this.client);
    this.counterfactualRepo = new PostgresCounterfactualRepository(this.client);
    this.researchMemoryRepo = new PostgresResearchMemoryRepository(this.client);
    this.researchQuestionRepo = new PostgresResearchQuestionRepository(this.client);
    this.researchGapRepo = new PostgresResearchGapRepository(this.client);
    this.investigationPlanRepo = new PostgresInvestigationPlanRepository(this.client);
    this.investigationAuditRepo = new PostgresInvestigationAuditRepository(this.client);
    this.evidenceCollectionRepo = new PostgresEvidenceCollectionRepository(this.client);
    this.evidenceRelationshipRepo = new PostgresEvidenceRelationshipRepository(this.client);
    this.evidenceAuditRepo = new PostgresEvidenceAuditRepository(this.client);
  }

  public async shutdown(): Promise<void> {
    await this.client.close();
  }

  public async healthCheck(): Promise<boolean> {
    return this.client.healthCheck();
  }

  /**
   * `work` may call any repository of this adapter; those calls execute on the transaction's single connection
   * (PostgresClient routes queries through the active transaction context).
   */
  public async runTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.client.runTransaction(async () => work());
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

  public async getStatus(): Promise<PersistenceStatusResponse> {
    const config = getDatabaseConfig();

    let counts: any = {
      securities: 0,
      documents: 0,
      evidence: 0,
      notebooks: 0,
      snapshots: 0,
      decisions: 0,
      strategies: 0,
      backtests: 0,
      alerts: 0,
      queries: 0,
      events: 0,
      monitors: 0,
      reviews: 0,
      policies: 0,
      orchestratedAlerts: 0,
      researchPriorities: 0
    };

    if (this.isConnected) {
      try {
        const [
          securities,
          documents,
          evidence,
          notebooks,
          snapshots,
          decisions,
          strategies,
          backtests,
          alerts,
          queries,
          events,
          monitors,
          reviews,
          policies,
          orchestratedAlerts,
          researchPriorities
        ] = await Promise.all([
          this.securityRepo.count(),
          this.documentRepo.count(),
          this.evidenceRepo.count(),
          this.notebookRepo.count(),
          this.snapshotRepo.count(),
          this.decisionRepo.count(),
          this.strategyRepo.count(),
          this.backtestRepo.count(),
          this.alertRepo.count(),
          this.queryRepo.count(),
          this.eventRepo.count(),
          this.monitorRepo ? this.monitorRepo.count() : 0,
          this.monitorReviewRepo ? this.monitorReviewRepo.count() : 0,
          this.policyRepo ? this.policyRepo.count() : 0,
          this.alertOrchestrationRepo ? this.alertOrchestrationRepo.count() : 0,
          this.researchPriorityRepo ? this.researchPriorityRepo.count() : 0
        ]);
        counts = {
          securities,
          documents,
          evidence,
          notebooks,
          snapshots,
          decisions,
          strategies,
          backtests,
          alerts,
          queries,
          events,
          monitors,
          reviews,
          policies,
          orchestratedAlerts,
          researchPriorities
        };
      } catch (err) {
        console.error('[PostgresPersistenceAdapter] Failed to gather counts:', err);
      }
    }

    return {
      status: this.isConnected ? 'CONNECTED' : 'ERROR',
      provider: 'POSTGRES',
      environment: process.env.NODE_ENV || 'development',
      isPostgresConfigured: config.isConfigured,
      migrationVersion: this.currentMigrationVersion,
      entityCounts: counts,
      details: {
        diskBacked: false,
        schemaVersion: '1.0.0'
      }
    };
  }
}
