/**
 * Phase 27: Client Service for Continuous Monitoring & Alert Orchestration
 */

import {
  MonitoringPolicy,
  AlertInstance,
  AlertLifecycleStatus,
  AlertSeverity,
  MonitoringCycleResult
} from '../types';

export class AlertOrchestrationClient {
  private static instance: AlertOrchestrationClient;

  public static getInstance(): AlertOrchestrationClient {
    if (!AlertOrchestrationClient.instance) {
      AlertOrchestrationClient.instance = new AlertOrchestrationClient();
    }
    return AlertOrchestrationClient.instance;
  }

  public async getPolicies(): Promise<MonitoringPolicy[]> {
    const res = await fetch('/api/policies');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch monitoring policies');
    }
    return res.json();
  }

  public async savePolicy(policy: Partial<MonitoringPolicy>): Promise<MonitoringPolicy> {
    const res = await fetch('/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(policy)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save monitoring policy');
    }
    return res.json();
  }

  public async deletePolicy(policyId: string): Promise<boolean> {
    const res = await fetch(`/api/policies/${encodeURIComponent(policyId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete monitoring policy');
    }
    const data = await res.json();
    return Boolean(data.success);
  }

  public async runMonitoringCycle(options?: {
    monitorId?: string;
    asOfDate?: string;
  }): Promise<MonitoringCycleResult> {
    const res = await fetch('/api/orchestration/cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to execute monitoring cycle');
    }
    return res.json();
  }

  public async getAlerts(filter?: {
    status?: AlertLifecycleStatus;
    severity?: AlertSeverity;
    monitorId?: string;
    securityId?: string;
    limit?: number;
  }): Promise<AlertInstance[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.severity) params.set('severity', filter.severity);
    if (filter?.monitorId) params.set('monitorId', filter.monitorId);
    if (filter?.securityId) params.set('securityId', filter.securityId);
    if (filter?.limit) params.set('limit', String(filter.limit));

    const qs = params.toString();
    const url = `/api/orchestrated-alerts${qs ? `?${qs}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch orchestrated alerts');
    }
    return res.json();
  }

  public async getAlert(alertId: string): Promise<AlertInstance> {
    const res = await fetch(`/api/orchestrated-alerts/${encodeURIComponent(alertId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch orchestrated alert');
    }
    return res.json();
  }

  public async acknowledgeAlert(alertId: string, note?: string): Promise<AlertInstance> {
    const res = await fetch(`/api/orchestrated-alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to acknowledge alert');
    }
    return res.json();
  }

  public async openReviewForAlert(alertId: string): Promise<AlertInstance> {
    const res = await fetch(`/api/orchestrated-alerts/${encodeURIComponent(alertId)}/open-review`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to record review open event');
    }
    return res.json();
  }

  public async dismissAlert(alertId: string, note?: string): Promise<AlertInstance> {
    const res = await fetch(`/api/orchestrated-alerts/${encodeURIComponent(alertId)}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to dismiss alert');
    }
    return res.json();
  }

  public async resolveAlert(alertId: string, note?: string): Promise<AlertInstance> {
    const res = await fetch(`/api/orchestrated-alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to resolve alert');
    }
    return res.json();
  }
}

export const alertOrchestrationClient = AlertOrchestrationClient.getInstance();
