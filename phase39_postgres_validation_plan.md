# Phase 39 — PostgreSQL Integration Readiness & Validation Plan
Status: READ-ONLY PLANNING — No database action taken; no source/test modifications; no .env / .json changes.

---

## 1. Evidence From Prior Audits (Verified — Not Repeated)

From Phase 38.1 (phase38_1_report.md), Phase 38.2E (phase38_2e_report.md), Phase 38.3 (phase38_3_report.md):
- TypeScript (npx tsc --noEmit): PASS.
- Production build (npm run build): PASS.
- Phase 37 cert: 54/54 PASSED.
- Phase 38.2E evidence consistency: 76/76 PASSED.
- Security/invariant audit: `isAnalyticalOnly: true`; `executionProhibited: true`; `.env` unchanged (`f5279c18...`); `store.json` preserved (`3460d6b81f7e7e740f75efc9c27ed6d7`).
- Provider live verification: Twelve Data REAL (direct API, 200 OK); FYERS REAL (after auth format correction `app_id:token`); TrueData embedded adapter verified.
- Persistence architecture inspected: adapter selection (PersistenceManager); SQL-backed repositories (`postgresPayloadRepositories.ts`); schema (`migrations/schema.ts`); transactions (`PostgresClient.runTransaction()`); database config (`databaseConfig.ts`).
- No real PostgreSQL connection attempted (`DATABASE_URL` NOT SET); no migration executed.

---

## 2. Current Repository State (Read-Only Inspection)

Files inspected (current, no modifications):
- `server/persistence/persistenceManager.ts`: adapter selection; production fail-fast (`NODE_ENV === 'production'` throws `PersistenceUnavailableError`); graceful non-production fallback (`DISK_DEGRADED_FALLBACK`).
- `server/persistence/postgres/postgresPayloadRepositories.ts`: SQL-backed evidence collection, relationship, audit repositories (`PayloadTable` using parameterized SQL).
- `server/persistence/postgres/postgresAdapter.ts`: repository mapping to SQL implementations; `MigrationRunner` for versioned migrations.
- `server/persistence/postgres/postgresClient.ts`: `Pool` connection; `runTransaction()` with `AsyncLocalStorage`; `healthCheck()`; `close()`.
- `migrations/schema.ts`: versioned, idempotent (`CREATE TABLE IF NOT EXISTS`), no destructive operations.
- `server/auth/authorizationService.ts`: authentication flow (related but not modified in this audit).

No changes to any of the above files made in this audit.

---

## 3. Validation Matrix (Proposed — Not Executed; Requires Approval)

### 3.1 Migration & Schema
- Setup: Isolated test PostgreSQL with temporary `DATABASE_URL`; `.env` production untouched; `NODE_ENV=test`.
- Action: Initialize `PersistenceManager`; observe adapter selection (`POSTGRES`).
- Expected: `MigrationRunner.runMigrations()` applies version 1 without error; `schema_migrations` records version; all entity tables present.
- Evidence: `SELECT version FROM schema_migrations` = 1.
- Cleanup: Drop test database; restore `.env`; preserve `store.json`.

### 3.2 Repository CRUD
- Setup: Test DB; seed with minimal test data.
- Action — Security: `get` / `getByTicker` / `getAll` / `save` / `count` via SQL-backed `PostgresSecurityRepository`.
- Expected: Consistent results; `ON CONFLICT` updates correctly.
- Evidence: Query results match saved entities.
- Cleanup: Delete test security records.

### 3.3 Evidence Persistence
- Setup: Test evidence item with `evidenceId`.
- Action: `addEvidence()` → `getEvidence()`.
- Expected: Identical fields preserved (`epistemicStatus`, `isSimulated`, etc.).
- Evidence: Field comparison.
- Cleanup: Confirm no destructive updates (evidence immutability preserved by contract).

### 3.4 Duplicate Audit / Concurrent Writes
- Setup: Test audit record (`auditId`).
- Action: Call `PostgresEvidenceAuditRepository.save()` twice with same `auditId`.
- Expected: Second call throws (`append-only enforced`); no duplicate records.
- Evidence: Exception message; DB count confirms single record.
- Cleanup: Remove test audit (if delete supported) or confirm immutability (leave).

### 3.5 Persistence Across Restart
- Setup: Save evidence; restart server process with `DATABASE_URL`.
- Action: `getEvidence()` after reconnect.
- Expected: Adapter connects (`isConnected()` true); record retrievable; `store.json` unchanged (not overwritten).
- Evidence: `PersistenceManager.getStatus()` reports `POSTGRES`; evidence retrieved.
- Cleanup: Unset `DATABASE_URL`; restore disk adapter.

### 3.6 Transaction Rollback / Integrity
- Setup: Test DB; `PostgresClient.runTransaction()`.
- Action: Begin transaction; insert valid evidence; throw error inside work; verify rollback (record not present); commit valid insert.
- Expected: Rolled back insert = 0 rows; committed insert = 1 row.
- Evidence: Direct SQL query against `evidence_items` after rollback.
- Note: Real rollback verification requires live PostgreSQL connection (separate approval).

### 3.7 Multi-Tenant Isolation
- Setup: Two test tenants (`tenantA`, `tenantB`); create evidence for A.
- Action: Retrieve via repository with `tenantId` filter for A (should succeed); retrieve for B (should fail / empty); retrieve unscoped `getAll()` (must confirm service-layer filtering prevents leakage — no SQL-level RLS configured).
- Expected: Only A records returned; no B data in A-scoped query.
- Evidence: Service-layer `evidenceCollectionService.getEvidence()` returns A's record; repository `getAll()` unfiltered should not expose B if service layer is enforced; document that SQL-level isolation relies on parameterized `owner_user_id = $1` predicates.
- Cleanup: Remove test evidence.

### 3.8 Historical Evidence / Point-in-Time
- Setup: Insert evidence with `publishedAt = 2026-01-01`; insert second with `publishedAt = 2026-06-01`.
- Action: `getHistoricalEvidence(id, '2026-03-01')`; check result.
- Expected: Returns first evidence (published before target); excludes second (published after target).
- Evidence: `publishedAt` <= '2026-03-01'; second item not returned.
- Cleanup: Remove test evidence.

### 3.9 Production Startup (Available DB)
- Setup: Configure `DATABASE_URL` to isolated test DB; `NODE_ENV=production`.
- Action: Initialize `PersistenceManager`.
- Expected: `POSTGRES`; `status: 'CONNECTED'`; `degraded: false`; `authoritative: true`.
- Evidence: `PersistenceManager.getStatus()` output.
- Cleanup: Unset `DATABASE_URL`; restore `NODE_ENV`.

### 3.10 Non-Production Fallback (Unavailable DB)
- Setup: Point `DATABASE_URL` to unreachable host (simulated); `NODE_ENV=development`; `PERSISTENCE_STRICT` not set.
- Action: Initialize `PersistenceManager`.
- Expected: `DISK_DEGRADED_FALLBACK`; `degraded: true`; degraded marker file written; `authoritative: false`; no crash.
- Evidence: `getStatus()`; `DEGRADED_MARKER_FILE` presence.
- Cleanup: Restore valid `DATABASE_URL` (if needed); confirm adapter reconnects.

---
## Safety / Isolation / Credential Review

- Credential isolation: `DATABASE_URL` must never be committed to `.env`; must never appear in logs or reports; test instance must be isolated (separate host/port/db from production).
- Migration review (before any execution): Confirmed `migrations/schema.ts` uses `CREATE TABLE IF NOT EXISTS`; no destructive operations.
- Backup/recovery (before any adapter switch): Manual `cp data/persistence/store.json data/backup/store_pre_postgres_YYYY-MM-DD.json`. No automated backup exists.
- `.env`: Unchanged (`f5279c18...`). `.gitignore`: unchanged. `store.json`: preserved.
- No feature work; no source/test modifications; no provider changes.

---
## Proposed Commands (NOT EXECUTED — Require Separate Approval)

```bash
# 1. Read-only verification (done — no DB needed)
grep -n 'PayloadTable' server/persistence/postgres/postgresPayloadRepositories.ts

# 2. Backup before any adapter change (only if future DB validation approved; do not run without approval)
cp data/persistence/store.json data/backup/store_pre_postgres_$(date +%Y%m%d_%H%M%S).json

# 3. Configure temporary test DATABASE_URL (separate env/file; never production .env)
# export DATABASE_URL=postgresql://test_user:test_pass@test-host:5432/test_db?sslmode=prefer

# 4. Initialize adapter and observe adapter selection (APPROVED ONLY — requires DB)
# npx tsx --env-file=.env -c 'import {PersistenceManager} from "./server/persistence/persistenceManager"; PersistenceManager.getInstance().initialize().then(s => console.log(s.getStatus()))'

# 5. Verify repository SQL with test DB (APPROVED ONLY — requires DB)
# npx tsx tests/phase38_2b_persistence.test.ts  # if exists and uses test DB

# 6. Confirm protected files untouched (APPROVED ONLY — requires DB)
# md5sum .env data/persistence/store.json
```

---
## Approval Gate

- [ ] Approve separate database provisioning (isolated test instance).
- [ ] Approve temporary `DATABASE_URL` for test (separate from production `.env`).
- [ ] Approve execution of `MigrationRunner` against test DB.
- [ ] Approve execution of focused repository verification tests.
- [ ] Confirm `.env`, `store.json`, source code protected (verify hashes).
- [ ] Confirm no production database contacted.

---
## Final Readiness Verdict

Status: READY WITH DOCUMENTED LIMITATIONS — Plan complete; all verification requires separate approval for database provisioning.
No database created. No `.env` changed. No source/test/feature modifications. No secret exposure.
Next step: Await approval for test database provisioning (if required by project) before any execution.
