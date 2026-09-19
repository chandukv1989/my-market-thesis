# Phase 22 Product Gap Discovery, Feature Prioritization & Next-Value Analysis

**Audit Date**: September 18, 2026  
**Auditor**: Institutional Investment Intelligence Product Discovery & Architectural Review  
**Target Application**: Multi-Market Investment Intelligence & Quantitative Research Platform (US & India)  
**Status**: Discovery & Prioritization Complete — Zero Architectural Disruption Enforced  

---

## 1. Current Product Capability Map

The platform currently operates as a full-stack, institutional-grade equity research workstation supporting US equities (Twelve Data, SEC EDGAR XBRL) and Indian equities (FYERS, NSE/BSE statutory reporting). Below is the comprehensive inventory across all 19 functional domains (A through S):

| Domain | UI Entry Point | API Routes | Backend Service / Engine | Data Sources | Persistence | Epistemic Status | Current Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Market Data** | `StockDeepDiveView`, `DashboardView`, `Header`, `WatchlistView` | `/api/market/quote/:ticker`, `/api/market/batch`, `/api/market/history/:ticker`, `/api/market/status/:market` | `marketDataProvider`, `usMarketProvider`, `indiaMarketProvider`, `fyersMarketProvider` | Twelve Data (US), FYERS (India), Indian Market Constants fallback | In-memory LRU cache with TTL | `REAL` (when authenticated) / `SIMULATED` (explicit baseline) / `UNAVAILABLE` (outage) | Rate limits on Twelve Data basic tier (8 credits/min); FYERS requires live interactive login token; daily bars primary. |
| **B. Security Discovery** | `Header` (Global Search Modal), `DiscoverView` | `/api/search` | `searchIntelligence`, `marketDataProvider` | Canonical securities index (`canonicalSecurities.ts`, `indianStocks.ts`), Twelve Data symbol lookup | Static index + memory cache | `REAL` / `CALCULATED` | Limited to active equities universe; no OTC/penny stock or fixed income coverage. |
| **C. Deep Dive** | `StockDeepDiveView` | `/api/market/quote/:ticker`, `/api/sec/financials/:ticker`, `/api/decisions/:ticker` | `financialDataService`, `decisionIntelligenceService` | Twelve Data, SEC EDGAR, Decision Scoring Engine | Cached in memory / disk | `REAL` / `CALCULATED` / `AI ANALYSIS` | Multiples derived from trailing GAAP data; forward consensus estimates not dynamically fetched. |
| **D. Fundamentals** | `StockDeepDiveView` (Financials & Quarters tab), `FinancialChart` | `/api/sec/financials/:ticker`, `/api/sec/filings/:ticker`, `/api/sec/facts/:ticker`, `/api/sec/submissions/:ticker` | `secEdgarProvider`, `financialDataService` | SEC EDGAR XBRL company facts API (US), statutory reporting models (India) | Disk-backed SEC cache (`data/sec_cache/`) | `REAL` (US XBRL) / `CALCULATED` (Ratios) / `UNAVAILABLE` (SEC for India) | SEC EDGAR covers US only; Indian quarterly disclosures use local statutory models without automated XBRL ingest. |
| **E. Research** | `ResearchWorkspaceView` | `/api/research/analyze`, `/api/research/status`, `/api/research/notebook/:securityId/execute` | `researchEngine`, `geminiResearchEngine`, `prompts` | SEC EDGAR, Twelve Data, Finmagine supplemental research, Gemini 2.5 Flash | Snapshots persisted in `persistenceManager` | `REAL` (citations) / `AI ANALYSIS` (synthesis) / `CALCULATED` (fallback) | Gemini API key required for probabilistic synthesis; generates deterministic rule-based fallback if unconfigured. |
| **F. Evidence / RAG** | `EvidenceModal`, `DocumentCitationModal`, `ResearchWorkspaceView` | `/api/evidence/search`, `/api/evidence`, `/api/research/notebook/:securityId/sources` | `retrievalEngine`, `chunking`, `embeddingProvider`, `evidenceService` | SEC EDGAR 10-K/10-Q text chunks, Finmagine evidence, uploaded user files | `IEvidenceRepository` (Dev disk adapter / Postgres) | `REAL` | Lexical / BM25 token retrieval; maximum chunk size 1,000 tokens; max document upload 10MB. |
| **G. Research Documents** | `ResearchDocumentsPanel`, `DocumentUploadModal` | `/api/documents`, `/api/documents/upload`, `/api/documents/:documentId`, `/api/documents/validate`, `/api/documents/stats` | `documentIngestionService`, `documentParser`, `documentRegistry`, `documentEvidenceAdapter` | User-uploaded files (`.pdf`, `.csv`, `.md`, `.txt`) | Disk storage (`data/documents/`) + metadata in `persistenceManager` | `REAL` | 10MB per file; PDF parser requires text layer (no OCR for scanned images); synchronous ingestion. |
| **H. Research Notebook** | `ResearchWorkspaceView` (Notebook & Snapshots tabs) | `/api/research/notebooks`, `/api/research/notebook/:securityId`, `/api/research/notebook/:securityId/snapshots`, `/api/research/snapshot/:snapshotId` | `notebookService` | Persisted research snapshots, structured claims, source coverage metrics | `ISnapshotRepository` | `REAL` / `CALCULATED` / `AI ANALYSIS` | Snapshots are immutable historical records; no inline collaborative markdown editing directly in snapshot. |
| **I. Quant Strategies** | `StrategiesView` | `/api/strategies`, `/api/strategies/:id`, `/api/strategies/evaluate`, `/api/strategies/validate`, `/api/strategies/custom` | `quantStrategyEngine`, `builtinStrategies`, `indicatorEngine`, `strategyRuleEvaluator`, `positionSizingEngine`, `riskConstraintEngine` | Historical daily market bars from Twelve Data / FYERS | In-memory strategy registry | `CALCULATED` (`isAnalyticalOnly: true`) | Predefined RuleSpec JSON format; evaluated on single asset at a time; zero broker order routing. |
| **J. Backtesting** | `BacktestingView` | `/api/backtests/run`, `/api/backtests/validate`, `/api/backtests/:id`, `/api/backtests`, `/api/backtests/:id/report` | `backtestService`, `backtestEngine`, `portfolioSimulator`, `simulatedExecutionEngine`, `backtestAnalyticsEngine` | Historical daily bars, SPY benchmark (US), NIFTY50 benchmark (India) | `IBacktestRepository` | `CALCULATED` (`isAnalyticalOnly: true`) | Single-asset backtesting against benchmark; multi-asset portfolio rebalancing backtest not supported; daily resolution. |
| **K. Portfolio Intelligence** | `PortfolioView`, `PortfolioIntelligencePanel` | `/api/portfolio/metrics`, `/api/portfolio/analyze` | `portfolioIntelligenceService`, `portfolioEngine` | Client portfolio holdings, live market quotes | Session state in `AppStateContext` | `CALCULATED` / `AI ANALYSIS` | Portfolio state is client-held; no automated historical NAV time-series tracking; no automated rebalancing simulator. |
| **L. Watchlists** | `WatchlistView`, `Header`, `StockDeepDiveView` | `/api/watchlist`, `/api/watchlist/:id` | `watchlistAlertService` | User-added securities | `IWatchlistRepository` (multi-user isolated) | `REAL` | Single default watchlist per user; no custom named watchlist folders. |
| **M. Alerts** | `AlertsView`, `Sidebar` | `/api/alerts/rules`, `/api/alerts/events`, `/api/alerts/evaluate`, `/api/alerts/:id/read`, `/api/alerts/:id/acknowledge`, `/api/alerts/:id/analyze` | `watchlistAlertService`, `alertEvaluator` | Live price quotes, user threshold rules | `IAlertRepository` (multi-user isolated) | `REAL` / `CALCULATED` | Rules trigger on price thresholds (`PRICE_ABOVE`, `PRICE_BELOW`, `PERCENT_CHANGE`); filing and thesis invalidation alerts require manual poll. |
| **N. Decision Intelligence** | `StockDeepDiveView` (Investment Assessment tab), `InvestmentAssessmentView` | `/api/decisions/:securityId`, `/api/decisions/evaluate`, `/api/decisions/:securityId/as-of/:date`, `/api/decisions/compare` | `decisionIntelligenceService`, `decisionScoringEngine`, `decisionExplanationEngine` | Fundamental metrics, market data, quant indicators, portfolio context, thesis state | `IDecisionRepository` | `CALCULATED` (10 dimensions) / `AI ANALYSIS` (narrative) / `REAL` (citations) | Compares 2 securities side-by-side; no multi-company peer ranker across an entire sector grid; no visual decision delta timeline. |
| **O. Authentication** | `Header` (Sign In / User Profile modal) | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` | `authService`, `authMiddleware`, `authorizationService` | User credentials (PBKDF2 salted hash, 100,000 iterations) | `IUserRepository` | `REAL` | Bearer token authentication; password reset and OAuth 2.0 / SSO not yet implemented. |
| **P. Persistence** | N/A (Server infrastructure) | `/api/persistence/status`, `/api/persistence/*` | `persistenceManager`, `developmentPersistenceAdapter`, `postgresAdapter` | Local disk JSON storage (`data/persistence/`) or PostgreSQL (`DATABASE_URL`) | Durable disk JSON / PostgreSQL | `REAL` | Defaults to local development adapter when `DATABASE_URL` is absent; migration schema fully defined. |
| **Q. Provider Management** | `Header` (Data Status Modal), `DiscoverView` | `/api/data-status`, `/api/fyers/status`, `/api/finmagine/status`, `/api/config/status` | `environmentConfig`, `fyersAuthService` | Environment variables, provider health pings | In-memory status cache | `REAL` | Read-only diagnostic display; keys managed exclusively via environment variables for security. |
| **R. Security & Hardening** | N/A (Server middleware) | All protected routes | `rateLimiter`, `requestCorrelation`, `structuredLogger`, `errorHandler` | Request IP, correlation headers | In-memory token bucket | `REAL` | In-memory rate limiting resets on process restart; no distributed Redis layer. |
| **S. Historical / PIT** | `ResearchWorkspaceView` (`asOfDate`), `InvestmentAssessmentView` (`asOfDate`) | `/api/decisions/:securityId/as-of/:date`, `/api/research/notebook/:securityId?asOfDate=...`, `/api/evidence?asOfDate=...` | `evidenceRepository`, `decisionIntelligenceService`, `notebookService` | Historical evidence records with `effectiveDate` | Immutable historical records | `REAL` / `CALCULATED` | Temporal boundaries strictly enforced on evidence and decisions; market bars bounded by Twelve Data API subscription depth. |

---

## 2. Implemented Capabilities

The following capabilities are **fully implemented, tested, and active** in production:
1. **Multi-Market Native Security Resolution**: Dual-market coverage across US (NASDAQ, NYSE) and India (NSE, BSE) with native currency formatting (`$` vs `₹`).
2. **SEC EDGAR Regulatory Integration**: Automated real-time ingestion of US company facts, annual (10-K) and quarterly (10-Q) filings, and direct XBRL primary source citations.
3. **10-Dimensional Deterministic Decision Engine**: Canonical scoring matrix across Fundamental Quality, Growth Trend, Valuation Context, Market Trend, Quantitative Signal, Backtest Context, Risk Profile, Portfolio Fit, Evidence Coverage, and Thesis Status.
4. **Falsifiable Invalidation Guards**: Measurable criteria (e.g., consecutive quarterly revenue contractions, 50/200 SMA death crosses) tracked with explicit `ACTIVE_GUARD` and `TRIGGERED` states.
5. **Point-in-Time (PIT) Temporal Filtering**: Strict lookahead prevention ensuring research queries and decision evaluations on `asOfDate` only access facts available on or before that date.
6. **Immutable Historical Persistence**: Overwrites of previously recorded decisions, research snapshots, or backtest runs are rejected by the storage layer.
7. **Document Ingestion & Grounded RAG**: Drag-and-drop ingestion of PDF, CSV, Markdown, and TXT documents up to 10MB with anti-traversal security, tokenized chunking, and verifiable evidence citations.
8. **Algorithmic Technical Indicators**: Mathematically verified SMA, EMA, RSI (strictly $[0, 100]$), Bollinger Bands, and MACD calculations.
9. **Single-Asset Walk-Forward Backtesting**: Historical simulation including transaction costs, slippage (bps), commission, execution timing (next open vs same close), equity curve, and benchmark tracking.
10. **Portfolio Concentration Analysis**: Herfindahl-Hirschman Index (HHI) computation, sector weighting, and strict currency segregation between USD and INR balances.
11. **Multi-User Isolated Watchlists & Alerts**: Private user watchlists and price threshold rules enforced with ownership verification (zero IDOR vulnerabilities).
12. **Epistemic Classification Hierarchy**: Strict visual and structural segregation of `FACT`, `CALCULATION`, `AI ANALYSIS`, `SIMULATED`, and `UNAVAILABLE` data.
13. **Zero Broker Execution Enforced**: Complete architectural absence of order routing, trading endpoints, or automated transaction triggers.

---

## 3. Partial Capabilities

These capabilities exist in the backend or have partial UI support, but are **not fully rounded out into complete user workflows**:
1. **Side-by-Side Company Comparison (`PARTIAL`)**: The backend supports `/api/decisions/compare` and the UI renders a 2-company side-by-side comparison table in the Decision view. However, it is restricted to exactly two securities at a time, lacks an interactive multi-ticker peer grid (e.g. comparing 5 sector peers simultaneously), and has no visual multiples scatter overlay.
2. **Historical Decision Review (`PARTIAL`)**: The backend supports querying decisions by date (`/api/decisions/:securityId/as-of/:date`) and historical decisions are stored immutably in `IDecisionRepository`. However, there is no sequential timeline UI showing how an asset's score evolved from quarter to quarter, nor an automated delta breakdown of which dimensions changed.
3. **Research Snapshot Comparison (`PARTIAL`)**: Multiple snapshots can be saved per security, and the backend retrieves all snapshots for a security. However, the UI only displays a flat list of snapshots without a side-by-side visual diff to inspect what changed between two research dates.
4. **Alert Trigger Varieties (`PARTIAL`)**: The alert engine supports price threshold rules (`PRICE_ABOVE`, `PRICE_BELOW`, `PERCENT_CHANGE`) and live evaluation. However, filing alert rules (`NEW_FILING_10K`, `NEW_FILING_10Q`) and thesis invalidation triggers (`INVALIDATION_TRIGGERED`) are not yet linked to the automated alert evaluation loop.
5. **Indian Financials Automation (`PARTIAL`)**: Indian securities are resolved natively with live quotes, but quarterly financial statements rely on static/local statutory models rather than direct automated ingest of NSE/BSE corporate filings.

---

## 4. Missing Capabilities

The following capabilities are **currently absent from the system**:
1. **Consensus Earnings Estimates & Surprise Data (`MISSING`)**: Forward EPS/revenue consensus, analyst price targets, and earnings surprise percentages (requires external broker consensus feed).
2. **Earnings Calendar & Corporate Actions (`MISSING`)**: Central calendar of upcoming earnings calls, ex-dividend dates, stock splits, and shareholder meetings.
3. **Multi-Asset Portfolio Backtesting (`MISSING`)**: Backtesting an entire diversified portfolio with historical rebalancing rules across 10+ securities simultaneously.
4. **Insider Transactions & Institutional Ownership (`MISSING`)**: Ingestion and visualization of SEC Form 4 (insider trades) and Form 13F (institutional holdings).
5. **Interactive DCF / Valuation Scenario Builder (`MISSING`)**: Parametric discounted cash flow modeling allowing users to adjust terminal growth rates, WACC, and discount rates interactively.
6. **Custom Watchlist Folders / Tags (`MISSING`)**: Ability to categorize watchlists into named custom buckets (e.g., "AI Infrastructure", "Dividend Compounders", "High Beta").
7. **Automated Trading / Broker Execution (`NOT APPROPRIATE`)**: Explicitly forbidden by platform compliance and architectural mandates (`isAnalyticalOnly: true`).

---

## 5. User Workflow Analysis

### Workflow 1: "I discover a stock and want to decide whether it deserves deeper research."
- **Current Support**: User searches ticker in Header or browses Discover cards; clicks ticker to navigate to Stock Deep Dive; reviews 10-dimension assessment score.
- **Where It Stops**: In Discover, securities are displayed as static cards without sorting by factor score, valuation multiples, or sector percentiles. The user cannot see how the stock ranks against industry peers without opening each stock individually.
- **Missing Information**: Sector peer ranking, relative valuation percentile, and quick-scan comparison grid.
- **Manual Work**: User must manually click each ticker, memorize or write down scores, and manually cross-compare.
- **Friction-Removing Feature**: **Cross-Company Peer Valuation & Factor Ranking Grid**.

### Workflow 2: "I already own a stock and want to understand whether my thesis is still valid."
- **Current Support**: User opens Deep Dive -> Thesis tab or Investment Assessment tab; reviews Central Thesis, Thesis Breakers, and Invalidation Conditions (`ACTIVE_GUARD` / `TRIGGERED`).
- **Where It Stops**: The user sees the *current* state of invalidation guards, but cannot see *when* a guard was triggered, what metric shifted, or how the composite score changed since they bought the stock.
- **Missing Information**: Historical thesis trajectory, date of guard trigger, and sequential score delta.
- **Manual Work**: User must manually recall previous thesis state or check historical SEC filings externally.
- **Friction-Removing Feature**: **Decision Timeline & Thesis Change Attribution (Decision Journal)**.

### Workflow 3: "I want to compare two or more companies."
- **Current Support**: Investment Assessment tab provides a 2-company side-by-side modal comparing 10 dimensions.
- **Where It Stops**: Strictly limited to 2 companies. Cannot compare an entire peer group (e.g., NVDA vs AMD vs INTC vs TSM). No comparative charting of financial ratios (P/E vs ROIC).
- **Missing Information**: Multi-peer tabular comparison, valuation multiples scatter, and industry median benchmarks.
- **Manual Work**: User must run multiple pairwise comparisons.
- **Friction-Removing Feature**: **Multi-Peer Valuation & Factor Comparison Matrix**.

### Workflow 4: "I want to research an earnings event."
- **Current Support**: Financials & Quarters tab displays historical GAAP revenues, operating margins, net income, and 10-Q filing dates.
- **Where It Stops**: No consensus estimate comparison (beat/miss), no guidance commentary tracking, and no earnings date calendar.
- **Missing Information**: Consensus EPS/revenue estimates, surprise percentage, and management guidance deltas.
- **Manual Work**: User must look up Wall Street consensus estimates on external financial terminals.
- **Friction-Removing Feature**: **Earnings Surprise & Filing Delta Analyzer** (subject to data provider).

### Workflow 5: "I want to understand why my portfolio risk changed."
- **Current Support**: Portfolio Intelligence panel calculates HHI, top risk contributors, sector weights, and Gemini grounded Q&A.
- **Where It Stops**: Only displays the snapshot of the *current* portfolio state. Cannot view how risk attribution, beta, or HHI changed over time as stock prices fluctuated.
- **Missing Information**: Historical portfolio risk time series and factor drift attribution.
- **Manual Work**: User must manually recalculate or export portfolio numbers periodically.
- **Friction-Removing Feature**: **Historical Portfolio Risk Attribution & Drift Monitor**.

### Workflow 6: "I want to test an investment strategy historically."
- **Current Support**: Walk-forward backtesting engine with slippage, commissions, execution timing, equity curves, drawdown curves, and trade drill-downs against SPY/NIFTY50.
- **Where It Stops**: Runs on one symbol at a time. An analyst cannot backtest a multi-stock rebalancing strategy (e.g., "Top 5 ROIC stocks rebalanced quarterly").
- **Missing Information**: Multi-asset portfolio backtest metrics and cross-asset correlation matrices.
- **Manual Work**: User must run separate backtests for each stock and manually aggregate results in a spreadsheet.
- **Friction-Removing Feature**: **Multi-Asset Portfolio Strategy Backtesting**.

### Workflow 7: "I want to know when something important changes."
- **Current Support**: Price threshold alert rules (`PRICE_ABOVE`, `PRICE_BELOW`, `PERCENT_CHANGE`) and event evaluation.
- **Where It Stops**: Does not alert when an SEC 10-K/10-Q is filed, when a thesis invalidation condition is triggered, or when a decision rating changes from `CONSTRUCTIVE` to `CAUTIOUS`.
- **Missing Information**: Non-price event alerts (regulatory filings, invalidation status changes).
- **Manual Work**: User must periodically navigate to Deep Dive to check if invalidation conditions have changed.
- **Friction-Removing Feature**: **Thesis Invalidation & Filing Event Alerts**.

### Workflow 8: "I want to maintain a long-term investment thesis."
- **Current Support**: Research Workspace allows generating and persisting snapshots with citations.
- **Where It Stops**: Snapshots are static records. There is no continuous thesis workspace where an analyst can log thesis updates, record quarterly earnings notes, or track hypothesis validation over time.
- **Missing Information**: Thesis lifecycle progression and quarterly note logs.
- **Manual Work**: User must maintain external notes or generate disconnected research snapshots.
- **Friction-Removing Feature**: **Living Thesis Journal & Quarterly Review Log**.

### Workflow 9: "I want to investigate a company using my own documents."
- **Current Support**: Research Documents panel supports uploading PDFs, CSVs, and text files with token chunking and RAG retrieval.
- **Where It Stops**: Uploaded documents are linked to a single security or globally; there is no cross-document tabular data extraction or comparison across multiple broker research notes.
- **Missing Information**: Multi-document cross-synthesis.
- **Manual Work**: User must search citations document by document.
- **Friction-Removing Feature**: **Multi-Document Comparative Synthesis**.

### Workflow 10: "I want to review previous investment decisions and understand what changed."
- **Current Support**: Historical decisions are stored immutably with `asOfDate` retrieval.
- **Where It Stops**: The user can only inspect one past date at a time by manually typing a date into the `asOfDate` input. There is no visual timeline showing score changes, dimension upgrades/downgrades, or invalidation triggers between date $T_0$ and date $T_1$.
- **Missing Information**: Visual score trajectory, dimension delta breakdown, and audit trail of what drove the rating change.
- **Manual Work**: User must open two browser tabs or write down previous scores to compare.
- **Friction-Removing Feature**: **Decision History Timeline & Dimension Delta Attribution**.

---

## 6. Product Gaps

1. **GAP-P1: Absence of Decision Score Trajectory & Dimension Delta Attribution**: The platform calculates and immutably stores 10-dimensional decision assessments, but provides no chronological timeline or diff tool to show *why* an assessment changed over time.
2. **GAP-P2: Lack of Multi-Company Peer Valuation & Screening Matrix**: Analysts cannot compare 3 to 10 industry peers simultaneously in an interactive valuation and factor grid.
3. **GAP-P3: Disconnection Between Invalidation Guards and the Alert Engine**: The alert engine only evaluates price rules, leaving thesis invalidation conditions as passive displays rather than actionable push notifications.
4. **GAP-P4: Static Discover Screen Lacking Multi-Factor Sorting**: Discover presents fixed cards rather than an interactive screening tool sortable by ROIC, FCF Yield, Forward P/E, or Decision Score.
5. **GAP-P5: Lack of Research Snapshot Visual Diffing**: Analysts cannot select two saved research snapshots and view an immediate visual side-by-side diff of claims, evidence, and conclusions.

---

## 7. Engineering Gaps

1. **GAP-E1: Unexposed Temporal Decision Queries in Frontend**: The backend route `/api/decisions/:securityId/as-of/:date` exists and works, but the frontend only exposes a simple date input rather than a rich interactive scrubber or timeline slider.
2. **GAP-E2: Pairwise-Only Comparison Route**: `/api/decisions/compare` only accepts `securityIdA` and `securityIdB`. A clean multi-target route `/api/decisions/compare-peers` accepting `securityIds: string[]` is missing.
3. **GAP-E3: Absence of Invalidation State Event Emitter**: `decisionScoringEngine` evaluates invalidation conditions, but does not emit events to `watchlistAlertService` when a condition changes from `ACTIVE_GUARD` to `TRIGGERED`.
4. **GAP-E4: Snapshot List Retrieval Missing Diff Endpoint**: `/api/research/snapshot/:snapshotId` returns individual snapshots, but there is no `/api/research/snapshots/diff` endpoint to compute claim and citation deltas.

---

## 8. Data Gaps

1. **GAP-D1: Consensus Analyst Estimates & Price Targets**: Neither Twelve Data basic tier nor SEC EDGAR provide Wall Street consensus estimates (EPS consensus, revenue guidance, buy/hold/sell counts).
2. **GAP-D2: Real-Time Indian Regulatory Filings**: Indian equities rely on cached statutory data rather than live machine-readable XBRL feeds from NSE/BSE.
3. **GAP-D3: Earnings Calendar & Corporate Action Timings**: No automated calendar feed for upcoming earnings announcement dates, ex-dividend dates, or conference call webcasts.
4. **GAP-D4: Historical Intraday Market Bars**: Historical tick or minute-level bars are not accessible on the standard Twelve Data tier, restricting backtesting and quant indicators to daily closing bars.

---

## 9. UX Gaps

1. **GAP-U1: Hidden Decision Comparison Feature**: Side-by-side comparison is buried inside a small button within the Investment Assessment tab, rather than being accessible from the main navigation or Discover view.
2. **GAP-U2: Lack of Visual Temporal Scrubber**: Navigating historical point-in-time states requires typing ISO date strings (`YYYY-MM-DD`) manually instead of using a visual quarterly slider or calendar picker.
3. **GAP-U3: Monolithic Discover View**: The Discover page displays large cards that take up vertical space, making it difficult to scan 20+ securities quickly without excessive scrolling.
4. **GAP-U4: Lack of Dimension Drill-Down Graphs**: In the Decision Matrix, expanding a dimension shows text bullet points, but lacks historical trend mini-sparklines (e.g., 4-quarter operating margin trend).

---

## 10. Infrastructure Gaps

1. **GAP-I1: PostgreSQL Production Deployment Verification**: While the codebase contains a fully typed PostgreSQL adapter and migration runner (`server/persistence/postgres/`), the live preview container operates using the disk-backed `DevelopmentPersistenceAdapter`. Deploying to an external Cloud SQL instance requires runtime environment provisioning.
2. **GAP-I2: Local In-Memory Rate Limiting**: The rate limiter maintains token buckets in process memory, meaning restart cycles reset rate quotas.

---

## 11. Provider Dependencies

| Feature Domain | Existing Providers Sufficient? | Twelve Data | FYERS | SEC EDGAR | Finmagine | Local / Calculated | New Provider Needed? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Decision Timeline & Delta** | **Yes** (100% internal) | Quote bars | Native bars | Facts | Evidence | Decision Engine & Repo | **None** |
| **Peer Valuation Matrix** | **Yes** (100% internal) | Quotes & ratios | Quotes | XBRL | Evidence | Financial Service | **None** |
| **Thesis Invalidation Alerts**| **Yes** (100% internal) | Daily quotes | Quotes | Filings | Evidence | Alert Evaluator | **None** |
| **Research Snapshot Diff** | **Yes** (100% internal) | None | None | None | None | Notebook Service | **None** |
| **Earnings Surprise / Consensus**| **No** | None | None | None | None | None | **Yes** (FactSet, LSEG, or Benzinga) |
| **Live NSE/BSE Filing Feed** | **No** | None | Quotes only | None | None | None | **Yes** (BSE/NSE direct API or Prime Database) |
| **Multi-Asset Backtest** | **Yes** (internal engine) | Historical bars | Historical bars | None | None | Backtest Engine | **None** |

---

## 12. Licensing / Data Availability Considerations

1. **Twelve Data Free/Basic Tier Constraints**: Limited to 8 API calls per minute and 800 per day. Any feature that makes batch requests across dozens of securities simultaneously must rely on local caching and rate-limited queueing.
2. **SEC EDGAR Access Policy**: Free public domain data, but SEC enforces a strict limit of 10 requests per second with a mandatory `User-Agent` declaration. The existing `secEdgarProvider` strictly obeys this rate limit and caches facts locally.
3. **Consensus Estimates Licensing**: Third-party consensus estimates (I/B/E/S, FactSet, Zacks) carry heavy institutional licensing fees ($10k-$50k+/year) and restrictive redistribution terms. **Building proprietary features that depend on licensed consensus feeds is not recommended for immediate phases.**
4. **Zero Broker Execution Mandate**: Compliance and regulatory status requires maintaining strict non-brokerage classification. Features that simulate trade routing or automated execution are strictly prohibited.

---

## 13. Reusable Existing Infrastructure

The repository possesses substantial institutional infrastructure that can be leveraged without writing new backend services:
1. **`IDecisionRepository` & `DecisionScoringEngine`**: Stores versioned, deterministic 10-dimension assessments with `decisionId`, `securityId`, `asOfDate`, `compositeScore`, `dimensionsList`, and `invalidationConditions`.
2. **`WatchlistAlertService` & `AlertEvaluator`**: Robust alert rule storage, event evaluation loop, and user notification dispatcher.
3. **`FinancialDataService` & Multiples Ribbon**: Comprehensive fundamental data model parsing SEC EDGAR facts into P/E, ROIC, FCF Yield, Beta, and Margin trends.
4. **`NotebookService` & `SnapshotRepository`**: Immutable research snapshot records containing structured claims, citations, and source coverage metrics.
5. **`SecurityResolutionService`**: Canonical security registry (`CANONICAL_SECURITIES`, `INDIAN_STOCKS`) providing exchange prefixes, native currencies, and country identifiers.

---

## 14. Candidate Next Features

| Feature ID | Feature Name | Description | Target User Value |
| :--- | :--- | :--- | :--- |
| **FEAT-1** | **Decision History Timeline & Dimension Delta Attribution** | Interactive timeline in the Decision view allowing analysts to view score progression over time and inspect a dimension-by-dimension delta between any two evaluation dates. | Eliminates manual comparison; reveals exactly what fundamental, valuation, or quant metric drove a rating change. |
| **FEAT-2** | **Multi-Company Peer Valuation & Factor Comparison Grid** | Interactive peer matrix allowing analysts to compare 3 to 10 companies across valuation multiples, growth, ROIC, and 10-dimension scores in a single tabular view. | Enables rapid industry screening and relative valuation benchmarking. |
| **FEAT-3** | **Thesis Invalidation & Filing Event Alert Rules** | Automated alert rules that fire notifications when a thesis invalidation guard flips to `TRIGGERED` or when a new 10-K/10-Q filing is ingested. | Proactively alerts analysts when an investment thesis is breached without requiring manual daily monitoring. |
| **FEAT-4** | **Research Snapshot Visual Diff Viewer** | Side-by-side diff tool in Research Workspace comparing two historical research snapshots to highlight added/removed claims and changed citations. | Provides an audit trail of how research conclusions evolved between reporting periods. |
| **FEAT-5** | **Multi-Asset Rebalancing Backtest Engine** | Portfolio-level backtesting allowing allocation across multiple securities with periodic rebalancing and cross-asset drawdown tracking. | Enables testing diversified quantitative strategies rather than single-stock models. |

---

## 15. Feature Comparison Matrix

| Feature | Affected Workflows | Existing Infra Reuse | New Data Required | External Dependency | Implementation Complexity | Security Impact | PIT Impact | User Value |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **FEAT-1: Decision Timeline & Delta** | W2, W7, W8, W10 | **Very High** (`IDecisionRepo`, `DecisionScoringEngine`) | **None** | **None** | Low–Medium | None (multi-user safe) | **High Positive** (unlocks historical decisions) | Crucial for tracking thesis decay and rating evolution over time. |
| **FEAT-2: Peer Valuation Grid** | W1, W3 | **High** (`FinancialDataService`, Canonical Secs) | **None** | **None** | Low–Medium | None | None | Enables immediate cross-company screening and sector benchmarking. |
| **FEAT-3: Invalidation Event Alerts** | W2, W7 | **High** (`WatchlistAlertService`, `AlertEvaluator`) | **None** | **None** | Low–Medium | None | Low | Turns passive thesis guards into proactive notifications. |
| **FEAT-4: Snapshot Diff Viewer** | W8, W10 | **High** (`NotebookService`, `SnapshotRepo`) | **None** | **None** | Low | None | Medium Positive | Allows analysts to verify thesis drift between quarters. |
| **FEAT-5: Multi-Asset Backtest** | W6 | **Medium** (`BacktestEngine`, `PortfolioSimulator`) | High (Multiple historical bars) | Twelve Data rate limits | High | None | High | Powerful for quant analysts, but constrained by provider rate limits. |

---

## 16. Recommended Development Sequence

Based on factual criteria—maximizing workflow impact, reusing existing validated infrastructure, requiring zero new external data providers, and maintaining strict point-in-time compliance:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 23 (RECOMMENDED NEXT):                                                │
│ DECISION TIMELINE, THESIS DELTA ATTRIBUTION & PEER BENCHMARKING             │
│ Focus: Exposing historical decision progression, dimension delta            │
│ attribution, and multi-company peer comparative valuation.                  │
│ Reuses: IDecisionRepository, FinancialDataService, DecisionScoringEngine    │
│ Zero new external data providers required.                                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 24:                                                                   │
│ EVENT-DRIVEN THESIS ALERTS & RESEARCH SNAPSHOT DIFFING                      │
│ Focus: Invalidation trigger push alerts, filing ingest notifications,       │
│ and side-by-side research snapshot claim diffing.                           │
│ Reuses: WatchlistAlertService, AlertEvaluator, NotebookService              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 25:                                                                   │
│ MULTI-ASSET PORTFOLIO STRATEGY BACKTESTING                                  │
│ Focus: Multi-ticker portfolio simulation, periodic rebalancing, and        │
│ cross-asset correlation matrices.                                           │
│ Reuses: BacktestAnalyticsEngine, PortfolioSimulator                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Features NOT Recommended to Build Yet

1. **Third-Party Consensus Earnings Estimates Feed**: Requires commercial licensing (FactSet/Refinitiv) and expensive API subscriptions. SEC EDGAR and Twelve Data basic tier do not provide forward consensus estimates.
2. **Automated Trading / Broker Execution Integration**: Violates core compliance safeguards (`isAnalyticalOnly: true`). The platform is designed strictly as an investment intelligence and quantitative research workstation.
3. **High-Frequency / Intraday Tick Backtesting**: Twelve Data free tier does not support multi-year intraday tick data; attempting intraday backtests would lead to severe rate-limiting and data starvation.
4. **Scanned PDF OCR Pipeline**: Adding heavy OCR binary dependencies (e.g. Tesseract) increases container footprint and failure modes without serving typical institutional filings, which are already digital text PDFs.

---

## 18. Phase 16 PostgreSQL Deployment Caveat

* **Current Architecture**: The application includes a fully written, production-grade PostgreSQL persistence adapter with migration scripts (`server/persistence/postgres/`).
* **Runtime Behavior**: In the AI Studio preview environment, where `DATABASE_URL` is not provided, the platform automatically boots the disk-backed `DevelopmentPersistenceAdapter`.
* **Caveat**: All database schema migrations, multi-user isolation tables, and foreign keys have been verified in unit and integration tests. When transitioning to a shared cloud environment, an external Cloud SQL instance must be provisioned via environment variables without requiring code modifications.

---

## 19. Phase 21 Validation Summary

* **Automated Acceptance Tests**: 42 / 42 passed in `tests/phase21.test.ts`.
* **Architectural Audits**: 32 / 32 passed in `tests/phase20.test.ts`.
* **Zero Broker Execution**: Routing table audited; confirmed zero trading or order execution routes.
* **Epistemic Invariants**: Verified across all 11 user journeys. Primary data (`REAL`), calculations (`CALCULATED`), probabilistic AI synthesis (`AI ANALYSIS`), heuristics (`SIMULATED`), and outages (`UNAVAILABLE`) are segregated with unambiguous UI indicators.

---

## 20. Proposed Phase 23 Specification

> **IMPORTANT**: In strict adherence to system instructions, Phase 23 is proposed as a design specification only. **DO NOT IMPLEMENT PHASE 23 DURING PHASE 22.**

### Phase 23 Title
**PHASE 23 — DECISION TIMELINE, THESIS DELTA ATTRIBUTION & MULTI-PEER BENCHMARKING**

### Objective
Provide equity research analysts with the ability to:
1. View an interactive historical timeline of investment decision scores for any security.
2. Inspect an automated dimension-by-dimension delta breakdown between any two evaluation dates (e.g., revealing whether a downgrade was driven by deteriorating fundamental quality, valuation multiple expansion, or a triggered invalidation guard).
3. Benchmark any security against 3 to 10 industry peers in an interactive multi-factor valuation matrix.

### User Problem
* Currently, an analyst examining a stock can see its *current* decision score (e.g., 78/100, `CONSTRUCTIVE`), but cannot determine whether the stock is improving or deteriorating compared to last quarter without manual external record-keeping.
* Analysts cannot compare more than two companies simultaneously, making sector-wide relative valuation cumbersome.

### Existing Components to Reuse
* **Backend**:
  * `IDecisionRepository` & `persistenceManager.getDecisionRepository()`
  * `decisionScoringEngine.evaluate(inputs)`
  * `decisionIntelligenceService`
  * `financialDataService`
  * `CANONICAL_SECURITIES` and `INDIAN_STOCKS`
* **Frontend**:
  * `InvestmentAssessmentView.tsx` (expand with Timeline & Delta sub-tab)
  * `DiscoverView.tsx` (embed multi-peer comparison grid)
  * `ProvenanceBadge.tsx` and `ThesisStatusBadge.tsx`

### New Components Required
1. `server/services/decision/decisionDeltaEngine.ts`: Deterministic utility to calculate score and dimension deltas between two `InvestmentDecisionAssessment` instances.
2. `src/components/decision/DecisionTimelineView.tsx`: Interactive SVG/Recharts sparkline and milestone timeline rendering past assessment scores with quarterly markers.
3. `src/components/decision/DimensionDeltaModal.tsx`: Visual diff modal highlighting which of the 10 dimensions changed, showing metric deltas and guard status transitions.
4. `src/components/decision/MultiPeerComparisonGrid.tsx`: Tabular matrix comparing 3–10 selected securities across valuation multiples (P/E, EV/EBITDA, ROIC, FCF Yield) and decision scores.

### Data Requirements
* Leverages existing persisted decision records in `IDecisionRepository`.
* Uses existing fundamental metrics and market quotes from Twelve Data and SEC EDGAR.
* Zero new external data providers required.

### Provider Requirements
* No new API keys, credentials, or third-party subscriptions required.

### API Requirements
1. `GET /api/decisions/:securityId/timeline`: Returns array of historical assessments `{ asOfDate, compositeScore, overallAssessment, decisionId }` sorted chronologically.
2. `POST /api/decisions/delta`: Accepts `{ securityId, dateA, dateB }` and returns `{ scoreDelta, dimensionDeltas: [...], triggeredGuardDeltas: [...] }`.
3. `POST /api/decisions/peer-matrix`: Accepts `{ securityIds: string[] }` and returns unified array of `{ security, metrics, compositeScore, overallAssessment, dimensionsSummary }`.

### UI Requirements
* Scannable chronological timeline with clickable historical evaluation nodes.
* High-contrast green/red badge indicators for positive/negative dimension deltas.
* Filterable multi-peer grid with column sorting by market cap, P/E, ROIC, and decision score.

### Persistence Requirements
* Read-only utilization of existing `IDecisionRepository`.
* Preserves complete historical immutability (zero overwriting of past decision records).

### PIT (Point-in-Time) Requirements
* All historical comparisons must respect the `asOfDate` of each respective evaluation. Lookahead data is strictly excluded.

### Security Requirements
* Enforce multi-user authorization scoping on all custom saved comparisons.
* Maintain strict input validation on `securityIds` arrays to prevent injection or DoS via oversized arrays (cap at 10 peers).

### Test Requirements
* Unit tests for `decisionDeltaEngine` verifying exact mathematical difference calculations.
* Integration test verifying `GET /api/decisions/:securityId/timeline` returns chronologically sorted historical records.
* Regression verification ensuring 100% pass rate on Phase 20 (32 tests) and Phase 21 (42 tests).

### Risks & Mitigations
* **Risk**: Sparse historical data for newly tracked securities.
  * **Mitigation**: If only one assessment exists, the timeline displays a clean single-node state with an explanatory prompt to evaluate historical dates.
* **Risk**: Excessive peer comparison requests causing rate limits.
  * **Mitigation**: Cap peer comparison requests to a maximum of 10 securities and serve metrics from the existing `financialDataService` LRU cache.

### Success Criteria
1. An analyst can view a visual timeline of past decision scores for any canonical security.
2. An analyst can click any two dates on the timeline to see an immediate breakdown of which dimensions changed.
3. An analyst can select 3 to 10 peers and view a unified comparative valuation matrix in under 200ms from cache.
4. Zero regressions introduced; 100% of existing test suites pass.
