/**
 * Phase 16: Versioned Database Schema Migrations
 * 
 * Rules:
 * - Forward only
 * - Deterministic & idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
 * - Explicit timestamp preservation
 * - Never drops tables or loses data
 */

export interface Migration {
  version: number;
  name: string;
  up: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_persistence_schema',
    up: [
      // 1. Schema Migrations tracker
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,

      // 2. Canonical Securities
      `CREATE TABLE IF NOT EXISTS canonical_securities (
        id TEXT PRIMARY KEY,
        ticker TEXT NOT NULL,
        company_name TEXT NOT NULL,
        market TEXT NOT NULL,
        exchange TEXT NOT NULL,
        country TEXT NOT NULL,
        currency TEXT NOT NULL,
        isin TEXT,
        sector TEXT,
        industry TEXT,
        aliases JSONB DEFAULT '[]'::jsonb,
        provider_symbol_mappings JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_canonical_securities_ticker ON canonical_securities(ticker);`,

      // 3. Research Documents (Phase 14)
      `CREATE TABLE IF NOT EXISTS research_documents (
        document_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        document_type TEXT NOT NULL,
        content_hash TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        author TEXT,
        published_at TIMESTAMPTZ,
        available_from TIMESTAMPTZ,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processing_status TEXT NOT NULL,
        security_associations JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        extraction_metadata JSONB DEFAULT '{}'::jsonb,
        page_row_provenance JSONB DEFAULT '[]'::jsonb,
        storage_reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_research_documents_hash ON research_documents(content_hash);`,

      // 4. Evidence Items (Phase 8A, immutable/versioned)
      `CREATE TABLE IF NOT EXISTS evidence_items (
        evidence_id TEXT PRIMARY KEY,
        security_id TEXT,
        source_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        document_id TEXT,
        document_type TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        structured_value JSONB,
        unit TEXT,
        currency TEXT,
        published_at TIMESTAMPTZ,
        filing_date TIMESTAMPTZ,
        period_start TIMESTAMPTZ,
        period_end TIMESTAMPTZ,
        retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        epistemic_status TEXT NOT NULL,
        is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
        source_reference JSONB,
        metadata JSONB DEFAULT '{}'::jsonb,
        conflict_info JSONB,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_items_sec_pub ON evidence_items(security_id, published_at);`,

      // 5. Research Notebooks (Phase 13)
      `CREATE TABLE IF NOT EXISTS research_notebooks (
        notebook_id TEXT PRIMARY KEY,
        security_id TEXT NOT NULL,
        query_context TEXT,
        source_registry JSONB DEFAULT '[]'::jsonb,
        evidence_references JSONB DEFAULT '[]'::jsonb,
        claims JSONB DEFAULT '[]'::jsonb,
        thesis JSONB,
        bull_case JSONB DEFAULT '[]'::jsonb,
        bear_case JSONB DEFAULT '[]'::jsonb,
        catalysts JSONB DEFAULT '[]'::jsonb,
        risks JSONB DEFAULT '[]'::jsonb,
        evidence_gaps JSONB DEFAULT '[]'::jsonb,
        contradictions JSONB DEFAULT '[]'::jsonb,
        invalidation_conditions JSONB DEFAULT '[]'::jsonb,
        quantitative_context JSONB,
        portfolio_context JSONB,
        snapshot_references JSONB DEFAULT '[]'::jsonb,
        framework_version TEXT NOT NULL DEFAULT '1.0.0',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_research_notebooks_sec ON research_notebooks(security_id);`,

      // 6. Research Snapshots (Phase 13/14, Immutable Chain)
      `CREATE TABLE IF NOT EXISTS research_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL,
        security_id TEXT NOT NULL,
        as_of_date TEXT NOT NULL,
        previous_snapshot_id TEXT,
        framework_version TEXT NOT NULL DEFAULT '1.0.0',
        evidence_ids JSONB DEFAULT '[]'::jsonb,
        claim_ids JSONB DEFAULT '[]'::jsonb,
        thesis TEXT,
        bull_case JSONB DEFAULT '[]'::jsonb,
        bear_case JSONB DEFAULT '[]'::jsonb,
        catalysts JSONB DEFAULT '[]'::jsonb,
        risks JSONB DEFAULT '[]'::jsonb,
        what_changed JSONB,
        contradictions JSONB DEFAULT '[]'::jsonb,
        evidence_gaps JSONB DEFAULT '[]'::jsonb,
        invalidation_conditions JSONB DEFAULT '[]'::jsonb,
        quantitative_context JSONB,
        portfolio_context JSONB,
        source_coverage JSONB,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_research_snapshots_sec_date ON research_snapshots(security_id, as_of_date);`,

      // 7. Investment Decisions (Phase 15, Immutable Artifacts)
      `CREATE TABLE IF NOT EXISTS investment_decisions (
        decision_id TEXT PRIMARY KEY,
        security_id TEXT NOT NULL,
        as_of_date TEXT NOT NULL,
        composite_score DOUBLE PRECISION NOT NULL,
        overall_assessment TEXT NOT NULL,
        conviction TEXT NOT NULL,
        dimension_assessments JSONB NOT NULL,
        invalidation_conditions JSONB DEFAULT '[]'::jsonb,
        portfolio_context JSONB,
        quant_context JSONB,
        backtest_context JSONB,
        explanation JSONB,
        weights_config JSONB,
        score_inputs JSONB,
        data_quality JSONB,
        limitations JSONB,
        is_analytical_only BOOLEAN NOT NULL DEFAULT TRUE,
        execution_prohibited BOOLEAN NOT NULL DEFAULT TRUE,
        framework_version TEXT NOT NULL DEFAULT '1.0.0',
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_investment_decisions_sec_date ON investment_decisions(security_id, as_of_date);`,

      // 8. Strategies (Phase 11)
      `CREATE TABLE IF NOT EXISTS strategies (
        strategy_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        rules JSONB DEFAULT '[]'::jsonb,
        indicators JSONB DEFAULT '[]'::jsonb,
        position_sizing JSONB DEFAULT '{}'::jsonb,
        risk_constraints JSONB DEFAULT '[]'::jsonb,
        portfolio_construction JSONB DEFAULT '{}'::jsonb,
        parameters JSONB DEFAULT '{}'::jsonb,
        version TEXT NOT NULL DEFAULT '1.0.0',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,

      // 9. Backtest Results (Phase 12A/12B, Immutable Historical Artifacts)
      `CREATE TABLE IF NOT EXISTS backtests (
        backtest_id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        strategy_version TEXT NOT NULL DEFAULT '1.0.0',
        configuration JSONB NOT NULL,
        metrics JSONB NOT NULL,
        equity_curve JSONB DEFAULT '[]'::jsonb,
        trades JSONB DEFAULT '[]'::jsonb,
        accounting JSONB,
        benchmark JSONB,
        status TEXT NOT NULL,
        data_fingerprint TEXT,
        is_analytical_only BOOLEAN NOT NULL DEFAULT TRUE,
        execution_prohibited BOOLEAN NOT NULL DEFAULT TRUE,
        framework_version TEXT NOT NULL DEFAULT '1.0.0',
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_backtests_strategy ON backtests(strategy_id);`,

      // 10. Watchlists (Phase 10)
      `CREATE TABLE IF NOT EXISTS watchlists (
        watchlist_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        security_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,

      // 11. Alerts (Phase 10)
      `CREATE TABLE IF NOT EXISTS alerts (
        alert_id TEXT PRIMARY KEY,
        security_id TEXT,
        ticker TEXT,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,

      // 12. Portfolio Raw Positions (Phase 9)
      `CREATE TABLE IF NOT EXISTS portfolio_positions (
        portfolio_id TEXT NOT NULL DEFAULT 'default',
        ticker TEXT NOT NULL,
        shares DOUBLE PRECISION NOT NULL,
        avg_cost DOUBLE PRECISION NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (portfolio_id, ticker)
      );`,

      // 13. Research Queries (Phase 7A)
      `CREATE TABLE IF NOT EXISTS research_queries (
        query_id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        intent TEXT,
        security_context JSONB DEFAULT '[]'::jsonb,
        as_of_date TEXT,
        retrieval_metadata JSONB DEFAULT '{}'::jsonb,
        evidence_references JSONB DEFAULT '[]'::jsonb,
        generated_answer TEXT,
        framework_version TEXT NOT NULL DEFAULT '1.0.0',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,

      // 14. Investment Events (Phase 24)
      `CREATE TABLE IF NOT EXISTS investment_events (
        event_id TEXT PRIMARY KEY,
        security_id TEXT NOT NULL,
        ticker TEXT,
        market TEXT NOT NULL,
        exchange TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_date TEXT NOT NULL,
        announced_at TEXT NOT NULL,
        available_at TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        evidence_ids JSONB DEFAULT '[]'::jsonb,
        epistemic_status TEXT NOT NULL,
        is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        structured_data JSONB,
        previous_state JSONB,
        current_state JSONB,
        affected_dimensions JSONB,
        affected_thesis_areas JSONB,
        affected_decision_id TEXT,
        affected_snapshot_id TEXT,
        significance JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_investment_events_sec_date ON investment_events(security_id, available_at DESC);`
    ]
  },
  {
    version: 2,
    name: '002_monitors_policies_and_alerts',
    up: [
      // 15. Investment Monitors (Phase 25)
      `CREATE TABLE IF NOT EXISTS investment_monitors (
        monitor_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        security_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        company_name TEXT NOT NULL,
        market TEXT NOT NULL,
        status TEXT NOT NULL,
        review_cadence TEXT NOT NULL,
        last_reviewed_at TIMESTAMPTZ,
        baseline_decision_id TEXT,
        baseline_snapshot_id TEXT,
        baseline_event_timestamp TEXT,
        baseline_composite_score DOUBLE PRECISION,
        baseline_rating TEXT,
        baseline_thesis_status TEXT,
        latest_decision_id TEXT,
        latest_snapshot_id TEXT,
        latest_event_timestamp TEXT,
        latest_composite_score DOUBLE PRECISION,
        latest_rating TEXT,
        thesis_status TEXT,
        invalidation_status TEXT NOT NULL,
        portfolio_exposure JSONB NOT NULL DEFAULT '{"hasExposure":false}'::jsonb,
        last_change_summary TEXT,
        epistemic_status TEXT NOT NULL DEFAULT 'REAL',
        is_analytical_only BOOLEAN NOT NULL DEFAULT TRUE,
        execution_prohibited BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_investment_monitors_user ON investment_monitors(user_id);
      CREATE INDEX IF NOT EXISTS idx_investment_monitors_sec ON investment_monitors(security_id);`,

      // 16. Monitor Reviews (Phase 26)
      `CREATE TABLE IF NOT EXISTS monitor_reviews (
        review_id TEXT PRIMARY KEY,
        monitor_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        security_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        reviewed_at TIMESTAMPTZ NOT NULL,
        as_of_date TEXT NOT NULL,
        previous_review_id TEXT,
        previous_decision_id TEXT,
        current_decision_id TEXT,
        previous_snapshot_id TEXT,
        current_snapshot_id TEXT,
        change_summary JSONB,
        changes JSONB DEFAULT '[]'::jsonb,
        thesis_health JSONB,
        decision_delta JSONB,
        thesis_delta JSONB,
        event_delta JSONB,
        evidence_delta JSONB,
        portfolio_delta JSONB,
        quant_delta JSONB,
        valuation_delta JSONB,
        invalidation_delta JSONB,
        data_quality_delta JSONB,
        explanation JSONB,
        analyst_notes JSONB DEFAULT '[]'::jsonb,
        epistemic_status TEXT NOT NULL DEFAULT 'REAL',
        is_analytical_only BOOLEAN NOT NULL DEFAULT TRUE,
        execution_prohibited BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_monitor_reviews_monitor ON monitor_reviews(monitor_id, reviewed_at DESC);`,

      // 17. Monitoring Policies (Phase 27)
      `CREATE TABLE IF NOT EXISTS monitoring_policies (
        policy_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        policy_type TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        scope TEXT NOT NULL,
        monitor_id TEXT,
        security_id TEXT,
        portfolio_id TEXT,
        rules JSONB NOT NULL DEFAULT '[]'::jsonb,
        configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
        min_severity TEXT NOT NULL,
        cooldown_minutes INTEGER NOT NULL DEFAULT 60,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_monitoring_policies_user ON monitoring_policies(user_id);`,

      // 18. Orchestrated Alerts (Phase 27)
      `CREATE TABLE IF NOT EXISTS orchestrated_alerts (
        alert_id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        policy_id TEXT,
        policy_name TEXT,
        monitor_id TEXT,
        security_id TEXT,
        symbol TEXT,
        company_name TEXT,
        portfolio_id TEXT,
        user_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        rule_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        deterministic_explanation TEXT NOT NULL,
        contextual_analysis TEXT,
        detected_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMPTZ,
        acknowledged_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        dismissed_at TIMESTAMPTZ,
        fingerprint TEXT NOT NULL,
        trigger_data JSONB NOT NULL,
        provenance_data JSONB NOT NULL,
        review_reference JSONB DEFAULT '{}'::jsonb,
        audit_trail JSONB DEFAULT '[]'::jsonb,
        is_analytical_only BOOLEAN NOT NULL DEFAULT TRUE,
        execution_prohibited BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE INDEX IF NOT EXISTS idx_orchestrated_alerts_user ON orchestrated_alerts(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_orchestrated_alerts_fingerprint ON orchestrated_alerts(fingerprint);`
    ]
  },
  {
    version: 3,
    name: '003_ownership_and_visibility',
    // Phase 38.2A. NOT executed by this phase. Adds owner/visibility persistence for user-owned entities.
    // - Existing rows keep their IDs and content; they receive owner_user_id = NULL and visibility = 'PRIVATE',
    //   i.e. the restricted LEGACY_UNOWNED state (unreadable through the API until an ownership decision is recorded).
    // - No row is reassigned, copied, or deleted by this migration.
    // - Row-level security is intentionally NOT enabled here (see phase38_2a_report.md).
    up: [
      // research_documents
      `ALTER TABLE research_documents
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_research_documents_owner ON research_documents(owner_user_id);`,
      // evidence_items
      `ALTER TABLE evidence_items
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_items_owner ON evidence_items(owner_user_id);`,
      // research_notebooks
      `ALTER TABLE research_notebooks
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_research_notebooks_owner ON research_notebooks(owner_user_id);`,
      // research_snapshots
      `ALTER TABLE research_snapshots
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_research_snapshots_owner ON research_snapshots(owner_user_id);`,
      // investment_decisions
      `ALTER TABLE investment_decisions
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_investment_decisions_owner ON investment_decisions(owner_user_id);`,
      // strategies
      `ALTER TABLE strategies
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_strategies_owner ON strategies(owner_user_id);`,
      // backtests
      `ALTER TABLE backtests
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_backtests_owner ON backtests(owner_user_id);`,
      // watchlists
      `ALTER TABLE watchlists
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_watchlists_owner ON watchlists(owner_user_id);`,
      // alerts
      `ALTER TABLE alerts
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_owner ON alerts(owner_user_id);`,
      // portfolio_positions
      `ALTER TABLE portfolio_positions
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED'));`,
      `CREATE INDEX IF NOT EXISTS idx_portfolio_positions_owner ON portfolio_positions(owner_user_id);`,

      // Content-hash uniqueness becomes per-owner so one tenant's upload can never collide with / resolve to another's.
      `ALTER TABLE research_documents DROP CONSTRAINT IF EXISTS research_documents_content_hash_key;`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_research_documents_owner_hash
         ON research_documents (COALESCE(owner_user_id, ''), content_hash);`,

      // Auditable ownership-assignment ledger for legacy records (append-only; written by a future controlled process).
      `CREATE TABLE IF NOT EXISTS ownership_assignments (
        assignment_id BIGSERIAL PRIMARY KEY,
        record_table TEXT NOT NULL,
        record_id TEXT NOT NULL,
        previous_owner_user_id TEXT,
        new_owner_user_id TEXT,
        new_visibility TEXT NOT NULL CHECK (new_visibility IN ('PRIVATE', 'SHARED')),
        decision TEXT NOT NULL CHECK (decision IN ('ASSIGN_OWNER', 'CLASSIFY_SHARED', 'RETAIN_RESTRICTED')),
        decided_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      `CREATE INDEX IF NOT EXISTS idx_ownership_assignments_record ON ownership_assignments(record_table, record_id);`,

      // Reporting view: every record currently in the restricted LEGACY_UNOWNED state.
      `CREATE OR REPLACE VIEW legacy_unowned_records AS
        SELECT 'research_documents'::text AS record_table, (document_id)::text AS record_id FROM research_documents WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'evidence_items'::text AS record_table, (evidence_id)::text AS record_id FROM evidence_items WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'research_notebooks'::text AS record_table, (notebook_id)::text AS record_id FROM research_notebooks WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'research_snapshots'::text AS record_table, (snapshot_id)::text AS record_id FROM research_snapshots WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'investment_decisions'::text AS record_table, (decision_id)::text AS record_id FROM investment_decisions WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'strategies'::text AS record_table, (strategy_id)::text AS record_id FROM strategies WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'backtests'::text AS record_table, (backtest_id)::text AS record_id FROM backtests WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'watchlists'::text AS record_table, (watchlist_id)::text AS record_id FROM watchlists WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'alerts'::text AS record_table, (alert_id)::text AS record_id FROM alerts WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'portfolio_positions'::text AS record_table, (portfolio_id || ':' || ticker)::text AS record_id FROM portfolio_positions WHERE owner_user_id IS NULL AND visibility <> 'SHARED';`
    ]
  },
  {
    version: 4,
    name: '004_durable_repositories_identity_and_payload',
    // Phase 38.2B. NOT executed by this phase.
    // - Creates identity tables (users, user_sessions) and monitor_notes that repositories already queried.
    // - Replaces 12 in-memory repositories with durable tables (key columns + full-object `payload JSONB`).
    // - Adds `payload JSONB` to 8 lossy tables so row mapping cannot drop or fabricate fields.
    // Additive only: no existing row is modified, moved or deleted; no ownership is assigned.
    up: [
      // Identity (previously queried by the PostgreSQL adapter but never created by any migration)
      `CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        normalized_email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        last_login_at TIMESTAMPTZ
      );`,
      `CREATE TABLE IF NOT EXISTS user_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(user_id),
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        last_activity_at TIMESTAMPTZ NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        is_valid BOOLEAN NOT NULL DEFAULT TRUE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, is_valid);`,
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);`,

      // Analyst notes written by PostgresInvestmentMonitorRepository.addNote (immutable; no FK/cascade so history
      // can never be removed by deleting a monitor)
      `CREATE TABLE IF NOT EXISTS monitor_notes (
        note_id TEXT PRIMARY KEY,
        monitor_id TEXT NOT NULL,
        review_id TEXT,
        user_id TEXT NOT NULL,
        owner_user_id TEXT,
        author_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        content TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT 'USER NOTE',
        is_immutable BOOLEAN NOT NULL DEFAULT TRUE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_monitor_notes_monitor ON monitor_notes(monitor_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_monitor_notes_owner ON monitor_notes(owner_user_id);`,

      `CREATE TABLE IF NOT EXISTS research_priority_snapshots (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_research_priority_snapshots_owner ON research_priority_snapshots(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_research_priority_snapshots_security ON research_priority_snapshots(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_research_priority_snapshots_ref ON research_priority_snapshots(ref_key);`,

      `CREATE TABLE IF NOT EXISTS cross_investment_snapshots (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cross_investment_snapshots_owner ON cross_investment_snapshots(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_cross_investment_snapshots_security ON cross_investment_snapshots(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_cross_investment_snapshots_ref ON cross_investment_snapshots(ref_key);`,

      `CREATE TABLE IF NOT EXISTS portfolio_scenario_snapshots (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_portfolio_scenario_snapshots_owner ON portfolio_scenario_snapshots(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_portfolio_scenario_snapshots_security ON portfolio_scenario_snapshots(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_portfolio_scenario_snapshots_ref ON portfolio_scenario_snapshots(ref_key);`,

      `CREATE TABLE IF NOT EXISTS counterfactual_snapshots (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_counterfactual_snapshots_owner ON counterfactual_snapshots(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_counterfactual_snapshots_security ON counterfactual_snapshots(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_counterfactual_snapshots_ref ON counterfactual_snapshots(ref_key);`,

      `CREATE TABLE IF NOT EXISTS research_memories (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_research_memories_owner ON research_memories(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_research_memories_security ON research_memories(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_research_memories_ref ON research_memories(ref_key);`,

      `CREATE TABLE IF NOT EXISTS research_questions (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_research_questions_owner ON research_questions(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_research_questions_security ON research_questions(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_research_questions_ref ON research_questions(ref_key);`,

      `CREATE TABLE IF NOT EXISTS research_gaps (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_research_gaps_owner ON research_gaps(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_research_gaps_security ON research_gaps(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_research_gaps_ref ON research_gaps(ref_key);`,

      `CREATE TABLE IF NOT EXISTS investigation_plans (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_investigation_plans_owner ON investigation_plans(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_investigation_plans_security ON investigation_plans(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_investigation_plans_ref ON investigation_plans(ref_key);`,

      `CREATE TABLE IF NOT EXISTS investigation_audits (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_investigation_audits_owner ON investigation_audits(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_investigation_audits_security ON investigation_audits(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_investigation_audits_ref ON investigation_audits(ref_key);`,

      `CREATE TABLE IF NOT EXISTS evidence_collections (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_collections_owner ON evidence_collections(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_collections_security ON evidence_collections(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_collections_ref ON evidence_collections(ref_key);`,

      `CREATE TABLE IF NOT EXISTS evidence_relationships (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_relationships_owner ON evidence_relationships(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_relationships_security ON evidence_relationships(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_relationships_ref ON evidence_relationships(ref_key);`,

      `CREATE TABLE IF NOT EXISTS evidence_audits (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT,
        security_id TEXT,
        as_of_date TEXT,
        status TEXT,
        ref_key TEXT,
        ref_key2 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_audits_owner ON evidence_audits(owner_user_id, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_audits_security ON evidence_audits(security_id, as_of_date);`,
      `CREATE INDEX IF NOT EXISTS idx_evidence_audits_ref ON evidence_audits(ref_key);`,

      // research_queries was never ownership-aware
      `ALTER TABLE research_queries
        ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
        ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'SHARED')),
        ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `CREATE INDEX IF NOT EXISTS idx_research_queries_owner ON research_queries(owner_user_id);`,

      // Full domain object preserved alongside the denormalised columns (no field is dropped by row mapping)
      `ALTER TABLE research_documents ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `ALTER TABLE research_notebooks ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `ALTER TABLE research_snapshots ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `ALTER TABLE investment_decisions ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `ALTER TABLE strategies ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `ALTER TABLE backtests ADD COLUMN IF NOT EXISTS payload JSONB;`,
      `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS payload JSONB;`,
      // Reporting view extended to the newly durable tables
      `CREATE OR REPLACE VIEW legacy_unowned_records AS
        SELECT 'research_documents'::text AS record_table, (document_id)::text AS record_id FROM research_documents WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'evidence_items'::text AS record_table, (evidence_id)::text AS record_id FROM evidence_items WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'research_notebooks'::text AS record_table, (notebook_id)::text AS record_id FROM research_notebooks WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'research_snapshots'::text AS record_table, (snapshot_id)::text AS record_id FROM research_snapshots WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'investment_decisions'::text AS record_table, (decision_id)::text AS record_id FROM investment_decisions WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'strategies'::text AS record_table, (strategy_id)::text AS record_id FROM strategies WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'backtests'::text AS record_table, (backtest_id)::text AS record_id FROM backtests WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'watchlists'::text AS record_table, (watchlist_id)::text AS record_id FROM watchlists WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'alerts'::text AS record_table, (alert_id)::text AS record_id FROM alerts WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'portfolio_positions'::text AS record_table, (portfolio_id || ':' || ticker)::text AS record_id FROM portfolio_positions WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'research_priority_snapshots'::text AS record_table, id::text AS record_id FROM research_priority_snapshots WHERE owner_user_id IS NULL UNION ALL
        SELECT 'cross_investment_snapshots'::text AS record_table, id::text AS record_id FROM cross_investment_snapshots WHERE owner_user_id IS NULL UNION ALL
        SELECT 'portfolio_scenario_snapshots'::text AS record_table, id::text AS record_id FROM portfolio_scenario_snapshots WHERE owner_user_id IS NULL UNION ALL
        SELECT 'counterfactual_snapshots'::text AS record_table, id::text AS record_id FROM counterfactual_snapshots WHERE owner_user_id IS NULL UNION ALL
        SELECT 'research_memories'::text AS record_table, id::text AS record_id FROM research_memories WHERE owner_user_id IS NULL UNION ALL
        SELECT 'research_questions'::text AS record_table, id::text AS record_id FROM research_questions WHERE owner_user_id IS NULL UNION ALL
        SELECT 'research_gaps'::text AS record_table, id::text AS record_id FROM research_gaps WHERE owner_user_id IS NULL UNION ALL
        SELECT 'investigation_plans'::text AS record_table, id::text AS record_id FROM investigation_plans WHERE owner_user_id IS NULL UNION ALL
        SELECT 'investigation_audits'::text AS record_table, id::text AS record_id FROM investigation_audits WHERE owner_user_id IS NULL UNION ALL
        SELECT 'evidence_collections'::text AS record_table, id::text AS record_id FROM evidence_collections WHERE owner_user_id IS NULL UNION ALL
        SELECT 'evidence_relationships'::text AS record_table, id::text AS record_id FROM evidence_relationships WHERE owner_user_id IS NULL UNION ALL
        SELECT 'evidence_audits'::text AS record_table, id::text AS record_id FROM evidence_audits WHERE owner_user_id IS NULL UNION ALL
        SELECT 'research_queries'::text AS record_table, query_id::text AS record_id FROM research_queries WHERE owner_user_id IS NULL AND visibility <> 'SHARED' UNION ALL
        SELECT 'monitor_notes'::text AS record_table, note_id::text AS record_id FROM monitor_notes WHERE owner_user_id IS NULL;`
    ]
  }
];
