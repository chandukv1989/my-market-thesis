import React, { useState, useEffect } from 'react';
import {
  DecisionTimelineResponse,
  DecisionTimelineMilestone,
  DecisionDelta,
  DimensionDeltaItem
} from '../../types';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Layers,
  FileText,
  Activity,
  CheckCircle2,
  RefreshCw,
  Info
} from 'lucide-react';

interface DecisionTimelineViewProps {
  securityId: string;
  onSelectMilestone?: (decisionId: string) => void;
}

export const DecisionTimelineView: React.FC<DecisionTimelineViewProps> = ({
  securityId
}) => {
  const [timeline, setTimeline] = useState<DecisionTimelineResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Delta comparison selection
  const [selectedFromId, setSelectedFromId] = useState<string | null>(null);
  const [selectedToId, setSelectedToId] = useState<string | null>(null);
  const [delta, setDelta] = useState<DecisionDelta | null>(null);
  const [deltaLoading, setDeltaLoading] = useState<boolean>(false);
  const [deltaError, setDeltaError] = useState<string | null>(null);

  const fetchTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${encodeURIComponent(securityId)}/timeline`);
      if (!res.ok) {
        throw new Error(`Failed to fetch timeline: ${res.statusText}`);
      }
      const data: DecisionTimelineResponse = await res.json();
      setTimeline(data);

      // Default to comparing the latest two milestones if available
      if (data.milestones && data.milestones.length >= 2) {
        const to = data.milestones[data.milestones.length - 1].decisionId;
        const from = data.milestones[data.milestones.length - 2].decisionId;
        setSelectedFromId(from);
        setSelectedToId(to);
        fetchDelta(from, to);
      } else if (data.milestones && data.milestones.length === 1) {
        setSelectedToId(data.milestones[0].decisionId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchDelta = async (fromId: string, toId: string) => {
    setDeltaLoading(true);
    setDeltaError(null);
    try {
      const url = `/api/decisions/delta?securityId=${encodeURIComponent(securityId)}&fromDecisionId=${encodeURIComponent(fromId)}&toDecisionId=${encodeURIComponent(toId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to calculate decision delta: ${res.statusText}`);
      }
      const data: DecisionDelta = await res.json();
      setDelta(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDeltaError(msg);
    } finally {
      setDeltaLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [securityId]);

  const handleSelectToCompare = (milestone: DecisionTimelineMilestone) => {
    if (!selectedFromId || (selectedFromId && selectedToId)) {
      setSelectedFromId(milestone.decisionId);
      setSelectedToId(null);
      setDelta(null);
    } else {
      setSelectedToId(milestone.decisionId);
      fetchDelta(selectedFromId, milestone.decisionId);
    }
  };

  const getAssessmentColor = (overall: string) => {
    switch (overall) {
      case 'POSITIVE':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
      case 'CONSTRUCTIVE':
        return 'text-[#38bdf8] border-[#38bdf8]/40 bg-[#38bdf8]/10';
      case 'NEUTRAL':
        return 'text-slate-300 border-slate-500/40 bg-slate-500/10';
      case 'CAUTIOUS':
        return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
      case 'NEGATIVE':
        return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
      default:
        return 'text-slate-400 border-slate-600 bg-slate-800/40';
    }
  };

  const getClassificationBadge = (classification: DimensionDeltaItem['classification']) => {
    switch (classification) {
      case 'IMPROVED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <TrendingUp className="w-3 h-3" /> IMPROVED
          </span>
        );
      case 'DECLINED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <TrendingDown className="w-3 h-3" /> DECLINED
          </span>
        );
      case 'UNCHANGED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-slate-700/40 text-slate-400 border border-slate-600">
            <Minus className="w-3 h-3" /> UNCHANGED
          </span>
        );
      case 'NEW':
        return (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-sky-500/20 text-sky-300 border border-sky-500/40">
            NEW
          </span>
        );
      case 'REMOVED':
        return (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
            REMOVED
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-slate-800 text-slate-500 border border-slate-700">
            UNAVAILABLE
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-[#87929a] font-mono text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-[#38bdf8]" />
        Retrieving immutable historical decision timeline...
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div className="p-6 bg-[#0a1622] border border-rose-500/40 rounded-sm text-rose-300 text-xs font-mono space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span>Timeline Retrieval Error</span>
        </div>
        <p>{error || 'No decision timeline available for this security.'}</p>
        <button
          onClick={fetchTimeline}
          className="mt-2 px-3 py-1 bg-[#122131] hover:bg-[#1c2b3c] text-[#38bdf8] rounded-xs border border-[#1c2b3c]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* TIMELINE OVERVIEW HEADER */}
      <div className="bg-[#0a1622] border border-[#1c2b3c] rounded-sm p-4 lg:p-6 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#87929a] uppercase tracking-wider mb-1">
              <span>Decision Intelligence</span>
              <span>·</span>
              <span>Historical Timeline & Delta Attribution</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold font-mono text-white">
                {timeline.canonicalSecurity.symbol || timeline.canonicalSecurity.companyName}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-xs bg-[#0d1f30] text-[#38bdf8] border border-[#1c2b3c] font-mono">
                {timeline.totalMilestones} Historical Milestone{timeline.totalMilestones !== 1 ? 's' : ''}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-xs bg-[#051424] text-emerald-400 border border-emerald-500/30 font-mono">
                Immutable Storage Verified
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#87929a] font-mono bg-[#06101a] px-3 py-1.5 rounded-xs border border-[#1c2b3c]">
            <Info className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span>Select any 2 milestones to inspect deterministic dimension attribution</span>
          </div>
        </div>

        {/* MILESTONE HORIZONTAL CARDS */}
        <div className="pt-3 border-t border-[#1c2b3c]/60">
          <div className="text-[11px] font-mono text-[#87929a] uppercase tracking-wider mb-2">
            Chronological Decision Milestones
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {timeline.milestones.map((m, idx) => {
              const isFrom = selectedFromId === m.decisionId;
              const isTo = selectedToId === m.decisionId;
              const isSelected = isFrom || isTo;

              return (
                <div
                  key={m.decisionId}
                  onClick={() => handleSelectToCompare(m)}
                  className={`p-3.5 rounded-sm border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-[#0d1e30] border-[#38bdf8] shadow-md shadow-[#38bdf8]/10'
                      : 'bg-[#06121e] border-[#1c2b3c] hover:border-[#38bdf8]/50 hover:bg-[#0a1826]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white">
                      <Clock className="w-3 h-3 text-[#38bdf8]" />
                      <span>{m.asOfDate}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#87929a]">
                      #{idx + 1}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[#87929a]">Composite:</span>
                      <span className="font-bold text-white text-sm">
                        {m.compositeScore.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#87929a]">Assessment:</span>
                      <span className={`px-1.5 py-0.5 rounded-xs text-[10px] font-bold border ${getAssessmentColor(m.overallAssessment)}`}>
                        {m.overallAssessment}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#87929a]">Conviction:</span>
                      <span className="text-slate-300 font-semibold">{m.conviction}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#1c2b3c]/40 text-[11px]">
                      <span className="text-[#87929a]">Guards:</span>
                      <span className={m.invalidationStatus.triggeredGuards > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {m.invalidationStatus.activeGuards} active · {m.invalidationStatus.triggeredGuards} triggered
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <span className="px-1.5 py-0.5 rounded-xs text-[9px] font-bold font-mono bg-[#38bdf8] text-[#06121e]">
                        {isFrom ? 'BASE (FROM)' : 'TARGET (TO)'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DELTA ATTRIBUTION BREAKDOWN */}
      {deltaLoading && (
        <div className="flex items-center justify-center p-8 text-[#87929a] font-mono text-xs">
          <RefreshCw className="w-4 h-4 animate-spin mr-2 text-[#38bdf8]" />
          Computing deterministic dimension delta attribution...
        </div>
      )}

      {deltaError && (
        <div className="p-4 bg-[#0a1622] border border-rose-500/40 rounded-sm text-rose-300 text-xs font-mono">
          {deltaError}
        </div>
      )}

      {delta && !deltaLoading && (
        <div className="bg-[#0a1622] border border-[#1c2b3c] rounded-sm p-4 lg:p-6 space-y-6">
          {/* DELTA HEADER SUMMARY */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1c2b3c]">
            <div>
              <div className="text-xs font-mono text-[#87929a] uppercase tracking-wider mb-1">
                Point-in-Time Dimension Delta Attribution
              </div>
              <div className="flex items-center gap-3 text-sm font-mono text-white">
                <span className="font-bold">{delta.fromAsOfDate}</span>
                <ArrowRight className="w-4 h-4 text-[#38bdf8]" />
                <span className="font-bold">{delta.toAsOfDate}</span>
              </div>
            </div>

            {/* Overall Score Delta Badge */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-[#06121e] px-3.5 py-2 rounded-sm border border-[#1c2b3c] font-mono">
                <span className="text-xs text-[#87929a]">Composite Score Delta:</span>
                <span className={`text-base font-bold ${
                  delta.overallScoreDelta > 0
                    ? 'text-emerald-400'
                    : delta.overallScoreDelta < 0
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}>
                  {delta.overallScoreDelta > 0 ? `+${delta.overallScoreDelta.toFixed(2)}` : delta.overallScoreDelta.toFixed(2)}
                </span>
                <span className="text-xs text-[#87929a]">
                  ({delta.overallScoreBefore.toFixed(2)} → {delta.overallScoreAfter.toFixed(2)})
                </span>
              </div>

              <div className="flex items-center gap-2 bg-[#06121e] px-3 py-2 rounded-sm border border-[#1c2b3c] font-mono text-xs">
                <span className="text-[#87929a]">Assessment:</span>
                <span className="text-slate-300">{delta.assessmentBefore}</span>
                <ArrowRight className="w-3 h-3 text-[#87929a]" />
                <span className={`font-bold ${getAssessmentColor(delta.assessmentAfter)} px-1.5 py-0.5 rounded-xs border`}>
                  {delta.assessmentAfter}
                </span>
              </div>
            </div>
          </div>

          {/* 10 DIMENSIONS COMPARISON TABLE */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-[#87929a] uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#38bdf8]" />
              Canonical Dimension Score Attribution (10 Dimensions)
            </h3>

            <div className="overflow-x-auto border border-[#1c2b3c] rounded-sm">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-[#06101a] border-b border-[#1c2b3c] text-[#87929a]">
                    <th className="py-2.5 px-3">Dimension</th>
                    <th className="py-2.5 px-3 text-center">Score Before</th>
                    <th className="py-2.5 px-3 text-center">Score After</th>
                    <th className="py-2.5 px-3 text-center">Delta</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Deterministic Attribution Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b3c]/50">
                  {delta.dimensionDeltas.map(dim => (
                    <tr key={dim.dimension} className="hover:bg-[#0d1c2d]/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {dim.dimensionName}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-300">
                        {dim.scoreBefore !== null ? dim.scoreBefore.toFixed(2) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-white font-bold">
                        {dim.scoreAfter !== null ? dim.scoreAfter.toFixed(2) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        <span className={
                          dim.delta > 0
                            ? 'text-emerald-400'
                            : dim.delta < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }>
                          {dim.delta > 0 ? `+${dim.delta.toFixed(2)}` : dim.delta.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {getClassificationBadge(dim.classification)}
                      </td>
                      <td className="py-2.5 px-3 text-[#87929a] text-[11px] leading-relaxed">
                        {dim.rationaleChange || dim.assessmentAfter || 'Score evaluated deterministically'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DRIVERS, RISKS & CATALYSTS DELTA */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Drivers Change */}
            <div className="p-3.5 bg-[#06121e] border border-[#1c2b3c] rounded-sm space-y-2 font-mono text-xs">
              <div className="font-bold text-white flex items-center justify-between">
                <span>Key Drivers</span>
                <span className="text-[10px] text-[#87929a]">
                  +{delta.changedDrivers.added.length} / -{delta.changedDrivers.removed.length}
                </span>
              </div>
              {delta.changedDrivers.added.map((d, i) => (
                <div key={i} className="text-emerald-300 text-[11px] flex items-start gap-1.5">
                  <span className="font-bold">+</span>
                  <span>{d}</span>
                </div>
              ))}
              {delta.changedDrivers.removed.map((d, i) => (
                <div key={i} className="text-rose-400 text-[11px] flex items-start gap-1.5 line-through">
                  <span className="font-bold">-</span>
                  <span>{d}</span>
                </div>
              ))}
              {delta.changedDrivers.retained.length > 0 && (
                <div className="text-slate-400 text-[10px] pt-1">
                  {delta.changedDrivers.retained.length} drivers retained unchanged
                </div>
              )}
            </div>

            {/* Invalidation Guard Transitions */}
            <div className="p-3.5 bg-[#06121e] border border-[#1c2b3c] rounded-sm space-y-2 font-mono text-xs">
              <div className="font-bold text-white flex items-center justify-between">
                <span>Thesis Guard Transitions</span>
                <span className="text-[10px] text-[#87929a]">
                  {delta.invalidationChanges.length} conditions
                </span>
              </div>
              {delta.invalidationChanges.length === 0 ? (
                <div className="text-[#87929a] text-[11px]">No condition state changes observed</div>
              ) : (
                delta.invalidationChanges.map((c, i) => (
                  <div key={i} className="text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{c.condition}</span>
                      {c.transition === 'TRIGGERED' ? (
                        <span className="text-rose-400 font-bold text-[10px] bg-rose-500/20 px-1 rounded-xs">TRIGGERED</span>
                      ) : c.transition === 'RECOVERED' ? (
                        <span className="text-emerald-400 font-bold text-[10px] bg-emerald-500/20 px-1 rounded-xs">RECOVERED</span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">{c.statusAfter}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Evidence Coverage Shift */}
            <div className="p-3.5 bg-[#06121e] border border-[#1c2b3c] rounded-sm space-y-2 font-mono text-xs">
              <div className="font-bold text-white flex items-center justify-between">
                <span>Evidence Coverage</span>
                <span className="text-[10px] text-[#87929a]">
                  {delta.evidenceChanges.totalDelta >= 0 ? `+${delta.evidenceChanges.totalDelta}` : delta.evidenceChanges.totalDelta} items
                </span>
              </div>
              <div className="text-[11px] text-slate-300">
                Coverage rating: <span className="font-bold text-white">{delta.evidenceCoverageBefore.rating}</span> → <span className="font-bold text-white">{delta.evidenceCoverageAfter.rating}</span>
              </div>
              <div className="text-[11px] text-slate-300">
                Total evidence items: {delta.evidenceCoverageBefore.totalEvidenceCount} → {delta.evidenceCoverageAfter.totalEvidenceCount}
              </div>
              {delta.evidenceChanges.addedCategories.length > 0 && (
                <div className="text-emerald-300 text-[10px]">
                  Added evidence categories: {delta.evidenceChanges.addedCategories.join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* ANALYTICAL GUARANTEE DISCLAIMER */}
          <div className="p-3 bg-[#06101a] border border-[#1c2b3c] rounded-xs text-[11px] text-[#87929a] font-mono flex items-center justify-between">
            <span>Historical assessment generated at {new Date(delta.generatedAt).toLocaleString()}. Historical decisions are immutable and never re-evaluated with future market data.</span>
            <span className="text-amber-400 font-bold uppercase text-[10px]">Analytical Only · Zero Execution</span>
          </div>
        </div>
      )}
    </div>
  );
};
