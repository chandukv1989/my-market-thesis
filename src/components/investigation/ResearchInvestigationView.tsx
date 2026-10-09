/**
 * Phase 34: Institutional Research Planning & Investigation Workspace
 * 
 * Answers:
 * "Given everything we currently know about this investment, what do we still need
 * to investigate, why does it matter, what evidence would resolve it, and what should
 * the analyst investigate next?"
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - No trade execution, target prices, or automated buy/sell recommendations.
 * - Point-in-Time (PIT) zero lookahead.
 * - Multi-tenant IDOR protection.
 * - Native USD vs INR currency isolation.
 */

import React, { useState, useEffect } from 'react';
import {
  ActiveScreen,
  InvestigationOverview,
  InvestigationPlan,
  InvestigationTask,
  EvidenceRequirement,
  ResearchQuestionEntry,
  ResearchGapRecord,
  InvestigationAuditRecord,
  ResearchQuestionCategory,
  ResearchGapType,
  EvidenceRequirementType
} from '../../types';
import { CANONICAL_SECURITIES } from '../../data/canonicalSecurities';
import {
  ListTodo,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  FileText,
  Layers,
  ShieldAlert,
  ExternalLink,
  Plus,
  RefreshCw,
  HelpCircle,
  History,
  Sparkles,
  Filter,
  ArrowRight,
  Calendar,
  ChevronRight,
  ChevronDown,
  Check,
  XCircle,
  Database,
  Link,
  ShieldCheck,
  Compass
} from 'lucide-react';

interface ResearchInvestigationViewProps {
  initialSecurityId?: string;
  onNavigate?: (screen: ActiveScreen) => void;
  onSelectStock?: (ticker: string) => void;
  onOpenEvidence?: (evidenceId: string) => void;
}

export const ResearchInvestigationView: React.FC<ResearchInvestigationViewProps> = ({
  initialSecurityId,
  onNavigate,
  onSelectStock,
  onOpenEvidence
}) => {
  const [selectedSecurityId, setSelectedSecurityId] = useState<string>(
    initialSecurityId || 'NVDA'
  );
  const [asOfDate, setAsOfDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [overview, setOverview] = useState<InvestigationOverview | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'questions' | 'gaps' | 'audit'>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & form state
  const [showCreatePlanModal, setShowCreatePlanModal] = useState<boolean>(false);
  const [showCreateQuestionModal, setShowCreateQuestionModal] = useState<boolean>(false);
  const [showCompleteInvestigationModal, setShowCompleteInvestigationModal] = useState<boolean>(false);
  const [planToComplete, setPlanToComplete] = useState<InvestigationPlan | null>(null);

  // Complete Investigation Form
  const [findingTitle, setFindingTitle] = useState<string>('');
  const [findingSummary, setFindingSummary] = useState<string>('');
  const [findingText, setFindingText] = useState<string>('');
  const [verifiedEvidenceInput, setVerifiedEvidenceInput] = useState<string>('');

  // Create Question Form
  const [newQuestionText, setNewQuestionText] = useState<string>('');
  const [newQuestionCategory, setNewQuestionCategory] = useState<ResearchQuestionCategory>('THESIS');
  const [newQuestionContext, setNewQuestionContext] = useState<string>('');
  const [newQuestionWhyItMatters, setNewQuestionWhyItMatters] = useState<string>('');

  // Create Plan Form
  const [newPlanTitle, setNewPlanTitle] = useState<string>('');
  const [newPlanObjective, setNewPlanObjective] = useState<string>('');

  // Audit history state
  const [selectedAuditTargetId, setSelectedAuditTargetId] = useState<string | null>(null);
  const [auditHistory, setAuditHistory] = useState<InvestigationAuditRecord[]>([]);

  const selectedSecurity =
    CANONICAL_SECURITIES.find(
      s =>
        s.id.toLowerCase() === selectedSecurityId.toLowerCase() ||
        s.symbol.toLowerCase() === selectedSecurityId.toLowerCase() ||
        (s as any).ticker?.toLowerCase() === selectedSecurityId.toLowerCase()
    ) || CANONICAL_SECURITIES[0];

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const secParam = selectedSecurity.symbol || selectedSecurity.id;
      const res = await fetch(`/api/research/investigations/overview/${secParam}?asOfDate=${asOfDate}`);
      if (!res.ok) {
        throw new Error(`Failed to load investigation overview: ${res.statusText}`);
      }
      const data: InvestigationOverview = await res.json();
      setOverview(data);
      if (data.plans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(data.plans[0].planId);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching investigation overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [selectedSecurityId, asOfDate]);

  const handleGenerateQuestions = async () => {
    setLoading(true);
    try {
      const secParam = selectedSecurity.symbol || selectedSecurity.id;
      const res = await fetch(`/api/research/questions/generate/${secParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asOfDate })
      });
      if (!res.ok) throw new Error('Failed to generate research questions');
      await fetchOverview();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDetectGaps = async () => {
    setLoading(true);
    try {
      const secParam = selectedSecurity.symbol || selectedSecurity.id;
      const res = await fetch(`/api/research/gaps/detect/${secParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asOfDate })
      });
      if (!res.ok) throw new Error('Failed to detect research gaps');
      await fetchOverview();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    try {
      const res = await fetch('/api/research/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecurity.id,
          question: newQuestionText,
          category: newQuestionCategory,
          context: newQuestionContext || 'Analyst identified inquiry.',
          whyItMatters: newQuestionWhyItMatters || 'Core fundamental pillar.',
          asOfDate
        })
      });
      if (!res.ok) throw new Error('Failed to create research question');
      setShowCreateQuestionModal(false);
      setNewQuestionText('');
      setNewQuestionContext('');
      setNewQuestionWhyItMatters('');
      await fetchOverview();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanTitle.trim() || !newPlanObjective.trim()) return;

    try {
      const res = await fetch('/api/research/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecurity.id,
          title: newPlanTitle,
          objective: newPlanObjective,
          questionIds: (overview?.questions || []).filter(q => q.status === 'OPEN').slice(0, 3).map(q => q.id),
          asOfDate
        })
      });
      if (!res.ok) throw new Error('Failed to create investigation plan');
      setShowCreatePlanModal(false);
      setNewPlanTitle('');
      setNewPlanObjective('');
      await fetchOverview();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTaskStatusToggle = async (planId: string, taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'COMPLETED' ? 'TODO' : 'COMPLETED';
    try {
      const res = await fetch(`/api/research/plans/${planId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          resolutionNotes: nextStatus === 'COMPLETED' ? 'Task marked complete by analyst' : undefined,
          asOfDate
        })
      });
      if (!res.ok) throw new Error('Failed to update task status');
      await fetchOverview();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCompleteInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planToComplete || !findingTitle.trim() || !findingText.trim()) return;

    try {
      const evidenceIds = verifiedEvidenceInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/research/investigations/${planToComplete.planId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: findingTitle,
          summary: findingSummary || findingTitle,
          findingText,
          verifiedEvidenceIds: evidenceIds.length > 0 ? evidenceIds : [`ev_${selectedSecurity.id}_investigation_result`],
          asOfDate
        })
      });
      if (!res.ok) throw new Error('Failed to complete investigation');
      setShowCompleteInvestigationModal(false);
      setPlanToComplete(null);
      setFindingTitle('');
      setFindingSummary('');
      setFindingText('');
      setVerifiedEvidenceInput('');
      await fetchOverview();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleViewAudit = async (targetId: string) => {
    setSelectedAuditTargetId(targetId);
    try {
      const res = await fetch(`/api/research/investigations/audit/${targetId}?asOfDate=${asOfDate}`);
      if (!res.ok) throw new Error('Failed to load audit history');
      const data = await res.json();
      setAuditHistory(data);
      setActiveTab('audit');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const selectedPlan = overview?.plans.find(p => p.planId === selectedPlanId) || overview?.plans[0];

  return (
    <div className="flex flex-col h-full bg-[#051424] text-slate-100 overflow-hidden select-none font-sans">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#090d14] border-b border-[#1c2b3c] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <ListTodo className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wide text-white uppercase">
                Institutional Research Planning & Investigation Workflow
              </h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-xs font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                PHASE 34
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ZERO LOOKAHEAD
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Identifies unresolved questions, evidence gaps, and orchestrates structured analyst investigation plans.
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          {/* Security Selector */}
          <div className="flex items-center gap-2 bg-[#0d1624] border border-[#1c2b3c] px-2.5 py-1 rounded-sm text-xs">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSecurityId}
              onChange={e => {
                setSelectedSecurityId(e.target.value);
                if (onSelectStock) onSelectStock(e.target.value);
              }}
              className="bg-transparent text-white font-mono focus:outline-hidden cursor-pointer"
            >
              {CANONICAL_SECURITIES.map(s => (
                <option key={s.id} value={s.id} className="bg-[#090d14] text-white">
                  {s.symbol} — {s.companyName} ({s.market})
                </option>
              ))}
            </select>
          </div>

          {/* Point-in-Time As-Of Date Filter */}
          <div className="flex items-center gap-1.5 bg-[#0d1624] border border-[#1c2b3c] px-2.5 py-1 rounded-sm text-xs">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] text-slate-400 font-mono">PIT As-Of:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="bg-transparent text-amber-300 font-mono text-xs focus:outline-hidden cursor-pointer"
            />
          </div>

          {/* Actions */}
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0d1624] hover:bg-[#152338] border border-[#1c2b3c] rounded-sm text-xs text-slate-200 transition-colors"
            title="Refresh Analysis"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            <span>Refresh</span>
          </button>

          {/* Navigation to Phase 33 Memory */}
          {onNavigate && (
            <button
              onClick={() => onNavigate('research-memory')}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-sm text-xs text-amber-300 font-medium transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span>Institutional Memory</span>
            </button>
          )}

          {/* Navigation to Phase 35 Evidence Ledger */}
          {onNavigate && (
            <button
              onClick={() => onNavigate('evidence-ledger')}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-sm text-xs text-emerald-300 font-medium transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Evidence Ledger</span>
            </button>
          )}
        </div>
      </header>

      {/* Sub-Header Navigation Tabs */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#080d16] border-b border-[#1c2b3c] shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-[#152438] text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#0d1624]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Investigation Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            className={`px-3 py-1.5 rounded-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'plans'
                ? 'bg-[#152438] text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#0d1624]'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Investigation Plans</span>
            {overview && overview.plans.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-indigo-500/20 text-indigo-300">
                {overview.plans.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('questions')}
            className={`px-3 py-1.5 rounded-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'questions'
                ? 'bg-[#152438] text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#0d1624]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Research Questions</span>
            {overview && (
              <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-amber-500/20 text-amber-300">
                {overview.unresolvedQuestionsCount} open
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('gaps')}
            className={`px-3 py-1.5 rounded-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'gaps'
                ? 'bg-[#152438] text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#0d1624]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Evidence Gaps</span>
            {overview && (
              <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-rose-500/20 text-rose-300">
                {overview.openGapsCount}
              </span>
            )}
          </button>

          {selectedAuditTargetId && (
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-[#152438] text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#0d1624]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Audit Trail ({selectedAuditTargetId})</span>
            </button>
          )}
        </div>

        {/* Action Trigger Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateQuestions}
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-sm text-indigo-300 font-medium transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Derive Inquiries</span>
          </button>

          <button
            onClick={handleDetectGaps}
            className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-sm text-rose-300 font-medium transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Detect Gaps</span>
          </button>

          <button
            onClick={() => setShowCreatePlanModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-white font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Investigation Plan</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="flex items-center gap-3 p-3 bg-rose-950/40 border border-rose-500/40 rounded-sm text-rose-200 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: INVESTIGATION OVERVIEW */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && overview && (
          <div className="space-y-4">
            {/* Top Stat KPI Row */}
            <div className="grid grid-cols-5 gap-3">
              <div className="p-3 bg-[#0a121e] border border-[#1c2b3c] rounded-sm">
                <div className="text-[11px] font-mono uppercase text-slate-400">Active Investigations</div>
                <div className="text-2xl font-bold font-mono text-indigo-400 mt-1">
                  {overview.activeInvestigationsCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Workflow plans in progress</div>
              </div>

              <div className="p-3 bg-[#0a121e] border border-[#1c2b3c] rounded-sm">
                <div className="text-[11px] font-mono uppercase text-slate-400">Unresolved Questions</div>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                  {overview.unresolvedQuestionsCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Inquiries pending evidence</div>
              </div>

              <div className="p-3 bg-[#0a121e] border border-[#1c2b3c] rounded-sm">
                <div className="text-[11px] font-mono uppercase text-slate-400">Open Evidence Gaps</div>
                <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
                  {overview.openGapsCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Missing or conflicting disclosures</div>
              </div>

              <div className="p-3 bg-[#0a121e] border border-[#1c2b3c] rounded-sm">
                <div className="text-[11px] font-mono uppercase text-slate-400">Blocked Plans</div>
                <div className="text-2xl font-bold font-mono text-red-500 mt-1">
                  {overview.blockedInvestigationsCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Awaiting unavailable sources</div>
              </div>

              <div className="p-3 bg-[#0a121e] border border-[#1c2b3c] rounded-sm">
                <div className="text-[11px] font-mono uppercase text-slate-400">Completed & Verified</div>
                <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  {overview.completedInvestigationsCount}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Recorded into Research Memory</div>
              </div>
            </div>

            {/* Split Screen: Active Plan vs Priority Inquiries */}
            <div className="grid grid-cols-12 gap-4">
              {/* Left Column: Active Investigation Plan Summary */}
              <div className="col-span-7 bg-[#0a121e] border border-[#1c2b3c] rounded-sm p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                        Featured Investigation Plan
                      </h2>
                      {selectedPlan && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-xs font-mono font-semibold ${
                          selectedPlan.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                          selectedPlan.status === 'BLOCKED' ? 'bg-rose-500/20 text-rose-400' :
                          'bg-indigo-500/20 text-indigo-400'
                        }`}>
                          {selectedPlan.status}
                        </span>
                      )}
                    </div>
                    {selectedPlan && (
                      <p className="text-xs text-slate-300 font-medium mt-1">{selectedPlan.title}</p>
                    )}
                  </div>

                  {selectedPlan && selectedPlan.status !== 'COMPLETED' && (
                    <button
                      onClick={() => {
                        setPlanToComplete(selectedPlan);
                        setFindingTitle(selectedPlan.title);
                        setShowCompleteInvestigationModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-xs text-white font-medium transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Complete & Record Finding</span>
                    </button>
                  )}
                </div>

                {selectedPlan ? (
                  <div className="space-y-4">
                    {/* Objective & Narrative */}
                    <div className="p-3 bg-[#0d1624] border border-[#1c2b3c] rounded-sm text-xs">
                      <div className="text-[11px] font-mono text-slate-400 uppercase">Objective</div>
                      <div className="text-slate-200 mt-1">{selectedPlan.objective}</div>
                      {selectedPlan.narrativeSummary && (
                        <div className="text-[11px] text-slate-400 mt-2 italic border-t border-[#1c2b3c] pt-2">
                          "{selectedPlan.narrativeSummary}"
                        </div>
                      )}
                    </div>

                    {/* Tasks Checklist */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-slate-300 uppercase tracking-wide">Investigation Tasks</span>
                        <span className="font-mono text-slate-400">
                          {selectedPlan.tasks.filter(t => t.status === 'COMPLETED').length} / {selectedPlan.tasks.length} Done
                        </span>
                      </div>

                      <div className="space-y-2">
                        {selectedPlan.tasks.map(task => (
                          <div
                            key={task.taskId}
                            className={`p-2.5 rounded-sm border transition-colors flex items-start gap-2.5 text-xs ${
                              task.status === 'COMPLETED'
                                ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-300'
                                : task.status === 'BLOCKED'
                                ? 'bg-rose-950/20 border-rose-500/30 text-slate-200'
                                : 'bg-[#0d1624] border-[#1c2b3c] text-white'
                            }`}
                          >
                            <button
                              onClick={() => handleTaskStatusToggle(selectedPlan.planId, task.taskId, task.status)}
                              className="mt-0.5 text-slate-400 hover:text-emerald-400"
                            >
                              {task.status === 'COMPLETED' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <div className="w-4 h-4 border border-slate-500 rounded-xs hover:border-emerald-400" />
                              )}
                            </button>

                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold ${task.status === 'COMPLETED' ? 'line-through text-slate-400' : 'text-slate-200'}`}>
                                  {task.title}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-[#152438] text-slate-400">
                                  {task.sourceType}
                                </span>
                              </div>
                              <p className="text-slate-400 text-[11px] mt-0.5">{task.description}</p>
                              {task.evidenceRequired.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-500 font-mono">
                                  <span>Required:</span>
                                  {task.evidenceRequired.map(ev => (
                                    <span key={ev} className="text-indigo-300 underline cursor-pointer" onClick={() => onOpenEvidence?.(ev)}>
                                      {ev}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Evidence Requirements */}
                    <div>
                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">
                        Evidence Verification Requirements
                      </div>
                      <div className="space-y-1.5">
                        {selectedPlan.evidenceRequirements.map(req => (
                          <div
                            key={req.requirementId}
                            className="flex items-center justify-between p-2 bg-[#0d1624] border border-[#1c2b3c] rounded-sm text-xs"
                          >
                            <div>
                              <div className="font-medium text-slate-200">{req.description}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                Preferred: {req.preferredSource} ({req.evidenceType})
                              </div>
                            </div>

                            <span className={`text-[10px] px-1.5 py-0.5 rounded-xs font-mono font-bold ${
                              req.status === 'AVAILABLE' ? 'bg-emerald-500/20 text-emerald-400' :
                              req.status === 'MISSING' ? 'bg-rose-500/20 text-rose-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              {req.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No investigation plans configured for this asset yet. Click "New Investigation Plan" to begin.
                  </div>
                )}
              </div>

              {/* Right Column: Research Inquiries & Gaps */}
              <div className="col-span-5 space-y-4">
                {/* Unresolved Questions Card */}
                <div className="bg-[#0a121e] border border-[#1c2b3c] rounded-sm p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-2">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-amber-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wide text-white">Unresolved Inquiries</h3>
                    </div>
                    <button
                      onClick={() => setShowCreateQuestionModal(true)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Inquiry</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {(overview.questions || []).slice(0, 5).map(q => (
                      <div key={q.id} className="p-2.5 bg-[#0d1624] border border-[#1c2b3c] rounded-sm text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            {q.category || 'INQUIRY'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{q.asOfDate}</span>
                        </div>
                        <p className="font-medium text-slate-200">{q.question}</p>
                        <p className="text-[11px] text-slate-400 italic">{q.whyItMatters}</p>
                        <div className="flex items-center justify-between pt-1 border-t border-[#1c2b3c]/50 text-[10px]">
                          <span className="text-slate-500 font-mono">
                            Evidence: {q.availableEvidenceCount || 0}/{q.requiredEvidenceCount || 2}
                          </span>
                          <button
                            onClick={() => handleViewAudit(q.id)}
                            className="text-slate-400 hover:text-slate-200 underline font-mono"
                          >
                            Audit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Evidence Gaps Card */}
                <div className="bg-[#0a121e] border border-[#1c2b3c] rounded-sm p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wide text-white">Active Research Gaps</h3>
                    </div>
                    <span className="text-[10px] font-mono text-rose-400">
                      {overview.openGapsCount} items
                    </span>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {(overview.gaps || []).slice(0, 5).map(g => (
                      <div key={g.gapId} className="p-2.5 bg-[#0d1624] border border-[#1c2b3c] rounded-sm text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-xs bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            {g.gapType}
                          </span>
                          <span className={`text-[10px] font-mono font-bold ${
                            g.status === 'RESOLVED' ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {g.status}
                          </span>
                        </div>
                        <p className="font-medium text-slate-200">{g.title}</p>
                        <p className="text-[11px] text-slate-400">{g.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: INVESTIGATION PLANS LIST */}
        {/* ========================================================================= */}
        {activeTab === 'plans' && overview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                Investigation Workflows ({overview.plans.length})
              </h2>
              <button
                onClick={() => setShowCreatePlanModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-xs text-white font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Investigation Plan</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {overview.plans.map(plan => (
                <div
                  key={plan.planId}
                  className={`p-4 rounded-sm border transition-colors space-y-3 cursor-pointer ${
                    plan.planId === selectedPlanId
                      ? 'bg-[#0f1d30] border-indigo-500/60 shadow-xs'
                      : 'bg-[#0a121e] border-[#1c2b3c] hover:border-slate-600'
                  }`}
                  onClick={() => setSelectedPlanId(plan.planId)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">{plan.planId}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-xs font-mono font-bold ${
                      plan.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                      plan.status === 'BLOCKED' ? 'bg-rose-500/20 text-rose-400' :
                      'bg-indigo-500/20 text-indigo-400'
                    }`}>
                      {plan.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white">{plan.title}</h3>
                    <p className="text-xs text-slate-300 mt-1">{plan.objective}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 pt-2 border-t border-[#1c2b3c]">
                    <div>Tasks: {plan.tasks.length}</div>
                    <div>Evidence Reqs: {plan.evidenceRequirements.length}</div>
                    <div>As of: {plan.asOfDate}</div>
                    <div>Currency: {plan.currency}</div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewAudit(plan.planId);
                      }}
                      className="text-xs text-slate-400 hover:text-white underline font-mono"
                    >
                      View Audit Log
                    </button>

                    {plan.status !== 'COMPLETED' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlanToComplete(plan);
                          setFindingTitle(plan.title);
                          setShowCompleteInvestigationModal(true);
                        }}
                        className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-white font-medium"
                      >
                        Complete Plan
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: RESEARCH QUESTIONS */}
        {/* ========================================================================= */}
        {activeTab === 'questions' && overview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                Research Questions & Hypotheses ({overview.questions.length})
              </h2>
              <button
                onClick={() => setShowCreateQuestionModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-sm text-xs text-white font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </div>

            <div className="space-y-3">
              {overview.questions.map(q => (
                <div key={q.id} className="p-3.5 bg-[#0a121e] border border-[#1c2b3c] rounded-sm space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                        {q.category || 'INQUIRY'}
                      </span>
                      <span className="font-mono text-slate-400">{q.id}</span>
                    </div>

                    <span className={`text-[10px] px-2 py-0.5 rounded-xs font-mono font-bold ${
                      q.status === 'ANSWERED' ? 'bg-emerald-500/20 text-emerald-400' :
                      q.status === 'PARTIALLY_ANSWERED' ? 'bg-amber-500/20 text-amber-400' :
                      q.status === 'BLOCKED' ? 'bg-rose-500/20 text-rose-400' :
                      'bg-indigo-500/20 text-indigo-400'
                    }`}>
                      {q.status}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-white">{q.question}</p>
                  <p className="text-slate-300">{q.context}</p>
                  <p className="text-slate-400 italic">Why it matters: {q.whyItMatters}</p>

                  {q.resolution && (
                    <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xs text-emerald-300 font-mono text-[11px]">
                      Resolution: {q.resolution}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[#1c2b3c] text-[11px] text-slate-400">
                    <div>Evidence Sources: {q.relatedEvidenceIds.length} attached</div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleViewAudit(q.id)}
                        className="text-slate-400 hover:text-white underline font-mono"
                      >
                        Audit Trail
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: RESEARCH GAPS */}
        {/* ========================================================================= */}
        {activeTab === 'gaps' && overview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                Detected Research Gaps ({overview.gaps.length})
              </h2>
              <button
                onClick={handleDetectGaps}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-sm text-xs text-white font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-Scan Gaps</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {overview.gaps.map(gap => (
                <div key={gap.gapId} className="p-4 bg-[#0a121e] border border-[#1c2b3c] rounded-sm space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-xs bg-rose-500/10 text-rose-300 border border-rose-500/30">
                      {gap.gapType}
                    </span>
                    <span className={`text-[10px] font-mono font-bold ${
                      gap.status === 'RESOLVED' ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {gap.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white">{gap.title}</h3>
                  <p className="text-slate-300">{gap.description}</p>
                  <p className="text-slate-400 italic">Why it matters: {gap.whyItMatters}</p>

                  <div className="pt-2 border-t border-[#1c2b3c] flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <div>State: {gap.currentEvidenceState}</div>
                    <button
                      onClick={() => handleViewAudit(gap.gapId)}
                      className="underline hover:text-white"
                    >
                      Audit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: AUDIT TRAIL */}
        {/* ========================================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                  Append-Only Investigation Audit Trail ({selectedAuditTargetId})
                </h2>
              </div>
              <button
                onClick={() => setActiveTab('overview')}
                className="text-xs text-slate-400 hover:text-white underline font-mono"
              >
                Back to Overview
              </button>
            </div>

            <div className="bg-[#0a121e] border border-[#1c2b3c] rounded-sm overflow-hidden text-xs">
              <table className="w-full text-left font-mono">
                <thead className="bg-[#090e17] text-slate-400 border-b border-[#1c2b3c] text-[11px]">
                  <tr>
                    <th className="p-2.5">Timestamp</th>
                    <th className="p-2.5">Actor</th>
                    <th className="p-2.5">Action</th>
                    <th className="p-2.5">Previous State</th>
                    <th className="p-2.5">New State</th>
                    <th className="p-2.5">Reason / Narrative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b3c]">
                  {auditHistory.map(audit => (
                    <tr key={audit.auditId} className="hover:bg-[#0f1a2a]">
                      <td className="p-2.5 text-slate-400">{audit.timestamp}</td>
                      <td className="p-2.5 text-slate-300">{audit.actorId}</td>
                      <td className="p-2.5 text-indigo-400 font-semibold">{audit.action}</td>
                      <td className="p-2.5 text-slate-400">{audit.previousState || '—'}</td>
                      <td className="p-2.5 text-emerald-400 font-bold">{audit.newState || '—'}</td>
                      <td className="p-2.5 text-slate-300 font-sans">{audit.reason || '—'}</td>
                    </tr>
                  ))}
                  {auditHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 font-sans">
                        No audit records recorded for this target item yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CREATE INVESTIGATION PLAN */}
      {/* ========================================================================= */}
      {showCreatePlanModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#0a121e] border border-[#1c2b3c] rounded-sm w-full max-w-lg p-5 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Create Investigation Plan ({selectedSecurity.symbol})
              </h3>
              <button onClick={() => setShowCreatePlanModal(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Plan Title</label>
                <input
                  type="text"
                  value={newPlanTitle}
                  onChange={e => setNewPlanTitle(e.target.value)}
                  placeholder="e.g. H2 2026 Gross Margin & Packaging Cost Investigation"
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Objective</label>
                <textarea
                  value={newPlanObjective}
                  onChange={e => setNewPlanObjective(e.target.value)}
                  placeholder="Identify measurable primary evidence required to resolve analytical uncertainty..."
                  rows={3}
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowCreatePlanModal(false)}
                  className="px-3 py-1.5 bg-[#0d1624] hover:bg-[#152338] border border-[#1c2b3c] rounded-sm text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-white font-medium"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE RESEARCH QUESTION */}
      {/* ========================================================================= */}
      {showCreateQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#0a121e] border border-[#1c2b3c] rounded-sm w-full max-w-lg p-5 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Add Research Question ({selectedSecurity.symbol})
              </h3>
              <button onClick={() => setShowCreateQuestionModal(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Category</label>
                <select
                  value={newQuestionCategory}
                  onChange={e => setNewQuestionCategory(e.target.value as any)}
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="THESIS">Thesis & Moat Verification</option>
                  <option value="EVIDENCE_CONFLICT">Evidence Conflict Reconciliation</option>
                  <option value="DECISION_DRIFT">Decision Drift Investigation</option>
                  <option value="EVENT_DRIVEN">Event Catalyst Impact</option>
                  <option value="SCENARIO_DRIVEN">Scenario Stress Lead Indicator</option>
                  <option value="CROSS_INVESTMENT">Cross-Investment Co-Movement</option>
                  <option value="GENERAL">General Invalidation Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Question</label>
                <textarea
                  value={newQuestionText}
                  onChange={e => setNewQuestionText(e.target.value)}
                  placeholder="e.g. What primary evidence would confirm or invalidate the operating leverage thesis?"
                  rows={2}
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Analytical Context</label>
                <input
                  type="text"
                  value={newQuestionContext}
                  onChange={e => setNewQuestionContext(e.target.value)}
                  placeholder="e.g. Q2 10-Q disclosed 320 bps margin compression."
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Why It Matters</label>
                <input
                  type="text"
                  value={newQuestionWhyItMatters}
                  onChange={e => setNewQuestionWhyItMatters(e.target.value)}
                  placeholder="e.g. Invalidation guard threshold is 72% gross margin floor."
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowCreateQuestionModal(false)}
                  className="px-3 py-1.5 bg-[#0d1624] hover:bg-[#152338] border border-[#1c2b3c] rounded-sm text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-sm text-white font-medium"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: COMPLETE INVESTIGATION & RECORD FINDING */}
      {/* ========================================================================= */}
      {showCompleteInvestigationModal && planToComplete && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#0a121e] border border-[#1c2b3c] rounded-sm w-full max-w-lg p-5 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  Complete Investigation & Record Finding
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Plan: {planToComplete.title}
                </p>
              </div>
              <button onClick={() => setShowCompleteInvestigationModal(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteInvestigation} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Finding Title</label>
                <input
                  type="text"
                  value={findingTitle}
                  onChange={e => setFindingTitle(e.target.value)}
                  placeholder="e.g. Packaging Capacity Ramp Resolves Margin Uncertainty"
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Summary</label>
                <input
                  type="text"
                  value={findingSummary}
                  onChange={e => setFindingSummary(e.target.value)}
                  placeholder="e.g. Q3 10-Q confirmed gross margin recovered to 74.8%."
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Verified Analytical Finding</label>
                <textarea
                  value={findingText}
                  onChange={e => setFindingText(e.target.value)}
                  placeholder="Primary evidence confirms operating leverage assumption remains intact with gross margins returning above 74%..."
                  rows={3}
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Verified Evidence IDs (comma-separated)
                </label>
                <input
                  type="text"
                  value={verifiedEvidenceInput}
                  onChange={e => setVerifiedEvidenceInput(e.target.value)}
                  placeholder="e.g. ev_nvda_10q_q3_2026, ev_tsmc_packaging_disclosure"
                  className="w-full bg-[#0d1624] border border-[#1c2b3c] px-3 py-2 rounded-sm text-white focus:outline-hidden focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Links this finding directly to verifiable primary evidence in Phase 33 Institutional Memory.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowCompleteInvestigationModal(false)}
                  className="px-3 py-1.5 bg-[#0d1624] hover:bg-[#152338] border border-[#1c2b3c] rounded-sm text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-sm text-white font-medium"
                >
                  Complete & Persist to Memory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
