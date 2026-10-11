# Phase 38.2A — Authentication & Tenant Isolation Remediation Report

**Final status: COMPLETE WITH LIMITATIONS**

No PostgreSQL database was provisioned or contacted. No migration was executed. `.env` was not modified. `store.json` was not migrated (it was backed up before test runs and restored afterwards). No trading/execution capability was added. Phase 38.2B was not started.

---

## 1. Baseline verification (findings confirmed / disproved against the current code)

> Note: `phase38_1_report.md` does not actually contain findings T1–T6 / B3 (it covers the in-memory evidence repositories, fail-fast fallback and migration gaps). The findings below were taken from the Phase 38.2A brief and each one was re-verified against the source.

| ID | Finding | Verdict | Evidence in code (before this phase) |
|----|---------|---------|----------------------------------------|
| T1 | `requireAuth` imported but never applied; anonymous handlers share `analyst-1` | **CONFIRMED** | `requireAuth` had zero call sites; **90** handlers used `req.user?.userId \|\| 'analyst-1'`; 227 `/api` routes were reachable anonymously. |
| T2 | `/api/pilot/*` trusts client `tenantId` | **CONFIRMED** | `req.query.tenantId` / `req.body.tenantId` with default `'analyst_pilot_01'`; any caller could drive any tenant's evidence ledger. |
| T3 | `/api/persistence/{documents,backtests,evidence}` unscoped | **CONFIRMED** (plus `decisions`, `snapshots`) | `getAll()` / `queryEvidence()` with no principal; `decisions/:id` and `snapshots/:id` also unscoped. |
| T4 | Ownership checks allow ownerless records; helpers inconsistently called | **CONFIRMED** | Every `authorize*` used `if (owner && owner !== userId)` ⇒ ownerless = public. Not called on: `/api/decisions/*` (all), notebook routes, `/api/alerts/:id/analyze`, `/api/strategies/evaluate`, `/api/backtests/run`, delta/timeline/traceability; alert rule PATCH/read/ack only checked `if (req.user?.userId)`. |
| T5/T6 | Optional tenant scope / unscoped repo+service queries | **CONFIRMED** | `getWatchlist/getAlertRules/getAlertEvents(userId?)` returned **all** tenants when `userId` absent and ownerless items for everyone; `retrievalEngine`, `documentRegistry`, `/api/evidence` treated ownerless as public; 3 engine-level unscoped `getAll()` reads (below). |
| B3 | Ownership not persisted in PostgreSQL | **CONFIRMED** | `research_documents, evidence_items, research_notebooks, research_snapshots, investment_decisions, strategies, backtests, alerts, watchlists, portfolio_positions` had **no** owner column; INSERTs and row mappers dropped `ownerUserId/userId`. |

### Additional defects found while verifying (not in the brief)

| ID | Defect | Fix |
|----|--------|-----|
| N1 | Document dedup keyed on global content hash: user B uploading identical content received **A's document record** (`isDuplicate:true`). PG had a global `UNIQUE(content_hash)`. | Owner-scoped dedup + owner-scoped `documentId`; migration 003 swaps the unique constraint for `(COALESCE(owner_user_id,''), content_hash)`. |
| N2 | Backtest result cache keyed by config only (A's result returned to B). Client-supplied `backtestId` could overwrite another tenant's cached result. Engine never stamped `ownerUserId` on results, so ownership checks were vacuous. | Owner-namespaced cache key, server-side owner stamp, `backtestId`/`id`/owner fields stripped from the request, id-collision guard. |
| N3 | Portfolio-derived evidence (`ev-port-*`) used global ids and was stored as ownerless "public": one tenant's holdings readable by all and overwritten by the next caller. Conflict flagging wrote one tenant's values into another's `conflictDetails`. | Portfolio evidence is PRIVATE + owner-suffixed id; fingerprint/conflict detection are per access-domain. |
| N4 | `POST /api/strategies/custom` let any user overwrite another user's strategy or **shadow a built-in** (`getStrategy` prefers custom over built-in). Built-ins were identified as "ownerless". | Built-ins identified by the authoritative registry; re-register requires write ownership; built-ins read-only. |
| N5 | `POST /api/policies` upsert let B overwrite A's policy by supplying its `policyId`. | Existing id ⇒ `authorizePolicy(write)`. |
| N6 | `POST /api/scenarios\|counterfactuals/snapshots` used `body.userId \|\| principal` (forgeable). | Principal always wins. |
| N7 | `notebookService` sources/coverage/research read the shared evidence repository unscoped (other tenants' private document titles/content leaked; notebooks and snapshots were global per security). | Owner-scoped notebook ids, owner-stamped notebooks/snapshots, owner-filtered evidence reads. |
| N8 | `POST /api/alerts/evaluate` evaluated **every** tenant's rules and mutated their alert state. | Evaluation scoped to the caller's rules/watchlist. |
| N9 | `counterfactual` evaluate accepted any `decisionId` (read any decision); `getSensitivity/getTraceability` unscoped. | Unreadable decision ≡ missing. |
| N10 | `POST /api/sec/cache/clear` (clears shared evidence repo for all tenants) and `POST /api/events/record` (writes the shared event pool) open to anyone. | Operator-only (`ADMIN_USER_IDS`, fail-closed). |
| N11 | **The web UI never calls `/api/auth/login`** — it only worked through the shared `analyst-1` fallback. | Not fixed here (no new product features). See §8 compatibility. |
| N12 | Corrects Phase 38.1 §1: **12** PostgreSQL repositories (not 3) are in-memory `Map` caches (research priorities, cross-investment, scenario, counterfactual, memory, questions, gaps, plans, investigation audits, evidence collections/relationships/audits) and **no migration creates `users` / `user_sessions`**, which `PostgresUserRepository/SessionRepository` query. The PG adapter cannot authenticate anyone today. | Reported; out of scope (Phase 38.2B). |

---

## 2. Ownership model implemented

Single source of truth: `server/auth/accessPolicy.ts`.

* A record is **readable** iff `owner === principal` **or** (`no owner` **and** `visibility === 'SHARED'`).
* **Mutable** iff `owner === principal`. `SHARED` is never writable. An owner always wins over `SHARED`.
* **Ownerless + not SHARED ⇒ `LEGACY_UNOWNED`**: restricted for everyone (403 `LEGACY_UNOWNED` by id; absent from lists). Missing owner never implies public.
* Empty/absent principal ⇒ denied (service contract stays 403 per Phase 17/20; the HTTP gate answers 401 first).

| Resource | Class | Notes |
|---|---|---|
| Canonical securities / search | Shared reference | read-only, authenticated |
| Built-in strategies | Shared | identified by registry, read-only |
| Provider evidence (SEC EDGAR, market data, canonical metadata, Finmagine) | **SHARED**, classified explicitly at gather time by provenance | owner never required |
| Shared investment events | Shared (read), writes operator-only | |
| Portfolios/holdings, portfolio-derived evidence | User-owned (PRIVATE) | `GET /api/portfolio/metrics` serves the static sample portfolio (shared sample data); `POST` is stateless |
| Documents + derived evidence, notebooks, snapshots, decisions, custom strategies, backtests, alerts/rules/events/watchlist, monitors, policies, orchestrated alerts, research memory/questions/gaps/plans/evidence collections, scenario/counterfactual/cross-investment/discovery snapshots | User-owned (PRIVATE) | owner stamped server-side from the session; client-supplied `ownerUserId/userId/tenantId/visibility` always overwritten |

`SHARED` can only be set by system code (`DocumentIngestionService` with no owner, `evidenceService` for provider data). The HTTP upload path always forces `PRIVATE` + owner.

---

## 3. Authentication & route protection

* New `server/auth/routePolicy.ts`: deny-by-default `apiAuthGate` mounted once on `/api`, **after** `resolveUser` and rate limiting and **before body parsing and every handler** (anonymous 50 MB payloads are never parsed; malformed JSON anonymous ⇒ 401).
* `requireUserId(req)` replaces all 90 `|| 'analyst-1'` fallbacks and throws if no principal.
* Unknown `/api/*`, case-variants (`/API/DATA-STATUS`) and trailing-slash variants are all gated.
* Handler errors are mapped through `statusForError` (401/403 preserved instead of blanket 400/500).

**Intentionally public routes (exhaustive list — 5 of 227):**

| Route | Why |
|---|---|
| `POST /api/auth/register` | account bootstrap must precede a session |
| `POST /api/auth/login` | session bootstrap |
| `POST /api/auth/logout` | idempotent cookie/session clear; no data |
| `GET /api/auth/me` | session probe; anonymous ⇒ `{authenticated:false}` |
| `GET /api/health` | load-balancer liveness; static payload |

Everything else (222 routes) requires a session, including diagnostics that were previously anonymous (`/api/data-status`, `/api/config/status`, `/api/fyers/status`, `/api/finmagine/status`, `/api/pilot/providers/health`, `/api/persistence/status`) and the provider-quota-consuming market/SEC routes.

Authorization behaviour: 401 `AUTH_REQUIRED` anonymous; 403 for non-owner / legacy-unowned / shared-write; 404 for unknown id; unreadable decision ids are indistinguishable from missing.

`/api/sec/cache/clear` and `POST /api/events/record` additionally require the caller to be listed in `ADMIN_USER_IDS` (comma-separated; unset ⇒ nobody).

---

## 4. Tenant identity

* `/api/pilot/*`: tenant is **always** the principal. A supplied `tenantId` (query/body) that differs ⇒ `403 TENANT_MISMATCH` (including the old shared `analyst_pilot_01`); an equal value is tolerated. `PilotReadinessView` was updated to stop sending it.
* `/api/persistence/*`: every data route reads through tenant-scoped repository methods; `status` requires auth.
* Mandatory scope in repository contracts (throws `TenantScopeError` when missing), implemented for the development adapter **and** PostgreSQL: documents `getAllForOwner`, evidence `queryEvidenceForOwner`, snapshots `getBySecurityIdForOwner`, decisions `getHistoryForOwner`, backtests/notebooks `getAllForOwner`; in-memory evidence repository `queryEvidenceForOwner/getEvidenceAvailableAsOfForOwner`; service `getWatchlistForUser/getAlertRulesForUser/getAlertEventsForUser/getAllBacktestsForOwner/listNotebooksForOwner`. The unscoped `getAll()`s are annotated `@internal` and no HTTP route calls them.
* Unscoped `getAll()` audit (13 call sites outside `server/persistence/`, all reviewed):
  * `server.ts` `/api/persistence/{documents,backtests}` — **were exposing every tenant's private data** (fixed: scoped repository methods). `/api/events` returns shared reference data (authenticated read).
  * Engine reads — monitor evidence query, scenario decisions + evidence, command-center snapshots — **were mixing other tenants' private records into a user's derived output** (fixed via `engineScope`: owned-by-me or ownerless, never another tenant's). Discovery notebooks, command-center notebooks, cross-investment decisions/evidence already applied the same owner-or-ownerless filter.
  * Hydration (`documentRegistry`, `evidenceRepository`, `notebookService`, `backtestService`) and `authorizationService` — internal, never returned to a caller.

---

## 5. PostgreSQL ownership persistence

* **New** migration `003_ownership_and_visibility` (versions 1 and 2 untouched). Not executed anywhere.
  * `owner_user_id TEXT NULL`, `visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (PRIVATE|SHARED)` + owner index on the 10 owned tables.
  * `research_documents` content-hash uniqueness becomes per-owner.
  * `ownership_assignments` — append-only, auditable ownership decision ledger.
  * `legacy_unowned_records` — view listing every restricted record.
  * No UPDATE/DELETE/DROP TABLE/TRUNCATE; assigns no owners; existing IDs and content preserved; **no RLS**.
* Repository INSERTs and row mappers now persist/restore `owner_user_id`, `userId`, `visibility`.
* **Row-level security recommendation:** do **not** enable yet. RLS needs (a) a per-request `SET LOCAL app.user_id` on the same connection used for the query — today `PostgresClient.query()` uses the pool and `runTransaction` is only used by one repository, so the setting would not reliably apply; (b) all 12 cache-only repositories moved to real tables first; (c) users/sessions tables to exist. Enable RLS in 38.2B after those, with `FORCE ROW LEVEL SECURITY` and a non-owner application role.

---

## 6. Legacy ownerless records (preserved, restricted, **no migration performed**)

Inventory of `data/persistence/store.json` (state at session start). These records keep their IDs and content; they are inaccessible through the API until a decision is recorded.

| Collection | Total | Ownerless (restricted) | Suggested decision |
|---|---:|---:|---|
| evidence | 341 | **338** | 176 SEC EDGAR + 25 market + 16 Finmagine + 6 metadata ⇒ candidate **CLASSIFY_SHARED** (provider data; re-fetch also re-asserts it in memory). 35 RESEARCH_DOCUMENT + 43 PORTFOLIO ⇒ **owner decision required** (RETAIN_RESTRICTED or ASSIGN_OWNER). |
| snapshots | 175 | **174** | contain thesis/user queries ⇒ owner decision required |
| decisions | 109 | **86** | deterministic analytical output ⇒ candidate CLASSIFY_SHARED or RETAIN_RESTRICTED |
| backtests | 103 | **60** | owner decision required |
| documents | 91 | **18** (15 `system_user`, 1 `sec_edgar`, 1 `compliance_officer`, 1 unknown) | `sec_edgar` ⇒ candidate shared; others owner decision |
| notebooks | 1 | **1** | owner decision |
| alerts | 2 | **2** | owner decision |
| strategies | 46 | 0 | — |
| watchlists | 3 keys (`default`, `analyst_alpha_p28`, `val-user-filters`) | `default` is tenant-less | owner decision |
| portfolio | 38 keys | `default` is tenant-less | owner decision; non-`default` keys look tenant-keyed |
| events | 299 | n/a (shared reference) | none |

Plus: in-memory seed data (default watchlist items/alert rules, default monitors owned by the synthetic `analyst-1`) is ownerless / unreachable by any real `usr_*` principal.

**Controlled process (to be built in 38.2B, schema ready):** an operator-run, dry-run-first tool writes one `ownership_assignments` row per decision (`ASSIGN_OWNER` / `CLASSIFY_SHARED` / `RETAIN_RESTRICTED`, `decided_by`, `reason`) and applies it in the same transaction; `legacy_unowned_records` reports what remains. Nothing is auto-assigned.

---

## 7. Tests

New: `tests/phase38_2a_security.test.ts` (`npm run test:security`) — drives the **real Express app** over HTTP plus real services; introspects the live route table (227 routes); no live provider or database is contacted (keys and `DATABASE_URL` blanked, temp-dir adapter, pilot service stubbed only to observe the tenant argument).

Coverage map to the brief: (1) anonymous sweep of all 222 protected routes + variants; (2) cross-user read/update/delete across documents, watchlist, alert rules/events, strategies, backtests, decisions, snapshots, notebooks, monitors, policies, orchestrated alerts, questions, memory, gaps, plans, evidence collections, scenario/counterfactual/cross-investment snapshots; (3) forged `tenantId/userId/ownerUserId/visibility` in query and body; (4) legacy ownerless records; (5) pilot isolation; (6) persistence routes; (7) repositories/services without tenant scope; (8) SHARED vs private; (9) owner workflows; (10) PG SQL/mapping via recording fake client + migration static safety; (11) safety invariants.

Mutation check: removing the gate or making ownerless ⇒ SHARED fails the suite (13 and 30 failing checks respectively).

Existing-test compatibility changes (assertions unchanged; fixtures only):
* `phase8b`, `phase14`, `phase17`: ownerless test evidence/documents were implicitly public. They are now explicitly classified `visibility: 'SHARED'` (the brief forbids inferring public from a missing owner).
* `phase17`/`phase20` required service-level denials to stay **403** for an empty principal ⇒ preserved (HTTP layer answers 401).

### Verification (actual command results)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no diagnostics |
| `npm run build` (vite + esbuild server bundle) | exit 0 — `dist/index.html`, `dist/assets/index-*.js 1,153 kB`, `dist/server.cjs 1.5 MB` (chunk-size warning pre-existing) |
| `npm run test:security` (`tests/phase38_2a_security.test.ts`) | **300 PASSED / 0 FAILED** |
| Phase 37 certification (`tests/phase37_certification.test.ts`) | **54 PASSED / 0 FAILED** |
| Existing deterministic regression, 35 suites (phase5a … phase35_acceptance) | **all exit 0** — e.g. 5a 27/27, 5c 13/13, 6 43/43, 7a 54/54, 8b 55/55, 9 59/59, 10 50/50, 12a 65/65, 12b 74/74, 13 108/108, 14 97/97, 15 119/119, 16 41/41, 17 39/39, 18 65/65, 19 74/74, 20 32/32, 21 42/42, 23 11/11, 24 10/10, 25 12/12, 26.1 18/18, 27.1 18/18, 28.1 12/12, 28 12/12, 29 24/24, 30 61/61, 31 74/74, 32 72/72, 34 65/65, 35 71/71 (+ fyersProvider, 8a, 25_acceptance, 33 exit 0, no summary line) |
| `phase26` | 12/12 PASSED when run against the original `store.json`. In the full sequential run it failed once: `store.json` is shared mutable state and had been polluted by my own earlier runs made *before* engine scoping (a monitor's `latestDecisionId` pointed at a decision owned by another tenant, which the new engine scoping correctly refuses to use). Restoring the original `store.json` fixes it; this is test-state hermeticity, not a regression. |
| `phase36_acceptance` | 92 PASSED / **16 FAILED** — all 16 are `Scenario C` live-provider checks (Twelve Data/FYERS/SEC reachability, Gemini availability, AAPL live quote/bars flagged REAL). They require external network/credentials and are unrelated to authentication or ownership. **Not verified against a pre-change baseline** (a baseline checkout would have required copying `.env`, which I did not do). |

`data/persistence/store.json` was backed up before the first test run and restored byte-for-byte afterwards (`cmp` verified); the new suite uses a temp-dir adapter and never touches it. Other pre-existing uncommitted changes (`reconciliation_results.json`, `scripts/reconcile_all_tests.mjs`, provider/circuit-breaker files, `tests/phase37_certification.test.ts`) were not modified by me.

### Verified vs. NOT verified

**Verified (deterministic, in-process, real routes/services):** authentication gate and public-route allow-list; cross-user/forged-identity/legacy/shared behaviour for every resource family listed above; pilot tenant derivation; persistence-route scoping; repository tenant-scope enforcement on the development adapter; SQL text, parameters and row-mapping of the PostgreSQL repositories and the static content of migration 003 (against a recording fake client).

**NOT verified (requires a live database, deliberately not provisioned):** that migration 003 applies cleanly on PostgreSQL; actual SQL execution/constraint behaviour (CHECKs, the `(COALESCE(owner_user_id,''), content_hash)` unique index, the view); query plans/performance of the new owner indexes; PG transaction behaviour; behaviour with the 12 cache-only repositories; session handling through `PostgresSessionRepository`. Also not exercised: routes whose handlers call live providers (evidence gathering, decision evaluation, backtest execution) — their ownership logic is covered at the service level, not over HTTP.

---

## 8. Compatibility impacts

1. **Web UI has no login flow.** It never calls `/api/auth/login` or `/api/auth/register`; it worked only via the shared `analyst-1` fallback. With the gate in place every data view returns 401 until a session exists. Follow-up: add a login/registration screen (sessions already work via HttpOnly cookie, `Authorization: Bearer`, or `X-Session-Id`). No anonymous/dev bypass was added, deliberately.
2. `PilotReadinessView` no longer sends `tenantId`. `PortfolioScenarioView` / `CounterfactualDecisionView` still send `userId:'analyst-1'` in snapshot bodies; the server ignores it (owner = principal).
3. Previously ownerless data (default watchlist, default alert rules, legacy snapshots/backtests/documents/…) is no longer visible to anyone; new users start empty. Existing owned data is unaffected.
4. Evidence/documents: a missing owner no longer means public. Provider evidence is SHARED automatically at gather time; legacy persisted provider evidence is re-asserted SHARED in memory when a fresh fetch returns identical content.
5. `GET /api/documents/stats`, notebooks, snapshots, backtests, decisions history now describe only the caller's own data.
6. Decision assessments requested through the API are owner-scoped (new `decisionId` suffix `-u<hash8>`); system/internal evaluation keeps the original deterministic id.
7. Newly forbidden for non-operators: `POST /api/sec/cache/clear`, `POST /api/events/record` (set `ADMIN_USER_IDS`).
8. Pilot service default `tenantId='analyst_pilot_01'` remains for direct (non-HTTP) callers and Phase 36/37 harnesses; no route can reach it.
9. Pre-existing route-order issue (not changed): `/api/decisions/delta` is shadowed by `/api/decisions/:securityId`; the `/api/v1/decision/delta` alias works.

---

## 9. Remaining access-control risks

| # | Risk | Severity | Plan |
|---|------|----------|------|
| R1 | Internal engines (monitors, memory, discovery, command center, scenarios, events) still read the shared decision/snapshot/evidence stores directly. They now exclude **other tenants'** records (`engineScope`) but still incorporate **ownerless legacy** records into derived output. Several have no tenant filter on events/portfolio (`default`). | Medium | Move engines to the scoped repository methods once legacy records have owner decisions (38.2B). |
| R2 | Scope is enforced by convention + new scoped methods; unscoped `getAll()`/`getBySecurityId()` still exist (annotated `@internal`). Nothing prevents a future caller from using them. | Medium | Remove/rename unscoped methods after engines migrate; lint rule. |
| R3 | PostgreSQL: 12 repositories are in-memory; no `users`/`user_sessions` migration; ownership for those entities (they carry `userId/tenantId` in memory) is not persisted; `PostgresPortfolioRepository`/watchlist use the tenant id as the row key. | **High for PG activation** | 38.2B (schema + SQL repositories) before any DB provisioning. |
| R4 | No RLS (by instruction). A missed `WHERE owner_user_id` in future SQL is unprotected. | Medium | RLS after connection-scoped tenant context exists. |
| R5 | Shared event pool: any operator can write; events are not user-scoped. Pool integrity depends on `ADMIN_USER_IDS`. | Low | Add provenance/audit on writes. |
| R6 | `GET /api/portfolio/metrics` serves the static sample portfolio to everyone (shared sample data). A real per-user portfolio store with an API does not yet exist; persistent portfolio repository is keyed by id with no tenant column enforcement. | Low (no private data today) | Define the per-user portfolio API/ownership in 38.2B. |
| R7 | Research-plan/task requests accept evidence/question ids without verifying each referenced id belongs to the caller (the parent plan is owner-checked; content of referenced foreign ids is not returned). | Low | Validate referenced ids in the investigation services. |
| R8 | Phase 36 live-provider scenarios (16 checks) fail in this environment; not auth-related (see §7). | n/a | environment/credentials |
| R9 | CSRF protection remains production-only and origin-heuristic; session fixation/rotation unchanged. Out of scope. | Low | separate hardening |

---

## 10. Follow-ups required before PostgreSQL work (38.2B)

1. Build a login/registration UI (or deliver a documented API-client path) — the UI is currently unusable without it.
2. Owner/visibility decisions for the legacy inventory in §6, via the `ownership_assignments` process.
3. Replace the 12 cache-only PG repositories with SQL; add `users`/`user_sessions` tables; add ownership columns for those entities.
4. Migrate engines to scoped reads; retire unscoped repository methods.
5. Per-request tenant context on the PG connection, then RLS.
6. Run the migration against a throw-away database only after (1)–(3), with the dry-run tooling.
