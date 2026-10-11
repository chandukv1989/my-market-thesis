/**
 * Phase 38.2B: single point-in-time (PIT) availability rule shared by every storage backend.
 *
 * - A date-only `asOf` (YYYY-MM-DD) means "through the end of that UTC day, inclusive" (23:59:59.999Z).
 * - A full timestamp is used exactly.
 * - An item with a missing/unparseable publication date has UNKNOWN availability and is therefore NOT available as of
 *   any date (the previous PostgreSQL and disk implementations wrongly treated NULL as always available, which let
 *   undated items leak into historical analyses).
 */

export function asOfCutoffMs(asOf: string | Date | null | undefined): number | null {
  if (asOf === null || asOf === undefined || asOf === '') return null;
  const iso = asOf instanceof Date ? asOf.toISOString() : String(asOf);
  const ms = iso.includes('T') ? new Date(iso).getTime() : new Date(`${iso}T23:59:59.999Z`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function asOfCutoffDate(asOf: string | Date | null | undefined): Date | null {
  const ms = asOfCutoffMs(asOf);
  return ms === null ? null : new Date(ms);
}

export function isAvailableAsOf(publishedAt: string | Date | null | undefined, asOf: string | Date | null | undefined): boolean {
  const cutoff = asOfCutoffMs(asOf);
  if (cutoff === null) return true; // no PIT restriction requested
  if (publishedAt === null || publishedAt === undefined || publishedAt === '') return false;
  const pub = new Date(publishedAt as any).getTime();
  if (Number.isNaN(pub)) return false;
  return pub <= cutoff;
}
