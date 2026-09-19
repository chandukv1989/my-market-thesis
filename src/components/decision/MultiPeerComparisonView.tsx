import React, { useState, useEffect } from 'react';
import {
  MultiPeerComparisonResult,
  MultiPeerComparisonRequest,
  PeerComparisonSecurityData,
  Stock
} from '../../types';
import {
  Layers,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  Sliders,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Info,
  Building2,
  Sparkles
} from 'lucide-react';

interface MultiPeerComparisonViewProps {
  currentStock: Stock;
  allStocks: Stock[];
  onSelectTicker: (ticker: string) => void;
}

const PRESET_BASKETS: { name: string; tickers: string[] }[] = [
  { name: 'AI & Semiconductors', tickers: ['NVDA', 'TSM', 'ASML', 'AVGO'] },
  { name: 'US Mega-Cap Tech', tickers: ['NVDA', 'MSFT', 'AAPL', 'AMZN'] },
  { name: 'Global Tech Giants', tickers: ['NVDA', 'MSFT', 'TSM', 'SAP'] },
  { name: 'India Blue-Chips', tickers: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK'] }
];

type SortColumn =
  | 'ticker'
  | 'compositeScore'
  | 'peRatio'
  | 'psRatio'
  | 'evEbitda'
  | 'revenueGrowth'
  | 'operatingMargin'
  | 'beta';

export const MultiPeerComparisonView: React.FC<MultiPeerComparisonViewProps> = ({
  currentStock,
  allStocks,
  onSelectTicker
}) => {
  const [selectedTickers, setSelectedTickers] = useState<string[]>([
    currentStock.ticker,
    'MSFT',
    'AAPL',
    'AMZN'
  ]);
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<MultiPeerComparisonResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortColumn>('compositeScore');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [customTickerInput, setCustomTickerInput] = useState<string>('');

  const runComparison = async (tickersToCompare = selectedTickers, targetDate = asOfDate) => {
    if (tickersToCompare.length < 2) {
      setError('Please select at least 2 securities for peer comparison.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: MultiPeerComparisonRequest = {
        securityIds: tickersToCompare,
        asOfDate: targetDate
      };
      const res = await fetch('/api/decisions/compare-peers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error(`Peer comparison failed: ${res.statusText}`);
      }
      const data: MultiPeerComparisonResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Ensure current stock is always part of initial comparison
    if (!selectedTickers.includes(currentStock.ticker)) {
      setSelectedTickers(prev => [currentStock.ticker, ...prev.slice(0, 3)]);
    }
    runComparison();
  }, [currentStock.ticker]);

  const handleApplyPreset = (presetTickers: string[]) => {
    setSelectedTickers(presetTickers);
    runComparison(presetTickers, asOfDate);
  };

  const handleAddCustomTicker = () => {
    const t = customTickerInput.trim().toUpperCase();
    if (!t) return;
    if (selectedTickers.includes(t)) {
      setCustomTickerInput('');
      return;
    }
    if (selectedTickers.length >= 10) {
      setError('Maximum 10 securities allowed for peer comparison.');
      return;
    }
    const updated = [...selectedTickers, t];
    setSelectedTickers(updated);
    setCustomTickerInput('');
    runComparison(updated, asOfDate);
  };

  const handleRemoveTicker = (t: string) => {
    if (selectedTickers.length <= 2) {
      setError('At least 2 securities are required.');
      return;
    }
    const updated = selectedTickers.filter(item => item !== t);
    setSelectedTickers(updated);
    runComparison(updated, asOfDate);
  };

  const handleSort = (field: SortColumn) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getFieldValue = (s: PeerComparisonSecurityData, col: SortColumn): number | string | null => {
    switch (col) {
      case 'ticker': return s.identity.ticker;
      case 'compositeScore': return s.decision.compositeScore;
      case 'peRatio': return s.valuation.peRatio;
      case 'psRatio': return s.valuation.psRatio;
      case 'evEbitda': return s.valuation.evEbitda;
      case 'revenueGrowth': return s.fundamentals.revenueGrowth;
      case 'operatingMargin': return s.fundamentals.operatingMargin;
      case 'beta': return s.risk.beta;
    }
  };

  const getAssessmentColor = (overall: string) => {
    switch (overall) {
      case 'POSITIVE':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/40';
      case 'CONSTRUCTIVE':
        return 'text-[#38bdf8] bg-[#38bdf8]/10 border-[#38bdf8]/40';
      case 'NEUTRAL':
        return 'text-slate-300 bg-slate-500/10 border-slate-500/40';
      case 'CAUTIOUS':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/40';
      case 'NEGATIVE':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/40';
      default:
        return 'text-slate-400 bg-slate-800/40 border-slate-600';
    }
  };

  // Sort securities
  const sortedSecurities = result?.securities ? [...result.securities].sort((a, b) => {
    const valA = getFieldValue(a, sortField);
    const valB = getFieldValue(b, sortField);
    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortAsc ? valA - valB : valB - valA;
    }
    return sortAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
  }) : [];

  return (
    <div className="space-y-6">
      {/* PEER BENCHMARK CONTROLS */}
      <div className="bg-[#0a1622] border border-[#1c2b3c] rounded-sm p-4 lg:p-6 space-y-4 font-mono text-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] text-[#87929a] uppercase tracking-wider mb-1">
              Multi-Company Peer Valuation Grid
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Cross-Security Decision Benchmarking</h2>
              <span className="px-2 py-0.5 rounded-xs bg-[#0d1f30] text-[#38bdf8] border border-[#1c2b3c] text-[10px]">
                {selectedTickers.length} Peers Selected
              </span>
            </div>
          </div>

          {/* Point-in-time & Run Button */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-[#06101a] px-3 py-1.5 rounded-xs border border-[#1c2b3c]">
              <Clock className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="text-[#87929a]">As of:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => runComparison()}
              disabled={loading}
              className="px-3.5 py-1.5 bg-[#38bdf8] hover:bg-[#38bdf8]/80 text-[#06101a] font-bold rounded-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Evaluating...' : 'Refresh Grid'}</span>
            </button>
          </div>
        </div>

        {/* Preset Basket Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[#1c2b3c]/60">
          <span className="text-[#87929a] text-[11px]">Peer Baskets:</span>
          {PRESET_BASKETS.map(basket => (
            <button
              key={basket.name}
              onClick={() => handleApplyPreset(basket.tickers)}
              className="px-2.5 py-1 rounded-xs bg-[#06121e] hover:bg-[#0d1e30] border border-[#1c2b3c] hover:border-[#38bdf8]/50 text-slate-300 hover:text-white transition-colors"
            >
              {basket.name}
            </button>
          ))}
        </div>

        {/* Selected Badges & Add Custom Ticker */}
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <span className="text-[#87929a] text-[11px]">Active Peers:</span>
          {selectedTickers.map(t => (
            <div
              key={t}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs bg-[#06101a] border border-[#38bdf8]/40 text-[#38bdf8] font-bold"
            >
              <button onClick={() => onSelectTicker(t)} className="hover:underline">
                {t}
              </button>
              {selectedTickers.length > 2 && (
                <button
                  onClick={() => handleRemoveTicker(t)}
                  className="text-slate-500 hover:text-rose-400 text-[10px] ml-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* Quick add custom ticker */}
          <div className="flex items-center gap-1 ml-auto">
            <input
              type="text"
              placeholder="+ Add Ticker"
              value={customTickerInput}
              onChange={e => setCustomTickerInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustomTicker()}
              className="w-24 px-2 py-0.5 bg-[#06101a] border border-[#1c2b3c] rounded-xs text-white uppercase focus:outline-none focus:border-[#38bdf8]"
            />
            <button
              onClick={handleAddCustomTicker}
              className="px-2 py-0.5 bg-[#122131] hover:bg-[#1c2b3c] text-[#38bdf8] border border-[#1c2b3c] rounded-xs font-bold"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#0a1622] border border-rose-500/40 rounded-sm text-rose-300 text-xs font-mono">
          {error}
        </div>
      )}

      {/* SUMMARY BENCHMARK CARD */}
      {result && !loading && (
        <div className="bg-[#0a1622] border border-[#1c2b3c] rounded-sm p-4 lg:p-6 space-y-4 font-mono text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#06121e] border border-[#1c2b3c] rounded-xs space-y-1">
              <span className="text-[#87929a] text-[10px] uppercase">Top Ranked Peer</span>
              <div className="text-emerald-400 font-bold text-sm">
                {result.rankings[0]?.symbol || '—'}
              </div>
              <span className="text-[10px] text-[#87929a]">
                Score: {result.rankings[0]?.compositeScore.toFixed(2)}
              </span>
            </div>

            <div className="p-3 bg-[#06121e] border border-[#1c2b3c] rounded-xs space-y-1">
              <span className="text-[#87929a] text-[10px] uppercase">Median Peer Score</span>
              <div className="text-white font-bold text-sm">
                {result.medianScores.compositeScore.toFixed(2)}
              </div>
              <span className="text-[10px] text-[#87929a]">
                Across {result.totalSecurities} peers
              </span>
            </div>

            <div className="p-3 bg-[#06121e] border border-[#1c2b3c] rounded-xs space-y-1">
              <span className="text-[#87929a] text-[10px] uppercase">Lowest Valuation P/E</span>
              <div className="text-[#38bdf8] font-bold text-sm">
                {Math.min(...result.securities.map(s => s.valuation.peRatio ?? 999)).toFixed(1)}x
              </div>
              <span className="text-[10px] text-[#87929a]">
                Median: {result.medianScores.peRatio?.toFixed(1) || '—'}x
              </span>
            </div>

            <div className="p-3 bg-[#06121e] border border-[#1c2b3c] rounded-xs space-y-1">
              <span className="text-[#87929a] text-[10px] uppercase">Analytical Safeguards</span>
              <div className="text-amber-400 font-bold text-sm">
                Strict Guard Enforced
              </div>
              <span className="text-[10px] text-[#87929a]">
                Zero execution / No advisory
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#06101a] border border-[#1c2b3c] rounded-xs text-[11px] text-[#d4e4fa] leading-relaxed">
            <span className="font-bold text-[#38bdf8] mr-2">Analytical Comparison:</span>
            {result.analyticalSummary}
          </div>
        </div>
      )}

      {/* MULTI-PEER VALUATION & DECISION GRID */}
      {result && !loading && (
        <div className="bg-[#0a1622] border border-[#1c2b3c] rounded-sm p-4 lg:p-6 space-y-4 font-mono text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#38bdf8]" />
              Comparative Metrics Matrix
            </h3>
            <span className="text-[10px] text-[#87929a]">Click column header to sort</span>
          </div>

          <div className="overflow-x-auto border border-[#1c2b3c] rounded-sm">
            <table className="w-full text-left text-xs divide-y divide-[#1c2b3c]">
              <thead>
                <tr className="bg-[#06101a] text-[#87929a]">
                  <th className="py-2.5 px-3 cursor-pointer" onClick={() => handleSort('ticker')}>
                    <div className="flex items-center gap-1">
                      <span>Security</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort('compositeScore')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Composite</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center">Assessment</th>
                  <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort('peRatio')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>P/E (TTM)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort('psRatio')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>P/S</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort('evEbitda')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>EV/EBITDA</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort('revenueGrowth')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Rev Growth</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort('operatingMargin')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Op Margin</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort('beta')}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Beta</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Top Value Driver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2b3c]/50 bg-[#06121e]">
                {sortedSecurities.map((sec) => (
                  <tr
                    key={sec.identity.securityId}
                    className={`hover:bg-[#0d1e30] transition-colors ${
                      sec.identity.ticker === currentStock.ticker ? 'bg-[#0d2238]/60 font-semibold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectTicker(sec.identity.ticker)}
                          className="font-bold text-[#38bdf8] hover:underline"
                        >
                          {sec.identity.ticker}
                        </button>
                        <span className="text-[10px] text-[#87929a] truncate max-w-[120px]">
                          {sec.identity.companyName}
                        </span>
                        {sec.identity.ticker === currentStock.ticker && (
                          <span className="text-[9px] px-1 bg-[#38bdf8]/20 text-[#38bdf8] rounded-xs">
                            CURRENT
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span className="font-bold text-white text-sm">
                        {sec.decision.compositeScore.toFixed(2)}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-xs text-[10px] font-bold border ${getAssessmentColor(sec.decision.overallAssessment)}`}>
                        {sec.decision.overallAssessment}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-center text-slate-300">
                      {sec.valuation.peRatio !== null ? `${sec.valuation.peRatio.toFixed(1)}x` : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-center text-slate-300">
                      {sec.valuation.psRatio !== null ? `${sec.valuation.psRatio.toFixed(1)}x` : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-center text-slate-300">
                      {sec.valuation.evEbitda !== null ? `${sec.valuation.evEbitda.toFixed(1)}x` : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {sec.fundamentals.revenueGrowth !== null ? (
                        <span className={sec.fundamentals.revenueGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {(sec.fundamentals.revenueGrowth * 100).toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {sec.fundamentals.operatingMargin !== null ? (
                        <span className="text-slate-300">
                          {(sec.fundamentals.operatingMargin * 100).toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-center text-slate-400">
                      {sec.risk.beta !== null ? sec.risk.beta.toFixed(2) : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-[#87929a] text-[11px] truncate max-w-[200px]">
                      {sec.decision.topDriver || 'Core business execution'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 10-DIMENSION SCORE MATRIX */}
      {result && !loading && (
        <div className="bg-[#0a1622] border border-[#1c2b3c] rounded-sm p-4 lg:p-6 space-y-4 font-mono text-xs">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#38bdf8]" />
            10-Dimension Score Comparison Matrix
          </h3>

          <div className="overflow-x-auto border border-[#1c2b3c] rounded-sm">
            <table className="w-full text-left text-xs divide-y divide-[#1c2b3c]">
              <thead>
                <tr className="bg-[#06101a] text-[#87929a]">
                  <th className="py-2.5 px-3">Canonical Dimension</th>
                  {result.securities.map(s => (
                    <th key={s.identity.securityId} className="py-2.5 px-3 text-center">
                      {s.identity.ticker}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2b3c]/50 bg-[#06121e]">
                {Object.keys(result.securities[0]?.dimensionScores || {}).map(dimKey => (
                  <tr key={dimKey} className="hover:bg-[#0d1e30] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                      {dimKey.replace(/_/g, ' ')}
                    </td>
                    {result.securities.map(s => {
                      const score = s.dimensionScores[dimKey];
                      return (
                        <td key={s.identity.securityId} className="py-2.5 px-3 text-center font-bold">
                          {score !== undefined ? (
                            <span className={
                              score >= 70
                                ? 'text-emerald-400'
                                : score >= 50
                                ? 'text-[#38bdf8]'
                                : score >= 35
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }>
                              {score.toFixed(1)}
                            </span>
                          ) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
