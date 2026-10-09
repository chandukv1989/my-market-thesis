/**
 * Phase 33: Institutional Research Memory & Knowledge Continuity Interface
 * 
 * Answers:
 * "What have we learned about this investment over time, what did we previously
 * believe, what evidence changed that belief, and what remains unresolved?"
 */

import React, { useState, useEffect } from 'react';
import {
  ActiveScreen,
  CurrentResearchState,
  ResearchMemoryEntry,
  ResearchQuestionEntry,
  KnowledgeEvolutionGraph,
  ResearchMemoryType,
  ResearchMemoryStatus,
  ResearchQuestionStatus,
  ResearchEvidenceItem
} from '../../types';
import { CANONICAL_SECURITIES } from '../../data/canonicalSecurities';
import {
  BookOpen,
  Calendar,
  Clock,
  Layers,
  HelpCircle,
  AlertTriangle,
  GitFork,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  Plus,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  FileText,
  Sparkles,
  Link,
  CheckCircle2,
  XCircle,
  HelpCircle as QuestionIcon,
  Archive,
  Compass
} from 'lucide-react';

interface ResearchMemoryViewProps {
  initialSecurityId?: string;
  onNavigate?: (screen: ActiveScreen) => void;
  onSelectStock?: (ticker: string) => void;
  onOpenEvidence?: (evidenceId: string) => void;
}

export const ResearchMemoryView: React.FC<ResearchMemoryViewProps> = ({
  initialSecurityId,
  onNavigate,
  onSelectStock,
  onOpenEvidence
}) => {
  const [selectedSecurityId, setSelectedSecurityId] = useState<string>(initialSecurityId || 'us-nvda');
  const [asOfDate, setAsOfDate] = useState<string>('2026-10-01');
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'evolution' | 'questions' | 'gaps'>('overview');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentState, setCurrentState] = useState<CurrentResearchState | null>(null);
  const [timeline, setTimeline] = useState<ResearchMemoryEntry[]>([]);
  const [evolutionGraph, setEvolutionGraph] = useState<KnowledgeEvolutionGraph | null>(null);
  const [questions, setQuestions] = useState<ResearchQuestionEntry[]>([]);

  // Filtering & Search
  const [timelineFilterType, setTimelineFilterType] = useState<string>('ALL');
  const [timelineFilterStatus, setTimelineFilterStatus] = useState<string>('ALL');
  const [timelineSearch, setTimelineSearch] = useState<string>('');

  // Modals
  const [selectedFinding, setSelectedFinding] = useState<ResearchMemoryEntry | null>(null);
  const [showCreateMemoryModal, setShowCreateMemoryModal] = useState<boolean>(false);
  const [showSupersedeModal, setShowSupersedeModal] = useState<boolean>(false);
  const [supersedeTarget, setSupersedeTarget] = useState<ResearchMemoryEntry | null>(null);
  const [showCreateQuestionModal, setShowCreateQuestionModal] = useState<boolean>(false);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ResearchMemoryType>('RESEARCH_FINDING');
  const [newSummary, setNewSummary] = useState('');
  const [newFinding, setNewFinding] = useState('');
  const [newEvidenceIds, setNewEvidenceIds] = useState('');

  const [supersedeReason, setSupersedeReason] = useState('');
  const [supersedeFinding, setSupersedeFinding] = useState('');
  const [supersedeTitle, setSupersedeTitle] = useState('');

  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionContext, setNewQuestionContext] = useState('');

  const selectedSecurity = CANONICAL_SECURITIES.find(
    s => s.id === selectedSecurityId || s.symbol.toUpperCase() === selectedSecurityId.toUpperCase()
  ) || CANONICAL_SECURITIES[0];

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const encodedDate = encodeURIComponent(asOfDate);
      const [stateRes, timelineRes, graphRes, qRes] = await Promise.all([
        fetch(`/api/research-memory/current/${selectedSecurity.id}?asOfDate=${encodedDate}`),
        fetch(`/api/research-memory/timeline/${selectedSecurity.id}?asOfDate=${encodedDate}`),
        fetch(`/api/research-memory/evolution/${selectedSecurity.id}?asOfDate=${encodedDate}`),
        fetch(`/api/research-memory/questions/${selectedSecurity.id}?asOfDate=${encodedDate}`)
      ]);

      if (!stateRes.ok) throw new Error(`Current state error: ${stateRes.statusText}`);
      if (!timelineRes.ok) throw new Error(`Timeline error: ${timelineRes.statusText}`);

      const stateData = await stateRes.json();
      const timelineData = await timelineRes.json();
      const graphData = graphRes.ok ? await graphRes.json() : null;
      const qData = qRes.ok ? await qRes.json() : [];

      setCurrentState(stateData);
      setTimeline(timelineData);
      setEvolutionGraph(graphData);
      setQuestions(qData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSecurity.id, asOfDate]);

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newFinding.trim()) return;

    try {
      const evidenceList = newEvidenceIds
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/research-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecurity.id,
          memoryType: newType,
          title: newTitle.trim(),
          summary: newSummary.trim() || newTitle.trim(),
          finding: newFinding.trim(),
          asOfDate,
          relatedEvidenceIds: evidenceList,
          epistemicStatus: 'ANALYST_ASSERTION'
        })
      });

      if (!res.ok) throw new Error(await res.text());

      setShowCreateMemoryModal(false);
      setNewTitle('');
      setNewSummary('');
      setNewFinding('');
      setNewEvidenceIds('');
      fetchData();
    } catch (err: any) {
      alert(`Error creating memory: ${err.message}`);
    }
  };

  const handleSupersede = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supersedeTarget || !supersedeFinding.trim() || !supersedeReason.trim()) return;

    try {
      const res = await fetch(`/api/research-memory/${supersedeTarget.id}/supersede`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: supersedeTitle.trim() || `Updated: ${supersedeTarget.title}`,
          summary: `Superseded finding: ${supersedeReason.trim()}`,
          finding: supersedeFinding.trim(),
          supersedingReason: supersedeReason.trim(),
          asOfDate
        })
      });

      if (!res.ok) throw new Error(await res.text());

      setShowSupersedeModal(false);
      setSupersedeTarget(null);
      setSupersedeTitle('');
      setSupersedeFinding('');
      setSupersedeReason('');
      fetchData();
    } catch (err: any) {
      alert(`Error superseding memory: ${err.message}`);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    try {
      const res = await fetch('/api/research-memory/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecurity.id,
          question: newQuestionText.trim(),
          context: newQuestionContext.trim(),
          asOfDate
        })
      });

      if (!res.ok) throw new Error(await res.text());

      setShowCreateQuestionModal(false);
      setNewQuestionText('');
      setNewQuestionContext('');
      fetchData();
    } catch (err: any) {
      alert(`Error recording question: ${err.message}`);
    }
  };

  const handleUpdateQuestion = async (questionId: string, status: ResearchQuestionStatus, resolution?: string) => {
    try {
      const res = await fetch(`/api/research-memory/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution })
      });
      if (!res.ok) throw new Error(await res.text());
      fetchData();
    } catch (err: any) {
      alert(`Failed to update question: ${err.message}`);
    }
  };

  // Filtered timeline
  const filteredTimeline = timeline.filter(item => {
    if (timelineFilterType !== 'ALL' && item.memoryType !== timelineFilterType) return false;
    if (timelineFilterStatus !== 'ALL' && item.status !== timelineFilterStatus) return false;
    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.finding.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 text-[#c9d1d9]">
      {/* HEADER BANNER */}
      <div className="bg-[#06121e] border border-[#1c2b3c] p-5 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 bg-[#0d1e30] border border-[#38bdf8]/30 rounded text-[#38bdf8]">
              <BookOpen className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-wide text-white flex items-center gap-2">
                <span>Institutional Research Memory & Continuity</span>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono">
                  PHASE 33
                </span>
              </h1>
              <p className="text-xs text-[#87929a] mt-0.5">
                "What did we previously believe, what evidence changed that belief, and what remains unresolved?"
              </p>
            </div>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#0d1e30] border border-[#1c2b3c] px-3 py-1.5 rounded">
            <span className="text-xs text-[#87929a]">Asset:</span>
            <select
              value={selectedSecurity.id}
              onChange={e => setSelectedSecurityId(e.target.value)}
              className="bg-transparent text-sm text-white font-mono focus:outline-none"
            >
              {CANONICAL_SECURITIES.map(sec => (
                <option key={sec.id} value={sec.id} className="bg-[#06121e] text-white">
                  {sec.symbol} — {sec.companyName} ({sec.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#0d1e30] border border-[#1c2b3c] px-3 py-1.5 rounded">
            <Calendar className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span className="text-xs text-[#87929a]">As Of (PIT):</span>
            <input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="bg-transparent text-sm text-white font-mono focus:outline-none"
            />
          </div>

          <button
            onClick={() => setShowCreateMemoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#38bdf8] text-[#06121e] hover:bg-[#38bdf8]/90 font-bold text-xs rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Memory</span>
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-[#0d1e30] border border-[#1c2b3c] hover:border-[#38bdf8]/40 rounded text-cyan-400 transition-colors"
            title="Refresh Research State"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* METRIC STRIP */}
      {currentState && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#06121e] border border-[#1c2b3c] p-3 rounded">
            <div className="text-[11px] text-[#87929a] uppercase font-mono">Active Findings</div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
              {currentState.activeMemories.length}
            </div>
            <div className="text-[10px] text-[#87929a] mt-0.5">Authoritative active facts</div>
          </div>

          <div className="bg-[#06121e] border border-[#1c2b3c] p-3 rounded">
            <div className="text-[11px] text-[#87929a] uppercase font-mono">Open Questions</div>
            <div className="text-xl font-bold text-amber-400 font-mono mt-1">
              {currentState.openQuestions.length}
            </div>
            <div className="text-[10px] text-[#87929a] mt-0.5">Unresolved investigations</div>
          </div>

          <div className="bg-[#06121e] border border-[#1c2b3c] p-3 rounded">
            <div className="text-[11px] text-[#87929a] uppercase font-mono">Requires Reassessment</div>
            <div className="text-xl font-bold text-rose-400 font-mono mt-1">
              {currentState.staleOrReassessmentMemories.length}
            </div>
            <div className="text-[10px] text-[#87929a] mt-0.5">Contradicted by evidence</div>
          </div>

          <div className="bg-[#06121e] border border-[#1c2b3c] p-3 rounded">
            <div className="text-[11px] text-[#87929a] uppercase font-mono">Evidence Conflicts</div>
            <div className="text-xl font-bold text-purple-400 font-mono mt-1">
              {currentState.evidenceConflicts.length}
            </div>
            <div className="text-[10px] text-[#87929a] mt-0.5">Preserved without smoothing</div>
          </div>

          <div className="bg-[#06121e] border border-[#1c2b3c] p-3 rounded">
            <div className="text-[11px] text-[#87929a] uppercase font-mono">Decision Rating</div>
            <div className="text-base font-bold text-cyan-300 font-mono mt-1">
              {currentState.latestDecision?.overallAssessment || 'NEUTRAL'}
            </div>
            <div className="text-[10px] text-[#87929a] mt-0.5">
              Score: {currentState.latestDecision?.compositeScore.toFixed(2) || '0.00'}
            </div>
          </div>

          <div className="bg-[#06121e] border border-[#1c2b3c] p-3 rounded">
            <div className="text-[11px] text-[#87929a] uppercase font-mono">Native Currency</div>
            <div className="text-base font-bold text-white font-mono mt-1">
              {currentState.currency}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">Isolated (zero FX blend)</div>
          </div>
        </div>
      )}

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800 text-rose-200 p-3 rounded text-xs flex items-center gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Error loading research memory: {error}</span>
        </div>
      )}

      {/* TABS */}
      <div className="flex border-b border-[#1c2b3c] gap-2 overflow-x-auto text-xs font-mono">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 border-b-2 font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-[#38bdf8] text-[#38bdf8] bg-[#0d1e30]'
              : 'border-transparent text-[#87929a] hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Knowledge Continuity</span>
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-2.5 border-b-2 font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'timeline'
              ? 'border-[#38bdf8] text-[#38bdf8] bg-[#0d1e30]'
              : 'border-transparent text-[#87929a] hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Historical Timeline ({timeline.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('evolution')}
          className={`px-4 py-2.5 border-b-2 font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'evolution'
              ? 'border-[#38bdf8] text-[#38bdf8] bg-[#0d1e30]'
              : 'border-transparent text-[#87929a] hover:text-white'
          }`}
        >
          <GitFork className="w-3.5 h-3.5 text-cyan-400" />
          <span>Knowledge Evolution DAG</span>
        </button>

        <button
          onClick={() => setActiveTab('questions')}
          className={`px-4 py-2.5 border-b-2 font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'questions'
              ? 'border-[#38bdf8] text-[#38bdf8] bg-[#0d1e30]'
              : 'border-transparent text-[#87929a] hover:text-white'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
          <span>Open Questions ({questions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('gaps')}
          className={`px-4 py-2.5 border-b-2 font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'gaps'
              ? 'border-[#38bdf8] text-[#38bdf8] bg-[#0d1e30]'
              : 'border-transparent text-[#87929a] hover:text-white'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-indigo-400" />
          <span>Research Gaps & Prioritization</span>
        </button>
      </div>

      {/* TAB CONTENT */}

      {/* 1. OVERVIEW & CURRENT RESEARCH STATE */}
      {activeTab === 'overview' && currentState && (
        <div className="space-y-6">
          {/* NARRATIVE SYNTHESIS */}
          {currentState.narrativeSynthesis && (
            <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-bold text-white font-mono">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>Executive Knowledge Continuity Synthesis</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0d1e30] border border-[#1c2b3c] text-[#87929a]">
                  {currentState.narrativeSynthesis.isAIGenerated ? 'GEMINI_SYNTHESIS' : 'DETERMINISTIC_TEMPLATE'}
                </span>
              </div>
              <p className="text-sm text-[#e6edf3] leading-relaxed">
                {currentState.narrativeSynthesis.summary}
              </p>
              <div className="p-3 bg-[#0d1e30] border border-[#1c2b3c] rounded text-xs text-[#87929a] space-y-1.5">
                <div className="text-cyan-300 font-mono font-semibold">Institutional Belief Delta:</div>
                <div>{currentState.narrativeSynthesis.knowledgeContinuityNote}</div>
              </div>
              {currentState.narrativeSynthesis.unresolvedQuestionsSummary && (
                <div className="text-xs text-amber-300 font-mono flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{currentState.narrativeSynthesis.unresolvedQuestionsSummary}</span>
                </div>
              )}
            </div>
          )}

          {/* LATEST ACTIVE FINDINGS & REASSESSMENT WARNINGS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ACTIVE FINDINGS */}
            <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Authoritative Active Findings</span>
                </h3>
                <span className="text-[10px] text-[#87929a] font-mono">
                  {currentState.activeMemories.length} records
                </span>
              </div>

              {currentState.activeMemories.length === 0 ? (
                <div className="text-xs text-[#87929a] py-6 text-center">
                  No active research memories recorded for this period.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {currentState.activeMemories.slice(0, 5).map(mem => (
                    <div
                      key={mem.id}
                      className="p-3 bg-[#0d1e30] border border-[#1c2b3c] hover:border-cyan-500/40 rounded transition-colors text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-white">{mem.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                          {mem.memoryType}
                        </span>
                      </div>
                      <p className="text-[#87929a] leading-relaxed">{mem.finding}</p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#87929a] pt-1 border-t border-[#1c2b3c]/60">
                        <span>As of: {mem.asOfDate}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedFinding(mem)}
                            className="text-cyan-400 hover:underline flex items-center gap-1"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              setSupersedeTarget(mem);
                              setShowSupersedeModal(true);
                            }}
                            className="text-amber-400 hover:underline flex items-center gap-1"
                          >
                            <span>Supersede</span>
                            <GitFork className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* STALE / REASSESSMENT REQUIRED FINDINGS */}
            <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-rose-300 uppercase font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Findings Requiring Reassessment</span>
                </h3>
                <span className="text-[10px] text-rose-400 font-mono">
                  {currentState.staleOrReassessmentMemories.length} flagged
                </span>
              </div>

              {currentState.staleOrReassessmentMemories.length === 0 ? (
                <div className="text-xs text-[#87929a] py-6 text-center">
                  No active findings are currently contradicted by subsequent PIT evidence.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {currentState.staleOrReassessmentMemories.map(mem => (
                    <div
                      key={mem.id}
                      className="p-3 bg-rose-950/20 border border-rose-900/50 rounded text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-rose-200">{mem.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-900/60 border border-rose-700 text-rose-300">
                          {mem.status}
                        </span>
                      </div>
                      <p className="text-[#c9d1d9] leading-relaxed">{mem.finding}</p>
                      {mem.reassessmentReason && (
                        <div className="p-2 bg-black/40 border border-rose-900/40 rounded text-[11px] text-rose-300">
                          <span className="font-bold font-mono">Reassessment Reason: </span>
                          {mem.reassessmentReason}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#87929a]">
                        <span>As of: {mem.asOfDate}</span>
                        <button
                          onClick={() => {
                            setSupersedeTarget(mem);
                            setShowSupersedeModal(true);
                          }}
                          className="text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <span>Supersede with New Evidence</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* EVIDENCE CONFLICTS */}
          {currentState.evidenceConflicts.length > 0 && (
            <div className="bg-[#06121e] border border-purple-900/40 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-purple-300 uppercase font-mono flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-purple-400" />
                  <span>Preserved Evidence Conflicts</span>
                </h3>
                <span className="text-[10px] text-purple-400 font-mono">
                  {currentState.evidenceConflicts.length} conflict records
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentState.evidenceConflicts.map(c => (
                  <div key={c.memoryId} className="p-3 bg-[#0d1e30] border border-purple-900/30 rounded text-xs space-y-2">
                    <div className="font-bold text-white">{c.title}</div>
                    <p className="text-[#87929a]">{c.description}</p>
                    <div className="flex gap-2 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300">
                        Primary: {c.primaryEvidenceId}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300">
                        Conflict: {c.conflictingEvidenceId}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. TIMELINE TAB */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          {/* SEARCH & FILTERS */}
          <div className="bg-[#06121e] border border-[#1c2b3c] p-3 rounded-lg flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#87929a]" />
              <input
                type="text"
                placeholder="Search findings, summaries, drivers..."
                value={timelineSearch}
                onChange={e => setTimelineSearch(e.target.value)}
                className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#87929a] focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#87929a] font-mono">Type:</span>
              <select
                value={timelineFilterType}
                onChange={e => setTimelineFilterType(e.target.value)}
                className="bg-[#0d1e30] border border-[#1c2b3c] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
              >
                <option value="ALL">ALL TYPES</option>
                <option value="RESEARCH_FINDING">RESEARCH_FINDING</option>
                <option value="THESIS_UPDATE">THESIS_UPDATE</option>
                <option value="DECISION_UPDATE">DECISION_UPDATE</option>
                <option value="EVIDENCE_CONCLUSION">EVIDENCE_CONCLUSION</option>
                <option value="REVIEW_OUTCOME">REVIEW_OUTCOME</option>
                <option value="UNRESOLVED_QUESTION">UNRESOLVED_QUESTION</option>
                <option value="COUNTERFACTUAL_FINDING">COUNTERFACTUAL_FINDING</option>
                <option value="SCENARIO_FINDING">SCENARIO_FINDING</option>
                <option value="EVIDENCE_CONFLICT">EVIDENCE_CONFLICT</option>
                <option value="RESEARCH_GAP">RESEARCH_GAP</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#87929a] font-mono">Status:</span>
              <select
                value={timelineFilterStatus}
                onChange={e => setTimelineFilterStatus(e.target.value)}
                className="bg-[#0d1e30] border border-[#1c2b3c] rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUPERSEDED">SUPERSEDED</option>
                <option value="REQUIRES_REASSESSMENT">REQUIRES_REASSESSMENT</option>
                <option value="CONTRADICTED">CONTRADICTED</option>
                <option value="UNRESOLVED">UNRESOLVED</option>
              </select>
            </div>
          </div>

          {/* TIMELINE LIST */}
          <div className="space-y-3">
            {filteredTimeline.length === 0 ? (
              <div className="bg-[#06121e] border border-[#1c2b3c] p-8 text-center text-xs text-[#87929a] rounded-lg">
                No research memory records match the selected filters.
              </div>
            ) : (
              filteredTimeline.map(item => (
                <div
                  key={item.id}
                  className="bg-[#06121e] border border-[#1c2b3c] hover:border-cyan-500/40 p-4 rounded-lg space-y-2.5 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{item.title}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800 text-blue-300">
                        {item.memoryType}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          item.status === 'ACTIVE'
                            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                            : item.status === 'SUPERSEDED'
                            ? 'bg-zinc-900 border-zinc-700 text-zinc-400'
                            : 'bg-rose-950/60 border-rose-800 text-rose-300'
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                        {item.epistemicStatus}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-[#87929a]">
                      Date: {item.asOfDate}
                    </div>
                  </div>

                  <p className="text-xs text-[#c9d1d9] leading-relaxed">{item.finding}</p>

                  {item.reassessmentReason && (
                    <div className="p-2.5 bg-rose-950/20 border border-rose-900/40 rounded text-xs text-rose-300 font-mono">
                      Reason: {item.reassessmentReason}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-[#87929a] pt-2 border-t border-[#1c2b3c]">
                    <div className="flex items-center gap-3">
                      <span>ID: <code className="text-zinc-400">{item.id}</code></span>
                      {item.supersedesMemoryId && (
                        <span className="text-amber-400">
                          Supersedes: {item.supersedesMemoryId}
                        </span>
                      )}
                      {item.supersededByMemoryId && (
                        <span className="text-zinc-400">
                          Superseded By: {item.supersededByMemoryId}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {item.relatedEvidenceIds.length > 0 && (
                        <span>Evidence: {item.relatedEvidenceIds.join(', ')}</span>
                      )}
                      <button
                        onClick={() => setSelectedFinding(item)}
                        className="text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 3. KNOWLEDGE EVOLUTION GRAPH TAB */}
      {activeTab === 'evolution' && (
        <div className="space-y-4">
          <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg">
            <h3 className="text-xs font-bold text-white uppercase font-mono mb-2 flex items-center gap-2">
              <GitFork className="w-4 h-4 text-cyan-400" />
              <span>Deterministic Knowledge Evolution Directed Acyclic Graph (DAG)</span>
            </h3>
            <p className="text-xs text-[#87929a]">
              Traces historical belief progression from primary evidence to findings, supersession changes, and unresolved questions. Zero AI-fabricated edges.
            </p>
          </div>

          {evolutionGraph && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* NODES */}
              <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg space-y-3">
                <h4 className="text-xs font-bold text-white uppercase font-mono">
                  Knowledge Nodes ({evolutionGraph.nodes.length})
                </h4>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {evolutionGraph.nodes.map(n => (
                    <div
                      key={n.id}
                      className="p-2.5 bg-[#0d1e30] border border-[#1c2b3c] rounded text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white">{n.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                          {n.type}
                        </span>
                      </div>
                      {n.details && <p className="text-[11px] text-[#87929a]">{n.details}</p>}
                      <div className="text-[10px] font-mono text-[#87929a]">
                        ID: {n.id} | Date: {n.date}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* EDGES */}
              <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg space-y-3">
                <h4 className="text-xs font-bold text-white uppercase font-mono">
                  Evolution Transitions & Links ({evolutionGraph.edges.length})
                </h4>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {evolutionGraph.edges.length === 0 ? (
                    <div className="text-xs text-[#87929a] py-6 text-center">
                      No multi-stage supersession transitions yet. Record or supersede findings to extend the DAG.
                    </div>
                  ) : (
                    evolutionGraph.edges.map((e, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-[#0d1e30] border border-[#1c2b3c] rounded text-xs space-y-1"
                      >
                        <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold">
                          <span>{e.from}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#87929a]" />
                          <span>{e.to}</span>
                        </div>
                        <div className="text-[11px] text-[#87929a]">{e.label}</div>
                        {e.transitionType && (
                          <div className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 w-max">
                            {e.transitionType}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. OPEN QUESTIONS TAB */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg flex justify-between items-center">
            <div>
              <h3 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span>Open Research Questions & Lifecycle</span>
              </h3>
              <p className="text-xs text-[#87929a] mt-0.5">
                Durable institutional questions: OPEN → INVESTIGATING → ANSWERED → SUPERSEDED.
              </p>
            </div>
            <button
              onClick={() => setShowCreateQuestionModal(true)}
              className="px-3 py-1.5 bg-amber-500 text-black hover:bg-amber-400 font-bold text-xs rounded flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Question</span>
            </button>
          </div>

          <div className="space-y-3">
            {questions.length === 0 ? (
              <div className="bg-[#06121e] border border-[#1c2b3c] p-8 text-center text-xs text-[#87929a] rounded-lg">
                No research questions currently logged for this asset.
              </div>
            ) : (
              questions.map(q => (
                <div
                  key={q.id}
                  className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-white text-sm">{q.question}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        q.status === 'OPEN'
                          ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                          : q.status === 'INVESTIGATING'
                          ? 'bg-blue-950/60 border-blue-800 text-blue-300'
                          : q.status === 'ANSWERED'
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      {q.status}
                    </span>
                  </div>

                  <p className="text-xs text-[#87929a]">{q.context}</p>

                  {q.resolution && (
                    <div className="p-2.5 bg-emerald-950/20 border border-emerald-900/50 rounded text-xs text-emerald-300">
                      <span className="font-bold font-mono">Resolution: </span>
                      {q.resolution}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] font-mono text-[#87929a] pt-2 border-t border-[#1c2b3c]">
                    <span>Created: {q.asOfDate}</span>
                    <div className="flex items-center gap-2">
                      {q.status === 'OPEN' && (
                        <button
                          onClick={() => handleUpdateQuestion(q.id, 'INVESTIGATING')}
                          className="px-2 py-0.5 bg-blue-950 border border-blue-800 text-blue-300 hover:bg-blue-900 rounded"
                        >
                          Mark Investigating
                        </button>
                      )}
                      {(q.status === 'OPEN' || q.status === 'INVESTIGATING') && (
                        <button
                          onClick={() => {
                            const res = prompt('Enter resolution summary for question:');
                            if (res) handleUpdateQuestion(q.id, 'ANSWERED', res);
                          }}
                          className="px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 hover:bg-emerald-900 rounded"
                        >
                          Resolve / Answer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 5. RESEARCH GAPS TAB */}
      {activeTab === 'gaps' && currentState && (
        <div className="space-y-4">
          <div className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg">
            <h3 className="text-xs font-bold text-white uppercase font-mono mb-2 flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              <span>Research Gaps & Attention Queue (Phase 28 / Phase 33 Integration)</span>
            </h3>
            <p className="text-xs text-[#87929a]">
              Missing primary evidence and unverified assertions that elevate research attention priority.
            </p>
          </div>

          <div className="space-y-3">
            {currentState.researchGaps.length === 0 ? (
              <div className="bg-[#06121e] border border-[#1c2b3c] p-8 text-center text-xs text-[#87929a] rounded-lg">
                No active research gaps identified for this asset.
              </div>
            ) : (
              currentState.researchGaps.map(gap => (
                <div
                  key={gap.gapId}
                  className="bg-[#06121e] border border-[#1c2b3c] p-4 rounded-lg space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white text-xs">{gap.category}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        gap.urgency === 'HIGH'
                          ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                          : 'bg-amber-950/60 border-amber-800 text-amber-300'
                      }`}
                    >
                      {gap.urgency} ATTENTION
                    </span>
                  </div>
                  <p className="text-xs text-[#87929a]">{gap.description}</p>
                  {gap.affectedDimension && (
                    <div className="text-[10px] font-mono text-cyan-300">
                      Affected Dimension: {gap.affectedDimension}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: CREATE RESEARCH MEMORY */}
      {showCreateMemoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#06121e] border border-[#1c2b3c] rounded-lg p-5 max-w-lg w-full space-y-4">
            <div className="flex justify-between items-center border-b border-[#1c2b3c] pb-3">
              <h3 className="font-bold text-white text-sm font-mono flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <span>Record Institutional Research Memory</span>
              </h3>
              <button
                onClick={() => setShowCreateMemoryModal(false)}
                className="text-[#87929a] hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMemory} className="space-y-3 text-xs">
              <div>
                <label className="text-[#87929a] font-mono block mb-1">Memory Type</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as ResearchMemoryType)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white font-mono"
                >
                  <option value="RESEARCH_FINDING">RESEARCH_FINDING</option>
                  <option value="OBSERVATION">OBSERVATION</option>
                  <option value="THESIS_UPDATE">THESIS_UPDATE</option>
                  <option value="DECISION_UPDATE">DECISION_UPDATE</option>
                  <option value="EVIDENCE_CONCLUSION">EVIDENCE_CONCLUSION</option>
                  <option value="REVIEW_OUTCOME">REVIEW_OUTCOME</option>
                  <option value="UNRESOLVED_QUESTION">UNRESOLVED_QUESTION</option>
                  <option value="COUNTERFACTUAL_FINDING">COUNTERFACTUAL_FINDING</option>
                  <option value="SCENARIO_FINDING">SCENARIO_FINDING</option>
                  <option value="EVIDENCE_CONFLICT">EVIDENCE_CONFLICT</option>
                  <option value="RESEARCH_GAP">RESEARCH_GAP</option>
                </select>
              </div>

              <div>
                <label className="text-[#87929a] font-mono block mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gross margin expansion decelerated in Q2"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-[#87929a] font-mono block mb-1">Finding / Conclusion</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detailed analyst finding derived from evidence..."
                  value={newFinding}
                  onChange={e => setNewFinding(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-[#87929a] font-mono block mb-1">Supporting Evidence IDs (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. ev_nvda_q2_sec, ev_market_pe"
                  value={newEvidenceIds}
                  onChange={e => setNewEvidenceIds(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowCreateMemoryModal(false)}
                  className="px-3 py-1.5 bg-[#0d1e30] text-[#87929a] hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#38bdf8] text-[#06121e] font-bold rounded"
                >
                  Save to Historical Memory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SUPERSEDE MEMORY */}
      {showSupersedeModal && supersedeTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#06121e] border border-[#1c2b3c] rounded-lg p-5 max-w-lg w-full space-y-4">
            <div className="flex justify-between items-center border-b border-[#1c2b3c] pb-3">
              <h3 className="font-bold text-amber-300 text-sm font-mono flex items-center gap-2">
                <GitFork className="w-4 h-4 text-amber-400" />
                <span>Supersede Historical Memory</span>
              </h3>
              <button
                onClick={() => setShowSupersedeModal(false)}
                className="text-[#87929a] hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-[#0d1e30] border border-[#1c2b3c] rounded text-xs space-y-1">
              <div className="text-[#87929a] font-mono">Original Finding Being Superseded:</div>
              <div className="font-bold text-white">{supersedeTarget.title}</div>
              <div className="text-zinc-400 text-[11px]">{supersedeTarget.finding}</div>
            </div>

            <form onSubmit={handleSupersede} className="space-y-3 text-xs">
              <div>
                <label className="text-[#87929a] font-mono block mb-1">Updated Title</label>
                <input
                  type="text"
                  placeholder={`Updated: ${supersedeTarget.title}`}
                  value={supersedeTitle}
                  onChange={e => setSupersedeTitle(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-[#87929a] font-mono block mb-1">New Finding / Conclusion</label>
                <textarea
                  required
                  rows={3}
                  placeholder="What is our updated understanding based on new evidence?"
                  value={supersedeFinding}
                  onChange={e => setSupersedeFinding(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-[#87929a] font-mono block mb-1">Reassessment / Superseding Reason</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 gross margin compression confirmed structural pricing power decline."
                  value={supersedeReason}
                  onChange={e => setSupersedeReason(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowSupersedeModal(false)}
                  className="px-3 py-1.5 bg-[#0d1e30] text-[#87929a] hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 text-black font-bold rounded"
                >
                  Supersede Finding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE RESEARCH QUESTION */}
      {showCreateQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#06121e] border border-[#1c2b3c] rounded-lg p-5 max-w-lg w-full space-y-4">
            <div className="flex justify-between items-center border-b border-[#1c2b3c] pb-3">
              <h3 className="font-bold text-white text-sm font-mono flex items-center gap-2">
                <QuestionIcon className="w-4 h-4 text-amber-400" />
                <span>Log Open Research Question</span>
              </h3>
              <button
                onClick={() => setShowCreateQuestionModal(false)}
                className="text-[#87929a] hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-3 text-xs">
              <div>
                <label className="text-[#87929a] font-mono block mb-1">Research Question</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Is data center gross margin compression temporary or structural?"
                  value={newQuestionText}
                  onChange={e => setNewQuestionText(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-[#87929a] font-mono block mb-1">Analytical Context & Rationale</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Why this question is critical for investment thesis stability..."
                  value={newQuestionContext}
                  onChange={e => setNewQuestionContext(e.target.value)}
                  className="w-full bg-[#0d1e30] border border-[#1c2b3c] rounded p-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowCreateQuestionModal(false)}
                  className="px-3 py-1.5 bg-[#0d1e30] text-[#87929a] hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 text-black font-bold rounded"
                >
                  Log Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: FINDING DETAIL */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#06121e] border border-[#1c2b3c] rounded-lg p-5 max-w-xl w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#1c2b3c] pb-3">
              <div className="space-y-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                  {selectedFinding.memoryType}
                </span>
                <h3 className="font-bold text-white text-base">{selectedFinding.title}</h3>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="text-[#87929a] hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="text-[11px] text-[#87929a] font-mono uppercase">Finding</div>
                <p className="text-white mt-1 leading-relaxed bg-[#0d1e30] p-3 rounded border border-[#1c2b3c]">
                  {selectedFinding.finding}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 bg-[#0d1e30] rounded border border-[#1c2b3c]">
                  <span className="text-[#87929a]">As of Date: </span>
                  <span className="text-white">{selectedFinding.asOfDate}</span>
                </div>
                <div className="p-2 bg-[#0d1e30] rounded border border-[#1c2b3c]">
                  <span className="text-[#87929a]">Status: </span>
                  <span className="text-emerald-400">{selectedFinding.status}</span>
                </div>
                <div className="p-2 bg-[#0d1e30] rounded border border-[#1c2b3c]">
                  <span className="text-[#87929a]">Epistemic State: </span>
                  <span className="text-cyan-300">{selectedFinding.epistemicStatus}</span>
                </div>
                <div className="p-2 bg-[#0d1e30] rounded border border-[#1c2b3c]">
                  <span className="text-[#87929a]">Currency: </span>
                  <span className="text-white">{selectedFinding.currency}</span>
                </div>
              </div>

              {selectedFinding.relatedEvidenceIds.length > 0 && (
                <div>
                  <div className="text-[11px] text-[#87929a] font-mono uppercase mb-1">
                    Related Primary Evidence
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedFinding.relatedEvidenceIds.map(evId => (
                      <span
                        key={evId}
                        onClick={() => {
                          if (onOpenEvidence) onOpenEvidence(evId);
                        }}
                        className="px-2 py-1 bg-cyan-950/60 border border-cyan-800 text-cyan-300 rounded font-mono text-[10px] cursor-pointer hover:bg-cyan-900"
                      >
                        {evId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedFinding.reassessmentReason && (
                <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded text-rose-300">
                  <div className="font-bold font-mono text-[10px] uppercase mb-0.5">Reassessment Trigger:</div>
                  <div>{selectedFinding.reassessmentReason}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
              <button
                onClick={() => setSelectedFinding(null)}
                className="px-4 py-1.5 bg-[#0d1e30] text-white hover:bg-[#1c2b3c] rounded text-xs font-mono"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
