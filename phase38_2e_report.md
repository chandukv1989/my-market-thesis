# Phase 38.2E — Evidence Sharing & Repository Consistency: Final Report

## 1. Executive summary and final status

**Status: COMPLETE WITH LIMITATIONS.**

Both original findings are fixed and regression-tested. All in-scope deterministic suites pass. The limitations are environmental or already known:
- No real PostgreSQL verification exists.
- Phase 36 and Phase 37 depend on live providers or keys.
- Several residual risks are listed in section 10.

## 2. Root cause

1. **Legacy promotion.** The fingerprint domain for an ownerless legacy record and a SHARED record was the same value (`shared`). A fresh SHARED provider fetch with matching content therefore collided with a legacy record and re-classified it to SHARED. Matching content is not proof of ownership, visibility or licensing.
2. **Two repositories.** `EvidenceService` defaulted to `new EvidenceRepository()`. The decision service read the module singleton `evidenceRepository`. Evidence the service collected never reached decisions through the same visibility path.
3. **Event-engine lookup.** `evaluateResearchImpact` passed a bare security id to `getSnapshots`. Notebooks are keyed `nb-<canonical security id>`, so the lookup always returned nothing.
4. **Deletion.** `DELETE /api/documents/:id` removed only in-memory state. Hydration re-read the persisted document and its evidence, so the document came back after a restart.

## 3. Implementation changes (files)

| File | Change |
|---|---|
| server/services/evidence/evidenceRepository.ts | Added `accessDomain()` (`owner:<id>` / `shared` / `restricted`). Fingerprint, dedup, conflict detection and overwrite now apply only within one domain. Removed the legacy-promotion block. A cross-domain id clash creates a revision id (`<id>~<tag>`, with `metadata.requestedEvidenceId`) and never overwrites or promotes. `matchesFilter` now excludes undated evidence for an as-of query, matching the shared PIT rule. |
| server/services/evidence/evidenceService.ts | New `classifyProviderEvidence()`. SHARED requires no owner, an allow-listed sourceType, a named provider and parseable dates; everything else is PRIVATE. The default repository is now the canonical singleton. |
| server/services/events/investmentEventEngine.ts | Uses `notebookService.notebookIdFor(targetId)`, filtered by `visibleToEngine`. |
| server/persistence/types.ts | Added `deleteForOwner` to the document and evidence repository interfaces. |
| server/persistence/devAdapter/developmentPersistenceAdapter.ts | Owner-only `deleteForOwner` for documents and evidence (writes to disk). |
| server/persistence/postgres/postgresRepositories.ts | Owner-guarded `DELETE ... WHERE id=$1 AND owner_user_id=$2`. No schema change. Tested only statically and with a simulator. |
| server/services/documents/documentIngestionService.ts | New `deleteDocumentForOwner`: owner-only, durable, also purges the owner's derived evidence. The old synchronous `deleteDocument` is kept and marked in-memory only. |
| server.ts | The DELETE route now authorizes `write`, then calls `deleteDocumentForOwner`. |
| tests/phase38_2e_evidence_consistency.test.ts | New suite (76 checks). |
| tests/phase38_2a_security.test.ts, tests/phase38_2d_legacy_sharing.test.ts | Assertion updates (section 4). |

No migration definition, `.env`, `store.json` or auth/tenant check was changed.

## 4. Rationale for the two assertion updates

- **2A (about line 489).** The old assertion expected an identical provider re-fetch to promote a legacy record to SHARED. That is the defect itself. It now asserts that:
  - the legacy record stays unclassified;
  - its content, ownership and metadata are unchanged (no `classifiedBy`);
  - an explicitly SHARED re-fetch is stored as its own separate SHARED record, so explicit sharing still works.

  The check was strengthened rather than removed (300 → 302 checks).
- **2D (about line 149).** The old assertion required exactly 3 items. The test adds its own shared fixture `ev-shared-aapl` at line 109 through `evidenceService.getRepository()`. That call used to return a separate instance and now returns the canonical repository, so the item is legitimate. The assertion now requires all three fixtures to be present and allows only `ev-shared-aapl` in addition. All later visibility, ownership and tenant checks are untouched.

## 5. Tests actually run (this session, repo cwd)

| Command | Exit | Result | Category |
|---|---|---|---|
| `npx tsc --noEmit` | 0 | clean | n/a |
| `npm run build` | 0 | built (dist/server.cjs) | n/a |
| `npm run test:security` | 0 | 302 / 0 failed | deterministic, in-process |
| `npm run test:persistence` | 0 | 254 / 0 failed | dev adapter, simulated DB (pg-mem), test doubles |
| `npx tsx tests/phase38_2d_legacy_sharing.test.ts` | 0 | 39 / 0 failed | deterministic |
| `npx tsx tests/phase38_2e_evidence_consistency.test.ts` | 0 | 76 / 0 failed (71 deterministic, 5 simulated DB, 0 real PostgreSQL) | mixed |
| Phase 21 (scratch cwd with a `server.ts` link) | 0 | 42 / 42 | deterministic |

Mutation checks on the 2E suite (all detected):
- Collapsing `accessDomain`: 2 failures.
- Reverting to a separate repository instance: 9 failures.
- Reverting the event-engine id: 3 failures.
- Reverting to a memory-only route delete: 2 failures.

## 6. Broader regression (isolated scratch cwd, empty data dir, no `.env`)

The 36 other older suites exit 0, plus Phase 21 once the `server.ts` link is supplied (this scratch run was done before the final 2A/2D assertion edits). Phase 21 failed in the first scratch run only because it reads `server.ts` relative to the cwd (ENOENT). That is a harness artifact, not a code failure.

## 7. Phases 36 and 37 (provider-dependent, not deterministic regressions)

These were observed in the isolated run after the 38.2E code changes. They were not re-run after the test-only edits in section 4.

- **Phase 36:** 92 / 108. The 16 failures are the live-provider connectivity set seen in earlier phases.
- **Phase 37:** 49 / 52 without provider keys. The 3 failures are "Historical bars retrieved", "Twelve Data is authoritative US provider", and "Twelve Data invalid (zero) price rejected". All three need a live Twelve Data connection. Phase 37 cannot be fully reproduced without `.env` or a live provider, and I did not invent a baseline.

## 8. Database-testing limitations

**Zero real PostgreSQL tests were performed.**
- pg-mem is an emulator and is not PostgreSQL. It also lacks transactional rollback isolation.
- The fake pool and static SQL checks are test doubles.
- The PostgreSQL `deleteForOwner` statements are unverified on a real server.

## 9. Hashes (SHA-256)

| File | Before | After |
|---|---|---|
| data/persistence/store.json | 4c40c2dc137f7d8283d988ae4dd59e704e704ca9b4b8b32c1cc81b973f9ba7a3 | identical |
| .env | 2019aa0437754c6be0d3001041c6a39d0b52ba1c15d458168713a0e904f439f8 | identical |

`git status --short` was identical before and after validation. Tests run against temp-dir stores.

## 10. Remaining limitations and risks

- **Deletion durability.** There is no tombstone. A fire-and-forget evidence write-through still pending at delete time could race with the delete. The synchronous `deleteDocument` is still callable internally. There is no evidence-delete route. Deleting evidence referenced by historical snapshots leaves dangling ids (existing behavior).
- **Legacy classification.** Legacy ownerless records stay restricted. A fresh fetch matching legacy content now creates a separate SHARED revision record instead of promoting the legacy one. Any approval to share legacy records is still pending the Phase 38.2D D2 decision. Tainted legacy records and orphan owners from 38.2C are unchanged. No owner was assigned.
- **Provenance.** `classifyProviderEvidence` relies on an allow-list and provenance fields supplied by adapters. A mislabeled adapter would be classified on that label.
- **Repository consistency.** Decisions now draw on the unified in-memory repository (hydrated legacy records are filtered by `visibleToEngine`). Revision ids are persisted as well.
- **Event model.** The fix relies on the `nb-<canonical id>` convention in notebookService. Owner-scoped notebooks (`nb-<id>:<hash>`) are intentionally not read by the system event engine.
- **PostgreSQL.** All PostgreSQL behavior is unverified, including tenant scoping, row-level behavior and deletes.

## 11. Confirmations

- No database connection was made, and no migration was executed or changed.
- No legacy data, credentials, `.env` values, API keys or session IDs were modified. No secret values appear in this report.
- No ownership was assigned, and no record was promoted to SHARED.
- Phase 38.3 was not started.

## 12. Recommended next step (not executed)

Run the persistence and delete behavior against a real, disposable PostgreSQL instance in a separately authorized phase. Then decide on legacy-record classification (D2) using authoritative ownership evidence.
