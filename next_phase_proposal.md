# Phase 38.3 — Revised Proposal (Ready for Approval)
Status: READY FOR APPROVAL (BLOCKER resolved by existing payload file; revised scope excludes DB action)
No feature phase started. No database created. No `.env` changed. No source/test modifications for feature work.

---

## Evidence Update (From Phase 38.1 Audit + Direct Code Inspection)

BLOCKER identified in 38.1 (`PostgresEvidenceCollectionRepository`, `PostgresEvidenceRelationshipRepository`, `PostgresEvidenceAuditRepository` using `Map` caches): RESOLVED by existing `postgresPayloadRepositories.ts`. Confirmed by direct file inspection:

- `PostgresEvidenceCollectionRepository`: `this.t = new PayloadTable(client, 'evidence_collections', ...)` — uses `t.get()`, `t.select('owner_user_id = $1', ...)`, `t.insertOnce()`, `t.updateExisting()`.
- `PostgresEvidenceRelationshipRepository`: `PayloadTable('evidence_relationships', ...)` — same SQL-backed pattern.
- `PostgresEvidenceAuditRepository`: `PayloadTable('evidence_audits', ...)` — append-only (`insertOnce`) with SQL-backed `get()` and `getAll()`.

Therefore, the proposed repository rewrites are NO LONGER REQUIRED. The remaining work from 38.1 is:
1. Production fail-fast fallback in `PersistenceManager`.
2. Multi-tenant SQL isolation contract verification (deterministic test/code inspection of `PayloadTable.select()` predicates including `owner_user_id = $1`).
3. Historical immutability / point-in-time contract verification (`PayloadTable.select()` time-range filtering; `getHistoricalEvidence()` behavior).
4. Transaction rollback contract documentation (DB-level rollback unverified without real DB, but wrapper exists and must be preserved).

---

## Revised Scope (Narrow, Code-Level Only)

Only these actions — NO database creation, NO Docker, NO `.env` change, NO `.json` migration:

A. Fail-Fast: Modify `PersistenceManager.initialize()` so `NODE_ENV === 'production'` throws fatal error if PostgreSQL initialization fails (instead of silent disk fallback). Preserve graceful disk fallback for non-production.
B. Multi-Tenant Isolation Verification: Confirm by inspection/code that `PayloadTable.select()` uses `owner_user_id = $1` predicates; add focused deterministic test (no DB) verifying service-level filter consistency with repository SQL predicates.
C. Historical Immutability / PIT Verification: Confirm by inspection/code that `PayloadTable.select()` applies `asOfDate` filtering and that `getHistoricalEvidence()` respects `published_at`. Add focused deterministic test.
D. Transaction Contract Documentation: Confirm `PostgresClient.runTransaction()` wrapper behavior; document rollback/integrity requirements. No DB-level rollback test required in this phase (requires separate DB provisioning approval).

---

## Restrictions (Same as Before)

- No feature additions; analytical-only preserved; no trading; no `.env` change; no `.json` data modification; no secret exposure.
- No database provisioning; no Docker; no migration execution.
- Preserve provenance contracts (`REAL` source identity preserved with `UNAVAILABLE` status; `SIMULATED` only with simulated values).
- Preserve `isAnalyticalOnly: true`, `executionProhibited: true`, USD/INR isolation.

---

## Verification (Safe — No DB Action)

Commands:
- `npx tsc --noEmit`
- `npm run build`
- `npx tsx --env-file=.env tests/phase37_certification.test.ts`
- `npx tsx --env-file=.env tests/phase38_2e_evidence_consistency.test.ts`
- `grep -n 'NODE_ENV' server/persistence/persistenceManager.ts` (inspection only)
- `grep -n 'owner_user_id' server/persistence/postgres/postgresPayloadRepositories.ts` (inspection only)

Evidence categories separated:
- Deterministic tests: PASS (no DB dependency).
- Live provider: Twelve Data REAL verified (independent direct API); FYERS REAL verified (after auth format correction `app_id:token`); PostgreSQL UNVERIFIED.
- Security/provenance: intact (`.env` unchanged; no leaks).
- Code-level BLOCKER: RESOLVED by payload file inspection.

---

## Final Verdict: READY FOR APPROVAL (Revised — No Repository Rewrite Needed; Focus on Fail-Fast + Contract Verification Only)

The previous BLOCKER (repository SQL rewrites) is resolved by the existing payload file. The next defensible scope is narrow: fail-fast code change + deterministic isolation/integrity verification (no DB). Once these are verified, a separate approval is needed for database provisioning / real DB validation.
