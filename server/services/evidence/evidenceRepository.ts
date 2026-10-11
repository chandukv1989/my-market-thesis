/**
 * In-Memory Evidence Repository (Phase 8A)
 * 
 * Provides deterministic storage, retrieval, deduplication, conflict preservation,
 * and point-in-time querying for canonical EvidenceItem objects.
 */

import {
  EvidenceItem,
  EvidenceFilter,
  EvidenceSourceType,
  IEvidenceRepository
} from '../../../src/types';
import { persistenceManager } from '../../persistence/persistenceManager';
import { asOfCutoffMs, isAvailableAsOf } from '../../persistence/pit';
import { createHash } from 'crypto';
import { canRead, isSharedRecord, requireTenantScope, resolveOwnerId } from '../../auth/accessPolicy';

/**
 * Generate a deterministic fingerprint for exact deduplication.
 * Identical security, source, concept/document, period, and value are deduplicated.
 */
/**
 * Phase 38.2E: access domain of a record. Records only deduplicate, conflict-compare or overwrite WITHIN one domain:
 *   owner:<id>   private to that tenant
 *   shared       explicitly classified SHARED
 *   restricted   ownerless + unclassified (legacy) or explicitly restricted — never merged with `shared`
 * (Previously ownerless legacy records and SHARED records both mapped to 'shared', which let a fresh provider fetch
 * collide with — and promote — a legacy record.)
 */
export function accessDomain(item: { ownerUserId?: string; userId?: string; tenantId?: string; visibility?: string }): string {
  const owner = resolveOwnerId(item as any);
  if (owner) return `owner:${owner}`;
  return isSharedRecord(item as any) ? 'shared' : 'restricted';
}

export function generateEvidenceFingerprint(item: EvidenceItem): string {
  // Phase 38.2A/E: identical values in different access domains must never dedupe into one record.
  const domain = accessDomain(item);
  const sec = (item.securityId || 'global').trim().toLowerCase();
  const source = (item.sourceType || 'unknown').trim().toLowerCase();
  const prov = (item.provider || 'unknown').trim().toLowerCase();
  const doc = (item.documentId || item.documentType || item.sourceReference?.concept || 'doc').toString().trim().toLowerCase();
  const period = (item.periodEnd || item.filingDate || item.periodStart || 'current').trim();
  const val = typeof item.structuredValue === 'object' && item.structuredValue !== null
    ? JSON.stringify(item.structuredValue)
    : String(item.structuredValue ?? item.content ?? '').trim();

  return `${domain}::${sec}::${source}::${prov}::${doc}::${period}::${val}`;
}

/**
 * Generate a concept/topic key used to detect conflicting reports for the same subject & period.
 */
export function generateConceptKey(item: EvidenceItem): string {
  const sec = (item.securityId || 'global').trim().toLowerCase();
  const docOrConcept = (item.sourceReference?.concept || item.documentType || item.documentId || item.title || 'concept').toString().trim().toLowerCase();
  const period = (item.periodEnd || item.filingDate || item.periodStart || 'period').trim();
  return `${sec}::${docOrConcept}::${period}`;
}

export class EvidenceRepository implements IEvidenceRepository {
  private itemsById = new Map<string, EvidenceItem>();
  private itemsByFingerprint = new Map<string, string>(); // fingerprint -> evidenceId
  private itemsByConceptKey = new Map<string, string[]>(); // conceptKey -> evidenceId[]

  /**
   * Add a single evidence item to the repository.
   * Handles deduplication and conflict preservation.
   * Returns true if added, false if exact duplicate.
   */
  public addEvidence(rawItem: EvidenceItem): boolean {
    if (!rawItem || !rawItem.evidenceId) {
      return false;
    }

    // 1. Sanitize to guarantee credential isolation
    const item = this.sanitizeItem(rawItem);

    // 2. Exact Deduplication Check
    const fingerprint = generateEvidenceFingerprint(item);
    if (this.itemsByFingerprint.has(fingerprint)) {
      // Phase 38.2E: an exact match inside the SAME access domain is a plain duplicate. Matching content is never proof
      // of ownership, visibility or sharing permission, so an existing record is NEVER reclassified or otherwise
      // modified by a later fetch (the fingerprint embeds the access domain, so a SHARED fetch cannot match a legacy
      // record in the first place).
      return false; // Identical evidence already exists, skip
    }

    // Phase 38.2E: never overwrite a record that lives in a different access domain (legacy/restricted, another tenant,
    // or shared) just because the deterministic evidence id is the same. The newcomer is stored under a domain-derived
    // revision id; the existing record (and its id) stay untouched.
    const clash = this.itemsById.get(item.evidenceId);
    if (clash && accessDomain(clash) !== accessDomain(item)) {
      const requested = item.evidenceId;
      const tag = createHash('sha256').update(accessDomain(item)).digest('hex').slice(0, 8);
      let candidate = `${requested}~${tag}`;
      for (let rev = 2; this.itemsById.has(candidate) && accessDomain(this.itemsById.get(candidate)!) !== accessDomain(item); rev++) {
        candidate = `${requested}~${tag}-r${rev}`;
      }
      item.evidenceId = candidate;
      item.metadata = { ...(item.metadata || {}), requestedEvidenceId: requested };
    }

    // 3. Conflict Detection
    const conceptKey = generateConceptKey(item);
    const existingIdsWithSameConcept = this.itemsByConceptKey.get(conceptKey) || [];

    for (const existingId of existingIdsWithSameConcept) {
      const existing = this.itemsById.get(existingId);
      // Phase 38.2A: conflicts are only flagged within one access domain (same owner, or both shared) so a
      // private value can never be written into conflictDetails of an item another tenant can read.
      if (existing && accessDomain(existing) === accessDomain(item)) {
        // If different providers report differing values for the same concept/period, flag conflict
        const isDifferentProvider = existing.provider.toLowerCase() !== item.provider.toLowerCase();
        const isDifferentValue = String(existing.structuredValue) !== String(item.structuredValue) &&
                                 existing.structuredValue !== null && item.structuredValue !== null;

        if (isDifferentValue) {
          existing.hasConflict = true;
          existing.conflictDetails = `Discrepancy with ${item.provider}: reported ${String(item.structuredValue)} ${item.unit || ''} vs ${String(existing.structuredValue)} ${existing.unit || ''}`.trim();

          item.hasConflict = true;
          item.conflictDetails = `Discrepancy with ${existing.provider}: reported ${String(existing.structuredValue)} ${existing.unit || ''} vs ${String(item.structuredValue)} ${item.unit || ''}`.trim();
        }
      }
    }

    // 4. Store Evidence
    this.itemsById.set(item.evidenceId, item);
    this.itemsByFingerprint.set(fingerprint, item.evidenceId);

    existingIdsWithSameConcept.push(item.evidenceId);
    this.itemsByConceptKey.set(conceptKey, existingIdsWithSameConcept);

    // 5. Persist to backing storage asynchronously
    persistenceManager.getEvidenceRepository().addEvidence(item).catch(err => {
      console.warn('[EvidenceRepository] Failed to persist evidence:', err);
    });

    return true;
  }

  /**
   * Hydrate memory cache from the persistent repository
   */
  public async hydrateFromPersistence(): Promise<number> {
    try {
      const persisted = await persistenceManager.getEvidenceRepository().getAll();
      for (const item of persisted) {
        const fingerprint = generateEvidenceFingerprint(item);
        this.itemsById.set(item.evidenceId, item);
        this.itemsByFingerprint.set(fingerprint, item.evidenceId);

        const conceptKey = generateConceptKey(item);
        const existing = this.itemsByConceptKey.get(conceptKey) || [];
        existing.push(item.evidenceId);
        this.itemsByConceptKey.set(conceptKey, existing);
      }
      return persisted.length;
    } catch (err) {
      console.warn('[EvidenceRepository] Hydration from persistence failed:', err);
      return 0;
    }
  }

  /**
   * Add multiple evidence items in batch.
   * Returns the count of newly inserted items.
   */
  public addEvidenceBatch(items: EvidenceItem[]): number {
    if (!Array.isArray(items) || items.length === 0) return 0;
    let added = 0;
    for (const item of items) {
      if (this.addEvidence(item)) {
        added++;
      }
    }
    return added;
  }

  /**
   * Retrieve a specific evidence item by its canonical ID.
   */
  public getEvidence(evidenceId: string): EvidenceItem | undefined {
    return this.itemsById.get(evidenceId);
  }

  /**
   * Retrieve all evidence matching a security ID.
   */
  public getEvidenceBySecurity(securityId: string): EvidenceItem[] {
    const norm = securityId.trim().toLowerCase();
    return Array.from(this.itemsById.values()).filter(item => {
      const itemSec = (item.securityId || '').trim().toLowerCase();
      const itemSym = (item.sourceReference?.symbol || '').trim().toLowerCase();
      return itemSec === norm || itemSym === norm;
    });
  }

  /**
   * Retrieve all evidence matching a source type.
   */
  public getEvidenceBySource(sourceType: EvidenceSourceType): EvidenceItem[] {
    return Array.from(this.itemsById.values()).filter(item => item.sourceType === sourceType);
  }

  /**
   * Mandatory Point-In-Time Retrieval.
   * Filters strictly on publishedAt (availability date) <= asOfDate.
   * Excludes any evidence not yet published by asOfDate.
   */
  public getEvidenceAvailableAsOf(asOfDate: string | Date, filter?: EvidenceFilter): EvidenceItem[] {
    if (asOfCutoffMs(asOfDate) === null) {
      return [];
    }

    return Array.from(this.itemsById.values()).filter(item => {
      // 1. Point-in-time check (shared rule): publishedAt must be known and <= asOfDate (date-only = end of day)
      if (!isAvailableAsOf(item.publishedAt, asOfDate)) {
        return false;
      }

      // 2. Apply additional filters if supplied
      if (filter && !this.matchesFilter(item, filter)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Tenant-scoped reads (Phase 38.2A). The scope is mandatory: owner's private items + explicitly SHARED items.
   */
  public getEvidenceAvailableAsOfForOwner(ownerUserId: string, asOfDate: string | Date, filter?: EvidenceFilter): EvidenceItem[] {
    const scope = requireTenantScope(ownerUserId);
    return this.getEvidenceAvailableAsOf(asOfDate, filter).filter(i => canRead(i, scope));
  }

  public queryEvidenceForOwner(ownerUserId: string, filter: EvidenceFilter): EvidenceItem[] {
    const scope = requireTenantScope(ownerUserId);
    const { limit, ...rest } = filter || ({} as EvidenceFilter);
    let results = this.queryEvidence(rest as EvidenceFilter).filter(i => canRead(i, scope));
    if (typeof limit === 'number' && limit > 0) results = results.slice(0, limit);
    return results;
  }

  /**
   * Query evidence using deterministic filters.
   */
  public queryEvidence(filter: EvidenceFilter): EvidenceItem[] {
    let results = Array.from(this.itemsById.values()).filter(item => this.matchesFilter(item, filter));

    if (typeof filter.limit === 'number' && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Alias for queryEvidence.
   */
  public query(filter: EvidenceFilter): EvidenceItem[] {
    return this.queryEvidence(filter);
  }

  /**
   * Remove a specific evidence item.
   */
  public removeEvidence(evidenceId: string): boolean {
    const item = this.itemsById.get(evidenceId);
    if (!item) return false;

    const fingerprint = generateEvidenceFingerprint(item);
    this.itemsByFingerprint.delete(fingerprint);

    const conceptKey = generateConceptKey(item);
    const existing = this.itemsByConceptKey.get(conceptKey);
    if (existing) {
      this.itemsByConceptKey.set(conceptKey, existing.filter(id => id !== evidenceId));
    }

    return this.itemsById.delete(evidenceId);
  }

  /**
   * Get all stored evidence.
   */
  public getAll(): EvidenceItem[] {
    return Array.from(this.itemsById.values());
  }

  /**
   * Total count of unique evidence items.
   */
  public count(): number {
    return this.itemsById.size;
  }

  /**
   * Clear repository.
   */
  public clear(): void {
    this.itemsById.clear();
    this.itemsByFingerprint.clear();
    this.itemsByConceptKey.clear();
  }

  /**
   * Internal filter evaluation.
   */
  private matchesFilter(item: EvidenceItem, filter: EvidenceFilter): boolean {
    // Security / Symbol
    if (filter.securityId) {
      const normSec = filter.securityId.toLowerCase();
      const itemSec = (item.securityId || '').toLowerCase();
      const itemSym = (item.sourceReference?.symbol || '').toLowerCase();
      if (itemSec !== normSec && itemSym !== normSec) return false;
    }

    if (filter.symbol) {
      const normSym = filter.symbol.toLowerCase();
      const itemSym = (item.sourceReference?.symbol || item.securityId || '').toLowerCase();
      if (itemSym !== normSym) return false;
    }

    // Source Type
    if (filter.sourceType) {
      const sources = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
      if (!sources.includes(item.sourceType)) return false;
    }

    // Provider
    if (filter.provider) {
      const providers = (Array.isArray(filter.provider) ? filter.provider : [filter.provider]).map(p => p.toLowerCase());
      if (!providers.includes(item.provider.toLowerCase())) return false;
    }

    // Epistemic Status
    if (filter.epistemicStatus) {
      const statuses = Array.isArray(filter.epistemicStatus) ? filter.epistemicStatus : [filter.epistemicStatus];
      if (!statuses.includes(item.epistemicStatus)) return false;
    }

    // Document Type
    if (filter.documentType) {
      if ((item.documentType || '').toLowerCase() !== filter.documentType.toLowerCase()) return false;
    }

    // Concept
    if (filter.concept) {
      const normConcept = filter.concept.toLowerCase();
      const itemConcept = (item.sourceReference?.concept || '').toLowerCase();
      if (!itemConcept.includes(normConcept)) return false;
    }

    // Date range filtering (by publishedAt)
    const pubTime = new Date(item.publishedAt).getTime();
    if (!isNaN(pubTime)) {
      if (filter.startDate) {
        const start = new Date(filter.startDate).getTime();
        if (!isNaN(start) && pubTime < start) return false;
      }
      if (filter.endDate) {
        const end = new Date(filter.endDate).getTime();
        if (!isNaN(end) && pubTime > end) return false;
      }
    }
    // Shared PIT rule: undated evidence has unknown availability and is excluded from any asOfDate query.
    if (filter.asOfDate && !isAvailableAsOf(item.publishedAt, filter.asOfDate)) return false;

    return true;
  }

  /**
   * Sanitize evidence item to prevent sensitive credential leakage.
   */
  private sanitizeItem(item: EvidenceItem): EvidenceItem {
    const cloned: EvidenceItem = JSON.parse(JSON.stringify(item));

    // Strip sensitive keys if accidentally present
    const sensitivePatterns = [/api[_-]?key/i, /token/i, /secret/i, /password/i, /credential/i];

    const cleanseObject = (obj: Record<string, unknown> | undefined) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (sensitivePatterns.some(p => p.test(key))) {
          delete obj[key];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          cleanseObject(obj[key] as Record<string, unknown>);
        }
      }
    };

    if (cloned.sourceReference) cleanseObject(cloned.sourceReference as Record<string, unknown>);
    if (cloned.metadata) cleanseObject(cloned.metadata);
    if (typeof cloned.structuredValue === 'object' && cloned.structuredValue !== null) {
      cleanseObject(cloned.structuredValue as Record<string, unknown>);
    }

    return cloned;
  }
}

export const evidenceRepository = new EvidenceRepository();
