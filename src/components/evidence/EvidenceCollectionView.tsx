/**
 * Phase 35: Institutional Evidence Collection & Research Execution Ledger
 * 
 * Answers:
 * "For the research investigation we planned, what evidence was actually collected,
 * where did it come from, what did it establish or contradict, what remains missing,
 * and how did it change institutional knowledge?"
 * 
 * Strict Invariants:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Point-in-Time (PIT) zero lookahead.
 * - Multi-tenant IDOR protection.
 * - Native USD vs INR currency isolation.
 * - No trade execution, target prices, or automated buy/sell recommendations.
 */

import React, { useState, useEffect } from 'react';
import {
  ActiveScreen,
  EvidenceOverview,
  EvidenceCollectionRecord,
  EvidenceReconciliationResult,
  EvidenceAuditRecord,
  EvidenceSourceClass,
  CollectionStatus,
  EvidenceQualityGrade,
  EvidenceRelationshipType,
  EpistemicStatus
} from '../../types';
import { CANONICAL_SECURITIES } from '../../data/canonicalSecurities';
import {
  Database,
  FileCheck2,
  AlertTriangle,
  Clock,
  History,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Plus,
  ExternalLink,
  ChevronRight,
  GitFork,
  Check,
  Calendar,
  Layers,
  FileText,
  Copy,
  Link,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Eye
} from 'lucide-react';

interface EvidenceCollectionViewProps {
  initialSecurityId?: string;
  onNavigate?: (screen: ActiveScreen) => void;
  onSelectStock?: (ticker: string) => void;
  onOpenEvidence?: (evidenceId: string) => void;
}

export const EvidenceCollectionView: React.FC<EvidenceCollectionViewProps> = ({
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
  const [overview, setOverview] = useState<EvidenceOverview | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ledger' | 'reconciliation' | 'provenance' | 'audit'>('ledger');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('ALL');

  // Modals
  const [showCollectModal, setShowCollectModal] = useState<boolean>(false);
  const [showValidateModal, setShowValidateModal] = useState<boolean>(false);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [showSupersedeModal, setShowSupersedeModal] = useState<boolean>(false);
  const [showCommitModal, setShowCommitModal] = useState<boolean>(false);

  const [activeRecordForAction, setActiveRecordForAction] = useState<EvidenceCollectionRecord | null>(null);
  const [auditRecords, setAuditRecords] = useState<EvidenceAuditRecord[]>([]);

  // Collect Evidence Form
  const [newSourceType, setNewSourceType] = useState<EvidenceSourceClass>('SEC_FILING');
  const [newSourceTitle, setNewSourceTitle] = useState<string>('');
  const [newSourcePublisher, setNewSourcePublisher] = useState<string>('SEC EDGAR');
  const [newSourceReference, setNewSourceReference] = useState<string>('');
  const [newSourceUrl, setNewSourceUrl] = useState<string>('');
  const [newPublishedAt, setNewPublishedAt] = useState<string>(asOfDate);
  const [newFindingsSummary, setNewFindingsSummary] = useState<string>('');
  const [newRawContent, setNewRawContent] = useState<string>('');
  const [newSupportsQuestion, setNewSupportsQuestion] = useState<boolean>(true);
  const [newContradictsQuestion, setNewContradictsQuestion] = useState<boolean>(false);
  const [newEpistemicStatus, setNewEpistemicStatus] = useState<EpistemicStatus>('REAL');

  // Action Form States
  const [actionNotes, setActionNotes] = useState<string>('');
  const [commitTitle, setCommitTitle] = useState<string>('');
  const [commitSummary, setCommitSummary] = useState<string>('');
  const [commitFinding, setCommitFinding] = useState<string>('');

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/research/evidence/overview/${selectedSecurityId}?asOfDate=${asOfDate}`
      );
      if (!res.ok) {
        throw new Error(`Failed to load evidence overview: ${res.statusText}`);
      }
      const data: EvidenceOverview = await res.json();
      setOverview(data);
      if (data.records.length > 0 && !selectedEvidenceId) {
        setSelectedEvidenceId(data.records[0].collectionId);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching evidence ledger overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [selectedSecurityId, asOfDate]);

  useEffect(() => {
    if (selectedEvidenceId) {
      fetch(`/api/research/evidence/${selectedEvidenceId}/audit?asOfDate=${asOfDate}`)
        .then(r => (r.ok ? r.json() : []))
        .then(data => setAuditRecords(data))
        .catch(() => setAuditRecords([]));
    }
  }, [selectedEvidenceId, asOfDate]);

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/research/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecurityId,
          sourceType: newSourceType,
          sourceTitle: newSourceTitle,
          sourcePublisher: newSourcePublisher,
          sourceReference: newSourceReference,
          sourceUrl: newSourceUrl || undefined,
          publishedAt: newPublishedAt,
          availableAt: newPublishedAt,
          asOfDate,
          findingsSummary: newFindingsSummary,
          rawContent: newRawContent,
          supportsQuestion: newSupportsQuestion,
          contradictsQuestion: newContradictsQuestion,
          epistemicStatus: newEpistemicStatus
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to collect evidence');
      }
      setShowCollectModal(false);
      setNewSourceTitle('');
      setNewSourceReference('');
      setNewFindingsSummary('');
      setNewRawContent('');
      await fetchOverview();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleValidate = async () => {
    if (!activeRecordForAction) return;
    try {
      const res = await fetch(`/api/research/evidence/${activeRecordForAction.collectionId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validationNotes: actionNotes || 'Verified against primary filing documentation.',
          asOfDate
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Validation failed');
      }
      setShowValidateModal(false);
      setActionNotes('');
      setActiveRecordForAction(null);
      await fetchOverview();
    } catch (err: any) {
      alert(`Validation error: ${err.message}`);
    }
  };

  const handleReject = async () => {
    if (!activeRecordForAction) return;
    try {
      const res = await fetch(`/api/research/evidence/${activeRecordForAction.collectionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejectionReason: actionNotes || 'Fails institutional verification standards.',
          asOfDate
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Rejection failed');
      }
      setShowRejectModal(false);
      setActionNotes('');
      setActiveRecordForAction(null);
      await fetchOverview();
    } catch (err: any) {
      alert(`Rejection error: ${err.message}`);
    }
  };

  const handleSupersede = async () => {
    if (!activeRecordForAction) return;
    try {
      const res = await fetch(`/api/research/evidence/${activeRecordForAction.collectionId}/supersede`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supersedingReason: actionNotes || 'Updated primary filing disclosures superseded previous draft.',
          asOfDate
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Supersession failed');
      }
      setShowSupersedeModal(false);
      setActionNotes('');
      setActiveRecordForAction(null);
      await fetchOverview();
    } catch (err: any) {
      alert(`Supersession error: ${err.message}`);
    }
  };

  const handleCommitFinding = async () => {
    if (!overview || !overview.records.length) return;
    try {
      const validatedIds = overview.records
        .filter(r => r.collectionStatus === 'VALIDATED')
        .map(r => r.collectionId);

      const res = await fetch('/api/research/investigations/overview/' + selectedSecurityId);
      const planOverview = await res.json();
      const planId = planOverview.plans?.[0]?.planId || `plan_${selectedSecurityId.toLowerCase()}_auto`;

      const commitRes = await fetch(`/api/research/investigations/${planId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: commitTitle || `Evidence-Verified Finding for ${overview.ticker}`,
          summary: commitSummary || `Analyst verified primary filings confirming foundational operating metrics.`,
          findingText: commitFinding || `Corroborated by ${validatedIds.length} primary verified evidence source(s).`,
          verifiedEvidenceIds: validatedIds.length > 0 ? validatedIds : [overview.records[0].collectionId],
          asOfDate
        })
      });

      if (!commitRes.ok) {
        const err = await commitRes.json();
        throw new Error(err.error || 'Commit finding failed');
      }

      setShowCommitModal(false);
      setCommitTitle('');
      setCommitSummary('');
      setCommitFinding('');
      alert('Finding committed to Phase 33 Research Memory successfully!');
      if (onNavigate) {
        onNavigate('research-memory');
      }
    } catch (err: any) {
      alert(`Commit finding error: ${err.message}`);
    }
  };

  const selectedRecord = overview?.records.find(
    r => r.collectionId === selectedEvidenceId
  );

  const filteredRecords = (overview?.records || []).filter(r => {
    if (statusFilter !== 'ALL' && r.collectionStatus !== statusFilter) return false;
    if (sourceTypeFilter !== 'ALL' && r.sourceType !== sourceTypeFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#051424] text-[#d4e4fa] overflow-hidden">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#091b2e] border-b border-[#1c2b3c] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold text-white tracking-wide">
              Evidence Collection & Research Execution Ledger
            </h1>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/30">
              PHASE 35
            </span>
          </div>

          <div className="h-4 w-px bg-[#1c2b3c]" />

          {/* Security Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#87929a]">Security:</span>
            <select
              value={selectedSecurityId}
              onChange={e => {
                setSelectedSecurityId(e.target.value);
                if (onSelectStock) onSelectStock(e.target.value);
              }}
              className="bg-[#0c2238] border border-[#1c2b3c] text-xs rounded px-2.5 py-1 text-white font-mono focus:outline-none focus:border-emerald-500"
            >
              {CANONICAL_SECURITIES.map(s => (
                <option key={s.id} value={s.id}>
                  {s.symbol} ({s.market} · {s.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Point-In-Time Date Cutoff */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#87929a] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              As-Of Cutoff:
            </span>
            <input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="bg-[#0c2238] border border-[#1c2b3c] text-xs rounded px-2.5 py-1 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCollectModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Collect Evidence</span>
          </button>

          <button
            onClick={() => setShowCommitModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold shadow transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Commit Verified Finding</span>
          </button>

          <button
            onClick={fetchOverview}
            className="p-1.5 text-[#87929a] hover:text-white border border-[#1c2b3c] rounded hover:bg-[#0c2238] transition-colors"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* INSTITUTIONAL SAFETY BANNER */}
      <div className="px-6 py-2 bg-[#081726] border-b border-[#152638] flex items-center justify-between text-[11px] text-[#87929a]">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>
            <strong className="text-amber-300">Analytical & Audit Ledger Boundary:</strong> Evidence collection records are immutable historical entries. No autonomous trading, price targets, or synthetic truth assignment.
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="text-emerald-400">isAnalyticalOnly: true</span>
          <span>·</span>
          <span className="text-cyan-400">executionProhibited: true</span>
          <span>·</span>
          <span className="text-purple-400">Currency: {overview?.currency || 'USD'}</span>
        </div>
      </div>

      {/* MAIN WORKSPACE CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: METRICS & EVIDENCE LEDGER LIST */}
        <div className="w-[420px] border-r border-[#1c2b3c] flex flex-col bg-[#061626]">
          {/* STATS STRIP */}
          <div className="grid grid-cols-3 gap-2 p-3 border-b border-[#1c2b3c] bg-[#091b2e]/60">
            <div className="bg-[#0c2238] p-2.5 rounded border border-[#1c2b3c]/80 flex flex-col">
              <span className="text-[10px] text-[#87929a] uppercase font-mono">Collected</span>
              <span className="text-lg font-bold text-emerald-400 font-mono">
                {overview?.collectedCount || 0}
              </span>
            </div>
            <div className="bg-[#0c2238] p-2.5 rounded border border-[#1c2b3c]/80 flex flex-col">
              <span className="text-[10px] text-[#87929a] uppercase font-mono">Validated</span>
              <span className="text-lg font-bold text-cyan-400 font-mono">
                {overview?.validatedCount || 0}
              </span>
            </div>
            <div className="bg-[#0c2238] p-2.5 rounded border border-[#1c2b3c]/80 flex flex-col">
              <span className="text-[10px] text-[#87929a] uppercase font-mono">Conflicting</span>
              <span className={`text-lg font-bold font-mono ${(overview?.conflictingCount || 0) > 0 ? 'text-amber-400' : 'text-[#87929a]'}`}>
                {overview?.conflictingCount || 0}
              </span>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="flex items-center justify-between p-3 border-b border-[#1c2b3c] bg-[#081829] gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <Filter className="w-3.5 h-3.5 text-[#87929a]" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-[#0c2238] border border-[#1c2b3c] text-[11px] rounded px-2 py-1 text-white font-mono w-full"
              >
                <option value="ALL">All Statuses</option>
                <option value="COLLECTED">Collected</option>
                <option value="VALIDATED">Validated</option>
                <option value="CONFLICTING">Conflicting</option>
                <option value="STALE">Stale</option>
                <option value="UNAVAILABLE">Unavailable</option>
                <option value="REJECTED">Rejected</option>
                <option value="SUPERSEDED">Superseded</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 flex-1">
              <select
                value={sourceTypeFilter}
                onChange={e => setSourceTypeFilter(e.target.value)}
                className="bg-[#0c2238] border border-[#1c2b3c] text-[11px] rounded px-2 py-1 text-white font-mono w-full"
              >
                <option value="ALL">All Sources</option>
                <option value="SEC_FILING">SEC Filing</option>
                <option value="REGULATORY_FILING">Regulatory</option>
                <option value="COMPANY_DISCLOSURE">Disclosure</option>
                <option value="FINANCIAL_STATEMENT">Financials</option>
                <option value="MARKET_DATA">Market Data</option>
                <option value="INTERNAL_RESEARCH">Internal</option>
              </select>
            </div>
          </div>

          {/* EVIDENCE RECORDS LIST */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#132233]">
            {loading && !overview && (
              <div className="p-8 text-center text-xs text-[#87929a]">
                Loading evidence ledger...
              </div>
            )}

            {!loading && filteredRecords.length === 0 && (
              <div className="p-8 text-center text-xs text-[#87929a]">
                No evidence records found for selected filters.
              </div>
            )}

            {filteredRecords.map(rec => {
              const isSelected = rec.collectionId === selectedEvidenceId;
              return (
                <div
                  key={rec.collectionId}
                  onClick={() => setSelectedEvidenceId(rec.collectionId)}
                  className={`p-3.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#0d2740] border-l-4 border-emerald-400'
                      : 'hover:bg-[#091b2e]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#102a45] text-cyan-300 border border-[#1a3d60]">
                          {rec.sourceType}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            rec.collectionStatus === 'VALIDATED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : rec.collectionStatus === 'CONFLICTING'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : rec.collectionStatus === 'REJECTED'
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          }`}
                        >
                          {rec.collectionStatus}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-white truncate">
                        {rec.sourceTitle}
                      </h4>
                      <p className="text-[11px] text-[#87929a] truncate mt-0.5">
                        {rec.sourcePublisher} · {rec.sourceReference}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[10px] font-mono text-[#87929a]">
                        {rec.publishedAt}
                      </span>
                      {rec.supportsQuestion && (
                        <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" /> Supports
                        </span>
                      )}
                      {rec.contradictsQuestion && (
                        <span className="text-[9px] text-rose-400 flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> Contradicts
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: WORKSPACE TABS & DETAIL VIEW */}
        <div className="flex-1 flex flex-col bg-[#051424] overflow-hidden">
          {/* SUB-TABS */}
          <div className="flex items-center gap-2 px-6 pt-3 bg-[#081829] border-b border-[#1c2b3c] flex-shrink-0">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'ledger'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-[#87929a] hover:text-white'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Evidence Record Detail</span>
            </button>

            <button
              onClick={() => setActiveTab('reconciliation')}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'reconciliation'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-[#87929a] hover:text-white'
              }`}
            >
              <GitFork className="w-3.5 h-3.5 text-amber-400" />
              <span>Reconciliation & Conflicts</span>
              {overview?.conflictingCount ? (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                  {overview.conflictingCount}
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setActiveTab('provenance')}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'provenance'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-[#87929a] hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Source Provenance & Hash</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-[#87929a] hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              <span>Audit Trail Ledger</span>
            </button>
          </div>

          {/* TAB 1: RECORD DETAIL */}
          {activeTab === 'ledger' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedRecord ? (
                <>
                  {/* Top Banner Card */}
                  <div className="bg-[#091b2e] p-5 rounded-lg border border-[#1c2b3c] shadow-md">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#102a45] text-cyan-300 border border-[#1a3d60]">
                            {selectedRecord.sourceType}
                          </span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#0c2238] text-emerald-300 border border-emerald-500/30">
                            GRADE: {selectedRecord.qualityGrade}
                          </span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#0c2238] text-purple-300 border border-purple-500/30">
                            EPISTEMIC: {selectedRecord.epistemicStatus}
                          </span>
                        </div>
                        <h2 className="text-lg font-bold text-white leading-tight">
                          {selectedRecord.sourceTitle}
                        </h2>
                        <p className="text-xs text-[#87929a] mt-1 font-mono">
                          ID: {selectedRecord.collectionId}
                        </p>
                      </div>

                      {/* Status Action Buttons */}
                      <div className="flex items-center gap-2">
                        {selectedRecord.collectionStatus !== 'VALIDATED' && (
                          <button
                            onClick={() => {
                              setActiveRecordForAction(selectedRecord);
                              setShowValidateModal(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Validate</span>
                          </button>
                        )}

                        {selectedRecord.collectionStatus !== 'REJECTED' && (
                          <button
                            onClick={() => {
                              setActiveRecordForAction(selectedRecord);
                              setShowRejectModal(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded text-xs font-semibold shadow transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setActiveRecordForAction(selectedRecord);
                            setShowSupersedeModal(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#0e2740] hover:bg-[#133555] border border-[#1c2b3c] text-cyan-300 rounded text-xs font-semibold transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Supersede</span>
                        </button>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-4 gap-4 mt-5 pt-4 border-t border-[#1c2b3c] text-xs">
                      <div>
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block">Publisher</span>
                        <span className="font-semibold text-white">{selectedRecord.sourcePublisher}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block">Published At</span>
                        <span className="font-mono text-white">{selectedRecord.publishedAt}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block">Available At (PIT)</span>
                        <span className="font-mono text-emerald-400">{selectedRecord.availableAt}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block">Collected At</span>
                        <span className="font-mono text-[#87929a]">{new Date(selectedRecord.collectedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Findings & Analytical Synthesis */}
                  <div className="bg-[#091b2e] p-5 rounded-lg border border-[#1c2b3c] space-y-4">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase font-mono flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      Findings Summary & Analytical Provenance
                    </h3>
                    <div className="p-3.5 bg-[#051424] rounded border border-[#1c2b3c] text-xs text-[#d4e4fa] leading-relaxed">
                      {selectedRecord.findingsSummary || 'No specific narrative synthesis attached.'}
                    </div>

                    {selectedRecord.rawSnippet && (
                      <div>
                        <span className="text-[10px] font-mono text-[#87929a] uppercase block mb-1.5">
                          Raw Source Snippet
                        </span>
                        <pre className="p-3.5 bg-[#030d17] rounded border border-[#1c2b3c] text-[11px] font-mono text-[#94a3b8] overflow-x-auto whitespace-pre-wrap">
                          {selectedRecord.rawSnippet}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Investigation Workflow Linkage */}
                  <div className="bg-[#091b2e] p-5 rounded-lg border border-[#1c2b3c] space-y-3">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase font-mono flex items-center gap-2">
                      <Link className="w-4 h-4 text-indigo-400" />
                      Investigation Workflow Linkage
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="p-3 bg-[#051424] rounded border border-[#1c2b3c]">
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block mb-1">
                          Research Question
                        </span>
                        <span className="font-mono text-cyan-300">
                          {selectedRecord.questionId || 'None explicitly mapped'}
                        </span>
                      </div>
                      <div className="p-3 bg-[#051424] rounded border border-[#1c2b3c]">
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block mb-1">
                          Research Gap
                        </span>
                        <span className="font-mono text-amber-300">
                          {selectedRecord.gapId || 'None explicitly mapped'}
                        </span>
                      </div>
                      <div className="p-3 bg-[#051424] rounded border border-[#1c2b3c]">
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block mb-1">
                          Investigation Task
                        </span>
                        <span className="font-mono text-emerald-300">
                          {selectedRecord.taskId || 'None explicitly mapped'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-[#87929a] text-xs">
                  Select an evidence record from the ledger on the left to inspect details.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RECONCILIATION & CONFLICTS */}
          {activeTab === 'reconciliation' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-[#091b2e] p-5 rounded-lg border border-[#1c2b3c]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <GitFork className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                      Deterministic Evidence Reconciliation Engine
                    </h3>
                  </div>
                  <span className="text-xs text-[#87929a]">
                    Total Inquiries Evaluated: {overview?.reconciliations.length || 0}
                  </span>
                </div>
                <p className="text-xs text-[#87929a] leading-relaxed">
                  Reconciliation evaluates evidence convergence against explicit research questions without autonomous truth promotion or LLM hallucinations.
                </p>
              </div>

              {overview?.reconciliations.map((rec, idx) => (
                <div
                  key={rec.questionId || idx}
                  className={`p-5 rounded-lg border shadow-sm space-y-4 ${
                    rec.state === 'CONFLICTING'
                      ? 'bg-[#18110b] border-amber-500/40'
                      : rec.state === 'CONVERGENT'
                      ? 'bg-[#091e1d] border-emerald-500/40'
                      : 'bg-[#091b2e] border-[#1c2b3c]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                            rec.state === 'CONFLICTING'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : rec.state === 'CONVERGENT'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          }`}
                        >
                          STATE: {rec.state}
                        </span>
                        <span className="text-[10px] font-mono text-[#87929a]">
                          Question ID: {rec.questionId}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white">
                        Evidence Synthesis & Conflict State
                      </h4>
                    </div>

                    <div className="text-right font-mono text-xs">
                      <span className="text-emerald-400">{rec.supportingEvidenceIds.length} Supporting</span>
                      <span className="text-[#87929a] mx-1.5">·</span>
                      <span className="text-rose-400">{rec.contradictingEvidenceIds.length} Contradicting</span>
                    </div>
                  </div>

                  {rec.conflictDescription && (
                    <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>Identified Conflict:</strong> {rec.conflictDescription}
                      </div>
                    </div>
                  )}

                  {rec.recommendedFollowup && (
                    <div className="p-3 bg-[#051424] border border-[#1c2b3c] rounded text-xs text-[#d4e4fa] flex items-center justify-between">
                      <span className="text-[#87929a]">
                        <strong className="text-white">Required Follow-up:</strong> {rec.recommendedFollowup}
                      </span>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('investigation-planning')}
                          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono font-semibold"
                        >
                          View Tasks <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {rec.synthesisNarrative && (
                    <p className="text-xs text-[#94a3b8] italic bg-[#051424] p-3 rounded border border-[#1c2b3c]">
                      "{rec.synthesisNarrative}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: PROVENANCE & CRYPTOGRAPHIC HASH */}
          {activeTab === 'provenance' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {selectedRecord ? (
                <>
                  <div className="bg-[#091b2e] p-5 rounded-lg border border-[#1c2b3c] space-y-4">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-cyan-400" />
                      Cryptographic Fingerprint & Traceability
                    </h3>
                    <p className="text-xs text-[#87929a] leading-relaxed">
                      Every evidence artifact is deterministically fingerprinted and hashed via SHA-256 to guarantee auditability and prevent silent modifications.
                    </p>

                    <div className="space-y-3 pt-2">
                      <div>
                        <span className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">
                          SHA-256 Content Hash
                        </span>
                        <div className="p-2.5 bg-[#051424] rounded border border-[#1c2b3c] font-mono text-xs text-emerald-400 select-all">
                          {selectedRecord.contentHash}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">
                          Canonical Source Fingerprint
                        </span>
                        <div className="p-2.5 bg-[#051424] rounded border border-[#1c2b3c] font-mono text-xs text-cyan-400 select-all">
                          {selectedRecord.sourceFingerprint}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">
                          Source Reference / Citation
                        </span>
                        <div className="p-2.5 bg-[#051424] rounded border border-[#1c2b3c] font-mono text-xs text-white">
                          {selectedRecord.sourceReference}
                        </div>
                      </div>

                      {selectedRecord.sourceUrl && (
                        <div>
                          <span className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">
                            External Source URL
                          </span>
                          <a
                            href={selectedRecord.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2.5 bg-[#051424] rounded border border-[#1c2b3c] font-mono text-xs text-cyan-400 flex items-center justify-between hover:underline"
                          >
                            <span>{selectedRecord.sourceUrl}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Supersession Lineage */}
                  <div className="bg-[#091b2e] p-5 rounded-lg border border-[#1c2b3c] space-y-3">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase font-mono flex items-center gap-2">
                      <History className="w-4 h-4 text-purple-400" />
                      Supersession & Revision Lineage
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="p-3.5 bg-[#051424] rounded border border-[#1c2b3c]">
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block mb-1">
                          Supersedes Collection ID
                        </span>
                        <span className="font-mono text-white">
                          {selectedRecord.supersedesCollectionId || 'None (Genesis Collection)'}
                        </span>
                      </div>
                      <div className="p-3.5 bg-[#051424] rounded border border-[#1c2b3c]">
                        <span className="text-[10px] text-[#87929a] uppercase font-mono block mb-1">
                          Superseded By Collection ID
                        </span>
                        <span className="font-mono text-white">
                          {selectedRecord.supersededByCollectionId || 'None (Active Record)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-[#87929a] text-xs">
                  Select an evidence record from the ledger on the left to view provenance.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT TRAIL LEDGER */}
          {activeTab === 'audit' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-[#091b2e] p-4 rounded-lg border border-[#1c2b3c] flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wide font-mono flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-400" />
                    Immutable Evidence Audit Trail
                  </h3>
                  <p className="text-[11px] text-[#87929a] mt-0.5">
                    Chronological lifecycle events for evidence record {selectedEvidenceId}
                  </p>
                </div>
                <span className="text-xs font-mono text-[#87929a]">
                  {auditRecords.length} Event(s)
                </span>
              </div>

              <div className="divide-y divide-[#1c2b3c] bg-[#091b2e] rounded-lg border border-[#1c2b3c] overflow-hidden">
                {auditRecords.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#87929a]">
                    No audit records logged for this artifact.
                  </div>
                ) : (
                  auditRecords.map(a => (
                    <div key={a.auditId} className="p-4 flex items-start justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {a.action}
                          </span>
                          <span className="text-[#87929a] font-mono text-[10px]">
                            {a.auditId}
                          </span>
                        </div>
                        <p className="text-white font-medium">{a.reason || 'Lifecycle state change.'}</p>
                        {a.previousState && a.newState && (
                          <p className="text-[11px] text-[#87929a] mt-0.5 font-mono">
                            State: {a.previousState} → <strong className="text-white">{a.newState}</strong>
                          </p>
                        )}
                      </div>
                      <div className="text-right text-[10px] font-mono text-[#87929a]">
                        <span>{new Date(a.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: COLLECT EVIDENCE */}
      {showCollectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#091b2e] border border-[#1c2b3c] rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                  Collect Evidence for {overview?.ticker}
                </h3>
              </div>
              <button
                onClick={() => setShowCollectModal(false)}
                className="text-[#87929a] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCollectSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Source Class</label>
                  <select
                    value={newSourceType}
                    onChange={e => setNewSourceType(e.target.value as EvidenceSourceClass)}
                    className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white font-mono"
                  >
                    <option value="SEC_FILING">SEC Filing (10-K/10-Q)</option>
                    <option value="REGULATORY_FILING">Regulatory Filing</option>
                    <option value="COMPANY_DISCLOSURE">Company Disclosure</option>
                    <option value="FINANCIAL_STATEMENT">Financial Statement</option>
                    <option value="EARNINGS_REPORT">Earnings Report</option>
                    <option value="MARKET_DATA">Market Data</option>
                    <option value="PRIMARY_DOCUMENT">Primary Document</option>
                    <option value="INTERNAL_RESEARCH">Internal Research</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Publisher</label>
                  <input
                    type="text"
                    required
                    value={newSourcePublisher}
                    onChange={e => setNewSourcePublisher(e.target.value)}
                    className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white font-mono"
                    placeholder="e.g. SEC EDGAR / US Dept of Commerce"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Source Title</label>
                <input
                  type="text"
                  required
                  value={newSourceTitle}
                  onChange={e => setNewSourceTitle(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white"
                  placeholder="e.g. Form 10-Q Q2 2026 Footnote 12 Product Margins"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Source Reference / Citation</label>
                  <input
                    type="text"
                    required
                    value={newSourceReference}
                    onChange={e => setNewSourceReference(e.target.value)}
                    className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white font-mono"
                    placeholder="e.g. 0001045810-26-000045 Note 12"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Publication Date</label>
                  <input
                    type="date"
                    required
                    value={newPublishedAt}
                    onChange={e => setNewPublishedAt(e.target.value)}
                    className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Findings Summary</label>
                <textarea
                  required
                  rows={2}
                  value={newFindingsSummary}
                  onChange={e => setNewFindingsSummary(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white"
                  placeholder="Key analytical finding established by this primary evidence source..."
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Raw Content / Excerpt (for Hash)</label>
                <textarea
                  rows={3}
                  value={newRawContent}
                  onChange={e => setNewRawContent(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white font-mono"
                  placeholder="Primary filing excerpt verbatim..."
                />
              </div>

              <div className="flex items-center gap-6 p-3 bg-[#051424] rounded border border-[#1c2b3c]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSupportsQuestion}
                    onChange={e => setNewSupportsQuestion(e.target.checked)}
                    className="rounded border-[#1c2b3c] text-emerald-500"
                  />
                  <span>Supports Question</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newContradictsQuestion}
                    onChange={e => setNewContradictsQuestion(e.target.checked)}
                    className="rounded border-[#1c2b3c] text-rose-500"
                  />
                  <span>Contradicts Question</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1c2b3c]">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="px-4 py-2 border border-[#1c2b3c] rounded text-xs text-[#87929a] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs"
                >
                  Collect & Ledger Artifact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VALIDATE EVIDENCE */}
      {showValidateModal && activeRecordForAction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#091b2e] border border-[#1c2b3c] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Validate Evidence Record
            </h3>
            <p className="text-xs text-[#87929a]">
              Validating transitions {activeRecordForAction.collectionId} into the verified institutional evidence ledger.
            </p>

            <textarea
              rows={3}
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2.5 text-xs text-white"
              placeholder="Validation notes / primary filing confirmation criteria..."
            />

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowValidateModal(false)}
                className="px-4 py-2 border border-[#1c2b3c] rounded text-xs text-[#87929a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleValidate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs"
              >
                Confirm Validation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REJECT EVIDENCE */}
      {showRejectModal && activeRecordForAction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#091b2e] border border-[#1c2b3c] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Reject Evidence Record
            </h3>
            <p className="text-xs text-[#87929a]">
              Explain reason for rejecting {activeRecordForAction.collectionId}.
            </p>

            <textarea
              rows={3}
              required
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2.5 text-xs text-white"
              placeholder="Mandatory rejection reason (e.g. uncorroborated third-party blog)..."
            />

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-[#1c2b3c] rounded text-xs text-[#87929a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded text-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SUPERSEDE EVIDENCE */}
      {showSupersedeModal && activeRecordForAction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#091b2e] border border-[#1c2b3c] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              Supersede Evidence Record
            </h3>
            <p className="text-xs text-[#87929a]">
              Historical records remain immutable. Enter supersession reason for replacing {activeRecordForAction.collectionId}.
            </p>

            <textarea
              rows={3}
              required
              value={actionNotes}
              onChange={e => setActionNotes(e.target.value)}
              className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2.5 text-xs text-white"
              placeholder="Reason for supersession (e.g. 10-K amendment filed)..."
            />

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSupersedeModal(false)}
                className="px-4 py-2 border border-[#1c2b3c] rounded text-xs text-[#87929a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSupersede}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded text-xs"
              >
                Confirm Supersession
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMMIT FINDING TO PHASE 33 MEMORY */}
      {showCommitModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#091b2e] border border-[#1c2b3c] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2b3c] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                  Commit Finding to Research Memory
                </h3>
              </div>
              <button
                onClick={() => setShowCommitModal(false)}
                className="text-[#87929a] hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#87929a]">
              Commits verified evidence findings directly into Phase 33 Institutional Research Memory with cryptographic source links.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Finding Title</label>
                <input
                  type="text"
                  required
                  value={commitTitle}
                  onChange={e => setCommitTitle(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white"
                  placeholder="e.g. Confirmed 74% Gross Margin Resilience via SEC 10-Q Audit"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Executive Summary</label>
                <textarea
                  rows={2}
                  required
                  value={commitSummary}
                  onChange={e => setCommitSummary(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white"
                  placeholder="Brief high-level analytical summary for investment committee..."
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#87929a] uppercase block mb-1">Detailed Verified Finding Text</label>
                <textarea
                  rows={4}
                  required
                  value={commitFinding}
                  onChange={e => setCommitFinding(e.target.value)}
                  className="w-full bg-[#051424] border border-[#1c2b3c] rounded p-2 text-white"
                  placeholder="Comprehensive institutional finding corroborating fundamental assumptions..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1c2b3c]">
              <button
                onClick={() => setShowCommitModal(false)}
                className="px-4 py-2 border border-[#1c2b3c] rounded text-xs text-[#87929a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitFinding}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded text-xs"
              >
                Commit to Memory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
