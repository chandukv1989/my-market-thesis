=== STAGE 1 PLAN ===
=== Phase 41 Integrity Validation Plan ===
Status: READ-ONLY PLAN — Stage 2 EXECUTION ONLY upon confirmed identity (verified above)
Target DB: investment_intelligence_test (localhost:5432) — ISOLATED
Role: test_only (min privileges)
No production DB (postgres = system; pathfinder = existing app DB) at risk.
Tests to execute (Stage 2):
A. Transaction rollback: insert evidence; inject error; verify rolled back; confirm with fresh query.
C. Historical PIT: insert evidence with publishedAt=2026-01-01; query at 2026-03-01; verify result; insert second at 2026-06-01; verify excluded.
D. Cleanup: delete only test-isolated records created in this phase (evidence test IDs only).
=== End ===
