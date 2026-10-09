/**
 * Phase 29: Investment Research Command Center
 * 
 * Institutional Analyst Cockpit & Research Orchestration Landing Surface.
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Reuses canonical intelligence engines; zero duplicate scoring or trading execution.
 * - Point-in-time consistency with universal asOfDate.
 * - Native currency isolation (USD vs INR).
 * - Epistemic integrity with zero upgrading.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Activity,
  Layers,
  FileText,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Info,
  Database,
  Briefcase,
  Radar,
  ArrowRight,
  X,
  Compass,
  CheckCircle2,
  Clock,
  Cpu,
  BookOpen,
  ShieldCheck
} from 'lucide-react';
import {
  CommandCenterViewData,
  ResearchPriorityItem,
  AlertInstance,
  CommandCenterThesisDecisionChange,
  CommandCenterMaterialEvent,
  ActiveScreen,
  EvidenceSource
} from '../types';

interface CommandCenterViewProps {
  onNavigate: (screen: ActiveScreen) => void;
  onSelectStock: (tickerOrId: string) => void;
  onOpenEvidence: (evidence: EvidenceSource) => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  onNavigate,
  onSelectStock,
  onOpenEvidence
}) => {
  const [data, setData] = useState<CommandCenterViewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [scope, setScope] = useState<'ALL' | 'PORTFOLIO' | 'WATCHLIST' | 'MONITORED' | 'RESEARCHED'>('ALL');
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'US' | 'INDIA'>('ALL');
  const [selectedSecurity, setSelectedSecurity] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchCommandCenterData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (scope) params.append('scope', scope);
      if (asOfDate) params.append('asOfDate', asOfDate);
      if (marketFilter !== 'ALL') params.append('market', marketFilter);

      const res = await fetch(`/api/command-center?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch command center data: ${res.statusText}`);
      }
      const json: CommandCenterViewData = await res.json();
      setData(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [scope, asOfDate, marketFilter]);

  useEffect(() => {
    fetchCommandCenterData();
  }, [fetchCommandCenterData]);

  // Handle alert quick actions
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const res = await fetch(`/api/orchestrated-alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Analyst acknowledged from Command Center' })
      });
      if (!res.ok) throw new Error('Acknowledge failed');
      setActionSuccessMessage(`Alert ${alertId} acknowledged.`);
      setTimeout(() => setActionSuccessMessage(null), 3000);
      fetchCommandCenterData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const res = await fetch(`/api/orchestrated-alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNote: 'Resolved by analyst from Command Center' })
      });
      if (!res.ok) throw new Error('Resolve failed');
      setActionSuccessMessage(`Alert ${alertId} resolved.`);
      setTimeout(() => setActionSuccessMessage(null), 3000);
      fetchCommandCenterData();
    } catch (err) {
      console.error(err);
    }
  };

  // Navigating to Review Workspace
  const handleOpenReview = (symbolOrId: string) => {
    onSelectStock(symbolOrId);
    onNavigate('monitor');
  };

  const handleOpenDeepDive = (symbolOrId: string) => {
    onSelectStock(symbolOrId);
    onNavigate('deep-dive');
  };

  const handleOpenResearch = (symbolOrId: string) => {
    onSelectStock(symbolOrId);
    onNavigate('research');
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-[#87929a] font-mono-data">
        <RefreshCw className="w-8 h-8 animate-spin text-[#38bdf8] mb-3" />
        <div className="text-sm font-semibold tracking-wider uppercase text-[#d4e4fa]">
          Initializing Research Command Center
        </div>
        <div className="text-xs text-[#87929a] mt-1">
          Aggregating canonical intelligence from Portfolio, Discovery, Alerts, Events, and Monitor engines...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 font-mono-data">
        <div className="bg-[#1e131d] border border-[#f43f5e]/40 rounded-xs p-6 text-[#f43f5e]">
          <div className="flex items-center gap-2 font-bold text-sm mb-2">
            <AlertTriangle className="w-5 h-5 text-[#f43f5e]" />
            COMMAND CENTER AGGREGATION ERROR
          </div>
          <div className="text-xs text-[#f43f5e]/90">{error}</div>
          <button
            onClick={() => fetchCommandCenterData()}
            className="mt-4 px-3 py-1.5 bg-[#f43f5e]/20 hover:bg-[#f43f5e]/30 border border-[#f43f5e]/40 rounded-xs text-xs text-[#d4e4fa] transition-colors cursor-pointer"
          >
            Retry Aggregation
          </button>
        </div>
      </div>
    );
  }

  const {
    metadata,
    summary,
    researchAttentionQueue,
    activeAlerts,
    portfolioPulse,
    thesisAndDecisionChanges,
    materialEvents,
    researchCoverage,
    evidenceHealth,
    executiveBriefing
  } = data!;

  // Find security for drawer if selected
  const activeDetailSecurity = selectedSecurity
    ? researchAttentionQueue.find(i => i.symbol === selectedSecurity || i.securityId === selectedSecurity) ||
      thesisAndDecisionChanges.find(i => i.symbol === selectedSecurity || i.securityId === selectedSecurity)
    : null;

  return (
    <div className="flex flex-col min-h-full p-4 lg:p-6 space-y-6 max-w-[1700px] mx-auto select-none">
      {/* 1. TOP HEADER & UNIVERSAL CONTROLS */}
      <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4 lg:p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded-xs text-[#38bdf8]">
                <Activity className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-[#d4e4fa] tracking-wider uppercase font-mono-data flex items-center gap-2">
                  Investment Research Command Center
                  <span className="text-[10px] px-2 py-0.5 bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8] font-mono-data rounded-xs">
                    ORCHESTRATION COCKPIT
                  </span>
                </h1>
                <p className="text-xs text-[#87929a] font-mono-data mt-0.5">
                  Unified institutional cockpit answering "What changed & what requires research attention?"
                </p>
              </div>
            </div>
          </div>

          {/* Universal Controls & Filter Bar */}
          <div className="flex flex-wrap items-center gap-3 font-mono-data text-xs">
            {/* Scope Filter */}
            <div className="flex items-center bg-[#051424] border border-[#1c2b3c] rounded-xs px-2.5 py-1">
              <span className="text-[#87929a] mr-2 text-[11px] uppercase">Scope:</span>
              <select
                value={scope}
                onChange={e => setScope(e.target.value as any)}
                className="bg-transparent text-[#d4e4fa] focus:outline-hidden text-xs cursor-pointer"
              >
                <option value="ALL" className="bg-[#090d14]">ALL SECURITIES</option>
                <option value="PORTFOLIO" className="bg-[#090d14]">PORTFOLIO HOLDINGS</option>
                <option value="WATCHLIST" className="bg-[#090d14]">WATCHLIST</option>
                <option value="MONITORED" className="bg-[#090d14]">MONITORED THESES</option>
                <option value="RESEARCHED" className="bg-[#090d14]">COVERED RESEARCH</option>
              </select>
            </div>

            {/* Market Filter */}
            <div className="flex items-center bg-[#051424] border border-[#1c2b3c] rounded-xs px-2.5 py-1">
              <span className="text-[#87929a] mr-2 text-[11px] uppercase">Market:</span>
              <select
                value={marketFilter}
                onChange={e => setMarketFilter(e.target.value as any)}
                className="bg-transparent text-[#d4e4fa] focus:outline-hidden text-xs cursor-pointer"
              >
                <option value="ALL" className="bg-[#090d14]">ALL MARKETS</option>
                <option value="US" className="bg-[#090d14]">US (USD)</option>
                <option value="INDIA" className="bg-[#090d14]">INDIA (INR)</option>
              </select>
            </div>

            {/* Universal Point-in-Time (PIT) Date Picker */}
            <div className="flex items-center bg-[#051424] border border-[#1c2b3c] rounded-xs px-2.5 py-1">
              <Clock className="w-3.5 h-3.5 text-[#38bdf8] mr-2" />
              <span className="text-[#87929a] mr-2 text-[11px] uppercase">As-Of (PIT):</span>
              <input
                type="date"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                className="bg-transparent text-[#d4e4fa] focus:outline-hidden text-xs cursor-pointer"
              />
              {asOfDate && (
                <button
                  onClick={() => setAsOfDate('')}
                  className="ml-2 text-[#87929a] hover:text-[#f43f5e] text-[10px]"
                  title="Reset to latest evaluation"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchCommandCenterData()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#38bdf8] border border-[#38bdf8]/40 rounded-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Phase 36 Pilot Readiness Button */}
            {onNavigate && (
              <button
                onClick={() => onNavigate('pilot-readiness')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10b981]/15 hover:bg-[#10b981]/25 text-[#10b981] border border-[#10b981]/40 rounded-xs transition-colors cursor-pointer"
                title="View Phase 36 Pilot Readiness & Real-Data Audit"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Pilot Readiness</span>
              </button>
            )}
          </div>
        </div>

        {/* Status & Guardrails Strip */}
        <div className="mt-3 pt-3 border-t border-[#1c2b3c]/60 flex flex-wrap items-center justify-between text-[11px] font-mono-data text-[#87929a]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span>Last evaluated: {new Date(metadata.evaluatedAt).toLocaleTimeString()}</span>
            </span>
            {asOfDate ? (
              <span className="px-2 py-0.5 bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30 rounded-xs font-semibold">
                HISTORICAL PIT: As of {asOfDate}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 rounded-xs font-semibold">
                CURRENT EVALUATION
              </span>
            )}
            <span className="text-[#87929a]">Universe: {metadata.universeScope} ({summary.totalUniverseCount} securities)</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#051424] border border-[#1c2b3c] text-[#87929a] rounded-xs">
              IS_ANALYTICAL_ONLY: TRUE
            </span>
            <span className="px-2 py-0.5 bg-[#051424] border border-[#1c2b3c] text-[#87929a] rounded-xs">
              EXECUTION_PROHIBITED: TRUE
            </span>
          </div>
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="p-3 bg-[#10b981]/15 border border-[#10b981]/40 rounded-xs text-[#10b981] text-xs font-mono-data flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* 2. ATTENTION SUMMARY BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 font-mono-data">
        {/* Critical Research */}
        <div className={`p-3 rounded-xs border ${summary.criticalResearchCount > 0 ? 'bg-[#1e131d] border-[#f43f5e]/40' : 'bg-[#090d14] border-[#1c2b3c]'}`}>
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">Critical Priority</div>
          <div className={`text-xl font-bold mt-1 ${summary.criticalResearchCount > 0 ? 'text-[#f43f5e]' : 'text-[#d4e4fa]'}`}>
            {summary.criticalResearchCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">Emergency review</div>
        </div>

        {/* High Research */}
        <div className={`p-3 rounded-xs border ${summary.highResearchCount > 0 ? 'bg-[#1e1814] border-[#f97316]/40' : 'bg-[#090d14] border-[#1c2b3c]'}`}>
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">High Priority</div>
          <div className={`text-xl font-bold mt-1 ${summary.highResearchCount > 0 ? 'text-[#f97316]' : 'text-[#d4e4fa]'}`}>
            {summary.highResearchCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">High attention</div>
        </div>

        {/* Active Alerts */}
        <div className={`p-3 rounded-xs border ${summary.activeAlertsCount > 0 ? 'bg-[#1e1a14] border-[#f59e0b]/40' : 'bg-[#090d14] border-[#1c2b3c]'}`}>
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">Active Alerts</div>
          <div className={`text-xl font-bold mt-1 ${summary.activeAlertsCount > 0 ? 'text-[#f59e0b]' : 'text-[#d4e4fa]'}`}>
            {summary.activeAlertsCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">Unresolved instances</div>
        </div>

        {/* Thesis Changes */}
        <div className={`p-3 rounded-xs border ${summary.thesisChangesCount > 0 ? 'bg-[#1a1524] border-[#a855f7]/40' : 'bg-[#090d14] border-[#1c2b3c]'}`}>
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">Thesis Changes</div>
          <div className={`text-xl font-bold mt-1 ${summary.thesisChangesCount > 0 ? 'text-[#a855f7]' : 'text-[#d4e4fa]'}`}>
            {summary.thesisChangesCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">Weakened / under review</div>
        </div>

        {/* Decision Changes */}
        <div className={`p-3 rounded-xs border ${summary.decisionChangesCount > 0 ? 'bg-[#0a1824] border-[#38bdf8]/40' : 'bg-[#090d14] border-[#1c2b3c]'}`}>
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">Decision Deltas</div>
          <div className={`text-xl font-bold mt-1 ${summary.decisionChangesCount > 0 ? 'text-[#38bdf8]' : 'text-[#d4e4fa]'}`}>
            {summary.decisionChangesCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">Score or rating shift</div>
        </div>

        {/* Material Events */}
        <div className="p-3 bg-[#090d14] border border-[#1c2b3c] rounded-xs">
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">Material Events</div>
          <div className="text-xl font-bold mt-1 text-[#d4e4fa]">
            {summary.materialEventsCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">SEC / regulatory / corp</div>
        </div>

        {/* Research Gaps */}
        <div className={`p-3 rounded-xs border ${summary.researchGapsCount > 0 ? 'bg-[#131b26] border-[#38bdf8]/20' : 'bg-[#090d14] border-[#1c2b3c]'}`}>
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">Research Gaps</div>
          <div className="text-xl font-bold mt-1 text-[#87929a]">
            {summary.researchGapsCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">Uncovered securities</div>
        </div>

        {/* Stale Research */}
        <div className={`p-3 rounded-xs border ${summary.staleResearchCount > 0 ? 'bg-[#181a1d] border-[#eab308]/20' : 'bg-[#090d14] border-[#1c2b3c]'}`}>
          <div className="text-[10px] text-[#87929a] uppercase tracking-wider">Stale Coverage</div>
          <div className="text-xl font-bold mt-1 text-[#eab308]">
            {summary.staleResearchCount}
          </div>
          <div className="text-[10px] text-[#87929a] mt-0.5">&gt;60 days unrefreshed</div>
        </div>
      </div>

      {/* 3. EXECUTIVE RESEARCH BRIEFING (GEMINI WITH SAFE FALLBACK) */}
      <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4 font-mono-data">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse" />
            <h2 className="text-xs font-bold text-[#38bdf8] tracking-wider uppercase">
              Executive Research Briefing
            </h2>
            <span className="text-[10px] text-[#87929a]">
              {executiveBriefing.isAIGenerated ? '(AI Synthesized)' : '(Deterministic Template)'}
            </span>
          </div>
          <span className="text-[10px] text-[#87929a]">
            Generated: {new Date(executiveBriefing.generatedAt).toLocaleTimeString()}
          </span>
        </div>

        <p className="text-xs text-[#d4e4fa] leading-relaxed mb-3">
          {executiveBriefing.summaryText}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-[#1c2b3c]/60 text-[11px]">
          {executiveBriefing.keyObservations.map((obs, idx) => (
            <div key={idx} className="flex items-start gap-2 text-[#87929a]">
              <span className="text-[#38bdf8] font-bold mt-0.5">•</span>
              <span className="text-[#cbd5e1]">{obs}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-2 border-t border-[#1c2b3c]/40 flex items-center justify-between text-xs">
          <span className="text-[#87929a]">
            <strong className="text-[#38bdf8]">Top Actionable Focus:</strong> {executiveBriefing.topActionableFocus}
          </span>
        </div>
      </div>

      {/* 4. CROSS-SYSTEM ATTENTION FLOW (VISUAL AUDIT TRACE) */}
      <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-3 font-mono-data text-xs overflow-x-auto">
        <div className="text-[10px] font-semibold text-[#87929a] uppercase tracking-wider mb-2">
          Deterministic Cross-System Attention Trace
        </div>
        <div className="flex items-center gap-2 min-w-[700px] text-[11px]">
          <span className="px-2 py-1 bg-[#051424] border border-[#1c2b3c] rounded-xs text-[#38bdf8]">
            1. SEC Filing / Event (P24)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#87929a]" />
          <span className="px-2 py-1 bg-[#051424] border border-[#1c2b3c] rounded-xs text-[#d4e4fa]">
            2. Decision Delta (P23)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#87929a]" />
          <span className="px-2 py-1 bg-[#051424] border border-[#1c2b3c] rounded-xs text-[#a855f7]">
            3. Thesis Health (P25)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#87929a]" />
          <span className="px-2 py-1 bg-[#051424] border border-[#1c2b3c] rounded-xs text-[#f59e0b]">
            4. Alert Policy (P27)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#87929a]" />
          <span className="px-2 py-1 bg-[#051424] border border-[#1c2b3c] rounded-xs text-[#f43f5e] font-semibold">
            5. Research Priority (P28)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#87929a]" />
          <span className="px-2 py-1 bg-[#38bdf8]/15 border border-[#38bdf8]/40 rounded-xs text-[#38bdf8] font-semibold">
            6. Review Workspace (P26)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-[#87929a]" />
          <button
            onClick={() => onNavigate('cross-investment')}
            className="px-2 py-1 bg-[#10b981]/15 hover:bg-[#10b981]/25 border border-[#10b981]/40 rounded-xs text-[#10b981] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            title="Inspect multi-holding cross-investment exposure & clusters"
          >
            <span>7. Cross-Investment Exposure (P30)</span>
            <ExternalLink className="w-3 h-3 ml-0.5" />
          </button>
        </div>
      </div>

      {/* 5. MAIN 2-COLUMN INSTITUTIONAL BENTO */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Research Queue & Alerts (7 cols) */}
        <div className="xl:col-span-7 space-y-6">
          {/* SECTION A: Research Attention Queue (Phase 28) */}
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2b3c] mb-3">
              <div className="flex items-center gap-2 font-mono-data">
                <Compass className="w-4 h-4 text-[#38bdf8]" />
                <h3 className="text-xs font-bold text-[#d4e4fa] uppercase tracking-wider">
                  Research Attention Queue
                </h3>
                <span className="text-[10px] text-[#87929a]">
                  ({researchAttentionQueue.length} prioritized items)
                </span>
              </div>
              <button
                onClick={() => onNavigate('discover')}
                className="text-[11px] font-mono-data text-[#38bdf8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Full Discovery</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {researchAttentionQueue.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#87929a] font-mono-data">
                No active research attention priorities detected for this scope.
              </div>
            ) : (
              <div className="space-y-2">
                {researchAttentionQueue.slice(0, 7).map(item => {
                  const priorityColors: Record<string, string> = {
                    CRITICAL: 'bg-[#f43f5e]/15 border-[#f43f5e]/40 text-[#f43f5e]',
                    HIGH: 'bg-[#f97316]/15 border-[#f97316]/40 text-[#f97316]',
                    MEDIUM: 'bg-[#f59e0b]/15 border-[#f59e0b]/40 text-[#f59e0b]',
                    ROUTINE: 'bg-[#38bdf8]/10 border-[#38bdf8]/30 text-[#87929a]'
                  };

                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-[#051424] border border-[#1c2b3c] hover:border-[#38bdf8]/50 rounded-xs transition-colors font-mono-data"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedSecurity(item.symbol)}
                            className="font-bold text-sm text-[#38bdf8] hover:underline cursor-pointer"
                          >
                            {item.symbol}
                          </button>
                          <span className="text-xs text-[#87929a] truncate max-w-[180px]">
                            {item.companyName}
                          </span>
                          <span className="text-[10px] text-[#87929a] px-1 bg-[#090d14] border border-[#1c2b3c] rounded-xs">
                            {item.market}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-xs border ${priorityColors[item.priority] || priorityColors.ROUTINE}`}>
                            {item.priority}
                          </span>
                          <span className="text-[10px] text-[#87929a] bg-[#090d14] px-1.5 py-0.5 border border-[#1c2b3c] rounded-xs">
                            Signals: {item.signalConvergenceScore}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-[#d4e4fa] mt-1.5 line-clamp-1">
                        {item.primaryReason}
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1c2b3c]/60 text-[10px]">
                        <div className="flex items-center gap-1.5 text-[#87929a] flex-wrap">
                          {item.reasons.slice(0, 3).map((r, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-[#090d14] border border-[#1c2b3c] rounded-xs text-[9px]">
                              {r}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenReview(item.symbol)}
                            className="text-[#38bdf8] hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>Open Review</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION B: Active Alerts (Phase 27) */}
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2b3c] mb-3">
              <div className="flex items-center gap-2 font-mono-data">
                <ShieldAlert className="w-4 h-4 text-[#f59e0b]" />
                <h3 className="text-xs font-bold text-[#d4e4fa] uppercase tracking-wider">
                  Active Monitoring Alerts
                </h3>
                <span className="text-[10px] text-[#87929a]">
                  ({activeAlerts.length} unresolved)
                </span>
              </div>
              <button
                onClick={() => onNavigate('alerts')}
                className="text-[11px] font-mono-data text-[#38bdf8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Alert Manager</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeAlerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#87929a] font-mono-data">
                No active unresolved alerts matching current scope.
              </div>
            ) : (
              <div className="space-y-2">
                {activeAlerts.slice(0, 5).map(alert => {
                  const severityBadge = alert.severity === 'CRITICAL'
                    ? 'bg-[#f43f5e]/15 border-[#f43f5e]/40 text-[#f43f5e]'
                    : alert.severity === 'HIGH'
                    ? 'bg-[#f97316]/15 border-[#f97316]/40 text-[#f97316]'
                    : 'bg-[#f59e0b]/15 border-[#f59e0b]/40 text-[#f59e0b]';

                  return (
                    <div
                      key={alert.alertId}
                      className="p-3 bg-[#051424] border border-[#1c2b3c] rounded-xs font-mono-data"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-xs border ${severityBadge}`}>
                            {alert.severity}
                          </span>
                          <button
                            onClick={() => setSelectedSecurity(alert.symbol || alert.securityId)}
                            className="font-bold text-xs text-[#38bdf8] hover:underline cursor-pointer"
                          >
                            {alert.symbol || alert.securityId}
                          </button>
                          <span className="text-xs text-[#d4e4fa] font-semibold truncate max-w-[220px]">
                            {alert.title}
                          </span>
                        </div>

                        <span className="text-[10px] text-[#87929a]">
                          {new Date(alert.detectedAt).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#87929a] mt-1">
                        {alert.description || alert.primaryReason}
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1c2b3c]/60 text-[10px]">
                        <span className="text-[#87929a]">
                          Rule: <span className="text-[#d4e4fa]">{alert.ruleType}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          {alert.status === 'DELIVERED' && (
                            <button
                              onClick={() => handleAcknowledgeAlert(alert.alertId)}
                              className="px-2 py-0.5 bg-[#090d14] hover:bg-[#1c2b3c] border border-[#1c2b3c] text-[#d4e4fa] rounded-xs cursor-pointer"
                            >
                              Acknowledge
                            </button>
                          )}
                          <button
                            onClick={() => handleResolveAlert(alert.alertId)}
                            className="px-2 py-0.5 bg-[#10b981]/15 hover:bg-[#10b981]/25 border border-[#10b981]/30 text-[#10b981] rounded-xs cursor-pointer"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => handleOpenReview(alert.symbol || alert.securityId)}
                            className="text-[#38bdf8] hover:underline font-semibold cursor-pointer"
                          >
                            Review Workspace
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION C: Material Events Feed (Phase 24) */}
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2b3c] mb-3">
              <div className="flex items-center gap-2 font-mono-data">
                <FileText className="w-4 h-4 text-[#38bdf8]" />
                <h3 className="text-xs font-bold text-[#d4e4fa] uppercase tracking-wider">
                  Recent Material Investment Events
                </h3>
                <span className="text-[10px] text-[#87929a]">
                  (Phase 24 Event Intelligence)
                </span>
              </div>
            </div>

            {materialEvents.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#87929a] font-mono-data">
                No recent material events detected for this universe.
              </div>
            ) : (
              <div className="space-y-2">
                {materialEvents.slice(0, 5).map(e => (
                  <div
                    key={e.eventId}
                    className="p-2.5 bg-[#051424] border border-[#1c2b3c] rounded-xs font-mono-data text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedSecurity(e.symbol)}
                          className="font-bold text-[#38bdf8] hover:underline cursor-pointer"
                        >
                          {e.symbol}
                        </button>
                        <span className="px-1.5 py-0.5 bg-[#090d14] border border-[#1c2b3c] text-[10px] text-[#87929a] rounded-xs">
                          {e.eventType}
                        </span>
                        <span className="text-[#d4e4fa] truncate max-w-[260px]">
                          {e.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#87929a]">
                        {e.eventDate}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#1c2b3c]/60 text-[10px] text-[#87929a]">
                      <span>Source: {e.sourceType} ({e.epistemicStatus})</span>
                      <div className="flex items-center gap-3">
                        <span>Thesis Impact: <strong className={e.affectsThesis === 'YES' ? 'text-[#f43f5e]' : 'text-[#87929a]'}>{e.affectsThesis}</strong></span>
                        <button
                          onClick={() => handleOpenDeepDive(e.symbol)}
                          className="text-[#38bdf8] hover:underline"
                        >
                          View Impact
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Portfolio Pulse, Thesis Changes, Coverage & Health (5 cols) */}
        <div className="xl:col-span-5 space-y-6">
          {/* SECTION D: Portfolio Pulse (Portfolio Intelligence) */}
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4 font-mono-data">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2b3c] mb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#38bdf8]" />
                <h3 className="text-xs font-bold text-[#d4e4fa] uppercase tracking-wider">
                  Portfolio Pulse & Concentration
                </h3>
              </div>
              <button
                onClick={() => onNavigate('portfolio')}
                className="text-[11px] text-[#38bdf8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Full Portfolio</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {portfolioPulse.hasHoldings ? (
              <div className="space-y-4">
                {/* Segregated Value & P&L Cards */}
                <div className="grid grid-cols-2 gap-3">
                  {/* USD Holdings */}
                  <div className="p-3 bg-[#051424] border border-[#1c2b3c] rounded-xs">
                    <div className="text-[10px] text-[#87929a] uppercase">USD Portfolio</div>
                    <div className="text-base font-bold text-[#d4e4fa] mt-0.5">
                      ${portfolioPulse.totalValueUSD.toLocaleString()}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${portfolioPulse.unrealizedPnLUSD >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                      {portfolioPulse.unrealizedPnLUSD >= 0 ? '+' : ''}${portfolioPulse.unrealizedPnLUSD.toLocaleString()} ({portfolioPulse.unrealizedPnLPctUSD}%)
                    </div>
                  </div>

                  {/* INR Holdings */}
                  <div className="p-3 bg-[#051424] border border-[#1c2b3c] rounded-xs">
                    <div className="text-[10px] text-[#87929a] uppercase">INR Portfolio</div>
                    <div className="text-base font-bold text-[#d4e4fa] mt-0.5">
                      ₹{portfolioPulse.totalValueINR.toLocaleString()}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${portfolioPulse.unrealizedPnLINR >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                      {portfolioPulse.unrealizedPnLINR >= 0 ? '+' : ''}₹{portfolioPulse.unrealizedPnLINR.toLocaleString()} ({portfolioPulse.unrealizedPnLPctINR}%)
                    </div>
                  </div>
                </div>

                {/* Concentration (HHI) */}
                <div className="p-2.5 bg-[#051424] border border-[#1c2b3c] rounded-xs flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[#87929a]">Concentration Index (HHI): </span>
                    <strong className="text-[#d4e4fa]">{portfolioPulse.hhiConcentration}</strong>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-xs ${
                    portfolioPulse.concentrationLabel === 'CONCENTRATED'
                      ? 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30'
                      : portfolioPulse.concentrationLabel === 'MODERATE'
                      ? 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30'
                      : 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                  }`}>
                    {portfolioPulse.concentrationLabel}
                  </span>
                </div>

                {/* Top Exposures List */}
                <div>
                  <div className="text-[10px] uppercase text-[#87929a] mb-1.5">Largest Exposures</div>
                  <div className="space-y-1">
                    {portfolioPulse.topExposures.slice(0, 4).map(exp => (
                      <div
                        key={exp.securityId}
                        className="flex items-center justify-between p-1.5 bg-[#051424] rounded-xs text-[11px]"
                      >
                        <button
                          onClick={() => setSelectedSecurity(exp.symbol)}
                          className="font-bold text-[#38bdf8] hover:underline"
                        >
                          {exp.symbol}
                        </button>
                        <span className="text-[#87929a]">{exp.weightPct}% weight</span>
                        <span className={exp.unrealizedPnL >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'}>
                          {exp.currency === 'INR' ? '₹' : '$'}{exp.marketValue.toLocaleString()} ({exp.pnlPct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-[#87929a]">
                No portfolio holdings found for current user.
              </div>
            )}
          </div>

          {/* SECTION E: Thesis & Decision Changes Feed */}
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4 font-mono-data">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2b3c] mb-3">
              <div className="flex items-center gap-2">
                <Radar className="w-4 h-4 text-[#a855f7]" />
                <h3 className="text-xs font-bold text-[#d4e4fa] uppercase tracking-wider">
                  Thesis & Decision Changes
                </h3>
              </div>
              <button
                onClick={() => onNavigate('monitor')}
                className="text-[11px] text-[#38bdf8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Monitor Review</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {thesisAndDecisionChanges.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#87929a]">
                All monitored theses and decisions remain stable.
              </div>
            ) : (
              <div className="space-y-2">
                {thesisAndDecisionChanges.slice(0, 5).map(c => {
                  const stateBadge = c.thesisState === 'INVALIDATED'
                    ? 'bg-[#f43f5e]/15 border-[#f43f5e]/40 text-[#f43f5e]'
                    : c.thesisState === 'WEAKENED'
                    ? 'bg-[#f97316]/15 border-[#f97316]/40 text-[#f97316]'
                    : c.thesisState === 'UNDER_REVIEW'
                    ? 'bg-[#f59e0b]/15 border-[#f59e0b]/40 text-[#f59e0b]'
                    : 'bg-[#10b981]/15 border-[#10b981]/40 text-[#10b981]';

                  return (
                    <div
                      key={c.changeId}
                      className="p-2.5 bg-[#051424] border border-[#1c2b3c] rounded-xs text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedSecurity(c.symbol)}
                            className="font-bold text-[#38bdf8] hover:underline"
                          >
                            {c.symbol}
                          </button>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-xs border ${stateBadge}`}>
                            {c.thesisState}
                          </span>
                        </div>
                        <button
                          onClick={() => handleOpenReview(c.symbol)}
                          className="text-[10px] text-[#38bdf8] hover:underline"
                        >
                          Review →
                        </button>
                      </div>

                      {c.changedDimensions && c.changedDimensions.length > 0 && (
                        <div className="mt-1 text-[11px] text-[#87929a]">
                          Changed: <span className="text-[#cbd5e1]">{c.changedDimensions.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION F: Research Coverage & Gaps */}
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4 font-mono-data">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2b3c] mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#38bdf8]" />
                <h3 className="text-xs font-bold text-[#d4e4fa] uppercase tracking-wider">
                  Research Coverage & Gaps
                </h3>
              </div>
              <button
                onClick={() => onNavigate('research')}
                className="text-[11px] text-[#38bdf8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Notebooks</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-[11px] text-[#87929a] mb-1">
                  <span>Coverage: {Math.round(researchCoverage.coverageRatio * 100)}%</span>
                  <span>{researchCoverage.coveredSecuritiesCount} of {researchCoverage.coveredSecuritiesCount + researchCoverage.uncoveredSecuritiesCount} securities</span>
                </div>
                <div className="w-full h-1.5 bg-[#051424] rounded-full overflow-hidden border border-[#1c2b3c]">
                  <div
                    className="h-full bg-[#38bdf8]"
                    style={{ width: `${Math.round(researchCoverage.coverageRatio * 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="p-1.5 bg-[#051424] rounded-xs border border-[#1c2b3c]">
                  <div className="text-[#10b981] font-bold text-sm">{researchCoverage.freshCount}</div>
                  <div className="text-[#87929a]">Fresh (≤30d)</div>
                </div>
                <div className="p-1.5 bg-[#051424] rounded-xs border border-[#1c2b3c]">
                  <div className="text-[#f59e0b] font-bold text-sm">{researchCoverage.agingCount}</div>
                  <div className="text-[#87929a]">Aging (31-60d)</div>
                </div>
                <div className="p-1.5 bg-[#051424] rounded-xs border border-[#1c2b3c]">
                  <div className="text-[#eab308] font-bold text-sm">{researchCoverage.staleCount}</div>
                  <div className="text-[#87929a]">Stale (&gt;60d)</div>
                </div>
              </div>

              {researchCoverage.gaps.length > 0 && (
                <div>
                  <div className="text-[10px] text-[#87929a] uppercase mb-1">Top Coverage Gaps</div>
                  <div className="space-y-1">
                    {researchCoverage.gaps.slice(0, 3).map(g => (
                      <div
                        key={g.securityId}
                        className="flex items-center justify-between p-1.5 bg-[#051424] rounded-xs text-[11px]"
                      >
                        <span className="font-bold text-[#d4e4fa]">{g.symbol}</span>
                        <span className="text-[10px] text-[#87929a]">{g.reason}</span>
                        <button
                          onClick={() => handleOpenResearch(g.symbol)}
                          className="text-[10px] text-[#38bdf8] hover:underline"
                        >
                          Start Note
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION G: Data & Evidence Health */}
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-xs p-4 font-mono-data">
            <div className="flex items-center gap-2 pb-2 border-b border-[#1c2b3c] mb-3">
              <Database className="w-4 h-4 text-[#10b981]" />
              <h3 className="text-xs font-bold text-[#d4e4fa] uppercase tracking-wider">
                Epistemic Intelligence Transparency
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px] mb-3">
              <div className="p-1.5 bg-[#051424] border border-[#1c2b3c] rounded-xs">
                <div className="text-[#10b981] font-bold text-sm">{evidenceHealth.realCount}</div>
                <div className="text-[#87929a]">Verified REAL</div>
              </div>
              <div className="p-1.5 bg-[#051424] border border-[#1c2b3c] rounded-xs">
                <div className="text-[#38bdf8] font-bold text-sm">{evidenceHealth.calculatedCount}</div>
                <div className="text-[#87929a]">CALCULATED</div>
              </div>
              <div className="p-1.5 bg-[#051424] border border-[#1c2b3c] rounded-xs">
                <div className="text-[#a855f7] font-bold text-sm">{evidenceHealth.simulatedCount}</div>
                <div className="text-[#87929a]">SIMULATED</div>
              </div>
            </div>

            <p className="text-[11px] text-[#87929a] leading-relaxed">
              {evidenceHealth.summaryNote}
            </p>
          </div>
        </div>
      </div>

      {/* 6. UNIFIED SECURITY DETAIL DRAWER */}
      {selectedSecurity && (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[#090d14] border-l border-[#1c2b3c] shadow-2xl z-50 p-6 flex flex-col font-mono-data overflow-y-auto">
          <div className="flex items-center justify-between pb-4 border-b border-[#1c2b3c] mb-4">
            <div>
              <div className="text-lg font-bold text-[#38bdf8]">{selectedSecurity}</div>
              <div className="text-xs text-[#87929a]">Quick Security Context</div>
            </div>
            <button
              onClick={() => setSelectedSecurity(null)}
              className="p-1 text-[#87929a] hover:text-[#d4e4fa] rounded-xs cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4 text-xs">
            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleOpenReview(selectedSecurity)}
                className="p-2 bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 border border-[#38bdf8]/40 rounded-xs text-[#38bdf8] text-center font-semibold cursor-pointer"
              >
                Review
              </button>
              <button
                onClick={() => handleOpenDeepDive(selectedSecurity)}
                className="p-2 bg-[#051424] hover:bg-[#1c2b3c] border border-[#1c2b3c] rounded-xs text-[#d4e4fa] text-center cursor-pointer"
              >
                Deep Dive
              </button>
              <button
                onClick={() => handleOpenResearch(selectedSecurity)}
                className="p-2 bg-[#051424] hover:bg-[#1c2b3c] border border-[#1c2b3c] rounded-xs text-[#d4e4fa] text-center cursor-pointer"
              >
                Research
              </button>
            </div>

            {/* Active alerts for this security */}
            <div>
              <div className="text-[10px] text-[#87929a] uppercase mb-1">Active Alerts</div>
              {activeAlerts.filter(a => a.symbol === selectedSecurity || a.securityId === selectedSecurity).length > 0 ? (
                activeAlerts
                  .filter(a => a.symbol === selectedSecurity || a.securityId === selectedSecurity)
                  .map(a => (
                    <div key={a.alertId} className="p-2 bg-[#051424] border border-[#1c2b3c] rounded-xs text-[11px] mb-1">
                      <div className="font-semibold text-[#f59e0b]">{a.severity}: {a.title}</div>
                      <div className="text-[#87929a] text-[10px]">{a.primaryReason}</div>
                    </div>
                  ))
              ) : (
                <div className="text-[#87929a] text-[11px]">No active alerts for this security.</div>
              )}
            </div>

            {/* Recent events for this security */}
            <div>
              <div className="text-[10px] text-[#87929a] uppercase mb-1">Recent Material Events</div>
              {materialEvents.filter(e => e.symbol === selectedSecurity || e.securityId === selectedSecurity).length > 0 ? (
                materialEvents
                  .filter(e => e.symbol === selectedSecurity || e.securityId === selectedSecurity)
                  .map(e => (
                    <div key={e.eventId} className="p-2 bg-[#051424] border border-[#1c2b3c] rounded-xs text-[11px] mb-1">
                      <div className="font-semibold text-[#d4e4fa]">{e.eventType}</div>
                      <div className="text-[#87929a] text-[10px]">{e.title} ({e.eventDate})</div>
                    </div>
                  ))
              ) : (
                <div className="text-[#87929a] text-[11px]">No recent material events recorded.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
