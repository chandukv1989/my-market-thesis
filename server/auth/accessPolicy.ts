/**
 * Phase 38.2A: Central Resource Access Policy
 *
 * Single source of truth for ownership evaluation. Rules:
 *
 * - Access is FAIL-CLOSED. A record is readable only when
 *     (a) its owner equals the authenticated principal, or
 *     (b) it is explicitly classified `visibility: 'SHARED'`.
 * - A missing owner NEVER implies public. Ownerless, non-shared records are in the
 *   restricted LEGACY_UNOWNED state: nobody can read or mutate them through the API
 *   until an auditable ownership-assignment decision is made (see
 *   migration 003 `ownership_assignments` and phase38_2a_report.md).
 * - Mutation requires ownership. SHARED never grants write access.
 */

export type ResourceVisibility = 'PRIVATE' | 'SHARED';

export type AccessDecision =
  | 'OWNER'
  | 'SHARED'
  | 'LEGACY_UNOWNED'
  | 'FORBIDDEN'
  | 'NO_PRINCIPAL';

export interface OwnedRecordLike {
  ownerUserId?: string;
  userId?: string;
  tenantId?: string;
  visibility?: ResourceVisibility | string;
}

/** Thrown when a repository / service call is made without the mandatory tenant scope. */
export class TenantScopeError extends Error {
  constructor(message = 'Tenant scope (ownerUserId) is required for this operation') {
    super(message);
    this.name = 'TenantScopeError';
  }
}

export function resolveOwnerId(record: OwnedRecordLike | null | undefined): string | undefined {
  if (!record) return undefined;
  const owner = record.ownerUserId || record.userId || record.tenantId;
  return typeof owner === 'string' && owner.trim() ? owner : undefined;
}

export function isSharedRecord(record: OwnedRecordLike | null | undefined): boolean {
  return !!record && record.visibility === 'SHARED';
}

export function normalizePrincipalId(userId: unknown): string | undefined {
  return typeof userId === 'string' && userId.trim() ? userId : undefined;
}

/**
 * Evaluate whether `userId` may READ `record`.
 */
export function evaluateAccess(record: OwnedRecordLike | null | undefined, userId: unknown): AccessDecision {
  const principal = normalizePrincipalId(userId);
  if (!principal) return 'NO_PRINCIPAL';
  const owner = resolveOwnerId(record);
  if (owner) return owner === principal ? 'OWNER' : 'FORBIDDEN';
  if (isSharedRecord(record)) return 'SHARED';
  return 'LEGACY_UNOWNED';
}

export function canRead(record: OwnedRecordLike | null | undefined, userId: unknown): boolean {
  const d = evaluateAccess(record, userId);
  if (d === 'OWNER' || d === 'SHARED') return true;
  // Internal callers with no principal may still see explicitly SHARED reference data (never private/legacy data).
  return d === 'NO_PRINCIPAL' && isSharedRecord(record);
}

/** Mutation (update/delete) is owner-only. SHARED records are read-only. */
export function canMutate(record: OwnedRecordLike | null | undefined, userId: unknown): boolean {
  return evaluateAccess(record, userId) === 'OWNER';
}

export function filterReadable<T extends OwnedRecordLike>(records: T[], userId: unknown): T[] {
  return records.filter(r => canRead(r, userId));
}

export function filterOwned<T extends OwnedRecordLike>(records: T[], userId: unknown): T[] {
  if (!normalizePrincipalId(userId)) return [];
  return records.filter(r => canMutate(r, userId));
}

/** Records that exist but nobody may access until an ownership decision is made. */
export function isLegacyUnowned(record: OwnedRecordLike | null | undefined): boolean {
  return !!record && !resolveOwnerId(record) && !isSharedRecord(record);
}

/** Throws TenantScopeError unless a non-empty owner id is supplied. Returns the id. */
export function requireTenantScope(ownerUserId: unknown): string {
  const id = normalizePrincipalId(ownerUserId);
  if (!id) throw new TenantScopeError();
  return id;
}

/**
 * Stamp ownership onto a record being created on behalf of `userId`.
 * Client-supplied owner/tenant/visibility fields are always overwritten.
 */
export function stampOwner<T extends Record<string, any>>(record: T, userId: string): T & { ownerUserId: string; userId: string } {
  const principal = requireTenantScope(userId);
  const stamped: any = { ...record, ownerUserId: principal, userId: principal };
  delete stamped.tenantId;
  stamped.visibility = 'PRIVATE';
  return stamped;
}
