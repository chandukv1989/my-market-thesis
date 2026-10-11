/**
 * Phase 17: Authorization Service
 * 
 * Enforces strict server-side resource ownership verification,
 * preventing Insecure Direct Object References (IDOR) across all private assets.
 */

import { persistenceManager } from '../persistence/persistenceManager';
import { evaluateAccess, normalizePrincipalId, resolveOwnerId, OwnedRecordLike } from './accessPolicy';
import { watchlistAlertService } from '../services/alerts/watchlistAlertService';
import { quantStrategyEngine } from '../services/quant/quantStrategyEngine';
import { backtestService } from '../services/backtest/backtestService';
import { researchNotebookService } from '../services/research/notebookService';
import { documentRegistry } from '../services/documents/documentRegistry';
import { ResearchDocument, ResearchNotebook, ResearchSnapshot, InvestmentDecisionAssessment, Strategy, QuantStrategy, BacktestResult, AlertItem, CanonicalWatchlistItem, AlertRule, AlertEvent, InvestmentMonitor, MonitoringPolicy, AlertInstance, ResearchPrioritySnapshot } from '../../src/types';

export class AuthorizationError extends Error {
  constructor(
    message: string = 'Access denied: You do not own this resource',
    public statusCode: number = 403,
    public code: string = 'FORBIDDEN'
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthorizationService {
  private static instance: AuthorizationService;

  public static getInstance(): AuthorizationService {
    if (!AuthorizationService.instance) {
      AuthorizationService.instance = new AuthorizationService();
    }
    return AuthorizationService.instance;
  }


  /**
   * Central fail-closed ownership check (Phase 38.2A).
   * - no principal            -> 403 (the HTTP gate has already answered 401)
   * - owner mismatch          -> 403
   * - no owner, not SHARED    -> 403 LEGACY_UNOWNED (restricted until ownership is assigned)
   * - SHARED                  -> read-only
   */
  private enforce<T extends OwnedRecordLike>(
    record: T,
    userId: string,
    label: string,
    mode: 'read' | 'write',
    opts: { allowShared?: boolean } = {}
  ): T {
    const decision = evaluateAccess(record, userId);
    switch (decision) {
      case 'OWNER':
        return record;
      case 'SHARED':
        if (mode === 'read' && opts.allowShared !== false) return record;
        throw new AuthorizationError(`Access denied: ${label} is shared read-only`, 403, 'SHARED_READ_ONLY');
      case 'NO_PRINCIPAL':
        // The HTTP gate answers 401 before any handler runs; the service-level contract (Phase 17/20) stays 403 fail-closed.
        throw new AuthorizationError('Access denied: no authenticated principal', 403, 'NO_PRINCIPAL');
      case 'LEGACY_UNOWNED':
        throw new AuthorizationError(`Access denied: ${label} has no assigned owner and is restricted`, 403, 'LEGACY_UNOWNED');
      default:
        throw new AuthorizationError(`Access denied: You do not own this ${label}`, 403, 'FORBIDDEN');
    }
  }

  /**
   * Verify document access. Documents are private to their uploader unless explicitly SHARED.
   */
  public async authorizeDocument(documentId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<ResearchDocument> {
    const doc = documentRegistry.getDocument(documentId) || await persistenceManager.getDocumentRepository().get(documentId);
    if (!doc) throw new AuthorizationError('Document not found', 404, 'NOT_FOUND');
    return this.enforce(doc as any, userId, 'document', mode) as ResearchDocument;
  }

  /** Verify research notebook ownership. */
  public async authorizeNotebook(notebookId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<ResearchNotebook> {
    const notebook = await persistenceManager.getNotebookRepository().get(notebookId);
    if (!notebook) throw new AuthorizationError('Research notebook not found', 404, 'NOT_FOUND');
    return this.enforce(notebook as any, userId, 'notebook', mode) as ResearchNotebook;
  }

  /** Verify snapshot ownership. */
  public async authorizeSnapshot(snapshotId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<ResearchSnapshot> {
    const snapshot = researchNotebookService.getSnapshot(snapshotId) || await persistenceManager.getSnapshotRepository().get(snapshotId);
    if (!snapshot) throw new AuthorizationError('Research snapshot not found', 404, 'NOT_FOUND');
    return this.enforce(snapshot as any, userId, 'snapshot', mode) as ResearchSnapshot;
  }

  /** Verify investment decision assessment ownership. */
  public async authorizeDecision(decisionId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<InvestmentDecisionAssessment> {
    const decision = await persistenceManager.getDecisionRepository().get(decisionId);
    if (!decision) throw new AuthorizationError('Decision assessment not found', 404, 'NOT_FOUND');
    return this.enforce(decision as any, userId, 'decision assessment', mode) as InvestmentDecisionAssessment;
  }

  /**
   * Verify strategy access.
   * Built-in strategies are identified by the authoritative built-in registry (NOT by a missing owner)
   * and are read-only for everyone. Custom strategies require an owner match.
   */
  public async authorizeStrategy(strategyId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<Strategy | QuantStrategy> {
    if (!normalizePrincipalId(userId)) {
      throw new AuthorizationError('Access denied: no authenticated principal', 403, 'NO_PRINCIPAL');
    }
    const isBuiltin = quantStrategyEngine.getBuiltinStrategies().some(b => b.strategyId === strategyId);
    if (isBuiltin) {
      if (mode === 'write') {
        throw new AuthorizationError('Access denied: built-in strategies are read-only', 403, 'BUILTIN_READ_ONLY');
      }
      return { ...quantStrategyEngine.getStrategy(strategyId)!, isBuiltIn: true };
    }

    let strategy: Strategy | QuantStrategy | null = await persistenceManager.getStrategyRepository().get(strategyId);
    if (!strategy) strategy = quantStrategyEngine.getStrategy(strategyId);
    if (!strategy) throw new AuthorizationError('Strategy not found', 404, 'NOT_FOUND');

    return this.enforce(strategy as any, userId, 'strategy', mode, { allowShared: false }) as Strategy | QuantStrategy;
  }

  /** Verify backtest result access. */
  public async authorizeBacktest(backtestId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<BacktestResult> {
    const backtest = backtestService.getBacktest(backtestId) || await persistenceManager.getBacktestRepository().get(backtestId);
    if (!backtest) throw new AuthorizationError('Backtest result not found', 404, 'NOT_FOUND');
    return this.enforce(backtest as any, userId, 'backtest result', mode) as BacktestResult;
  }

  /** Verify alert ownership. */
  public async authorizeAlert(alertId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<AlertItem> {
    const alert = await persistenceManager.getAlertRepository().get(alertId);
    if (!alert) throw new AuthorizationError('Alert not found', 404, 'NOT_FOUND');
    return this.enforce(alert as any, userId, 'alert', mode) as AlertItem;
  }

  /** Verify watchlist item ownership. */
  public async authorizeWatchlistItem(itemId: string, userId: string, mode: 'read' | 'write' = 'write'): Promise<CanonicalWatchlistItem> {
    const item = watchlistAlertService.getWatchlistItem(itemId, userId);
    if (!item) throw new AuthorizationError('Watchlist item not found', 404, 'NOT_FOUND');
    return this.enforce(item as any, userId, 'watchlist item', mode) as CanonicalWatchlistItem;
  }

  /** Verify alert rule ownership. */
  public async authorizeAlertRule(ruleId: string, userId: string, mode: 'read' | 'write' = 'write'): Promise<AlertRule> {
    const rule = watchlistAlertService.getAlertRule(ruleId);
    if (!rule) throw new AuthorizationError('Alert rule not found', 404, 'NOT_FOUND');
    return this.enforce(rule as any, userId, 'alert rule', mode) as AlertRule;
  }

  /** Verify alert event ownership. */
  public async authorizeAlertEvent(eventId: string, userId: string, mode: 'read' | 'write' = 'write'): Promise<AlertEvent> {
    const event = watchlistAlertService.getAlertEvent(eventId);
    if (!event) throw new AuthorizationError('Alert event not found', 404, 'NOT_FOUND');
    return this.enforce(event as any, userId, 'alert event', mode) as AlertEvent;
  }

  /** Verify monitor ownership. */
  public async authorizeMonitor(monitorId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<InvestmentMonitor> {
    const monitor = await persistenceManager.getMonitorRepository().get(monitorId);
    if (!monitor) throw new AuthorizationError('Monitor not found', 404, 'NOT_FOUND');
    return this.enforce(monitor as any, userId, 'monitor', mode) as InvestmentMonitor;
  }

  /** Verify monitoring policy ownership. */
  public async authorizePolicy(policyId: string, userId: string, mode: 'read' | 'write' = 'write'): Promise<MonitoringPolicy> {
    const policy = await persistenceManager.getPolicyRepository().get(policyId);
    if (!policy) throw new AuthorizationError('Monitoring policy not found', 404, 'NOT_FOUND');
    return this.enforce(policy as any, userId, 'monitoring policy', mode) as MonitoringPolicy;
  }

  /** Verify orchestrated alert ownership. */
  public async authorizeOrchestratedAlert(alertId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<AlertInstance> {
    const alert = await persistenceManager.getAlertOrchestrationRepository().get(alertId);
    if (!alert) throw new AuthorizationError('Orchestrated alert not found', 404, 'NOT_FOUND');
    return this.enforce(alert as any, userId, 'orchestrated alert', mode) as AlertInstance;
  }

  /** Verify research priority snapshot ownership. */
  public async authorizeResearchPrioritySnapshot(snapshotId: string, userId: string, mode: 'read' | 'write' = 'read'): Promise<ResearchPrioritySnapshot> {
    const snapshot = await persistenceManager.getResearchPriorityRepository().getSnapshot(snapshotId);
    if (!snapshot) throw new AuthorizationError('Research priority snapshot not found', 404, 'NOT_FOUND');
    return this.enforce(snapshot as any, userId, 'research priority snapshot', mode, { allowShared: false }) as ResearchPrioritySnapshot;
  }
}

export const authorizationService = AuthorizationService.getInstance();
