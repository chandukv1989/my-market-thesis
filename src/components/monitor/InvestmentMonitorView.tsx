import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  InvestmentMonitor,
  InvestmentMonitorReview,
  AnalystReviewNote,
  ReviewCadence,
  InvestmentMonitorStatus,
  Stock,
  PortfolioData,
  MonitorReviewAction
} from '../../types';
import { InvestmentReviewWorkspace } from './InvestmentReviewWorkspace';
import { ContinuousAlertOrchestrationPanel } from './ContinuousAlertOrchestrationPanel';
import {
  Radar,
  Calendar,
  Clock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  PlusCircle,
  X,
  FileText,
  Activity,
  ArrowRight,
  Sparkles,
  Layers,
  History,
  MessageSquare,
  Check,
  Search,
  BookOpen,
  PieChart,
  ChevronRight,
  Info
} from 'lucide-react';

interface InvestmentMonitorViewProps {
  onSelectStock?: (ticker: string) => void;
  onOpenEvidence?: (evidence: any) => void;
  allStocks?: Stock[];
  portfolio?: PortfolioData;
}

export const InvestmentMonitorView: React.FC<InvestmentMonitorViewProps> = ({
  onSelectStock,
  onOpenEvidence,
  allStocks = [],
  portfolio
}) => {
  // State
  const [monitors, setMonitors] = useState<InvestmentMonitor[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detectingChanges, setDetectingChanges] = useState<boolean>(false);
  const [executingReview, setExecutingReview] = useState<boolean>(false);
  const [currentReviewDraft, setCurrentReviewDraft] = useState<InvestmentMonitorReview | null>(null);
  const [reviewsHistory, setReviewsHistory] = useState<InvestmentMonitorReview[]>([]);
  const [analystNotes, setAnalystNotes] = useState<AnalystReviewNote[]>([]);
  const [asOfDate, setAsOfDate] = useState<string>('');
  
  // UI Tabs & Modals
  const [activeSubTab, setActiveSubTab] = useState<'changes' | 'history' | 'notes'>('changes');
  const [showNewMonitorModal, setShowNewMonitorModal] = useState<boolean>(false);
  const [newTicker, setNewTicker] = useState<string>('NVDA');
  const [newCadence, setNewCadence] = useState<ReviewCadence>('DAILY');
  const [noteContent, setNoteContent] = useState<string>('');
  const [addingNote, setAddingNote] = useState<boolean>(false);
  const [reviewNoteInput, setReviewNoteInput] = useState<string>('');
  const [selectedHistoricalReview, setSelectedHistoricalReview] = useState<InvestmentMonitorReview | null>(null);
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'workspace' | 'orchestration'>('workspace');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch all monitors
  const loadMonitors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/monitors');
      if (res.ok) {
        const data: InvestmentMonitor[] = await res.json();
        setMonitors(data);
        if (data.length > 0 && !selectedMonitorId) {
          setSelectedMonitorId(data[0].monitorId);
        }
      }
    } catch (err) {
      console.error('Failed to load monitors:', err);
      setErrorMessage('Failed to connect to monitor service');
    } finally {
      setLoading(false);
    }
  }, [selectedMonitorId]);

  useEffect(() => {
    loadMonitors();
  }, [loadMonitors]);

  const activeMonitor = useMemo(() => {
    return monitors.find(m => m.monitorId === selectedMonitorId) || null;
  }, [monitors, selectedMonitorId]);

  // Load changes, review history, and notes for active monitor
  const loadMonitorData = useCallback(async (monitorId: string, customAsOf?: string) => {
    try {
      setDetectingChanges(true);
      const dateParam = customAsOf || asOfDate;
      const query = dateParam ? `?asOfDate=${encodeURIComponent(dateParam)}` : '';
      
      const [changesRes, historyRes, notesRes] = await Promise.all([
        fetch(`/api/monitors/${monitorId}/changes${query}`),
        fetch(`/api/monitors/${monitorId}/reviews`),
        fetch(`/api/monitors/${monitorId}/notes`)
      ]);

      if (changesRes.ok) {
        const draft: InvestmentMonitorReview = await changesRes.json();
        setCurrentReviewDraft(draft);
      }
      if (historyRes.ok) {
        const history: InvestmentMonitorReview[] = await historyRes.json();
        setReviewsHistory(history);
      }
      if (notesRes.ok) {
        const notes: AnalystReviewNote[] = await notesRes.json();
        setAnalystNotes(notes);
      }
    } catch (err) {
      console.error('Failed to load monitor data:', err);
    } finally {
      setDetectingChanges(false);
    }
  }, [asOfDate]);

  useEffect(() => {
    if (selectedMonitorId) {
      loadMonitorData(selectedMonitorId);
    }
  }, [selectedMonitorId, loadMonitorData]);

  // Register New Monitor
  const handleCreateMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim()) return;
    try {
      setLoading(true);
      const res = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: newTicker.trim().toUpperCase(),
          reviewCadence: newCadence
        })
      });
      if (res.ok) {
        const created: InvestmentMonitor = await res.json();
        setMonitors(prev => [created, ...prev.filter(m => m.monitorId !== created.monitorId)]);
        setSelectedMonitorId(created.monitorId);
        setShowNewMonitorModal(false);
        setSuccessMessage(`Registered monitor for ${created.ticker}`);
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to create monitor');
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setLoading(false);
    }
  };

  // Commit and Execute Review with Action & Note
  const handleExecuteReview = async (action: MonitorReviewAction = 'REVIEWED', noteText?: string) => {
    if (!selectedMonitorId) return;
    try {
      setExecutingReview(true);
      const res = await fetch(`/api/monitors/${selectedMonitorId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewAction: action,
          analystNote: (noteText !== undefined ? noteText : reviewNoteInput).trim() || undefined
        })
      });
      if (res.ok) {
        const review: InvestmentMonitorReview = await res.json();
        setSuccessMessage(`Immutable review snapshot #${review.reviewId.slice(0, 8)} committed with action [${action}].`);
        setReviewNoteInput('');
        // Reload monitor & data
        await loadMonitors();
        await loadMonitorData(selectedMonitorId);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to execute review');
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setExecutingReview(false);
    }
  };

  const handleAddNoteFromWorkspace = async (content: string) => {
    if (!selectedMonitorId || !content.trim()) return;
    try {
      const res = await fetch(`/api/monitors/${selectedMonitorId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          reviewId: currentReviewDraft?.reviewId
        })
      });
      if (res.ok) {
        const note: AnalystReviewNote = await res.json();
        setAnalystNotes(prev => [note, ...prev]);
        setSuccessMessage('Analyst note appended to audit trail.');
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  // Add Analyst Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMonitorId || !noteContent.trim()) return;
    try {
      setAddingNote(true);
      const res = await fetch(`/api/monitors/${selectedMonitorId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: noteContent.trim(),
          reviewId: currentReviewDraft?.reviewId
        })
      });
      if (res.ok) {
        const note: AnalystReviewNote = await res.json();
        setAnalystNotes(prev => [note, ...prev]);
        setNoteContent('');
        setSuccessMessage('Analyst note appended to immutable audit log.');
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setAddingNote(false);
    }
  };

  // Filtered monitors list
  const filteredMonitors = useMemo(() => {
    if (!filterSearch.trim()) return monitors;
    const term = filterSearch.toLowerCase();
    return monitors.filter(m =>
      m.ticker.toLowerCase().includes(term) ||
      m.companyName.toLowerCase().includes(term)
    );
  }, [monitors, filterSearch]);

  const displayedReview = selectedHistoricalReview || currentReviewDraft;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#051424] text-[#d4e4fa]">
      {/* Top Banner: Strict Analytical-Only Safeguards & Header */}
      <div className="border-b border-[#1c2b3c] bg-[#090d14] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-[#38bdf8]/10 border border-[#38bdf8]/30 flex items-center justify-center text-[#38bdf8]">
              <Radar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-[#f0f6fc] tracking-wide uppercase">
                  INVESTMENT MONITOR & THESIS HEALTH INTELLIGENCE
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                  CONTINUOUS CHANGE v25
                </span>
              </div>
              <p className="text-xs text-[#87929a]">
                Institutional-grade security monitoring: Baseline Snapshot → New Evidence → Events → Thesis Health → Decision Delta → Portfolio Exposure.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Analytical Safeguard Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-xs font-mono">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="font-semibold">ANALYTICAL-ONLY: EXECUTION PROHIBITED</span>
            </div>

            {/* Point-In-Time As Of Filter */}
            <div className="flex items-center gap-2 bg-[#051424] border border-[#1c2b3c] px-2.5 py-1 rounded text-xs">
              <Clock className="w-3.5 h-3.5 text-[#87929a]" />
              <span className="text-[11px] text-[#87929a]">PIT Date:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={e => {
                  setAsOfDate(e.target.value);
                  if (selectedMonitorId) loadMonitorData(selectedMonitorId, e.target.value);
                }}
                className="bg-transparent text-xs text-[#38bdf8] focus:outline-hidden font-mono"
              />
              {asOfDate && (
                <button
                  onClick={() => {
                    setAsOfDate('');
                    if (selectedMonitorId) loadMonitorData(selectedMonitorId, '');
                  }}
                  className="text-[#87929a] hover:text-white"
                  title="Clear PIT date"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Register New Monitor Button */}
            <button
              onClick={() => setShowNewMonitorModal(true)}
              className="flex items-center gap-1.5 bg-[#38bdf8] hover:bg-[#0284c7] text-[#051424] px-3.5 py-1.5 rounded text-xs font-semibold tracking-wide transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Register Monitor
            </button>
          </div>
        </div>

        {/* View Mode Ribbon */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1c2b3c]/60">
          <button
            id="tab-mode-workspace"
            onClick={() => setViewMode('workspace')}
            className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              viewMode === 'workspace'
                ? 'bg-[#38bdf8] text-[#051424] font-semibold'
                : 'bg-[#051424] text-[#87929a] hover:text-[#d4e4fa] border border-[#1c2b3c]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Investment Review Workspace
          </button>

          <button
            id="tab-mode-orchestration"
            onClick={() => setViewMode('orchestration')}
            className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              viewMode === 'orchestration'
                ? 'bg-[#10b981] text-[#051424] font-semibold'
                : 'bg-[#051424] text-[#87929a] hover:text-[#d4e4fa] border border-[#1c2b3c]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Continuous Alerts & Policies (Phase 27)
          </button>
        </div>

        {/* Notifications Bar */}
        {successMessage && (
          <div className="mt-3 px-3 py-1.5 bg-[#10b981]/15 border border-[#10b981]/30 rounded text-xs text-[#10b981] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {successMessage}
            </span>
            <button onClick={() => setSuccessMessage(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 px-3 py-1.5 bg-[#ef4444]/15 border border-[#ef4444]/30 rounded text-xs text-[#ef4444] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {errorMessage}
            </span>
            <button onClick={() => setErrorMessage(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Monitored Securities Directory */}
        <div className="w-80 border-r border-[#1c2b3c] bg-[#07101b] flex flex-col shrink-0">
          <div className="p-3 border-b border-[#1c2b3c] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#87929a]" />
              <input
                type="text"
                placeholder="Search monitors..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="w-full bg-[#051424] border border-[#1c2b3c] rounded pl-8 pr-2.5 py-1.5 text-xs text-[#d4e4fa] placeholder-[#87929a] focus:outline-hidden focus:border-[#38bdf8]"
              />
            </div>
            <button
              onClick={() => loadMonitors()}
              className="p-1.5 text-[#87929a] hover:text-[#d4e4fa] hover:bg-[#1c2b3c]/50 rounded"
              title="Refresh monitors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#1c2b3c]/50">
            {filteredMonitors.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#87929a]">
                {loading ? 'Loading monitors...' : 'No monitored securities found.'}
              </div>
            ) : (
              filteredMonitors.map(monitor => {
                const isSelected = monitor.monitorId === selectedMonitorId;
                const isInvalidated = monitor.invalidationStatus === 'TRIGGERED';
                const hasExposure = monitor.portfolioExposure?.hasExposure;

                return (
                  <button
                    key={monitor.monitorId}
                    onClick={() => {
                      setSelectedMonitorId(monitor.monitorId);
                      setSelectedHistoricalReview(null);
                    }}
                    className={`w-full text-left p-3.5 transition-colors flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-[#1c2b3c]/60 border-l-2 border-[#38bdf8]'
                        : 'hover:bg-[#101b2b]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#f0f6fc]">
                          {monitor.ticker}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-[#1c2b3c] text-[#87929a]">
                          {monitor.reviewCadence}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isInvalidated ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/40">
                            INVALIDATED
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                            {monitor.thesisStatus || 'HEALTHY'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-[#87929a] truncate">
                      {monitor.companyName}
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[#87929a]">Score:</span>
                        <span className="font-mono font-semibold text-[#f0f6fc]">
                          {monitor.latestCompositeScore ?? monitor.baselineCompositeScore ?? '—'}
                        </span>
                        {monitor.latestRating && (
                          <span className="text-[10px] text-[#38bdf8] font-mono">
                            ({monitor.latestRating})
                          </span>
                        )}
                      </div>
                      {hasExposure && (
                        <span className="text-[10px] font-mono text-[#38bdf8] bg-[#38bdf8]/10 px-1.5 py-0.2 rounded border border-[#38bdf8]/20">
                          {monitor.portfolioExposure.weightPct?.toFixed(1)}% PORT
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Monitor Details, Change Detection & Audit Workspace OR Orchestration Panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#051424]">
          {viewMode === 'orchestration' ? (
            <div className="flex-1 p-5 overflow-y-auto">
              <ContinuousAlertOrchestrationPanel
                selectedMonitorId={selectedMonitorId}
                onOpenReviewForMonitor={(monId) => {
                  setSelectedMonitorId(monId);
                  setViewMode('workspace');
                }}
              />
            </div>
          ) : activeMonitor ? (
            <InvestmentReviewWorkspace
              monitor={activeMonitor}
              currentReviewDraft={currentReviewDraft}
              selectedHistoricalReview={selectedHistoricalReview}
              reviewsHistory={reviewsHistory}
              analystNotes={analystNotes}
              detectingChanges={detectingChanges}
              executingReview={executingReview}
              onExecuteReview={handleExecuteReview}
              onSelectHistoricalReview={setSelectedHistoricalReview}
              onRefreshChanges={() => loadMonitorData(activeMonitor.monitorId, asOfDate)}
              onOpenEvidence={onOpenEvidence}
              onSelectStock={onSelectStock}
              onAddNote={handleAddNoteFromWorkspace}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[#87929a]">
              <Radar className="w-12 h-12 text-[#1c2b3c] mb-4" />
              <h3 className="text-sm font-semibold text-[#f0f6fc]">Select or Register an Investment Monitor</h3>
              <p className="text-xs max-w-md mt-1 mb-4">
                Institutional investment monitors continuously evaluate new evidence, SEC filings, events, thesis health, and decision shifts against your review baselines.
              </p>
              <button
                onClick={() => setShowNewMonitorModal(true)}
                className="bg-[#38bdf8] text-[#051424] px-4 py-2 rounded text-xs font-semibold"
              >
                Register First Monitor
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Register New Monitored Security */}
      {showNewMonitorModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#090d14] border border-[#1c2b3c] rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-3">
              <div className="flex items-center gap-2">
                <Radar className="w-4 h-4 text-[#38bdf8]" />
                <h3 className="text-sm font-semibold text-[#f0f6fc] uppercase tracking-wide">
                  Register Monitored Security
                </h3>
              </div>
              <button onClick={() => setShowNewMonitorModal(false)} className="text-[#87929a] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMonitor} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#87929a] mb-1.5">
                  Security Ticker or Symbol:
                </label>
                <input
                  type="text"
                  value={newTicker}
                  onChange={e => setNewTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. NVDA, AAPL, MSFT, RELIANCE"
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded px-3 py-2 text-xs text-[#f0f6fc] font-mono focus:outline-hidden focus:border-[#38bdf8]"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['NVDA', 'AAPL', 'MSFT', 'RELIANCE', 'TCS'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewTicker(t)}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1c2b3c] text-[#87929a] hover:text-[#38bdf8]"
                    >
                      +{t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#87929a] mb-1.5">
                  Review Cadence:
                </label>
                <select
                  value={newCadence}
                  onChange={e => setNewCadence(e.target.value as ReviewCadence)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded px-3 py-2 text-xs text-[#f0f6fc] font-mono focus:outline-hidden focus:border-[#38bdf8]"
                >
                  <option value="CONTINUOUS">Continuous (Real-Time Ingestion)</option>
                  <option value="DAILY">Daily (Market Close Review)</option>
                  <option value="WEEKLY">Weekly (Strategic Summary)</option>
                  <option value="MONTHLY">Monthly (Committee Cadence)</option>
                  <option value="QUARTERLY">Quarterly (Earnings / 10-Q Cycle)</option>
                </select>
              </div>

              <div className="p-3 bg-[#051424] border border-[#1c2b3c] rounded text-[11px] text-[#87929a] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#d4e4fa]">
                  <Info className="w-3.5 h-3.5 text-[#38bdf8]" /> Baseline Snapshot
                </div>
                <p>
                  Creating this monitor captures current decision models, SEC filings, and events as an immutable baseline snapshot for incremental delta attribution.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowNewMonitorModal(false)}
                  className="px-3 py-1.5 text-xs text-[#87929a] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !newTicker.trim()}
                  className="bg-[#38bdf8] hover:bg-[#0284c7] text-[#051424] px-4 py-1.5 rounded text-xs font-semibold"
                >
                  {loading ? 'Creating...' : 'Register Monitor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
