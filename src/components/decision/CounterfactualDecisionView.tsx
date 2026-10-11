import { useAuth } from '../../state/AuthContext';
import React, { useState, useEffect } from 'react';
import {
  GitFork,
  Sliders,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  Layers,
  Database,
  Calendar,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Bookmark
} from 'lucide-react';
import {
  ActiveScreen,
  CanonicalSecurity,
  CounterfactualDecisionEvaluation,
  CounterfactualType,
  DecisionDimensionKey,
  DecisionOverallAssessment,
  ResearchEvidenceItem
} from '../../types';
import { CANONICAL_SECURITIES } from '../../data/canonicalSecurities';

interface CounterfactualDecisionViewProps {
  initialSecurityId?: string;
  onNavigate?: (screen: ActiveScreen) => void;
  onSelectStock: (ticker: string) => void;
  onOpenEvidence?: (evidence: ResearchEvidenceItem) => void;
}

export const CounterfactualDecisionView: React.FC<CounterfactualDecisionViewProps> = ({
  initialSecurityId,
  onNavigate,
  onSelectStock,
  onOpenEvidence
}) => {
  const authUserId = useAuth().user?.userId ?? '';
  const [selectedSecurityId, setSelectedSecurityId] = useState<string>(initialSecurityId || 'us-nvda');
  const [asOfDate, setAsOfDate] = useState<string>('2026-09-20');
  const [targetDimension, setTargetDimension] = useState<DecisionDimensionKey>('valuationContext');
  const [counterfactualType, setCounterfactualType] = useState<CounterfactualType>('VALUATION');
  const [parameterKey, setParameterKey] = useState<string>('peRatio');
  const [counterfactualValue, setCounterfactualValue] = useState<string>('22.0');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<CounterfactualDecisionEvaluation | null>(null);
  const [activeTab, setActiveTab] = useState<'comparison' | 'sensitivity' | 'traceability' | 'history'>('comparison');
  const [savedSnapshots, setSavedSnapshots] = useState<any[]>([]);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  const selectedSecurity = CANONICAL_SECURITIES.find(
    s => s.id === selectedSecurityId || s.symbol.toUpperCase() === selectedSecurityId.toUpperCase() || s.id.toLowerCase() === `us-${selectedSecurityId.toLowerCase().replace(/^sec[-_]/, '')}`
  ) || CANONICAL_SECURITIES[0];

  useEffect(() => {
    handleEvaluate();
    loadSavedSnapshots();
  }, [selectedSecurityId]);

  const loadSavedSnapshots = async () => {
    try {
      const res = await fetch('/api/counterfactuals/snapshots');
      if (res.ok) {
        const data = await res.json();
        setSavedSnapshots(data || []);
      }
    } catch {
      // Handled silently
    }
  };

  const handleEvaluate = async () => {
    setIsLoading(true);
    setSaveSuccessNotice(null);
    try {
      let parsedVal: any = counterfactualValue;
      if (counterfactualType === 'VALUATION' || counterfactualType === 'RISK' || counterfactualType === 'PORTFOLIO') {
        const num = parseFloat(counterfactualValue);
        if (!isNaN(num)) parsedVal = num;
      } else if (counterfactualType === 'THESIS' && parameterKey === 'invalidationTriggered') {
        parsedVal = counterfactualValue === 'true' || counterfactualValue === '1';
      }

      const res = await fetch('/api/counterfactuals/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecurityId,
          asOfDate,
          assumptions: [
            {
              type: counterfactualType,
              parameterKey,
              counterfactualValue: parsedVal,
              targetDimension
            }
          ]
        })
      });

      if (res.ok) {
        const data: CounterfactualDecisionEvaluation = await res.json();
        setEvaluation(data);
      }
    } catch (err) {
      console.error('Failed to evaluate counterfactual:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!evaluation) return;
    try {
      const res = await fetch('/api/counterfactuals/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotId: `snap_cf_${Date.now()}`,
          userId: authUserId, // informational only: the server always stamps the authenticated principal
          title: `${evaluation.ticker} Counterfactual (${evaluation.assumptions.map(a => `${a.parameterKey}=${a.counterfactualValue}`).join(', ')})`,
          securityId: evaluation.securityId,
          asOfDate: evaluation.asOfDate,
          createdAt: new Date().toISOString(),
          evaluation,
          isAnalyticalOnly: true,
          executionProhibited: true
        })
      });
      if (res.ok) {
        setSaveSuccessNotice('Counterfactual Snapshot persisted immutably.');
        loadSavedSnapshots();
        setTimeout(() => setSaveSuccessNotice(null), 4000);
      }
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    }
  };

  const getAssessmentColor = (state: string) => {
    switch (state) {
      case 'POSITIVE':
      case 'CONSTRUCTIVE':
      case 'ATTRACTIVE':
      case 'STRONG':
      case 'BULLISH':
      case 'BUY':
      case 'SUPPORTIVE':
      case 'LOW':
      case 'FAVORABLE':
      case 'HIGH':
      case 'STRENGTHENING':
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'NEUTRAL':
      case 'FAIR':
      case 'STABLE':
      case 'HOLD':
      case 'MODERATE':
      case 'CONSTRAINED':
      case 'NOT_HELD':
        return 'text-sky-400 border-sky-500/30 bg-sky-500/10';
      case 'CAUTIOUS':
      case 'ELEVATED':
      case 'WEAK':
      case 'LIMITED':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'NEGATIVE':
      case 'EXTREME':
      case 'WEAKENING':
      case 'DETERIORATING':
      case 'BEARISH':
      case 'SELL':
      case 'UNFAVORABLE':
      case 'INVALIDATED':
        return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      default:
        return 'text-slate-400 border-slate-700 bg-slate-800/40';
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#051424] text-[#d4e4fa] font-sans">
      {/* Header Banner */}
      <div className="border-b border-[#1c2b3c] bg-[#090d14] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-sm bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8]">
                <GitFork className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-white tracking-wide uppercase font-mono">
                Counterfactual Decision Intelligence
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-xs bg-[#1c2b3c] text-[#87929a] font-mono">
                PHASE 32 CERTIFIED
              </span>
            </div>
            <p className="text-xs text-[#87929a] mt-1">
              Deterministic sensitivity analysis, threshold boundary detection, and evidence-to-decision causality mapping.
            </p>
          </div>

          {/* Analytical Boundary Invariant Tag */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[#0d1b2a] border border-[#1c2b3c]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div className="text-right">
              <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                isAnalyticalOnly: true
              </div>
              <div className="text-[9px] font-mono text-[#87929a]">
                executionProhibited: true
              </div>
            </div>
          </div>
        </div>

        {/* Hypothetical Notice Warning */}
        <div className="mt-3 flex items-center gap-2 p-2 rounded-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>COUNTERFACTUAL ASSUMPTION NOTICE:</strong> Values explored below represent hypothetical sensitivity conditions and dependency tests. They are NOT forecasts, buy/sell recommendations, or promises of investment performance.
          </span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Builder & Controls */}
        <div className="lg:col-span-1 space-y-5">
          <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-4">
            <h2 className="text-xs font-bold text-[#87929a] uppercase tracking-wider font-mono flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#38bdf8]" />
              Counterfactual Builder
            </h2>

            {/* Security Selector */}
            <div>
              <label className="text-[11px] font-mono text-[#87929a] block mb-1">TARGET ASSET</label>
              <select
                value={selectedSecurityId}
                onChange={e => setSelectedSecurityId(e.target.value)}
                className="w-full bg-[#051424] border border-[#1c2b3c] rounded-xs px-3 py-2 text-xs text-white focus:outline-none focus:border-[#38bdf8]"
              >
                {CANONICAL_SECURITIES.map(sec => (
                  <option key={sec.id} value={sec.id}>
                    {sec.symbol || (sec as any).ticker} — {sec.companyName} ({sec.market})
                  </option>
                ))}
              </select>
            </div>

            {/* AsOfDate Picker */}
            <div>
              <label className="text-[11px] font-mono text-[#87929a] block mb-1 flex items-center justify-between">
                <span>POINT-IN-TIME (AS OF)</span>
                <span className="text-[10px] text-[#38bdf8]">ZERO LOOKAHEAD</span>
              </label>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#87929a]" />
                <input
                  type="date"
                  value={asOfDate}
                  onChange={e => setAsOfDate(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded-xs px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#38bdf8] font-mono"
                />
              </div>
            </div>

            {/* Dimension Selection */}
            <div>
              <label className="text-[11px] font-mono text-[#87929a] block mb-1">TARGET DIMENSION</label>
              <select
                value={targetDimension}
                onChange={e => {
                  const dim = e.target.value as DecisionDimensionKey;
                  setTargetDimension(dim);
                  if (dim === 'valuationContext') {
                    setCounterfactualType('VALUATION');
                    setParameterKey('peRatio');
                    setCounterfactualValue('22.0');
                  } else if (dim === 'growthTrend') {
                    setCounterfactualType('METRIC');
                    setParameterKey('revenueTrend');
                    setCounterfactualValue('GROWING');
                  } else if (dim === 'riskProfile') {
                    setCounterfactualType('RISK');
                    setParameterKey('volatility');
                    setCounterfactualValue('18.5');
                  } else if (dim === 'portfolioFit') {
                    setCounterfactualType('PORTFOLIO');
                    setParameterKey('weightPct');
                    setCounterfactualValue('5.0');
                  } else if (dim === 'thesisStatus') {
                    setCounterfactualType('THESIS');
                    setParameterKey('thesisStatus');
                    setCounterfactualValue('STRENGTHENING');
                  }
                }}
                className="w-full bg-[#051424] border border-[#1c2b3c] rounded-xs px-3 py-2 text-xs text-white focus:outline-none focus:border-[#38bdf8]"
              >
                <option value="valuationContext">Valuation Context (Multiple / Price)</option>
                <option value="growthTrend">Growth Trend (Revenue / Earnings)</option>
                <option value="riskProfile">Risk Profile (Volatility / Drawdown)</option>
                <option value="portfolioFit">Portfolio Fit (Concentration / Weight)</option>
                <option value="thesisStatus">Thesis Status (Strengthening / Invalidation)</option>
                <option value="fundamentalQuality">Fundamental Quality</option>
                <option value="marketTrend">Market / Price Trend</option>
                <option value="quantitativeSignal">Quantitative Signal</option>
                <option value="backtestContext">Backtest Profile</option>
                <option value="evidenceCoverage">Evidence Coverage</option>
              </select>
            </div>

            {/* Parameter and Value */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-[#87929a] block mb-1">PARAMETER</label>
                <input
                  type="text"
                  value={parameterKey}
                  onChange={e => setParameterKey(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded-xs px-2 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#87929a] block mb-1">COUNTERFACTUAL</label>
                <input
                  type="text"
                  value={counterfactualValue}
                  onChange={e => setCounterfactualValue(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded-xs px-2 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            {/* Evaluate Button */}
            <button
              onClick={handleEvaluate}
              disabled={isLoading}
              className="w-full py-2 px-4 rounded-xs bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#051424] font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <GitFork className="w-4 h-4" />}
              Evaluate Counterfactual
            </button>

            {evaluation && (
              <button
                onClick={handleSaveSnapshot}
                className="w-full py-1.5 px-3 rounded-xs bg-[#1c2b3c] hover:bg-[#25394e] text-white text-xs font-mono transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-[#38bdf8]" />
                Save Immutable Snapshot
              </button>
            )}

            {saveSuccessNotice && (
              <div className="text-[11px] p-2 rounded-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                {saveSuccessNotice}
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-3">
            <h3 className="text-xs font-bold text-[#87929a] uppercase tracking-wider font-mono">
              Deterministic Presets
            </h3>
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  setTargetDimension('valuationContext');
                  setCounterfactualType('VALUATION');
                  setParameterKey('peRatio');
                  setCounterfactualValue('17.5');
                }}
                className="w-full text-left p-2 rounded-xs bg-[#051424] hover:bg-[#1c2b3c]/50 border border-[#1c2b3c] text-xs transition-colors"
              >
                <div className="font-semibold text-emerald-400">P/E Multiple Compression (&lt; 18x)</div>
                <div className="text-[10px] text-[#87929a]">Tests shift to ATTRACTIVE valuation zone</div>
              </button>
              <button
                onClick={() => {
                  setTargetDimension('portfolioFit');
                  setCounterfactualType('PORTFOLIO');
                  setParameterKey('weightPct');
                  setCounterfactualValue('16.0');
                }}
                className="w-full text-left p-2 rounded-xs bg-[#051424] hover:bg-[#1c2b3c]/50 border border-[#1c2b3c] text-xs transition-colors"
              >
                <div className="font-semibold text-amber-400">Position Concentration (&gt; 15%)</div>
                <div className="text-[10px] text-[#87929a]">Tests transition to CAUTIOUS portfolio fit</div>
              </button>
              <button
                onClick={() => {
                  setTargetDimension('thesisStatus');
                  setCounterfactualType('THESIS');
                  setParameterKey('invalidationTriggered');
                  setCounterfactualValue('true');
                }}
                className="w-full text-left p-2 rounded-xs bg-[#051424] hover:bg-[#1c2b3c]/50 border border-[#1c2b3c] text-xs transition-colors"
              >
                <div className="font-semibold text-rose-400">Thesis Invalidation Guard Triggered</div>
                <div className="text-[10px] text-[#87929a]">Tests ceiling cap on overall assessment</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Panes */}
        <div className="lg:col-span-3 space-y-5">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-[#1c2b3c] pb-2">
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition-colors ${
                activeTab === 'comparison'
                  ? 'bg-[#38bdf8] text-[#051424] font-bold'
                  : 'text-[#87929a] hover:text-white hover:bg-[#1c2b3c]'
              }`}
            >
              Current vs Counterfactual
            </button>
            <button
              onClick={() => setActiveTab('sensitivity')}
              className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition-colors ${
                activeTab === 'sensitivity'
                  ? 'bg-[#38bdf8] text-[#051424] font-bold'
                  : 'text-[#87929a] hover:text-white hover:bg-[#1c2b3c]'
              }`}
            >
              Decision Sensitivity Boundaries
            </button>
            <button
              onClick={() => setActiveTab('traceability')}
              className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition-colors ${
                activeTab === 'traceability'
                  ? 'bg-[#38bdf8] text-[#051424] font-bold'
                  : 'text-[#87929a] hover:text-white hover:bg-[#1c2b3c]'
              }`}
            >
              Evidence Traceability Graph
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-xs text-xs font-mono font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-[#38bdf8] text-[#051424] font-bold'
                  : 'text-[#87929a] hover:text-white hover:bg-[#1c2b3c]'
              }`}
            >
              Saved Snapshots ({savedSnapshots.length})
            </button>
          </div>

          {evaluation && (
            <>
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Current State Card */}
                <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[#87929a] uppercase">BASELINE / CURRENT</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-xs bg-[#1c2b3c] text-[#87929a] font-mono">
                      OBSERVED DATA
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-xl font-bold px-2.5 py-1 rounded-xs border font-mono ${getAssessmentColor(evaluation.baseDecision.overallAssessment)}`}>
                      {evaluation.baseDecision.overallAssessment}
                    </span>
                    <div className="text-xs text-[#87929a]">
                      Score: <strong className="text-white font-mono">{evaluation.baseDecision.compositeScore.toFixed(3)}</strong>
                    </div>
                  </div>
                  <div className="text-xs text-[#87929a]">
                    Thesis Posture: <strong className="text-white">{evaluation.baseDecision.thesisStatus}</strong>
                  </div>
                  <div className="text-[11px] text-[#87929a] border-t border-[#1c2b3c]/60 pt-2">
                    Key Drivers: {evaluation.baseDecision.keyDrivers.slice(0, 2).join('; ') || 'Balanced baseline setup.'}
                  </div>
                </div>

                {/* Counterfactual State Card */}
                <div className="p-4 rounded-sm bg-[#090d14] border border-[#38bdf8]/40 space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#38bdf8]/5 rounded-bl-full pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[#38bdf8] uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      COUNTERFACTUAL SETUP
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-xs bg-[#38bdf8]/10 text-[#38bdf8] font-mono border border-[#38bdf8]/30">
                      HYPOTHETICAL
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className={`text-xl font-bold px-2.5 py-1 rounded-xs border font-mono ${getAssessmentColor(evaluation.counterfactualDecision.overallAssessment)}`}>
                      {evaluation.counterfactualDecision.overallAssessment}
                    </span>
                    <div className="text-xs text-[#87929a]">
                      Score: <strong className="text-white font-mono">{evaluation.counterfactualDecision.compositeScore.toFixed(3)}</strong>
                      <span className={`ml-1 font-mono text-xs ${evaluation.compositeScoreDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ({evaluation.compositeScoreDelta >= 0 ? `+${evaluation.compositeScoreDelta.toFixed(3)}` : evaluation.compositeScoreDelta.toFixed(3)})
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-[#87929a]">
                    Hypothetical Thesis Implication: <strong className="text-white">{evaluation.counterfactualDecision.thesisStatus}</strong>
                  </div>
                  <div className="text-[11px] text-[#87929a] border-t border-[#1c2b3c]/60 pt-2">
                    Changed Dimensions: <strong className="text-[#38bdf8]">{evaluation.changedDimensionsCount}</strong> of 10
                  </div>
                </div>
              </div>

              {/* Narrative & Synthesis */}
              {evaluation.narrative && (
                <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[#87929a] uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#38bdf8]" />
                      Analytical Sensitivity Synthesis
                    </span>
                    <span className="text-[10px] text-[#87929a] font-mono">
                      {evaluation.narrative.isAIGenerated ? 'AI SYNTHESIS' : 'DETERMINISTIC TEMPLATE'}
                    </span>
                  </div>
                  <p className="text-xs text-white leading-relaxed">
                    {evaluation.narrative.summary}
                  </p>
                  <p className="text-xs text-[#87929a] italic">
                    {evaluation.narrative.thesisImplication}
                  </p>
                </div>
              )}

              {/* TAB 1: Comparison View */}
              {activeTab === 'comparison' && (
                <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-4">
                  <h3 className="text-xs font-bold text-[#87929a] uppercase tracking-wider font-mono">
                    Dimension Transition Matrix (10 Canonical Dimensions)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#1c2b3c] text-[#87929a] text-[11px]">
                          <th className="py-2 px-3">DIMENSION</th>
                          <th className="py-2 px-3">CURRENT</th>
                          <th className="py-2 px-3">SCORE</th>
                          <th className="py-2 px-3">COUNTERFACTUAL</th>
                          <th className="py-2 px-3">CF SCORE</th>
                          <th className="py-2 px-3">DELTA</th>
                          <th className="py-2 px-3">DETERMINISTIC RULE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1c2b3c]/50">
                        {evaluation.dimensionDeltas.map(d => (
                          <tr key={d.dimension} className={d.isChanged ? 'bg-[#38bdf8]/5' : ''}>
                            <td className="py-2.5 px-3 font-semibold text-white">
                              {d.dimensionName}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-xs border text-[10px] ${getAssessmentColor(d.currentState)}`}>
                                {d.currentState}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[#87929a]">
                              {d.currentScore.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-xs border text-[10px] ${getAssessmentColor(d.counterfactualState)}`}>
                                {d.counterfactualState}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-white">
                              {d.counterfactualScore.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={d.scoreDelta > 0 ? 'text-emerald-400 font-bold' : d.scoreDelta < 0 ? 'text-rose-400 font-bold' : 'text-[#87929a]'}>
                                {d.scoreDelta > 0 ? `+${d.scoreDelta.toFixed(2)}` : d.scoreDelta.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[#87929a] text-[11px] max-w-xs truncate" title={d.deterministicRule}>
                              {d.deterministicRule}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: Sensitivity Boundaries */}
              {activeTab === 'sensitivity' && (
                <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#87929a] uppercase tracking-wider font-mono">
                      Exact Deterministic Sensitivity Boundaries
                    </h3>
                    <span className="text-[10px] text-[#38bdf8] font-mono">
                      NO FABRICATED THRESHOLDS
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {evaluation.sensitivityBoundaries.map(sb => (
                      <div key={sb.dimension} className="p-3.5 rounded-xs bg-[#051424] border border-[#1c2b3c] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-white">{sb.dimensionName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-xs bg-[#1c2b3c] text-[#38bdf8] font-mono">
                            Current: {sb.currentValue} ({sb.currentState})
                          </span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {sb.sensitivities.map((s, idx) => (
                            <div key={idx} className="p-2 rounded-xs bg-[#090d14] border border-[#1c2b3c]/60 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold text-[11px] ${getAssessmentColor(s.targetState)}`}>
                                  → {s.targetState}
                                </span>
                                <span className="text-[10px] text-[#87929a] font-mono">
                                  {s.isCalculable ? `Threshold: ${s.thresholdValue}` : 'INSUFFICIENT EVIDENCE'}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#d4e4fa]">
                                {s.requiredChange}
                              </p>
                              <p className="text-[10px] text-[#87929a] italic">
                                {s.ruleDescription}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: Traceability Graph */}
              {activeTab === 'traceability' && (
                <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#87929a] uppercase tracking-wider font-mono">
                      Evidence-to-Decision Causality Chain
                    </h3>
                    <span className="text-[10px] text-[#87929a] font-mono">
                      Evidence → Input → Dimension → Decision → Thesis
                    </span>
                  </div>

                  <div className="p-4 rounded-xs bg-[#051424] border border-[#1c2b3c] space-y-4">
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {evaluation.traceabilityGraph.nodes.map(node => (
                        <div
                          key={node.id}
                          className={`p-3 rounded-xs border text-xs max-w-xs ${
                            node.isCounterfactual
                              ? 'bg-[#38bdf8]/10 border-[#38bdf8] text-[#38bdf8]'
                              : 'bg-[#090d14] border-[#1c2b3c] text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-[#87929a] uppercase mb-1">
                            <span>{node.type}</span>
                            <span>{node.epistemicStatus}</span>
                          </div>
                          <div className="font-bold text-xs">{node.label}</div>
                          {node.provenance && (
                            <div className="text-[9px] text-[#87929a] mt-1 italic truncate">
                              Provenance: {node.provenance}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Saved Snapshots */}
              {activeTab === 'history' && (
                <div className="p-4 rounded-sm bg-[#090d14] border border-[#1c2b3c] space-y-3">
                  <h3 className="text-xs font-bold text-[#87929a] uppercase tracking-wider font-mono">
                    Persisted Immutable Counterfactual Snapshots
                  </h3>
                  {savedSnapshots.length === 0 ? (
                    <div className="text-xs text-[#87929a] py-4 text-center">
                      No saved snapshots found for current session.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {savedSnapshots.map(snap => (
                        <div key={snap.snapshotId} className="p-3 rounded-xs bg-[#051424] border border-[#1c2b3c] flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-white">{snap.title}</div>
                            <div className="text-[10px] text-[#87929a] font-mono">
                              Snapshot ID: {snap.snapshotId} | As of: {snap.asOfDate}
                            </div>
                          </div>
                          <button
                            onClick={() => setEvaluation(snap.evaluation)}
                            className="px-2.5 py-1 rounded-xs bg-[#1c2b3c] hover:bg-[#38bdf8] hover:text-[#051424] text-xs font-mono transition-colors cursor-pointer"
                          >
                            Load
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Bar / Deep Links */}
              <div className="p-3 rounded-sm bg-[#090d14] border border-[#1c2b3c] flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-[#87929a] font-mono">INTELLIGENCE NAVIGATION:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onNavigate('monitor')}
                    className="px-2.5 py-1 rounded-xs bg-[#1c2b3c] hover:bg-[#25394e] text-white flex items-center gap-1.5 cursor-pointer font-mono"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#38bdf8]" />
                    Review Workspace
                  </button>
                  <button
                    onClick={() => {
                      onSelectStock(evaluation.ticker);
                      onNavigate('deep-dive');
                    }}
                    className="px-2.5 py-1 rounded-xs bg-[#1c2b3c] hover:bg-[#25394e] text-white flex items-center gap-1.5 cursor-pointer font-mono"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#38bdf8]" />
                    Decision Timeline
                  </button>
                  <button
                    onClick={() => onNavigate('scenario-intelligence')}
                    className="px-2.5 py-1 rounded-xs bg-[#1c2b3c] hover:bg-[#25394e] text-white flex items-center gap-1.5 cursor-pointer font-mono"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#38bdf8]" />
                    Scenario Stress Engine
                  </button>
                  <button
                    onClick={() => onNavigate('cross-investment')}
                    className="px-2.5 py-1 rounded-xs bg-[#1c2b3c] hover:bg-[#25394e] text-white flex items-center gap-1.5 cursor-pointer font-mono"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#38bdf8]" />
                    Cross-Investment Network
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
