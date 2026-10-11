# Phase 38.2C — Legacy Data Classification Audit and Ownership Dry-Run Design Validation

**Final status: `READY WITH LIMITATIONS`**

Read-only audit. **No source, test, fixture, migration or configuration file was changed; no database was contacted; no migration was run; no record was assigned an owner or classified.** `data/persistence/store.json` was opened read-only by Python scripts and its SHA-256 was `4c40c2dc137f7d8283d988ae4dd59e704e704ca9b4b8b32c1cc81b973f9ba7a3` before the first read and after the last (identical to the hash recorded at the end of Phase 38.2B). No test suite was executed (several suites write to `store.json`). This file is the only artifact created. **Nothing here authorises data modification.**

---

## 1. Executive summary

1. **The store is, on all available evidence, test/fixture data — not tenant data.** All 191 users have one of 7 synthetic e-mail patterns (`audit_usera_N@example.com`, `audit_userb_N@example.com`, `user_a_N@…`, `user_b_N@…`, `analyst_alpha_N@fund.com`, `analyst_beta_N@fund.com`, `acceptance_N@terminal.com`), all created 2026-09-16 → 2026-10-10. 2,537 of the 3,916 non-identity records are owned by identities that **do not exist** in `users` (`analyst-1`, `analyst-acc-a-<ts>`, `analyst-p27a-<ts>`, `val-user-*`, `analyst_cert_A_<ts>`, …); 275 of 299 events and 59 of 86 ownerless decisions have fixture-style ids. This cannot prove that no real person's data is present, so the first decision for the owner is whether that is true (Decision D1).
2. **The existing design omitted the largest class: orphan-owner records** (owner present but not a registered user) — 2,537 records (65 % of the data) are *neither* ownerless nor reachable by any real principal. The design's `legacy_unowned_records` view (`owner_user_id IS NULL`) would not list them.
3. **Four existing design decisions should be rejected or materially corrected** (§6): the `uploadedBy = 'sec_edgar'` ⇒ shared document rule (REJECT), the provider-evidence candidate set (count wrong, includes 36 fixtures outside the code's own allow-list, includes simulated/unavailable items), the blanket "events are shared reference data" (REJECT as a blanket; 275/299 are fixtures, 20 simulated), and R2 decision re-assertion (only 27 of 86 ownerless decisions are even system-pattern).
4. **Two new High findings in current code** that would silently create false sharing (§5.5): (a) hydrated *legacy* snapshots flow into new decisions that are then stamped `SHARED`; (b) `notebookService` stamps `SHARED` on any ownerless call even when a custom query or portfolio context was supplied.
5. **Persisted cross-tenant contamination already exists** in derived records (one monitor review embeds the title of a registered user's private document; 7 scenario snapshots embed that user's private evidence id; 287 evidence-audit rows point at collections now owned by a different tenant because the old store overwrote collections by content-derived id). Those records must be `RESTRICTED_PENDING_REVIEW` and can never be shared.
6. **Deleted documents/evidence resurrect** at restart (deletion is in-memory only), so presence in `store.json` does not prove a user still wants the record retained.

**Recommended path (subject to your approval):** classify nothing as `SHARED` from the legacy store; treat the whole file as quarantined legacy/test data; re-create shared reference data from the providers rather than promoting legacy rows; only consider record-level promotion for the small, verifiable sets listed in §7.

## 2. Files and code inspected

**Reports/design:** `phase38_2b_migration_dry_run_design.md`, `phase38_2b_report.md`, `phase38_2a_report.md`.
**Data:** `data/persistence/store.json` (version 1, `lastPersistedAt` 2026-10-10T09:59:22Z; 32 collections; 4,393 records; read-only).
**Auth/policy:** `server/auth/accessPolicy.ts` (`evaluateAccess` L57, `canRead` L66, `isLegacyUnowned` L88), `server/auth/engineScope.ts` (`visibleToEngine` L21), `server/auth/authorizationService.ts`, `server/auth/routePolicy.ts`.
**Persistence:** `server/persistence/types.ts`, `devAdapter/developmentPersistenceAdapter.ts`, `postgres/postgresRepositories.ts`, `postgres/postgresPayloadRepositories.ts`, `postgres/payloadTable.ts`, `persistenceManager.ts`, `pit.ts`, `migrations/schema.ts` (001–004; not executed).
**Services (writers/readers/derivers):** document ingestion/registry, evidence service/repository/collection service, notebook service, decision intelligence/delta/counterfactual, monitor engine, event engine, discovery, command center, cross-investment, scenarios, research memory/questions/gaps/plans, watchlist/alert services, backtest service.
**Tests:** `tests/phase38_2a_security.test.ts`, `tests/phase38_2b_persistence.test.ts` and helpers (read only, not run).

## 3. Complete inventory of all 32 `store.json` collections

Legend — Owner: **REG** = owner is a registered user; **ORPH** = owner present but not in `users`; **NONE** = no owner field value. Conflicting ownership metadata (`ownerUserId` ≠ `userId` ≠ `tenantId` within one record) was tested for every collection: **0 record-level conflicts**; the only contradictions are key-vs-owner conflicts in `portfolio.default` (§5.4). Visibility: **no record in any collection carries a `visibility` value** (0 explicit `SHARED`, 0 explicit `PRIVATE`, 100 % absent/unknown).

| # | Collection | Records | REG | ORPH | NONE | Class | Sensitive/user-specific? | Main code paths |
|---|---|---:|---:|---:|---:|---|---|---|
| 1 | securities | 34 | – | – | 34 | reference | no | seeded by `persistenceManager.seedInitialSecurities`; read via `resolveSecurity` (code constant), repo `getSecurityRepository` unused by services |
| 2 | documents | 91 | 73 | 0 | 18 | user-owned | **yes** (uploaded research) | `documentIngestionService`→`documentRegistry` (write, hydrate); `authorizationService`; delete is memory-only |
| 3 | evidence | 341 | 3 | 0 | 338 | mixed: provider/derived/user | partly (35 document-derived, 43 portfolio-derived) | `evidenceService.gatherEvidence`, `evidenceRepository` (write-through, hydrate-all), `retrievalEngine`, monitor, scenario, cross-investment |
| 4 | notebooks | 1 | 0 | 0 | 1 | derived | low | `notebookService` (in-memory map + persist), monitor/discovery/command center |
| 5 | snapshots | 175 | 0 | 1 | 174 | derived/user | **yes** (49 carry non-empty `portfolioContext`; custom queries) | `notebookService.executeResearch`, monitor baseline, decision inputs, command center |
| 6 | decisions | 109 | 23 | 0 | 86 | derived | medium (portfolio fit) | `decisionIntelligenceService` (write), delta/counterfactual, 13 engines read |
| 7 | strategies | 46 | 46 | 0 | 0 | user-owned | yes | repo read only by `authorizationService`; custom strategies live in `quantStrategyEngine` memory (store rows are historical); 8 rows legacy shape (`strategyId`, no `id`) |
| 8 | backtests | 103 | 43 | 0 | 60 | derived/user | yes | `backtestService` (write, hydrate-all) |
| 9 | watchlists | 3 keys | key-scoped lists | – | – | user-owned | yes | repo read by discovery only; `watchlistAlertService` is in-memory (not persisted) |
| 10 | alerts | 2 | 0 | 0 | 2 | operational/derived | low | written by `investmentEventEngine.emitEventAlert` (L616), read by `authorizeAlert`; 1 row has no `id` |
| 11 | portfolio | 38 keys / 40 positions | key-scoped | – | – | user-owned | **yes** | read by monitor, scenario, cross-investment, discovery, command center, events (`'default'`, L503) |
| 12 | queries | 0 | – | – | – | – | – | repo unused by any service |
| 13 | users | 191 | – | – | – | identity | **secrets**: 191 scrypt `passwordHash` values stored in the file | `authService` |
| 14 | sessions | 286 (252 valid) | – | – | – | identity/operational | session ids are bearer credentials | `authService`; 0 orphan sessions |
| 15 | events | 299 | – | – | 299 | reference-claimed | no owner concept | `investmentEventEngine`, 7 other engines; `GET /api/events` returns all |
| 16 | monitors | 319 | 0 | 319 | 0 | user-owned | yes | `investmentMonitorEngine` |
| 17 | monitorReviews | 324 | 0 | 324 | 0 | derived | yes | monitor engine, memory, discovery, command center |
| 18 | analystNotes | 138 keys / 361 notes | notes carry `userId` = their monitor's (orphan) owner | | | user-owned | yes (free text) | `monitorRepo.addNote/getNotes` |
| 19 | monitoringPolicies | 176 | 0 | 176 | 0 | user-owned | yes | alert orchestration |
| 20 | orchestratedAlerts | 111 | 0 | 111 | 0 | derived | yes | alert orchestration, discovery, command center |
| 21 | researchPriorities | 777 | 0 | 777 | 0 | derived/cache-like | yes | discovery (regenerated snapshots) |
| 22 | crossInvestmentSnapshots | 13 | 0 | 13 | 0 | derived | yes | cross-investment |
| 23 | portfolioScenarioSnapshots | 7 | 0 | 7 | 0 | derived | yes | scenarios |
| 24 | counterfactualSnapshots | 10 | 0 | 10 | 0 | derived | yes | counterfactual |
| 25 | researchMemories | 94 | 0 | 94 | 0 | user-owned | yes | memory service |
| 26 | researchQuestions | 47 | 0 | 47 | 0 | user-owned | yes | question service |
| 27 | researchGaps | 60 | 0 | 60 | 0 | user-owned | yes | gap service |
| 28 | investigationPlans | 28 | 0 | 28 | 0 | user-owned | yes | plan service |
| 29 | investigationAudits | 207 | 0 | 207 | 0 | operational/audit | yes | plan/question/gap services |
| 30 | evidenceCollections | 18 | 0 | 18 | 0 | user-owned | yes | evidence collection service |
| 31 | evidenceRelationships | 18 | 0 | 18 | 0 | derived | yes | evidence collection service |
| 32 | evidenceAudits | 327 | 0 | 327 | 0 | operational/audit | yes | evidence collection service |

**Totals:** 4,393 records. Excluding users/sessions (477): 1,012 ownerless, 188 owned by a registered user, **2,537 owned by an unregistered identity**, 179 key-scoped list entries (watchlists, portfolio, notes are lists; their scope is the map key, not a record field). `queries` is empty.

**Handling by adapter.** *Development adapter*: every collection is a JSON map; ownership/visibility are whatever the record carries; scoped reads use `canRead` (`getAllForOwner` etc.), unscoped `getAll` is internal. *PostgreSQL adapter (unexecuted)*: rows get `owner_user_id` from `ownerOf()`/`ownerParams()` (`userId || tenantId || ownerUserId`) and `visibility='PRIVATE'` default; ownerless ⇒ `NULL` (listed by `legacy_unowned_records`); **orphan owners load as ordinary owned rows** (no FK on `owner_user_id`) and are not listed by the view; portfolio/watchlist rows take their *map key* as owner (`postgresRepositories.ts` watchlist/portfolio writers) — for the `default` key owner is `NULL`.

**Orphan-owner families** (distinct identities): monitors 99, reviews 80, policies 40, orchestrated alerts 27, priorities 18, memories 21, questions 18, plans 17, audits 17+19, collections 2, relationships 3 — e.g. `analyst-1`, `analyst-acc-a-<ts>`, `analyst-p27a-<ts>`, `analyst-alpha[-<suffix>]`, `analyst_cert_A_<ts>`, `val-user-*`, `usr_restart_test`, `institutional_analyst_user_a`.

## 4. Ownership and visibility distribution (summary)

| State | Count | Notes |
|---|---:|---|
| Valid owner (registered user) | 188 + identity | documents 73, decisions 23, strategies 46, backtests 43, evidence 3 — all owned by 7 synthetic account families |
| Ownerless (NONE) | 1,012 | securities 34, documents 18, evidence 338, notebooks 1, snapshots 174, decisions 86, backtests 60, alerts 2, events 299 |
| Invalid/orphan owner | 2,537 | all derived/operational families above + 1 snapshot (`analyst_alpha_p29`) |
| Conflicting ownership metadata | 0 per-record; **3 key-vs-owner conflicts** | `portfolio.default` positions owned `analyst-alpha`/`analyst-beta` |
| Explicit SHARED / PRIVATE | 0 / 0 | |
| Missing visibility | 100 % | |

## 5. Relationship and provenance findings

Method: an id index over 25 record collections; every string value of every record was matched against it (exact match), classified same-owner / different-owner / ownerless / dangling. Chunk ids (`-chk-N`) and plan-embedded `task_*` ids are sub-entities that are not stored as records and were excluded from "dangling".

### 5.1 Cross-collection references
* `documents → evidence`: 23 `…-chk-N` ids are chunk ids (benign); 20 ownerless-doc→ownerless-evidence and 3 owned→owned pairs are consistent.
* `snapshots → evidence`: 462 refs, all to ownerless evidence; `snapshots → notebooks`: 49 to `nb-us-nvda`; 1 dangling `ev_p29_sec_1`; 75 refs to `nb-audit-1`/`nb-acceptance-1` which **do not exist** in `notebooks` (dangling).
* `monitors → decisions`: 238 refs to **ownerless** decisions; `→ snapshots`: 306 to ownerless snapshots (the unregistered `analyst-*` owners baseline on ownerless system artifacts).
* `monitorReviews`: 323 refs to ownerless decisions, 309 to ownerless snapshots, 34 to ownerless evidence, **1 to a different owner's evidence** (below).
* `researchPriorities → decisions`: 111 refs to ownerless decisions (`dec-audit-immutable-*` fixtures).
* `counterfactualSnapshots → decisions`: 10 to ownerless decisions; 20 dangling evidence refs (`ev_mkt_undefined_bars`, `ev_sec_undefined_10k`).
* `events`: 13/13 `evidenceIds` dangling; no event has `affectedDecisionId`/`affectedSnapshotId` (0 of 299).
* `researchMemories/Questions/Gaps`: 42/13/15 dangling `ev_*` evidence refs (evidence that never existed in `evidence`).
* `backtests → strategies`: 24 owned→same-owner; 19 owned backtests reference built-in/unknown strategies; 60 ownerless backtests all use built-ins (`builtin-momentum-rsi` 38, `strat-ma-crossover` 22).

### 5.2 Records whose provenance spans tenants (tainted — must stay restricted)
| Record(s) | Owner | Contains | Evidence |
|---|---|---|---|
| monitor review `rev_mon_us-aapl_1790077302552` | `analyst-1` (orphan) | change item titled **"Evidence: User A Apple Q1 Model (Section 1/1)"** referencing `ev-doc-doc-161821d66bd6-sec-1` | that evidence is owned by registered user `usr_9eb7a2bf-…` (document `doc-161821d66bd6`, "User A Apple Q1 Model"); the title (not the body) is embedded |
| 7 scenario snapshots `snap_hist_test_*` | `analyst-1` | `evidenceIds` list includes the same private evidence id | same record |
| 287 of 327 evidence-audit rows | per-row tenant | reference collections whose current record owner differs | collection ids are content-derived; the old store overwrote a collection with the last writer's record (fixed for new writes in 38.2B) so audit tenant ≠ collection owner |
| research memories (2), questions (8), plans (2), relationships (12) | various | reference collections now owned by another tenant | same cause |

### 5.3 Derived records, inputs and provenance sufficiency
| Derived family | Inputs | Provenance stored? | Verdict |
|---|---|---|---|
| decisions (86 ownerless) | provider evidence, market quote, **notebook snapshot** (`decisionIntelligenceService.ts` L696-720), sample portfolio constant | `supportingEvidenceIds` on 14; marketContext provider on 27 (15 `UNAVAILABLE`, 12 Twelve Data); **no snapshot id, no input hashes** on any | insufficient to prove inputs were shared-only |
| snapshots (174 ownerless) | evidence + user `query`/`portfolioContext` | `portfolioContext` non-empty in 49; 4 distinct custom queries ("Re-evaluate investment thesis after new export control risk assessment.", …) | user-supplied content ⇒ never shareable |
| research priorities / reviews / alerts / cross / scenario | monitors, decisions, events, portfolio | reference ids only | derive from orphan-owner inputs ⇒ restricted |
| evidence (338 ownerless) | see §5.4 | `provider`, `sourceReference` (173 of the 224 provider-type items have an accession number), `retrievedAt` | provider items only partially verifiable |

### 5.4 Special cases
* **`portfolio.default`** holds 3 positions whose `ownerUserId` is `analyst-alpha` / `analyst-beta` — contradicts the key. The remaining 37 position rows have no owner field and are keyed by orphan ids (`analyst-acc-a-<ts>`, `analyst-p<N>-a-<ts>`). The event engine reads `getPositions('default')` (`investmentEventEngine.ts` L503) and monitor seeding reads it (L115), so the contradictory rows can reach derived output.
* **Users/sessions** are identity data: not classification candidates; `store.json` stores scrypt hashes and live session ids (secrets) — they must be excluded from any copy shared outside the operator.
* **Documents**: all 18 ownerless are fixtures: 15 `uploadedBy = system_user` (the *default* value, `documentIngestionService.ts` L42), 1 `sec_edgar` (`doc-097849402ac5`, provider "User Research Document", 113 characters of test text from the Phase 17 suite), 1 `compliance_officer`, 1 record with no uploader and missing fields (`doc-acceptance-…`); `doc-bd1a58265d96` "Hacking attempt" is a security-test artefact.
* **Deletion lifecycle**: `documentRegistry.deleteDocument` (L165-172) and `EvidenceRepository.removeEvidence` (L247) remove from memory only; no repository delete exists for documents/evidence, so a user-deleted private document/evidence returns after restart through hydration.
* **Alerts** (2) are system-emitted by the event engine from a test event (`evt-test-invalidation-001`); 1 lacks an `id`.

### 5.5 Current-code findings that would create false sharing (not fixed — read-only phase)
| ID | Severity | Finding | Location |
|---|---|---|---|
| F1 | **High** | `researchNotebookService.hydrateFromPersistence` loads **all** persisted snapshots (incl. 174 ownerless/legacy) into the in-memory map; `decisionIntelligenceService` calls `researchNotebookService.getLatestSnapshot(notebookId)` with **no visibility filter** and copies `bullCasePoints`, `bearCasePoints`, `risks`, `catalysts` into the decision, which is then stamped `SHARED` when no owner is supplied. A legacy, unclassified snapshot (49 contain user portfolio context and custom queries for `nb-us-nvda`) can therefore leak into a new decision visible to everyone. | `decisionIntelligenceService.ts` L125, L696-720; `notebookService.ts` L960-963, hydrate; `server.ts` L166 |
| F2 | **High** | `notebookService.executeResearch/getOrCreateNotebook` stamp `visibility:'SHARED'` for **any** call without an owner, even when `customQuery`/`portfolioContext` were supplied (the HTTP route always passes an owner, but internal callers can not). Part of the chain behind F1. | `notebookService.ts` L92, L486-488 |
| F3 | Medium | `GET /api/events` and event-derived engines treat all 299 events as shared reference data though 20 are `SIMULATED`, 34 lack `sourceType`, and 275 are `ev_*` fixtures; events have no visibility field. | `server.ts` events route; `investmentEventEngine.ts` |
| F4 | Medium | Event engine reads positions from the `'default'` key (contradictory owners). | `investmentEventEngine.ts` L503 |
| F5 | Medium | Design view `legacy_unowned_records` omits orphan-owner rows. | migration 004 view definition |
| F6 | Low–Med | Deletion is not durable (§5.4). | `documentRegistry.ts` L165-172 |
| F7 | Low | System alerts are ownerless by construction (`emitEventAlert`), so `authorizeAlert` can never grant access to them. | `investmentEventEngine.ts` L612-630, `authorizationService.ts` |

**Can a derived result be exposed although its source is hidden?** Yes — F1/F2 (source hidden by `visibleToEngine`/`canRead`, but still consumed via the notebook map); persisted tainted derived rows (§5.2) are unreachable by real users today only because their owners are orphans, which is an accident of the test data, not a control.

## 6. Decision-by-decision review of `phase38_2b_migration_dry_run_design.md`

| # | Design decision (location) | Verdict | Reason and evidence |
|---|---|---|---|
| 1 | §A preconditions (throw-away DB, strict mode, approval, verified backup) | **ACCEPT** | consistent with `persistenceManager.ts` strict policy |
| 2 | §B phases 0–8 (freeze → inventory → validation → proposal → apply on throw-away → load → reconcile → behavioural → decision) | **ACCEPT_WITH_CONDITIONS** | add: orphan-owner stage; secrets handling for `passwordHash`/session ids; load users before sessions (FK); document/evidence deletion lifecycle (§5.4) |
| 3 | §C inventory table (7 collections only) | **REJECT as complete** | covers 7 of 32 collections; omits events detail, orphan owners (2,537), `analystNotes`, 18 other families, key-scoped portfolios |
| 4 | R1 provider evidence ⇒ `CLASSIFY_SHARED` ("259": SEC_EDGAR 176, MARKET_DATA 25, FINMAGINE 16, CANONICAL_METADATA 6, **SEC_FILING 36**) | **ACCEPT_WITH_CONDITIONS** (rule) / **REJECT** (the 36) | by `sourceType` the code allow-list (`evidenceService.ts` L33-39) matches **224** items (177/25/16/6), not 259; the 36 `SEC_FILING` rows are `ev-pit-acceptance-*` fixtures, `provider` null, and `SEC_FILING` is **not** in the allow-list. Within the 224: 2 `SIMULATED`, 2 `UNAVAILABLE`, 5 without `publishedAt` (PIT-unusable), 16 `ev_test_*` fixtures. "Fresh fetch with identical fingerprint" is verifiable for SEC filings/facts but **not** for historical quotes (25 MARKET_DATA, retrievedAt 2024-01-01 → 2026-10-10) |
| 5 | Evidence `RESEARCH_DOCUMENT` (35) ⇒ `RETAIN_RESTRICTED` | **ACCEPT** | 20 link to ownerless docs, 14 FoundryTracker rows have no `documentId`; no safe owner derivable |
| 6 | Evidence `PORTFOLIO` (43) ⇒ `RETAIN_RESTRICTED` | **ACCEPT** | providers "Portfolio Intelligence Engine/Risk Analytics/Performance Attribution"; derived from some portfolio; ids are global (`ev-port-*`) so owner unrecoverable |
| 7 | Snapshots (174) ⇒ `RETAIN_RESTRICTED` | **ACCEPT** | 49 hold non-empty `portfolioContext`, 4 custom user queries; no input provenance |
| 8 | R2 decisions ⇒ `CLASSIFY_SHARED` if recomputation-verified | **ACCEPT_WITH_CONDITIONS** | only 27 of 86 match the system id pattern `dec-<sec>-<date>-1.0.0`; 59 are `dec-audit-immutable-*`/`dec-immutable-*` fixtures; of the 27, 15 have `marketContext.provider = UNAVAILABLE` (not reproducible) and 12 depend on Twelve Data quotes (not reproducible at past dates without PIT provider data); inputs include a notebook snapshot (F1) and the sample portfolio. Verification must compare against a recomputation that reads **only SHARED inputs** |
| 9 | Backtests (60) ⇒ `RETAIN_RESTRICTED` | **ACCEPT** | `bt-audit-immutable-*` fixtures; user-run |
| 10 | Documents: `sec_edgar` (1) ⇒ `CLASSIFY_SHARED` | **REJECT** | `uploadedBy` is free text defaulting to `system_user` (`documentIngestionService.ts` L42); the record is test text with provider "User Research Document", not an SEC artefact |
| 11 | Documents: other 17 ⇒ `RETAIN_RESTRICTED` | **ACCEPT** | |
| 12 | Notebooks (1) / alerts (2) ⇒ `RETAIN_RESTRICTED` | **ACCEPT** | notebook `nb-us-nvda` is the shared system notebook id; alerts are event-emitted |
| 13 | Watchlists / portfolio `default` ⇒ `RETAIN_RESTRICTED` | **ACCEPT_WITH_CONDITIONS** | extend to all 38 portfolio keys: `default` has contradictory owners; the other 37 are keyed by non-registered ids |
| 14 | Events (299) = "shared reference domain" | **REJECT** (blanket) | 275 `ev_*` fixtures, 20 simulated/stress, 34 without `sourceType`, 13 dangling evidence refs; only ~9 sample events (`evt-<ticker>-…`, `event-*`) look like seeded reference samples. Record-level decision required |
| 15 | R3 everything else ⇒ `RETAIN_RESTRICTED` | **ACCEPT** | |
| 16 | `ownership_assignments` ledger + same-transaction apply | **ACCEPT_WITH_CONDITIONS** | ledger columns lack `evidence`/`rule_id`/`approval_ref`; no `batch_id` for reconciliation |
| 17 | `legacy_unowned_records` must equal the `RETAIN_RESTRICTED` set | **REJECT as stated** | view tests `owner_user_id IS NULL`; 2,537 orphan-owner records are restricted-in-effect but invisible to the view |
| 18 | §D claims (payload column, original timestamps, PIT fixes, FK policy) | **ACCEPT** (design); runtime **INSUFFICIENT_EVIDENCE** | statically consistent with `schema.ts`/`pit.ts`; nothing executed |
| 19 | "Load with ownership preserved… `INSERT … ON CONFLICT DO NOTHING`" | **ACCEPT_WITH_CONDITIONS** | legacy overwrite history means last-writer-wins records already differ from their audits (§5.2); `DO NOTHING` preserves *current* state, not history |

## 7. Proposed classification matrix

`RPR` = `RESTRICTED_PENDING_REVIEW`. No row is applied by this audit.

| Collection | Current state | Proposed treatment | Evidence | Conf. | Impact if wrong | Required approval | Safe next action |
|---|---|---|---|---|---|---|---|
| securities (34) | ownerless, no visibility | **Shared reference** (system) — source of truth is code constant `CANONICAL_SECURITIES`; do not promote the legacy rows, reseed | seeded by `seedInitialSecurities`; no private fields | High | integrity (stale metadata) | confirm reseed over migrate | read-only diff vs code constant |
| documents (73 REG) | owned by synthetic accounts | User-owned (keep) | owner registered, owner==userId in all | High | exposure if reassigned | decide: retain as test fixtures or exclude | none beyond approval |
| documents (18 ownerless) | uploader free-text | **RPR** | §5.4 | High | exposure (private text) | D3 | manual review per record |
| evidence provider-type, verifiable subset (SEC EDGAR facts/filings with accession number, ≤173) | ownerless | **Candidate Shared — record-level, only after fresh-fetch fingerprint match and licence confirmation** | `sourceReference.accessionNumber`; `evidenceService.ts` L33 | Medium | false sharing of stale/simulated data | D2 | read-only fingerprint dry run (no write) |
| evidence provider-type, other (quotes, Finmagine, metadata, simulated, unavailable, undated, `ev_test_*`) | ownerless | **RPR** | §6 #4 | Medium | licensing/PIT/integrity | D2 | manual review |
| evidence `SEC_FILING` (36) | fixtures `ev-pit-acceptance-*` | **RPR / operational test fixture** | provider null | High | PIT contamination | D1 | none |
| evidence `RESEARCH_DOCUMENT` (35), `PORTFOLIO` (43) | ownerless | **RPR** | §6 #5-6 | High | exposure | D3 | manual |
| evidence (3 REG) | owned | User-owned | | High | | – | – |
| notebooks (1) | ownerless | **RPR** (system notebook id) | `nb-us-nvda`; 49 attached snapshots contain user context | Medium | exposure via F1 | D4 | review after F1 fixed |
| snapshots (174 + 1 orphan) | ownerless/orphan | **RPR**; never shared | §5.3 | High | exposure of queries/portfolio context | D3 | manual |
| decisions (27 system-pattern) | ownerless | **RPR now; candidate Shared only after recomputation from SHARED-only inputs** | §6 #8 | Medium | false sharing of derived/stale decisions | D2/D5 | read-only recomputation design |
| decisions (59 fixtures) | ownerless | **RPR / test fixture** | id patterns | High | – | D1 | none |
| decisions (23 REG) | owned | User-owned | | High | | – | – |
| strategies (46 REG, 8 legacy shape) | owned | User-owned | | High | | – | – |
| backtests (43 REG / 60 ownerless) | | User-owned / **RPR** | §6 #9 | High | | D3 | – |
| watchlists, portfolio (38 keys) | key-scoped; `default` contradictory | **RPR** (all); `default` unresolved | §5.4 | High | exposure; misleading event exposure (F4) | D3 | read-only |
| alerts (2) | ownerless, event-emitted | **Operational/system — RPR** | F7 | High | | D3 | – |
| queries (0) | empty | n/a | | High | | – | – |
| users / sessions | identity | **Operational/system — exclude from classification; secrets** | hashes + live ids | High | credential exposure | D6 | do not copy |
| events (299) | ownerless | **Record-level**: ~9 seed samples candidate shared reference; 20 simulated/stress ⇒ never reference; remainder fixtures ⇒ RPR | §6 #14 | Medium | simulation presented as reference; PIT pollution | D2 | read-only |
| monitors … evidenceAudits (orphan-owned: 319, 324, 138 keys, 176, 111, 777, 13, 7, 10, 94, 47, 60, 28, 207, 18, 18, 327) | owner present, principal does not exist | **Orphan-owner quarantine (`RPR`)**; never share; never reassign to the current user | all owners absent from `users` | High | false ownership/exposure | D1 (retain vs archive vs delete — deletion is a separate approval) | read-only |
| tainted derived rows (1 review, 7 scenario snaps, cross-owner audit/collection links) | | **RPR + flagged** | §5.2 | High | cross-tenant disclosure | D3 | record-level review |

## 8. Unresolved decisions requiring your explicit approval

| ID | Decision |
|---|---|
| **D1** | Is `store.json` entirely development/test data (as the evidence strongly suggests)? If yes: archive/quarantine the whole file, start production empty, and re-derive shared reference data from providers. If no: identify which accounts/records are real. (Also: retain, archive or eventually purge orphan-owner records — purging is out of scope and needs its own approval.) |
| **D2** | Whether any legacy record may ever be `SHARED`, and under what rule: provider evidence requires licence/source confirmation (SEC EDGAR is public; Twelve Data/Finmagine redistribution terms are unknown to this audit) and a fresh-fetch fingerprint match; events and decisions need record-level rules. |
| **D3** | Whether any ownerless/orphan record may be assigned to a real user, and the evidence standard for that mapping (the audit found none that can be derived safely). |
| **D4** | Treatment of the system notebook/snapshot lineage (`nb-us-nvda`) after fixing F1/F2. |
| **D5** | Whether system decisions may be `SHARED` at all, given inputs may include notebook snapshots. |
| **D6** | Secret handling for the 191 password hashes / 252 live sessions in the file (exclude from any migration; invalidate). |
| **D7** | Authorise fixing F1/F2/F5/F6/F3 (code changes) before any dry run — not done here. |

## 9. Risks of false sharing and false ownership

**False sharing (exposure):** promoting legacy snapshots/decisions would publish user queries and portfolio context (F1, §5.3); promoting `uploadedBy=sec_edgar` documents would publish test text under an SEC label; promoting simulated events as reference corrupts PIT analyses; blanket events sharing exposes 20 simulated events as REAL-looking reference; promoting tainted reviews/scenarios discloses a registered user's private document title.
**False ownership (integrity/privacy):** assigning orphan or ownerless records to the first/current user fabricates provenance and mixes 99+ unrelated synthetic identities; using the `default` key (contradictory owners) or timestamps/ids as ownership proof is unsafe; assigning by evidence-collection id is unsafe because the old store overwrote by content-derived id.
**Unavailable analytics:** keeping everything restricted leaves engines empty until classified (accepted trade-off).
**Integrity risk:** treating `DO NOTHING` loads as history-preserving (§6 #19).

## 10. Required safeguards for a future ownership-assignment dry-run tool (not built)

**Must:** run read-only against a verified copy; emit proposals only (no writes, no flag to enable writes in dry-run); preserve ids/timestamps/history; justify each proposed owner/visibility with machine-readable evidence (field, value, rule id, source record); flag conflicts, unknown/orphan owners, mixed-tenant provenance, dangling references, missing metadata, key-vs-owner contradictions; never derive owners from timestamps, creation order, global ids, `uploadedBy`, `system_user`, or the `default` key; be deterministic (sorted, canonical JSON, stable hashes, no clock/randomness) and emit a reviewable report; keep unresolved records `RESTRICTED`; require a signed approval artefact (approver, scope hash, rule ids, date) before any write mode exists; write mode must take a pre-change backup with SHA-256, operate per batch in one transaction, append `ownership_assignments` rows, validate afterwards, support rollback, and reconcile before/after counts per collection and per owner.
**Acceptance tests (to write later):** determinism (two runs byte-identical); zero writes (file hash and DB row-count unchanged); every proposal carries evidence; orphan/ownerless/default-key/conflict/mixed-provenance fixtures stay `UNRESOLVED`; no proposal assigns to a user absent from `users`; tainted-record fixture is flagged; approval gating (write mode refuses without artefact or on scope-hash mismatch); backup/restore round-trip; reconciliation mismatch aborts; idempotent re-run; secrets never copied.

## 11. Test and inspection limitations

* No test suite was run (several write `store.json`); conclusions about code come from static reading, not execution.
* Reference matching is exact-string; semantic/near-duplicate links (e.g. content embedded without ids) were not exhaustively searched beyond the title/content checks in §5.2.
* "Test data" is inferred from e-mail/id patterns; the audit cannot prove absence of real data.
* No external-provider licence terms were evaluated; recomputation reproducibility was assessed from stored fields only.
* PostgreSQL behaviour of migrations 001–004 and of the loader remains unverified; no database was used.
* The sandbox clock produces 2026 timestamps; dates were used only descriptively.

## 12. Recommended next steps

1. Decide **D1** (and D6); this alone may remove the need for any migration.
2. If code remediation is approved (D7): fix F1/F2 (visibility-filter notebook snapshots; do not stamp `SHARED` when query/portfolio context present), extend the legacy view/ledger to orphan owners, make deletion durable, and decide the event model — then re-run this audit's read-only scripts.
3. Approve a *record-level* review list for the small candidate sets (SEC EDGAR evidence with accession numbers; ~9 seed events), each requiring D2.
4. Only then specify (not yet implement) the dry-run tool against §10, followed by real PostgreSQL integration tests on a disposable instance.
5. Phase 38.3 is not started.
