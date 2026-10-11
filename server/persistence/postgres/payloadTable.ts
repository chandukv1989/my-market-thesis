/**
 * Phase 38.2B: SQL-backed document table helper
 *
 * Replaces the in-memory `Map` caches that 12 PostgreSQL repositories used. Every entity is stored in its own
 * table with:
 *   - denormalised, indexed key columns used for tenant scoping and filtering
 *       (id, owner_user_id, security_id, as_of_date, status, ref_key, ref_key2, created_at)
 *   - `payload JSONB`: the COMPLETE domain object, so no field is dropped or transformed by the mapping.
 *
 * Contract (documented mapping limitation): `payload` is the source of truth for the domain object; the key
 * columns are denormalised copies used for scoping/filtering only. Dates inside the payload remain ISO strings
 * exactly as written by the application (no timezone re-encoding).
 *
 * Tenant rules enforced here:
 *   - `owner_user_id` is written once on INSERT and is NEVER changed by `update` (ownership changes only via the
 *     auditable ownership-assignment process).
 *   - `update` only matches a row whose stored owner equals the entity's owner, so a caller can never mutate
 *     another tenant's row by supplying its id.
 */

import { PostgresClient } from './postgresClient';

export interface PayloadKeys {
  id: string;
  ownerUserId?: string | null;
  securityId?: string | null;
  asOfDate?: string | null;
  status?: string | null;
  refKey?: string | null;
  refKey2?: string | null;
  createdAt?: string | null;
}

export class PayloadTable<T> {
  constructor(
    private readonly client: PostgresClient,
    public readonly table: string,
    private readonly keys: (entity: T) => PayloadKeys
  ) {}

  private parse(row: any): T {
    const p = row.payload;
    return (typeof p === 'string' ? JSON.parse(p) : p) as T;
  }

  public async get(id: string): Promise<T | null> {
    const res = await this.client.query(`SELECT payload FROM ${this.table} WHERE id = $1;`, [id]);
    return res.rows.length ? this.parse(res.rows[0]) : null;
  }

  /** `where` must be a trusted SQL fragment using $1..$n placeholders only (never interpolated user input). */
  public async select(where: string, params: any[] = [], orderBy = 'created_at DESC, id ASC'): Promise<T[]> {
    const sql = `SELECT payload FROM ${this.table}${where ? ` WHERE ${where}` : ''} ORDER BY ${orderBy};`;
    const res = await this.client.query(sql, params);
    return res.rows.map(r => this.parse(r));
  }

  /** Insert once. Resolves to null if the id already exists (immutable history is never overwritten). */
  public async insertOnce(entity: T): Promise<T | null> {
    const k = this.keys(entity);
    const res = await this.client.query(
      `INSERT INTO ${this.table} (id, owner_user_id, security_id, as_of_date, status, ref_key, ref_key2, created_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9::jsonb)
       ON CONFLICT (id) DO NOTHING
       RETURNING payload;`,
      [k.id, k.ownerUserId ?? null, k.securityId ?? null, k.asOfDate ?? null, k.status ?? null, k.refKey ?? null, k.refKey2 ?? null, k.createdAt ?? null, JSON.stringify(entity)]
    );
    return res.rows.length ? this.parse(res.rows[0]) : null;
  }

  /** Insert or replace the payload of an existing row of the SAME owner. Owner column is never rewritten. */
  public async upsert(entity: T): Promise<T | null> {
    const k = this.keys(entity);
    const res = await this.client.query(
      `INSERT INTO ${this.table} (id, owner_user_id, security_id, as_of_date, status, ref_key, ref_key2, created_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         security_id = EXCLUDED.security_id,
         as_of_date = EXCLUDED.as_of_date,
         status = EXCLUDED.status,
         ref_key = EXCLUDED.ref_key,
         ref_key2 = EXCLUDED.ref_key2,
         payload = EXCLUDED.payload,
         updated_at = NOW()
       WHERE COALESCE(${this.table}.owner_user_id, '') = COALESCE(EXCLUDED.owner_user_id, '')
       RETURNING payload;`,
      [k.id, k.ownerUserId ?? null, k.securityId ?? null, k.asOfDate ?? null, k.status ?? null, k.refKey ?? null, k.refKey2 ?? null, k.createdAt ?? null, JSON.stringify(entity)]
    );
    return res.rows.length ? this.parse(res.rows[0]) : null;
  }

  /** Update an existing row; resolves to null when the id is unknown OR belongs to a different owner. */
  public async updateExisting(entity: T): Promise<T | null> {
    const k = this.keys(entity);
    const res = await this.client.query(
      `UPDATE ${this.table}
          SET security_id = $3, as_of_date = $4, status = $5, ref_key = $6, ref_key2 = $7, payload = $8::jsonb, updated_at = NOW()
        WHERE id = $1 AND COALESCE(owner_user_id, '') = COALESCE($2::text, '')
        RETURNING payload;`,
      [k.id, k.ownerUserId ?? null, k.securityId ?? null, k.asOfDate ?? null, k.status ?? null, k.refKey ?? null, k.refKey2 ?? null, JSON.stringify(entity)]
    );
    return res.rows.length ? this.parse(res.rows[0]) : null;
  }

  public async delete(id: string): Promise<boolean> {
    const res = await this.client.query(`DELETE FROM ${this.table} WHERE id = $1;`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  public async count(): Promise<number> {
    const res = await this.client.query(`SELECT COUNT(*) AS total FROM ${this.table};`);
    return Number(res.rows[0]?.total || 0);
  }
}

/** Name → table registry used by the migration and by the schema-reconciliation test. */
export const PAYLOAD_TABLES = [
  'research_priority_snapshots',
  'cross_investment_snapshots',
  'portfolio_scenario_snapshots',
  'counterfactual_snapshots',
  'research_memories',
  'research_questions',
  'research_gaps',
  'investigation_plans',
  'investigation_audits',
  'evidence_collections',
  'evidence_relationships',
  'evidence_audits'
] as const;
