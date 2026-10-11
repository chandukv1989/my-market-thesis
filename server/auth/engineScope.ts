/**
 * Phase 38.2A: Tenant scoping for INTERNAL analytical engines
 *
 * Monitors, discovery, command-center, scenario, memory, question and gap engines derive their output from
 * persisted decisions / snapshots / evidence and hand that output to a specific authenticated user. System-
 * generated, deterministic artifacts are ownerless and are legitimate engine inputs, but a record that belongs
 * to ANOTHER tenant must never flow into this user's derived output.
 *
 * Rule:  visible  <=>  owner === userId  OR  (no owner AND visibility === 'SHARED')
 *
 * (Phase 38.2A allowed any ownerless record; Phase 38.2B closed that: LEGACY_UNOWNED records can no longer enter a
 * user's derived output.) System-generated artifacts built purely from shared inputs are stamped SHARED when they
 * are created, so engines keep working on new data while legacy records stay restricted until an explicit,
 * auditable ownership decision is recorded.
 */

import { persistenceManager } from '../persistence/persistenceManager';
import { isSharedRecord, resolveOwnerId } from './accessPolicy';
import { InvestmentDecisionAssessment, ResearchSnapshot } from '../../src/types';

export function visibleToEngine(record: any, userId: string | undefined): boolean {
  // Fail-closed (Phase 38.2B): another tenant's record is never visible; an ownerless record is visible ONLY when it
  // has been explicitly classified SHARED (system-generated from shared inputs, or re-asserted by an auditable rule).
  // Ownerless + unclassified (LEGACY_UNOWNED) records are excluded from every derived output.
  const owner = resolveOwnerId(record);
  if (owner) return !!userId && owner === userId;
  return isSharedRecord(record);
}

/** Latest decision (optionally <= asOfDate) that is not owned by another tenant. */
export async function latestDecisionVisibleTo(
  userId: string | undefined,
  securityId: string,
  asOfDate?: string
): Promise<InvestmentDecisionAssessment | null> {
  const history = await persistenceManager.getDecisionRepository().getHistory(securityId);
  const candidates = history
    .filter(d => visibleToEngine(d, userId))
    .filter(d => !asOfDate || (d.asOfDate || '') <= asOfDate);
  candidates.sort(
    (a, b) => (b.asOfDate || '').localeCompare(a.asOfDate || '') || (b.generatedAt || '').localeCompare(a.generatedAt || '')
  );
  return candidates[0] || null;
}

/** Latest research snapshot (optionally <= asOfDate) that is not owned by another tenant. */
export async function latestSnapshotVisibleTo(
  userId: string | undefined,
  securityId: string,
  asOfDate?: string
): Promise<ResearchSnapshot | null> {
  const snaps = await persistenceManager.getSnapshotRepository().getBySecurityId(securityId);
  const candidates = snaps
    .filter(s => visibleToEngine(s, userId))
    .filter(s => !asOfDate || ((s.researchAsOfDate || (s as any).asOfDate || '') <= asOfDate));
  candidates.sort(
    (a, b) =>
      (b.researchAsOfDate || (b as any).asOfDate || '').localeCompare(a.researchAsOfDate || (a as any).asOfDate || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  return candidates[0] || null;
}
