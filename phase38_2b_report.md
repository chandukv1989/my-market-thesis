# Phase 38.2B — Persistence Remediation and PostgreSQL Readiness Report

**Final status: COMPLETE WITH LIMITATIONS**

> **PostgreSQL integration, migration execution and production-data migration remain UNVERIFIED.**
> No PostgreSQL server was provisioned, connected to, or modified. No migration (001–004) was executed anywhere. `.env` was not modified. `store.json` was not imported, rewritten or migrated; it was backed up (SHA-256 recorded) and every test run that can touch it was followed by a byte-identical restoration check. No record was assigned an owner or classified shared. Phase 38.3 was not started.

---

## 1. Work item results

### 1.1 Phase 38.2A gaps closed
| Item | Result |
|---|---|
| Ownerless records in derived outputs | **Closed.** `visibleToEngine` is now fail-closed: another tenant's record ⇒ hidden; ownerless ⇒ visible **only if explicitly `SHARED`**; legacy (ownerless + unclassified) ⇒ excluded from monitor, discovery, command-center, cross-investment, scenario, research-question/gap/memory and event engines. System-generated artifacts built purely from shared inputs are stamped `SHARED` **at creation** (system decisions, system notebooks/snapshots, monitor baseline snapshot). Monitor review output no longer carries pointers to records the caller cannot see. Original ids/history untouched; nothing assigned. |
| Auth UI | **Done (minimum flow).** `authClient` + `AuthContext` + `AuthGate`: session restoration from the HttpOnly cookie (`GET /api/auth/me`), sign-in, registration, sign-out button, global 401 ⇒ return to sign-in, protected data providers mount only after authentication. No anonymous fallback, `analyst-1` gone from the UI. |
| Public allow-list | Unchanged and re-asserted by test: exactly 5 routes. |
| Operator-only routes | `POST /api/sec/cache/clear`, `POST /api/events/record` still require `ADMIN_USER_IDS` server-side (401 / 403 / 200 verified). |
| Cross-tenant overwrite by id | **New defects found and fixed:** development adapter allowed overwrite/ownership change by id for notebooks, strategies, alerts, monitors, policies, orchestrated alerts, evidence collections, relationships, questions, memory/gap/plan updates; development document dedup was global (content hash) — now per owner. PostgreSQL upserts for notebooks/strategies/alerts/monitors/policies/orchestrated alerts gained owner guards; `PayloadTable.update` only matches the same owner. |

### 1.2 PostgreSQL repository coverage
* All **31** repositories reconciled against interfaces and schema. The **12** in-memory-only repositories are now SQL-backed (`postgresPayloadRepositories.ts` on `payloadTable.ts`): research priorities, cross-investment / scenario / counterfactual snapshots, research memory / questions / gaps, investigation plans / audits, evidence collections / relationships / audits. Behaviour parity (immutability, filters, ordering, tenant-scoped dedup) preserved.
* Mapping contract: each table keeps denormalised key columns (`owner_user_id`, `security_id`, `as_of_date`, `status`, `ref_key`, `ref_key2`, `created_at`) **plus the complete object in `payload JSONB`** — no field is dropped or transformed (limitation: key columns are copies used for scoping/filtering; the payload is the source of truth; ISO date strings inside the payload are kept verbatim).
* Eight lossy tables (`research_documents, evidence_items, research_notebooks, research_snapshots, investment_decisions, strategies, backtests, alerts`) and `research_queries` gained `payload`; mappers used to drop fields (e.g. evidence `availableAt`, `sourceReference`, `metadata`, conflict flags) or **fabricate constants** (decision market context `currentPrice: 0`, thesis `STABLE`, coverage `HIGH_EVIDENCE_COVERAGE`) — fixed.
* Static reconciliation (new, no DB): every table/column/NOT-NULL/ON CONFLICT target used by repository SQL exists in migrations; every `row.<col>` read by a mapper is a real column. It caught a real defect (strategy mapper read four non-existent columns).
* Ownership persisted for real: owner + visibility columns are written by INSERT and restored by mappers, and verified end-to-end on the simulated DB (not only in TypeScript interfaces).
* `research_queries`, strategies and alerts gained tenant-scoped reads (`getAllForOwner`).

### 1.3 Transactions
* **Defect confirmed:** `PostgresPersistenceAdapter.runTransaction` ignored the checked-out connection — repository calls inside it ran on *other* pool connections, so nothing was transactional (and a failed `ROLLBACK` masked the original error and returned a broken connection to the pool).
* **Fix:** `PostgresClient` carries the transaction connection in an `AsyncLocalStorage`; every `query()` made anywhere inside `runTransaction` (including all repositories) uses that one connection. Failure ⇒ `ROLLBACK`, original error rethrown, connection released (with an error if the rollback itself failed so the pool discards it); nested calls join the outer transaction; concurrent transactions are isolated.

### 1.4 Storage behaviour (selected policy)
| Situation | Behaviour |
|---|---|
| `PERSISTENCE_MODE=disk` | disk store, explicit operator choice (`DISK_EXPLICIT`); PostgreSQL not attempted |
| no `DATABASE_URL` | development disk store (`DISK_UNCONFIGURED`); **refused in production** |
| `DATABASE_URL` set, PostgreSQL reachable | `POSTGRES`, authoritative |
| `DATABASE_URL` set, unreachable, **production or `PERSISTENCE_STRICT=true`** | **startup fails** (`PersistenceUnavailableError`); no disk store is created, no write can land on disk |
| `DATABASE_URL` set, unreachable, non-strict (development) | `DISK_DEGRADED_FALLBACK`: status `DEGRADED_FALLBACK`, `/api/health` `status:"degraded"` with `storage.authoritative:false`, warnings, a `DEGRADED_FALLBACK.marker.json` beside the store; the manager never switches backends later in the process |
| persistence used before `initialize()` | strict: error; non-strict: implicit disk store reported degraded if PostgreSQL is configured |

> **Compatibility note:** the development workflow with a stale/unreachable `DATABASE_URL` still runs, but visibly degraded; set `PERSISTENCE_MODE=disk` to choose the disk store explicitly, or `PERSISTENCE_STRICT=true` to forbid fallback. The PostgreSQL adapter status no longer claims `diskBacked: true`.

### 1.5 Migration readiness
Migration **004** (`004_durable_repositories_identity_and_payload`, additive only, **not executed**): `users`, `user_sessions` (FK → users), `monitor_notes`, 12 payload tables with owner/security/ref indexes, `payload JSONB` on 9 existing tables, owner/visibility on `research_queries`, extended `legacy_unowned_records` view. Review findings (see `phase38_2b_migration_dry_run_design.md` §D): original `created_at` of notebooks/documents/evidence now bound explicitly; **PIT**: undated evidence is no longer treated as always available (PG and disk previously included `NULL published_at` in every historical query; the in-memory repository excluded it); date-only `asOf` now means end-of-day inclusive in **all** code paths (the in-memory repository and disk `getHistoricalEvidence` used start-of-day); immutable snapshot/evidence timestamps are preserved on re-save; FKs deliberately not added (dangling legacy references, immutable history). **Dry-run design and legacy-classification plan produced as documents only** (`phase38_2b_migration_dry_run_design.md`); nothing executed, nothing assigned.

---

## 2. Files changed (this phase)

**New:** `server/persistence/pit.ts`, `server/persistence/postgres/payloadTable.ts`, `server/persistence/postgres/postgresPayloadRepositories.ts`, `src/services/authClient.ts`, `src/state/AuthContext.tsx`, `src/components/auth/AuthGate.tsx`, `tests/phase38_2b_persistence.test.ts`, `tests/helpers/repoSpecs.ts`, `tests/helpers/schemaReconcile.ts`, `tests/helpers/legacyFixtures.ts`, `phase38_2b_migration_dry_run_design.md`, `phase38_2b_report.md`.

**Modified (production code):** `server.ts` (health reports storage truthfully; injectable storage source), `server/auth/engineScope.ts`, `server/persistence/persistenceManager.ts`, `server/persistence/types.ts`, `server/persistence/devAdapter/developmentPersistenceAdapter.ts`, `server/persistence/migrations/{schema,migrationRunner}.ts`, `server/persistence/postgres/{postgresClient,postgresAdapter,postgresRepositories}.ts`, `server/services/{decision/decisionIntelligenceService,research/notebookService,monitor/investmentMonitorEngine,discovery/researchPrioritizationEngine,commandCenter/researchCommandCenterService,relationships/crossInvestmentService,events/investmentEventEngine,evidence/evidenceRepository,evidence/evidenceCollectionService}.ts`, `src/types.ts`, `src/App.tsx`, `src/components/Header.tsx`, `src/components/scenarios/PortfolioScenarioView.tsx`, `src/components/decision/CounterfactualDecisionView.tsx`, `package.json` (+ `test:persistence`, devDependency `pg-mem`), `package-lock.json`.

**Modified (tests, fixtures only — assertions unchanged):** `tests/phase25_acceptance.test.ts`, `phase26.test.ts`, `phase26_acceptance.test.ts`, `phase30_acceptance.test.ts`, `phase31_acceptance.test.ts` (classify legacy store fixtures `SHARED` in memory via `legacyFixtures`; Phase 25 fixtures marked `SHARED`), `tests/phase38_2a_security.test.ts` (migration-version assertion generalised from "exactly 1,2,3" to "1,2,3 untouched, later versions appended").

## 3. Schema changes (migration 004; not executed)
`users`, `user_sessions`, `monitor_notes` (new); `research_priority_snapshots`, `cross_investment_snapshots`, `portfolio_scenario_snapshots`, `counterfactual_snapshots`, `research_memories`, `research_questions`, `research_gaps`, `investigation_plans`, `investigation_audits`, `evidence_collections`, `evidence_relationships`, `evidence_audits` (new, payload tables); `ADD COLUMN payload JSONB` on `research_documents, evidence_items, research_notebooks, research_snapshots, investment_decisions, strategies, backtests, alerts`; `research_queries` + `owner_user_id, visibility, payload`; view `legacy_unowned_records` replaced (additive). No RLS.

## 4. Route changes
No route added or removed; public allow-list unchanged (5). Behavioural: `GET /api/health` now includes `storage {mode, degraded, authoritative}` and `status:"degraded"` when applicable; `GET /api/persistence/status` includes `storage` (status `DEGRADED_FALLBACK` when degraded); `GET /api/monitors/:id/changes|reviews` no longer return ids of legacy/foreign decisions/snapshots.

## 5. Verification — actual results (final run, from the original `store.json`)

Test categories are **never mixed**: **[DET]** deterministic in-process; **[SIM]** simulated database (`pg-mem`, an in-process *emulator*, not PostgreSQL); **[DBL]** test doubles (fake pool / injected adapter factories); **[REAL]** real PostgreSQL integration — **none exist, none were run**.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no diagnostics |
| `npm run build` | exit 0 (`dist/server.cjs` 1.6 MB; pre-existing chunk-size warning) — includes the new auth UI |
| `npm run test:security` (Phase 38.2A, tenant isolation over HTTP) | **300 PASSED / 0 FAILED** |
| `npm run test:persistence` (`tests/phase38_2b_persistence.test.ts`) | **254 PASSED / 0 FAILED** = **[DET] 159 · [SIM] 61 · [DBL] 34 · [REAL] 0 run** |
| Phase 37 certification | **54 PASSED / 0 FAILED** |
| Phase 26 (`phase26`, `phase26_acceptance`) | 12/12 and 18/18 PASSED |
| Phase 36 acceptance | 92 PASSED / **16 FAILED** — the failing set is **identical** (diffed by name) to the Phase 38.2A final run: all 16 are live-provider connectivity checks (Twelve Data / FYERS / SEC EDGAR reachability, Gemini availability, AAPL live quote/bars). Not auth/persistence related; requires network/credentials. A pre-Phase-38.2A baseline was not obtainable (it would require copying `.env`), so the comparison baseline is the 38.2A run. |
| Existing deterministic regression (37 suites, phase5a … phase35) | all exit 0 — 5a 27/27, 5c 13/13, 6 43/43, 7a 54/54, 8b 55/55, 9 59/59, 10 50/50, 12a 65/65, 12b 74/74, 13 108/108, 14 97/97, 15 119/119, 16 41/41, 17 39/39, 18 65/65, 19 74/74, 20 32/32, 21 42/42, 23 11/11, 24 10/10, 25 12/12, 27.1 18/18, 28.1 12/12, 28 12/12, 29 24/24, 30 61/61, 31 74/74, 32 72/72, 34 65/65, 35 71/71 (fyersProvider, 8a, 25_acceptance, 33 exit 0 without a summary line) |
| `data/persistence/store.json` | SHA-256 `4c40c2dc…ba3` recorded before the first run and re-verified `cmp`/`shasum` **byte-identical after restoration**; the Phase 38.2B suite additionally asserts the hash is unchanged by itself (it uses temp directories). |

**Mutation checks (suite is not vacuous):** making `visibleToEngine` accept ownerless records fails 9 checks (real engines — command center, scenario, questions, gaps, monitor — then emit `legacy-marker` ids); removing the Phase 38.2A auth gate fails 13.

**What the new suite covers (maps to the brief):** two-user isolation for **all 31 repositories** on the development adapter *and* the simulated PostgreSQL adapter (A sees only A, B only B, ownerless legacy record visible to neither; shared-reference/identity/tenant-keyed variants asserted separately) · ownerless records excluded from private derived outputs across 6 engines + monitor · dedup/cache/client-id attacks (documents, evidence collections, notebooks, strategies, alerts, decisions, backtest cache, `backtestId`) · payload round-trips (no field loss/fabrication) · PIT correctness (null dates, date-only boundary, historical lookup) on 3 code paths · session lifecycle and protected UI workflow (reducer, client, 401 handling, real HTTP cookie lifecycle) · transaction rollback/commit/nesting/concurrency/connection release · storage unavailability and truthful health (6 policy branches + `/api/health`) · legacy records unchanged and inaccessible · operator routes and the 5-route allow-list.

### What each category does NOT prove
* **[SIM]** pg-mem is an emulator: it ignores some semantics (it returns the existing row from `RETURNING` on a conflicting `ON CONFLICT DO NOTHING`; it applies no transaction isolation on `ROLLBACK`; it lacks `jsonb_build_object` and `CREATE OR REPLACE VIEW … UNION ALL`). Those behaviours are asserted only through [DBL] zero-row/fake-connection tests and static SQL checks — **not** against PostgreSQL.
* **[DBL]** proves the code issues BEGIN/COMMIT/ROLLBACK on one connection and reacts correctly to failures; it does not prove PostgreSQL honours them for our statements.
* **Static reconciliation** proves repository SQL ⊆ migration columns; it does not prove the DDL executes.

## 6. Unresolved findings and limitations

| # | Finding | Severity |
|---|---|---|
| U1 | **PostgreSQL integration is entirely unverified**: migration execution (001–004), constraint/unique-index/CHECK behaviour, `COALESCE(owner_user_id,'')` unique index, the `legacy_unowned_records` view (not even parsed by the emulator), real ROLLBACK/COMMIT, `ON CONFLICT … WHERE` owner guards, JSONB operators, query plans/performance, behaviour with the 31 repositories on a live server. | **High (gate for any activation)** |
| U2 | **No data migration exists or was executed**; legacy classification decisions (R1–R3 in the dry-run design) are unapproved. All ownerless legacy records remain restricted *and now invisible to every engine as well as to the API* — historical analytics derived from legacy evidence/decisions/snapshots will be empty until classified. | Medium (product impact) |
| U3 | `PostgresPortfolioRepository`/`PostgresWatchlistRepository` use the tenant id as the row key; the `default` key and all non-owned rows are legacy-restricted. Portfolio positions in engines are scoped by that key (not by a per-record owner field). | Medium |
| U4 | Foreign keys beyond `user_sessions → users` are intentionally absent (dangling legacy references; immutable history). Referential integrity is application-enforced. | Low–Medium |
| U5 | Row-level security still not enabled. The transaction fix removes one prerequisite (single connection per transaction) but per-request `SET LOCAL app.user_id` plumbing does not exist. | Medium |
| U6 | Payload tables filter some predicates in JavaScript after tenant/status/ref pushdown (security-substring match, `asOfDate`, task/question/plan ids). Correct but not index-optimal for very large tenants. | Low |
| U7 | `monitor.baselineDecisionId` and similar pointers stored on a user's own monitor may reference legacy records; they are no longer surfaced in review output but remain in the monitor's own stored data. | Low |
| U8 | Evidence-collection ids are content-derived; identical re-collection now gets a `_rN` revision id (previously the development adapter overwrote the earlier record, PostgreSQL-style stores would have thrown). | Behaviour change |
| U9 | Phase 36 live-provider scenarios fail in this environment (see §5). Provider-dependent routes (evidence gathering, decision evaluation, backtests) were not exercised over HTTP. | Environmental |
| U10 | The auth UI is the minimum flow (no password reset, no email verification, no rate-limit UX, no CSRF token UI); the existing CSRF logic remains production-only. The UI components themselves are compile-verified (build) but not browser-tested. | Low–Medium |

## 7. Compatibility notes
1. **Storage**: with `DATABASE_URL` set but unreachable, development now starts **degraded** (loudly reported) rather than silently on disk; production/`PERSISTENCE_STRICT` fails startup. Production without `DATABASE_URL` and without `PERSISTENCE_MODE=disk` now refuses to start. `.env` was not changed — if your `.env` still holds an unreachable `DATABASE_URL`, local runs will report `DEGRADED_FALLBACK` until you set `PERSISTENCE_MODE=disk` (or fix the database).
2. **Tests**: five historical suites (Phase 25 acceptance, 26, 26.1, 30, 31) relied on ownerless fixtures in the shared `store.json`; they now classify them `SHARED` **in memory, test-process only** through `tests/helpers/legacyFixtures.ts`, assertions unchanged. `phase38_2a_security` changed one assertion from "versions are exactly 1,2,3" to "1,2,3 untouched, later versions appended" (required by the new migration).
3. **New devDependency** `pg-mem` (+ `package-lock.json`) used only by `tests/phase38_2b_persistence.test.ts`.
4. Users must now sign in through the new UI screen; sessions use the existing HttpOnly cookie.

## 8. Required next steps (not done; need separate approval)
1. Approve/adjust the legacy classification plan (§C of the dry-run design) and the throw-away database for a dry run.
2. Write and run **real PostgreSQL integration tests** (isolation, PIT, immutability, transactions, migration idempotency) against a disposable instance.
3. Implement the ownership-assignment tool (dry-run first) writing `ownership_assignments`.
4. Per-request tenant context on the PG connection → then RLS.
5. Phase 38.3 was **not** started.

**Explicitly: PostgreSQL integration, migration execution and production-data migration remain unverified.**

