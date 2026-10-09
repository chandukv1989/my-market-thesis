import React, { useState, useMemo, useEffect } from 'react';
import { Stock, ActiveScreen, ResearchPriorityItem, ResearchPrioritySnapshot, ResearchPriorityLevel, DiscoverySignalItem } from '../types';
import { ProvenanceBadge } from './common/ProvenanceBadge';
import {
  Search,
  SlidersHorizontal,
  Bookmark,
  Check,
  Sparkles,
  Info,
  Shield,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  Flame,
  Clock,
  Eye,
  Layers,
  ArrowUpRight,
  Activity,
  FileText,
  TrendingDown,
  Calendar,
  Zap,
  Filter
} from 'lucide-react';

interface DiscoverViewProps {
  stocks: Stock[];
  watchlistTickers: string[];
  onToggleWatchlist: (ticker: string) => void;
  onSelectStock: (ticker: string) => void;
  onNavigate: (screen: ActiveScreen) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  stocks,
  watchlistTickers,
  onToggleWatchlist,
  onSelectStock,
  onNavigate
}) => {
  // Main view tab: 'attention-queue' (Phase 28) vs 'factor-screener'
  const [activeTab, setActiveTab] = useState<'attention-queue' | 'factor-screener'>('attention-queue');

  // Attention Queue State
  const [snapshot, setSnapshot] = useState<ResearchPrioritySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [universe, setUniverse] = useState<'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'MONITORED' | 'RESEARCHED'>('ALL');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'US' | 'INDIA'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | ResearchPriorityLevel>('ALL');
  const [sortBy, setSortBy] = useState<'PRIORITY' | 'SIGNAL_COUNT' | 'PORTFOLIO_WEIGHT' | 'RECENCY'>('PRIORITY');
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [briefings, setBriefings] = useState<Record<string, string>>({});
  const [loadingBriefings, setLoadingBriefings] = useState<Record<string, boolean>>({});

  // Legacy Screener State
  const [minScore, setMinScore] = useState(70);
  const [minGrowth, setMinGrowth] = useState(75);
  const [minQuality, setMinQuality] = useState(75);
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [screenerMarket, setScreenerMarket] = useState<string>('All');
  const [rules, setRules] = useState([
    { id: 'r1', name: 'ROIC > 15% & FCF Yield > 2%', active: true },
    { id: 'r2', name: 'Net Debt / EBITDA < 2.0x', active: true },
    { id: 'r3', name: '3Y Revenue CAGR > 12%', active: true },
    { id: 'r4', name: 'Gross Margin > 50%', active: false }
  ]);

  // Fetch Research Priorities from Server
  const fetchPriorities = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (universe !== 'ALL') params.append('universe', universe);
      if (marketFilter !== 'ALL') params.append('market', marketFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);
      if (asOfDate) params.append('asOfDate', asOfDate);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('sortBy', sortBy);

      const res = await fetch(`/api/discovery/priorities?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load research priorities: ${res.statusText}`);
      }
      const data: ResearchPrioritySnapshot = await res.json();
      setSnapshot(data);
    } catch (err: any) {
      console.error('Error fetching discovery priorities:', err);
      setError(err.message || 'Failed to communicate with discovery engine');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'attention-queue') {
      fetchPriorities();
    }
  }, [universe, marketFilter, priorityFilter, sortBy, asOfDate, activeTab]);

  const toggleItemExpanded = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const generateAIBriefing = async (item: ResearchPriorityItem) => {
    if (loadingBriefings[item.id] || briefings[item.id]) return;
    setLoadingBriefings(prev => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch('/api/discovery/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        const data = await res.json();
        setBriefings(prev => ({ ...prev, [item.id]: data.briefing }));
      }
    } catch (err) {
      console.error('Error generating AI briefing:', err);
    } finally {
      setLoadingBriefings(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const toggleRule = (id: string) => {
    setRules(rules.map(r => (r.id === id ? { ...r, active: !r.active } : r)));
  };

  const filteredStocks = useMemo(() => {
    return stocks.filter(stock => {
      if (screenerMarket !== 'All' && stock.market !== screenerMarket) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTicker = stock.ticker.toLowerCase().includes(q);
        const matchName = stock.name.toLowerCase().includes(q);
        const matchSector = stock.sector.toLowerCase().includes(q);
        const matchWhy = stock.whyThisStock.toLowerCase().includes(q);
        if (!matchTicker && !matchName && !matchSector && !matchWhy) return false;
      }
      if (selectedSector !== 'All' && stock.sector !== selectedSector) return false;
      if (stock.overallScore < minScore) return false;
      if (stock.factorScores.growth < minGrowth) return false;
      if (stock.factorScores.quality < minQuality) return false;
      return true;
    }).sort((a, b) => b.overallScore - a.overallScore);
  }, [stocks, screenerMarket, searchQuery, selectedSector, minScore, minGrowth, minQuality]);

  const sectors = useMemo(() => {
    const set = new Set<string>(['All']);
    stocks.forEach(s => set.add(s.sector));
    return Array.from(set);
  }, [stocks]);

  const getPriorityBadgeClass = (priority: ResearchPriorityLevel) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-950/80 text-red-400 border-red-700/80 shadow-[0_0_8px_rgba(239,68,68,0.25)]';
      case 'HIGH':
        return 'bg-amber-950/80 text-amber-400 border-amber-700/80 shadow-[0_0_6px_rgba(245,158,11,0.2)]';
      case 'MEDIUM':
        return 'bg-sky-950/70 text-sky-400 border-sky-800/60';
      case 'LOW':
        return 'bg-slate-900/80 text-slate-400 border-slate-700/60';
      case 'ROUTINE':
      default:
        return 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50';
    }
  };

  const getSignalIcon = (signalType: string) => {
    switch (signalType) {
      case 'MATERIAL_EVENT':
        return <Flame className="w-3.5 h-3.5 text-amber-400" />;
      case 'THESIS_CHANGE':
        return <Zap className="w-3.5 h-3.5 text-rose-400" />;
      case 'DECISION_DRIFT':
        return <Activity className="w-3.5 h-3.5 text-sky-400" />;
      case 'ALERT_ACTIVE':
        return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
      case 'PORTFOLIO_EXPOSURE':
        return <TrendingDown className="w-3.5 h-3.5 text-amber-300" />;
      case 'RESEARCH_STALENESS':
        return <Clock className="w-3.5 h-3.5 text-slate-400" />;
      case 'EVIDENCE_CONFLICT':
        return <AlertTriangle className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-5 p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1c2b3c] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-bold text-[#d4e4fa] tracking-wider uppercase font-mono-data">
              INVESTMENT DISCOVERY & RESEARCH PRIORITIZATION
            </h1>
            <span className="text-xs font-mono-data text-sky-400 px-2 py-0.5 bg-sky-950/40 border border-sky-800/50 rounded-xs">
              PHASE 28
            </span>
          </div>
          <p className="text-xs text-[#87929a] font-mono-data mt-0.5">
            DETERMINISTIC RESEARCH ATTENTION QUEUE • POINT-IN-TIME PROVENANCE • ANALYTICAL-ONLY
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[#091420] p-1 border border-[#1c2b3c] rounded-xs">
          <button
            onClick={() => setActiveTab('attention-queue')}
            className={`px-3 py-1 text-xs font-mono-data uppercase transition-colors flex items-center gap-1.5 ${
              activeTab === 'attention-queue'
                ? 'bg-[#152a3f] text-[#d4e4fa] font-bold shadow-xs'
                : 'text-[#87929a] hover:text-[#d4e4fa]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            Research Attention Queue
          </button>
          <button
            onClick={() => setActiveTab('factor-screener')}
            className={`px-3 py-1 text-xs font-mono-data uppercase transition-colors flex items-center gap-1.5 ${
              activeTab === 'factor-screener'
                ? 'bg-[#152a3f] text-[#d4e4fa] font-bold shadow-xs'
                : 'text-[#87929a] hover:text-[#d4e4fa]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            Factor Screener
          </button>
        </div>
      </div>

      {/* Compliance / Boundary Banner */}
      <div className="bg-[#091522] border border-[#1c3046] rounded-xs p-3 text-xs flex items-center justify-between gap-4 text-[#8ca0b3] font-mono-data">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-[#d4e4fa]">INSTITUTIONAL INTEGRITY:</strong> This queue determines research attention priority from empirical signals. It is analytical-only and strictly prohibits trade execution or automated rebalancing.
          </span>
        </div>
        <span className="shrink-0 text-[10px] px-2 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 rounded-xs">
          EXECUTION PROHIBITED
        </span>
      </div>

      {/* ATTENTION QUEUE TAB */}
      {activeTab === 'attention-queue' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-[#0b1828] border border-[#1c2b3c] p-3 rounded-xs flex flex-wrap items-center justify-between gap-3 text-xs font-mono-data">
            {/* Left Filter Group */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Universe Selector */}
              <div className="flex items-center gap-1.5 bg-[#07111c] border border-[#1c2b3c] px-2 py-1 rounded-xs">
                <span className="text-[#64748b]">Universe:</span>
                <select
                  value={universe}
                  onChange={e => setUniverse(e.target.value as any)}
                  className="bg-transparent text-[#d4e4fa] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#091420]">All Supported Securities</option>
                  <option value="PORTFOLIO" className="bg-[#091420]">Portfolio Holdings</option>
                  <option value="WATCHLIST" className="bg-[#091420]">Watchlist</option>
                  <option value="MONITORED" className="bg-[#091420]">Monitored Assets</option>
                  <option value="RESEARCHED" className="bg-[#091420]">Researched Notebooks</option>
                </select>
              </div>

              {/* Market Filter */}
              <div className="flex items-center gap-1.5 bg-[#07111c] border border-[#1c2b3c] px-2 py-1 rounded-xs">
                <span className="text-[#64748b]">Market:</span>
                <select
                  value={marketFilter}
                  onChange={e => setMarketFilter(e.target.value as any)}
                  className="bg-transparent text-[#d4e4fa] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#091420]">All Markets</option>
                  <option value="US" className="bg-[#091420]">US Equities (USD)</option>
                  <option value="INDIA" className="bg-[#091420]">Indian Equities (INR)</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-1.5 bg-[#07111c] border border-[#1c2b3c] px-2 py-1 rounded-xs">
                <span className="text-[#64748b]">Priority:</span>
                <select
                  value={priorityFilter}
                  onChange={e => setPriorityFilter(e.target.value as any)}
                  className="bg-transparent text-[#d4e4fa] focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#091420]">All Priorities</option>
                  <option value="CRITICAL" className="bg-[#091420]">Critical</option>
                  <option value="HIGH" className="bg-[#091420]">High</option>
                  <option value="MEDIUM" className="bg-[#091420]">Medium</option>
                  <option value="LOW" className="bg-[#091420]">Low</option>
                  <option value="ROUTINE" className="bg-[#091420]">Routine</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-1.5 bg-[#07111c] border border-[#1c2b3c] px-2 py-1 rounded-xs">
                <span className="text-[#64748b]">Sort:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-transparent text-[#d4e4fa] focus:outline-none cursor-pointer"
                >
                  <option value="PRIORITY" className="bg-[#091420]">Priority Level</option>
                  <option value="SIGNAL_COUNT" className="bg-[#091420]">Signal Count</option>
                  <option value="PORTFOLIO_WEIGHT" className="bg-[#091420]">Portfolio Weight</option>
                  <option value="RECENCY" className="bg-[#091420]">Recent Changes</option>
                </select>
              </div>
            </div>

            {/* Right Group: Search, As-of Date & Refresh */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#64748b] absolute left-2 top-2" />
                <input
                  type="text"
                  placeholder="Search ticker, name, reason..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchPriorities()}
                  className="bg-[#07111c] border border-[#1c2b3c] pl-7 pr-2 py-1 rounded-xs text-[#d4e4fa] placeholder-[#64748b] text-xs focus:border-sky-500 focus:outline-none w-48"
                />
              </div>

              {/* Point-in-time Date Picker */}
              <div className="flex items-center gap-1.5 bg-[#07111c] border border-[#1c2b3c] px-2 py-1 rounded-xs">
                <Calendar className="w-3.5 h-3.5 text-[#64748b]" />
                <input
                  type="date"
                  value={asOfDate}
                  onChange={e => setAsOfDate(e.target.value)}
                  className="bg-transparent text-[#d4e4fa] text-xs focus:outline-none"
                  title="Point-in-Time Evaluation (No Lookahead)"
                />
                {asOfDate && (
                  <button
                    onClick={() => setAsOfDate('')}
                    className="text-[10px] text-[#64748b] hover:text-[#d4e4fa] ml-1"
                    title="Clear As-Of Date"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                onClick={fetchPriorities}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1 bg-[#152a3f] hover:bg-[#1d3854] text-[#d4e4fa] border border-[#223f5e] rounded-xs transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Evaluate</span>
              </button>
            </div>
          </div>

          {/* Breakdown Stats Bar */}
          {snapshot && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 font-mono-data text-xs">
              <div className="bg-[#091420] border border-[#1c2b3c] p-2.5 rounded-xs">
                <div className="text-[10px] text-[#64748b] uppercase">Evaluated Universe</div>
                <div className="text-base font-bold text-[#d4e4fa] mt-0.5">{snapshot.totalSecuritiesEvaluated}</div>
              </div>
              <div className="bg-[#1a0808] border border-red-900/50 p-2.5 rounded-xs">
                <div className="text-[10px] text-red-400 uppercase">Critical Priority</div>
                <div className="text-base font-bold text-red-400 mt-0.5">{snapshot.priorityBreakdown.CRITICAL}</div>
              </div>
              <div className="bg-[#181104] border border-amber-900/50 p-2.5 rounded-xs">
                <div className="text-[10px] text-amber-400 uppercase">High Priority</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">{snapshot.priorityBreakdown.HIGH}</div>
              </div>
              <div className="bg-[#071626] border border-sky-900/50 p-2.5 rounded-xs">
                <div className="text-[10px] text-sky-400 uppercase">Medium Priority</div>
                <div className="text-base font-bold text-sky-400 mt-0.5">{snapshot.priorityBreakdown.MEDIUM}</div>
              </div>
              <div className="bg-[#0c131d] border border-slate-800 p-2.5 rounded-xs">
                <div className="text-[10px] text-slate-400 uppercase">Low Priority</div>
                <div className="text-base font-bold text-slate-400 mt-0.5">{snapshot.priorityBreakdown.LOW}</div>
              </div>
              <div className="bg-[#071a14] border border-emerald-900/50 p-2.5 rounded-xs">
                <div className="text-[10px] text-emerald-400 uppercase">Routine Cadence</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">{snapshot.priorityBreakdown.ROUTINE}</div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-950/40 border border-red-800 text-red-300 p-3 rounded-xs text-xs font-mono-data flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Attention Queue Items */}
          <div className="space-y-3">
            {isLoading && !snapshot && (
              <div className="p-12 text-center text-xs font-mono-data text-[#64748b] bg-[#091420] border border-[#1c2b3c] rounded-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-400" />
                Aggregating canonical events, monitors, decisions, and alerts across discovery universe...
              </div>
            )}

            {snapshot && snapshot.items.length === 0 && (
              <div className="p-8 text-center text-xs font-mono-data text-[#64748b] bg-[#091420] border border-[#1c2b3c] rounded-xs">
                No securities matched current filter criteria.
              </div>
            )}

            {snapshot?.items.map(item => {
              const isExpanded = !!expandedItems[item.id];
              const briefing = briefings[item.id];
              const isBriefingLoading = !!loadingBriefings[item.id];

              return (
                <div
                  key={item.id}
                  className="bg-[#0b1726] border border-[#1c2b3c] hover:border-[#2b415a] rounded-xs transition-all font-mono-data overflow-hidden"
                >
                  {/* Card Header Row */}
                  <div className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-[#0a1523]">
                    {/* Left: Ticker & Security Info */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleItemExpanded(item.id)}
                        className="text-[#64748b] hover:text-[#d4e4fa] p-0.5 transition-colors"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-[#d4e4fa] tracking-wide">
                          {item.symbol}
                        </span>
                        <span className="text-xs text-[#8ca0b3] font-normal truncate max-w-xs">
                          {item.companyName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#122336] text-[#8ca0b3] border border-[#1c2b3c] rounded-xs">
                          {item.market} • {item.currency}
                        </span>
                      </div>

                      {/* Priority Badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 border rounded-xs ${getPriorityBadgeClass(
                          item.priority
                        )}`}
                      >
                        {item.priority}
                      </span>

                      {/* Convergence Badge */}
                      {item.signalConvergenceScore > 1 && (
                        <span className="text-[10px] px-2 py-0.5 bg-purple-950/60 text-purple-300 border border-purple-800/60 rounded-xs flex items-center gap-1">
                          <Layers className="w-3 h-3 text-purple-400" />
                          {item.signalConvergenceScore} Signals Converging
                        </span>
                      )}

                      {/* Portfolio Holding Badge */}
                      {item.portfolioExposure?.hasPosition && (
                        <span className="text-[10px] px-2 py-0.5 bg-amber-950/40 text-amber-300 border border-amber-800/50 rounded-xs">
                          HELD ({item.portfolioExposure.weightPct?.toFixed(1)}% / {item.currency})
                        </span>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => generateAIBriefing(item)}
                        disabled={isBriefingLoading}
                        className="text-[11px] px-2.5 py-1 bg-[#102235] hover:bg-[#18314c] text-sky-300 border border-sky-800/40 rounded-xs flex items-center gap-1.5 transition-colors"
                        title="Generate Institutional Synthesis with Gemini"
                      >
                        <Sparkles className={`w-3 h-3 ${isBriefingLoading ? 'animate-spin' : 'text-sky-400'}`} />
                        <span>{briefing ? 'AI Briefing Ready' : isBriefingLoading ? 'Synthesizing...' : 'AI Synthesis'}</span>
                      </button>

                      <button
                        onClick={() => {
                          onSelectStock(item.symbol);
                          onNavigate('monitor');
                        }}
                        className="text-[11px] px-2.5 py-1 bg-[#1a334d] hover:bg-[#234568] text-[#d4e4fa] border border-[#2b4c73] rounded-xs flex items-center gap-1 transition-colors"
                      >
                        <span>Review Workspace</span>
                        <ArrowUpRight className="w-3 h-3 text-sky-400" />
                      </button>

                      <button
                        onClick={() => {
                          onSelectStock(item.symbol);
                          onNavigate('deep-dive');
                        }}
                        className="text-[11px] px-2 py-1 bg-[#0d1c2d] hover:bg-[#162d46] text-[#8ca0b3] hover:text-[#d4e4fa] border border-[#1c2b3c] rounded-xs transition-colors"
                      >
                        Deep Dive
                      </button>
                    </div>
                  </div>

                  {/* Primary Reason Banner */}
                  <div className="px-3.5 py-2 border-t border-[#152332] bg-[#0c1827] flex items-center justify-between text-xs text-[#b8c9db]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#64748b]">Driver:</span>
                      <span className="text-[#e2edf8] font-medium">{item.primaryReason}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#64748b]">
                      <span>Signals: <strong className="text-[#8ca0b3]">{item.signalCount}</strong></span>
                      <span>Alerts: <strong className={item.activeAlertCount > 0 ? 'text-red-400 font-bold' : 'text-[#8ca0b3]'}>{item.activeAlertCount}</strong></span>
                      <span>Freshness: <strong className="text-[#8ca0b3]">{item.freshnessStatus}</strong></span>
                    </div>
                  </div>

                  {/* AI Briefing Box (if generated) */}
                  {briefing && (
                    <div className="mx-3.5 my-2 p-2.5 bg-[#081524] border border-sky-900/60 rounded-xs text-xs text-sky-200/90 leading-relaxed flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[10px] text-sky-400 uppercase font-bold tracking-wider mb-0.5">
                          Institutional Synthesis (Gemini 2.5)
                        </div>
                        <p>{briefing}</p>
                      </div>
                    </div>
                  )}

                  {/* Expanded Signals Details */}
                  {isExpanded && (
                    <div className="p-3.5 border-t border-[#152332] bg-[#07111c] space-y-3">
                      <div className="text-[11px] text-[#64748b] uppercase tracking-wider font-bold">
                        Firing Empirical Signals ({item.signals.length})
                      </div>

                      {item.signals.length === 0 ? (
                        <div className="text-xs text-[#64748b] italic">
                          No active stress or anomaly signals detected. Routine cadence.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {item.signals.map(sig => (
                            <div
                              key={sig.signalId}
                              className="bg-[#0b1726] border border-[#1c2b3c] p-2.5 rounded-xs space-y-1 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {getSignalIcon(sig.signalType)}
                                  <span className="font-bold text-[#d4e4fa]">{sig.title}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 bg-[#122336] text-[#8ca0b3] border border-[#1c2b3c] rounded-xs">
                                    {sig.signalType}
                                  </span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 font-bold rounded-xs ${
                                      sig.severity === 'CRITICAL'
                                        ? 'bg-red-950 text-red-400 border border-red-800'
                                        : sig.severity === 'HIGH'
                                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                        : 'bg-sky-950 text-sky-400 border border-sky-800'
                                    }`}
                                  >
                                    {sig.severity}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 text-[10px] text-[#64748b]">
                                  <span>{sig.detectedAt?.slice(0, 10)}</span>
                                  <span className="text-sky-400/80">[{sig.engine}]</span>
                                </div>
                              </div>

                              <p className="text-[#8ca0b3] text-[11px] leading-relaxed pl-5">
                                {sig.summary}
                              </p>

                              {sig.observedDelta && (
                                <div className="pl-5 text-[11px] text-[#64748b] flex items-center gap-1.5">
                                  <strong className="text-[#8ca0b3]">Observed:</strong>
                                  <span>{sig.observedDelta}</span>
                                </div>
                              )}

                              {sig.causalNote && (
                                <div className="pl-5 text-[10px] text-amber-400/70 italic">
                                  Note: {sig.causalNote}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Evidence Status Bar */}
                      <div className="bg-[#091420] border border-[#1c2b3c] p-2 rounded-xs flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#8ca0b3]">
                        <div className="flex items-center gap-4">
                          <span>Evidence Count: <strong className="text-[#d4e4fa]">{item.evidenceStatus.totalCount}</strong></span>
                          <span>Conflicts: <strong className={item.evidenceStatus.conflictCount > 0 ? 'text-purple-400 font-bold' : 'text-[#d4e4fa]'}>{item.evidenceStatus.conflictCount}</strong></span>
                          <span>Gaps: <strong className="text-[#d4e4fa]">{item.evidenceStatus.gapCount}</strong></span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[#64748b]">Provenance:</span>
                          <span className={`px-1.5 py-0.2 rounded-xs text-[10px] ${item.isSimulated ? 'bg-amber-950/60 text-amber-400 border border-amber-800' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'}`}>
                            {item.epistemicStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FACTOR SCREENER TAB (Legacy Matrix) */}
      {activeTab === 'factor-screener' && (
        <div className="space-y-4">
          <div className="bg-[#0b1828] border border-[#1c2b3c] p-4 rounded-xs text-xs font-mono-data space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#152535] pb-3">
              <span className="text-sm font-bold text-[#d4e4fa]">MULTI-FACTOR SCREENING CRITERIA</span>
              <div className="flex items-center gap-2">
                <span className="text-[#64748b]">Market:</span>
                <select
                  value={screenerMarket}
                  onChange={e => setScreenerMarket(e.target.value)}
                  className="bg-[#07111c] border border-[#1c2b3c] px-2 py-1 text-[#d4e4fa] rounded-xs"
                >
                  <option value="All">All Markets</option>
                  <option value="US">US Equities</option>
                  <option value="INDIA">Indian Equities</option>
                </select>

                <span className="text-[#64748b] ml-2">Sector:</span>
                <select
                  value={selectedSector}
                  onChange={e => setSelectedSector(e.target.value)}
                  className="bg-[#07111c] border border-[#1c2b3c] px-2 py-1 text-[#d4e4fa] rounded-xs"
                >
                  {sectors.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="flex justify-between text-[#8ca0b3] mb-1">
                  <span>Min Overall Score:</span>
                  <strong className="text-[#d4e4fa]">{minScore}</strong>
                </div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  value={minScore}
                  onChange={e => setMinScore(Number(e.target.value))}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[#8ca0b3] mb-1">
                  <span>Min Growth Score:</span>
                  <strong className="text-[#d4e4fa]">{minGrowth}</strong>
                </div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  value={minGrowth}
                  onChange={e => setMinGrowth(Number(e.target.value))}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[#8ca0b3] mb-1">
                  <span>Min Quality Score:</span>
                  <strong className="text-[#d4e4fa]">{minQuality}</strong>
                </div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  value={minQuality}
                  onChange={e => setMinQuality(Number(e.target.value))}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Rules Toggles */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-[#64748b]">Fundamental Rules:</span>
              {rules.map(rule => (
                <button
                  key={rule.id}
                  onClick={() => toggleRule(rule.id)}
                  className={`px-2.5 py-1 text-[11px] rounded-xs border transition-colors flex items-center gap-1.5 ${
                    rule.active
                      ? 'bg-sky-950/70 border-sky-700/80 text-sky-300 font-bold'
                      : 'bg-[#07111c] border-[#1c2b3c] text-[#64748b] hover:text-[#d4e4fa]'
                  }`}
                >
                  {rule.active && <Check className="w-3 h-3 text-sky-400" />}
                  <span>{rule.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Screener Results Table */}
          <div className="bg-[#0b1828] border border-[#1c2b3c] rounded-xs overflow-hidden font-mono-data text-xs">
            <div className="p-3 bg-[#091420] border-b border-[#1c2b3c] flex items-center justify-between text-[#8ca0b3]">
              <span>Matching Securities: <strong className="text-[#d4e4fa]">{filteredStocks.length}</strong></span>
              <span className="text-[11px] text-[#64748b]">Click security to open deep dive</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1c2b3c] text-[#64748b] text-[11px] bg-[#07111c]">
                    <th className="p-3">Security</th>
                    <th className="p-3">Sector</th>
                    <th className="p-3">Overall</th>
                    <th className="p-3">Growth</th>
                    <th className="p-3">Quality</th>
                    <th className="p-3">Value</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#152332]">
                  {filteredStocks.map(stock => (
                    <tr
                      key={stock.ticker}
                      className="hover:bg-[#0e1d2e] cursor-pointer transition-colors"
                      onClick={() => onSelectStock(stock.ticker)}
                    >
                      <td className="p-3">
                        <div className="font-bold text-[#d4e4fa]">{stock.ticker}</div>
                        <div className="text-[11px] text-[#64748b]">{stock.name}</div>
                      </td>
                      <td className="p-3 text-[#8ca0b3]">{stock.sector}</td>
                      <td className="p-3">
                        <span className="font-bold text-sky-400">{stock.overallScore}</span>
                      </td>
                      <td className="p-3 text-[#8ca0b3]">{stock.factorScores.growth}</td>
                      <td className="p-3 text-[#8ca0b3]">{stock.factorScores.quality}</td>
                      <td className="p-3 text-[#8ca0b3]">{stock.factorScores.value}</td>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onToggleWatchlist(stock.ticker)}
                            className="p-1 text-[#64748b] hover:text-amber-400"
                            title="Toggle Watchlist"
                          >
                            <Bookmark className={`w-3.5 h-3.5 ${watchlistTickers.includes(stock.ticker) ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                          <button
                            onClick={() => {
                              onSelectStock(stock.ticker);
                              onNavigate('monitor');
                            }}
                            className="text-[10px] px-2 py-0.5 bg-[#152a3f] hover:bg-[#1d3854] text-[#d4e4fa] border border-[#223f5e] rounded-xs"
                          >
                            Monitor
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
