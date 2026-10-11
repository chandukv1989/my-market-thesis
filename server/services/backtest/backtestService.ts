/**
 * Phase 12A - Backtest Service
 * 
 * High-level service facade for deterministic backtesting operations.
 * Manages deterministic caching, parameter validation, and result retention.
 */

import { canRead, requireTenantScope, resolveOwnerId } from '../../auth/accessPolicy';
import { BacktestConfiguration, BacktestResult, HistoricalPriceBar } from '../../../src/types';
import { backtestEngine, BacktestEngine } from './backtestEngine';
import { persistenceManager } from '../../persistence/persistenceManager';

export class BacktestService {
  private static instance: BacktestService;
  private engine: BacktestEngine;
  private resultsCache: Map<string, BacktestResult> = new Map();

  private constructor() {
    this.engine = BacktestEngine.getInstance();
  }

  public static getInstance(): BacktestService {
    if (!BacktestService.instance) {
      BacktestService.instance = new BacktestService();
    }
    return BacktestService.instance;
  }

  /**
   * Run backtest with deterministic cache check.
   */
  public async runBacktest(
    config: BacktestConfiguration,
    providedBars?: HistoricalPriceBar[],
    benchmarkBars?: HistoricalPriceBar[]
  ): Promise<BacktestResult> {
    const owner = resolveOwnerId(config as any);
    const cacheKey = `${owner || 'shared'}|${this.generateCacheKey(config)}`;

    // Phase 38.2A: a caller-supplied backtestId must never overwrite another tenant's (or an unowned) result.
    if (config.backtestId) {
      const clash = this.resultsCache.get(config.backtestId);
      if (clash && resolveOwnerId(clash as any) !== owner) {
        throw new Error(`Backtest id '${config.backtestId}' is already in use.`);
      }
    }

    // If no custom provided bars and already cached, return deterministic result
    if (!providedBars && !benchmarkBars && this.resultsCache.has(cacheKey)) {
      const cached = this.resultsCache.get(cacheKey)!;
      return cached;
    }

    const result = await this.engine.runBacktest(config, providedBars, benchmarkBars);

    // Phase 38.2A: ownership is always stamped by the server onto the artifact (never trusted from the body).
    if (owner) {
      (result as any).ownerUserId = owner;
      (result as any).userId = owner;
      (result as any).visibility = 'PRIVATE';
    }

    if (result.status === 'COMPLETED' && !providedBars && !benchmarkBars) {
      this.resultsCache.set(cacheKey, result);
    }
    // Also index by backtestId
    if (result.backtestId) {
      this.resultsCache.set(result.backtestId, result);
    }

    // Persist immutable historical backtest artifact
    if (result.status === 'COMPLETED') {
      persistenceManager.getBacktestRepository().save(result).catch(err => {
        console.warn('[BacktestService] Failed to persist backtest result:', err);
      });
    }

    return result;
  }

  /**
   * Retrieve a backtest result by ID from memory cache or persistent store.
   */
  public getBacktest(id: string): BacktestResult | null {
    return this.resultsCache.get(id) || null;
  }

  public async getBacktestAsync(id: string): Promise<BacktestResult | null> {
    const memory = this.getBacktest(id);
    if (memory) return memory;

    try {
      const persisted = await persistenceManager.getBacktestRepository().get(id);
      if (persisted) {
        if (persisted.backtestId) {
          this.resultsCache.set(persisted.backtestId, persisted);
        }
        return persisted;
      }
    } catch (err) {
      console.warn('[BacktestService] Error fetching persisted backtest:', err);
    }
    return null;
  }

  public async hydrateFromPersistence(): Promise<number> {
    try {
      const persisted = await persistenceManager.getBacktestRepository().getAll();
      for (const res of persisted) {
        if (res.backtestId) {
          this.resultsCache.set(res.backtestId, res);
        }
      }
      return persisted.length;
    } catch (err) {
      console.warn('[BacktestService] Hydration failed:', err);
      return 0;
    }
  }

  /** Tenant-scoped listing (mandatory scope). Ownerless legacy results are never returned. */
  public getAllBacktestsForOwner(ownerUserId: string): BacktestResult[] {
    const scope = requireTenantScope(ownerUserId);
    return this.getAllBacktests().filter(b => canRead(b as any, scope));
  }

  /**
   * Retrieve all completed backtest results (INTERNAL: all owners; must never back an HTTP response).
   */
  public getAllBacktests(): BacktestResult[] {
    const unique = new Map<string, BacktestResult>();
    for (const res of this.resultsCache.values()) {
      if (res.backtestId) {
        unique.set(res.backtestId, res);
      }
    }
    return Array.from(unique.values());
  }

  /**
   * Validate configuration prior to execution.
   */
  public async validateConfig(config: BacktestConfiguration): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.strategyId) {
      errors.push('strategyId is required.');
    }
    if (!config.startDate || !config.endDate) {
      errors.push('startDate and endDate are required.');
    } else if (new Date(config.startDate).getTime() >= new Date(config.endDate).getTime()) {
      errors.push(`startDate (${config.startDate}) must precede endDate (${config.endDate}).`);
    }
    if (typeof config.initialCapital !== 'number' || config.initialCapital <= 0) {
      errors.push('initialCapital must be a positive number.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Clear in-memory cache.
   */
  public clearCache(): void {
    this.resultsCache.clear();
  }

  private generateCacheKey(config: BacktestConfiguration): string {
    const syms = (config.symbols || config.securityIds || ['default']).join(',');
    return [
      config.strategyId,
      config.strategyVersion || 'v1.0.0',
      syms,
      config.startDate,
      config.endDate,
      config.initialCapital,
      config.currency || config.baseCurrency || 'USD',
      config.slippageBps || config.slippage?.rate || 5,
      config.commissionPerTrade || config.transactionCost?.rate || 0,
      config.executionTiming || 'SIGNAL_ON_CLOSE_EXECUTE_NEXT_OPEN',
      config.isSimulatedBaseline ? 'sim' : 'real'
    ].join(':');
  }
}

export const backtestService = BacktestService.getInstance();
