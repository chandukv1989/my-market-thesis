/**
 * Phase 38.2B test helper.
 *
 * Several historical suites (Phases 25–31) build their scenarios on records that already exist in the shared
 * development `store.json` and that were written before ownership/visibility existed (ownerless). Phase 38.2B
 * makes ownerless + unclassified records invisible to every derived output, so those fixtures must be classified
 * explicitly to keep exercising the (unchanged) engine assertions.
 *
 * This helper classifies them SHARED **in memory only, inside the test process**. It never edits store.json on
 * purpose (a later flush by the same process may persist the flag, which is why store.json is backed up and
 * byte-restored around test runs), never assigns an owner, and is NOT part of the application.
 */
import { persistenceManager } from '../../server/persistence/persistenceManager';

export async function classifyLegacyFixturesSharedForTest(): Promise<number> {
  await persistenceManager.initialize();
  let n = 0;
  const repos: Array<() => Promise<any[]>> = [
    () => persistenceManager.getEvidenceRepository().getAll(),
    () => persistenceManager.getDecisionRepository().getAll(),
    () => persistenceManager.getSnapshotRepository().getAll(),
    () => persistenceManager.getNotebookRepository().getAll()
  ];
  for (const load of repos) {
    for (const rec of await load()) {
      if (!rec.ownerUserId && !rec.userId && !rec.visibility) {
        rec.visibility = 'SHARED';
        n++;
      }
    }
  }
  return n;
}
