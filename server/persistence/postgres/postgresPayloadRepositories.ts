/**
 * Phase 38.2B: SQL-backed implementations of the 12 repositories that were in-memory `Map` caches.
 *
 * Behavioural parity with the previous cache implementations (immutability rules, filter semantics, ordering) is
 * preserved. Tenant predicates (`owner_user_id`) are pushed down into SQL whenever a user/tenant filter is given,
 * so a scoped read never loads another tenant's rows. Full domain objects live in `payload JSONB`
 * (see payloadTable.ts for the mapping contract).
 */

import { PostgresClient } from './postgresClient';
import { PayloadTable } from './payloadTable';
import {
  IResearchPriorityRepository,
  ICrossInvestmentSnapshotRepository,
  IPortfolioScenarioRepository,
  ICounterfactualRepository,
  IResearchMemoryRepository,
  IResearchQuestionRepository,
  IResearchGapRepository,
  IInvestigationPlanRepository,
  IInvestigationAuditRepository,
  IEvidenceCollectionRepository,
  IEvidenceRelationshipRepository,
  IEvidenceAuditRepository
} from '../types';
import {
  ResearchPrioritySnapshot,
  CrossInvestmentSnapshot,
  PortfolioScenarioSnapshot,
  CounterfactualSnapshot,
  ResearchMemoryEntry,
  ResearchQuestionEntry,
  ResearchMemoryType,
  ResearchMemoryStatus,
  ResearchQuestionStatus,
  ResearchGapRecord,
  InvestigationPlan,
  InvestigationAuditRecord,
  ResearchGapStatus,
  InvestigationPlanStatus,
  ResearchGapType,
  EvidenceCollectionRecord,
  EvidenceResearchRelationship,
  EvidenceAuditRecord,
  CollectionStatus,
  EvidenceSourceClass,
  EvidenceRelationshipType,
  EvidenceAuditAction,
  EpistemicStatus
} from '../../../src/types';

const ownerOf = (e: any): string | null => e?.userId || e?.tenantId || e?.ownerUserId || null;

/** Builds a `WHERE` fragment from optional equality predicates. Column names are static literals. */
function where(preds: Array<[string, unknown]>): { sql: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const [col, val] of preds) {
    if (val === undefined || val === null || val === '') continue;
    params.push(val);
    parts.push(`${col} = $${params.length}`);
  }
  return { sql: parts.join(' AND '), params };
}

function secMatch(secField: string, tickerField: string, target: string) {
  const t = target.toLowerCase();
  return (r: any) =>
    String(r[secField] || '').toLowerCase() === t ||
    String(r[tickerField] || '').toLowerCase() === t ||
    String(r[secField] || '').toLowerCase().includes(t);
}

// ==========================================
// RESEARCH PRIORITY SNAPSHOTS
// ==========================================
export class PostgresResearchPriorityRepository implements IResearchPriorityRepository {
  private t: PayloadTable<ResearchPrioritySnapshot>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'research_priority_snapshots', s => ({
      id: s.snapshotId, ownerUserId: ownerOf(s), refKey: (s as any).universeType, createdAt: s.createdAt
    }));
  }

  public async getSnapshot(snapshotId: string) { return this.t.get(snapshotId); }

  public async getLatestSnapshot(userId: string, universeType?: string) {
    const rows = (await this.t.select('owner_user_id = $1', [userId])).filter(s =>
      !(universeType && universeType !== 'ALL' && (s as any).universeType !== universeType)
    );
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows[0] || null;
  }

  public async getSnapshotsByUserId(userId: string) {
    const rows = await this.t.select('owner_user_id = $1', [userId]);
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }

  public async saveSnapshot(snapshot: ResearchPrioritySnapshot) {
    const saved = await this.t.upsert(snapshot);
    if (!saved) throw new Error(`Priority snapshot "${snapshot.snapshotId}" belongs to a different owner.`);
    return saved;
  }

  public async getAll() { return this.t.select(''); }
  public async count() { return this.t.count(); }
}

// ==========================================
// CROSS-INVESTMENT / SCENARIO / COUNTERFACTUAL SNAPSHOTS (immutable)
// ==========================================
export class PostgresCrossInvestmentSnapshotRepository implements ICrossInvestmentSnapshotRepository {
  private t: PayloadTable<CrossInvestmentSnapshot>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'cross_investment_snapshots', s => ({ id: s.snapshotId, ownerUserId: ownerOf(s), asOfDate: (s as any).asOfDate, createdAt: s.createdAt }));
  }
  public async getSnapshot(snapshotId: string) { return this.t.get(snapshotId); }
  public async getSnapshotsByUserId(userId: string) {
    const rows = await this.t.select('owner_user_id = $1', [userId]);
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }
  public async saveSnapshot(snapshot: CrossInvestmentSnapshot) {
    const saved = await this.t.insertOnce(snapshot);
    if (!saved) throw new Error(`Snapshot with ID "${snapshot.snapshotId}" already exists. Historical relationship snapshots are strictly immutable.`);
    return saved;
  }
  public async getAll() { return this.t.select(''); }
  public async count() { return this.t.count(); }
}

export class PostgresPortfolioScenarioRepository implements IPortfolioScenarioRepository {
  private t: PayloadTable<PortfolioScenarioSnapshot>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'portfolio_scenario_snapshots', s => ({ id: s.snapshotId, ownerUserId: ownerOf(s), asOfDate: (s as any).asOfDate, createdAt: s.createdAt }));
  }
  public async getSnapshot(snapshotId: string) { return this.t.get(snapshotId); }
  public async getSnapshotsByUserId(userId: string) {
    const rows = await this.t.select('owner_user_id = $1', [userId]);
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }
  public async saveSnapshot(snapshot: PortfolioScenarioSnapshot) {
    const saved = await this.t.insertOnce(snapshot);
    if (!saved) throw new Error(`Scenario snapshot with ID "${snapshot.snapshotId}" already exists. Historical scenario snapshots are strictly immutable.`);
    return saved;
  }
  public async getAll() { return this.t.select(''); }
  public async count() { return this.t.count(); }
}

export class PostgresCounterfactualRepository implements ICounterfactualRepository {
  private t: PayloadTable<CounterfactualSnapshot>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'counterfactual_snapshots', s => ({ id: s.snapshotId, ownerUserId: ownerOf(s), asOfDate: (s as any).asOfDate, createdAt: s.createdAt }));
  }
  public async getSnapshot(snapshotId: string) { return this.t.get(snapshotId); }
  public async getSnapshotsByUserId(userId: string) {
    const rows = await this.t.select('owner_user_id = $1', [userId]);
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  }
  public async saveSnapshot(snapshot: CounterfactualSnapshot) {
    const saved = await this.t.insertOnce(snapshot);
    if (!saved) throw new Error(`Counterfactual snapshot with ID "${snapshot.snapshotId}" already exists. Historical counterfactual snapshots are strictly immutable.`);
    return saved;
  }
  public async getAll() { return this.t.select(''); }
  public async count() { return this.t.count(); }
}

// ==========================================
// RESEARCH MEMORY (immutable save, explicit update)
// ==========================================
export class PostgresResearchMemoryRepository implements IResearchMemoryRepository {
  private t: PayloadTable<ResearchMemoryEntry>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'research_memories', m => ({
      id: m.id, ownerUserId: ownerOf(m), securityId: m.securityId, asOfDate: m.asOfDate, status: m.status, refKey: m.memoryType, createdAt: m.createdAt
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getAll(filter?: { securityId?: string; userId?: string; asOfDate?: string; memoryType?: ResearchMemoryType; status?: ResearchMemoryStatus }) {
    const w = where([['owner_user_id', filter?.userId], ['status', filter?.status], ['ref_key', filter?.memoryType]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.securityId) list = list.filter(secMatch('securityId', 'ticker', filter.securityId));
    if (filter?.asOfDate) list = list.filter(m => m.asOfDate <= filter.asOfDate!);
    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return b.id.localeCompare(a.id);
    });
    return list;
  }

  public async save(entry: ResearchMemoryEntry) {
    const saved = await this.t.insertOnce(entry);
    if (!saved) throw new Error(`Research memory with ID "${entry.id}" already exists. Historical research memories are strictly immutable.`);
    return saved;
  }

  public async update(entry: ResearchMemoryEntry) {
    const saved = await this.t.updateExisting(entry);
    if (!saved) throw new Error(`Research memory with ID "${entry.id}" not found.`);
    return saved;
  }

  public async count() { return this.t.count(); }
}

// ==========================================
// RESEARCH QUESTIONS
// ==========================================
export class PostgresResearchQuestionRepository implements IResearchQuestionRepository {
  private t: PayloadTable<ResearchQuestionEntry>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'research_questions', q => ({
      id: q.id, ownerUserId: ownerOf(q), securityId: q.securityId, asOfDate: q.asOfDate, status: q.status, createdAt: q.createdAt
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getAll(filter?: { securityId?: string; userId?: string; status?: ResearchQuestionStatus; asOfDate?: string }) {
    const w = where([['owner_user_id', filter?.userId], ['status', filter?.status]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.securityId) list = list.filter(secMatch('securityId', 'ticker', filter.securityId));
    if (filter?.asOfDate) list = list.filter(q => q.asOfDate <= filter.asOfDate!);
    list.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
      if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return b.id.localeCompare(a.id);
    });
    return list;
  }

  public async save(question: ResearchQuestionEntry) {
    const saved = await this.t.upsert(question);
    if (!saved) throw new Error(`Research question "${question.id}" belongs to a different owner.`);
    return saved;
  }

  public async update(question: ResearchQuestionEntry) {
    const saved = await this.t.updateExisting(question);
    if (!saved) throw new Error(`Research question with ID "${question.id}" not found.`);
    return saved;
  }

  public async count() { return this.t.count(); }
}

// ==========================================
// RESEARCH GAPS
// ==========================================
export class PostgresResearchGapRepository implements IResearchGapRepository {
  private t: PayloadTable<ResearchGapRecord>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'research_gaps', g => ({
      id: g.gapId, ownerUserId: ownerOf(g), securityId: g.securityId, asOfDate: g.asOfDate, status: g.status, refKey: g.gapType, createdAt: g.createdAt
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getAll(filter?: { securityId?: string; userId?: string; status?: ResearchGapStatus; asOfDate?: string; gapType?: ResearchGapType }) {
    const w = where([['owner_user_id', filter?.userId], ['status', filter?.status], ['ref_key', filter?.gapType]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.securityId) list = list.filter(secMatch('securityId', 'ticker', filter.securityId));
    if (filter?.asOfDate) list = list.filter(g => g.asOfDate <= filter.asOfDate!);
    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return b.gapId.localeCompare(a.gapId);
    });
    return list;
  }

  public async save(gap: ResearchGapRecord) {
    const saved = await this.t.insertOnce(gap);
    if (!saved) throw new Error(`Research gap with ID "${gap.gapId}" already exists. Overwrite prohibited.`);
    return saved;
  }

  public async update(gap: ResearchGapRecord) {
    const saved = await this.t.updateExisting(gap);
    if (!saved) throw new Error(`Research gap with ID "${gap.gapId}" not found.`);
    return saved;
  }

  public async count() { return this.t.count(); }
}

// ==========================================
// INVESTIGATION PLANS
// ==========================================
export class PostgresInvestigationPlanRepository implements IInvestigationPlanRepository {
  private t: PayloadTable<InvestigationPlan>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'investigation_plans', p => ({
      id: p.planId, ownerUserId: ownerOf(p), securityId: p.securityId, asOfDate: p.asOfDate, status: p.status, createdAt: p.createdAt
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getAll(filter?: { securityId?: string; userId?: string; status?: InvestigationPlanStatus; asOfDate?: string }) {
    const w = where([['owner_user_id', filter?.userId], ['status', filter?.status]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.securityId) list = list.filter(secMatch('securityId', 'ticker', filter.securityId));
    if (filter?.asOfDate) list = list.filter(p => p.asOfDate <= filter.asOfDate!);
    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return b.planId.localeCompare(a.planId);
    });
    return list;
  }

  public async save(plan: InvestigationPlan) {
    const saved = await this.t.insertOnce(plan);
    if (!saved) throw new Error(`Investigation plan with ID "${plan.planId}" already exists. Overwrite prohibited.`);
    return saved;
  }

  public async update(plan: InvestigationPlan) {
    const saved = await this.t.updateExisting(plan);
    if (!saved) throw new Error(`Investigation plan with ID "${plan.planId}" not found.`);
    return saved;
  }

  public async count() { return this.t.count(); }
}

// ==========================================
// INVESTIGATION AUDIT (append-only)
// ==========================================
export class PostgresInvestigationAuditRepository implements IInvestigationAuditRepository {
  private t: PayloadTable<InvestigationAuditRecord>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'investigation_audits', a => ({
      id: a.auditId, ownerUserId: ownerOf(a), asOfDate: a.asOfDate, refKey: a.targetId, refKey2: (a as any).targetType, createdAt: a.timestamp
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getAll(filter?: { targetId?: string; tenantId?: string; targetType?: string; asOfDate?: string }) {
    const w = where([['owner_user_id', filter?.tenantId], ['ref_key', filter?.targetId], ['ref_key2', filter?.targetType]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.asOfDate) list = list.filter(a => a.asOfDate <= filter.asOfDate!);
    list.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp.localeCompare(a.timestamp);
      return b.auditId.localeCompare(a.auditId);
    });
    return list;
  }

  public async save(audit: InvestigationAuditRecord) {
    const saved = await this.t.insertOnce(audit);
    if (!saved) throw new Error(`Investigation audit record with ID "${audit.auditId}" already exists. Append-only enforced.`);
    return saved;
  }

  public async count() { return this.t.count(); }
}

// ==========================================
// EVIDENCE COLLECTIONS
// ==========================================
export class PostgresEvidenceCollectionRepository implements IEvidenceCollectionRepository {
  private t: PayloadTable<EvidenceCollectionRecord>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'evidence_collections', r => ({
      id: r.collectionId, ownerUserId: r.tenantId || r.userId || null, securityId: r.securityId, asOfDate: r.asOfDate,
      status: r.collectionStatus, refKey: r.sourceFingerprint, createdAt: (r as any).collectedAt
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getBySourceFingerprint(fingerprint: string, tenantId?: string) {
    // Deduplication is tenant-scoped: one tenant's source can never resolve to another tenant's record.
    const w = where([['ref_key', fingerprint], ['owner_user_id', tenantId]]);
    const rows = await this.t.select(w.sql, w.params);
    return rows.find(r => r.collectionStatus !== 'SUPERSEDED') || null;
  }

  public async getAll(filter?: {
    securityId?: string; userId?: string; tenantId?: string; planId?: string; taskId?: string; questionId?: string;
    gapId?: string; status?: CollectionStatus; sourceType?: EvidenceSourceClass; epistemicStatus?: EpistemicStatus; asOfDate?: string;
  }) {
    const effectiveTenant = filter?.tenantId || filter?.userId;
    const w = where([['owner_user_id', effectiveTenant], ['status', filter?.status]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.securityId) list = list.filter(secMatch('securityId', 'ticker', filter.securityId));
    if (filter?.planId) list = list.filter(r => r.planId === filter.planId);
    if (filter?.taskId) list = list.filter(r => r.taskId === filter.taskId);
    if (filter?.questionId) list = list.filter(r => r.questionId === filter.questionId);
    if (filter?.gapId) list = list.filter(r => r.gapId === filter.gapId);
    if (filter?.sourceType) list = list.filter(r => r.sourceType === filter.sourceType);
    if (filter?.epistemicStatus) list = list.filter(r => r.epistemicStatus === filter.epistemicStatus);
    if (filter?.asOfDate) list = list.filter(r => r.asOfDate <= filter.asOfDate! && r.availableAt <= filter.asOfDate!);

    const statusPriority: Record<CollectionStatus, number> = {
      VALIDATED: 0, COLLECTED: 1, AVAILABLE: 2, REQUESTED: 3, DISCOVERED: 4, CONFLICTING: 5, STALE: 6, UNAVAILABLE: 7, REJECTED: 8, SUPERSEDED: 9
    };
    list.sort((a, b) => {
      const prioA = statusPriority[a.collectionStatus] ?? 99;
      const prioB = statusPriority[b.collectionStatus] ?? 99;
      if (prioA !== prioB) return prioA - prioB;
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.collectedAt !== a.collectedAt) return b.collectedAt.localeCompare(a.collectedAt);
      return a.collectionId.localeCompare(b.collectionId);
    });
    return list;
  }

  public async save(record: EvidenceCollectionRecord) {
    const saved = await this.t.insertOnce(record);
    if (!saved) throw new Error(`Evidence collection record with ID "${record.collectionId}" already exists. Overwrite prohibited.`);
    return saved;
  }

  public async update(record: EvidenceCollectionRecord) {
    const saved = await this.t.updateExisting(record);
    if (!saved) throw new Error(`Evidence collection record with ID "${record.collectionId}" not found.`);
    return saved;
  }

  public async count() { return this.t.count(); }
}

// ==========================================
// EVIDENCE RELATIONSHIPS
// ==========================================
export class PostgresEvidenceRelationshipRepository implements IEvidenceRelationshipRepository {
  private t: PayloadTable<EvidenceResearchRelationship>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'evidence_relationships', r => ({
      id: r.relationshipId, ownerUserId: r.tenantId || null, asOfDate: r.asOfDate, status: r.relationshipType,
      refKey: r.sourceId, refKey2: r.targetId, createdAt: r.createdAt
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getAll(filter?: { sourceId?: string; targetId?: string; targetType?: string; relationshipType?: EvidenceRelationshipType; tenantId?: string; asOfDate?: string }) {
    const w = where([['owner_user_id', filter?.tenantId], ['ref_key', filter?.sourceId], ['ref_key2', filter?.targetId], ['status', filter?.relationshipType]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.targetType) list = list.filter(r => r.targetType === filter.targetType);
    if (filter?.asOfDate) list = list.filter(r => r.asOfDate <= filter.asOfDate!);
    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return a.relationshipId.localeCompare(b.relationshipId);
    });
    return list;
  }

  public async save(rel: EvidenceResearchRelationship) {
    const saved = await this.t.upsert(rel);
    if (!saved) throw new Error(`Evidence relationship "${rel.relationshipId}" belongs to a different tenant.`);
    return saved;
  }

  public async delete(relationshipId: string) { return this.t.delete(relationshipId); }
  public async count() { return this.t.count(); }
}

// ==========================================
// EVIDENCE AUDIT (append-only)
// ==========================================
export class PostgresEvidenceAuditRepository implements IEvidenceAuditRepository {
  private t: PayloadTable<EvidenceAuditRecord>;
  constructor(client: PostgresClient) {
    this.t = new PayloadTable(client, 'evidence_audits', a => ({
      id: a.auditId, ownerUserId: a.tenantId || null, asOfDate: a.asOfDate, status: a.action, refKey: a.collectionId, createdAt: a.timestamp
    }));
  }

  public async get(id: string) { return this.t.get(id); }

  public async getAll(filter?: { collectionId?: string; tenantId?: string; action?: EvidenceAuditAction; asOfDate?: string }) {
    const w = where([['owner_user_id', filter?.tenantId], ['ref_key', filter?.collectionId], ['status', filter?.action]]);
    let list = await this.t.select(w.sql, w.params);
    if (filter?.asOfDate) list = list.filter(a => a.asOfDate <= filter.asOfDate!);
    list.sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp.localeCompare(a.timestamp);
      return b.auditId.localeCompare(a.auditId);
    });
    return list;
  }

  public async save(audit: EvidenceAuditRecord) {
    const saved = await this.t.insertOnce(audit);
    if (!saved) throw new Error(`Evidence audit record with ID "${audit.auditId}" already exists. Append-only enforced.`);
    return saved;
  }

  public async count() { return this.t.count(); }
}
