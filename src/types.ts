export type MarketRegion = 'US' | 'INDIA' | 'GLOBAL';
export type SupportedExchange = 'NASDAQ' | 'NYSE' | 'NSE' | 'BSE' | string;
export type AssetType = 'EQUITY' | 'ETF' | 'INDEX' | 'MUTUAL_FUND' | string;

export interface SecurityIdentifier {
  id: string;
  symbol: string;
  companyName: string;
  market: MarketRegion;
  exchange: SupportedExchange;
  country: string;
  currency: string;
  isin?: string | null;
  sector?: string;
  industry?: string;
  assetType?: AssetType;
}

export type ProvenanceTag =
  | 'FACT'
  | 'CALCULATION'
  | 'AI ANALYSIS'
  | 'RISK'
  | 'KEY CONCERN'
  | 'UNCERTAINTY'
  | 'SOURCE';

export type ThesisStatus =
  | 'Healthy'
  | 'Improving'
  | 'Watch'
  | 'Deteriorating'
  | 'Thesis Broken';

export interface EvidenceSource {
  id: string;
  type: 'SEC 10-K' | 'SEC 10-Q' | 'Earnings Transcript' | 'Investor Deck' | 'Expert Research' | 'Government Filing';
  title: string;
  sourceDoc: string;
  reportingDate: string;
  freshness: string;
  quote: string;
  confidence: number; // 0 to 100
  url?: string;
  verificationHash?: string;
  extractedPillar?: string;
}

export interface FactorBreakdown {
  growth: number;
  quality: number;
  valuation: number;
  risk: number;
  momentum: number;
}

export interface FactorWeights {
  growth: number;
  quality: number;
  valuation: number;
  risk: number;
  momentum: number;
}

export interface ThesisPillar {
  name: string;
  score: number;
  status: 'Strong' | 'Neutral' | 'Vulnerable';
  fact: string;
  calculation: string;
  aiAnalysis: string;
  uncertainty?: string;
  evidenceRef: string;
}

export interface ThesisBreaker {
  id: string;
  condition: string;
  threshold: string;
  currentStatus: string;
  status: 'Safe' | 'Warning' | 'Breached';
  probabilityEstimate: string;
  impactSeverity: 'High' | 'Severe' | 'Moderate';
}

export interface CommitteePerspective {
  role: 'Bull Case' | 'Base Case' | 'Bear Case' | 'Risk Analyst' | 'Final Assessment';
  author: string;
  conviction: 'High' | 'Moderate' | 'Speculative';
  summary: string;
  coreArguments: string[];
  keyVulnerability: string;
  confidenceScore: number;
}

export interface FinancialQuarter {
  period: string; // e.g., 'Q3 23', 'Q4 23', 'Q1 24', 'Q2 24', 'Q3 24'
  revenue: number; // in billions or millions
  grossMarginPct: number;
  operatingIncome: number;
  netIncome: number;
  freeCashFlow: number;
  capex: number;
}

export interface Stock {
  // Canonical Security Identifiers
  id?: string;
  symbol?: string;
  companyName?: string;
  market?: MarketRegion;
  country?: string;
  currency?: string;
  isin?: string | null;
  assetType?: AssetType;

  // Legacy & Display Identity (100% backward compatible)
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  marketCap: string;
  peRatio?: number | null;
  forwardPe?: number | null;
  psRatio?: number | null;
  evEbitda?: number | null;
  fcfYield?: number | null;
  dividendYield?: number | null;
  roic?: number | null;
  beta?: number | null;
  debtToEquity?: number | null;
  overallScore: number; // Overall Decision Score
  confidence: number; // e.g. 91%
  dataCompleteness: number; // e.g. 96%
  lastCalculated: string;
  dataFreshness: string;
  factorScores: FactorBreakdown;
  factorWeights: FactorWeights;
  rulesPassed: { passed: number; total: number };
  whyThisStock: string;
  aiInterpretation: string;
  keyConcern: string;
  thesisStatus: ThesisStatus;
  thesisOverview: string;
  thesisPillars: ThesisPillar[];
  thesisBreakers: ThesisBreaker[];
  aiCommittee: CommitteePerspective[];
  financialQuarters: FinancialQuarter[];
  portfolioFit: {
    correlation: number;
    sectorTechDelta: string;
    riskContributionPct: number;
    scenarioImpact: {
      rateHike100bps: string;
      recessionMild: string;
      techSelloff20Pct: string;
    };
  };
  evidenceSources: EvidenceSource[];
  secCik?: string;
  isSecGrounded?: boolean;
  retrievedAt?: string;
  realFinancialFacts?: FinancialFact[];
  recentFilings?: FilingRecord[];
}

export interface Holding {
  ticker: string;
  securityId?: string;
  market?: MarketRegion;
  exchange?: string;
  currency?: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  weightPct: number;
  totalReturnDollars: number;
  totalReturnPct: number;
  todayChangeDollars: number;
  todayChangePct: number;
  riskContributionPct: number;
  thesisStatus: ThesisStatus;
  sector: string;
}

export interface PortfolioData {
  nav: number;
  todayChange: number;
  todayChangePct: number;
  unrealizedReturn: number;
  unrealizedReturnPct: number;
  riskScore: number; // 0 - 100 (64 Moderate-Aggressive)
  riskLabel: string;
  diversificationScore: number; // 0 - 100 (78 Strong)
  diversificationLabel: string;
  baseCurrency?: string; // Default: 'USD'
  inrHoldings?: Holding[]; // Segregated INR positions (never combined into fake USD NAV)
  inrSummary?: {
    totalValue: number;
    totalCost: number;
    totalValueInr?: number;
    unrealizedReturnInr?: number;
    unrealizedReturnPct?: number;
    currency: 'INR';
    positionsCount: number;
  };
  metrics?: PortfolioMetrics;
  assetAllocation: {
    equitiesPct: number;
    fixedIncomePct: number;
    cashPct: number;
    alternativesPct: number;
  };
  sectorAllocation: { sector: string; percentage: number; color: string }[];
  geographicExposure: { region: string; percentage: number }[];
  holdings: Holding[];
  aiBriefing: {
    headline: string;
    aiAnalysis: string;
    calculationFact: string;
    riskObservation: string;
    uncertaintyNotice: string;
  };
}

export interface StrategyRule {
  category: 'Universe' | 'Entry Rule' | 'Exit Rule' | 'Position Sizing' | 'Rebalancing';
  description: string;
  parameters: string;
}

export interface BacktestTrade {
  id: string;
  tradeId?: string;
  backtestId?: string;
  securityId?: string;
  symbol?: string;
  ticker: string;
  date: string;
  timestamp?: string;
  signalTimestamp?: string;
  action: 'BUY' | 'SELL';
  side?: 'BUY' | 'SELL';
  shares: number;
  quantity?: number;
  price: number;
  requestedPrice?: number;
  executionPrice?: number;
  grossValue?: number;
  slippage?: number;
  transactionCost?: number;
  netValue?: number;
  signalId?: string;
  strategyId?: string;
  strategyVersion?: string;
  executionModel?: string;
  provenance?: PointInTimeProvenance;
  realizedPnL?: number;
  returnPct?: number;
  rationale?: string;
  holdingPeriodBars?: number;
}

export interface EquityPoint {
  timestamp?: string;
  date: string;
  cash?: number;
  positionsValue?: number;
  totalEquity?: number;
  equity?: number;
  strategy?: number;
  benchmark?: number;
  drawdown?: number;
  drawdownPct?: number;
}

export interface SimulatedPosition {
  securityId?: string;
  symbol: string;
  quantity: number;
  averageEntryPrice?: number;
  entryPrice?: number;
  currentPrice: number;
  marketValue: number;
  realizedPnL?: number;
  unrealizedPnL: number;
  unrealizedPnLPct?: number;
  weight?: number;
  weightPct?: number;
  currency: string;
}

export interface PerformanceAnalytics {
  totalReturn: number;
  totalReturnPct: number;
  cagr: number | null;
  annualizedVol: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  maxDrawdownDetails: {
    maxDrawdown: number;
    maxDrawdownPct: number;
    peakDate?: string;
    troughDate?: string;
    recoveryDate?: string;
    durationDays?: number;
  };
  drawdownSeries: DrawdownPoint[];
  periodReturns: number[];
  dailyReturnsCount: number;
  bestDayPct: number;
  worstDayPct: number;
  positiveDaysCount: number;
  negativeDaysCount: number;
  downsideDeviation: number;
}

export interface BacktestResult {
  id?: string;
  backtestId?: string;
  strategyId?: string;
  ownerUserId?: string;
  userId?: string;
  strategyTitle?: string;
  strategyVersion?: string;
  configuration?: BacktestConfiguration;
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'BLOCKED' | 'FAILED';
  dataStatus?: 'REAL' | 'SIMULATED' | 'UNAVAILABLE';
  startDate?: string;
  endDate?: string;
  initialCapital?: number;
  finalEquity?: number;
  period?: string;
  universe?: string;
  sizing?: string;
  rebalanceFrequency?: string;
  totalReturn: number;
  totalReturnPct?: number;
  cagr: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  annualizedVol: number;
  winRate: number;
  profitFactor?: number;
  totalTrades?: number;
  tradesCount: number;
  benchmarkTotalReturn: number;
  equityCurve: EquityPoint[];
  trades?: BacktestTrade[];
  tradeLog?: BacktestTrade[];
  positions?: SimulatedPosition[];
  monthlyReturns?: {
    year: number;
    months: number[];
    ytd: number;
  }[];
  warnings?: {
    overfittingRisk?: string;
    lookAheadBias?: string;
    survivorshipBias?: string;
    transactionCostImpact?: string;
    [key: string]: string | undefined;
  } | string[];
  dataQuality?: DataQualityStatus;
  provenance?: PointInTimeProvenance;
  epistemicStatus?: EpistemicStatus;
  totalRealizedPnL?: number;
  totalUnrealizedPnL?: number;
  totalTransactionCosts?: number;
  totalSlippageCost?: number;
  isAnalyticalOnly?: boolean;
  executionProhibited?: boolean;
  // Phase 12B Analytics extensions
  perfAnalytics?: PerformanceAnalytics;
  drawdownSeries?: DrawdownPoint[];
  maxDrawdownDetails?: {
    maxDrawdown: number;
    maxDrawdownPct: number;
    peakDate?: string;
    troughDate?: string;
    recoveryDate?: string;
    durationDays?: number;
  };
  tradeStatistics?: TradeStatistics;
  turnover?: TurnoverMetrics;
  exposureSeries?: ExposurePoint[];
  concentrationMetrics?: BacktestConcentrationMetrics;
  benchmarkResults?: BenchmarkComparisonResult;
  attribution?: SecurityAttribution[];
  limitations?: BacktestLimitations;
  report?: BacktestReport;
}

export interface DrawdownPoint {
  timestamp: string;
  equity: number;
  runningPeak: number;
  drawdown: number;
  drawdownPct: number;
}

export interface TradeStatistics {
  totalTrades: number;
  closedTrades: number;
  openPositions: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRate: number; // percentage 0 - 100
  lossRate: number;
  profitFactor: number | null; // null if gross losses === 0 or no losing trades
  averageWinningTrade: number;
  averageLosingTrade: number;
  winLossRatio: number | null;
  largestWin: number;
  largestLoss: number;
  averageHoldingPeriodBars: number;
  averageHoldingPeriodDays: number;
  grossProfits: number;
  grossLosses: number;
}

export interface TurnoverMetrics {
  grossTurnover: number; // total notional / initial capital
  annualizedTurnover: number;
  totalNotionalTraded: number;
  averageTradeSize: number;
}

export interface ExposurePoint {
  timestamp: string;
  grossExposure: number;
  netExposure: number;
  cashPercentage: number;
  investedPercentage: number;
  largestPositionPct: number;
  largestPositionSymbol: string;
  positionsCount: number;
}

export interface BacktestConcentrationMetrics {
  largestPositionWeight: number;
  largestPositionSymbol: string;
  top3Concentration: number;
  top5Concentration: number;
  herfindahlIndex: number;
  sectorConcentration: { sector: string; weightPct: number }[];
  marketConcentration: { market: MarketRegion; weightPct: number }[];
  maxSinglePositionPct?: number;
  top5ConcentrationPct?: number;
}

export interface BenchmarkComparisonResult {
  benchmarkSymbol: string;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'CALCULATED';
  benchmarkTotalReturn: number;
  strategyTotalReturn: number;
  excessReturn: number;
  annualizedBenchmarkReturn: number | null;
  annualizedExcessReturn: number | null;
  beta: number | null;
  correlation: number | null;
  trackingError: number | null;
  informationRatio: number | null;
  notes?: string;
  epistemicStatus?: EpistemicStatus;
}

export interface SecurityAttribution {
  securityId: string;
  symbol: string;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  pnlContributionPct: number;
  totalTrades: number;
  currency: string;
}

export interface BacktestLimitations {
  survivorshipBiasRisk: 'SURVIVORSHIP_BIAS_POSSIBLE' | 'CONTROLLED';
  delistingDataStatus: 'DELISTING_DATA_UNAVAILABLE' | 'DELISTING_ACCOUNTED';
  corporateActionsAdjustment: 'ADJUSTED' | 'UNADJUSTED';
  lookAheadBiasProtection: 'STRICT_POINT_IN_TIME';
  executionModelDescription: string;
  epistemicDisclaimer: string;
}

export interface BacktestReport {
  executiveSummary: {
    strategyName: string;
    strategyId: string;
    backtestId: string;
    period: string;
    totalReturnPct: number;
    cagr: number | null;
    sharpeRatio: number | null;
    maxDrawdownPct: number;
    winRate: number;
    profitFactor: number | null;
    finalEquity: number;
    initialCapital: number;
  };
  performance: {
    totalReturn: number;
    totalReturnPct: number;
    cagr: number | null;
    periodReturnsCount: number;
    bestDayPct: number;
    worstDayPct: number;
    positiveDaysCount: number;
    negativeDaysCount: number;
  };
  risk: {
    annualizedVolatility: number;
    sharpeRatio: number | null;
    sortinoRatio: number | null;
    maxDrawdown: number;
    maxDrawdownDetails: {
      maxDrawdownPct: number;
      peakDate?: string;
      troughDate?: string;
      recoveryDate?: string;
      durationDays?: number;
    };
    downsideDeviation: number;
  };
  trading: TradeStatistics & TurnoverMetrics;
  exposure: {
    averageInvestedPct: number;
    maxInvestedPct: number;
    averageCashPct: number;
    maxCashPct: number;
    peakPositionsCount: number;
  };
  benchmark: BenchmarkComparisonResult | null;
  dataQuality: {
    provider: string;
    market: MarketRegion;
    exchange: string;
    currency: string;
    startDate: string;
    endDate: string;
    totalBars: number;
    missingBars: number;
    corporateActionsAdjusted: boolean;
    dataStatus: 'REAL' | 'SIMULATED' | 'UNAVAILABLE';
    epistemicStatus: EpistemicStatus;
  };
  provenance: PointInTimeProvenance;
  warnings: string[];
  limitations: BacktestLimitations;
}

export interface Strategy {
  id: string;
  title: string;
  description: string;
  prompt: string;
  status: 'AI Generated Strategy' | 'Backtest Verified Strategy';
  targetUniverse: string;
  rebalanceFrequency: string;
  positionSizing?: string;
  exitRules?: string;
  rules: StrategyRule[];
  ownerUserId?: string;
  userId?: string;
  isBuiltIn?: boolean;
  lastRun?: string;
  backtestId?: string;
  quickMetrics?: {
    cagr?: string;
    sharpe?: string;
    maxDd?: string;
  };
  backtestResult?: BacktestResult;
}

export interface HoldingPosition {
  ticker: string; // backwards compatible symbol key
  shares: number; // shares count
  avgCost: number; // average cost per share
  name?: string;
  sector?: string;
  isCashEquivalent?: boolean;

  // Canonical Multi-Market additions
  securityId?: string;
  quantity?: number; // alias for shares
  averageCost?: number; // alias for avgCost
  currency?: string; // 'USD' | 'INR'
  market?: MarketRegion; // 'US' | 'INDIA' | 'GLOBAL'
  exchange?: string;
  ownerUserId?: string;
  userId?: string;
  positionId?: string;
  portfolioId?: string;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPnL?: number;
  unrealizedPnLPercent?: number;
  assetClass?: string;
  lastUpdated?: string;
}

export interface WatchlistItem {
  ticker: string;
  thesisStatus?: ThesisStatus;
  alertThreshold?: string;
}

export type CanonicalSecurity = SecurityIdentifier & Partial<Stock> & {
  canonicalId?: string;
  ticker?: string;
};

export interface AppState {
  securities: Record<string, Stock>;
  portfolio: PortfolioData;
  watchlist: string[];
  alerts: AlertItem[];
  strategies: Strategy[];
  backtests: Record<string, BacktestResult>;
  researchQueries: ResearchQueryItem[];
}

export interface AlertItem {
  id: string;
  type: 'portfolio' | 'company' | 'earnings' | 'news' | 'risk' | 'thesis' | string;
  ticker?: string;
  companyName?: string;
  title: string;
  whatChanged: string;
  whyItMatters: string;
  recommendedAction?: string;
  evidence: {
    source: string;
    filingDate: string;
    confidence: number;
  };
  timestamp: string;
  read?: boolean;
  isRead?: boolean;
  severity: 'critical' | 'warning' | 'info' | 'HIGH' | 'MEDIUM' | 'INFO' | string;
  provenanceType: ProvenanceTag;
  ownerUserId?: string;
  userId?: string;
}

export interface ResearchQueryItem {
  id: string;
  query: string;
  date: string;
  ticker?: string;
  ownerUserId?: string;
  userId?: string;
  answerSummary: string;
  groundedFacts: { statement: string; tag: ProvenanceTag; sourceIndex: number }[];
  sources: {
    id: string;
    name: string;
    docType: string;
    date: string;
    excerpt: string;
    confidence: number;
  }[];
}

export type ActiveScreen =
  | 'pilot-readiness'
  | 'command-center'
  | 'cross-investment'
  | 'scenario-intelligence'
  | 'counterfactual-intelligence'
  | 'research-memory'
  | 'investigation-planning'
  | 'evidence-ledger'
  | 'dashboard'
  | 'discover'
  | 'deep-dive'
  | 'portfolio'
  | 'strategies'
  | 'backtesting'
  | 'watchlist'
  | 'alerts'
  | 'research'
  | 'monitor';

export type EpistemicCategory = 'REAL' | 'CALCULATED' | 'SIMULATED' | 'AI_GENERATED';

export interface FinancialFact {
  ticker: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  periodStart?: string;
  periodEnd?: string;
  filedDate?: string;
  fiscalYear?: number | string;
  fiscalPeriod?: string;
  form?: string;
  accessionNumber?: string;
  primaryDocument?: string;
  sourceUrl?: string;
  source: string;
  sourceType: 'SEC_XBRL' | 'SEC_SUBMISSION' | 'CALCULATED' | 'SIMULATED';
  asOf: string;
  retrievedAt: string;
  isSimulated: boolean;
  epistemicCategory: EpistemicCategory;
  status: 'available' | 'unavailable';
  reason?: string;
}

export interface FilingRecord {
  ticker: string;
  form: string;
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  sourceUrl: string;
  description?: string;
  isSimulated: boolean;
  retrievedAt: string;
}

export type EpistemicStatus = 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';

export interface NormalizedQuote {
  ticker: string; // for backwards compatibility
  symbol: string;
  securityId: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: string;
  marketCap?: string;
  currency: string;
  market: MarketRegion;
  exchange: string;
  asOf: string;
  timestamp?: string;
  retrievedAt: string;
  provider: string;
  isSimulated: boolean;
  epistemicCategory: EpistemicCategory;
  epistemicStatus: EpistemicStatus;
  status: 'available' | 'unavailable';
  reason?: string;
}

export interface ProviderHealth {
  name: string;
  status:
    | 'Connected'
    | 'Throttled'
    | 'Error'
    | 'Unavailable'
    | 'Simulated'
    | 'UNCONFIGURED'
    | 'AUTHENTICATION_REQUIRED'
    | 'RATE_LIMITED'
    | 'CONNECTED'
    | 'ERROR'
    | 'UNAVAILABLE';
  lastSuccessfulRetrieval: string | null;
  dataFreshness: string;
  details?: string;
  isSimulated: boolean;
  provider?: string;
  market?: MarketRegion;
  checkedAt?: string;
  lastErrorCategory?: string | null;
  lastSuccessfulRequest?: string | null;
}

export interface DataSourcesHealth {
  secEdgar: ProviderHealth;
  marketData: ProviderHealth;
  usMarketData?: ProviderHealth;
  indiaMarketData?: ProviderHealth;
  fyersMarketData?: ProviderHealth;
  trueDataMarketData?: ProviderHealth;
}

// ==========================================
// MARKET PROVIDER & ROUTING INTERFACES
// ==========================================

export interface MarketDataRequest {
  securityId?: string;
  symbol: string;
  market?: MarketRegion;
  exchange?: SupportedExchange;
  currency?: string;
  provider?: string;
}

export interface MarketStatusRequest {
  market: MarketRegion;
  exchange?: string;
}

export interface MarketStatusResponse {
  market: MarketRegion;
  exchange: string;
  isOpen: boolean;
  timezone: string;
  session: 'PRE' | 'REGULAR' | 'POST' | 'CLOSED';
  status: 'CONNECTED' | 'SIMULATED' | 'UNCONFIGURED' | 'ERROR';
  retrievedAt?: string;
  provider?: string;
  epistemicStatus?: EpistemicStatus;
  isSimulated?: boolean;
}

// ==========================================
// HISTORICAL OHLCV MARKET DATA CONTRACT
// ==========================================

export interface HistoricalPriceBar {
  timestamp: string; // ISO-8601 or YYYY-MM-DD trading date
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose?: number;
  volume: number;
  currency?: string;
  securityId?: string;
  market?: MarketRegion;
  exchange?: string;
  provider?: string;
  epistemicStatus: EpistemicStatus;
  isSimulated?: boolean;
  corporateActionsAdjusted?: boolean;
  provenance?: PointInTimeProvenance;
}

export interface HistoricalPricesRequest {
  securityId?: string;
  symbol: string;
  market?: MarketRegion;
  exchange?: string;
  currency?: string;
  period?: '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX';
  interval?: '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo';
  startDate?: string;
  endDate?: string;
}

export interface HistoricalPricesResponse {
  securityId: string;
  symbol: string;
  market: MarketRegion;
  exchange: string;
  currency: string;
  interval?: string;
  bars: HistoricalPriceBar[];
  provider: string;
  retrievedAt?: string;
  epistemicStatus: EpistemicStatus;
  isSimulated: boolean;
  status: 'available' | 'unavailable';
  reason?: string;
}

// Legacy point representation kept for backward compatibility with existing components
export interface HistoricalPricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  currency: string;
  isSimulated: boolean;
}

// ==========================================
// CORPORATE ACTION CONTRACTS (PHASE 5A PREP)
// ==========================================

export type CorporateActionType =
  | 'STOCK_SPLIT'
  | 'DIVIDEND_CASH'
  | 'DIVIDEND_STOCK'
  | 'BONUS_ISSUE'
  | 'RIGHTS_ISSUE'
  | 'SPINOFF'
  | 'MERGER_ACQUISITION'
  | 'SYMBOL_CHANGE';

export interface BaseCorporateAction {
  id: string;
  securityId: string;
  symbol: string;
  market: MarketRegion;
  exchange: string;
  actionType: CorporateActionType;
  exDate: string; // YYYY-MM-DD
  recordDate?: string;
  effectiveDate: string;
  announcementDate?: string;
  currency?: string;
  description: string;
  epistemicStatus: EpistemicStatus;
  provider: string;
  verified: boolean;
  notes?: string;
}

export interface StockSplitAction extends BaseCorporateAction {
  actionType: 'STOCK_SPLIT';
  splitRatio: {
    numerator: number; // e.g. 10 for 10:1 split
    denominator: number; // e.g. 1
  };
}

export interface DividendAction extends BaseCorporateAction {
  actionType: 'DIVIDEND_CASH' | 'DIVIDEND_STOCK';
  dividendType?: 'REGULAR' | 'SPECIAL' | 'INTERIM' | 'FINAL';
  amountPerShare: number;
  currency: string;
}

export interface BonusIssueAction extends BaseCorporateAction {
  actionType: 'BONUS_ISSUE';
  bonusRatio: {
    bonusShares: number; // e.g. 1
    existingShares: number; // e.g. 1 (common on NSE/BSE)
  };
}

export interface RightsIssueAction extends BaseCorporateAction {
  actionType: 'RIGHTS_ISSUE';
  rightsRatio: {
    rightsShares: number;
    existingShares: number;
  };
  issuePrice: number;
  currency: string;
}

export interface MergerAction extends BaseCorporateAction {
  actionType: 'MERGER_ACQUISITION';
  acquirerSecurityId?: string;
  acquirerSymbol?: string;
  cashPerShare?: number;
  stockRatio?: {
    newShares: number;
    oldShares: number;
  };
}

export type CorporateAction =
  | StockSplitAction
  | DividendAction
  | BonusIssueAction
  | RightsIssueAction
  | MergerAction
  | BaseCorporateAction;

export interface CorporateActionsRequest {
  securityId?: string;
  symbol: string;
  market?: MarketRegion;
  startDate?: string;
  endDate?: string;
  actionTypes?: CorporateActionType[];
}

export interface CorporateActionsResponse {
  securityId: string;
  symbol: string;
  market: MarketRegion;
  actions: CorporateAction[];
  epistemicStatus: EpistemicStatus;
  provider: string;
  status: 'available' | 'unavailable';
  reason?: string;
}

export interface CorporateActionsProvider {
  getCorporateActions(request: CorporateActionsRequest): Promise<CorporateActionsResponse>;
}

// ==========================================
// POINT-IN-TIME DATA PROVENANCE (LOOK-AHEAD BIAS PREVENTION)
// ==========================================

export interface PointInTimeProvenance {
  dataTimestamp?: string; // Event date / market session time
  availableAt?: string; // Exact point-in-time publication / public dissemination date
  retrievedAt?: string; // System retrieval timestamp
  provider: string; // Source system / repository
  source?: string; // Specific source record (e.g. SEC accession number, exchange feed)
  epistemicStatus?: EpistemicStatus;
  isRestatement?: boolean;
  restatementDate?: string;
  notes?: string;
  asOf?: string;
  asOfDate?: string;
  sourceCount?: number;
  dataFrequency?: string;
  splitAdjusted?: boolean;
  dividendAdjusted?: boolean;
  lookAheadBiasChecked?: boolean;
  provenanceTag?: string;
  isSimulated?: boolean;
  pointInTimeStrict?: boolean;
  hasLookAheadBias?: boolean;
  sourceType?: string;
}

export interface PointInTimePriceBar extends HistoricalPriceBar {
  availableAt: string;
}

export interface PointInTimeFundamentalData {
  securityId: string;
  symbol: string;
  market: MarketRegion;
  periodEnd: string;
  filingDate: string;
  acceptanceDateTime: string; // Prevents look-ahead bias in backtests
  accessionNumber: string;
  facts: Record<string, number>;
  provenance: PointInTimeProvenance;
}

// ==========================================
// QUANTITATIVE STRATEGY ENGINE CONTRACTS (PHASE 5A PREP)
// ==========================================

export type StrategyFrequency = 'TICK' | 'MINUTE' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface IndicatorDefinition {
  id: string;
  name: string; // e.g., 'SMA', 'EMA', 'RSI', 'MACD', 'ROIC_RANK', 'FCF_YIELD', 'VOLATILITY'
  type: 'TECHNICAL' | 'FUNDAMENTAL' | 'COMPOSITE' | 'FACTOR';
  parameters: Record<string, number | string | boolean>;
  timeframe?: string;
  lookbackPeriods?: number;
}

export interface QuantStrategyRule {
  id: string;
  category: 'UNIVERSE' | 'ENTRY' | 'EXIT' | 'POSITION_SIZING' | 'REBALANCE' | 'RISK';
  name: string;
  condition: string; // e.g. "ROIC > 20% AND RSI(14) < 40"
  indicatorRefs?: string[];
  threshold?: number | string;
  operator?: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'CROSSES_ABOVE' | 'CROSSES_BELOW';
  action?: 'BUY' | 'SELL' | 'HOLD' | 'REDUCE' | 'CLOSE';
  priority?: number;
  weight?: number;
}

export interface PositionSizingRule {
  method:
    | 'EQUAL_WEIGHT'
    | 'VOLATILITY_WEIGHTED'
    | 'RISK_PARITY'
    | 'MARKET_CAP_WEIGHTED'
    | 'FACTOR_WEIGHTED'
    | 'FIXED_PERCENT'
    | 'KELLY_CRITERION';
  targetWeightPct?: number; // e.g. 5%
  targetPositionPct?: number; // Alias for targetWeightPct
  maxPositionWeightPct: number; // e.g. 10%
  minPositionWeightPct: number; // e.g. 1%
  cashReservePct?: number; // e.g. 5%
  parameters?: Record<string, unknown>;
}

export interface QuantitativeRiskConstraints {
  maxPositionWeightPct: number; // e.g. 10%
  maxPositionWeight?: number; // Alias for maxPositionWeightPct
  maxSectorWeightPct: number; // e.g. 25%
  maxSectorWeight?: number; // Alias for maxSectorWeightPct
  maxMarketWeightPct?: number;
  maxMarketWeight?: number;
  maxPortfolioExposurePct?: number;
  maxPortfolioExposure?: number;
  maxPositionCount?: number;
  maxPortfolioDrawdownPct?: number; // e.g. 15% circuit breaker
  maxAnnualizedVolatilityPct?: number; // e.g. 20%
  maxTurnoverPctAnnual?: number; // e.g. 200%
  minDailyLiquidityUSD?: number; // e.g. $5,000,000 ADTV
  minDailyLiquidityINR?: number; // e.g. ₹50,000,000 ADTV
  stopLossPct?: number; // e.g. 8% stop
  takeProfitPct?: number;
  maxLeverageRatio?: number; // default 1.0 (no leverage)
}

export interface PortfolioConstructionRule {
  maxHoldings?: number;
  minHoldings?: number;
  rebalanceFrequency: StrategyFrequency;
  rebalanceSchedule?: string; // e.g. 'FIRST_TRADING_DAY_OF_MONTH'
  allowShorting?: boolean;
  benchmarkSecurityId?: string; // 'us-spy' or 'in-nifty50'
  multiMarketPolicy?: 'SEPARATE_LEDGERS' | 'CROSS_MARKET'; // Strictly segregates USD & INR
  weightingScheme?: string;
}

export type ExecutionTimingModel = 
  | 'SIGNAL_ON_CLOSE_EXECUTE_NEXT_OPEN' 
  | 'SAME_BAR_CLOSE';

export interface TransactionCostConfig {
  type: 'PERCENT' | 'BPS' | 'FIXED';
  rate: number; // e.g. 0.0005 for 0.05%
  fixedPerTrade?: number; // e.g. 1.00 USD or 20.00 INR
  minCost?: number;
  currency?: string;
}

export interface SlippageConfig {
  type: 'PERCENT' | 'BPS';
  rate: number; // e.g. 0.0005 for 0.05%
}

export interface BacktestConfiguration {
  id?: string;
  backtestId?: string;
  strategyId: string;
  strategyVersion?: string;
  securityIds?: string[];
  symbols?: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  currency: string; // 'USD' | 'INR'
  baseCurrency?: string; // alias
  dataFrequency?: StrategyFrequency | string;
  executionTiming?: ExecutionTimingModel;
  rebalanceFrequency?: StrategyFrequency;
  riskConstraints?: QuantitativeRiskConstraints;
  positionSizing?: PositionSizingRule;
  transactionCost?: TransactionCostConfig;
  commissionPerTrade?: number;
  slippage?: SlippageConfig;
  slippageBps?: number;
  benchmarkSymbol?: string;
  benchmarkSecurityId?: string;
  corporateActionAdjustment?: 'ADJUSTED' | 'UNADJUSTED';
  includeCorporateActions?: boolean;
  isSimulatedBaseline?: boolean;
  allowShorting?: boolean;
}

export interface QuantStrategy {
  strategyId: string;
  name: string;
  version?: string; // Phase 11 strategy versioning (e.g., 'v1.0.0')
  description: string;
  universe: {
    markets: MarketRegion[];
    exchanges?: string[];
    sectors?: string[];
    minMarketCap?: number;
  };
  frequency: StrategyFrequency;
  indicators: IndicatorDefinition[];
  entryRules: QuantStrategyRule[];
  exitRules: QuantStrategyRule[];
  parameters?: Record<string, number | string | boolean>;
  positionSizing: PositionSizingRule;
  riskConstraints: QuantitativeRiskConstraints;
  portfolioConstruction: PortfolioConstructionRule;
  rebalanceSchedule: string;
  isDeterministic: boolean;
  backtestId?: string;
  ownerUserId?: string;
  userId?: string;
  isBuiltIn?: boolean;
}

// ==========================================
// ANALYTICAL SIGNAL MODEL (STRICT GUARDRAILS: NO BROKER EXECUTION)
// ==========================================

export type SignalDirection = 'BUY' | 'SELL' | 'HOLD' | 'NO_SIGNAL';
export type SignalType = 'ENTRY' | 'EXIT' | 'REBALANCE' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'RISK_OFF' | 'HOLD';

export interface AnalyticalSignal {
  id: string;
  securityId: string;
  symbol: string;
  market: MarketRegion;
  exchange: string;
  timestamp: string; // ISO format
  signalType: SignalType;
  direction: SignalDirection;
  strength: number; // 0.0 to 1.0
  targetWeight?: number;
  priceAtSignal?: number;
  currency?: string;
  reason: string;
  strategyId: string;
  strategyName?: string;
  ruleId?: string;
  provenance: PointInTimeProvenance;
  // Strict non-execution guardrails
  isAnalyticalOnly: true; // Explicit confirmation that this is strictly an analytical signal
  executionProhibited: true; // Hardcoded guardrail prohibiting automated broker order execution
}

// ==========================================
// FUNDAMENTAL + QUANTITATIVE COMBINATION ARCHITECTURE
// ==========================================

export interface FundamentalMetricsSummary {
  revenueGrowthYoY?: number;
  grossMarginPct?: number;
  operatingMarginPct?: number;
  roic?: number;
  fcfYield?: number;
  peRatio?: number;
  debtToEquity?: number;
  thesisStatus?: ThesisStatus;
  secGrounded: boolean;
}

export interface QuantFactorProfile {
  momentumScore: number;
  volatilityScore: number;
  trendStrength: number;
  relativeStrengthRank: number;
  betaToBenchmark?: number;
  sharpeContribution?: number;
}

export interface CompositeAssetEvaluation {
  securityId: string;
  symbol: string;
  market: MarketRegion;
  exchange: string;
  currency: string;
  fundamental: FundamentalMetricsSummary;
  quantitative: QuantFactorProfile;
  compositeScore: number;
  signals: AnalyticalSignal[];
  evaluatedAt: string;
  provenance: {
    fundamentalSource: string;
    marketDataSource: string;
    isSimulated: boolean;
    epistemicStatus: EpistemicStatus;
  };
}

// ==========================================
// FUTURE INDIA FUNDAMENTALS (EXTENSION POINTS - PHASE 5 PREP)
// ==========================================

export interface IndiaCorporateFiling {
  companyName: string;
  symbol: string;
  exchange: 'NSE' | 'BSE';
  category: 'Financial Result' | 'Corporate Action' | 'Shareholding Pattern' | 'Annual Report' | 'Board Meeting' | string;
  announcementDate: string;
  subject: string;
  attachmentUrl?: string;
}

export interface IndiaQuarterlyResult {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  quarterEnded: string;
  fiscalYear: string;
  fiscalQuarter: string;
  totalIncome?: number;
  netProfit?: number;
  eps?: number;
  ebitda?: number;
  isAudited: boolean;
}

export interface IndiaFundamentalsProvider {
  getQuarterlyResults?(symbol: string, exchange?: string): Promise<IndiaQuarterlyResult[]>;
  getFilings?(symbol: string, exchange?: string): Promise<IndiaCorporateFiling[]>;
  getShareholdingPattern?(symbol: string): Promise<Record<string, unknown>>;
  getHealthStatus(): ProviderHealth;
}

// ==========================================
// SEARCH & TICKER INTELLIGENCE TYPES (PHASE 6)
// ==========================================

export type SearchIntent =
  | 'SECURITY_LOOKUP'
  | 'RESEARCH_QUERY'
  | 'NAVIGATION'
  | 'UNKNOWN';

export type SearchMatchType =
  | 'EXACT_TICKER'
  | 'EXACT_CANONICAL_SYMBOL'
  | 'EXACT_COMPANY_NAME'
  | 'EXCHANGE_QUALIFIED'
  | 'PREFIX'
  | 'ALIAS'
  | 'FUZZY';

export interface SearchSecurityMatch {
  security: SecurityIdentifier;
  matchType: SearchMatchType;
  score: number;
  exchange: string;
  market: MarketRegion;
  currency: string;
}

export interface SearchResult {
  query: string;
  intent: SearchIntent;
  securities: SecurityIdentifier[];
  navigationTarget?: ActiveScreen;
  confidence: number;
  matches: SearchSecurityMatch[];
  message?: string;
}

// ==========================================
// RESEARCH & ANALYSIS ENGINE TYPES (PHASE 7A)
// ==========================================

export type ResearchAnalysisType =
  | 'GENERAL_ANALYSIS'
  | 'WHY_MOVED'
  | 'COMPANY_ANALYSIS'
  | 'COMPARISON'
  | 'FUNDAMENTALS'
  | 'FUNDAMENTAL_ANALYSIS'
  | 'RISK'
  | 'RISK_ANALYSIS'
  | 'PORTFOLIO_CONTEXT'
  | 'INVESTMENT_THESIS'
  | 'VALUATION'
  | 'GROWTH'
  | 'CATALYSTS'
  | 'COMPETITIVE_POSITION'
  | 'MANAGEMENT'
  | 'EARNINGS'
  | 'RECENT_CHANGES'
  | 'BULL_CASE'
  | 'BEAR_CASE'
  | 'PORTFOLIO_IMPACT'
  | 'QUANT_SIGNAL_EXPLANATION'
  | 'CUSTOM';

export type ResearchEpistemicClassification =
  | 'FACT'
  | 'INFERENCE'
  | 'UNCERTAINTY'
  | 'SIMULATED'
  | 'UNAVAILABLE';

export interface ResearchEvidenceItem {
  id: string;
  securityId?: string;
  symbol?: string;
  sourceType: EvidenceSourceType;
  provider: string;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated?: boolean;
  retrievedAt: string;
  description: string;
  filingDate?: string;
  accessionNumber?: string;
  data: Record<string, unknown> | null;
}

export interface ResearchSectionPoint {
  text: string;
  classification: ResearchEpistemicClassification;
  evidenceIds: string[];
}

export interface ResearchSection {
  heading: string;
  points: ResearchSectionPoint[];
}

export interface ResearchEvidenceReference {
  id: string;
  sourceType: EvidenceSourceType;
  provider: string;
  epistemicStatus: EvidenceEpistemicStatus;
  description: string;
  filingDate?: string;
  accessionNumber?: string;
}

export interface ResearchResponse {
  title: string;
  executiveSummary: string;
  conclusion: string;
  analysisType: ResearchAnalysisType;
  sections: ResearchSection[];
  keyRisks: string[];
  keyUnknowns: string[];
  evidenceReferences: ResearchEvidenceReference[];
  confidence: number;
  generatedAt: string;
  engineVersion: string;
  securities: SecurityIdentifier[];
  retrievalMetadata?: {
    retrievalMode: RetrievalMode;
    totalCandidates: number;
    retrievedCount: number;
    topSources: string[];
    conflictsCount?: number;
  };
}

export interface ResearchPortfolioHoldingContext {
  securityId: string;
  symbol: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  weightPct: number;
  unrealizedPnL: number;
}

export interface ResearchRequest {
  query: string;
  securities: SecurityIdentifier[];
  requestedAnalysisType: ResearchAnalysisType;
  availableEvidence: ResearchEvidenceItem[];
  asOfDate?: string;
  researchAsOfDate?: string;
  userId?: string;
  context?: {
    portfolioContext?: {
      holdings?: ResearchPortfolioHoldingContext[];
      totalNav?: number;
    };
    watchlistContext?: string[];
    quantitativeContext?: {
      signal?: string;
      strategyName?: string;
      epistemicStatus?: EpistemicStatus;
      metrics?: Record<string, any>;
      backtestSummary?: string;
      isSimulated?: boolean;
    };
  };
  retrievalMetadata?: {
    retrievalMode: RetrievalMode;
    totalCandidates: number;
    retrievedCount: number;
    topSources: string[];
    conflictsCount?: number;
  };
  conflicts?: RetrievalConflict[];
}

// ==========================================
// PHASE 8A: EVIDENCE FOUNDATION & RETRIEVAL ARCHITECTURE
// ==========================================

export type EvidenceSourceType =
  | 'SEC_EDGAR'
  | 'OFFICIAL_FILINGS'
  | 'MARKET_DATA'
  | 'PORTFOLIO'
  | 'CANONICAL_METADATA'
  | 'RESEARCH_DOCUMENT'
  | 'QUANTITATIVE'
  | 'FINMAGINE';

export type EvidenceEpistemicStatus =
  | 'REAL'
  | 'CALCULATED'
  | 'SIMULATED'
  | 'UNAVAILABLE'
  | 'ERROR';

export interface EvidenceSourceReference {
  url?: string;
  accessionNumber?: string;
  cik?: string;
  form?: string;
  concept?: string;
  exchange?: string;
  symbol?: string;
  calculationSource?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface EvidenceItem {
  evidenceId: string;
  securityId?: string;
  sourceType: EvidenceSourceType;
  provider: string;
  documentId?: string;
  documentType?: string;
  title: string;
  content: string;
  structuredValue?: number | string | Record<string, unknown> | null;
  unit?: string;
  currency?: string;
  publishedAt: string; // ISO-8601 string, publication or filing availability date
  filingDate?: string;
  periodStart?: string;
  periodEnd?: string;
  retrievedAt: string;
  availableAt?: string;
  fingerprint?: string;
  conceptKey?: string;
  qualityScore?: number;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  sourceReference?: EvidenceSourceReference;
  metadata?: Record<string, unknown>;
  hasConflict?: boolean;
  conflictDetails?: string;
  ownerUserId?: string;
  userId?: string;
}

export interface EvidenceFilter {
  securityId?: string;
  symbol?: string;
  sourceType?: EvidenceSourceType | EvidenceSourceType[];
  provider?: string | string[];
  documentType?: string;
  epistemicStatus?: EvidenceEpistemicStatus | EvidenceEpistemicStatus[];
  startDate?: string | Date;
  endDate?: string | Date;
  asOfDate?: string | Date;
  concept?: string;
  limit?: number;
}

export interface IEvidenceRepository {
  addEvidence(item: EvidenceItem): boolean;
  addEvidenceBatch(items: EvidenceItem[]): number;
  getEvidence(evidenceId: string): EvidenceItem | undefined;
  getEvidenceBySecurity(securityId: string): EvidenceItem[];
  getEvidenceBySource(sourceType: EvidenceSourceType): EvidenceItem[];
  getEvidenceAvailableAsOf(asOfDate: string | Date, filter?: EvidenceFilter): EvidenceItem[];
  queryEvidence(filter: EvidenceFilter): EvidenceItem[];
  query?(filter: EvidenceFilter): EvidenceItem[];
  removeEvidence(evidenceId: string): boolean;
  getAll(): EvidenceItem[];
  count(): number;
  clear(): void;
}

export interface EvidenceGatherOptions {
  securityIds?: string[];
  securities?: SecurityIdentifier[];
  asOfDate?: string | Date;
  portfolioContext?: {
    holdings?: ResearchPortfolioHoldingContext[];
    totalNav?: number;
    metrics?: PortfolioMetrics;
  };
  filter?: EvidenceFilter;
}

// ==========================================
// PHASE 8B: SEMANTIC RETRIEVAL & RAG CONTRACTS
// ==========================================

export type RetrievalMode = 'SEMANTIC' | 'DETERMINISTIC_FALLBACK';

export interface EvidenceQuery {
  query?: string;
  securityId?: string;
  securityIds?: string[];
  market?: MarketRegion;
  exchange?: string;
  sourceType?: EvidenceSourceType | EvidenceSourceType[];
  documentType?: string;
  epistemicStatus?: EvidenceEpistemicStatus | EvidenceEpistemicStatus[];
  startDate?: string | Date;
  endDate?: string | Date;
  asOfDate?: string | Date;
  limit?: number;
  minRelevanceScore?: number;
  userId?: string;
}

export interface EvidenceChunk {
  chunkId: string;
  evidenceId: string;
  securityId?: string;
  sourceType: EvidenceSourceType;
  provider: string;
  documentId?: string;
  documentType?: string;
  title: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  publishedAt: string;
  filingDate?: string;
  periodEnd?: string;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  sourceReference?: EvidenceSourceReference;
  hasConflict?: boolean;
  conflictDetails?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceEmbedding {
  chunkIdOrEvidenceId: string;
  vector: number[];
  model: string;
  dimensions: number;
  generatedAt: string;
}

export interface MatchSignal {
  signal: string;
  weight: number;
  description: string;
}

export interface EvidenceMatch {
  evidence: EvidenceItem;
  chunk?: EvidenceChunk;
  score: number;
  semanticScore?: number;
  deterministicScore: number;
  matchSignals: MatchSignal[];
  retrievalReason: string;
}

export type RetrievalFilter = EvidenceFilter;

export interface EmbeddingStatus {
  configured: boolean;
  model: string;
  status: 'ACTIVE' | 'UNAVAILABLE' | 'FALLBACK';
  message?: string;
}

export interface RetrievalConflict {
  evidenceId1: string;
  evidenceId2: string;
  details: string;
  provider1: string;
  provider2: string;
}

export interface RetrievalTrace {
  normalizedQuery: string;
  detectedSecurities: string[];
  appliedFilters: Record<string, unknown>;
  asOfDate?: string;
  totalRepositoryItems: number;
  candidatesAfterMetadataFilter: number;
  candidatesAfterPointInTime: number;
  retrievalMode: RetrievalMode;
  scoringDetails: {
    evidenceId: string;
    title: string;
    score: number;
    signals: string[];
    epistemicStatus: EvidenceEpistemicStatus;
  }[];
  diversityApplied: boolean;
  executionTimeMs: number;
}

export interface RetrievalResult {
  query: string;
  retrievalMode: RetrievalMode;
  matches: EvidenceMatch[];
  evidenceBundle: EvidenceItem[];
  chunks: EvidenceChunk[];
  totalCandidates: number;
  retrievalTrace: RetrievalTrace;
  conflicts: RetrievalConflict[];
  embeddingStatus: EmbeddingStatus;
}

export interface IRetrievalEngine {
  retrieve(query: EvidenceQuery): Promise<RetrievalResult>;
  getEmbeddingStatus(): EmbeddingStatus;
}

// ==========================================
// PHASE 9 — PORTFOLIO INTELLIGENCE CONTRACTS
// ==========================================

export interface EpistemicValue<T> {
  value: T | null;
  status: EvidenceEpistemicStatus;
  methodology?: string;
  underlyingSources?: string[];
  isSimulated?: boolean;
  notes?: string;
}

export interface PortfolioHoldingAnalytics {
  securityId: string;
  symbol: string;
  name: string;
  sector: string;
  market: MarketRegion;
  exchange: string;
  currency: string;
  shares: number;
  quantity: number;
  avgCost: number;
  averageCost: number;
  costBasis: number;
  currentPrice: number;
  marketValue: number;
  weight: number; // 0.0 to 1.0
  weightPct: number; // 0.0 to 100.0%
  unrealizedPnL: number;
  unrealizedReturnPct: number;
  dailyPriceChange: number;
  dailyPriceChangePct: number;
  dailyPnLContribution: number;
  dailyReturnContributionPct: number;
  beta: EpistemicValue<number>;
  volatility: EpistemicValue<number>;
  riskContributionPct: EpistemicValue<number>;
  marginalRiskContribution: EpistemicValue<number>;
  isCashEquivalent: boolean;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
}

export interface ConcentrationMetrics {
  largestPosition: {
    symbol: string;
    securityId?: string;
    weightPct: number;
    marketValue: number;
    currency: string;
  };
  top1WeightPct: number;
  top5WeightPct: number;
  top10WeightPct: number;
  remainingWeightPct: number;
  herfindahlHirschmanIndex: number; // Standard scale 0 - 10,000 (sum of weightPct^2)
  hhiNormalized: number; // 0.0 to 1.0 (sum of weightFraction^2)
  concentrationClassification?: 'HIGHLY_CONCENTRATED' | 'MODERATELY_CONCENTRATED' | 'DIVERSIFIED';
  status: EvidenceEpistemicStatus;
  observations: string[];
}

export interface SectorExposure {
  sector: string;
  marketValue: number;
  weightPct: number;
  positionCount: number;
  dailyPnLContribution: number;
  color: string;
  status: EvidenceEpistemicStatus;
}

export interface MarketExposure {
  market: MarketRegion;
  marketValue: number;
  weightPct: number;
  positionCount: number;
  exchanges: string[];
  dailyPnLContribution: number;
  currency: string;
  status: EvidenceEpistemicStatus;
}

export interface CurrencyExposure {
  currency: string;
  marketValueNative: number;
  weightPct: number;
  positionCount: number;
  isBaseCurrency: boolean;
  fxRateToBase: EpistemicValue<number>;
  marketValueBaseEquivalent: EpistemicValue<number>;
}

export interface PortfolioAttributionItem {
  symbol: string;
  securityId?: string;
  dailyPriceChange: number;
  dailyPriceChangePct: number;
  positionMarketValue: number;
  dailyPnLContribution: number;
  dailyReturnContributionPct: number;
}

export interface PortfolioPerformanceAnalytics {
  dailyPnL: EpistemicValue<number>;
  dailyReturnPct: EpistemicValue<number>;
  unrealizedPnL: EpistemicValue<number>;
  unrealizedReturnPct: EpistemicValue<number>;
  return1D: EpistemicValue<number>;
  return1W: EpistemicValue<number>;
  return1M: EpistemicValue<number>;
  topPositiveContributors: PortfolioAttributionItem[];
  topNegativeContributors: PortfolioAttributionItem[];
}

export interface PortfolioRiskAnalytics {
  portfolioBeta: EpistemicValue<number>;
  portfolioVolatility: EpistemicValue<number>;
  covarianceMatrix: EpistemicValue<number[][]>;
  correlationMatrix: EpistemicValue<number[][]>;
  securitySymbols: string[];
  marginalContributionToRisk: EpistemicValue<Record<string, number>>;
  percentageContributionToRisk: EpistemicValue<Record<string, number>>;
  peakPortfolioValue: EpistemicValue<number>;
  currentDrawdown: EpistemicValue<number>;
  maxDrawdown: EpistemicValue<number>;
}

export interface PortfolioMetrics {
  portfolioId: string;
  asOfDate: string;
  baseCurrency: string;
  totalValue: number;
  investedValue: number;
  cashValue: number;
  positionCount: number;
  weightsReconciled: boolean;
  sumWeights: number;
  isCrossCurrencySegregated: boolean;
  positions: PortfolioHoldingAnalytics[];
  concentration: ConcentrationMetrics;
  sectorExposure: SectorExposure[];
  marketExposure: MarketExposure[];
  currencyExposure: CurrencyExposure[];
  performance: PortfolioPerformanceAnalytics;
  risk: PortfolioRiskAnalytics;
  segregatedBuckets?: Record<string, {
    currency: string;
    totalValueNative: number;
    totalCostNative: number;
    unrealizedPnLNative: number;
    positionsCount: number;
    positions: PortfolioHoldingAnalytics[];
  }>;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
}

export type PortfolioQuestionIntent =
  | 'DRIVERS'
  | 'CONCENTRATION'
  | 'RISK'
  | 'SECTOR'
  | 'MARKET_REGION'
  | 'CURRENCY'
  | 'CHANGE'
  | 'PERFORMANCE'
  | 'DIVERSIFICATION'
  | 'GENERAL';

export interface PortfolioCalculationOptions {
  baseCurrency?: string;
  asOfDate?: string;
  portfolioId?: string;
}

export interface PortfolioAnalysisRequest {
  query: string;
  portfolioId?: string;
  asOfDate?: string;
  portfolioContext?: {
    holdings?: ResearchPortfolioHoldingContext[];
    totalNav?: number;
    metrics?: PortfolioMetrics;
  };
}

export interface PortfolioAnalysisResponse {
  query: string;
  intent: PortfolioQuestionIntent;
  deterministicFacts: {
    nav: number;
    baseCurrency: string;
    dailyPnL: number;
    dailyReturnPct: number;
    unrealizedPnL: number;
    topHoldings: { symbol: string; weightPct: number; pnl: number }[];
    exposures: {
      sectors: Record<string, number>;
      markets: Record<string, number>;
      currencies: Record<string, number>;
    };
    concentration: {
      top1WeightPct: number;
      top5WeightPct: number;
      hhi: number;
    };
    risk: {
      portfolioBeta: number | null;
      topRiskContributors: { symbol: string; riskPct: number }[];
    };
    attribution: {
      topGainers: string[];
      topLosers: string[];
    };
  };
  retrievedEvidence: ResearchEvidenceItem[];
  explanation: {
    headline: string;
    facts: string[];
    inferences: string[];
    uncertainties: string[];
    simulatedNotices: string[];
    unavailableNotices: string[];
    narrative: string;
  };
  causalityDisclaimer: string;
  timestamp: string;
}

// ==========================================
// PHASE 10 — WATCHLIST & ALERT INTELLIGENCE
// ==========================================

export type AlertRuleType =
  // Price rules
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'PRICE_CROSSES_ABOVE'
  | 'PRICE_CROSSES_BELOW'
  // Percentage move rules
  | 'DAILY_CHANGE'
  | 'DAILY_CHANGE_ABOVE'
  | 'DAILY_CHANGE_BELOW'
  | 'DAILY_CHANGE_ABSOLUTE_ABOVE'
  // Volume rules
  | 'VOLUME'
  | 'VOLUME_ABOVE'
  | 'VOLUME_MULTIPLE_OF_AVERAGE'
  // Daily range rules
  | 'DAILY_HIGH'
  | 'DAILY_LOW'
  // Portfolio rules (using Phase 9 analytics)
  | 'PORTFOLIO_LOSS'
  | 'PORTFOLIO_DAILY_LOSS_ABOVE'
  | 'DRAWDOWN'
  | 'PORTFOLIO_DRAWDOWN_ABOVE'
  | 'POSITION_WEIGHT'
  | 'POSITION_WEIGHT_ABOVE'
  | 'SECTOR_WEIGHT'
  | 'SECTOR_WEIGHT_ABOVE'
  | 'RISK_CONTRIBUTION'
  | 'RISK_CONTRIBUTION_ABOVE'
  // Research & disclosure rules
  | 'SEC_FILING'
  | 'NEW_SEC_FILING'
  | 'MATERIAL_FINANCIAL_CHANGE'
  | 'MATERIAL_INVESTMENT_EVENT'
  | 'EVIDENCE_CONFLICT'
  | 'THESIS_INVALIDATION'
  | 'THESIS_INVALIDATED'
  | 'THESIS_RECOVERY'
  | 'THESIS_RECOVERED'
  | 'RESEARCH_SNAPSHOT_CHANGE'
  | 'RESEARCH_SNAPSHOT_CHANGED'
  // Phase 27: Monitor Intelligence orchestration rules
  | 'THESIS_CHANGE'
  | 'DECISION_CHANGE'
  | 'EVIDENCE_CHANGE'
  | 'RISK_CHANGE'
  | 'CATALYST_CHANGE'
  | 'INVALIDATION_CHANGE'
  | 'QUANT_CHANGE'
  | 'VALUATION_CHANGE'
  | 'PORTFOLIO_CHANGE'
  | 'DATA_QUALITY_CHANGE';

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertPriority = 'INFO' | 'WARNING' | 'CRITICAL';

export type AlertComparison =
  | '>'
  | '>='
  | '<'
  | '<='
  | '=='
  | 'CROSSES_ABOVE'
  | 'CROSSES_BELOW'
  | 'CONTAINS';

export interface CanonicalWatchlistItem {
  watchlistItemId: string;
  securityId: string;
  symbol: string;
  companyName: string;
  market: MarketRegion;
  exchange: string;
  currency: string;
  provider: string;
  addedAt: string;
  enabled: boolean;
  notes?: string;
  alertRuleIds: string[];
  ticker?: string; // backwards compatibility alias
  ownerUserId?: string;
  userId?: string;
}

export interface AlertRule {
  alertRuleId: string;
  securityId?: string; // Canonical security ID (e.g. 'us-nvda', 'in-reliance')
  portfolioId?: string; // For portfolio-level alerts
  symbol?: string;
  alertType: AlertRuleType;
  threshold: number | string;
  comparison: AlertComparison;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  cooldownMinutes: number; // e.g. 60
  lastTriggeredAt: string | null;
  lastObservedValue: number | string | null;
  previousObservedValue?: number | string | null;
  priority: AlertPriority;
  metadata?: Record<string, unknown>;
  ownerUserId?: string;
  userId?: string;
}

export interface AlertEvaluation {
  triggered: boolean;
  alertRuleId: string;
  securityId?: string;
  portfolioId?: string;
  symbol?: string;
  observedValue: number | string | null;
  threshold: number | string;
  comparison: string;
  evaluatedAt: string;
  epistemicStatus: 'REAL' | 'SIMULATED' | 'CALCULATED' | 'UNAVAILABLE' | 'STALE';
  isSimulated: boolean;
  provider: string;
  market?: string;
  exchange?: string;
  currency?: string;
  reason: string;
  fingerprint?: string;
  provenance: {
    retrievedAt: string;
    asOf?: string;
    sourceReference?: string;
    quoteTimestamp?: string;
  };
}

export interface AlertEvent {
  eventId: string;
  alertRuleId: string;
  securityId?: string;
  portfolioId?: string;
  symbol?: string;
  companyName?: string;
  alertType: AlertRuleType;
  priority: AlertPriority;
  observedValue: number | string;
  threshold: number | string;
  triggeredAt: string;
  epistemicStatus: 'REAL' | 'SIMULATED' | 'CALCULATED' | 'UNAVAILABLE';
  isSimulated: boolean;
  provider: string;
  market?: string;
  exchange?: string;
  currency?: string;
  reason: string;
  provenance: {
    retrievedAt: string;
    asOf?: string;
    sourceReference?: string;
    quoteTimestamp?: string;
  };
  contextualAnalysis?: string | null;
  contextualConfidence?: number;
  isRead: boolean;
  isAcknowledged: boolean;
  fingerprint: string;
  previousState?: string;
  currentState?: string;
  transitionTimestamp?: string;
  evidenceIds?: string[];
  decisionId?: string;
  thesisSnapshotId?: string;
  conditionId?: string;
  filingAccession?: string;
  filingType?: string;
  filingDate?: string;
  ownerUserId?: string;
  userId?: string;
}

export interface WatchlistAlertState {
  watchlist: CanonicalWatchlistItem[];
  rules: AlertRule[];
  events: AlertEvent[];
  lastEvaluatedAt: string | null;
}

// ==========================================
// PHASE 11: QUANTITATIVE STRATEGY ENGINE CONTRACTS
// ==========================================

export type DataQualityStatus = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT' | 'INVALID';

export interface DataValidationResult {
  isValid: boolean;
  quality: DataQualityStatus;
  barCount: number;
  errors: string[];
  warnings: string[];
  chronological: boolean;
  hasDuplicates: boolean;
  hasMissingFields: boolean;
  startRange?: string;
  endRange?: string;
}

export type IndicatorType =
  | 'SMA'
  | 'EMA'
  | 'RSI'
  | 'MOMENTUM'
  | 'ROC'
  | 'VOLATILITY'
  | 'HIGHEST_HIGH'
  | 'LOWEST_LOW'
  | 'AVERAGE_VOLUME'
  | 'VOLUME_RATIO'
  | 'ATR'
  | 'CUSTOM';

export interface CalculatedIndicator {
  indicatorId: string;
  name: string;
  type: IndicatorType;
  parameters: Record<string, number | string | boolean>;
  timestamp: string; // Evaluation bar timestamp
  value: number | null; // null if insufficient data / unavailable
  previousValue?: number | null;
  history?: (number | null)[];
  dataWindow: {
    startTimestamp: string;
    endTimestamp: string;
    barCount: number;
    requiredBars: number;
  };
  sourceSecurity: {
    securityId: string;
    symbol: string;
    market: MarketRegion;
    exchange: string;
  };
  provider: string;
  epistemicStatus: EpistemicStatus;
  calculationMethod: string;
  version: string;
  status: 'VALID' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE' | 'INVALID_DATA';
  reason?: string;
}

export type RuleComparisonOperator =
  | 'GREATER_THAN'
  | '>'
  | 'GREATER_THAN_OR_EQUAL'
  | '>='
  | 'LESS_THAN'
  | '<'
  | 'LESS_THAN_OR_EQUAL'
  | '<='
  | 'EQUAL'
  | '=='
  | 'CROSS_ABOVE'
  | 'CROSS_BELOW';

export type RuleCombinator = 'AND' | 'OR' | 'NOT';

export interface RuleOperand {
  type: 'INDICATOR' | 'PRICE' | 'VOLUME' | 'CONSTANT' | 'CALCULATED_VALUE';
  reference?: string; // indicator ID or name
  field?: 'close' | 'open' | 'high' | 'low' | 'volume';
  value?: number; // constant threshold
}

export interface StructuredStrategyRule {
  id: string;
  category: 'ENTRY' | 'EXIT' | 'FILTER' | 'RISK' | 'REBALANCE';
  name: string;
  leftOperand: RuleOperand;
  operator: RuleComparisonOperator;
  rightOperand: RuleOperand;
  combinator?: RuleCombinator;
  subRules?: StructuredStrategyRule[];
  action?: 'BUY' | 'SELL' | 'HOLD';
  priority?: number;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  operator: RuleComparisonOperator;
  currentLeftValue: number | null;
  currentRightValue: number | null;
  previousLeftValue?: number | null;
  previousRightValue?: number | null;
  explanation: string;
}

export interface PositionSizingResult {
  method: PositionSizingRule['method'];
  rawWeightPct: number;
  boundedWeightPct: number;
  targetWeightPct: number; // post risk constraint adjustments
  shares?: number;
  capitalAllocation?: number;
  isConstrained: boolean;
  explanation: string;
}

export interface RiskConstraintEvaluationResult {
  constraintId: string;
  constraintType:
    | 'MAX_POSITION_WEIGHT'
    | 'MAX_SECTOR_WEIGHT'
    | 'MAX_MARKET_WEIGHT'
    | 'MAX_PORTFOLIO_EXPOSURE'
    | 'MAX_POSITION_COUNT'
    | 'STOP_LOSS'
    | 'TAKE_PROFIT';
  passed: boolean;
  observedValue: number;
  limit: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  explanation: string;
  adjustedWeightPct?: number;
}

export interface StrategyEvaluationOptions {
  strategyId?: string;
  strategy?: QuantStrategy;
  securityId?: string;
  symbol?: string;
  market?: MarketRegion;
  exchange?: string;
  currency?: string;
  bars?: HistoricalPriceBar[]; // Caller can supply bars directly (for testing / backtest replay)
  asOfDate?: string; // Point-in-time boundary: evaluate only data <= asOfDate
  parameters?: Record<string, number | string | boolean>; // Parameter overrides
  portfolioContext?: {
    totalPortfolioValue?: number;
    currentHoldings?: {
      securityId: string;
      symbol: string;
      weightPct: number;
      sector?: string;
      market?: MarketRegion;
    }[];
    cashReservePct?: number;
  };
  dryRun?: boolean;
}

export interface StrategyEvaluationResult {
  strategyId: string;
  strategyName: string;
  strategyVersion: string;
  securityId: string;
  symbol: string;
  market: MarketRegion;
  exchange: string;
  currency: string;
  evaluatedAt: string;
  asOfDate: string;
  dataQuality: DataQualityStatus;
  dataValidation: DataValidationResult;
  indicators: Record<string, CalculatedIndicator>;
  ruleEvaluations: RuleEvaluationResult[];
  signal: AnalyticalSignal;
  positionSizing: PositionSizingResult;
  riskConstraints: RiskConstraintEvaluationResult[];
  targetPosition: {
    securityId: string;
    symbol: string;
    direction: SignalDirection;
    requestedWeightPct: number;
    constrainedWeightPct: number;
    isConstrained: boolean;
    currency: string;
  };
  epistemicStatus: EpistemicStatus;
  provider: string;
  provenance: PointInTimeProvenance;
  warnings: string[];
  auditTrail: {
    timestamp: string;
    reason: string;
    indicatorSnapshots: Record<string, { current: number | null; previous: number | null }>;
    ruleOutcomes: { ruleId: string; passed: boolean; explanation: string }[];
  };
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 13: INVESTMENT RESEARCH NOTEBOOK & RESEARCH INTELLIGENCE
// ==========================================

export type ResearchQueryType =
  | 'INVESTMENT_THESIS'
  | 'FUNDAMENTAL_ANALYSIS'
  | 'VALUATION'
  | 'GROWTH'
  | 'RISK'
  | 'CATALYSTS'
  | 'COMPETITIVE_POSITION'
  | 'MANAGEMENT'
  | 'EARNINGS'
  | 'RECENT_CHANGES'
  | 'BULL_CASE'
  | 'BEAR_CASE'
  | 'PORTFOLIO_IMPACT'
  | 'QUANT_SIGNAL_EXPLANATION'
  | 'CUSTOM';

export type ResearchClaimClassification =
  | 'FACT'
  | 'INFERENCE'
  | 'UNCERTAINTY'
  | 'SIMULATED'
  | 'UNAVAILABLE';

export interface ResearchClaim {
  claimId: string;
  statement: string;
  classification: ResearchClaimClassification;
  confidence: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  asOfDate: string;
  provenance?: PointInTimeProvenance | EvidenceSourceReference;
}

export interface ResearchRisk {
  riskId: string;
  title: string;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceIds: string[];
  confidence: number;
  asOfDate?: string;
}

export interface ResearchCatalyst {
  catalystId: string;
  title: string;
  description: string;
  hasEvidence: boolean;
  evidenceIds: string[];
  isUncertainty: boolean;
}

export interface SourceCoverage {
  availableSources: string[];
  missingSources: string[];
  unavailableProviders: string[];
  latestSourceDate: string | null;
  oldestSourceDate: string | null;
  sourceCount: number;
  evidenceCount: number;
  status: 'HIGH_EVIDENCE_COVERAGE' | 'MODERATE_EVIDENCE_COVERAGE' | 'LIMITED_EVIDENCE_COVERAGE' | 'INSUFFICIENT_EVIDENCE';
}

export interface ResearchSourceItem {
  sourceId: string;
  securityId: string;
  sourceType: EvidenceSourceType;
  provider: string;
  title: string;
  documentType?: string;
  publishedAt: string;
  filingDate?: string;
  retrievedAt: string;
  sourceReference?: EvidenceSourceReference;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  availabilityStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'LIMITED';
}

export interface InvestmentThesis {
  executiveThesis: string;
  bullCase: {
    summary: string;
    points: string[];
    evidenceIds: string[];
    claims?: ResearchClaim[];
  };
  bearCase: {
    summary: string;
    points: string[];
    evidenceIds: string[];
    claims?: ResearchClaim[];
  };
  catalysts: ResearchCatalyst[];
  risks: ResearchRisk[];
  whatChanged: {
    status: string;
    hasPriorSnapshot: boolean;
    changes: string[];
    newEvidenceCount: number;
    previousSnapshotDate?: string | null;
    newDocumentCount?: number;
    newChunkCount?: number;
    thesisImpact?: {
      bullCase: 'Strengthened' | 'Unchanged' | 'Weakened';
      bearCase: 'Strengthened' | 'Unchanged' | 'Weakened';
      summary: string;
    };
    newRisks?: string[];
    newCatalysts?: string[];
    evidenceCoverageDelta?: string;
  };
  evidenceGaps: {
    available: string[];
    missing: string[];
    unavailable: string[];
  };
  contradictions: {
    topic: string;
    sideA: string;
    sideB: string;
    evidenceIdsA: string[];
    evidenceIdsB: string[];
  }[];
  quantitativeContext?: {
    signal?: string;
    strategyName?: string;
    epistemicStatus?: EpistemicStatus;
    metrics?: Record<string, any>;
    backtestSummary?: string;
    isSimulated?: boolean;
  };
  portfolioContext?: {
    isHeld: boolean;
    positionWeight?: number;
    riskContribution?: number;
    shares?: number;
    currency?: string;
  };
  thesisInvalidationConditions: string[];
  confidenceCoverage: 'HIGH_EVIDENCE_COVERAGE' | 'MODERATE_EVIDENCE_COVERAGE' | 'LIMITED_EVIDENCE_COVERAGE' | 'INSUFFICIENT_EVIDENCE';
}

export interface ResearchNotebook {
  notebookId: string;
  securityId: string;
  symbol: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
  evidenceCount: number;
  lastResearchDate: string | null;
  researchAsOfDate: string | null;
  sourceCoverage: SourceCoverage;
  provenance: PointInTimeProvenance;
  ownerUserId?: string;
  userId?: string;
}

export interface ResearchSnapshot {
  snapshotId: string;
  notebookId: string;
  securityId: string;
  createdAt: string;
  researchAsOfDate: string;
  evidenceIds: string[];
  queryType?: ResearchQueryType;
  query?: string;
  thesis: InvestmentThesis;
  claims: ResearchClaim[];
  risks: ResearchRisk[];
  catalysts: ResearchCatalyst[];
  conflicts: RetrievalConflict[];
  evidenceGaps: {
    available: string[];
    missing: string[];
    unavailable: string[];
  };
  ownerUserId?: string;
  userId?: string;
}

export interface ResearchNotebookResponse {
  notebook: ResearchNotebook;
  sources: ResearchSourceItem[];
  snapshots: ResearchSnapshot[];
  activeSnapshot?: ResearchSnapshot | null;
}

// ==========================================
// PHASE 14: RESEARCH DOCUMENT INTELLIGENCE & USER-GROUNDED RAG
// ==========================================

export type DocumentProcessingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export type SupportedDocumentFormat =
  | 'PDF'
  | 'TXT'
  | 'MARKDOWN'
  | 'CSV'
  | 'UNSUPPORTED';

export type ResearchDocumentType =
  | 'ANALYST_NOTE'
  | 'BROKER_REPORT'
  | 'EARNINGS_CALL_TRANSCRIPT'
  | 'INDUSTRY_REPORT'
  | 'INTERNAL_MEMO'
  | 'VALUATION_MODEL'
  | 'SEC_DISCLOSURE'
  | 'OTHER'
  | string;

export interface ResearchDocument {
  documentId: string;
  id?: string;
  securityId?: string;
  title: string;
  fileName: string;
  format?: string;
  author?: string;
  publisher?: string;
  documentDate?: string;
  tags?: string[];
  documentType: ResearchDocumentType;
  sourceType: 'RESEARCH_DOCUMENT';
  provider: string;
  publishedAt?: string;
  availableFrom?: string;
  uploadedAt: string;
  uploadedBy?: string;
  ownerUserId?: string;
  userId?: string;
  pageCount?: number;
  characterCount?: number;
  rowCount?: number;
  contentHash: string;
  epistemicStatus: 'REAL' | 'UNAVAILABLE' | 'ERROR' | EvidenceEpistemicStatus;
  epistemicDefault?: EvidenceEpistemicStatus;
  status?: string;
  isSimulated: boolean;
  processingStatus: DocumentProcessingStatus;
  extractionWarnings?: string[];
  evidenceIds?: string[];
  extractedEvidenceIds?: string[];
  chunkIds?: string[];
  chunkCount?: number;
  evidenceCount?: number;
  metadata?: Record<string, unknown>;
}

export interface DocumentUploadRequest {
  title?: string;
  fileName: string;
  securityId?: string;
  provider?: string;
  author?: string;
  publisher?: string;
  documentDate?: string;
  tags?: string[];
  epistemicDefault?: EvidenceEpistemicStatus;
  publishedAt?: string;
  availableFrom?: string;
  fileContentBase64?: string;
  fileText?: string;
  fileContent?: string;
  documentType?: ResearchDocumentType;
  uploadedBy?: string;
  ownerUserId?: string;
  userId?: string;
}

export interface DocumentUploadResult {
  document: ResearchDocument;
  evidenceItemsCount: number;
  chunksCount: number;
  evidenceCount?: number;
  chunkCount?: number;
  pageCount?: number;
  rowCount?: number;
  warnings?: string[];
  extractionWarnings: string[];
  isDuplicate: boolean;
}

export interface DocumentRegistryStats {
  totalDocuments: number;
  readyDocuments: number;
  failedDocuments: number;
  totalEvidenceItems: number;
  totalChunks: number;
  documentsBySecurity: Record<string, number>;
  documentsByType: Record<string, number>;
}

export type ResearchSourceFilter =
  | 'ALL'
  | 'OFFICIAL_FILINGS'
  | 'MARKET_DATA'
  | 'RESEARCH_DOCUMENTS'
  | 'PORTFOLIO'
  | 'QUANTITATIVE';

// ============================================================================
// PHASE 15: INVESTMENT DECISION INTELLIGENCE TYPES
// ============================================================================

export type DecisionOverallAssessment =
  | 'POSITIVE'
  | 'CONSTRUCTIVE'
  | 'NEUTRAL'
  | 'CAUTIOUS'
  | 'NEGATIVE'
  | 'INSUFFICIENT_EVIDENCE';

export type DecisionConviction =
  | 'HIGH'
  | 'MODERATE'
  | 'LOW'
  | 'INSUFFICIENT';

export type DecisionDimensionKey =
  | 'fundamentalQuality'
  | 'growthTrend'
  | 'valuationContext'
  | 'marketTrend'
  | 'quantitativeSignal'
  | 'backtestContext'
  | 'riskProfile'
  | 'portfolioFit'
  | 'evidenceCoverage'
  | 'thesisStatus';

export interface DecisionDimensionAssessment {
  dimension: DecisionDimensionKey;
  dimensionName: string;
  assessment: string; // e.g. 'STRONG', 'POSITIVE', 'ELEVATED', 'BULLISH', 'MIXED', 'SUPPORTIVE', 'CAUTIOUS', etc.
  category: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'CAUTIOUS' | 'INSUFFICIENT';
  score: number; // normalized [-1.0 to 1.0]
  weight: number; // relative weight in overall assessment
  rationale: string;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  dataStatus: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE' | 'MIXED';
  limitations?: string[];
  metrics?: Record<string, string | number | boolean | null | string[]>;
}

export interface DecisionInvalidationCondition {
  conditionId: string;
  category: 'FUNDAMENTAL' | 'VALUATION' | 'TECHNICAL' | 'PORTFOLIO' | 'FILING' | 'CATALYST';
  condition: string;
  threshold?: string;
  measurable: boolean;
  falsifiable: boolean;
  triggered: boolean;
  status: 'ACTIVE_GUARD' | 'TRIGGERED' | 'NOT_APPLICABLE';
  evidenceIds?: string[];
}

export interface DecisionKeyRisk {
  riskId: string;
  title: string;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  evidenceIds: string[];
}

export interface DecisionCatalyst {
  catalystId: string;
  title: string;
  description: string;
  type: 'DISCLOSED' | 'FORWARD_LOOKING';
  timeline?: string;
  evidenceIds: string[];
}

export interface DecisionFrameworkConfiguration {
  version: string;
  fundamentalWeight: number;
  growthWeight: number;
  valuationWeight: number;
  marketTrendWeight: number;
  quantitativeWeight: number;
  backtestWeight: number;
  riskWeight: number;
  portfolioFitWeight: number;
  evidenceCoverageWeight?: number;
  thesisStatusWeight?: number;
  minimumEvidenceThreshold: number;
}

export interface InvestmentDecisionAssessment {
  decisionId: string;
  securityId: string;
  canonicalSecurity: CanonicalSecurity;
  asOfDate: string;
  generatedAt: string;
  frameworkVersion: string;
  overallAssessment: DecisionOverallAssessment;
  conviction: DecisionConviction;
  compositeScore: number;
  dimensionAssessments: Record<DecisionDimensionKey, DecisionDimensionAssessment>;
  dimensionsList: DecisionDimensionAssessment[];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  ownerUserId?: string;
  userId?: string;
  evidenceCoverage: {
    rating: 'HIGH' | 'MODERATE' | 'LIMITED' | 'INSUFFICIENT';
    totalEvidenceCount: number;
    availableCategories: string[];
    missingCategories: string[];
    details: string;
  };
  keyDrivers: string[];
  counterEvidence: string[];
  keyRisks: DecisionKeyRisk[];
  catalysts: DecisionCatalyst[];
  thesisStatus: {
    status: 'STRENGTHENING' | 'STABLE' | 'WEAKENING' | 'INVALIDATED' | 'NO_PRIOR_THESIS' | 'INSUFFICIENT_EVIDENCE';
    notebookId?: string;
    snapshotId?: string;
    summary: string;
  };
  invalidationConditions: DecisionInvalidationCondition[];
  portfolioContext: {
    isHeld: boolean;
    currentWeightPct?: number;
    shares?: number;
    marketValue?: number;
    unrealizedPnLPct?: number;
    portfolioBetaContribution?: number;
    sectorWeightPct?: number;
    marginalRiskRating: 'FAVORABLE' | 'NEUTRAL' | 'CONSTRAINED' | 'HIGH_CONCENTRATION' | 'NOT_HELD';
    implication: string;
  };
  quantitativeContext: {
    compositeSignal: 'BUY' | 'HOLD' | 'SELL' | 'MIXED' | 'UNAVAILABLE';
    strategiesEvaluated: Array<{
      strategyId: string;
      strategyName: string;
      signal: 'BUY' | 'HOLD' | 'SELL' | 'NEUTRAL';
      indicatorValues: Record<string, number | string>;
      signalTimestamp: string;
      epistemicStatus: 'REAL' | 'CALCULATED' | 'SIMULATED';
    }>;
    agreement: 'UNANIMOUS' | 'MAJORITY' | 'MIXED' | 'INSUFFICIENT';
    summary: string;
  };
  valuationContext: {
    status: 'ATTRACTIVE' | 'FAIR' | 'ELEVATED' | 'EXTREME' | 'INSUFFICIENT_EVIDENCE' | 'UNAVAILABLE';
    peRatio?: number | null;
    priceToSales?: number | null;
    priceToFCF?: number | null;
    evToEbitda?: number | null;
    earningsYield?: number | null;
    availableMetrics: string[];
    missingMetrics: string[];
    rationale: string;
  };
  fundamentalContext: {
    status: 'STRONG' | 'STABLE' | 'WEAK' | 'DETERIORATING' | 'INSUFFICIENT_EVIDENCE';
    revenueTrend?: 'GROWING' | 'FLAT' | 'DECLINING' | 'UNKNOWN';
    operatingMarginTrend?: 'EXPANDING' | 'STABLE' | 'CONTRACTING' | 'UNKNOWN';
    netIncomeTrend?: 'GROWING' | 'FLAT' | 'DECLINING' | 'UNKNOWN';
    operatingCashFlowTrend?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNKNOWN';
    availablePeriodsCount: number;
    summary: string;
  };
  marketContext: {
    currentPrice: number;
    currency: string;
    trend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'UNKNOWN';
    aboveSma50?: boolean | null;
    aboveSma200?: boolean | null;
    momentumPercent?: number | null;
    annualizedVolatility?: number | null;
    maxDrawdownPercent?: number | null;
    provider: string;
    epistemicStatus: 'REAL' | 'SIMULATED' | 'CALCULATED' | 'UNAVAILABLE';
  };
  backtestContext?: {
    status: 'SUPPORTIVE' | 'NEUTRAL' | 'UNFAVORABLE' | 'HISTORICAL_SIMULATION_ONLY' | 'UNAVAILABLE';
    strategyName?: string;
    sharpeRatio?: number | null;
    cagr?: number | null;
    maxDrawdown?: number | null;
    winRate?: number | null;
    profitFactor?: number | null;
    disclaimer: string;
  };
  dataQuality: {
    providerStatuses: Record<string, string>;
    dataFreshness: string;
    hasSimulatedData: boolean;
    hasStaleData: boolean;
    missingSources: string[];
    conflictingSources: Array<{
      concept: string;
      primarySource: string;
      conflictingSource: string;
    }>;
    epistemicSummary: Record<'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE', number>;
  };
  explanation: {
    summary: string;
    whyDrivers: string[];
    counterEvidence: string[];
    keyRisksSummary: string[];
    portfolioImplicationSummary: string;
    invalidationSummary: string[];
    disclaimer: string;
    generatedBy: 'DETERMINISTIC_RULES' | 'GEMINI_ENRICHED' | 'DETERMINISTIC_FALLBACK';
  };
  limitations: string[];
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface SecurityDecisionComparison {
  comparisonId: string;
  asOfDate: string;
  generatedAt: string;
  securityA: InvestmentDecisionAssessment;
  securityB: InvestmentDecisionAssessment;
  dimensionComparisons: Array<{
    dimension: DecisionDimensionKey;
    dimensionName: string;
    securityAAssessment: string;
    securityBAssessment: string;
    advantage: 'SECURITY_A' | 'SECURITY_B' | 'TIED' | 'INCOMPARABLE';
    reason: string;
  }>;
  overallAdvantage: 'SECURITY_A' | 'SECURITY_B' | 'BALANCED' | 'INSUFFICIENT_EVIDENCE';
  summary: string;
  disclaimer: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface DecisionEvaluateRequest {
  securityId: string;
  asOfDate?: string;
  configuration?: Partial<DecisionFrameworkConfiguration>;
  forceRefresh?: boolean;
}

export interface DecisionCompareRequest {
  securityIdA: string;
  securityIdB: string;
  asOfDate?: string;
  configuration?: Partial<DecisionFrameworkConfiguration>;
}

// ==========================================
// PHASE 16: PERSISTENCE & AUDIT ARCHITECTURE
// ==========================================

export type PersistenceStatusCode = 'CONNECTED' | 'DEVELOPMENT_ADAPTER' | 'UNCONFIGURED' | 'ERROR';
export type PersistenceProviderType = 'POSTGRES' | 'DISK_STORAGE' | 'IN_MEMORY';

export interface PersistenceStatusResponse {
  status: PersistenceStatusCode;
  provider: PersistenceProviderType;
  environment: string;
  isPostgresConfigured: boolean;
  migrationVersion: number;
  entityCounts: {
    securities: number;
    documents: number;
    evidence: number;
    notebooks: number;
    snapshots: number;
    decisions: number;
    strategies: number;
    backtests: number;
    alerts: number;
    queries: number;
    events?: number;
    monitors?: number;
    reviews?: number;
    policies?: number;
    orchestratedAlerts?: number;
    researchPriorities?: number;
    researchMemories?: number;
    researchQuestions?: number;
    researchGaps?: number;
    investigationPlans?: number;
    investigationAudits?: number;
  };
  details: {
    diskBacked: boolean;
    storagePath?: string;
    schemaVersion: string;
    lastPersistedAt?: string;
  };
}

// ==========================================
// PHASE 17: AUTHENTICATION, AUTHORIZATION & USER DATA ISOLATION
// ==========================================

export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface User {
  userId: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface SafeUser {
  userId: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  ipAddress?: string;
  userAgent?: string;
  isValid: boolean;
}

export interface AuthResponse {
  authenticated: boolean;
  user: SafeUser | null;
  session?: {
    sessionId: string;
    expiresAt: string;
  };
  message?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ==========================================
// PHASE 18: FINMAGINE SUPPLEMENTAL RESEARCH PROVIDER & PRODUCTION HARDENING
// ==========================================

export type FinmagineHealthCode =
  | 'UNCONFIGURED'
  | 'AUTHENTICATION_REQUIRED'
  | 'CONNECTED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'ERROR';

export interface FinmagineCapabilities {
  companyProfile: boolean;
  fundamentals: boolean;
  financialRatios: boolean;
  valuation: boolean;
  momentum: boolean;
  earnings: boolean;
  screening: boolean;
}

export interface FinmagineHealthStatus {
  provider: 'Finmagine';
  status: FinmagineHealthCode;
  marketCoverage: ('US' | 'INDIA')[];
  isSimulated: boolean;
  lastChecked: string;
  capabilities: FinmagineCapabilities;
  message?: string;
}

export interface FinmagineCompanyProfile {
  symbol: string;
  companyName: string;
  exchange: string;
  country: string;
  sector?: string;
  industry?: string;
  description?: string;
  marketCap?: number;
  currency?: string;
  employees?: number;
  website?: string;
  ceo?: string;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  retrievedAt: string;
  asOfDate?: string;
}

export interface FinmagineFinancialRatios {
  symbol: string;
  market: 'US' | 'INDIA';
  peRatio?: number;
  pbRatio?: number;
  psRatio?: number;
  evToEbitda?: number;
  debtToEquity?: number;
  currentRatio?: number;
  quickRatio?: number;
  roe?: number;
  roa?: number;
  grossMarginPct?: number;
  operatingMarginPct?: number;
  netMarginPct?: number;
  dividendYieldPct?: number;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  retrievedAt: string;
  asOfDate?: string;
}

export interface FinmagineValuation {
  symbol: string;
  market: 'US' | 'INDIA';
  valuationScore?: number;
  dcfValue?: number;
  discountToIntrinsicPct?: number;
  historicalPeRange?: { min: number; max: number; median: number };
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  retrievedAt: string;
  asOfDate?: string;
}

export interface FinmagineMomentum {
  symbol: string;
  market: 'US' | 'INDIA';
  rsi14?: number;
  sma50?: number;
  sma200?: number;
  momentumScore?: number;
  relStrengthVsIndex?: number;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  retrievedAt: string;
  asOfDate?: string;
}

export interface FinmagineAnnualItem {
  fiscalYear: number;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  eps?: number;
  freeCashFlow?: number;
}

export interface FinmagineQuarterlyItem {
  period: string;
  revenue?: number;
  netIncome?: number;
  eps?: number;
}

export interface FinmagineFundamentals {
  symbol: string;
  market: 'US' | 'INDIA';
  annualFinancials?: FinmagineAnnualItem[];
  quarterlyFinancials?: FinmagineQuarterlyItem[];
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  retrievedAt: string;
  asOfDate?: string;
}

export interface FinmagineEarnings {
  symbol: string;
  market: 'US' | 'INDIA';
  lastEarningsDate?: string;
  nextEarningsDate?: string;
  epsConsensus?: number;
  epsActual?: number;
  epsSurprisePct?: number;
  revenueConsensus?: number;
  revenueActual?: number;
  epistemicStatus: EvidenceEpistemicStatus;
  isSimulated: boolean;
  retrievedAt: string;
  asOfDate?: string;
}

export interface FinmagineScreenMatch {
  symbol: string;
  companyName: string;
  marketCap?: number;
  peRatio?: number;
  sector?: string;
}

export interface FinmagineScreenResult {
  matches: FinmagineScreenMatch[];
  totalCount: number;
  retrievedAt: string;
  isSimulated: boolean;
  epistemicStatus: EvidenceEpistemicStatus;
}

// ==========================================
// PHASE 23 — DECISION TIMELINE, DELTA & MULTI-PEER
// ==========================================

export type DimensionDeltaClassification =
  | 'IMPROVED'
  | 'DECLINED'
  | 'UNCHANGED'
  | 'NEW'
  | 'REMOVED'
  | 'UNAVAILABLE';

export interface DimensionDeltaItem {
  dimension: DecisionDimensionKey;
  dimensionName: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number;
  assessmentBefore?: string;
  assessmentAfter?: string;
  classification: DimensionDeltaClassification;
  rationaleChange?: string;
}

export interface DecisionDelta {
  securityId: string;
  fromDecisionId: string;
  toDecisionId: string;
  fromAsOfDate: string;
  toAsOfDate: string;
  overallScoreBefore: number;
  overallScoreAfter: number;
  overallScoreDelta: number;
  assessmentBefore: DecisionOverallAssessment;
  assessmentAfter: DecisionOverallAssessment;
  convictionBefore: DecisionConviction;
  convictionAfter: DecisionConviction;
  dimensionDeltas: DimensionDeltaItem[];
  changedDrivers: {
    added: string[];
    removed: string[];
    retained: string[];
  };
  changedRisks: {
    added: DecisionKeyRisk[];
    removed: DecisionKeyRisk[];
    retained: DecisionKeyRisk[];
  };
  changedCatalysts: {
    added: DecisionCatalyst[];
    removed: DecisionCatalyst[];
    retained: DecisionCatalyst[];
  };
  thesisStatusBefore: string;
  thesisStatusAfter: string;
  invalidationChanges: Array<{
    conditionId: string;
    condition: string;
    statusBefore: 'ACTIVE_GUARD' | 'TRIGGERED' | 'NOT_APPLICABLE';
    statusAfter: 'ACTIVE_GUARD' | 'TRIGGERED' | 'NOT_APPLICABLE';
    transition: 'TRIGGERED' | 'RECOVERED' | 'UNCHANGED';
  }>;
  evidenceCoverageBefore: {
    rating: 'HIGH' | 'MODERATE' | 'LIMITED' | 'INSUFFICIENT';
    totalEvidenceCount: number;
  };
  evidenceCoverageAfter: {
    rating: 'HIGH' | 'MODERATE' | 'LIMITED' | 'INSUFFICIENT';
    totalEvidenceCount: number;
  };
  evidenceChanges: {
    totalDelta: number;
    addedCategories: string[];
    removedCategories: string[];
  };
  generatedAt: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface DecisionTimelineMilestone {
  decisionId: string;
  securityId: string;
  asOfDate: string;
  generatedAt: string;
  compositeScore: number;
  overallAssessment: DecisionOverallAssessment;
  conviction: DecisionConviction;
  thesisStatus: string;
  invalidationStatus: {
    totalConditions: number;
    activeGuards: number;
    triggeredGuards: number;
  };
  evidenceCoverage: {
    rating: string;
    totalEvidenceCount: number;
  };
  topDrivers: string[];
  frameworkVersion: string;
}

export interface DecisionTimelineResponse {
  securityId: string;
  canonicalSecurity: CanonicalSecurity | SecurityIdentifier;
  milestones: DecisionTimelineMilestone[];
  totalMilestones: number;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface MultiPeerComparisonRequest {
  securityIds: string[];
  asOfDate?: string;
  configuration?: Partial<DecisionFrameworkConfiguration>;
}

export interface PeerComparisonSecurityData {
  identity: {
    securityId: string;
    canonicalId: string;
    ticker: string;
    companyName: string;
    market: MarketRegion;
    exchange: string;
    currency: string;
    sector: string;
    industry: string;
  };
  fundamentals: {
    revenue: number | null;
    revenueGrowth: number | null;
    netIncome: number | null;
    operatingMargin: number | null;
    freeCashFlow: number | null;
    fcfYield: number | null;
    roic: number | null;
    status: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';
  };
  valuation: {
    peRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    priceToFCF: number | null;
    valuationStatus: string;
    status: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';
  };
  market: {
    price: number | null;
    dailyChange: number | null;
    dailyChangePercent: number | null;
    trend: string;
    momentumPercent: number | null;
    aboveSma50: boolean | null;
    aboveSma200: boolean | null;
    status: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';
  };
  quant: {
    compositeSignal: 'BUY' | 'HOLD' | 'SELL' | 'MIXED' | 'UNAVAILABLE';
    signalTimestamp?: string;
    isAnalyticalOnly: true;
    status: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';
  };
  risk: {
    beta: number | null;
    annualizedVolatility: number | null;
    maxDrawdownPercent: number | null;
    status: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';
  };
  decision: {
    decisionId: string;
    compositeScore: number;
    overallAssessment: DecisionOverallAssessment;
    conviction: DecisionConviction;
    thesisStatus: string;
    evidenceCoverageRating: string;
    totalEvidenceCount: number;
    dimensionsSummary: Record<DecisionDimensionKey, {
      score: number;
      assessment: string;
      category: string;
    }>;
  };
  dimensionScores?: Record<string, number>;
  epistemicStatus: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';
}

export interface MultiPeerComparisonResult {
  comparisonId: string;
  asOfDate: string;
  generatedAt: string;
  peers: PeerComparisonSecurityData[];
  securities?: PeerComparisonSecurityData[];
  totalPeers: number;
  totalSecurities?: number;
  marketsRepresented: MarketRegion[];
  summary: string;
  analyticalSummary?: string;
  medianScores?: {
    compositeScore?: number;
    peRatio?: number;
    psRatio?: number;
    evEbitda?: number;
  };
  rankings?: Array<{
    securityId: string;
    ticker: string;
    compositeScore: number;
    rank: number;
  }>;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 24: INVESTMENT EVENT INTELLIGENCE
// ==========================================

export type InvestmentEventType =
  | 'SEC_FILING'
  | 'RESEARCH_SNAPSHOT_CHANGE'
  | 'THESIS_INVALIDATION'
  | 'THESIS_RECOVERY'
  | 'EARNINGS_EVENT'
  | 'CORPORATE_ACTION'
  | 'MARKET_EVENT'
  | 'PROVIDER_DATA_CHANGE';

export type ThesisImpactArea =
  | 'BULL_CASE'
  | 'BEAR_CASE'
  | 'CATALYST'
  | 'RISK'
  | 'INVALIDATION_CONDITION'
  | 'EVIDENCE_GAP';

export interface EventSignificance {
  affectsThesis: 'YES' | 'NO' | 'UNKNOWN';
  affectsDecision: 'YES' | 'NO' | 'UNKNOWN';
  affectsPortfolio: 'YES' | 'NO' | 'UNKNOWN';
  affectsEvidenceCoverage: 'YES' | 'NO' | 'UNKNOWN';
  affectsInvalidationState: 'YES' | 'NO' | 'UNKNOWN';
  overallScore?: number;
}

export interface InvestmentEvent {
  eventId: string;
  securityId: string;
  ticker?: string;
  market: MarketRegion; // 'US' | 'INDIA'
  exchange: string;
  eventType: InvestmentEventType;
  eventDate: string; // YYYY-MM-DD
  announcedAt: string; // ISO
  availableAt: string; // ISO - critical for point-in-time
  sourceType: string;
  sourceReference: string;
  evidenceIds: string[];
  epistemicStatus: EpistemicStatus;
  isSimulated: boolean;
  title: string;
  summary: string;
  structuredData?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  currentState?: Record<string, unknown>;
  affectedDimensions?: string[];
  affectedThesisAreas?: ThesisImpactArea[];
  affectedDecisionId?: string;
  affectedSnapshotId?: string;
  significance?: EventSignificance;
  eventTimestamp?: string;
  createdAt: string;
}

export interface DecisionImpactSummary {
  hasSubsequentDecision: boolean;
  decisionBefore?: {
    decisionId: string;
    asOfDate: string;
    compositeScore: number;
    conviction: string;
    rating: string;
    thesisStatus?: string;
    dimensionScores: Record<string, number>;
  } | null;
  decisionAfter?: {
    decisionId: string;
    asOfDate: string;
    compositeScore: number;
    conviction: string;
    rating: string;
    thesisStatus?: string;
    dimensionScores: Record<string, number>;
  } | null;
  scoreDelta?: number;
  convictionChange?: string;
  ratingChange?: string;
  dimensionDeltas?: Record<string, number>;
  narrative: string;
}

export interface ThesisImpactSummary {
  affectedAreas: ThesisImpactArea[];
  relatedEvidenceIds: string[];
  invalidationTriggered?: boolean;
  invalidationConditionId?: string;
  details: Array<{
    area: ThesisImpactArea;
    label: string;
    evidenceSnippet?: string;
    impactDescription: string;
  }>;
  narrative: string;
}

export interface ResearchImpactSummary {
  hasSnapshotComparison: boolean;
  snapshotBeforeId?: string | null;
  snapshotAfterId?: string | null;
  changedClaimsCount: number;
  changedRisksCount: number;
  changedCatalystsCount: number;
  coverageDelta: number;
  narrative: string;
}

export interface PortfolioImpactSummary {
  hasExposure: boolean;
  portfolioId?: string;
  shares?: number;
  weightPct?: number;
  sector?: string;
  currency?: string;
  unrealizedPnL?: number;
  narrative: string;
}

export interface InvestmentEventImpact {
  eventId: string;
  securityId: string;
  event: InvestmentEvent;
  asOfDate: string;
  whatHappened: {
    title: string;
    summary: string;
    structuredDataDelta: Record<string, { previous?: any; current?: any; delta?: any }>;
  };
  whatChanged: {
    decision: DecisionImpactSummary;
    thesis: ThesisImpactSummary;
    research: ResearchImpactSummary;
    portfolio: PortfolioImpactSummary;
  };
  significance: EventSignificance;
  explanation: {
    summary: string;
    source: 'DETERMINISTIC' | 'AI_EXPLANATION';
    causalChain: string[];
  };
  epistemicStatus: EpistemicStatus;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface InvestmentEventTimeline {
  securityId: string;
  market: MarketRegion;
  asOfDate: string;
  events: InvestmentEvent[];
  totalEvents: number;
  availableSources: string[];
  epistemicStatus: EpistemicStatus;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 25: INVESTMENT MONITOR & THESIS HEALTH
// ==========================================

export type InvestmentMonitorStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type ReviewCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'EVENT_DRIVEN';

export type MonitorChangeCategory =
  | 'THESIS_CHANGE'
  | 'DECISION_CHANGE'
  | 'EVENT_CHANGE'
  | 'EVIDENCE_CHANGE'
  | 'RISK_CHANGE'
  | 'CATALYST_CHANGE'
  | 'INVALIDATION_CHANGE'
  | 'QUANT_CHANGE'
  | 'VALUATION_CHANGE'
  | 'PORTFOLIO_CHANGE'
  | 'DATA_QUALITY_CHANGE'
  | 'EVENT'
  | 'EVIDENCE'
  | 'DECISION'
  | 'THESIS'
  | 'INVALIDATION'
  | 'PORTFOLIO'
  | 'VALUATION'
  | 'QUANT'
  | 'DATA_QUALITY';

export type ThesisBullCaseState = 'STRENGTHENED' | 'UNCHANGED' | 'WEAKENED' | 'INSUFFICIENT_EVIDENCE';
export type ThesisBearCaseState = 'STRENGTHENED' | 'UNCHANGED' | 'WEAKENED' | 'INSUFFICIENT_EVIDENCE';
export type ThesisCatalystState = 'NEW' | 'ACTIVE' | 'CHANGED' | 'RESOLVED' | 'UNKNOWN';
export type ThesisRiskState = 'NEW' | 'INCREASED' | 'UNCHANGED' | 'DECREASED' | 'RESOLVED' | 'UNKNOWN';
export type ThesisInvalidationState = 'ACTIVE_GUARD' | 'TRIGGERED' | 'RECOVERED' | 'UNKNOWN';

export interface ThesisHealthReport {
  overallHealth?: 'HEALTHY' | 'WEAKENED' | 'INVALIDATED' | 'STRENGTHENED';
  bullCaseState: ThesisBullCaseState;
  bearCaseState: ThesisBearCaseState;
  catalystState?: ThesisCatalystState;
  riskState?: ThesisRiskState;
  invalidationState: ThesisInvalidationState;
  invalidationTriggered?: boolean;
  activeRisksCount?: number;
  activeCatalystsCount?: number;
  supportingEvidenceIds?: string[];
  narrative?: string;
  // Extended UI / analytics fields
  healthScore?: number;
  healthScoreDelta?: number;
  overallStatus?: string;
  bullCaseStatus?: string;
  bearCaseStatus?: string;
  invalidationStatus?: string;
  invalidationConditionsCount?: number;
  triggeredConditionsCount?: number;
  summary?: string;
  lastEvaluatedAt?: string;
  catalysts?: Array<{ catalystId: string; description: string; state: string }>;
  risks?: Array<{ riskId: string; description: string; state: string; severity?: string }>;
  invalidationGuards?: Array<{ conditionId: string; description: string; state: string; triggerEvidence?: string }>;
}

export interface MonitorChangeItem {
  changeId: string;
  category: MonitorChangeCategory;
  before?: any;
  after?: any;
  delta?: any;
  evidenceIds?: string[];
  sourceReferences?: string[];
  epistemicStatus?: EpistemicStatus;
  availableAt?: string;
  description: string;
  title?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO';
  direction?: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  isActionable?: boolean;
  requiresReview?: boolean;
  timestamp?: string;
  evidenceId?: string;
  eventId?: string;
  diff?: {
    previousValue?: any;
    currentValue?: any;
    delta?: any;
    unit?: string;
  };
}

export interface AnalystReviewNote {
  noteId: string;
  monitorId: string;
  reviewId?: string;
  userId: string;
  authorName: string;
  createdAt: string;
  content: string;
  label: 'USER NOTE';
  isImmutable: true;
}

export interface InvestmentMonitor {
  monitorId: string;
  userId: string;
  ownerUserId: string;
  securityId: string;
  ticker: string;
  companyName: string;
  market: MarketRegion;
  status: InvestmentMonitorStatus;
  reviewCadence: ReviewCadence;
  createdAt: string;
  updatedAt: string;
  lastReviewedAt: string | null;
  lastReviewId?: string | null;

  // Baseline references (captured at creation, immutable)
  baselineDecisionId?: string | null;
  baselineSnapshotId?: string | null;
  baselineEventTimestamp?: string | null;
  baselineCompositeScore?: number;
  baselineRating?: string;
  baselineThesisStatus?: string;

  // Latest known state
  latestDecisionId?: string | null;
  latestSnapshotId?: string | null;
  latestEventTimestamp?: string | null;
  latestCompositeScore?: number;
  latestRating?: string;

  thesisStatus?: string;
  invalidationStatus: ThesisInvalidationState;
  invalidationGuards?: any[];
  portfolioExposure: {
    hasExposure: boolean;
    shares?: number;
    weightPct?: number;
    currency?: string;
    sector?: string;
    unrealizedPnL?: number;
  };
  lastChangeSummary?: string;
  lastReviewAction?: MonitorReviewAction;
  epistemicStatus: EpistemicStatus;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export type MonitorReviewAction = 'ACKNOWLEDGE' | 'REVIEWED' | 'FOLLOW_UP_REQUIRED' | 'THESIS_REASSESSMENT_REQUIRED';

export interface InvestmentMonitorReview {
  reviewId: string;
  monitorId: string;
  userId: string;
  ownerUserId: string;
  securityId: string;
  ticker: string;
  reviewedAt: string;
  asOfDate: string;
  reviewAction?: MonitorReviewAction;
  reviewActionNotes?: string;
  previousReviewId?: string | null;
  previousDecisionId?: string | null;
  currentDecisionId?: string | null;
  previousSnapshotId?: string | null;
  currentSnapshotId?: string | null;

  changeSummary: {
    eventsCount: number;
    evidenceCount: number;
    decisionChanged: boolean;
    thesisChanged: boolean;
    riskChanged: boolean;
    catalystChanged: boolean;
    invalidationChanged: boolean;
    portfolioChanged: boolean;
    quantChanged: boolean;
    valuationChanged: boolean;
    dataQualityChanged: boolean;
    headline: string;
    totalChanges?: number;
    criticalChanges?: number;
    highSeverityChanges?: number;
    favorableChanges?: number;
    unfavorableChanges?: number;
    hasInvalidationRisk?: boolean;
    hasDecisionShift?: boolean;
    hasNewEvents?: boolean;
    hasPortfolioImpact?: boolean;
    highestSeverity?: string;
    recommendationReviewUrgency?: string;
    recommendedReviewCadence?: ReviewCadence;
  };

  changes: MonitorChangeItem[];
  thesisHealth: ThesisHealthReport;

  decisionDelta?: {
    previous?: {
      decisionId: string;
      asOfDate: string;
      compositeScore: number;
      conviction: string;
      rating: string;
      dimensionScores: Record<string, number>;
    } | null;
    current?: {
      decisionId: string;
      asOfDate: string;
      compositeScore: number;
      conviction: string;
      rating: string;
      dimensionScores: Record<string, number>;
    } | null;
    scoreDelta?: number;
    compositeScoreDelta?: number;
    ratingShift?: boolean;
    currentRating?: string;
    previousRating?: string;
    currentCompositeScore?: number;
    previousCompositeScore?: number;
    dimensionDeltas?: Record<string, number>;
    narrative: string;
  };

  thesisDelta?: {
    previousStatus?: string;
    currentStatus?: string;
    statusChanged?: boolean;
    invalidationTriggered?: boolean;
    affectedAreas?: string[];
    narrative: string;
    summary?: string;
    bullCaseShift?: string;
    bearCaseShift?: string;
    catalystsStatus?: string;
    risksStatus?: string;
    invalidationState?: string;
  };

  eventDelta?: {
    newEvents: InvestmentEvent[];
    totalCount: number;
    narrative: string;
  };

  evidenceDelta?: {
    newEvidenceCount: number;
    contradictoryCount: number;
    resolvedGapsCount: number;
    evidenceIds: string[];
    narrative: string;
    conflictDetected?: boolean;
    conflictSummary?: string;
  };

  portfolioDelta?: {
    hasExposure: boolean;
    previousWeightPct?: number;
    currentWeightPct?: number;
    weightPct?: number;
    weightDeltaPct?: number;
    shares?: number;
    currency?: string;
    unrealizedPnL?: number;
    unrealizedPnLDelta?: number;
    narrative: string;
    positionSize?: number;
    portfolioWeight?: number;
    unrealizedPnl?: number;
    unrealizedPnlPercent?: number;
    exposureAdjustedRisk?: string;
    actionRequired?: boolean;
  };

  quantDelta?: {
    signals?: Array<{
      strategyId: string;
      strategyName: string;
      previousSignal?: string;
      currentSignal?: string;
      signalDate: string;
      epistemicStatus: EpistemicStatus;
    }>;
    narrative?: string;
    momentumScore?: number;
    volatilityScore?: number;
    qualityScore?: number;
    trendDirection?: string;
  };

  valuationDelta?: {
    metrics?: Record<string, { previous?: any; current?: any; delta?: any; status: EpistemicStatus }>;
    narrative?: string;
    peMultiple?: number;
    targetPrice?: number;
    marginOfSafety?: number;
    discountToFairValue?: number;
  };

  invalidationDelta?: {
    status: ThesisInvalidationState | 'THREATENED';
    narrative?: string;
    hasTriggeredConditions?: boolean;
    triggeredConditions?: string[];
    activeGuardsCount?: number;
    threatenedCount?: number;
    invalidationStatusChanged?: boolean;
    previousStatus?: string;
    currentStatus?: string;
  };

  dataQualityDelta?: {
    providers?: Record<string, { previousStatus: EpistemicStatus; currentStatus: EpistemicStatus; changed: boolean }>;
    hasDegradation?: boolean;
    narrative?: string;
    epistemicStatus?: EpistemicStatus;
    dataGaps?: any;
    missingMetrics?: string[];
  };

  explanation: {
    summary: string;
    source: 'DETERMINISTIC' | 'AI_EXPLANATION';
    causalChain: string[];
    keyTakeaways?: string[];
    recommendedActions?: string[];
    overview?: string;
    executiveSummary?: string;
    urgency?: string;
  };

  analystNotes: AnalystReviewNote[];

  epistemicStatus: EpistemicStatus;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export type MonitorChangeSummary = InvestmentMonitorReview['changeSummary'];
export type MonitorDecisionDelta = NonNullable<InvestmentMonitorReview['decisionDelta']>;
export type MonitorThesisDelta = NonNullable<InvestmentMonitorReview['thesisDelta']>;
export type MonitorEventDelta = NonNullable<InvestmentMonitorReview['eventDelta']>;
export type MonitorEvidenceDelta = NonNullable<InvestmentMonitorReview['evidenceDelta']>;
export type MonitorPortfolioDelta = NonNullable<InvestmentMonitorReview['portfolioDelta']>;
export type MonitorQuantDelta = NonNullable<InvestmentMonitorReview['quantDelta']>;
export type MonitorValuationDelta = NonNullable<InvestmentMonitorReview['valuationDelta']>;
export type MonitorInvalidationDelta = NonNullable<InvestmentMonitorReview['invalidationDelta']>;
export type MonitorDataQualityDelta = NonNullable<InvestmentMonitorReview['dataQualityDelta']>;
export type MonitorReviewExplanation = InvestmentMonitorReview['explanation'];

export interface ThesisCatalystItem {
  catalystId: string;
  description: string;
  state: string;
  progressNotes?: string;
}

export interface ThesisRiskItem {
  riskId: string;
  description: string;
  state: string;
  severity?: string;
  trend?: string;
}

export interface ThesisInvalidationItem {
  conditionId: string;
  description: string;
  state: string;
  triggerEvidence?: string;
}

export interface MonitorReviewComparison {
  monitorId: string;
  ticker: string;
  baseReview: {
    reviewId: string;
    reviewedAt: string;
    asOfDate: string;
    reviewAction?: MonitorReviewAction;
    decisionRating?: string;
    compositeScore?: number;
    thesisStatus?: string;
    invalidationStatus?: string;
    portfolioWeightPct?: number;
  };
  targetReview: {
    reviewId: string;
    reviewedAt: string;
    asOfDate: string;
    reviewAction?: MonitorReviewAction;
    decisionRating?: string;
    compositeScore?: number;
    thesisStatus?: string;
    invalidationStatus?: string;
    portfolioWeightPct?: number;
  };
  diff: {
    scoreDelta: number;
    ratingShift: boolean;
    previousRating?: string;
    currentRating?: string;
    thesisShift: boolean;
    previousThesisStatus?: string;
    currentThesisStatus?: string;
    invalidationShift: boolean;
    previousInvalidationStatus?: string;
    currentInvalidationStatus?: string;
    weightDeltaPct: number;
    sharesDelta: number;
    unrealizedPnLDelta: number;
    currency?: string;
    newEventsBetween: InvestmentEvent[];
    newEvidenceCountBetween: number;
    changedDimensions: Record<string, { baseScore: number; targetScore: number; delta: number }>;
    summaryNarrative: string;
  };
}

// ============================================================================
// PHASE 27 — CONTINUOUS MONITORING & ALERT ORCHESTRATION CONTRACTS
// ============================================================================

export type MonitoringPolicyType =
  | 'SECURITY'
  | 'PORTFOLIO'
  | 'THESIS'
  | 'EVENT'
  | 'RESEARCH'
  | 'MONITOR'
  | 'VALUATION';

export type MonitoringPolicyScope =
  | 'ALL_MONITORS'
  | 'SPECIFIC_MONITOR'
  | 'SPECIFIC_SECURITY'
  | 'PORTFOLIO';

export interface MonitoringPolicy {
  policyId: string;
  userId: string;
  ownerUserId?: string;
  name: string;
  policyType: MonitoringPolicyType;
  enabled: boolean;
  scope: MonitoringPolicyScope;
  monitorId?: string;
  securityId?: string;
  portfolioId?: string;
  rules: AlertRuleType[];
  configuration?: Record<string, unknown>;
  minSeverity: AlertSeverity;
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export type AlertLifecycleStatus =
  | 'DETECTED'
  | 'QUALIFIED'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'SUPPRESSED'
  | 'EXPIRED';

export type AlertAnalystAction =
  | 'ACKNOWLEDGE'
  | 'OPEN_REVIEW'
  | 'DISMISS'
  | 'RESOLVE';

export interface AlertCandidate {
  candidateId: string;
  monitorId?: string;
  securityId?: string;
  symbol?: string;
  portfolioId?: string;
  userId: string;
  ruleType: AlertRuleType;
  detectedAt: string;
  severity: AlertSeverity;
  observedValue: number | string;
  threshold?: number | string;
  previousValue?: number | string | null;
  previousState?: string;
  currentState?: string;
  triggerEvidence: string;
  sourceReference: string;
  sourceType: string;
  epistemicStatus: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE' | 'STALE';
  isSimulated: boolean;
  fingerprint: string;
  metadata?: Record<string, unknown>;
}

export interface AlertAuditAction {
  action: 'GENERATED' | 'QUALIFIED' | 'DELIVERED' | 'ACKNOWLEDGED' | 'REVIEW_OPENED' | 'DISMISSED' | 'RESOLVED';
  timestamp: string;
  userId: string;
  note?: string;
}

export interface AlertInstance {
  alertId: string;
  candidateId: string;
  policyId?: string;
  policyName?: string;
  monitorId?: string;
  securityId?: string;
  symbol?: string;
  companyName?: string;
  portfolioId?: string;
  userId: string;
  ownerUserId: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  status: AlertLifecycleStatus;
  title: string;
  description: string;
  deterministicExplanation: string;
  contextualAnalysis?: string | null;
  detectedAt: string;
  createdAt: string;
  deliveredAt?: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  dismissedAt?: string | null;
  fingerprint: string;
  trigger: {
    ruleType: AlertRuleType;
    observedValue: number | string;
    threshold?: number | string;
    previousState?: string;
    currentState?: string;
    reason: string;
  };
  provenance: {
    sourceType: string;
    sourceReference: string;
    evidenceIds?: string[];
    epistemicStatus: 'REAL' | 'CALCULATED' | 'SIMULATED' | 'UNAVAILABLE';
    isSimulated: boolean;
    provider?: string;
    market?: string;
    currency?: string;
    asOfDate?: string;
    retrievedAt: string;
  };
  reviewReference?: {
    monitorId?: string;
    reviewId?: string;
    reviewUrgency?: 'IMMEDIATE' | 'HIGH' | 'ROUTINE';
    reviewWorkspaceUrl?: string;
  };
  auditTrail: AlertAuditAction[];
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface MonitoringCycleOptions {
  asOfDate?: string;
  force?: boolean;
  monitorId?: string;
  securityId?: string;
}

export interface MonitoringCycleResult {
  cycleId: string;
  timestamp: string;
  userId: string;
  monitorsEvaluated: number;
  candidatesDetected: number;
  qualifiedAlerts: number;
  suppressedDuplicates: number;
  suppressedCooldown: number;
  newAlerts: AlertInstance[];
  evaluations: Array<{
    targetId: string;
    ruleType: AlertRuleType;
    triggered: boolean;
    severity?: AlertSeverity;
    reason: string;
  }>;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 28: INVESTMENT DISCOVERY & RESEARCH PRIORITIZATION
// ==========================================

export type ResearchPriorityLevel =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'ROUTINE';

export type DiscoverySignalType =
  | 'MATERIAL_EVENT'
  | 'THESIS_CHANGE'
  | 'DECISION_DRIFT'
  | 'QUANT_REGIME'
  | 'VALUATION_CHANGE'
  | 'EVIDENCE_UPDATE'
  | 'EVIDENCE_CONFLICT'
  | 'EVIDENCE_GAP'
  | 'PORTFOLIO_EXPOSURE'
  | 'ALERT_ACTIVE'
  | 'RESEARCH_STALENESS'
  | 'DATA_QUALITY';

export interface DiscoverySignalItem {
  signalId: string;
  signalType: DiscoverySignalType;
  title: string;
  summary: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  detectedAt: string;
  observedDelta?: string;
  causalNote?: string;
  epistemicStatus: EpistemicStatus;
  isSimulated: boolean;
  sourceType: string;
  sourceReference: string;
  engine: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchPriorityItem {
  id: string;
  securityId: string;
  symbol: string;
  companyName: string;
  market: MarketRegion;
  currency: string;
  userId: string;
  ownerUserId?: string;
  priority: ResearchPriorityLevel;
  primaryReason: string;
  reasons: string[];
  signals: DiscoverySignalItem[];
  signalCount: number;
  signalConvergenceScore: number;
  latestMaterialChange?: {
    type: string;
    summary: string;
    timestamp: string;
  };
  evidenceStatus: {
    totalCount: number;
    conflictCount: number;
    gapCount: number;
    isStale: boolean;
  };
  portfolioExposure?: {
    hasPosition: boolean;
    shares?: number;
    weightPct?: number;
    currency?: string;
    unrealizedPnL?: number;
    unrealizedPnLPercent?: number;
  };
  monitorId?: string;
  activeAlertCount: number;
  lastResearchUpdate?: string;
  freshnessStatus: 'FRESH' | 'AGING' | 'STALE' | 'UNRESEARCHED';
  asOfDate: string;
  epistemicStatus: EpistemicStatus;
  isSimulated: boolean;
  isAnalyticalOnly: true;
  executionProhibited: true;
  reviewDeepLink: string;
  analyticalBriefing?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchPrioritySnapshot {
  snapshotId: string;
  userId: string;
  asOfDate: string;
  universeType: string;
  items: ResearchPriorityItem[];
  totalSecuritiesEvaluated: number;
  priorityBreakdown: Record<ResearchPriorityLevel, number>;
  createdAt: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface DiscoveryUniverseFilter {
  universeType?: 'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'MONITORED' | 'RESEARCHED' | 'CUSTOM';
  securityIds?: string[];
  market?: MarketRegion;
  priority?: ResearchPriorityLevel;
  minPriority?: ResearchPriorityLevel;
  signalTypes?: DiscoverySignalType[];
  asOfDate?: string;
  search?: string;
  freshness?: 'FRESH' | 'AGING' | 'STALE' | 'UNRESEARCHED';
  sortBy?: 'PRIORITY' | 'RECENCY' | 'SIGNAL_COUNT' | 'PORTFOLIO_WEIGHT' | 'FRESHNESS';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
}

// ==========================================
// PHASE 29: INVESTMENT RESEARCH COMMAND CENTER
// ==========================================

export interface CommandCenterAttentionSummary {
  criticalResearchCount: number;
  highResearchCount: number;
  activeAlertsCount: number;
  thesisChangesCount: number;
  decisionChangesCount: number;
  materialEventsCount: number;
  researchGapsCount: number;
  staleResearchCount: number;
  totalUniverseCount: number;
  researchContinuity?: {
    unresolvedQuestionsCount: number;
    reassessmentRequiredCount: number;
    evidenceConflictCount: number;
    activeFindingsCount: number;
  };
}

export interface CommandCenterPortfolioPulse {
  hasHoldings: boolean;
  positionsCount: number;
  totalValueUSD: number;
  totalValueINR: number;
  unrealizedPnLUSD: number;
  unrealizedPnLINR: number;
  unrealizedPnLPctUSD: number;
  unrealizedPnLPctINR: number;
  hhiConcentration: number;
  concentrationLabel: 'DIVERSIFIED' | 'MODERATE' | 'CONCENTRATED';
  currencyBreakdown: { USD: number; INR: number };
  topExposures: Array<{
    securityId: string;
    symbol: string;
    companyName: string;
    shares: number;
    weightPct: number;
    marketValue: number;
    currency: string;
    unrealizedPnL: number;
    pnlPct: number;
  }>;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CommandCenterThesisDecisionChange {
  changeId: string;
  securityId: string;
  symbol: string;
  companyName: string;
  thesisState: string;
  invalidationStatus?: string;
  decisionRating?: string;
  previousRating?: string;
  scoreDelta?: number;
  changedDimensions?: string[];
  timestamp: string;
  evidenceId?: string;
  deepLinkUrl: string;
  epistemicStatus: EpistemicStatus;
}

export interface CommandCenterMaterialEvent {
  eventId: string;
  securityId: string;
  symbol: string;
  companyName: string;
  eventType: string;
  title: string;
  summary: string;
  eventDate: string;
  availableAt: string;
  sourceType: string;
  sourceReference: string;
  affectsThesis: string;
  affectsDecision: string;
  epistemicStatus: EpistemicStatus;
  isSimulated: boolean;
  deepLinkUrl?: string;
}

export interface CommandCenterResearchCoverage {
  coveredSecuritiesCount: number;
  uncoveredSecuritiesCount: number;
  freshCount: number;
  agingCount: number;
  staleCount: number;
  coverageRatio: number;
  recentSnapshots: Array<{
    snapshotId: string;
    securityId: string;
    symbol: string;
    title: string;
    asOfDate: string;
    createdAt: string;
  }>;
  gaps: Array<{
    securityId: string;
    symbol: string;
    companyName: string;
    reason: 'NO_NOTEBOOK' | 'NO_SNAPSHOT' | 'STALE_RESEARCH';
  }>;
}

export interface CommandCenterEvidenceHealth {
  realCount: number;
  calculatedCount: number;
  simulatedCount: number;
  unavailableCount: number;
  errorCount: number;
  staleCount: number;
  summaryNote: string;
}

export interface CommandCenterExecutiveBriefing {
  summaryText: string;
  keyObservations: string[];
  topActionableFocus: string;
  generatedAt: string;
  isAIGenerated: boolean;
  fallbackReason?: string;
}

export interface CommandCenterViewData {
  metadata: {
    universeScope: string;
    asOfDate: string;
    evaluatedAt: string;
    userId: string;
    isAnalyticalOnly: true;
    executionProhibited: true;
  };
  summary: CommandCenterAttentionSummary;
  researchAttentionQueue: ResearchPriorityItem[];
  activeAlerts: AlertInstance[];
  portfolioPulse: CommandCenterPortfolioPulse;
  thesisAndDecisionChanges: CommandCenterThesisDecisionChange[];
  materialEvents: CommandCenterMaterialEvent[];
  researchCoverage: CommandCenterResearchCoverage;
  evidenceHealth: CommandCenterEvidenceHealth;
  executiveBriefing: CommandCenterExecutiveBriefing;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CommandCenterFilter {
  scope?: 'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'MONITORED' | 'RESEARCHED';
  asOfDate?: string;
  market?: MarketRegion;
  limit?: number;
}

// ==========================================
// PHASE 30: CROSS-INVESTMENT INTELLIGENCE & EXPOSURE RELATIONSHIP ANALYSIS
// ==========================================

export type InvestmentRelationshipType =
  | 'STRUCTURAL'
  | 'PORTFOLIO_EXPOSURE'
  | 'MARKET'
  | 'EVENT'
  | 'THESIS'
  | 'EVIDENCE'
  | 'DECISION'
  | 'COMMON_DRIVER';

export type RelationshipCausalAssertion =
  | 'OBSERVED_CORRELATION'
  | 'SHARED_ATTRIBUTE'
  | 'EVIDENCED_CAUSAL'
  | 'INSUFFICIENT_EVIDENCE';

export interface InvestmentRelationship {
  id: string; // e.g. "rel::us-nvda::us-msft::STRUCTURAL::SECTOR"
  securityId: string;
  relatedSecurityId: string;
  securitySymbol: string;
  relatedSecuritySymbol: string;
  securityName: string;
  relatedSecurityName: string;
  market: MarketRegion;
  relatedMarket: MarketRegion;
  relationshipType: InvestmentRelationshipType;
  basis: string; // e.g. "Same Sector (Technology)" or "Return Correlation"
  metric?: number | string | null;
  metricDefinition?: string;
  description: string;
  evidence?: string[];
  sourceReferences?: string[];
  asOfDate: string;
  epistemicState: EpistemicStatus;
  tenantScope?: string;
  createdAt: string;
  causalAssertion: RelationshipCausalAssertion;
  deepLinkUrl?: string;
}

export interface RelationshipCluster {
  id: string;
  name: string; // Deterministic title, e.g. "Technology Sector Cluster"
  clusterType: InvestmentRelationshipType;
  securities: Array<{
    securityId: string;
    symbol: string;
    companyName: string;
    role?: string;
    market: MarketRegion;
    marketWeightPct?: number;
    portfolioWeightPct?: number;
  }>;
  commonDimensions: Array<{ dimension: string; value: string }>;
  portfolioExposure?: {
    totalWeightPct: number;
    positionCount: number;
    currency: string;
  };
  sharedEventsCount: number;
  sharedThesisRisksCount: number;
  evidenceReferences: string[];
  relationshipMetrics?: Record<string, any>;
  asOfDate: string;
  epistemicState: EpistemicStatus;
  description: string;
}

export interface CommonDriverItem {
  id: string;
  driverType: 'SECTOR' | 'GEOGRAPHY' | 'CURRENCY' | 'COMMODITY' | 'REGULATORY' | 'SUPPLY_CHAIN' | 'EVENT' | 'THESIS_RISK';
  name: string;
  description: string;
  provenance: string[];
  affectedSecurities: Array<{
    securityId: string;
    symbol: string;
    companyName: string;
    exposureRole?: string;
    market: MarketRegion;
  }>;
  portfolioExposurePct?: number;
  associatedEventIds?: string[];
  associatedThesisRiskAreas?: string[];
  asOfDate: string;
  epistemicState: EpistemicStatus;
}

export interface RelationshipAttentionItem {
  id: string;
  attentionType: 'SHARED_EVENT' | 'SHARED_THESIS_RISK' | 'HIGH_CORRELATION' | 'SECTOR_CONCENTRATION' | 'SHARED_EVIDENCE_CONFLICT' | 'SHARED_DECISION_DELTA';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  affectedSecurities: string[]; // symbols
  affectedSecurityIds: string[];
  recommendedAction: string; // Strictly neutral analytical language
  asOfDate: string;
  deepLinkUrl?: string;
}

export interface MarketRelationshipPair {
  pair: [string, string];
  pairIds: [string, string];
  correlation: number;
  lookbackDays: number;
  frequency: string;
  observationCount: number;
  epistemicState: EpistemicStatus;
  basis: string;
  market: MarketRegion;
}

export interface CrossInvestmentExecutiveBriefing {
  summaryText: string;
  keyObservations: string[];
  topActionableFocus: string;
  generatedAt: string;
  isAIGenerated: boolean;
  fallbackReason?: string;
}

export interface CrossInvestmentIntelligenceData {
  metadata: {
    asOfDate: string;
    evaluatedAt: string;
    userId: string;
    universeScope: 'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'MONITORED';
    totalSecurities: number;
    totalRelationships: number;
    totalClusters: number;
    isAnalyticalOnly: true;
    executionProhibited: true;
  };
  relationships: InvestmentRelationship[];
  clusters: RelationshipCluster[];
  commonDrivers: CommonDriverItem[];
  attentionItems: RelationshipAttentionItem[];
  marketRelationshipSummary?: {
    pairwiseCorrelations: MarketRelationshipPair[];
    currencyIsolated: boolean;
  };
  executiveBriefing?: CrossInvestmentExecutiveBriefing;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CrossInvestmentFilter {
  scope?: 'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'MONITORED';
  relationshipType?: InvestmentRelationshipType;
  securityId?: string;
  sector?: string;
  market?: MarketRegion;
  asOfDate?: string;
  limit?: number;
}

export interface CrossInvestmentSnapshot {
  snapshotId: string;
  userId: string;
  title: string;
  asOfDate: string;
  createdAt: string;
  data: CrossInvestmentIntelligenceData;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 31: PORTFOLIO SCENARIO & STRESS INTELLIGENCE
// ==========================================

export type PortfolioScenarioType =
  | 'MARKET_SHOCK'
  | 'SECTOR_SHOCK'
  | 'SECURITY_SHOCK'
  | 'CURRENCY_SCENARIO'
  | 'MACRO_SCENARIO'
  | 'EVENT_SCENARIO'
  | 'THESIS_INVALIDATION_SCENARIO';

export type ScenarioSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ScenarioParameters {
  shockPercentage?: number; // e.g. -15 for -15%
  sector?: string; // e.g. 'Technology'
  targetSecurityId?: string; // e.g. 'sec_nvda' or 'NVDA'
  targetSymbol?: string;
  currency?: 'USD' | 'INR';
  currencyChangePct?: number; // e.g. +10
  macroVariable?: 'INTEREST_RATES' | 'CRUDE_OIL' | 'INFLATION' | 'GDP';
  macroShockAmount?: number; // e.g. 100 for 100 bps or 25 for 25%
  macroShockUnit?: 'bps' | '%';
  eventDescription?: string;
  eventCategory?: 'REGULATORY' | 'SUPPLY_CHAIN' | 'GEOPOLITICAL' | 'EARNINGS';
  thesisInvalidationPillar?: string; // e.g. 'MARGIN_COMPRESSION', 'PRICING_POWER', 'REGULATORY_HEADWIND'
  market?: MarketRegion; // 'US' | 'INDIA' | 'ALL'
  asOfDate?: string;
}

export interface ScenarioAssumption {
  id: string;
  statement: string;
  isHypothetical: true;
  basis: string;
  fxAssumption?: string;
  limitationNote?: string;
}

export interface ScenarioPropagationStep {
  step: number;
  nodeType: 'SCENARIO' | 'DRIVER' | 'RELATIONSHIP' | 'SECURITY' | 'PORTFOLIO_POSITION' | 'IMPACT';
  label: string;
  provenance: string;
}

export interface ScenarioSecurityImpact {
  securityId: string;
  ticker: string;
  companyName: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  sector: string;
  industry: string;
  exposureBasis: 'DIRECT_TARGET' | 'SECTOR_MEMBERSHIP' | 'COMMON_DRIVER' | 'PORTFOLIO_HOLDING' | 'SHARED_EVENT' | 'THESIS_GUARD';
  exposureExplanation: string;
  isPortfolioHolding: boolean;
  shares: number;
  currentPrice: number;
  currentValue: number;
  portfolioWeightPct: number;
  scenarioShockPct: number | null;
  scenarioPrice: number | null;
  hypotheticalPnl: number | null;
  hypotheticalPnlPct: number | null;
  hypotheticalNewValue: number | null;
  epistemicStatus: EpistemicStatus | 'INSUFFICIENT_EVIDENCE' | 'ERROR' | 'STALE';
  evidenceIds: string[];
  evidenceSummary?: string;
  insufficientEvidenceReason?: string;
  propagationPath: ScenarioPropagationStep[];
  relatedThesisPillars: string[];
  relevantInvalidationGuards: Array<{
    monitorId: string;
    guardName: string;
    status: string;
  }>;
  relatedEvents: Array<{
    eventId: string;
    title: string;
    eventDate: string;
  }>;
  decisionContext?: {
    assessmentId: string;
    compositeScore: number;
    decisionCategory: string;
    conviction: string;
  };
  deepLinks: {
    reviewWorkspaceUrl: string;
    researchNotebookUrl: string;
    eventIntelligenceUrl: string;
    decisionIntelligenceUrl: string;
    crossInvestmentUrl: string;
    commandCenterUrl: string;
  };
}

export interface PortfolioScenarioEvaluation {
  scenarioId: string;
  name: string;
  description: string;
  scenarioType: PortfolioScenarioType;
  severity: ScenarioSeverity;
  asOfDate: string;
  evaluatedAt: string;
  userId: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
  assumptions: ScenarioAssumption[];
  portfolioSummary: {
    totalHoldingsEvaluated: number;
    affectedHoldingsCount: number;
    affectedUniverseCount: number;
    usd: {
      hasHoldings: boolean;
      totalPortfolioValue: number;
      affectedPortfolioValue: number;
      affectedWeightPct: number;
      hypotheticalPnl: number;
      hypotheticalPnlPct: number;
      currency: 'USD';
    };
    inr: {
      hasHoldings: boolean;
      totalPortfolioValue: number;
      affectedPortfolioValue: number;
      affectedWeightPct: number;
      hypotheticalPnl: number;
      hypotheticalPnlPct: number;
      currency: 'INR';
    };
    currencyIsolated: true;
    crossCurrencyAggregationAvailable: false;
    currencyNote: string;
  };
  sectorExposures: Array<{
    sector: string;
    market: MarketRegion;
    affectedSecuritiesCount: number;
    totalWeightPct: number;
    hypotheticalPnl: number;
    currency: 'USD' | 'INR';
  }>;
  commonDrivers: Array<{
    driverId: string;
    driverName: string;
    category: string;
    affectedSecuritiesCount: number;
    notes: string;
  }>;
  impactedSecurities: ScenarioSecurityImpact[];
  evidenceCoverage: {
    totalEvidenceLinks: number;
    verifiedRealEvidenceCount: number;
    insufficientEvidenceCount: number;
    epistemicBreakdown: Record<string, number>;
  };
  executiveBriefing?: {
    summaryText: string;
    keyVulnerabilities: string[];
    investigationRecommendations: string[];
    generatedAt: string;
    isAIGenerated: boolean;
    fallbackReason?: string;
  };
}

export interface PortfolioScenarioRequest {
  scenarioType: PortfolioScenarioType;
  name?: string;
  description?: string;
  parameters: ScenarioParameters;
  asOfDate?: string;
}

export interface ScenarioComparisonItem {
  scenarioId: string;
  name: string;
  scenarioType: PortfolioScenarioType;
  severity: ScenarioSeverity;
  affectedHoldingsCount: number;
  affectedWeightPctUsd: number;
  hypotheticalPnlUsd: number;
  affectedWeightPctInr: number;
  hypotheticalPnlInr: number;
  insufficientEvidenceCount: number;
}

export interface ScenarioComparisonResult {
  comparisonId: string;
  asOfDate: string;
  scenarios: ScenarioComparisonItem[];
  differences: Array<{
    dimension: string;
    details: Record<string, string | number>;
  }>;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface PortfolioScenarioSnapshot {
  snapshotId: string;
  userId: string;
  title: string;
  scenarioType: PortfolioScenarioType;
  asOfDate: string;
  createdAt: string;
  evaluation: PortfolioScenarioEvaluation;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CommandCenterScenarioSummary {
  activeScenariosCount: number;
  topScenarioName?: string;
  affectedPortfolioWeightPctUSD: number;
  affectedPortfolioWeightPctINR: number;
  summaryNote: string;
}

// ============================================================================
// Phase 32 — Counterfactual Decision Intelligence & Sensitivity Analysis
// ============================================================================

export type CounterfactualType =
  | 'METRIC'
  | 'VALUATION'
  | 'GROWTH'
  | 'RISK'
  | 'THESIS'
  | 'EVENT'
  | 'PORTFOLIO'
  | 'DIMENSION';

export interface CounterfactualAssumption {
  id: string;
  type: CounterfactualType;
  targetDimension?: DecisionDimensionKey;
  parameterKey: string;
  currentValue: any;
  counterfactualValue: any;
  unit?: string;
  label: string;
  description: string;
  isHypothetical: true;
  epistemicStatus: 'COUNTERFACTUAL_ASSUMPTION';
  provenanceSource?: string;
}

export interface CounterfactualThresholdBoundary {
  label: string;
  condition: string;
  targetState: string;
  thresholdValue: any;
  isCurrentZone?: boolean;
}

export interface CounterfactualDimensionDelta {
  dimension: DecisionDimensionKey;
  dimensionName: string;
  currentState: string;
  currentScore: number;
  counterfactualState: string;
  counterfactualScore: number;
  isChanged: boolean;
  scoreDelta: number;
  deterministicRule: string;
  currentInputs: Record<string, any>;
  counterfactualInputs: Record<string, any>;
  thresholds?: {
    currentZone: string;
    boundaryThresholds: CounterfactualThresholdBoundary[];
  };
  epistemicStatus: EpistemicStatus;
  insufficientEvidenceReason?: string;
  supportingEvidenceIds: string[];
  changedDrivers: string[];
  unchangedDrivers: string[];
}

export interface CounterfactualTraceNode {
  id: string;
  type: 'EVIDENCE' | 'INPUT_FACT' | 'DIMENSION' | 'ASSESSMENT' | 'THESIS';
  label: string;
  value: any;
  isCounterfactual: boolean;
  epistemicStatus: EpistemicStatus | 'COUNTERFACTUAL_ASSUMPTION';
  provenance?: string;
  targetNodeIds: string[];
}

export interface CounterfactualTraceabilityGraph {
  nodes: CounterfactualTraceNode[];
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    isCounterfactual: boolean;
    ruleDescription?: string;
  }>;
  dependencyChain: string[];
}

export interface CounterfactualSensitivityBoundary {
  dimension: DecisionDimensionKey;
  dimensionName: string;
  currentValue: any;
  currentState: string;
  sensitivities: Array<{
    targetState: string;
    requiredChange: string;
    metricKey: string;
    currentMetricValue: any;
    thresholdValue: any;
    isCalculable: boolean;
    ruleDescription: string;
    insufficientEvidenceReason?: string;
  }>;
}

export interface CounterfactualDecisionEvaluation {
  counterfactualId: string;
  baseDecisionId: string;
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: string;
  asOfDate: string;
  modelVersion: string;
  evaluatedAt: string;
  assumptions: CounterfactualAssumption[];
  baseDecision: {
    compositeScore: number;
    overallAssessment: DecisionOverallAssessment;
    conviction: DecisionConviction;
    thesisStatus: string;
    dimensions: Record<DecisionDimensionKey, { assessment: string; score: number }>;
    keyDrivers: string[];
    counterEvidence: string[];
  };
  counterfactualDecision: {
    compositeScore: number;
    overallAssessment: DecisionOverallAssessment;
    conviction: DecisionConviction;
    thesisStatus: string;
    dimensions: Record<DecisionDimensionKey, { assessment: string; score: number }>;
    keyDrivers: string[];
    counterEvidence: string[];
  };
  overallAssessmentChanged: boolean;
  convictionChanged: boolean;
  compositeScoreDelta: number;
  dimensionDeltas: CounterfactualDimensionDelta[];
  changedDimensionsCount: number;
  unchangedDimensionsCount: number;
  sensitivityBoundaries: CounterfactualSensitivityBoundary[];
  traceabilityGraph: CounterfactualTraceabilityGraph;
  evidenceAudit: {
    supportingEvidenceCount: number;
    conflictingEvidenceCount: number;
    conflictsPreserved: Array<{ concept: string; primarySource: string; conflictingSource: string }>;
    insufficientEvidenceCount: number;
    missingRequiredMetrics: string[];
  };
  narrative?: {
    summary: string;
    changedDrivers: string[];
    thesisImplication: string;
    isAIGenerated: boolean;
    fallbackReason?: string;
  };
  deepLinks: {
    reviewWorkspace: string;
    decisionTimeline: string;
    researchNotebook: string;
    scenarioStress: string;
    crossInvestment: string;
  };
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CounterfactualSnapshot {
  snapshotId: string;
  userId: string;
  title: string;
  securityId: string;
  asOfDate: string;
  createdAt: string;
  evaluation: CounterfactualDecisionEvaluation;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CounterfactualEvaluateRequest {
  securityId: string;
  decisionId?: string;
  asOfDate?: string;
  assumptions: Array<{
    type: CounterfactualType;
    parameterKey: string;
    counterfactualValue: any;
    targetDimension?: DecisionDimensionKey;
    label?: string;
    description?: string;
  }>;
  forceRefresh?: boolean;
}

export interface CounterfactualCompareRequest {
  securityId: string;
  evaluations: CounterfactualDecisionEvaluation[];
}

export interface CounterfactualComparisonResult {
  securityId: string;
  ticker: string;
  comparisons: Array<{
    id: string;
    label: string;
    assumptions: string[];
    overallAssessment: DecisionOverallAssessment;
    compositeScore: number;
    changedDimensions: string[];
  }>;
  dimensionMatrix: Record<DecisionDimensionKey, Record<string, { assessment: string; score: number }>>;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 33: INSTITUTIONAL RESEARCH MEMORY & KNOWLEDGE CONTINUITY
// ==========================================

export type ResearchMemoryType =
  | 'OBSERVATION'
  | 'RESEARCH_FINDING'
  | 'THESIS_UPDATE'
  | 'DECISION_UPDATE'
  | 'EVIDENCE_CONCLUSION'
  | 'REVIEW_OUTCOME'
  | 'UNRESOLVED_QUESTION'
  | 'COUNTERFACTUAL_FINDING'
  | 'SCENARIO_FINDING'
  | 'EVIDENCE_CONFLICT'
  | 'RESEARCH_GAP';

export type ResearchMemoryStatus =
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'REQUIRES_REASSESSMENT'
  | 'CONTRADICTED'
  | 'UNRESOLVED'
  | 'HISTORICAL';

export type ResearchQuestionStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'PARTIALLY_ANSWERED'
  | 'ANSWERED'
  | 'CONFLICTING'
  | 'UNRESOLVED'
  | 'BLOCKED'
  | 'SUPERSEDED';

export type ResearchQuestionCategory =
  | 'THESIS'
  | 'EVIDENCE_CONFLICT'
  | 'DECISION_DRIFT'
  | 'EVENT_DRIVEN'
  | 'SCENARIO_DRIVEN'
  | 'CROSS_INVESTMENT'
  | 'GENERAL';

export interface ResearchMemorySourceReference {
  id: string;
  title: string;
  source: string;
  url?: string;
  isPrivate?: boolean;
}

export interface ResearchMemoryEntry {
  id: string;
  tenantId?: string;
  userId: string;
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  memoryType: ResearchMemoryType;
  title: string;
  summary: string;
  finding: string;
  status: ResearchMemoryStatus;
  observedAt: string;
  asOfDate: string;
  sourceReferences: ResearchMemorySourceReference[];
  relatedEvidenceIds: string[];
  relatedEventIds: string[];
  relatedDecisionIds: string[];
  relatedReviewIds: string[];
  relatedNotebookIds: string[];
  relatedMonitorIds: string[];
  relatedCounterfactualIds: string[];
  supersedesMemoryId?: string;
  supersededByMemoryId?: string;
  reassessmentReason?: string;
  unresolvedQuestions?: string[];
  thesisContext?: {
    status: string;
    summary?: string;
    monitorId?: string;
  };
  decisionContext?: {
    overallAssessment: DecisionOverallAssessment;
    compositeScore: number;
    decisionId?: string;
  };
  epistemicStatus: EpistemicStatus | 'ANALYST_ASSERTION' | 'COUNTERFACTUAL_ASSUMPTION';
  createdBy: string;
  createdAt: string;
  modelVersion: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface ResearchQuestionEntry {
  id: string;
  userId: string;
  securityId: string;
  ticker: string;
  question: string;
  context: string;
  category?: ResearchQuestionCategory;
  whyItMatters?: string;
  status: ResearchQuestionStatus;
  relatedEvidenceIds: string[];
  relatedReviewIds: string[];
  relatedMemoryIds: string[];
  requiredEvidenceCount?: number;
  availableEvidenceCount?: number;
  planId?: string;
  gapId?: string;
  resolution?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  asOfDate: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface KnowledgeEvolutionNode {
  id: string;
  type: 'EVIDENCE' | 'FINDING' | 'DECISION' | 'REVIEW' | 'QUESTION' | 'CONFLICT';
  label: string;
  date: string;
  status?: string;
  epistemicStatus?: string;
  details?: string;
}

export interface KnowledgeEvolutionEdge {
  from: string;
  to: string;
  label?: string;
  transitionType?: 'SUPERSEDES' | 'SUPPORTS' | 'CONTRADICTS' | 'GENERATES' | 'RESOLVES';
}

export interface KnowledgeEvolutionGraph {
  nodes: KnowledgeEvolutionNode[];
  edges: KnowledgeEvolutionEdge[];
  dependencyChain: string[];
}

export interface CurrentResearchState {
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  asOfDate: string;
  latestFindings: ResearchMemoryEntry[];
  activeMemories: ResearchMemoryEntry[];
  supersededMemories: ResearchMemoryEntry[];
  staleOrReassessmentMemories: ResearchMemoryEntry[];
  evidenceConflicts: Array<{
    memoryId: string;
    title: string;
    primaryEvidenceId: string;
    conflictingEvidenceId: string;
    description: string;
    asOfDate: string;
  }>;
  openQuestions: ResearchQuestionEntry[];
  researchGaps: Array<{
    gapId: string;
    category: string;
    description: string;
    affectedDimension?: string;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  latestReview?: {
    reviewId: string;
    asOfDate: string;
    outcomeSummary: string;
    thesisState: string;
  };
  latestDecision?: {
    decisionId: string;
    asOfDate: string;
    overallAssessment: DecisionOverallAssessment;
    compositeScore: number;
  };
  latestThesisState?: string;
  evolutionChain: Array<{
    fromMemoryId?: string;
    toMemoryId: string;
    transitionReason: string;
    evidenceDeltaIds: string[];
    asOfDate: string;
  }>;
  narrativeSynthesis?: {
    summary: string;
    knowledgeContinuityNote: string;
    unresolvedQuestionsSummary: string;
    isAIGenerated: boolean;
    fallbackReason?: string;
  };
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CreateResearchMemoryRequest {
  securityId: string;
  memoryType: ResearchMemoryType;
  title: string;
  summary: string;
  finding: string;
  asOfDate?: string;
  observedAt?: string;
  sourceReferences?: ResearchMemorySourceReference[];
  relatedEvidenceIds?: string[];
  relatedEventIds?: string[];
  relatedDecisionIds?: string[];
  relatedReviewIds?: string[];
  relatedNotebookIds?: string[];
  relatedMonitorIds?: string[];
  relatedCounterfactualIds?: string[];
  unresolvedQuestions?: string[];
  thesisContext?: {
    status: string;
    summary?: string;
    monitorId?: string;
  };
  decisionContext?: {
    overallAssessment: DecisionOverallAssessment;
    compositeScore: number;
    decisionId?: string;
  };
  epistemicStatus?: EpistemicStatus | 'ANALYST_ASSERTION' | 'COUNTERFACTUAL_ASSUMPTION';
}

export interface SupersedeResearchMemoryRequest {
  title: string;
  summary: string;
  finding: string;
  asOfDate?: string;
  observedAt?: string;
  supersedingReason: string;
  sourceReferences?: ResearchMemorySourceReference[];
  relatedEvidenceIds?: string[];
  relatedDecisionIds?: string[];
  relatedReviewIds?: string[];
  unresolvedQuestions?: string[];
  epistemicStatus?: EpistemicStatus | 'ANALYST_ASSERTION' | 'COUNTERFACTUAL_ASSUMPTION';
}

export interface CreateResearchQuestionRequest {
  securityId: string;
  question: string;
  context: string;
  category?: ResearchQuestionCategory;
  whyItMatters?: string;
  asOfDate?: string;
  relatedEvidenceIds?: string[];
  relatedReviewIds?: string[];
  relatedMemoryIds?: string[];
  requiredEvidenceCount?: number;
  availableEvidenceCount?: number;
  planId?: string;
  gapId?: string;
}

export interface ResearchMemorySearchCriteria {
  securityId?: string;
  memoryType?: ResearchMemoryType;
  date?: string;
  asOfDate?: string;
  status?: ResearchMemoryStatus;
  epistemicStatus?: string;
  decisionId?: string;
  reviewId?: string;
  thesisState?: string;
  query?: string;
}

// ==========================================
// PHASE 34: INSTITUTIONAL RESEARCH PLANNING & INVESTIGATION WORKFLOW
// ==========================================

export type ResearchGapType =
  | 'THESIS_LACKS_EVIDENCE'
  | 'EVIDENCE_CONFLICT'
  | 'STALE_FINDING'
  | 'UNRESOLVED_QUESTION'
  | 'EVIDENCE_UNAVAILABLE'
  | 'INSUFFICIENT_HISTORICAL_DATA'
  | 'UNVERIFIED_SCENARIO_ASSUMPTION'
  | 'DECISION_DIMENSION_DEFICIT'
  | 'INVALIDATION_GUARD_INVESTIGATION';

export type ResearchGapStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'EVIDENCE_FOUND'
  | 'RESOLVED'
  | 'SUPERSEDED'
  | 'UNAVAILABLE';

export interface ResearchGapRecord {
  gapId: string;
  securityId: string;
  ticker: string;
  tenantId?: string;
  userId: string;
  monitorId?: string;
  questionId?: string;
  planId?: string;
  gapType: ResearchGapType;
  title: string;
  description: string;
  whyItMatters: string;
  requiredEvidence: string[];
  currentEvidenceState: 'MISSING' | 'INSUFFICIENT' | 'CONFLICTING' | 'STALE' | 'AVAILABLE';
  epistemicStatus: EpistemicStatus | 'HYPOTHESIS' | 'UNAVAILABLE';
  createdAt: string;
  asOfDate: string;
  status: ResearchGapStatus;
  currency: 'USD' | 'INR';
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export type EvidenceRequirementType =
  | 'PRIMARY_FILING'
  | 'REGULATORY_DOCUMENT'
  | 'COMPANY_DISCLOSURE'
  | 'FINANCIAL_STATEMENT'
  | 'MARKET_DATA'
  | 'CORPORATE_ACTION'
  | 'INSTITUTIONAL_RESEARCH'
  | 'INTERNAL_ANALYSIS'
  | 'OTHER';

export type EvidenceRequirementStatus =
  | 'REQUIRED'
  | 'AVAILABLE'
  | 'MISSING'
  | 'CONFLICTING'
  | 'STALE';

export interface EvidenceRequirement {
  requirementId: string;
  questionId?: string;
  gapId?: string;
  planId?: string;
  description: string;
  evidenceType: EvidenceRequirementType;
  preferredSource: string;
  minimumEvidenceState: 'VERIFIED' | 'PRELIMINARY' | 'AUDITED';
  requiredAsOfDate: string;
  status: EvidenceRequirementStatus;
  fulfilledEvidenceIds?: string[];
}

export type InvestigationTaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'SUPERSEDED';

export interface InvestigationTask {
  taskId: string;
  planId: string;
  questionId?: string;
  gapId?: string;
  title: string;
  description: string;
  evidenceRequired: string[];
  preferredSources: string[];
  sourceType: EvidenceRequirementType;
  acceptanceCriteria: string;
  status: InvestigationTaskStatus;
  createdAt: string;
  completedAt?: string;
  blockedReason?: string;
  resolutionNotes?: string;
  attachedEvidenceIds?: string[];
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export type InvestigationPlanStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export interface InvestigationPlan {
  planId: string;
  tenantId?: string;
  userId: string;
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  monitorId?: string;
  title: string;
  objective: string;
  questionIds: string[];
  gapIds: string[];
  tasks: InvestigationTask[];
  evidenceRequirements: EvidenceRequirement[];
  createdAt: string;
  updatedAt: string;
  asOfDate: string;
  status: InvestigationPlanStatus;
  epistemicStatus: EpistemicStatus | 'HYPOTHESIS';
  narrativeSummary?: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface InvestigationAuditRecord {
  auditId: string;
  tenantId: string;
  actorId: string;
  timestamp: string;
  action: string;
  targetType: 'QUESTION' | 'GAP' | 'PLAN' | 'TASK' | 'REQUIREMENT';
  targetId: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  asOfDate: string;
}

export interface CreateInvestigationPlanRequest {
  securityId: string;
  title: string;
  objective: string;
  monitorId?: string;
  questionIds?: string[];
  gapIds?: string[];
  tasks?: Array<{
    title: string;
    description: string;
    evidenceRequired: string[];
    preferredSources?: string[];
    sourceType?: EvidenceRequirementType;
    acceptanceCriteria: string;
    questionId?: string;
    gapId?: string;
  }>;
  evidenceRequirements?: Array<{
    description: string;
    evidenceType: EvidenceRequirementType;
    preferredSource: string;
    minimumEvidenceState?: 'VERIFIED' | 'PRELIMINARY' | 'AUDITED';
    requiredAsOfDate?: string;
    questionId?: string;
    gapId?: string;
  }>;
  asOfDate?: string;
}

export interface CreateInvestigationTaskRequest {
  planId: string;
  title: string;
  description: string;
  evidenceRequired: string[];
  preferredSources?: string[];
  sourceType?: EvidenceRequirementType;
  acceptanceCriteria: string;
  questionId?: string;
  gapId?: string;
}

export interface CreateEvidenceRequirementRequest {
  planId?: string;
  questionId?: string;
  gapId?: string;
  description: string;
  evidenceType: EvidenceRequirementType;
  preferredSource: string;
  minimumEvidenceState?: 'VERIFIED' | 'PRELIMINARY' | 'AUDITED';
  requiredAsOfDate?: string;
}

export interface CreateResearchGapRequest {
  securityId: string;
  gapType: ResearchGapType;
  title: string;
  description: string;
  whyItMatters: string;
  requiredEvidence: string[];
  monitorId?: string;
  questionId?: string;
  planId?: string;
  asOfDate?: string;
}

export interface InvestigationOverview {
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  asOfDate: string;
  activeInvestigationsCount: number;
  unresolvedQuestionsCount: number;
  openGapsCount: number;
  blockedInvestigationsCount: number;
  completedInvestigationsCount: number;
  plans: InvestigationPlan[];
  questions: ResearchQuestionEntry[];
  gaps: ResearchGapRecord[];
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 35: INSTITUTIONAL EVIDENCE COLLECTION & RESEARCH EXECUTION LEDGER
// ==========================================

export type EvidenceSourceClass =
  | 'SEC_FILING'
  | 'REGULATORY_FILING'
  | 'COMPANY_DISCLOSURE'
  | 'EARNINGS_REPORT'
  | 'FINANCIAL_STATEMENT'
  | 'CORPORATE_ACTION'
  | 'MARKET_DATA'
  | 'PRIMARY_DOCUMENT'
  | 'INTERNAL_RESEARCH'
  | 'INSTITUTIONAL_RESEARCH'
  | 'OTHER';

export type CollectionStatus =
  | 'DISCOVERED'
  | 'REQUESTED'
  | 'AVAILABLE'
  | 'COLLECTED'
  | 'VALIDATED'
  | 'REJECTED'
  | 'CONFLICTING'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'SUPERSEDED';

export type EvidenceQualityGrade =
  | 'PRIMARY_VERIFIED'
  | 'SECONDARY_CORROBORATED'
  | 'INTERNAL_ANALYSIS'
  | 'UNVERIFIED'
  | 'CONFLICTING'
  | 'STALE'
  | 'UNAVAILABLE';

export type EvidenceRelationshipType =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'PARTIALLY_SUPPORTS'
  | 'REFUTES'
  | 'CONTEXTUALIZES'
  | 'REQUIRES_FOLLOWUP';

export type EvidenceReconciliationState =
  | 'CONVERGENT'
  | 'CONFLICTING'
  | 'PARTIAL'
  | 'INSUFFICIENT'
  | 'UNAVAILABLE';

export type EvidenceAuditAction =
  | 'DISCOVER'
  | 'COLLECT'
  | 'VALIDATE'
  | 'REJECT'
  | 'MARK_CONFLICTING'
  | 'MARK_STALE'
  | 'SUPERSEDE'
  | 'ATTACH_TO_TASK'
  | 'ATTACH_TO_QUESTION'
  | 'ATTACH_TO_GAP'
  | 'COMMIT_FINDING';

export interface EvidenceCollectionRecord {
  collectionId: string;
  tenantId: string;
  userId: string;
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  monitorId?: string;
  planId?: string;
  taskId?: string;
  questionId?: string;
  gapId?: string;

  // Source Traceability & Provenance
  sourceId: string;
  sourceType: EvidenceSourceClass;
  sourceTitle: string;
  sourcePublisher: string;
  sourceReference: string;
  sourceUrl?: string;

  // Temporal Dimensions (PIT Zero Lookahead)
  publishedAt: string;
  availableAt: string;
  collectedAt: string;
  asOfDate: string;

  // Classification & Epistemic State
  evidenceType: EvidenceRequirementType;
  epistemicStatus: EpistemicStatus | 'HYPOTHESIS' | 'SCENARIO_ASSUMPTION' | 'UNAVAILABLE';
  collectionStatus: CollectionStatus;
  qualityGrade: EvidenceQualityGrade;

  // Content Verification & Cryptographic Fingerprinting
  contentHash: string;
  sourceFingerprint: string;
  rawSnippet?: string;
  findingsSummary?: string;

  // Investigation Impact
  supportsQuestion?: boolean;
  contradictsQuestion?: boolean;
  supportsFinding?: boolean;
  contradictsFinding?: boolean;
  relevance: string;
  provenance: string;

  // Supersession Lineage
  supersedesCollectionId?: string;
  supersededByCollectionId?: string;
  supersessionReason?: string;

  // Review & Audit Notes
  validationNotes?: string;
  rejectionReason?: string;

  // Safety & Epistemic Invariants
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface EvidenceResearchRelationship {
  relationshipId: string;
  tenantId: string;
  sourceId: string; // collectionId
  targetId: string; // questionId, gapId, taskId, planId, memoryId
  targetType: 'QUESTION' | 'GAP' | 'TASK' | 'PLAN' | 'FINDING' | 'MEMORY';
  relationshipType: EvidenceRelationshipType;
  rationale: string;
  createdAt: string;
  asOfDate: string;
  epistemicStatus: EpistemicStatus;
}

export interface EvidenceAuditRecord {
  auditId: string;
  tenantId: string;
  actorId: string;
  timestamp: string;
  action: EvidenceAuditAction;
  collectionId: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  asOfDate: string;
}

export interface EvidenceReconciliationResult {
  questionId: string;
  securityId: string;
  ticker: string;
  asOfDate: string;
  state: EvidenceReconciliationState;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  partialEvidenceIds: string[];
  missingEvidenceTypes: string[];
  conflictDescription?: string;
  resolutionRequired: boolean;
  recommendedFollowup?: string;
  synthesisNarrative?: string;
  isAnalyticalOnly: true;
  executionProhibited: true;
}

export interface CreateEvidenceCollectionRequest {
  securityId: string;
  monitorId?: string;
  planId?: string;
  taskId?: string;
  questionId?: string;
  gapId?: string;

  sourceType: EvidenceSourceClass;
  sourceTitle: string;
  sourcePublisher: string;
  sourceReference: string;
  sourceUrl?: string;

  publishedAt: string;
  availableAt?: string;
  asOfDate?: string;

  evidenceType?: EvidenceRequirementType;
  epistemicStatus?: EpistemicStatus | 'HYPOTHESIS' | 'SCENARIO_ASSUMPTION' | 'UNAVAILABLE';
  collectionStatus?: CollectionStatus;
  qualityGrade?: EvidenceQualityGrade;

  rawContent?: string;
  findingsSummary?: string;

  supportsQuestion?: boolean;
  contradictsQuestion?: boolean;
  supportsFinding?: boolean;
  contradictsFinding?: boolean;
  relevance?: string;
  provenance?: string;
}

export interface ValidateEvidenceRequest {
  validationNotes?: string;
  qualityGrade?: EvidenceQualityGrade;
  supportsQuestion?: boolean;
  contradictsQuestion?: boolean;
  asOfDate?: string;
}

export interface RejectEvidenceRequest {
  rejectionReason: string;
  asOfDate?: string;
}

export interface SupersedeEvidenceRequest {
  supersedingReason: string;
  sourceTitle?: string;
  sourcePublisher?: string;
  sourceReference?: string;
  sourceUrl?: string;
  publishedAt?: string;
  availableAt?: string;
  rawContent?: string;
  findingsSummary?: string;
  asOfDate?: string;
}

export interface EvidenceOverview {
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  asOfDate: string;
  totalCount: number;
  discoveredCount: number;
  collectedCount: number;
  validatedCount: number;
  conflictingCount: number;
  missingCount: number;
  staleCount: number;
  unavailableCount: number;
  records: EvidenceCollectionRecord[];
  reconciliations: EvidenceReconciliationResult[];
  isAnalyticalOnly: true;
  executionProhibited: true;
}

// ==========================================
// PHASE 36: REAL-DATA INTEGRATION & ANALYST PILOT READINESS
// ==========================================

export interface PilotSecurity {
  securityId: string;
  ticker: string;
  company: string;
  market: MarketRegion;
  country: string;
  currency: 'USD' | 'INR';
  exchange: string;
  isin?: string;
  sector?: string;
  industry?: string;
  providerIdentifier: string;
  epistemicStatus: EpistemicStatus;
  isSimulated: boolean;
}

export type ProviderAuthStatus =
  | 'VERIFIED'
  | 'AUTHENTICATION_REQUIRED'
  | 'FAILED'
  | 'NOT_APPLICABLE';

export interface ProviderHealthAuditItem {
  provider: string;
  canonicalRole: 'US Market Data' | 'India Market Data' | 'Regulatory Evidence' | 'AI Synthesis' | 'Persistent Storage';
  configured: boolean;
  reachable: boolean;
  authentication: ProviderAuthStatus;
  latestSuccessfulRequest: string | null;
  dataReturned: boolean;
  epistemicStatus: EpistemicStatus | 'AVAILABLE' | 'UNAVAILABLE' | 'VERIFIED' | 'UNVERIFIED';
  failureReason: string | null;
  details: string;
}

export interface MarketDataSanityValidationResult {
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  pricePresent: boolean;
  price: number;
  timestampPresent: boolean;
  timestamp: string;
  currencyCorrect: boolean;
  marketCorrect: boolean;
  historicalOrderingCorrect: boolean;
  barsCount: number;
  noDuplicateTimestamps: boolean;
  ohlcRelationshipsValid: boolean;
  volumeNonNegative: boolean;
  datesSensible: boolean;
  isValid: boolean;
  anomalies: string[];
}

export interface SecFilingValidationRecord {
  filingIdentity: string;
  filingType: string;
  filingDate: string;
  accessionNumber: string;
  companyIdentity: string;
  availableTimestamp: string;
  sourceUrl: string;
  provenance: string;
  epistemicStatus: EpistemicStatus;
}

export interface PilotWorkflowExecutionStep {
  step: string;
  description: string;
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
  entityId?: string;
  epistemicStatus?: EpistemicStatus;
  persisted: boolean;
  details?: string;
}

export interface PilotWorkflowVerificationResult {
  securityId: string;
  ticker: string;
  market: MarketRegion;
  currency: 'USD' | 'INR';
  steps: PilotWorkflowExecutionStep[];
  success: boolean;
  thesisId?: string;
  decisionId?: string;
  monitorActive: boolean;
  alertsEvaluated: boolean;
  evidenceCount: number;
  memoryFindingId?: string;
}

export interface PilotReadinessDimension {
  id: string;
  title: string;
  status: 'READY' | 'CONDITIONAL' | 'BLOCKED';
  score: number; // 0 to 100
  weight: number;
  observations: string[];
  gaps: string[];
}

export interface PilotReadinessScorecard {
  overallStatus: 'PILOT_READY' | 'PILOT_READY_WITH_CONDITIONS' | 'NOT_READY';
  overallScore: number;
  evaluatedAt: string;
  universeScope: {
    usSecurities: PilotSecurity[];
    indiaSecurities: PilotSecurity[];
    totalCount: number;
  };
  providerAudits: ProviderHealthAuditItem[];
  marketDataSanity: MarketDataSanityValidationResult[];
  secEvidenceAudit: {
    filingsIngested: number;
    xbrlFactsIngested: number;
    provenanceVerified: boolean;
    sampleFilings: SecFilingValidationRecord[];
  };
  workflowValidations: {
    usWorkflow: PilotWorkflowVerificationResult;
    indiaWorkflow: PilotWorkflowVerificationResult;
    crossCurrencyIsolationVerified: boolean;
    deterministicDecisionsVerified: boolean;
  };
  dimensions: PilotReadinessDimension[];
  blockersAndGaps: string[];
  recommendations: string[];
  isAnalyticalOnly: true;
  executionProhibited: true;
}






