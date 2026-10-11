import { useAuth } from '../../state/AuthContext';
import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  TrendingDown,
  RefreshCw,
  GitBranch,
  Layers,
  FileText,
  AlertTriangle,
  Bookmark,
  ChevronRight,
  ExternalLink,
  Info,
  Calendar,
  DollarSign,
  Maximize2,
  X
} from 'lucide-react';
import {
  PortfolioScenarioEvaluation,
  PortfolioScenarioRequest,
  PortfolioScenarioType,
  ScenarioSecurityImpact,
  ScenarioComparisonResult,
  PortfolioScenarioSnapshot,
  ActiveScreen
} from '../../types';

interface PortfolioScenarioViewProps {
  onNavigate?: (screen: ActiveScreen) => void;
  onSelectStock?: (ticker: string) => void;
  onOpenEvidence?: (evidenceId: string) => void;
}

interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  scenarioType: PortfolioScenarioType;
  parameters: any;
}

export const PortfolioScenarioView: React.FC<PortfolioScenarioViewProps> = ({
  onNavigate,
  onSelectStock
}) => {
  const authUserId = useAuth().user?.userId ?? '';
  const [presets, setPresets] = useState<ScenarioPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('preset_us_tech_15');
  const [activeTab, setActiveTab] = useState<'table' | 'paths' | 'comparison' | 'snapshots'>('table');
  
  // Custom scenario builder state
  const [scenarioType, setScenarioType] = useState<PortfolioScenarioType>('SECTOR_SHOCK');
  const [shockPercentage, setShockPercentage] = useState<number>(-15);
  const [sector, setSector] = useState<string>('Technology');
  const [targetSymbol, setTargetSymbol] = useState<string>('NVDA');
  const [currency, setCurrency] = useState<'USD' | 'INR'>('USD');
  const [macroVariable, setMacroVariable] = useState<string>('INTEREST_RATES');
  const [macroAmount, setMacroAmount] = useState<number>(100);
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Evaluation & Data state
  const [evaluation, setEvaluation] = useState<PortfolioScenarioEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Security detail drawer
  const [selectedSecurity, setSelectedSecurity] = useState<ScenarioSecurityImpact | null>(null);

  // Comparison state
  const [comparison, setComparison] = useState<ScenarioComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);

  // Snapshot state
  const [snapshots, setSnapshots] = useState<PortfolioScenarioSnapshot[]>([]);
  const [snapshotTitle, setSnapshotTitle] = useState<string>('');
  const [isSavingSnapshot, setIsSavingSnapshot] = useState<boolean>(false);
  const [snapshotSuccessMsg, setSnapshotSuccessMsg] = useState<string | null>(null);

  // Load presets on mount
  useEffect(() => {
    fetchPresets();
    fetchSnapshots();
  }, []);

  // When selectedPresetId changes, sync builder fields and evaluate
  useEffect(() => {
    if (presets.length > 0 && selectedPresetId) {
      const p = presets.find(item => item.id === selectedPresetId);
      if (p) {
        setScenarioType(p.scenarioType);
        if (p.parameters.shockPercentage !== undefined) setShockPercentage(p.parameters.shockPercentage);
        if (p.parameters.sector) setSector(p.parameters.sector);
        if (p.parameters.targetSymbol) setTargetSymbol(p.parameters.targetSymbol);
        if (p.parameters.currency) setCurrency(p.parameters.currency);
        if (p.parameters.macroVariable) setMacroVariable(p.parameters.macroVariable);
        if (p.parameters.macroShockAmount !== undefined) setMacroAmount(p.parameters.macroShockAmount);
        
        runEvaluation({
          scenarioType: p.scenarioType,
          name: p.name,
          description: p.description,
          parameters: p.parameters,
          asOfDate
        });
      }
    }
  }, [selectedPresetId, presets]);

  const fetchPresets = async () => {
    try {
      const res = await fetch('/api/scenarios/presets');
      if (res.ok) {
        const data = await res.json();
        setPresets(data);
        if (data.length > 0 && !selectedPresetId) {
          setSelectedPresetId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  };

  const fetchSnapshots = async () => {
    try {
      const res = await fetch('/api/scenarios/snapshots');
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data);
      }
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    }
  };

  const runEvaluation = async (customReq?: PortfolioScenarioRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const req: PortfolioScenarioRequest = customReq || {
        scenarioType,
        parameters: {
          shockPercentage,
          sector: scenarioType === 'SECTOR_SHOCK' ? sector : undefined,
          targetSymbol: scenarioType === 'SECURITY_SHOCK' ? targetSymbol : undefined,
          currency: scenarioType === 'CURRENCY_SCENARIO' ? currency : undefined,
          macroVariable: scenarioType === 'MACRO_SCENARIO' ? (macroVariable as any) : undefined,
          macroShockAmount: scenarioType === 'MACRO_SCENARIO' ? macroAmount : undefined,
          asOfDate
        },
        asOfDate
      };

      const res = await fetch('/api/scenarios/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Scenario evaluation failed');
      }

      const data: PortfolioScenarioEvaluation = await res.json();
      setEvaluation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const runComparison = async () => {
    setIsComparing(true);
    try {
      const sampleRequests: PortfolioScenarioRequest[] = presets.slice(0, 3).map(p => ({
        scenarioType: p.scenarioType,
        name: p.name,
        parameters: p.parameters,
        asOfDate
      }));

      const res = await fetch('/api/scenarios/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarios: sampleRequests })
      });

      if (res.ok) {
        const data = await res.json();
        setComparison(data);
        setActiveTab('comparison');
      }
    } catch (err) {
      console.error('Comparison error:', err);
    } finally {
      setIsComparing(false);
    }
  };

  const saveCurrentSnapshot = async () => {
    if (!evaluation) return;
    setIsSavingSnapshot(true);
    setSnapshotSuccessMsg(null);
    try {
      const title = snapshotTitle.trim() || `${evaluation.name} Snapshot (${asOfDate})`;
      const snap: PortfolioScenarioSnapshot = {
        snapshotId: `snap::scen::${Date.now()}`,
        userId: authUserId, // informational only: the server always stamps the authenticated principal
        title,
        scenarioType: evaluation.scenarioType,
        asOfDate: evaluation.asOfDate,
        createdAt: new Date().toISOString(),
        evaluation,
        isAnalyticalOnly: true,
        executionProhibited: true
      };

      const res = await fetch('/api/scenarios/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snap)
      });

      if (res.ok) {
        setSnapshotSuccessMsg(`Snapshot "${title}" saved with immutable historical integrity.`);
        setSnapshotTitle('');
        fetchSnapshots();
        setTimeout(() => setSnapshotSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.error('Save snapshot failed:', err);
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#051424] text-[#d4e4fa] overflow-y-auto">
      {/* Top Banner / Analytical Invariant Notice */}
      <div className="bg-[#090d14] border-b border-[#1c2b3c] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-[#38bdf8] font-mono">Phase 31 Intelligence</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-400">Institutional Stress Testing</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white mt-1">
            Portfolio Scenario & Stress Intelligence
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-mono text-emerald-400">isAnalyticalOnly: true</div>
            <div className="text-xs font-mono text-slate-400">executionProhibited: true</div>
          </div>
          <button
            onClick={() => runEvaluation()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1c2b3c] hover:bg-[#283d54] text-xs font-medium rounded text-white border border-[#2a3e55] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#38bdf8]' : ''}`} />
            Evaluate Stress
          </button>
        </div>
      </div>

      {/* Main Workspace Grid */}
      <div className="p-6 space-y-6">
        {/* Scenario Controls & Presets */}
        <div className="bg-[#090d14] border border-[#1c2b3c] rounded p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#38bdf8]" />
              <span className="text-sm font-semibold text-white">Deterministic Scenario Controls</span>
            </div>

            {/* Presets Segmented Selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">Canonical Presets:</span>
              {presets.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPresetId(p.id)}
                  className={`px-2.5 py-1 text-xs font-mono transition-colors rounded ${
                    selectedPresetId === p.id
                      ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40'
                      : 'bg-[#101826] text-slate-300 hover:text-white border border-[#1c2b3c]'
                  }`}
                >
                  {p.name.split(' (')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Parameters Form */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-3 border-t border-[#1c2b3c]/60">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">Scenario Type</label>
              <select
                value={scenarioType}
                onChange={e => {
                  setSelectedPresetId('');
                  setScenarioType(e.target.value as PortfolioScenarioType);
                }}
                className="w-full bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#38bdf8] outline-none"
              >
                <option value="SECTOR_SHOCK">Sector Shock</option>
                <option value="MARKET_SHOCK">Market Shock</option>
                <option value="SECURITY_SHOCK">Security Shock</option>
                <option value="CURRENCY_SCENARIO">Currency Scenario</option>
                <option value="MACRO_SCENARIO">Macro Scenario</option>
                <option value="EVENT_SCENARIO">Event Scenario</option>
                <option value="THESIS_INVALIDATION_SCENARIO">Thesis Invalidation</option>
              </select>
            </div>

            {scenarioType === 'SECTOR_SHOCK' && (
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Target Sector</label>
                <select
                  value={sector}
                  onChange={e => {
                    setSelectedPresetId('');
                    setSector(e.target.value);
                  }}
                  className="w-full bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#38bdf8] outline-none"
                >
                  <option value="Technology">Technology</option>
                  <option value="Financial Services">Financial Services</option>
                  <option value="Healthcare & Bio">Healthcare & Bio</option>
                  <option value="Consumer Discretionary">Consumer Discretionary</option>
                  <option value="Industrials & Infra">Industrials & Infra</option>
                </select>
              </div>
            )}

            {scenarioType === 'SECURITY_SHOCK' && (
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Target Ticker</label>
                <input
                  type="text"
                  value={targetSymbol}
                  onChange={e => {
                    setSelectedPresetId('');
                    setTargetSymbol(e.target.value.toUpperCase());
                  }}
                  className="w-full bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#38bdf8] outline-none font-mono"
                  placeholder="e.g. NVDA"
                />
              </div>
            )}

            {scenarioType === 'CURRENCY_SCENARIO' && (
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Base Currency</label>
                <select
                  value={currency}
                  onChange={e => {
                    setSelectedPresetId('');
                    setCurrency(e.target.value as 'USD' | 'INR');
                  }}
                  className="w-full bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#38bdf8] outline-none"
                >
                  <option value="USD">USD (US Dollar)</option>
                  <option value="INR">INR (Indian Rupee)</option>
                </select>
              </div>
            )}

            {scenarioType === 'MACRO_SCENARIO' && (
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">Macro Variable</label>
                <select
                  value={macroVariable}
                  onChange={e => {
                    setSelectedPresetId('');
                    setMacroVariable(e.target.value);
                  }}
                  className="w-full bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#38bdf8] outline-none"
                >
                  <option value="INTEREST_RATES">Interest Rates (bps)</option>
                  <option value="CRUDE_OIL">Crude Oil (%)</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">
                {scenarioType === 'MACRO_SCENARIO' ? 'Adjustment Amount' : 'Hypothetical Shock (%)'}
              </label>
              <input
                type="number"
                value={scenarioType === 'MACRO_SCENARIO' ? macroAmount : shockPercentage}
                onChange={e => {
                  setSelectedPresetId('');
                  const val = parseFloat(e.target.value) || 0;
                  if (scenarioType === 'MACRO_SCENARIO') setMacroAmount(val);
                  else setShockPercentage(val);
                }}
                className="w-full bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#38bdf8] outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1">As-Of Date (PIT)</label>
              <input
                type="date"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                className="w-full bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 rounded px-2.5 py-1.5 focus:border-[#38bdf8] outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* Explicit Scenario Assumption Banner */}
        {evaluation && evaluation.assumptions.length > 0 && (
          <div className="bg-[#101a2b] border border-[#1e3450] rounded p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 font-mono">
                HYPOTHETICAL SCENARIO ASSUMPTIONS
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400">Strictly Non-Forecast</span>
            </div>
            <div className="space-y-1.5">
              {evaluation.assumptions.map(asm => (
                <div key={asm.id} className="text-xs text-slate-300 flex items-start gap-2">
                  <span className="text-amber-400 font-mono">▸</span>
                  <div>
                    <span className="font-medium text-white">{asm.statement}</span>
                    <span className="text-slate-400 ml-2">({asm.basis})</span>
                    {asm.fxAssumption && (
                      <div className="text-slate-400 italic mt-0.5">{asm.fxAssumption}</div>
                    )}
                    {asm.limitationNote && (
                      <div className="text-amber-400/80 text-[11px] mt-0.5">{asm.limitationNote}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-950/30 border border-rose-800/50 rounded p-4 text-xs text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Executive Summary Cards */}
        {evaluation && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Holdings & Severity Card */}
            <div className="bg-[#090d14] border border-[#1c2b3c] rounded p-4">
              <div className="text-xs text-slate-400 font-mono uppercase tracking-wider">Affected Holdings</div>
              <div className="text-2xl font-bold text-white mt-1">
                {evaluation.portfolioSummary.affectedHoldingsCount}
                <span className="text-xs text-slate-400 font-normal ml-2">
                  of {evaluation.portfolioSummary.totalHoldingsEvaluated} total
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                <span>Analytical Severity:</span>
                <span className={`font-mono font-semibold ${
                  evaluation.severity === 'HIGH' ? 'text-rose-400' : evaluation.severity === 'MEDIUM' ? 'text-amber-400' : 'text-slate-300'
                }`}>
                  {evaluation.severity}
                </span>
              </div>
            </div>

            {/* USD Portfolio Impact */}
            <div className="bg-[#090d14] border border-[#1c2b3c] rounded p-4">
              <div className="text-xs text-slate-400 font-mono uppercase tracking-wider">USD Portfolio Exposure</div>
              <div className="text-2xl font-bold text-white mt-1">
                {evaluation.portfolioSummary.usd.affectedWeightPct}%
                <span className="text-xs text-slate-400 font-normal ml-2">
                  (${evaluation.portfolioSummary.usd.affectedPortfolioValue.toLocaleString()})
                </span>
              </div>
              <div className="mt-2 text-xs flex items-center justify-between">
                <span className="text-slate-400">Hypothetical P&L:</span>
                <span className={`font-mono font-semibold ${
                  evaluation.portfolioSummary.usd.hypotheticalPnl < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  ${evaluation.portfolioSummary.usd.hypotheticalPnl.toLocaleString()}
                  <span className="text-[11px] ml-1">({evaluation.portfolioSummary.usd.hypotheticalPnlPct}%)</span>
                </span>
              </div>
            </div>

            {/* INR Portfolio Impact */}
            <div className="bg-[#090d14] border border-[#1c2b3c] rounded p-4">
              <div className="text-xs text-slate-400 font-mono uppercase tracking-wider">INR Portfolio Exposure</div>
              <div className="text-2xl font-bold text-white mt-1">
                {evaluation.portfolioSummary.inr.affectedWeightPct}%
                <span className="text-xs text-slate-400 font-normal ml-2">
                  (₹{evaluation.portfolioSummary.inr.affectedPortfolioValue.toLocaleString()})
                </span>
              </div>
              <div className="mt-2 text-xs flex items-center justify-between">
                <span className="text-slate-400">Hypothetical P&L:</span>
                <span className={`font-mono font-semibold ${
                  evaluation.portfolioSummary.inr.hypotheticalPnl < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  ₹{evaluation.portfolioSummary.inr.hypotheticalPnl.toLocaleString()}
                  <span className="text-[11px] ml-1">({evaluation.portfolioSummary.inr.hypotheticalPnlPct}%)</span>
                </span>
              </div>
            </div>

            {/* Evidence Coverage & Epistemic Audit */}
            <div className="bg-[#090d14] border border-[#1c2b3c] rounded p-4">
              <div className="text-xs text-slate-400 font-mono uppercase tracking-wider">Evidence Coverage</div>
              <div className="text-2xl font-bold text-white mt-1">
                {evaluation.evidenceCoverage.verifiedRealEvidenceCount}
                <span className="text-xs text-slate-400 font-normal ml-2">
                  verified filings
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                <span>Insufficient Data:</span>
                <span className="font-mono text-amber-400">
                  {evaluation.evidenceCoverage.insufficientEvidenceCount} issuers
                </span>
              </div>
            </div>
          </div>
        )}

        {/* View Tabs */}
        <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-2">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('table')}
              className={`text-xs font-semibold pb-1.5 transition-colors ${
                activeTab === 'table' ? 'text-[#38bdf8] border-b-2 border-[#38bdf8]' : 'text-slate-400 hover:text-white'
              }`}
            >
              Impacted Securities Table
            </button>
            <button
              onClick={() => setActiveTab('paths')}
              className={`text-xs font-semibold pb-1.5 transition-colors ${
                activeTab === 'paths' ? 'text-[#38bdf8] border-b-2 border-[#38bdf8]' : 'text-slate-400 hover:text-white'
              }`}
            >
              Propagation Paths ({evaluation?.impactedSecurities.length || 0})
            </button>
            <button
              onClick={() => {
                setActiveTab('comparison');
                if (!comparison) runComparison();
              }}
              className={`text-xs font-semibold pb-1.5 transition-colors ${
                activeTab === 'comparison' ? 'text-[#38bdf8] border-b-2 border-[#38bdf8]' : 'text-slate-400 hover:text-white'
              }`}
            >
              Scenario Comparison
            </button>
            <button
              onClick={() => setActiveTab('snapshots')}
              className={`text-xs font-semibold pb-1.5 transition-colors ${
                activeTab === 'snapshots' ? 'text-[#38bdf8] border-b-2 border-[#38bdf8]' : 'text-slate-400 hover:text-white'
              }`}
            >
              Saved Snapshots ({snapshots.length})
            </button>
          </div>

          {/* Snapshot Save Trigger */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Snapshot Title..."
              value={snapshotTitle}
              onChange={e => setSnapshotTitle(e.target.value)}
              className="bg-[#101826] border border-[#1c2b3c] text-xs text-slate-200 px-2.5 py-1 rounded outline-none w-48 font-mono"
            />
            <button
              onClick={saveCurrentSnapshot}
              disabled={isSavingSnapshot || !evaluation}
              className="px-2.5 py-1 bg-[#1c2b3c] hover:bg-[#283d54] text-xs font-medium rounded text-white border border-[#2a3e55] flex items-center gap-1.5 transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5 text-[#38bdf8]" />
              Save Immutable Snapshot
            </button>
          </div>
        </div>

        {snapshotSuccessMsg && (
          <div className="bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs px-3 py-2 rounded">
            {snapshotSuccessMsg}
          </div>
        )}

        {/* TAB 1: Impacted Securities Table */}
        {activeTab === 'table' && evaluation && (
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#101826] text-slate-400 border-b border-[#1c2b3c] font-mono">
                  <tr>
                    <th className="py-2.5 px-3">Security</th>
                    <th className="py-2.5 px-3">Sector</th>
                    <th className="py-2.5 px-3">Exposure Basis</th>
                    <th className="py-2.5 px-3 text-right">Holding Weight</th>
                    <th className="py-2.5 px-3 text-right">Scenario Shock</th>
                    <th className="py-2.5 px-3 text-right">Hypothetical P&L</th>
                    <th className="py-2.5 px-3">Evidence</th>
                    <th className="py-2.5 px-3">Epistemic</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b3c]/60">
                  {evaluation.impactedSecurities.map(sec => (
                    <tr
                      key={sec.securityId}
                      className="hover:bg-[#121c2c] transition-colors cursor-pointer"
                      onClick={() => setSelectedSecurity(sec)}
                    >
                      <td className="py-2.5 px-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[#38bdf8]">{sec.ticker}</span>
                          <span className="text-slate-400 text-[11px] truncate max-w-[140px]">{sec.companyName}</span>
                          {sec.isPortfolioHolding && (
                            <span className="text-[10px] text-emerald-400 font-mono">PORTFOLIO</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{sec.sector}</td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">
                        {sec.exposureBasis}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                        {sec.isPortfolioHolding ? `${sec.portfolioWeightPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {sec.scenarioShockPct !== null ? (
                          <span className={sec.scenarioShockPct < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {sec.scenarioShockPct > 0 ? '+' : ''}{sec.scenarioShockPct}%
                          </span>
                        ) : (
                          <span className="text-amber-400">UNRESOLVED</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium">
                        {sec.hypotheticalPnl !== null ? (
                          <span className={sec.hypotheticalPnl < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {sec.currency === 'INR' ? '₹' : '$'}{sec.hypotheticalPnl.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {sec.evidenceIds.length > 0 ? `${sec.evidenceIds.length} disclosures` : 'No filings'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`font-mono text-[11px] ${
                          sec.epistemicStatus === 'REAL' ? 'text-emerald-400' :
                          sec.epistemicStatus === 'INSUFFICIENT_EVIDENCE' ? 'text-amber-400' : 'text-cyan-400'
                        }`}>
                          {sec.epistemicStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedSecurity(sec);
                          }}
                          className="px-2 py-0.5 text-xs text-[#38bdf8] hover:underline"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Propagation Paths */}
        {activeTab === 'paths' && evaluation && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evaluation.impactedSecurities.slice(0, 8).map(sec => (
              <div key={sec.securityId} className="bg-[#090d14] border border-[#1c2b3c] rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#38bdf8]">{sec.ticker}</span>
                    <span className="text-xs text-slate-400">{sec.companyName}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{sec.currency}</span>
                </div>

                <div className="space-y-1.5 pl-2 border-l border-[#1c2b3c]">
                  {sec.propagationPath.map(step => (
                    <div key={step.step} className="text-xs flex items-start gap-2">
                      <span className="text-[#38bdf8] font-mono text-[10px] w-4">{step.step}.</span>
                      <div>
                        <span className="text-slate-200 font-medium">{step.label}</span>
                        <span className="text-slate-500 font-mono text-[10px] ml-2">({step.provenance})</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#1c2b3c]/60 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Exposure Basis: <span className="text-white font-mono">{sec.exposureBasis}</span></span>
                  <button
                    onClick={() => setSelectedSecurity(sec)}
                    className="text-[#38bdf8] hover:underline text-[11px]"
                  >
                    Examine Provenance →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: Scenario Comparison */}
        {activeTab === 'comparison' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Side-by-side comparison of canonical stress scenarios.</span>
              <button
                onClick={runComparison}
                disabled={isComparing}
                className="px-3 py-1 bg-[#1c2b3c] text-xs text-white rounded border border-[#2a3e55]"
              >
                {isComparing ? 'Evaluating...' : 'Refresh Comparison'}
              </button>
            </div>

            {comparison && (
              <div className="bg-[#090d14] border border-[#1c2b3c] rounded overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#101826] text-slate-400 border-b border-[#1c2b3c] font-mono">
                    <tr>
                      <th className="py-2.5 px-3">Scenario</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3 text-right">Holdings Affected</th>
                      <th className="py-2.5 px-3 text-right">USD Weight (%)</th>
                      <th className="py-2.5 px-3 text-right">Hypothetical USD P&L</th>
                      <th className="py-2.5 px-3 text-right">INR Weight (%)</th>
                      <th className="py-2.5 px-3 text-right">Evidence Gaps</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1c2b3c]/60">
                    {comparison.scenarios.map(sc => (
                      <tr key={sc.scenarioId} className="hover:bg-[#121c2c] transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-white">{sc.name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-300 text-[11px]">{sc.scenarioType}</td>
                        <td className="py-2.5 px-3">
                          <span className={`font-mono text-[11px] ${
                            sc.severity === 'HIGH' ? 'text-rose-400' : sc.severity === 'MEDIUM' ? 'text-amber-400' : 'text-slate-300'
                          }`}>
                            {sc.severity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">{sc.affectedHoldingsCount}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">{sc.affectedWeightPctUsd.toFixed(1)}%</td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-rose-400">
                          ${sc.hypotheticalPnlUsd.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-200">{sc.affectedWeightPctInr.toFixed(1)}%</td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-400">{sc.insufficientEvidenceCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Saved Snapshots */}
        {activeTab === 'snapshots' && (
          <div className="space-y-4">
            <div className="text-xs text-slate-400">
              Immutable historical snapshots recorded with complete parameter provenance and PIT timestamps.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {snapshots.map(s => (
                <div key={s.snapshotId} className="bg-[#090d14] border border-[#1c2b3c] rounded p-4 space-y-2">
                  <div className="font-semibold text-white text-sm">{s.title}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>{s.scenarioType}</span>
                    <span>·</span>
                    <span className="font-mono">{s.asOfDate}</span>
                  </div>
                  <div className="text-xs text-slate-300 pt-2 border-t border-[#1c2b3c]/60">
                    <div>Holdings: {s.evaluation.portfolioSummary.affectedHoldingsCount} affected</div>
                    <div>USD P&L: ${s.evaluation.portfolioSummary.usd.hypotheticalPnl.toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {snapshots.length === 0 && (
                <div className="col-span-3 text-xs text-slate-500 py-6 text-center">
                  No scenario snapshots saved yet. Use the Save Immutable Snapshot button above.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Security Detail Drawer Modal */}
      {selectedSecurity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c2b3c]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold font-mono text-[#38bdf8]">{selectedSecurity.ticker}</span>
                  <span className="text-sm text-slate-300">{selectedSecurity.companyName}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {selectedSecurity.sector} · {selectedSecurity.market} · {selectedSecurity.currency}
                </div>
              </div>
              <button
                onClick={() => setSelectedSecurity(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Exposure Basis & Explanation */}
            <div className="bg-[#101826] border border-[#1c2b3c] rounded p-3 text-xs space-y-1">
              <div className="text-slate-400 font-mono uppercase text-[10px]">Exposure Basis: {selectedSecurity.exposureBasis}</div>
              <div className="text-slate-200">{selectedSecurity.exposureExplanation}</div>
            </div>

            {/* Position & Hypothetical PnL */}
            {selectedSecurity.isPortfolioHolding && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-[#101826] p-2.5 rounded border border-[#1c2b3c]">
                  <div className="text-slate-400 text-[10px]">Shares Held</div>
                  <div className="text-sm font-mono font-bold text-white mt-0.5">{selectedSecurity.shares.toLocaleString()}</div>
                </div>
                <div className="bg-[#101826] p-2.5 rounded border border-[#1c2b3c]">
                  <div className="text-slate-400 text-[10px]">Portfolio Weight</div>
                  <div className="text-sm font-mono font-bold text-white mt-0.5">{selectedSecurity.portfolioWeightPct.toFixed(1)}%</div>
                </div>
                <div className="bg-[#101826] p-2.5 rounded border border-[#1c2b3c]">
                  <div className="text-slate-400 text-[10px]">Scenario Shock</div>
                  <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">{selectedSecurity.scenarioShockPct}%</div>
                </div>
                <div className="bg-[#101826] p-2.5 rounded border border-[#1c2b3c]">
                  <div className="text-slate-400 text-[10px]">Hypothetical P&L</div>
                  <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">
                    {selectedSecurity.currency === 'INR' ? '₹' : '$'}{selectedSecurity.hypotheticalPnl?.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* Related Invalidation Guards */}
            {selectedSecurity.relevantInvalidationGuards.length > 0 && (
              <div className="text-xs space-y-1.5">
                <div className="font-semibold text-slate-300">Monitored Invalidation Guards:</div>
                <div className="space-y-1">
                  {selectedSecurity.relevantInvalidationGuards.map((g, idx) => (
                    <div key={idx} className="bg-[#101826] p-2 rounded border border-[#1c2b3c] flex items-center justify-between">
                      <span className="text-slate-200">{g.guardName}</span>
                      <span className="font-mono text-amber-400 text-[10px]">{g.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deep Links Navigation */}
            <div className="pt-3 border-t border-[#1c2b3c] flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 mr-2">Institutional Deep Links:</span>
              <button
                onClick={() => {
                  setSelectedSecurity(null);
                  if (onNavigate) onNavigate('monitor');
                }}
                className="px-2.5 py-1 bg-[#1c2b3c] hover:bg-[#283d54] text-xs text-white rounded flex items-center gap-1"
              >
                Review Workspace <ExternalLink className="w-3 h-3 text-[#38bdf8]" />
              </button>
              <button
                onClick={() => {
                  setSelectedSecurity(null);
                  if (onNavigate) onNavigate('research');
                }}
                className="px-2.5 py-1 bg-[#1c2b3c] hover:bg-[#283d54] text-xs text-white rounded flex items-center gap-1"
              >
                Research Notebook <ExternalLink className="w-3 h-3 text-[#38bdf8]" />
              </button>
              <button
                onClick={() => {
                  setSelectedSecurity(null);
                  if (onNavigate) onNavigate('cross-investment');
                }}
                className="px-2.5 py-1 bg-[#1c2b3c] hover:bg-[#283d54] text-xs text-white rounded flex items-center gap-1"
              >
                Cross-Investment <ExternalLink className="w-3 h-3 text-[#38bdf8]" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
