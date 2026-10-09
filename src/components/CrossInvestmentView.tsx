/**
 * Phase 30: Cross-Investment Intelligence & Exposure Relationship Analysis
 * 
 * Interactive institutional workspace answering:
 * "How are my investments connected, what common exposures or drivers exist,
 * and which relationships deserve further research?"
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true, executionProhibited: true
 * - Fully deterministic relationship mapping and clustering
 * - Strict Currency Isolation (USD vs INR)
 * - Separation of observed correlative co-movement from evidenced causality
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Network,
  Share2,
  Layers,
  Table,
  Cpu,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Sparkles,
  Info,
  Calendar,
  Eye,
  FileText,
  BarChart2,
  TrendingUp,
  X,
  ChevronRight
} from 'lucide-react';
import {
  ActiveScreen,
  CrossInvestmentIntelligenceData,
  InvestmentRelationship,
  InvestmentRelationshipType,
  RelationshipCluster,
  CommonDriverItem,
  RelationshipAttentionItem,
  MarketRegion,
  EpistemicStatus
} from '../types';

interface CrossInvestmentViewProps {
  onNavigate: (screen: ActiveScreen) => void;
  onSelectStock?: (ticker: string) => void;
  onOpenEvidence?: (evidence: any) => void;
}

export const CrossInvestmentView: React.FC<CrossInvestmentViewProps> = ({
  onNavigate,
  onSelectStock,
  onOpenEvidence
}) => {
  // State
  const [data, setData] = useState<CrossInvestmentIntelligenceData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [scope, setScope] = useState<'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'MONITORED'>('ALL');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'US' | 'INDIA'>('ALL');
  const [selectedType, setSelectedType] = useState<InvestmentRelationshipType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState<string>('');

  // Active Tab: overview | graph | table | clusters | drivers
  const [activeTab, setActiveTab] = useState<'overview' | 'graph' | 'table' | 'clusters' | 'drivers'>('overview');

  // Selected Security for Detail Drawer
  const [selectedSecurityId, setSelectedSecurityId] = useState<string | null>(null);

  // Fetch Cross-Investment data
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (scope !== 'ALL') params.append('scope', scope);
      if (marketFilter !== 'ALL') params.append('market', marketFilter);
      if (asOfDate) params.append('asOfDate', asOfDate);

      const res = await fetch(`/api/cross-investment?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load cross-investment intelligence: HTTP ${res.status}`);
      }
      const json: CrossInvestmentIntelligenceData = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [scope, marketFilter, asOfDate]);

  // Filtered Relationships for Table and Graph
  const filteredRelationships = useMemo(() => {
    if (!data?.relationships) return [];
    return data.relationships.filter(rel => {
      const matchesType = selectedType === 'ALL' || rel.relationshipType === selectedType;
      const matchesSearch =
        !searchQuery ||
        rel.securitySymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rel.relatedSecuritySymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rel.securityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rel.basis.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rel.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [data?.relationships, selectedType, searchQuery]);

  // Selected security details for the drawer
  const selectedSecurityDetails = useMemo(() => {
    if (!selectedSecurityId || !data) return null;
    const rels = data.relationships.filter(
      r => r.securityId === selectedSecurityId || r.relatedSecurityId === selectedSecurityId ||
           r.securitySymbol === selectedSecurityId || r.relatedSecuritySymbol === selectedSecurityId
    );
    const firstRel = rels[0];
    const isPrimary = firstRel?.securityId === selectedSecurityId || firstRel?.securitySymbol === selectedSecurityId;
    const symbol = isPrimary ? firstRel?.securitySymbol : firstRel?.relatedSecuritySymbol || selectedSecurityId;
    const name = isPrimary ? firstRel?.securityName : firstRel?.relatedSecurityName || symbol;
    const market = isPrimary ? firstRel?.market : firstRel?.relatedMarket || 'US';

    const drivers = data.commonDrivers.filter(d =>
      d.affectedSecurities.some(s => s.securityId === selectedSecurityId || s.symbol === symbol)
    );

    const clusters = data.clusters.filter(c =>
      c.securities.some(s => s.securityId === selectedSecurityId || s.symbol === symbol)
    );

    return {
      symbol,
      name,
      market,
      relationships: rels,
      drivers,
      clusters
    };
  }, [selectedSecurityId, data]);

  const getEpistemicBadge = (status: EpistemicStatus) => {
    switch (status) {
      case 'REAL':
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">REAL PROVENANCE</span>;
      case 'CALCULATED':
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">CALCULATED</span>;
      case 'SIMULATED':
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-purple-950/80 text-purple-400 border border-purple-500/30">SIMULATED</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-amber-950/80 text-amber-400 border border-amber-500/30">{status}</span>;
    }
  };

  const getCausalBadge = (assertion: string) => {
    switch (assertion) {
      case 'OBSERVED_CORRELATION':
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-sky-950/60 text-sky-300 border border-sky-500/20" title="Statistical correlation observed. Does not imply causation.">OBSERVED CO-MOVEMENT</span>;
      case 'SHARED_ATTRIBUTE':
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-slate-800 text-slate-300 border border-slate-700">SHARED DIMENSION</span>;
      case 'INSUFFICIENT_EVIDENCE':
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-amber-950/40 text-amber-300 border border-amber-600/30" title="Empirical linkage observed but insufficient evidence for causal transmission.">CAUSALITY UNPROVEN</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-slate-900 text-slate-400 border border-slate-800">{assertion}</span>;
    }
  };

  const getTypeColor = (type: InvestmentRelationshipType) => {
    switch (type) {
      case 'STRUCTURAL': return 'text-sky-400 border-sky-500/40 bg-sky-950/30';
      case 'PORTFOLIO_EXPOSURE': return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30';
      case 'MARKET': return 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30';
      case 'EVENT': return 'text-amber-400 border-amber-500/40 bg-amber-950/30';
      case 'THESIS': return 'text-rose-400 border-rose-500/40 bg-rose-950/30';
      case 'EVIDENCE': return 'text-indigo-400 border-indigo-500/40 bg-indigo-950/30';
      case 'DECISION': return 'text-purple-400 border-purple-500/40 bg-purple-950/30';
      case 'COMMON_DRIVER': return 'text-teal-400 border-teal-500/40 bg-teal-950/30';
      default: return 'text-slate-400 border-slate-700 bg-slate-900';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#051424] text-[#d4e4fa] overflow-y-auto">
      {/* 1. Header Bar */}
      <div className="border-b border-[#1e3a5f]/60 bg-[#071b30]/90 px-6 py-4 sticky top-0 z-20 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded">
              <Network className="w-5 h-5 text-[#38bdf8]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white font-mono uppercase">
                  Cross-Investment Intelligence
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono tracking-widest bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                  PHASE 30 ACTIVE
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono tracking-widest bg-slate-800 text-slate-300 border border-slate-700">
                  ANALYTICAL ONLY
                </span>
              </div>
              <p className="text-xs text-[#87929a] font-mono mt-0.5">
                Deterministic exposure mapping, multi-asset clustering & common driver analysis (Zero Autonomous Trading)
              </p>
            </div>
          </div>

          {/* Universal Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Scope Filter */}
            <div className="flex items-center bg-[#0b213a] border border-[#1e3a5f] rounded overflow-hidden p-0.5">
              {(['ALL', 'PORTFOLIO', 'WATCHLIST', 'MONITORED'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                    scope === s
                      ? 'bg-[#38bdf8] text-[#051424] font-bold'
                      : 'text-[#87929a] hover:text-[#d4e4fa] hover:bg-[#122e4d]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Market Filter */}
            <div className="flex items-center bg-[#0b213a] border border-[#1e3a5f] rounded overflow-hidden p-0.5">
              {(['ALL', 'US', 'INDIA'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMarketFilter(m)}
                  className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                    marketFilter === m
                      ? 'bg-[#10b981] text-[#051424] font-bold'
                      : 'text-[#87929a] hover:text-[#d4e4fa] hover:bg-[#122e4d]'
                  }`}
                >
                  {m === 'ALL' ? 'GLOBAL' : m}
                </button>
              ))}
            </div>

            {/* PIT Date Input */}
            <div className="flex items-center bg-[#0b213a] border border-[#1e3a5f] rounded px-2 py-1">
              <Calendar className="w-3.5 h-3.5 text-[#87929a] mr-1.5" />
              <input
                type="date"
                value={asOfDate ? asOfDate.slice(0, 10) : ''}
                onChange={e => setAsOfDate(e.target.value)}
                className="bg-transparent text-xs text-[#d4e4fa] font-mono outline-none"
                title="Point-in-Time asOfDate"
              />
              {asOfDate && (
                <button
                  onClick={() => setAsOfDate('')}
                  className="ml-1 text-[10px] text-[#87929a] hover:text-white"
                  title="Clear PIT boundary (use latest)"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-1.5 bg-[#0b213a] border border-[#1e3a5f] hover:border-[#38bdf8]/50 text-[#87929a] hover:text-[#38bdf8] rounded transition-colors"
              title="Refresh intelligence"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#38bdf8]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 mt-4 border-t border-[#1e3a5f]/40 pt-2">
          {[
            { id: 'overview', label: 'Overview & Attention', icon: AlertTriangle },
            { id: 'graph', label: 'Topology & Heatmap', icon: Share2 },
            { id: 'table', label: 'Relationship Ledger', icon: Table },
            { id: 'clusters', label: `Clusters (${data?.clusters.length || 0})`, icon: Layers },
            { id: 'drivers', label: `Common Drivers (${data?.commonDrivers.length || 0})`, icon: Cpu }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-mono transition-all rounded ${
                  isActive
                    ? 'bg-[#1e3a5f] text-white font-bold border border-[#38bdf8]/40 shadow-sm'
                    : 'text-[#87929a] hover:text-[#d4e4fa] hover:bg-[#0b213a]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#38bdf8]' : 'text-[#87929a]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Body Canvas */}
      <div className="p-6 space-y-6 flex-1">
        {error && (
          <div className="p-4 bg-rose-950/40 border border-rose-500/40 text-rose-300 rounded flex items-center justify-between font-mono text-xs">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>{error}</span>
            </div>
            <button onClick={fetchData} className="underline hover:text-white">Retry</button>
          </div>
        )}

        {/* 2. Executive Briefing Box */}
        {data?.executiveBriefing && (
          <div className="bg-[#0b213a]/80 border border-[#1e3a5f] rounded-lg p-5 relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e3a5f]/50 mb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-[#38bdf8]" />
                <span className="text-xs font-mono font-bold tracking-wider text-white uppercase">
                  Cross-Investment Executive Briefing
                </span>
                {data.executiveBriefing.isAIGenerated ? (
                  <span className="px-2 py-0.5 text-[9px] font-mono tracking-wider bg-purple-950/80 text-purple-300 border border-purple-500/30">
                    GEMINI SYNTHESIS
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[9px] font-mono tracking-wider bg-slate-800 text-slate-300 border border-slate-700" title={data.executiveBriefing.fallbackReason}>
                    DETERMINISTIC BRIEFING (CIRCUIT ACTIVE)
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[#87929a] font-mono">
                Evaluated: {new Date(data.metadata.evaluatedAt).toLocaleTimeString()}
              </span>
            </div>

            <p className="text-sm text-[#d4e4fa] leading-relaxed mb-3">
              {data.executiveBriefing.summaryText}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {data.executiveBriefing.keyObservations.map((obs, idx) => (
                <div key={idx} className="bg-[#071b30] border border-[#1e3a5f]/50 p-2.5 rounded text-xs text-[#b8c7d9] flex items-start space-x-2">
                  <span className="font-mono text-[#38bdf8] font-bold">{idx + 1}.</span>
                  <span>{obs}</span>
                </div>
              ))}
            </div>

            {data.executiveBriefing.topActionableFocus && (
              <div className="mt-3 p-2.5 bg-[#071b30]/60 border-l-2 border-[#f59e0b] rounded-r text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[#f59e0b] font-bold uppercase text-[10px]">Actionable Focus:</span>
                  <span className="text-[#d4e4fa]">{data.executiveBriefing.topActionableFocus}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Cross-Investment Attention Items */}
        {data?.attentionItems && data.attentionItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-[#f59e0b]" />
                <h2 className="text-xs font-mono font-bold tracking-wider text-white uppercase">
                  Cross-Investment Attention Queue ({data.attentionItems.length})
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#87929a]">
                Neutral analytical surveillance for multi-holding concentrations & shared vulnerabilities
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.attentionItems.map(item => (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border transition-all ${
                    item.severity === 'CRITICAL'
                      ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-400'
                      : item.severity === 'HIGH'
                      ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-400'
                      : 'bg-[#0b213a] border-[#1e3a5f] hover:border-[#38bdf8]/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider rounded ${
                      item.severity === 'CRITICAL' ? 'bg-rose-500 text-black' :
                      item.severity === 'HIGH' ? 'bg-amber-500 text-black' : 'bg-slate-700 text-white'
                    }`}>
                      {item.severity} PRIORITY
                    </span>
                    <span className="text-[10px] font-mono text-[#87929a]">
                      {item.attentionType}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-white mb-1.5">
                    {item.title}
                  </h3>

                  <p className="text-xs text-[#87929a] leading-snug mb-3">
                    {item.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.affectedSecurities.map(sym => (
                      <button
                        key={sym}
                        onClick={() => setSelectedSecurityId(sym)}
                        className="px-2 py-0.5 text-xs font-mono font-bold bg-[#122e4d] text-[#38bdf8] hover:bg-[#38bdf8] hover:text-[#051424] border border-[#1e3a5f] rounded transition-colors"
                      >
                        {sym}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-[#1e3a5f]/40 flex items-center justify-between">
                    <span className="text-[10px] text-[#87929a] font-mono italic truncate max-w-[200px]" title={item.recommendedAction}>
                      {item.recommendedAction}
                    </span>
                    {item.deepLinkUrl && (
                      <button
                        onClick={() => {
                          if (item.deepLinkUrl?.includes('monitor')) onNavigate('monitor');
                          else if (item.deepLinkUrl?.includes('portfolio')) onNavigate('portfolio');
                          else if (item.deepLinkUrl?.includes('command-center')) onNavigate('command-center');
                        }}
                        className="text-xs font-mono text-[#38bdf8] hover:underline flex items-center space-x-1 shrink-0 ml-2"
                      >
                        <span>Investigate</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Tab Views */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { label: 'Structural', count: data?.relationships.filter(r => r.relationshipType === 'STRUCTURAL').length || 0, type: 'STRUCTURAL' },
                { label: 'Portfolio', count: data?.relationships.filter(r => r.relationshipType === 'PORTFOLIO_EXPOSURE').length || 0, type: 'PORTFOLIO_EXPOSURE' },
                { label: 'Market', count: data?.relationships.filter(r => r.relationshipType === 'MARKET').length || 0, type: 'MARKET' },
                { label: 'Event', count: data?.relationships.filter(r => r.relationshipType === 'EVENT').length || 0, type: 'EVENT' },
                { label: 'Thesis', count: data?.relationships.filter(r => r.relationshipType === 'THESIS').length || 0, type: 'THESIS' },
                { label: 'Evidence', count: data?.relationships.filter(r => r.relationshipType === 'EVIDENCE').length || 0, type: 'EVIDENCE' },
                { label: 'Decision', count: data?.relationships.filter(r => r.relationshipType === 'DECISION').length || 0, type: 'DECISION' },
                { label: 'Drivers', count: data?.commonDrivers.length || 0, type: 'COMMON_DRIVER' }
              ].map(stat => (
                <button
                  key={stat.label}
                  onClick={() => {
                    setSelectedType(stat.type as any);
                    setActiveTab('table');
                  }}
                  className="bg-[#0b213a] border border-[#1e3a5f] hover:border-[#38bdf8]/50 p-3 rounded text-left transition-colors"
                >
                  <div className="text-[10px] font-mono text-[#87929a] uppercase truncate">{stat.label}</div>
                  <div className="text-lg font-bold text-white font-mono mt-0.5">{stat.count}</div>
                </button>
              ))}
            </div>

            {/* Top Connected Relationships & Drivers Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Highlighted Relationships */}
              <div className="bg-[#0b213a] border border-[#1e3a5f] rounded-lg p-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e3a5f] mb-4">
                  <div className="flex items-center space-x-2">
                    <Table className="w-4 h-4 text-[#38bdf8]" />
                    <h3 className="text-xs font-mono font-bold uppercase text-white tracking-wider">
                      Material Cross-Holding Relationships
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('table')}
                    className="text-xs font-mono text-[#38bdf8] hover:underline"
                  >
                    View All ({data?.relationships.length || 0})
                  </button>
                </div>

                <div className="space-y-2.5">
                  {data?.relationships.slice(0, 6).map(rel => (
                    <div
                      key={rel.id}
                      onClick={() => setSelectedSecurityId(rel.securitySymbol)}
                      className="p-3 bg-[#071b30] border border-[#1e3a5f]/60 hover:border-[#38bdf8]/40 rounded cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-white text-xs">{rel.securitySymbol}</span>
                          <span className="text-[#87929a] font-mono text-[10px]">⇄</span>
                          <span className="font-mono font-bold text-white text-xs">{rel.relatedSecuritySymbol}</span>
                          <span className={`px-2 py-0.2 text-[9px] font-mono uppercase rounded ${getTypeColor(rel.relationshipType)}`}>
                            {rel.relationshipType}
                          </span>
                        </div>
                        <div className="text-xs text-[#87929a]">{rel.basis}</div>
                      </div>

                      <div className="text-right">
                        {rel.metric !== undefined && rel.metric !== null && (
                          <div className="text-xs font-mono font-bold text-[#38bdf8]">
                            {typeof rel.metric === 'number' ? rel.metric.toFixed(2) : String(rel.metric)}
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-[#87929a]">{rel.epistemicState}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Common Drivers Summary */}
              <div className="bg-[#0b213a] border border-[#1e3a5f] rounded-lg p-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e3a5f] mb-4">
                  <div className="flex items-center space-x-2">
                    <Cpu className="w-4 h-4 text-[#10b981]" />
                    <h3 className="text-xs font-mono font-bold uppercase text-white tracking-wider">
                      Shared Macro & Supply Chain Drivers
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('drivers')}
                    className="text-xs font-mono text-[#10b981] hover:underline"
                  >
                    View All ({data?.commonDrivers.length || 0})
                  </button>
                </div>

                <div className="space-y-3">
                  {data?.commonDrivers.map(driver => (
                    <div
                      key={driver.id}
                      className="p-3 bg-[#071b30] border border-[#1e3a5f]/60 rounded space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{driver.name}</span>
                        <span className="px-2 py-0.5 text-[9px] font-mono tracking-wider bg-slate-800 text-slate-300 rounded border border-slate-700">
                          {driver.driverType}
                        </span>
                      </div>
                      <p className="text-xs text-[#87929a] line-clamp-2">{driver.description}</p>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-mono text-[#87929a]">Affected:</span>
                        {driver.affectedSecurities.map(s => (
                          <button
                            key={s.symbol}
                            onClick={() => setSelectedSecurityId(s.symbol)}
                            className="px-1.5 py-0.5 text-[10px] font-mono bg-[#122e4d] text-[#38bdf8] hover:bg-[#38bdf8] hover:text-[#051424] rounded"
                          >
                            {s.symbol}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Topology Graph & Correlation Heatmap Tab */}
        {activeTab === 'graph' && (
          <div className="space-y-6">
            <div className="bg-[#0b213a] border border-[#1e3a5f] rounded-lg p-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#1e3a5f] mb-4">
                <div className="flex items-center space-x-2">
                  <Share2 className="w-4 h-4 text-[#38bdf8]" />
                  <h3 className="text-xs font-mono font-bold uppercase text-white tracking-wider">
                    Interactive Universe Relationship Network
                  </h3>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-[#87929a]">Click any node for full connectivity profile</span>
                </div>
              </div>

              {/* Network Graph Visualizer (SVG Topology) */}
              <div className="w-full h-96 bg-[#071b30] border border-[#1e3a5f]/60 rounded-lg relative overflow-hidden flex items-center justify-center">
                <svg className="w-full h-full">
                  <defs>
                    <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>

                  {/* Draw edges for high relationships */}
                  {data?.relationships.slice(0, 24).map((rel, idx) => {
                    const total = Math.min(24, data.relationships.length);
                    const angle1 = (idx / total) * 2 * Math.PI;
                    const angle2 = ((idx + 7) / total) * 2 * Math.PI;
                    const cx = 400;
                    const cy = 190;
                    const r = 140;
                    const x1 = cx + r * Math.cos(angle1);
                    const y1 = cy + r * Math.sin(angle1);
                    const x2 = cx + r * Math.cos(angle2);
                    const y2 = cy + r * Math.sin(angle2);

                    return (
                      <line
                        key={rel.id}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="url(#edgeGrad)"
                        strokeWidth="1.5"
                        strokeDasharray={rel.relationshipType === 'MARKET' ? '4 2' : undefined}
                      />
                    );
                  })}

                  {/* Draw nodes */}
                  {data?.relationships.slice(0, 14).map((rel, idx) => {
                    const total = 14;
                    const angle = (idx / total) * 2 * Math.PI;
                    const cx = 400;
                    const cy = 190;
                    const r = 140;
                    const x = cx + r * Math.cos(angle);
                    const y = cy + r * Math.sin(angle);
                    const sym = rel.securitySymbol;

                    return (
                      <g
                        key={`node-${sym}-${idx}`}
                        className="cursor-pointer group"
                        onClick={() => setSelectedSecurityId(sym)}
                      >
                        <circle
                          cx={x}
                          cy={y}
                          r="18"
                          className="fill-[#0b213a] stroke-[#38bdf8] group-hover:stroke-[#10b981] group-hover:fill-[#122e4d] transition-all"
                          strokeWidth="2"
                        />
                        <text
                          x={x}
                          y={y + 4}
                          textAnchor="middle"
                          className="font-mono text-[10px] font-bold fill-white pointer-events-none"
                        >
                          {sym.slice(0, 4)}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div className="absolute bottom-3 left-3 bg-[#051424]/90 border border-[#1e3a5f] p-2 rounded text-[10px] font-mono text-[#87929a] space-y-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-0.5 bg-[#38bdf8] inline-block"></span>
                    <span>Direct Structural / Portfolio Link</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-0.5 bg-emerald-400 border-dashed border-b inline-block"></span>
                    <span>Empirical Market Return Correlation</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pairwise Market Co-Movement Heatmap Table */}
            {data?.marketRelationshipSummary && (
              <div className="bg-[#0b213a] border border-[#1e3a5f] rounded-lg p-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#1e3a5f] mb-4">
                  <div className="flex items-center space-x-2">
                    <BarChart2 className="w-4 h-4 text-[#10b981]" />
                    <h3 className="text-xs font-mono font-bold uppercase text-white tracking-wider">
                      Pairwise Return Correlation Matrix (Currency-Isolated)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 border border-emerald-500/20">
                    USD / INR ISOLATION ENFORCED
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.marketRelationshipSummary.pairwiseCorrelations.slice(0, 9).map(pair => (
                    <div
                      key={`${pair.pair[0]}-${pair.pair[1]}`}
                      className="p-3 bg-[#071b30] border border-[#1e3a5f]/60 rounded flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 font-mono font-bold text-xs text-white">
                          <span>{pair.pair[0]}</span>
                          <span className="text-[#87929a]">⇄</span>
                          <span>{pair.pair[1]}</span>
                          <span className="text-[9px] px-1.5 py-0.2 bg-[#051424] text-[#87929a] rounded">
                            {pair.market}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#87929a] font-mono">
                          90D Lookback (63 bars)
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-sm font-mono font-bold ${
                          pair.correlation >= 0.75 ? 'text-rose-400' :
                          pair.correlation >= 0.50 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          r = {pair.correlation.toFixed(2)}
                        </div>
                        <div className="text-[9px] font-mono text-[#87929a]">
                          {pair.epistemicState}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. Relationship Table Tab */}
        {activeTab === 'table' && (
          <div className="bg-[#0b213a] border border-[#1e3a5f] rounded-lg overflow-hidden">
            {/* Table Search & Filter Bar */}
            <div className="p-4 border-b border-[#1e3a5f] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2 flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#87929a]" />
                <input
                  type="text"
                  placeholder="Search by security, basis, description..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-[#071b30] border border-[#1e3a5f] text-xs text-[#d4e4fa] px-3 py-1.5 rounded outline-none w-full font-mono"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Filter className="w-3.5 h-3.5 text-[#87929a]" />
                <select
                  value={selectedType}
                  onChange={e => setSelectedType(e.target.value as any)}
                  className="bg-[#071b30] border border-[#1e3a5f] text-xs text-[#d4e4fa] px-2.5 py-1.5 rounded font-mono outline-none"
                >
                  <option value="ALL">All Relationship Types</option>
                  <option value="STRUCTURAL">Structural</option>
                  <option value="PORTFOLIO_EXPOSURE">Portfolio Exposure</option>
                  <option value="MARKET">Market Co-Movement</option>
                  <option value="EVENT">Shared Event</option>
                  <option value="THESIS">Shared Thesis Risk</option>
                  <option value="EVIDENCE">Common Evidence</option>
                  <option value="DECISION">Decision Revision</option>
                  <option value="COMMON_DRIVER">Common Driver</option>
                </select>
                <span className="text-xs font-mono text-[#87929a]">
                  Showing {filteredRelationships.length} relationships
                </span>
              </div>
            </div>

            {/* Table Canvas */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-[#071b30] border-b border-[#1e3a5f] text-[#87929a] text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-4">Pair</th>
                    <th className="py-3 px-4">Relationship Type</th>
                    <th className="py-3 px-4">Basis & Metric</th>
                    <th className="py-3 px-4">Causal Assertion</th>
                    <th className="py-3 px-4">Epistemic</th>
                    <th className="py-3 px-4">As Of</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e3a5f]/40">
                  {filteredRelationships.map(rel => (
                    <tr
                      key={rel.id}
                      className="hover:bg-[#122e4d]/40 transition-colors cursor-pointer"
                      onClick={() => setSelectedSecurityId(rel.securitySymbol)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-xs">{rel.securitySymbol}</span>
                          <span className="text-[#87929a]">⇄</span>
                          <span className="font-bold text-white text-xs">{rel.relatedSecuritySymbol}</span>
                        </div>
                        <div className="text-[10px] text-[#87929a] truncate max-w-[160px]">
                          {rel.securityName}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-[10px] font-mono uppercase rounded border ${getTypeColor(rel.relationshipType)}`}>
                          {rel.relationshipType}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{rel.basis}</div>
                        <div className="text-[11px] text-[#87929a] line-clamp-1">{rel.description}</div>
                        {rel.metric !== undefined && rel.metric !== null && (
                          <div className="text-[10px] text-[#38bdf8] font-bold mt-0.5">
                            Metric: {typeof rel.metric === 'number' ? rel.metric.toFixed(2) : String(rel.metric)}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {getCausalBadge(rel.causalAssertion)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {getEpistemicBadge(rel.epistemicState)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-[#87929a] text-[10px]">
                        {rel.asOfDate.slice(0, 10)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (rel.deepLinkUrl?.includes('monitor')) onNavigate('monitor');
                            else if (rel.deepLinkUrl?.includes('portfolio')) onNavigate('portfolio');
                            else if (rel.deepLinkUrl?.includes('deep-dive')) {
                              if (onSelectStock) onSelectStock(rel.securitySymbol);
                              onNavigate('deep-dive');
                            }
                          }}
                          className="px-2.5 py-1 text-[11px] font-mono bg-[#122e4d] text-[#38bdf8] hover:bg-[#38bdf8] hover:text-[#051424] rounded border border-[#1e3a5f] transition-colors"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. Deterministic Clusters Tab */}
        {activeTab === 'clusters' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.clusters.map(cluster => (
              <div
                key={cluster.id}
                className="bg-[#0b213a] border border-[#1e3a5f] hover:border-[#38bdf8]/40 rounded-lg p-5 space-y-3 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 text-[9px] font-mono uppercase rounded border ${getTypeColor(cluster.clusterType)}`}>
                    {cluster.clusterType}
                  </span>
                  <span className="text-[10px] font-mono text-[#87929a]">
                    {cluster.securities.length} Securities
                  </span>
                </div>

                <h3 className="text-sm font-bold text-white tracking-tight">
                  {cluster.name}
                </h3>

                <p className="text-xs text-[#87929a] leading-relaxed">
                  {cluster.description}
                </p>

                {/* Common Dimensions */}
                <div className="flex flex-wrap gap-1.5 py-1">
                  {cluster.commonDimensions.map((dim, idx) => (
                    <span key={idx} className="px-2 py-0.5 text-[10px] font-mono bg-[#071b30] text-[#d4e4fa] border border-[#1e3a5f] rounded">
                      {dim.dimension}: <strong className="text-[#38bdf8]">{dim.value}</strong>
                    </span>
                  ))}
                </div>

                {/* Securities Badges */}
                <div className="space-y-1.5 pt-2 border-t border-[#1e3a5f]/40">
                  <div className="text-[10px] font-mono text-[#87929a] uppercase">Member Assets:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {cluster.securities.map(sec => (
                      <button
                        key={sec.symbol}
                        onClick={() => setSelectedSecurityId(sec.symbol)}
                        className="px-2 py-0.5 text-xs font-mono font-bold bg-[#071b30] hover:bg-[#38bdf8] hover:text-[#051424] text-[#38bdf8] border border-[#1e3a5f] rounded transition-colors"
                      >
                        {sec.symbol}
                        {sec.portfolioWeightPct && (
                          <span className="text-[9px] font-normal text-emerald-400 ml-1">
                            ({sec.portfolioWeightPct.toFixed(1)}%)
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Portfolio Exposure if any */}
                {cluster.portfolioExposure && (
                  <div className="pt-2 border-t border-[#1e3a5f]/40 flex items-center justify-between text-xs font-mono">
                    <span className="text-[#87929a]">Combined Portfolio Allocation:</span>
                    <span className="text-emerald-400 font-bold">
                      {cluster.portfolioExposure.totalWeightPct}% ({cluster.portfolioExposure.positionCount} positions)
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 8. Common Drivers Tab */}
        {activeTab === 'drivers' && (
          <div className="space-y-4">
            {data?.commonDrivers.map(driver => (
              <div
                key={driver.id}
                className="bg-[#0b213a] border border-[#1e3a5f] rounded-lg p-5 space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#1e3a5f]">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-white font-mono">{driver.name}</h3>
                      <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider bg-slate-800 text-slate-300 rounded border border-slate-700">
                        {driver.driverType}
                      </span>
                    </div>
                    <p className="text-xs text-[#87929a] mt-1">{driver.description}</p>
                  </div>

                  {driver.portfolioExposurePct !== undefined && driver.portfolioExposurePct > 0 && (
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-[#87929a] uppercase">Portfolio Exposure</div>
                      <div className="text-sm font-mono font-bold text-emerald-400">
                        {driver.portfolioExposurePct}%
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Affected Securities */}
                  <div className="space-y-2">
                    <div className="text-xs font-mono font-bold text-[#38bdf8] uppercase">
                      Affected Universe Assets ({driver.affectedSecurities.length})
                    </div>
                    <div className="space-y-1.5">
                      {driver.affectedSecurities.map(s => (
                        <div
                          key={s.symbol}
                          onClick={() => setSelectedSecurityId(s.symbol)}
                          className="p-2 bg-[#071b30] border border-[#1e3a5f]/60 hover:border-[#38bdf8]/40 rounded cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-white">{s.symbol}</span>
                            <span className="text-[#87929a] text-[11px]">{s.companyName}</span>
                          </div>
                          {s.exposureRole && (
                            <span className="text-[10px] font-mono text-[#38bdf8]">{s.exposureRole}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Thesis Risks & Provenance */}
                  <div className="space-y-3">
                    {driver.associatedThesisRiskAreas && (
                      <div>
                        <div className="text-xs font-mono font-bold text-[#f59e0b] uppercase mb-1.5">
                          Associated Thesis Risk Sensitivities
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {driver.associatedThesisRiskAreas.map(r => (
                            <span key={r} className="px-2 py-0.5 text-[10px] font-mono bg-amber-950/40 text-amber-300 border border-amber-600/30 rounded">
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs font-mono font-bold text-[#87929a] uppercase mb-1.5">
                        Analytical Provenance & Sources
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {driver.provenance.map(p => (
                          <span key={p} className="px-2 py-0.5 text-[10px] font-mono bg-[#071b30] text-[#87929a] border border-[#1e3a5f] rounded">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 9. Security Detail Side Sheet / Drawer */}
      {selectedSecurityDetails && (
        <div className="fixed inset-y-0 right-0 w-96 bg-[#071b30] border-l border-[#1e3a5f] shadow-2xl z-50 flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-[#1e3a5f] flex items-center justify-between sticky top-0 bg-[#071b30] z-10">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white font-mono">
                  {selectedSecurityDetails.symbol}
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-mono bg-[#122e4d] text-[#38bdf8] border border-[#1e3a5f] rounded">
                  {selectedSecurityDetails.market}
                </span>
              </div>
              <p className="text-xs text-[#87929a] truncate max-w-[240px]">
                {selectedSecurityDetails.name}
              </p>
            </div>
            <button
              onClick={() => setSelectedSecurityId(null)}
              className="p-1 text-[#87929a] hover:text-white rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-5 flex-1">
            {/* Quick Deep Links */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (onSelectStock) onSelectStock(selectedSecurityDetails.symbol);
                  onNavigate('deep-dive');
                }}
                className="p-2 bg-[#0b213a] border border-[#1e3a5f] hover:border-[#38bdf8]/50 text-xs font-mono text-white rounded flex items-center justify-center space-x-1"
              >
                <span>Deep Dive</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#38bdf8]" />
              </button>
              <button
                onClick={() => onNavigate('monitor')}
                className="p-2 bg-[#0b213a] border border-[#1e3a5f] hover:border-[#38bdf8]/50 text-xs font-mono text-white rounded flex items-center justify-center space-x-1"
              >
                <span>Monitor Review</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#38bdf8]" />
              </button>
            </div>

            {/* Clusters Membership */}
            {selectedSecurityDetails.clusters.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-mono font-bold text-[#87929a] uppercase">Cluster Memberships</div>
                <div className="space-y-1.5">
                  {selectedSecurityDetails.clusters.map(c => (
                    <div key={c.id} className="p-2 bg-[#0b213a] border border-[#1e3a5f]/60 rounded text-xs text-[#d4e4fa]">
                      <div className="font-bold">{c.name}</div>
                      <div className="text-[10px] text-[#87929a]">{c.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drivers Impact */}
            {selectedSecurityDetails.drivers.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-mono font-bold text-[#87929a] uppercase">Shared Drivers</div>
                <div className="space-y-1.5">
                  {selectedSecurityDetails.drivers.map(d => (
                    <div key={d.id} className="p-2 bg-[#0b213a] border border-[#1e3a5f]/60 rounded text-xs text-[#d4e4fa]">
                      <div className="font-bold text-[#10b981]">{d.name}</div>
                      <div className="text-[10px] text-[#87929a]">{d.driverType}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pairwise Connected Network */}
            <div className="space-y-2">
              <div className="text-xs font-mono font-bold text-[#87929a] uppercase">
                Pairwise Connections ({selectedSecurityDetails.relationships.length})
              </div>
              <div className="space-y-2">
                {selectedSecurityDetails.relationships.map(rel => {
                  const otherSym = rel.securitySymbol === selectedSecurityDetails.symbol
                    ? rel.relatedSecuritySymbol
                    : rel.securitySymbol;
                  return (
                    <div
                      key={rel.id}
                      className="p-2.5 bg-[#0b213a] border border-[#1e3a5f] rounded space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-white">{otherSym}</span>
                        <span className={`px-1.5 py-0.2 text-[9px] uppercase rounded ${getTypeColor(rel.relationshipType)}`}>
                          {rel.relationshipType}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#87929a]">{rel.basis}</div>
                      {rel.metric !== undefined && rel.metric !== null && (
                        <div className="text-[10px] text-[#38bdf8] font-mono">
                          Metric: {typeof rel.metric === 'number' ? rel.metric.toFixed(2) : String(rel.metric)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
