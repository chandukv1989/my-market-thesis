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
  }
];
