/**
 * Phase 27: Continuous Monitoring & Alert Orchestration Panel
 * 
 * Strict architectural boundaries:
 * - isAnalyticalOnly: true
 * - executionProhibited: true
 * - Deterministic trigger inspection
 * - Direct seamless bridge into the Phase 26 Investment Review Workspace
 * - Real-time policy configuration & deduplication/cooldown tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertInstance,
  MonitoringPolicy,
  AlertLifecycleStatus,
  AlertSeverity,
  MonitoringCycleResult,
  AlertRuleType
} from '../../types';
import { alertOrchestrationClient } from '../../services/alertOrchestrationClient';
import {
  Bell,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCw,
  CheckCircle2,
  XCircle,
  Eye,
  Sliders,
  Filter,
  ArrowRight,
  Clock,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  Trash2,
  Layers,
  Activity
} from 'lucide-react';

interface ContinuousAlertOrchestrationPanelProps {
  onOpenReviewForMonitor?: (monitorId: string) => void;
  selectedMonitorId?: string | null;
}

export const ContinuousAlertOrchestrationPanel: React.FC<ContinuousAlertOrchestrationPanelProps> = ({
  onOpenReviewForMonitor,
  selectedMonitorId
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'policies' | 'cycles'>('queue');
  const [alerts, setAlerts] = useState<AlertInstance[]>([]);
  const [policies, setPolicies] = useState<MonitoringPolicy[]>([]);
  const [lastCycleResult, setLastCycleResult] = useState<MonitoringCycleResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningCycle, setRunningCycle] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<AlertLifecycleStatus | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'ALL'>('ALL');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string>('');
  const [processingAlertId, setProcessingAlertId] = useState<string | null>(null);
  const [showNewPolicyModal, setShowNewPolicyModal] = useState<boolean>(false);

  // New policy state
  const [newPolicyName, setNewPolicyName] = useState<string>('');
  const [newPolicyType, setNewPolicyType] = useState<MonitoringPolicy['policyType']>('THESIS');
  const [newPolicyScope, setNewPolicyScope] = useState<MonitoringPolicy['scope']>('ALL_MONITORS');
  const [newPolicySeverity, setNewPolicySeverity] = useState<AlertSeverity>('HIGH');
  const [newPolicyCooldown, setNewPolicyCooldown] = useState<number>(60);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedAlerts, fetchedPolicies] = await Promise.all([
        alertOrchestrationClient.getAlerts({
          monitorId: selectedMonitorId || undefined
        }),
        alertOrchestrationClient.getPolicies()
      ]);
      setAlerts(fetchedAlerts);
      setPolicies(fetchedPolicies);
    } catch (err) {
      console.warn('[AlertOrchestrationPanel] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonitorId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunCycle = async () => {
    setRunningCycle(true);
    try {
      const result = await alertOrchestrationClient.runMonitoringCycle({
        monitorId: selectedMonitorId || undefined
      });
      setLastCycleResult(result);
      await loadData();
    } catch (err) {
      console.error('[AlertOrchestrationPanel] Cycle failed:', err);
    } finally {
      setRunningCycle(false);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    setProcessingAlertId(alertId);
    try {
      await alertOrchestrationClient.acknowledgeAlert(alertId, actionNote || undefined);
      setActionNote('');
      await loadData();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    } finally {
      setProcessingAlertId(null);
    }
  };

  const handleDismiss = async (alertId: string) => {
    setProcessingAlertId(alertId);
    try {
      await alertOrchestrationClient.dismissAlert(alertId, actionNote || undefined);
      setActionNote('');
      await loadData();
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    } finally {
      setProcessingAlertId(null);
    }
  };

  const handleResolve = async (alertId: string) => {
    setProcessingAlertId(alertId);
    try {
      await alertOrchestrationClient.resolveAlert(alertId, actionNote || undefined);
      setActionNote('');
      await loadData();
    } catch (err) {
      console.error('Failed to resolve alert:', err);
    } finally {
      setProcessingAlertId(null);
    }
  };

  const handleNavigateToReview = async (alert: AlertInstance) => {
    if (!alert.monitorId) return;
    try {
      await alertOrchestrationClient.openReviewForAlert(alert.alertId);
    } catch (err) {
      console.warn('Failed to record review open:', err);
    }
    if (onOpenReviewForMonitor) {
      onOpenReviewForMonitor(alert.monitorId);
    }
  };

  const handleTogglePolicyEnabled = async (policy: MonitoringPolicy) => {
    try {
      await alertOrchestrationClient.savePolicy({
        ...policy,
        enabled: !policy.enabled
      });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle policy:', err);
    }
  };

  const handleDeletePolicy = async (policyId: string) => {
    try {
      await alertOrchestrationClient.deletePolicy(policyId);
      await loadData();
    } catch (err) {
      console.error('Failed to delete policy:', err);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyName.trim()) return;

    try {
      const defaultRules: Record<MonitoringPolicy['policyType'], AlertRuleType[]> = {
        SECURITY: ['DECISION_CHANGE', 'VALUATION_CHANGE', 'MATERIAL_FINANCIAL_CHANGE'],
        RESEARCH: ['RESEARCH_SNAPSHOT_CHANGE', 'EVIDENCE_CONFLICT', 'EVIDENCE_CHANGE'],
        THESIS: ['THESIS_INVALIDATION', 'INVALIDATION_CHANGE', 'THESIS_CHANGE'],
        EVENT: ['SEC_FILING', 'MATERIAL_INVESTMENT_EVENT', 'EVIDENCE_CONFLICT'],
        MONITOR: ['DECISION_CHANGE', 'RESEARCH_SNAPSHOT_CHANGE'],
        PORTFOLIO: ['PORTFOLIO_LOSS', 'DRAWDOWN', 'PORTFOLIO_CHANGE'],
        VALUATION: ['VALUATION_CHANGE']
      };

      await alertOrchestrationClient.savePolicy({
        name: newPolicyName,
        policyType: newPolicyType,
        enabled: true,
        scope: newPolicyScope,
        minSeverity: newPolicySeverity,
        cooldownMinutes: Number(newPolicyCooldown),
        rules: defaultRules[newPolicyType] || ['THESIS_CHANGE']
      });

      setShowNewPolicyModal(false);
      setNewPolicyName('');
      await loadData();
    } catch (err) {
      console.error('Failed to create policy:', err);
    }
  };

  // Filtered alerts
  const filteredAlerts = alerts.filter(a => {
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    return true;
  });

  const activeAlertsCount = alerts.filter(a => a.status === 'DELIVERED' || a.status === 'QUALIFIED').length;
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL' && a.status !== 'RESOLVED' && a.status !== 'DISMISSED').length;

  return (
    <div id="continuous-alert-orchestration-panel" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">Continuous Monitoring & Alert Orchestration</h2>
            <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              Deterministic Layer
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Material change detection, policy matching, deduplication & cooldown orchestration directly feeding the Investment Review Workspace.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            id="run-monitoring-cycle-btn"
            onClick={handleRunCycle}
            disabled={runningCycle}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${runningCycle ? 'animate-spin' : ''}`} />
            {runningCycle ? 'Executing Cycle...' : 'Run Monitoring Cycle'}
          </button>
        </div>
      </div>

      {/* Analytical Guardrail Banner */}
      <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Governance: <strong className="text-slate-300">isAnalyticalOnly: true</strong> | <strong className="text-slate-300">executionProhibited: true</strong></span>
          <span className="text-slate-600">•</span>
          <span>Policy Engine: <strong className="text-slate-300">Pure Deterministic (Zero LLM Triggering)</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            Active Alerts: <strong className="text-emerald-400 font-mono">{activeAlertsCount}</strong>
          </span>
          {criticalCount > 0 && (
            <span className="text-rose-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Critical: <strong className="font-mono">{criticalCount}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Cycle Result Summary Flash (if just executed) */}
      {lastCycleResult && (
        <div className="p-3 bg-emerald-950/40 border-b border-emerald-500/20 text-xs flex items-center justify-between text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Cycle completed at {new Date(lastCycleResult.timestamp).toLocaleTimeString()}:
              Evaluated {lastCycleResult.monitorsEvaluated} monitors. Detected {lastCycleResult.candidatesDetected} candidates,
              qualified {lastCycleResult.qualifiedAlerts} alerts (Suppressed: {lastCycleResult.suppressedDuplicates} dups, {lastCycleResult.suppressedCooldown} cooldown).
            </span>
          </div>
          <button onClick={() => setLastCycleResult(null)} className="text-emerald-400 hover:text-emerald-200">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-4">
        <button
          id="tab-alert-queue"
          onClick={() => setActiveTab('queue')}
          className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'queue'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          Attention Queue ({alerts.length})
        </button>
        <button
          id="tab-monitoring-policies"
          onClick={() => setActiveTab('policies')}
          className={`py-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'policies'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Monitoring Policies ({policies.length})
        </button>
      </div>

      {/* Tab 1: Attention Queue */}
      {activeTab === 'queue' && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Status:</span>
              {(['ALL', 'DELIVERED', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    statusFilter === st
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Severity:</span>
              {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    severityFilter === sev
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Alert Cards List */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex items-center justify-center gap-2">
              <RotateCw className="w-4 h-4 animate-spin" />
              Loading orchestrated alerts...
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">Attention Queue Clean</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No alerts matching the selected filters. Click "Run Monitoring Cycle" to evaluate active policies against monitored assets.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map(alert => {
                const isExpanded = expandedAlertId === alert.alertId;
                const isCritical = alert.severity === 'CRITICAL';
                const isHigh = alert.severity === 'HIGH';

                return (
                  <div
                    key={alert.alertId}
                    id={`alert-card-${alert.alertId}`}
                    className={`border rounded-xl transition-all ${
                      isCritical
                        ? 'border-rose-500/40 bg-rose-950/10'
                        : isHigh
                        ? 'border-amber-500/40 bg-amber-950/10'
                        : 'border-slate-800 bg-slate-950/40'
                    }`}
                  >
                    {/* Card Header Row */}
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                          isCritical
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : isHigh
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                          <ShieldAlert className="w-5 h-5" />
                        </span>

                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-bold text-white text-sm">{alert.symbol}</span>
                            <span className="text-xs text-slate-400">({alert.companyName})</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isCritical
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isHigh
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300'
                            }`}>
                              {alert.severity}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                              {alert.ruleType}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              alert.status === 'DELIVERED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : alert.status === 'ACKNOWLEDGED'
                                ? 'bg-blue-500/20 text-blue-300'
                                : alert.status === 'RESOLVED'
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-slate-800 text-slate-500'
                            }`}>
                              {alert.status}
                            </span>
                          </div>

                          <h3 className="text-sm font-semibold text-slate-200">{alert.title}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">{alert.description}</p>
                        </div>
                      </div>

                      {/* Primary Actions */}
                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        {alert.monitorId && onOpenReviewForMonitor && (
                          <button
                            id={`btn-open-review-${alert.alertId}`}
                            onClick={() => handleNavigateToReview(alert)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs flex items-center gap-1.5 shadow transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Review Workspace
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}

                        <button
                          onClick={() => setExpandedAlertId(isExpanded ? null : alert.alertId)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Inspect Alert Details"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail Accordion */}
                    {isExpanded && (
                      <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 space-y-4 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Trigger Data */}
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                            <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-emerald-400" />
                              Deterministic Trigger Inspection
                            </h4>
                            <div className="space-y-1.5 text-slate-400">
                              <div>Rule Type: <strong className="text-slate-200">{alert.trigger.ruleType}</strong></div>
                              <div>Observed Value: <strong className="text-slate-200">{String(alert.trigger.observedValue)}</strong></div>
                              {alert.trigger.previousState && (
                                <div>State Shift: <span className="text-slate-400">{alert.trigger.previousState}</span> → <strong className="text-emerald-400">{alert.trigger.currentState}</strong></div>
                              )}
                              <div>Explanation: <span className="text-slate-300">{alert.deterministicExplanation}</span></div>
                            </div>
                          </div>

                          {/* Provenance & Epistemic Status */}
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                            <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-blue-400" />
                              Provenance & Epistemic Audit
                            </h4>
                            <div className="space-y-1.5 text-slate-400">
                              <div>Source Type: <strong className="text-slate-200">{alert.provenance.sourceType}</strong></div>
                              <div>Source Reference: <span className="font-mono text-slate-300">{alert.provenance.sourceReference}</span></div>
                              <div>Epistemic Status: <strong className="text-emerald-400">{alert.provenance.epistemicStatus}</strong></div>
                              <div>Policy Scope: <span className="text-slate-300">{alert.policyName || 'Default Sentinel'}</span></div>
                              <div>Fingerprint: <span className="font-mono text-[10px] text-slate-500 break-all">{alert.fingerprint}</span></div>
                            </div>
                          </div>
                        </div>

                        {/* Audit Trail Timeline */}
                        {alert.auditTrail && alert.auditTrail.length > 0 && (
                          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                            <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              Alert Lifecycle Audit Trail
                            </h4>
                            <div className="space-y-2">
                              {alert.auditTrail.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[11px] text-slate-400">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <strong className="text-slate-200 uppercase">{item.action}</strong>
                                    <span>{item.note}</span>
                                  </div>
                                  <span className="font-mono text-slate-500">{new Date(item.timestamp).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Analyst Workflow Actions Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                          <input
                            type="text"
                            placeholder="Optional analyst note..."
                            value={actionNote}
                            onChange={e => setActionNote(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 flex-1 min-w-[200px]"
                          />

                          <div className="flex items-center gap-2">
                            {alert.status !== 'ACKNOWLEDGED' && alert.status !== 'RESOLVED' && (
                              <button
                                id={`btn-ack-${alert.alertId}`}
                                onClick={() => handleAcknowledge(alert.alertId)}
                                disabled={processingAlertId === alert.alertId}
                                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs disabled:opacity-50 transition-colors"
                              >
                                Acknowledge
                              </button>
                            )}

                            {alert.status !== 'RESOLVED' && (
                              <button
                                id={`btn-resolve-${alert.alertId}`}
                                onClick={() => handleResolve(alert.alertId)}
                                disabled={processingAlertId === alert.alertId}
                                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium text-xs disabled:opacity-50 transition-colors"
                              >
                                Mark Resolved
                              </button>
                            )}

                            {alert.status !== 'DISMISSED' && alert.status !== 'RESOLVED' && (
                              <button
                                id={`btn-dismiss-${alert.alertId}`}
                                onClick={() => handleDismiss(alert.alertId)}
                                disabled={processingAlertId === alert.alertId}
                                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-medium text-xs disabled:opacity-50 transition-colors"
                              >
                                Dismiss
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Monitoring Policies */}
      {activeTab === 'policies' && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Configured Monitoring Policies</h3>
              <p className="text-xs text-slate-400">Policies determine which candidate changes qualify into attention alerts, with custom severity and cooldown bounds.</p>
            </div>
            <button
              onClick={() => setShowNewPolicyModal(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Policy
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policies.map(policy => (
              <div
                key={policy.policyId}
                id={`policy-card-${policy.policyId}`}
                className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm">{policy.name}</span>
                    <button
                      onClick={() => handleTogglePolicyEnabled(policy)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        policy.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {policy.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400 mb-3">
                    <div>Type: <strong className="text-slate-300">{policy.policyType}</strong></div>
                    <div>Scope: <strong className="text-slate-300">{policy.scope}</strong></div>
                    <div>Min Severity: <strong className="text-slate-300">{policy.minSeverity}</strong></div>
                    <div>Cooldown: <strong className="text-slate-300">{policy.cooldownMinutes} minutes</strong></div>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {policy.rules.map(r => (
                      <span key={r} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500 text-[11px]">Updated: {new Date(policy.updatedAt).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleDeletePolicy(policy.policyId)}
                    className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                    title="Delete Policy"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* New Policy Modal */}
          {showNewPolicyModal && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-white text-base">Create Monitoring Policy</h3>
                  <button onClick={() => setShowNewPolicyModal(false)} className="text-slate-400 hover:text-white">
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreatePolicy} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Policy Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Margin Compression Sentinel"
                      value={newPolicyName}
                      onChange={e => setNewPolicyName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Type</label>
                      <select
                        value={newPolicyType}
                        onChange={e => setNewPolicyType(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        <option value="THESIS">Thesis Sentinel</option>
                        <option value="EVENT">Event Intelligence</option>
                        <option value="MONITOR">Monitor Delta</option>
                        <option value="PORTFOLIO">Portfolio Risk</option>
                        <option value="VALUATION">Valuation Sentinel</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Scope</label>
                      <select
                        value={newPolicyScope}
                        onChange={e => setNewPolicyScope(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        <option value="ALL_MONITORS">All Monitors</option>
                        <option value="SPECIFIC_MONITOR">Specific Monitor</option>
                        <option value="PORTFOLIO">Portfolio Assets</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Minimum Severity</label>
                      <select
                        value={newPolicySeverity}
                        onChange={e => setNewPolicySeverity(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Cooldown (Minutes)</label>
                      <input
                        type="number"
                        min="0"
                        value={newPolicyCooldown}
                        onChange={e => setNewPolicyCooldown(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                      </input>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewPolicyModal(false)}
                      className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                    >
                      Save Policy
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
