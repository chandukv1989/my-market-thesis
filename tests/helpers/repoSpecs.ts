/**
 * Phase 38.2B: per-repository specifications used to run the SAME two-user isolation checks against every one of the
 * 31 repositories on every available backend (development adapter and the simulated PostgreSQL adapter).
 */
import { IPersistenceAdapter } from '../../server/persistence/types';

export type RepoKind = 'owned' | 'shared-reference' | 'identity' | 'tenant-keyed';

export interface RepoSpec {
  name: string;
  kind: RepoKind;
  /** Persist a record belonging to `owner` (undefined => ownerless legacy record). Returns its id. */
  seed(a: IPersistenceAdapter, owner: string | undefined, tag: string): Promise<string>;
  /** Ids visible to `owner` through the repository's tenant-scoped read path. */
  read(a: IPersistenceAdapter, owner: string): Promise<string[]>;
}

const NOW = '2024-03-01T12:00:00.000Z';
const slug = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').slice(-10);
const own = (owner?: string) => (owner ? { ownerUserId: owner, userId: owner, visibility: 'PRIVATE' as const } : {});

export const REPO_SPECS: RepoSpec[] = [
  {
    name: 'securities', kind: 'shared-reference',
    async seed(a, _o, tag) { const id = `sec-${tag}`; await a.getSecurityRepository().save({ id, ticker: `T${slug(tag)}`, companyName: 'Co', market: 'US', exchange: 'NASDAQ', country: 'US', currency: 'USD' } as any); return id; },
    async read(a) { return (await a.getSecurityRepository().getAll()).map((s: any) => s.id); }
  },
  {
    name: 'documents', kind: 'owned',
    async seed(a, o, tag) {
      const id = `doc-${tag}`;
      await a.getDocumentRepository().save({ documentId: id, fileName: 'f.txt', documentType: 'TXT', contentHash: `h-${tag}`, title: 't', processingStatus: 'READY', uploadedAt: NOW, provider: 'p', sourceType: 'RESEARCH_DOCUMENT', ...own(o) } as any);
      return id;
    },
    async read(a, o) { return (await a.getDocumentRepository().getAllForOwner(o)).map(d => d.documentId); }
  },
  {
    name: 'evidence', kind: 'owned',
    async seed(a, o, tag) {
      const id = `ev-${tag}`;
      await a.getEvidenceRepository().addEvidence({ evidenceId: id, securityId: 'us-aapl', sourceType: 'RESEARCH_DOCUMENT', provider: 'p', title: 't', content: 'c', publishedAt: NOW, retrievedAt: NOW, epistemicStatus: 'REAL', isSimulated: false, ...own(o) } as any);
      return id;
    },
    async read(a, o) { return (await a.getEvidenceRepository().queryEvidenceForOwner(o, {})).map(e => e.evidenceId); }
  },
  {
    name: 'notebooks', kind: 'owned',
    async seed(a, o, tag) { const id = `nb-${tag}`; await a.getNotebookRepository().save({ notebookId: id, securityId: 'us-aapl', title: 't', createdAt: NOW, updatedAt: NOW, ...own(o) } as any); return id; },
    async read(a, o) { return (await a.getNotebookRepository().getAllForOwner(o)).map(n => n.notebookId); }
  },
  {
    name: 'snapshots', kind: 'owned',
    async seed(a, o, tag) { const id = `snap-${tag}`; await a.getSnapshotRepository().save({ snapshotId: id, notebookId: 'nb-x', securityId: 'us-aapl', researchAsOfDate: '2024-03-01', createdAt: NOW, ...own(o) } as any); return id; },
    async read(a, o) { return (await a.getSnapshotRepository().getBySecurityIdForOwner('us-aapl', o)).map(s => s.snapshotId); }
  },
  {
    name: 'decisions', kind: 'owned',
    async seed(a, o, tag) { const id = `dec-${tag}`; await a.getDecisionRepository().save({ decisionId: id, securityId: 'us-aapl', asOfDate: '2024-03-01', compositeScore: 50, overallAssessment: 'NEUTRAL', conviction: 'LOW', generatedAt: NOW, ...own(o) } as any); return id; },
    async read(a, o) { return (await a.getDecisionRepository().getHistoryForOwner('us-aapl', o)).map(d => d.decisionId); }
  },
  {
    name: 'strategies', kind: 'owned',
    async seed(a, o, tag) { const id = `strat-${tag}`; await a.getStrategyRepository().save({ id, title: 't', ...own(o) } as any); return id; },
    async read(a, o) { return (await a.getStrategyRepository().getAllForOwner(o)).map(s => s.id); }
  },
  {
    name: 'backtests', kind: 'owned',
    async seed(a, o, tag) { const id = `bt-${tag}`; await a.getBacktestRepository().save({ backtestId: id, strategyId: 's', status: 'COMPLETED', generatedAt: NOW, ...own(o) } as any); return id; },
    async read(a, o) { return (await a.getBacktestRepository().getAllForOwner(o)).map(b => b.backtestId!); }
  },
  {
    name: 'watchlists', kind: 'tenant-keyed',
    async seed(a, o, tag) { const key = o || `legacy-${tag}`; await a.getWatchlistRepository().saveWatchlist([`W${slug(tag)}`], key); return `W${slug(tag)}`; },
    async read(a, o) { return a.getWatchlistRepository().getWatchlist(o); }
  },
  {
    name: 'alerts', kind: 'owned',
    async seed(a, o, tag) { const id = `al-${tag}`; await a.getAlertRepository().save({ id, ticker: 'AAPL', type: 'PRICE', severity: 'HIGH', title: 't', timestamp: NOW, ...own(o) } as any); return id; },
    async read(a, o) { return (await a.getAlertRepository().getAllForOwner(o)).map(x => x.id); }
  },
  {
    name: 'portfolio', kind: 'tenant-keyed',
    async seed(a, o, tag) { const key = o || `legacy-${tag}`; await a.getPortfolioRepository().savePositions([{ ticker: `P${slug(tag)}`, shares: 1, avgCost: 1 } as any], key); return `P${slug(tag)}`; },
    async read(a, o) { return (await a.getPortfolioRepository().getPositions(o)).map(p => p.ticker); }
  },
  {
    name: 'queries', kind: 'owned',
    async seed(a, o, tag) { const id = `q-${tag}`; await a.getQueryRepository().save({ id, query: 'q', date: NOW, answerSummary: '', groundedFacts: [], sources: [], ...own(o) } as any); return id; },
    async read(a, o) { return (await a.getQueryRepository().getAllForOwner(o)).map(q => q.id); }
  },
  {
    name: 'users', kind: 'identity',
    async seed(a, _o, tag) {
      const id = `usr_${tag}`;
      await a.getUserRepository().save({ userId: id, email: `${tag.toLowerCase()}@example.com`, normalizedEmail: `${tag.toLowerCase()}@example.com`, passwordHash: 'x', status: 'ACTIVE', createdAt: NOW, updatedAt: NOW, lastLoginAt: null } as any);
      return id;
    },
    async read(a, o) { const u = await a.getUserRepository().get(o); return u ? [u.userId] : []; }
  },
  {
    name: 'sessions', kind: 'identity',
    async seed(a, o, tag) {
      const owner = o || `usr_orphan_${tag}`;
      if (!(await a.getUserRepository().get(owner))) {
        await a.getUserRepository().save({ userId: owner, email: `${owner}@example.com`, normalizedEmail: `${owner}@example.com`, passwordHash: 'x', status: 'ACTIVE', createdAt: NOW, updatedAt: NOW, lastLoginAt: null } as any);
      }
      const id = `sess-${tag}`;
      await a.getSessionRepository().save({ sessionId: id, userId: owner, createdAt: NOW, expiresAt: new Date(Date.now() + 3600_000).toISOString(), lastActivityAt: NOW, isValid: true } as any);
      return id;
    },
    async read(a, o) { return (await a.getSessionRepository().getAll()).filter(s => s.userId === o && s.isValid).map(s => s.sessionId); }
  },
  {
    name: 'events', kind: 'shared-reference',
    async seed(a, _o, tag) {
      const id = `evt-${tag}`;
      await a.getEventRepository().save({ eventId: id, securityId: 'us-aapl', ticker: 'AAPL', market: 'US', exchange: 'NASDAQ', eventType: 'EARNINGS', eventDate: '2024-03-01', announcedAt: NOW, availableAt: NOW, sourceType: 'SEC_EDGAR', sourceReference: 'r', epistemicStatus: 'REAL', isSimulated: false, title: 't', summary: 's', createdAt: NOW } as any);
      return id;
    },
    async read(a) { return (await a.getEventRepository().getBySecurityId('us-aapl')).map(e => e.eventId); }
  },
  {
    name: 'monitors', kind: 'owned',
    async seed(a, o, tag) {
      const id = `mon-${tag}`;
      await a.getMonitorRepository().save({ monitorId: id, userId: o || 'legacy', ownerUserId: o, securityId: `us-${slug(tag)}`, ticker: 'AAPL', companyName: 'Apple', market: 'US', status: 'ACTIVE', reviewCadence: 'WEEKLY', invalidationStatus: 'ACTIVE_GUARD', createdAt: NOW, updatedAt: NOW } as any);
      return id;
    },
    async read(a, o) { return (await a.getMonitorRepository().getByUserId(o)).map(m => m.monitorId); }
  },
  {
    name: 'monitorReviews', kind: 'owned',
    async seed(a, o, tag) {
      const id = `rev-${tag}`;
      await a.getMonitorReviewRepository().save({ reviewId: id, monitorId: `mon-rev-${o || 'legacy'}`, userId: o || 'legacy', ownerUserId: o, securityId: 'us-aapl', ticker: 'AAPL', reviewedAt: NOW, asOfDate: '2024-03-01', createdAt: NOW } as any);
      return id;
    },
    async read(a, o) { return (await a.getMonitorReviewRepository().getByMonitorId(`mon-rev-${o}`)).map(r => r.reviewId); }
  },
  {
    name: 'policies', kind: 'owned',
    async seed(a, o, tag) {
      const id = `pol-${tag}`;
      await a.getPolicyRepository().save({ policyId: id, userId: o || 'legacy', ownerUserId: o, name: 'p', policyType: 'THESIS_INVALIDATION', enabled: true, scope: 'ALL_MONITORS', rules: [], configuration: {}, minSeverity: 'HIGH', cooldownMinutes: 60, createdAt: NOW, updatedAt: NOW } as any);
      return id;
    },
    async read(a, o) { return (await a.getPolicyRepository().getByUserId(o)).map(p => p.policyId); }
  },
  {
    name: 'orchestratedAlerts', kind: 'owned',
    async seed(a, o, tag) {
      const id = `oal-${tag}`;
      await a.getAlertOrchestrationRepository().save({ alertId: id, candidateId: 'c', userId: o || 'legacy', ownerUserId: o, ruleType: 'DECISION_CHANGE', severity: 'HIGH', status: 'OPEN', title: 't', description: 'd', deterministicExplanation: 'e', detectedAt: NOW, createdAt: NOW, fingerprint: `fp-${tag}`, trigger: {}, provenance: {}, auditTrail: [] } as any);
      return id;
    },
    async read(a, o) { return (await a.getAlertOrchestrationRepository().getByUserId(o)).map(x => x.alertId); }
  },
  {
    name: 'researchPriorities', kind: 'owned',
    async seed(a, o, tag) { const id = `rp-${tag}`; await a.getResearchPriorityRepository().saveSnapshot({ snapshotId: id, userId: o, universeType: 'ALL', createdAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getResearchPriorityRepository().getSnapshotsByUserId(o)).map(s => s.snapshotId); }
  },
  {
    name: 'crossInvestment', kind: 'owned',
    async seed(a, o, tag) { const id = `ci-${tag}`; await a.getCrossInvestmentSnapshotRepository().saveSnapshot({ snapshotId: id, userId: o, createdAt: NOW, asOfDate: '2024-03-01' } as any); return id; },
    async read(a, o) { return (await a.getCrossInvestmentSnapshotRepository().getSnapshotsByUserId(o)).map(s => s.snapshotId); }
  },
  {
    name: 'portfolioScenarios', kind: 'owned',
    async seed(a, o, tag) { const id = `ps-${tag}`; await a.getPortfolioScenarioRepository().saveSnapshot({ snapshotId: id, userId: o, createdAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getPortfolioScenarioRepository().getSnapshotsByUserId(o)).map(s => s.snapshotId); }
  },
  {
    name: 'counterfactuals', kind: 'owned',
    async seed(a, o, tag) { const id = `cf-${tag}`; await a.getCounterfactualRepository().saveSnapshot({ snapshotId: id, userId: o, createdAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getCounterfactualRepository().getSnapshotsByUserId(o)).map(s => s.snapshotId); }
  },
  {
    name: 'researchMemory', kind: 'owned',
    async seed(a, o, tag) { const id = `mem-${tag}`; await a.getResearchMemoryRepository().save({ id, userId: o, tenantId: o, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', memoryType: 'OBSERVATION', status: 'ACTIVE', createdAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getResearchMemoryRepository().getAll({ userId: o })).map(m => m.id); }
  },
  {
    name: 'researchQuestions', kind: 'owned',
    async seed(a, o, tag) { const id = `rq-${tag}`; await a.getResearchQuestionRepository().save({ id, userId: o, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', status: 'OPEN', createdAt: NOW, updatedAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getResearchQuestionRepository().getAll({ userId: o })).map(q => q.id); }
  },
  {
    name: 'researchGaps', kind: 'owned',
    async seed(a, o, tag) { const id = `gap-${tag}`; await a.getResearchGapRepository().save({ gapId: id, userId: o, tenantId: o, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', status: 'OPEN', gapType: 'STALE_FINDING', createdAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getResearchGapRepository().getAll({ userId: o })).map(g => g.gapId); }
  },
  {
    name: 'investigationPlans', kind: 'owned',
    async seed(a, o, tag) { const id = `plan-${tag}`; await a.getInvestigationPlanRepository().save({ planId: id, userId: o, tenantId: o, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', status: 'ACTIVE', createdAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getInvestigationPlanRepository().getAll({ userId: o })).map(p => p.planId); }
  },
  {
    name: 'investigationAudits', kind: 'owned',
    async seed(a, o, tag) { const id = `iaud-${tag}`; await a.getInvestigationAuditRepository().save({ auditId: id, tenantId: o, targetId: 'tgt', targetType: 'PLAN', asOfDate: '2024-03-01', timestamp: NOW } as any); return id; },
    async read(a, o) { return (await a.getInvestigationAuditRepository().getAll({ tenantId: o })).map(x => x.auditId); }
  },
  {
    name: 'evidenceCollections', kind: 'owned',
    async seed(a, o, tag) { const id = `col-${tag}`; await a.getEvidenceCollectionRepository().save({ collectionId: id, tenantId: o, userId: o, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', availableAt: '2024-03-01', collectionStatus: 'COLLECTED', sourceFingerprint: `fp-${tag}`, collectedAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getEvidenceCollectionRepository().getAll({ tenantId: o })).map(c => c.collectionId); }
  },
  {
    name: 'evidenceRelationships', kind: 'owned',
    async seed(a, o, tag) { const id = `rel-${tag}`; await a.getEvidenceRelationshipRepository().save({ relationshipId: id, tenantId: o, sourceId: 's', targetId: 't', targetType: 'QUESTION', relationshipType: 'SUPPORTS', asOfDate: '2024-03-01', createdAt: NOW } as any); return id; },
    async read(a, o) { return (await a.getEvidenceRelationshipRepository().getAll({ tenantId: o })).map(r => r.relationshipId); }
  },
  {
    name: 'evidenceAudits', kind: 'owned',
    async seed(a, o, tag) { const id = `eaud-${tag}`; await a.getEvidenceAuditRepository().save({ auditId: id, tenantId: o, collectionId: 'col', action: 'COLLECTED', asOfDate: '2024-03-01', timestamp: NOW } as any); return id; },
    async read(a, o) { return (await a.getEvidenceAuditRepository().getAll({ tenantId: o })).map(x => x.auditId); }
  }
];
