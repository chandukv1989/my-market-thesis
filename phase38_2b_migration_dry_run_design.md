# Phase 38.2B — Migration Dry-Run Design & Legacy-Data Classification Plan

**Design only.** Nothing in this document has been executed. No database was provisioned or contacted, no migration (001–004) has been run, `store.json` was not read into any tool, rewritten or imported, and no record was assigned an owner or classified shared.

---

## A. Preconditions (all must hold before any dry run)

1. A throw-away PostgreSQL instance that is **not** the production database, created by the operator (not by this application).
2. `DATABASE_URL` pointing at it, `NODE_ENV=production` or `PERSISTENCE_STRICT=true` (so the application refuses to fall back to disk).
3. Explicit written approval of the target database and of the classification decisions in §C.
4. A verified byte-identical copy of `data/persistence/store.json` (SHA-256 recorded) and a restoration check.

## B. Dry-run phases (read-only → throw-away DB → verification)

| # | Phase | Writes? | Output |
|---|-------|---------|--------|
| 0 | **Freeze & snapshot**: stop writers, copy `store.json`, record SHA-256 | none | `source.sha256` |
| 1 | **Inventory (offline)**: parse the copy (never the live file) into per-collection counts, id sets, owner presence, visibility, timestamps | none | inventory JSON |
| 2 | **Static validation (offline)**: every record against the target column set — required NOT NULL columns (`evidence_items.title/content/source_type/provider/epistemic_status`, `research_snapshots.notebook_id/security_id/as_of_date`, `investment_decisions.composite_score/…`, `backtests.strategy_id/configuration/metrics`), id uniqueness, `contentHash` uniqueness **per owner**, date parseability, `visibility ∈ {PRIVATE,SHARED}` | none | violations report |
| 3 | **Legacy classification (offline)**: assign each ownerless record a *proposed* decision (§C); nothing applied | none | `classification_proposal.csv` |
| 4 | **Schema apply on throw-away DB**: run migrations 001→004 in a transaction per migration | throw-away DB only | applied versions |
| 5 | **Load with ownership preserved**: one transaction per collection via `PostgresPersistenceAdapter.runTransaction`; `INSERT … ON CONFLICT DO NOTHING`; original ids and original timestamps (`created_at`, `uploaded_at`, `retrieved_at`, `generated_at`, `published_at`, payload `availableAt`) bound explicitly — never `NOW()` | throw-away DB only | row counts |
| 6 | **Reconcile**: source vs destination counts per collection; checksum of `payload`/canonical JSON per row; owner/visibility histograms equal; ownerless count == `legacy_unowned_records` count | none | reconciliation report |
| 7 | **Behavioural verification**: run the two-user isolation, PIT and immutability suites against the loaded database (real PostgreSQL integration tests — *not yet written*) | none | test report |
| 8 | **Decision** | — | go/no-go |

Abort and discard the throw-away DB on any non-zero violation in phases 2, 5 or 6. The live `store.json` is never modified by any phase.

## C. Legacy ownerless records — classification plan

Inventory from the session-start copy of `store.json` (counts only; the file was not changed):

| Collection | Total | Ownerless | Proposed decision (needs explicit approval) | Rationale |
|---|---:|---:|---|---|
| evidence — provider (`SEC_EDGAR` 176, `MARKET_DATA` 25, `FINMAGINE` 16, `CANONICAL_METADATA` 6, `SEC_FILING` 36) | — | 259 | `CLASSIFY_SHARED` (rule R1) | public-source provenance; content re-derivable |
| evidence — `RESEARCH_DOCUMENT` | — | 35 | `RETAIN_RESTRICTED` until uploader identified | originates from user uploads |
| evidence — `PORTFOLIO` | — | 43 | `RETAIN_RESTRICTED` | derived from some tenant's holdings |
| snapshots | 175 | 174 | `RETAIN_RESTRICTED` | thesis/user query content |
| decisions | 109 | 86 | `CLASSIFY_SHARED` (rule R2) if recomputation-verified, else `RETAIN_RESTRICTED` | deterministic system output |
| backtests | 103 | 60 | `RETAIN_RESTRICTED` | user-run |
| documents | 91 | 18 | `sec_edgar` (1) `CLASSIFY_SHARED`; remaining 17 `RETAIN_RESTRICTED` | uploader metadata unreliable |
| notebooks / alerts | 1 / 2 | 1 / 2 | `RETAIN_RESTRICTED` | |
| watchlists / portfolio `default` keys | 1 / 1 | tenant-less | `RETAIN_RESTRICTED` | |
| events | 299 | n/a | shared reference domain | no owner concept |

**Rules (proposed, not applied):**
* **R1 – provider evidence**: ownerless item whose `sourceType ∈ {SEC_EDGAR, OFFICIAL_FILINGS, MARKET_DATA, CANONICAL_METADATA, FINMAGINE}` and whose fingerprint matches a fresh provider fetch → `CLASSIFY_SHARED`.
* **R2 – system decision**: ownerless decision whose recomputation from SHARED inputs at its own `asOfDate` yields identical `compositeScore`/`overallAssessment` → `CLASSIFY_SHARED`.
* **R3 – everything else**: `RETAIN_RESTRICTED`; moves to `ASSIGN_OWNER` only with an approved mapping legacy-id → user.

**Mechanism (already in schema, not executed):** every applied decision is one append-only row in `ownership_assignments` (`record_table`, `record_id`, `previous_owner_user_id`, `new_owner_user_id`, `new_visibility`, `decision`, `decided_by`, `reason`, `decided_at`) written in the same transaction as the `UPDATE … SET owner_user_id/visibility`. `legacy_unowned_records` (extended in migration 004 to every durable table) must list exactly the `RETAIN_RESTRICTED` set afterwards. Records, ids and history are never deleted or re-keyed.

## D. Schema review findings (static; not database-verified)

| Area | Finding | Status |
|---|---|---|
| Missing tables | `users`, `user_sessions`, `monitor_notes` and the 12 tables behind the former in-memory repositories had no DDL | **fixed** in migration 004 |
| Lossy mappers | evidence/notebook/snapshot/decision/strategy/backtest/alert/document mappers dropped fields (`availableAt`, `sourceReference`, `metadata`, `conflict*`, strategy `prompt/status/…`) or fabricated constants | **fixed**: full object kept in `payload JSONB`, columns authoritative for ownership/visibility |
| Original timestamps | notebook/document/evidence `created_at` defaulted to `NOW()` on insert, losing the source value | **fixed**: bound explicitly |
| Document dedup | global `UNIQUE(content_hash)` | **fixed** in 003 (per-owner) |
| Strategy mapper | read 4 columns that do not exist (`prompt`, `status`, `target_universe`, `rebalance_frequency`) | **fixed** (static check now enforces row-field ⊆ columns) |
| PIT: null publication date | PG and development adapter *included* evidence with NULL `published_at` in any `asOfDate` query; the in-memory repository excluded it | **fixed**: excluded everywhere when an `asOfDate` is supplied (unknown availability is never assumed available) |
| PIT: date-only boundary | `YYYY-MM-DD` was end-of-day in PG/dev queries but start-of-day in the in-memory repository and the dev `getHistoricalEvidence` | **fixed**: one shared cutoff helper (date-only ⇒ end of that UTC day, inclusive) |
| Foreign keys | `monitor_notes.monitor_id`, `orchestrated_alerts.monitor_id`, `monitor_reviews.monitor_id`, snapshot/notebook links have **no FKs** | **deliberately not added**: legacy data contains dangling references and immutable history must not be cascade-deleted. Revisit after Phase 2 validation produces a zero-violation report; add as `NOT VALID` first. `user_sessions.user_id → users` FK *is* present (new table) |
| Nullability | all INSERT column lists include every NOT NULL-without-default column (static check) | verified statically |
| Indexes | owner indexes on all owned tables; `(security_id, as_of_date)` and `ref_key` on payload tables | present; **not performance-tested** |
| `payload` NOT NULL on payload tables, nullable on the 8 altered tables | existing rows have `payload = NULL` until loaded; mappers fall back to the column mapping | by design (additive) |
| Row-level security | not enabled | still requires per-request tenant context on the connection (the transaction fix in this phase is a prerequisite, not sufficient) |

## E. What is explicitly NOT done

* No migration executed; no table created anywhere.
* No data loaded, converted, assigned or classified.
* No PostgreSQL integration test exists or was run. All PostgreSQL behaviour is verified only against a recording/simulated client.
