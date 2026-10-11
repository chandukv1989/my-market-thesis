/**
 * Phase 16: PostgreSQL Database Client Wrapper
 * 
 * Safely wraps pg.Pool with:
 * - Credential protection
 * - Automatic query execution & parameterization
 * - Safe transaction boundaries with automatic ROLLBACK on failure
 */

import { AsyncLocalStorage } from 'async_hooks';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseConfig, getDatabaseConfig } from '../databaseConfig';

/** Minimal pool surface used by the client (lets tests inject a double; no database is contacted). */
export interface PoolLike {
  connect(): Promise<PoolClient>;
  query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
  end(): Promise<void>;
}

export class PostgresClient {
  private pool: PoolLike | null = null;
  private config: DatabaseConfig;
  /**
   * Phase 38.2B: the connection checked out by the innermost active runTransaction() on this async call chain.
   * Every `query()` issued anywhere inside the transaction callback (including repository calls) is routed to this
   * SAME connection, so reads and writes share one BEGIN…COMMIT scope.
   */
  private readonly txContext = new AsyncLocalStorage<PoolClient>();

  constructor(config?: DatabaseConfig, poolOverride?: PoolLike) {
    this.config = config || getDatabaseConfig();
    if (poolOverride) this.pool = poolOverride;
  }

  public async connect(): Promise<boolean> {
    if (this.pool && !this.config.isConfigured) {
      // Injected pool (tests): just verify it answers.
      const c = await this.pool.connect();
      try { await c.query('SELECT 1 AS health_check;'); return true; } finally { c.release(); }
    }
    if (!this.config.isConfigured || !this.config.databaseUrl) {
      return false;
    }

    try {
      this.pool = new Pool({
        connectionString: this.config.databaseUrl,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        max: this.config.maxConnections,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis
      });

      // Smoke test query
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1 AS health_check;');
        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[PostgresClient] Connection failed:', err instanceof Error ? err.message : String(err));
      if (this.pool) {
        await this.pool.end().catch(() => {});
        this.pool = null;
      }
      return false;
    }
  }

  public getPool(): Pool {
    if (!this.pool) {
      throw new Error('PostgresClient is not connected. Call connect() first or verify DATABASE_URL.');
    }
    return this.pool as Pool;
  }

  public isConnected(): boolean {
    return this.pool !== null;
  }

  public async healthCheck(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.query('SELECT 1 AS health;');
      return true;
    } catch {
      return false;
    }
  }

  public async query<R extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<R>> {
    if (!this.pool) {
      throw new Error('Cannot execute query: PostgreSQL pool is not connected.');
    }
    const tx = this.txContext.getStore();
    if (tx) {
      return tx.query<R>(text, params);
    }
    return this.pool.query<R>(text, params);
  }

  public isInTransaction(): boolean {
    return this.txContext.getStore() !== undefined;
  }

  /**
   * Runs `work` inside BEGIN…COMMIT on ONE checked-out connection.
   * - Repository calls made through this client inside `work` use that connection (see txContext).
   * - Any failure (including a failed COMMIT) triggers ROLLBACK; the original error is always rethrown.
   * - If ROLLBACK itself fails the connection is considered broken and is destroyed (release(err)) rather than
   *   being returned to the pool.
   * - A nested call joins the outer transaction (no second connection, no premature COMMIT).
   */
  public async runTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Cannot run transaction: PostgreSQL pool is not connected.');
    }
    const existing = this.txContext.getStore();
    if (existing) {
      return work(existing);
    }
    const client = await this.pool.connect();
    let broken: Error | undefined;
    try {
      await client.query('BEGIN');
      try {
        const result = await this.txContext.run(client, () => work(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
        }
        throw error;
      }
    } finally {
      // Passing an error to release() makes pg discard the connection instead of reusing it.
      client.release(broken as any);
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
