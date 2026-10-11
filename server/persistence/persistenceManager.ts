/**
 * Phase 16: Persistence Manager (Central Facade)
 * 
 * Manages database initialization, adapter selection (PostgreSQL vs Development Adapter),
 * seeding of canonical assets, and repository access.
 * 
 * Strict Guarantees:
 * - Credentials never leak.
 * - Always accurately reports adapter state in status endpoint.
 * - Seamless fallback to disk-backed DevelopmentPersistenceAdapter when PostgreSQL is unconfigured.
 */

import fs from 'fs';
import path from 'path';
import { IPersistenceAdapter } from './types';
import { PostgresPersistenceAdapter } from './postgres/postgresAdapter';
import { DevelopmentPersistenceAdapter } from './devAdapter/developmentPersistenceAdapter';
import { CANONICAL_SECURITIES } from '../../src/data/canonicalSecurities';
import { PersistenceStatusResponse, StorageHealth, StorageMode } from '../../src/types';

/**
 * Phase 38.2B storage policy
 * --------------------------
 * 1. PERSISTENCE_MODE=disk              -> disk store, explicit operator choice (even if DATABASE_URL is set).
 * 2. DATABASE_URL not configured        -> disk store (development). In production this is refused: a production
 *                                          deployment must either configure PostgreSQL or explicitly choose disk.
 * 3. DATABASE_URL configured            -> PostgreSQL MUST be honoured.
 *      - connected                      -> POSTGRES.
 *      - unavailable, strict            -> startup FAILS (PersistenceUnavailableError). Strict = NODE_ENV=production
 *                                          or PERSISTENCE_STRICT=true. No write ever lands on disk.
 *      - unavailable, non-strict (dev)  -> DISK_DEGRADED_FALLBACK: reported loudly through status/health as
 *                                          degraded and NON-authoritative, a marker file is written next to the
 *                                          store, and the manager never switches backends later in the same
 *                                          process (no write splitting inside a process). Data written in this mode
 *                                          is not reconciled into PostgreSQL by this application.
 */
export class PersistenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceUnavailableError';
  }
}

export interface PersistenceManagerOptions {
  env?: NodeJS.ProcessEnv;
  createPostgresAdapter?: () => IPersistenceAdapter;
  createDiskAdapter?: () => IPersistenceAdapter;
}

export const DEGRADED_MARKER_FILE = 'DEGRADED_FALLBACK.marker.json';

export class PersistenceManager {
  private static instance: PersistenceManager;
  private adapter: IPersistenceAdapter | null = null;
  private isInitialized = false;
  private storageMode: StorageMode = 'DISK_UNCONFIGURED';
  private degradedReason: string | undefined;
  private readonly env: NodeJS.ProcessEnv;
  private readonly makePostgres: () => IPersistenceAdapter;
  private readonly makeDisk: () => IPersistenceAdapter;

  constructor(options: PersistenceManagerOptions = {}) {
    this.env = options.env || process.env;
    this.makePostgres = options.createPostgresAdapter || (() => new PostgresPersistenceAdapter());
    this.makeDisk = options.createDiskAdapter || (() => new DevelopmentPersistenceAdapter());
  }

  public static getInstance(): PersistenceManager {
    if (!PersistenceManager.instance) {
      PersistenceManager.instance = new PersistenceManager();
    }
    return PersistenceManager.instance;
  }

  private isPostgresConfigured(): boolean {
    const raw = this.env.DATABASE_URL?.trim();
    return Boolean(raw && raw.startsWith('postgres'));
  }

  private isStrict(): boolean {
    return this.env.NODE_ENV === 'production' || this.env.PERSISTENCE_STRICT === 'true';
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized && this.adapter) {
      return;
    }

    const explicitDisk = (this.env.PERSISTENCE_MODE || '').toLowerCase() === 'disk';

    if (explicitDisk) {
      console.log('[PersistenceManager] PERSISTENCE_MODE=disk: using the disk-backed Development Persistence Adapter (explicit).');
      this.adapter = await this.startDisk();
      this.storageMode = 'DISK_EXPLICIT';
    } else if (!this.isPostgresConfigured()) {
      if (this.env.NODE_ENV === 'production') {
        throw new PersistenceUnavailableError(
          'Refusing to start in production without durable storage: set DATABASE_URL (PostgreSQL) or explicitly choose PERSISTENCE_MODE=disk.'
        );
      }
      console.log('[PersistenceManager] DATABASE_URL not configured. Initializing disk-backed Development Persistence Adapter.');
      this.adapter = await this.startDisk();
      this.storageMode = 'DISK_UNCONFIGURED';
    } else {
      try {
        console.log('[PersistenceManager] Attempting to connect to PostgreSQL database...');
        const pgAdapter = this.makePostgres();
        await pgAdapter.initialize();
        this.adapter = pgAdapter;
        this.storageMode = 'POSTGRES';
        console.log('[PersistenceManager] Successfully connected to PostgreSQL.');
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (this.isStrict()) {
          // Never fall back to disk: writes made during an outage would silently disappear once PostgreSQL returns.
          throw new PersistenceUnavailableError(
            `PostgreSQL is configured but unavailable (${reason}). Refusing to start with a non-authoritative disk store. ` +
            'Fix the database, or set PERSISTENCE_MODE=disk to explicitly choose the development store.'
          );
        }
        console.error(`[PersistenceManager] PostgreSQL is configured but unavailable (${reason}). Entering DEGRADED disk-backed mode: writes are NOT authoritative.`);
        this.adapter = await this.startDisk();
        this.storageMode = 'DISK_DEGRADED_FALLBACK';
        this.degradedReason = `PostgreSQL configured but unavailable: ${reason}`;
        this.writeDegradedMarker();
      }
    }

    this.isInitialized = true;

    // Seed canonical securities if repository is empty
    await this.seedInitialSecurities();
  }

  private async startDisk(): Promise<IPersistenceAdapter> {
    const disk = this.makeDisk();
    await disk.initialize();
    return disk;
  }

  private writeDegradedMarker(): void {
    try {
      const dir = (this.adapter as any)?.getStorageDir?.();
      if (!dir) return;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, DEGRADED_MARKER_FILE),
        JSON.stringify({ since: new Date().toISOString(), reason: this.degradedReason, note: 'Writes in this directory were made while PostgreSQL was configured but unavailable. They are NOT authoritative and are not reconciled automatically.' }, null, 2)
      );
    } catch (err) {
      console.error('[PersistenceManager] Could not write degraded-mode marker:', err);
    }
  }

  /** Truthful description of the backend that is actually serving requests. */
  public getStorageHealth(): StorageHealth {
    const mode = this.storageMode;
    const degraded = mode === 'DISK_DEGRADED_FALLBACK';
    const warnings: string[] = [];
    if (degraded) {
      warnings.push('PostgreSQL is configured but unavailable: writes are going to a NON-authoritative disk store and will not appear in PostgreSQL.');
    }
    if (mode === 'DISK_UNCONFIGURED' || mode === 'DISK_EXPLICIT') {
      warnings.push('Development disk store is in use; it is not a durable multi-user production store.');
    }
    return {
      mode,
      degraded,
      authoritative: mode === 'POSTGRES' || ((mode === 'DISK_EXPLICIT' || mode === 'DISK_UNCONFIGURED') && !degraded),
      reason: this.degradedReason,
      warnings
    };
  }

  /**
   * Seed canonical securities from the canonical dataset if repo is empty
   */
  public async seedInitialSecurities(): Promise<void> {
    try {
      const secRepo = this.getAdapter().getSecurityRepository();
      const count = await secRepo.count();
      if (count === 0) {
        console.log(`[PersistenceManager] Seeding ${CANONICAL_SECURITIES.length} canonical securities into persistence...`);
        await secRepo.saveMany(CANONICAL_SECURITIES);
      }
    } catch (err) {
      console.error('[PersistenceManager] Error seeding canonical securities:', err);
    }
  }

  public getAdapter(): IPersistenceAdapter {
    if (!this.adapter) {
      if (this.isStrict()) {
        throw new PersistenceUnavailableError('Persistence was used before initialize(); refusing to create an implicit disk store in strict mode.');
      }
      // Development convenience: implicit disk adapter. If PostgreSQL is configured this is DEGRADED and reported as such.
      const devAdapter = this.makeDisk();
      void devAdapter.initialize();
      this.adapter = devAdapter;
      if (this.isPostgresConfigured() && (this.env.PERSISTENCE_MODE || '').toLowerCase() !== 'disk') {
        this.storageMode = 'DISK_DEGRADED_FALLBACK';
        this.degradedReason = 'Persistence used before initialize(); implicit disk store created while PostgreSQL is configured.';
        this.writeDegradedMarker();
      } else {
        this.storageMode = (this.env.PERSISTENCE_MODE || '').toLowerCase() === 'disk' ? 'DISK_EXPLICIT' : 'DISK_UNCONFIGURED';
      }
    }
    return this.adapter;
  }

  /**
   * Set custom adapter (primarily for testing)
   */
  public setAdapter(adapter: IPersistenceAdapter): void {
    this.adapter = adapter;
    this.isInitialized = true;
    this.degradedReason = undefined;
    this.storageMode = adapter.provider === 'POSTGRES' ? 'POSTGRES' : 'DISK_EXPLICIT';
  }

  public async getStatus(): Promise<PersistenceStatusResponse> {
    const base = await this.getAdapter().getStatus();
    const storage = this.getStorageHealth();
    return {
      ...base,
      status: storage.degraded ? 'DEGRADED_FALLBACK' : base.status,
      storage
    };
  }

  public async healthCheck(): Promise<boolean> {
    return this.getAdapter().healthCheck();
  }

  public async shutdown(): Promise<void> {
    if (this.adapter) {
      await this.adapter.shutdown();
      this.isInitialized = false;
    }
  }

  // Repository Accessors
  public getSecurityRepository() { return this.getAdapter().getSecurityRepository(); }
  public getDocumentRepository() { return this.getAdapter().getDocumentRepository(); }
  public getEvidenceRepository() { return this.getAdapter().getEvidenceRepository(); }
  public getNotebookRepository() { return this.getAdapter().getNotebookRepository(); }
  public getSnapshotRepository() { return this.getAdapter().getSnapshotRepository(); }
  public getDecisionRepository() { return this.getAdapter().getDecisionRepository(); }
  public getStrategyRepository() { return this.getAdapter().getStrategyRepository(); }
  public getBacktestRepository() { return this.getAdapter().getBacktestRepository(); }
  public getWatchlistRepository() { return this.getAdapter().getWatchlistRepository(); }
  public getAlertRepository() { return this.getAdapter().getAlertRepository(); }
  public getPortfolioRepository() { return this.getAdapter().getPortfolioRepository(); }
  public getQueryRepository() { return this.getAdapter().getQueryRepository(); }
  public getUserRepository() { return this.getAdapter().getUserRepository(); }
  public getSessionRepository() { return this.getAdapter().getSessionRepository(); }
  public getEventRepository() { return this.getAdapter().getEventRepository(); }
  public getMonitorRepository() { return this.getAdapter().getMonitorRepository(); }
  public getMonitorReviewRepository() { return this.getAdapter().getMonitorReviewRepository(); }
  public getInvestmentMonitorRepository() { return this.getAdapter().getMonitorRepository(); }
  public getInvestmentMonitorReviewRepository() { return this.getAdapter().getMonitorReviewRepository(); }
  public getPolicyRepository() { return this.getAdapter().getPolicyRepository(); }
  public getAlertOrchestrationRepository() { return this.getAdapter().getAlertOrchestrationRepository(); }
  public getResearchPriorityRepository() { return this.getAdapter().getResearchPriorityRepository(); }
  public getCrossInvestmentSnapshotRepository() { return this.getAdapter().getCrossInvestmentSnapshotRepository(); }
  public getPortfolioScenarioRepository() { return this.getAdapter().getPortfolioScenarioRepository(); }
  public getCounterfactualRepository() { return this.getAdapter().getCounterfactualRepository(); }
  public getResearchMemoryRepository() { return this.getAdapter().getResearchMemoryRepository(); }
  public getResearchQuestionRepository() { return this.getAdapter().getResearchQuestionRepository(); }
  public getResearchGapRepository() { return this.getAdapter().getResearchGapRepository(); }
  public getInvestigationPlanRepository() { return this.getAdapter().getInvestigationPlanRepository(); }
  public getInvestigationAuditRepository() { return this.getAdapter().getInvestigationAuditRepository(); }
  public getEvidenceCollectionRepository() { return this.getAdapter().getEvidenceCollectionRepository(); }
  public getEvidenceRelationshipRepository() { return this.getAdapter().getEvidenceRelationshipRepository(); }
  public getEvidenceAuditRepository() { return this.getAdapter().getEvidenceAuditRepository(); }
  public runTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.getAdapter().runTransaction(work);
  }
}

export const persistenceManager = PersistenceManager.getInstance();
