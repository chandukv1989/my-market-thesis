import React, { useState, useEffect } from 'react';
import {
  InvestmentEvent,
  InvestmentEventType,
  InvestmentEventImpact,
  InvestmentEventTimeline,
  ThesisImpactArea
} from '../../types';
import {
  Calendar,
  Clock,
  FileText,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Layers,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  PlusCircle,
  X,
  PieChart,
  RefreshCw,
  Sparkles,
  ArrowRight,
  HelpCircle,
  Search
} from 'lucide-react';

interface InvestmentEventsViewProps {
  securityId: string;
  ticker: string;
  market?: string;
  onOpenEvidence?: (evidence: any) => void;
}

export const InvestmentEventsView: React.FC<InvestmentEventsViewProps> = ({
  securityId,
  ticker,
  market = 'US',
  onOpenEvidence
}) => {
  const [timeline, setTimeline] = useState<InvestmentEventTimeline | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [onlyHighSignificance, setOnlyHighSignificance] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected event impact
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [impact, setImpact] = useState<InvestmentEventImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState<boolean>(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // Ingestion Modal
  const [showRecordModal, setShowRecordModal] = useState<boolean>(false);
  const [newEventType, setNewEventType] = useState<InvestmentEventType>('SEC_FILING');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newSummary, setNewSummary] = useState<string>('');
  const [newEventDate, setNewEventDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newSourceType, setNewSourceType] = useState<string>('SEC_EDGAR');
  const [newSourceRef, setNewSourceRef] = useState<string>('');
  const [newAffectedAreas, setNewAffectedAreas] = useState<ThesisImpactArea[]>(['BULL_CASE']);
  const [newMetricKey, setNewMetricKey] = useState<string>('marginPct');
  const [newMetricPrev, setNewMetricPrev] = useState<string>('71.5');
  const [newMetricCurr, setNewMetricCurr] = useState<string>('74.2');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchTimeline = async (dateFilter?: string) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/events/${encodeURIComponent(securityId)}/timeline`;
      if (dateFilter && dateFilter.trim().length > 0) {
        url += `?asOfDate=${encodeURIComponent(dateFilter.trim())}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch events: ${res.statusText}`);
      }
      const data: InvestmentEventTimeline = await res.json();
      setTimeline(data);

      if (data.events && data.events.length > 0) {
        // Default select the first (most recent) event
        const defaultId = data.events[0].eventId;
        setSelectedEventId(defaultId);
        fetchImpact(defaultId, dateFilter);
      } else {
        setSelectedEventId(null);
        setImpact(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchImpact = async (eventId: string, dateFilter?: string) => {
    setImpactLoading(true);
    setImpactError(null);
    try {
      let url = `/api/events/${encodeURIComponent(eventId)}/impact`;
      if (dateFilter && dateFilter.trim().length > 0) {
        url += `?asOfDate=${encodeURIComponent(dateFilter.trim())}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch event impact: ${res.statusText}`);
      }
      const data: InvestmentEventImpact = await res.json();
      setImpact(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImpactError(msg);
    } finally {
      setImpactLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline(asOfDate);
  }, [securityId]);

  const handleApplyDateFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTimeline(asOfDate);
  };

  const handleClearDateFilter = () => {
    setAsOfDate('');
    fetchTimeline('');
  };

  const handleSelectEvent = (evId: string) => {
    setSelectedEventId(evId);
    fetchImpact(evId, asOfDate);
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSummary.trim()) return;

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const eventDateIso = newEventDate.includes('T') ? newEventDate : `${newEventDate}T00:00:00.000Z`;
      const eventPayload: Partial<InvestmentEvent> = {
        eventId: `evt-${ticker.toLowerCase()}-${Date.now()}`,
        securityId,
        ticker,
        market: market as any,
        exchange: market === 'INDIA' ? 'NSE' : 'NASDAQ',
        eventType: newEventType,
        eventDate: newEventDate,
        announcedAt: eventDateIso,
        availableAt: nowIso,
        sourceType: newSourceType as any,
        sourceReference: newSourceRef || 'Analyst Filing Entry',
        evidenceIds: [`ev-custom-${Date.now()}`],
        epistemicStatus: 'REAL',
        isSimulated: false,
        title: newTitle,
        summary: newSummary,
        affectedThesisAreas: newAffectedAreas,
        structuredData: {
          [newMetricKey]: Number(newMetricCurr) || newMetricCurr
        },
        previousState: {
          [newMetricKey]: Number(newMetricPrev) || newMetricPrev
        },
        currentState: {
          [newMetricKey]: Number(newMetricCurr) || newMetricCurr
        },
        significance: {
          affectsThesis: newAffectedAreas.length > 0 ? 'YES' : 'NO',
          affectsDecision: 'YES',
          affectsPortfolio: 'YES',
          affectsEvidenceCoverage: 'YES',
          affectsInvalidationState: newAffectedAreas.includes('INVALIDATION_CONDITION') ? 'YES' : 'NO'
        }
      };

      const res = await fetch('/api/events/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload)
      });

      if (!res.ok) {
        throw new Error(`Failed to record event: ${res.statusText}`);
      }

      setShowRecordModal(false);
      setNewTitle('');
      setNewSummary('');
      setNewSourceRef('');
      await fetchTimeline(asOfDate);
    } catch (err: unknown) {
      alert(`Error recording event: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter events
  const filteredEvents = (timeline?.events || []).filter(ev => {
    if (selectedType !== 'ALL' && ev.eventType !== selectedType) return false;
    if (onlyHighSignificance) {
      const isHigh =
        ev.significance?.affectsThesis === 'YES' ||
        ev.significance?.affectsInvalidationState === 'YES' ||
        ev.eventType === 'THESIS_INVALIDATION';
      if (!isHigh) return false;
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchTitle = ev.title.toLowerCase().includes(q);
      const matchSummary = ev.summary.toLowerCase().includes(q);
      const matchRef = ev.sourceReference.toLowerCase().includes(q);
      if (!matchTitle && !matchSummary && !matchRef) return false;
    }
    return true;
  });

  const getEventTypeBadge = (type: InvestmentEventType) => {
    switch (type) {
      case 'SEC_FILING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-800/60">SEC FILING</span>;
      case 'THESIS_INVALIDATION':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/80 text-red-300 border border-red-800/60">INVALIDATION</span>;
      case 'EARNINGS_EVENT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">EARNINGS</span>;
      case 'RESEARCH_SNAPSHOT_CHANGE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">RESEARCH DELTA</span>;
      case 'CORPORATE_ACTION':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">CORP ACTION</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#132235] text-[#93a4b8] border border-[#1e324b]">{type}</span>;
    }
  };

  return (
    <div className="space-y-5 text-[#d4e4fa]">
      {/* Top Banner & Action Controls */}
      <div className="bg-[#0b1726] border border-[#1c2e45] rounded-lg p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Investment Event Intelligence & Thesis Impact
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
                Phase 24 Invariant
              </span>
            </div>
            <p className="text-xs text-[#8ca0b8] max-w-3xl leading-relaxed">
              Trace disclosures, earnings beats, and research deltas directly through evidence to thesis pillars,
              committee assessment revisions, and portfolio risk budgets. Point-in-time timestamps enforce zero lookahead bias.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowRecordModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Record Filing / Event
            </button>
            <button
              onClick={() => fetchTimeline(asOfDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#132235] hover:bg-[#1a2e46] text-[#9bb0c9] hover:text-white text-xs font-medium border border-[#1e3450] transition-colors"
              title="Refresh Event Stream"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Point-in-Time Scrubber & Filter Bar */}
        <div className="mt-4 pt-4 border-t border-[#16273c] flex flex-wrap items-center justify-between gap-3 text-xs">
          <form onSubmit={handleApplyDateFilter} className="flex items-center gap-2 flex-wrap">
            <span className="text-[#72859c] font-medium flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              Point-in-Time As-Of Date:
            </span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-2.5 py-1 rounded bg-[#07101b] border border-[#1f354f] text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-[#172b43] hover:bg-[#203a5a] text-cyan-300 font-medium text-xs transition-colors"
            >
              Enforce PIT Cutoff
            </button>
            {asOfDate && (
              <button
                type="button"
                onClick={handleClearDateFilter}
                className="text-[#8ca0b8] hover:text-white text-xs underline decoration-dotted"
              >
                Reset to Current
              </button>
            )}
          </form>

          {/* PIT Status Badge */}
          <div className="flex items-center gap-2 text-[11px] font-mono">
            {asOfDate ? (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-700/50">
                <Clock className="w-3 h-3 text-amber-400" />
                Historical PIT: {asOfDate} (Zero Lookahead)
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-700/50">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Latest Available Data (Live)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[#08121e] border border-[#162539] p-3 rounded-lg">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#647890] font-medium mr-1">Event Type:</span>
          {['ALL', 'SEC_FILING', 'EARNINGS_EVENT', 'THESIS_INVALIDATION', 'RESEARCH_SNAPSHOT_CHANGE', 'CORPORATE_ACTION'].map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                selectedType === t
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'bg-[#0f1d2e] text-[#869ab1] hover:text-white hover:bg-[#162b44]'
              }`}
            >
              {t === 'ALL' ? 'All Types' : t.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-[#9ab0c8] select-none">
            <input
              type="checkbox"
              checked={onlyHighSignificance}
              onChange={(e) => setOnlyHighSignificance(e.target.checked)}
              className="rounded border-[#1c3049] bg-[#0b1624] text-cyan-500 focus:ring-0 w-3.5 h-3.5"
            />
            <span className="text-[11px]">High Thesis Significance Only</span>
          </label>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#566b82]" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-2.5 py-1 rounded bg-[#0c1929] border border-[#1e344e] text-xs text-white placeholder-[#566b82] w-40 focus:w-56 transition-all focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Left Event Stream (40%) | Right Causal Dossier (60%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Event Stream Timeline */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs px-1 text-[#8397ae]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">
              Chronological Events ({filteredEvents.length})
            </span>
            <span className="font-mono text-[10px]">Ordered by availableAt DESC</span>
          </div>

          {loading && (
            <div className="p-8 text-center bg-[#0a1523] border border-[#182a3f] rounded-lg">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-cyan-400 mb-2" />
              <p className="text-xs text-[#7f94ab]">Retrieving point-in-time events...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 inline mr-1 text-red-400" />
              {error}
            </div>
          )}

          {!loading && !error && filteredEvents.length === 0 && (
            <div className="p-8 text-center bg-[#0a1523] border border-[#182a3f] rounded-lg">
              <FileText className="w-8 h-8 mx-auto text-[#42556b] mb-2 opacity-60" />
              <p className="text-xs text-[#7f94ab]">No events matched the selected filters.</p>
            </div>
          )}

          <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
            {filteredEvents.map((ev) => {
              const isSelected = ev.eventId === selectedEventId;
              const hasThesisImpact = ev.significance?.affectsThesis === 'YES';
              const isInvalidation = ev.eventType === 'THESIS_INVALIDATION' || ev.significance?.affectsInvalidationState === 'YES';

              return (
                <div
                  key={ev.eventId}
                  onClick={() => handleSelectEvent(ev.eventId)}
                  className={`p-3.5 rounded-lg border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-[#10243a] border-cyan-500 shadow-md ring-1 ring-cyan-500/50'
                      : 'bg-[#0b1726] border-[#16273c] hover:border-[#223d5e] hover:bg-[#0e1f33]'
                  }`}
                >
                  {isInvalidation && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  )}

                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    {getEventTypeBadge(ev.eventType)}
                    <span className="text-[10px] font-mono text-[#788ca2] flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {ev.eventDate}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-white mb-1 line-clamp-2 leading-snug">
                    {ev.title}
                  </h3>
                  <p className="text-[11px] text-[#869ab1] line-clamp-2 mb-2 leading-relaxed">
                    {ev.summary}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#142335] text-[10px]">
                    <span className="font-mono text-[#637992] truncate max-w-[170px]" title={ev.sourceReference}>
                      {ev.sourceType}: {ev.sourceReference}
                    </span>

                    <div className="flex items-center gap-1.5 flex-shrink-0 font-medium">
                      {hasThesisImpact && (
                        <span className="text-cyan-300 bg-cyan-950/70 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                          Thesis
                        </span>
                      )}
                      {ev.significance?.affectsPortfolio === 'YES' && (
                        <span className="text-emerald-300 bg-emerald-950/70 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                          Portfolio
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Event Causal Impact Dossier */}
        <div className="lg:col-span-7">
          {impactLoading && (
            <div className="p-12 text-center bg-[#0b1726] border border-[#1c2e45] rounded-lg">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-3" />
              <p className="text-xs text-[#8ca0b8]">Computing multi-order causal impact...</p>
            </div>
          )}

          {impactError && (
            <div className="p-5 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 inline mr-1 text-red-400" />
              {impactError}
            </div>
          )}

          {!impactLoading && !impact && !impactError && (
            <div className="p-12 text-center bg-[#0b1726] border border-[#1c2e45] rounded-lg text-xs text-[#70859d]">
              Select an event on the left to inspect its detailed thesis and decision impact.
            </div>
          )}

          {!impactLoading && impact && (
            <div className="space-y-4">
              {/* Event Header Dossier Card */}
              <div className="bg-[#0b1726] border border-[#1c2e45] rounded-lg p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {getEventTypeBadge(impact.event.eventType)}
                      <span className="text-xs font-mono text-cyan-400 font-bold">
                        {impact.event.ticker || ticker} ({impact.event.market})
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      {impact.event.title}
                    </h3>
                  </div>

                  <div className="text-right text-[11px] font-mono text-[#788ca2]">
                    <div>Announced: {impact.event.announcedAt?.slice(0, 16).replace('T', ' ')} UTC</div>
                    <div className="text-cyan-300">Available: {impact.event.availableAt?.slice(0, 16).replace('T', ' ')} UTC</div>
                  </div>
                </div>

                <p className="text-xs text-[#9bb0c9] leading-relaxed bg-[#07101b] p-3 rounded border border-[#142335] mb-3">
                  {impact.event.summary}
                </p>

                {/* Structured Data Metric Shift */}
                {(impact.event.previousState || impact.event.currentState) && (
                  <div className="bg-[#081321] border border-[#16273c] rounded p-2.5 text-xs mb-3">
                    <span className="text-[10px] uppercase font-bold text-[#627790] block mb-1">
                      Reported Parameter Shift (Structured Evidence)
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2 rounded bg-[#0e1d2f] border border-[#1c324b]">
                        <span className="text-[10px] text-[#71859c] block">PREVIOUS STATE:</span>
                        <span className="text-white font-semibold">
                          {JSON.stringify(impact.event.previousState || {})}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-[#10253d] border border-cyan-800/60">
                        <span className="text-[10px] text-cyan-400 block">CURRENT STATE:</span>
                        <span className="text-cyan-200 font-bold">
                          {JSON.stringify(impact.event.currentState || impact.event.structuredData || {})}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Source Provenance */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#788ca2] pt-2 border-t border-[#142438]">
                  <span>Source: {impact.event.sourceType}</span>
                  <span className="text-white truncate max-w-sm" title={impact.event.sourceReference}>
                    Ref: {impact.event.sourceReference}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 text-[10px]">
                    STATUS: {impact.epistemicStatus}
                  </span>
                </div>
              </div>

              {/* 1. Thesis Impact Section */}
              <div className="bg-[#0b1726] border border-[#1c2e45] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      1. Investment Thesis Impact
                    </h4>
                  </div>
                  {impact.whatChanged.thesis.invalidationTriggered ? (
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-700 animate-pulse">
                      INVALIDATION THRESHOLD TRIGGERED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/70 text-emerald-300 border border-emerald-800/40">
                      Thesis Structurally Intact
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#9bb0c9] mb-3 leading-relaxed">
                  {impact.whatChanged.thesis.narrative}
                </p>

                {impact.whatChanged.thesis.details && impact.whatChanged.thesis.details.length > 0 && (
                  <div className="space-y-2">
                    {impact.whatChanged.thesis.details.map((d, i) => (
                      <div key={i} className="p-2.5 rounded bg-[#07101b] border border-[#16273c] text-xs">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-bold text-cyan-300 font-mono">
                            {d.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#132235] text-[#869ab1] font-mono">
                            {d.area}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8fa3ba]">{d.impactDescription}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Decision Assessment Impact Section */}
              <div className="bg-[#0b1726] border border-[#1c2e45] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      2. Committee Decision Assessment Shift
                    </h4>
                  </div>
                  {impact.whatChanged.decision.hasSubsequentDecision && (
                    <div className="flex items-center gap-2 text-xs font-bold font-mono">
                      <span>Score Delta:</span>
                      <span className={`px-2 py-0.5 rounded ${
                        (impact.whatChanged.decision.scoreDelta || 0) > 0
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : (impact.whatChanged.decision.scoreDelta || 0) < 0
                          ? 'bg-red-950 text-red-300 border border-red-800'
                          : 'bg-[#152436] text-[#8fa3ba]'
                      }`}>
                        {(impact.whatChanged.decision.scoreDelta || 0) > 0 ? `+${impact.whatChanged.decision.scoreDelta}` : impact.whatChanged.decision.scoreDelta} pts
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#9bb0c9] mb-3 leading-relaxed">
                  {impact.whatChanged.decision.narrative}
                </p>

                {impact.whatChanged.decision.hasSubsequentDecision && (
                  <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                    <div className="p-2.5 rounded bg-[#07101b] border border-[#16273c]">
                      <span className="text-[10px] text-[#71859c] block font-mono">PRE-EVENT ASSESSMENT:</span>
                      <div className="text-white font-bold text-sm mt-0.5">
                        {impact.whatChanged.decision.decisionBefore?.compositeScore || 'N/A'}/100
                      </div>
                      <div className="text-[11px] text-[#869ab1]">
                        Conviction: <span className="text-white">{impact.whatChanged.decision.decisionBefore?.conviction || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-[#07101b] border border-cyan-800/50">
                      <span className="text-[10px] text-cyan-400 block font-mono">POST-EVENT ASSESSMENT:</span>
                      <div className="text-cyan-300 font-bold text-sm mt-0.5">
                        {impact.whatChanged.decision.decisionAfter?.compositeScore || 'N/A'}/100
                      </div>
                      <div className="text-[11px] text-[#869ab1]">
                        Conviction: <span className="text-white font-semibold">{impact.whatChanged.decision.decisionAfter?.conviction || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dimension Deltas Bar */}
                {impact.whatChanged.decision.dimensionDeltas && Object.keys(impact.whatChanged.decision.dimensionDeltas).length > 0 && (
                  <div className="pt-2 border-t border-[#142335]">
                    <span className="text-[10px] font-bold text-[#627790] uppercase block mb-1.5">
                      Dimension Attribution Deltas:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                      {Object.entries(impact.whatChanged.decision.dimensionDeltas).map(([k, rawVal]) => {
                        const v = Number(rawVal);
                        return (
                          <div key={k} className="p-1.5 rounded bg-[#08121e] border border-[#16273c] flex items-center justify-between">
                            <span className="text-[#8497ad] truncate pr-1">{k}</span>
                            <span className={`font-mono font-bold ${v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-[#8497ad]'}`}>
                              {v > 0 ? `+${v}` : v}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Research & Portfolio Dual Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Research Notebook Impact */}
                <div className="bg-[#0b1726] border border-[#1c2e45] rounded-lg p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="w-3.5 h-3.5 text-purple-400" />
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                      Research Delta
                    </h5>
                  </div>
                  <p className="text-[11px] text-[#8ea2b8] leading-relaxed mb-2">
                    {impact.whatChanged.research.narrative}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#788ca2]">
                    <span>Claims: +{impact.whatChanged.research.changedClaimsCount}</span>
                    <span>•</span>
                    <span>Coverage: {impact.whatChanged.research.coverageDelta >= 0 ? `+${impact.whatChanged.research.coverageDelta}` : impact.whatChanged.research.coverageDelta}%</span>
                  </div>
                </div>

                {/* Portfolio Exposure Impact */}
                <div className="bg-[#0b1726] border border-[#1c2e45] rounded-lg p-3.5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <PieChart className="w-3.5 h-3.5 text-emerald-400" />
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                      Portfolio Capital Exposure
                    </h5>
                  </div>
                  <p className="text-[11px] text-[#8ea2b8] leading-relaxed mb-2">
                    {impact.whatChanged.portfolio.narrative}
                  </p>
                  {impact.whatChanged.portfolio.hasExposure && (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-300">
                      <span>Weight: {impact.whatChanged.portfolio.weightPct}%</span>
                      <span>•</span>
                      <span>Shares: {impact.whatChanged.portfolio.shares?.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Institutional Explanation (Causal Chain) */}
              <div className="bg-[#0a1828] border border-cyan-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Institutional Causal Synthesis
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
                    {impact.explanation.source}
                  </span>
                </div>
                <p className="text-xs text-[#a2b7cf] leading-relaxed">
                  {impact.explanation.summary}
                </p>
              </div>

              {/* 5. Primary Evidence Vault Citations */}
              {impact.event.evidenceIds && impact.event.evidenceIds.length > 0 && (
                <div className="bg-[#07101b] border border-[#142335] rounded-lg p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-cyan-400" />
                    <span className="text-white font-medium">Primary Evidence Verified:</span>
                    <span className="text-[#72879e] font-mono text-[11px]">
                      {impact.event.evidenceIds.join(', ')}
                    </span>
                  </div>
                  {onOpenEvidence && (
                    <button
                      onClick={() => onOpenEvidence({ evidenceId: impact.event.evidenceIds[0], title: impact.event.title, sourceType: impact.event.sourceType })}
                      className="px-2.5 py-1 rounded bg-[#132235] hover:bg-[#1c334f] text-cyan-300 text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      Inspect Vault
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Record Investment Event Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0b1726] border border-[#1f334d] rounded-xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#182a3f] pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Record Filing or Investment Event</h3>
              </div>
              <button
                onClick={() => setShowRecordModal(false)}
                className="text-[#647890] hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8497ad] mb-1 font-medium">Event Type</label>
                  <select
                    value={newEventType}
                    onChange={(e) => setNewEventType(e.target.value as InvestmentEventType)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#07101b] border border-[#1e344e] text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="SEC_FILING">SEC Filing (10-K, 10-Q, 8-K)</option>
                    <option value="EARNINGS_EVENT">Earnings Release / Call</option>
                    <option value="RESEARCH_SNAPSHOT_CHANGE">Research Snapshot Delta</option>
                    <option value="THESIS_INVALIDATION">Thesis Invalidation Event</option>
                    <option value="CORPORATE_ACTION">Corporate Action / Disclosure</option>
                    <option value="PROVIDER_DATA_CHANGE">Provider Revision</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#8497ad] mb-1 font-medium">Event Date</label>
                  <input
                    type="date"
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 rounded bg-[#07101b] border border-[#1e344e] text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#8497ad] mb-1 font-medium">Headline / Event Title</label>
                <input
                  type="text"
                  placeholder="e.g. Form 8-K Discloses Strategic AI Hardware Supply Agreement"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 rounded bg-[#07101b] border border-[#1e344e] text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[#8497ad] mb-1 font-medium">Filing / Event Summary</label>
                <textarea
                  rows={3}
                  placeholder="Summarize key disclosures, revenue metrics, margin trends, or operational shifts..."
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 rounded bg-[#07101b] border border-[#1e344e] text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8497ad] mb-1 font-medium">Source Type</label>
                  <select
                    value={newSourceType}
                    onChange={(e) => setNewSourceType(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#07101b] border border-[#1e344e] text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="SEC_EDGAR">SEC EDGAR</option>
                    <option value="EXCHANGE_DISCLOSURE">BSE/NSE Disclosure</option>
                    <option value="FINANCIAL_DISCLOSURE">Earnings Release</option>
                    <option value="RESEARCH_SYNTHESIS">Research Synthesis</option>
                    <option value="REGULATORY_FILING">Regulatory Agency</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#8497ad] mb-1 font-medium">Accession / Document Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. 0000320193-25-000106"
                    value={newSourceRef}
                    onChange={(e) => setNewSourceRef(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#07101b] border border-[#1e344e] text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              {/* Affected Thesis Pillars */}
              <div>
                <label className="block text-[#8497ad] mb-1.5 font-medium">Affected Thesis Pillars</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'BULL_CASE' as const, label: 'Bull Case' },
                    { id: 'BEAR_CASE' as const, label: 'Bear Case' },
                    { id: 'CATALYST' as const, label: 'Catalyst' },
                    { id: 'RISK' as const, label: 'Risk' },
                    { id: 'INVALIDATION_CONDITION' as const, label: 'Invalidation Cond.' },
                    { id: 'EVIDENCE_GAP' as const, label: 'Evidence Gap' }
                  ].map((p) => {
                    const checked = newAffectedAreas.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          if (checked) {
                            setNewAffectedAreas(newAffectedAreas.filter(a => a !== p.id));
                          } else {
                            setNewAffectedAreas([...newAffectedAreas, p.id]);
                          }
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-medium border text-left transition-colors ${
                          checked
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                            : 'bg-[#07101b] border-[#16273c] text-[#71859c] hover:border-[#223955]'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Metric Delta (Structured Data) */}
              <div className="p-3 bg-[#07101b] border border-[#16273c] rounded space-y-2">
                <span className="text-[10px] uppercase font-bold text-[#627790] block">
                  Reported Metric Shift (Optional)
                </span>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  <input
                    type="text"
                    placeholder="Metric (e.g. eps)"
                    value={newMetricKey}
                    onChange={(e) => setNewMetricKey(e.target.value)}
                    className="px-2 py-1 rounded bg-[#0b1726] border border-[#1e344e] text-white text-[11px]"
                  />
                  <input
                    type="text"
                    placeholder="Previous (e.g. 1.50)"
                    value={newMetricPrev}
                    onChange={(e) => setNewMetricPrev(e.target.value)}
                    className="px-2 py-1 rounded bg-[#0b1726] border border-[#1e344e] text-white text-[11px]"
                  />
                  <input
                    type="text"
                    placeholder="Current (e.g. 1.64)"
                    value={newMetricCurr}
                    onChange={(e) => setNewMetricCurr(e.target.value)}
                    className="px-2 py-1 rounded bg-[#0b1726] border border-[#1e344e] text-white text-[11px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#182a3f]">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-3 py-1.5 rounded bg-[#132235] hover:bg-[#1a2d44] text-[#869ab1] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-50"
                >
                  {submitting ? 'Archiving Event...' : 'Record & Evaluate Impact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
