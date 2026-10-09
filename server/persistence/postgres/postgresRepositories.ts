/**
 * Phase 16: PostgreSQL Repository Implementations
 * 
 * Maps domain entities to/from PostgreSQL relations with strict type safety,
 * JSON serialization, and immutable historical artifact protection.
 */

import { PostgresClient } from './postgresClient';
import {
  ISecurityRepository,
  IResearchDocumentRepository,
  IPersistentEvidenceRepository,
  IResearchNotebookRepository,
  IResearchSnapshotRepository,
  IDecisionRepository,
  IStrategyRepository,
  IBacktestRepository,
  IWatchlistRepository,
  IAlertRepository,
  IPortfolioRepository,
  IResearchQueryRepository,
  IUserRepository,
  ISessionRepository,
  IInvestmentEventRepository,
  IInvestmentMonitorRepository,
  IInvestmentMonitorReviewRepository,
  IMonitoringPolicyRepository,
  IAlertOrchestrationRepository,
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
  CanonicalSecurity,
  ResearchDocument,
  EvidenceItem,
  EvidenceFilter,
  ResearchNotebook,
  ResearchSnapshot,
  InvestmentDecisionAssessment,
  Strategy,
  BacktestResult,
  AlertItem,
  HoldingPosition,
  ResearchQueryItem,
  DocumentProcessingStatus,
  User,
  AuthenticatedSession,
  InvestmentEvent,
  InvestmentMonitor,
  InvestmentMonitorReview,
  AnalystReviewNote,
  MonitoringPolicy,
  AlertInstance,
  AlertLifecycleStatus,
  AlertSeverity,
  AlertRuleType,
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

// ==========================================
// 1. SECURITY REPOSITORY
// ==========================================
export class PostgresSecurityRepository implements ISecurityRepository {
  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<CanonicalSecurity | null> {
    const res = await this.client.query('SELECT * FROM canonical_securities WHERE id = $1;', [id]);
    if (res.rows.length === 0) return null;
    return this.mapRowToSecurity(res.rows[0]);
  }

  public async getByTicker(ticker: string, market?: string): Promise<CanonicalSecurity | null> {
    let sql = 'SELECT * FROM canonical_securities WHERE UPPER(ticker) = UPPER($1)';
    const params: any[] = [ticker];
    if (market) {
      sql += ' AND UPPER(market) = UPPER($2)';
      params.push(market);
    }
    sql += ' LIMIT 1;';
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToSecurity(res.rows[0]);
  }

  public async getAll(): Promise<CanonicalSecurity[]> {
    const res = await this.client.query('SELECT * FROM canonical_securities ORDER BY ticker ASC;');
    return res.rows.map(r => this.mapRowToSecurity(r));
  }

  public async save(security: CanonicalSecurity): Promise<CanonicalSecurity> {
    const sql = `
      INSERT INTO canonical_securities (
        id, ticker, company_name, market, exchange, country, currency, isin, sector, industry, aliases, provider_symbol_mappings, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        exchange = EXCLUDED.exchange,
        currency = EXCLUDED.currency,
        isin = EXCLUDED.isin,
        sector = EXCLUDED.sector,
        industry = EXCLUDED.industry,
        aliases = EXCLUDED.aliases,
        provider_symbol_mappings = EXCLUDED.provider_symbol_mappings,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      security.id,
      security.ticker,
      security.companyName,
      security.market,
      security.exchange,
      security.country,
      security.currency,
      security.isin || null,
      security.sector || null,
      security.industry || null,
      JSON.stringify((security as any).aliases || []),
      JSON.stringify((security as any).providerSymbolMappings || {})
    ];
    const res = await this.client.query(sql, params);
    return this.mapRowToSecurity(res.rows[0]);
  }

  public async saveMany(securities: CanonicalSecurity[]): Promise<number> {
    let saved = 0;
    for (const sec of securities) {
      await this.save(sec);
      saved++;
    }
    return saved;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM canonical_securities;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToSecurity(row: any): CanonicalSecurity {
    return {
      id: row.id,
      canonicalId: row.id,
      ticker: row.ticker,
      symbol: row.ticker,
      companyName: row.company_name,
      market: row.market,
      exchange: row.exchange,
      country: row.country,
      currency: row.currency,
      isin: row.isin || undefined,
      sector: row.sector || undefined,
      industry: row.industry || undefined
    } as CanonicalSecurity;
  }
}

// ==========================================
// 2. RESEARCH DOCUMENT REPOSITORY
// ==========================================
export class PostgresResearchDocumentRepository implements IResearchDocumentRepository {
  constructor(private client: PostgresClient) {}

  public async get(documentId: string): Promise<ResearchDocument | null> {
    const res = await this.client.query('SELECT * FROM research_documents WHERE document_id = $1;', [documentId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToDocument(res.rows[0]);
  }

  public async getByHash(contentHash: string): Promise<ResearchDocument | null> {
    const res = await this.client.query('SELECT * FROM research_documents WHERE content_hash = $1;', [contentHash]);
    if (res.rows.length === 0) return null;
    return this.mapRowToDocument(res.rows[0]);
  }

  public async getAll(filter?: { securityId?: string; documentType?: string }): Promise<ResearchDocument[]> {
    let sql = 'SELECT * FROM research_documents WHERE 1=1';
    const params: any[] = [];
    if (filter?.documentType) {
      params.push(filter.documentType);
      sql += ` AND document_type = $${params.length}`;
    }
    sql += ' ORDER BY uploaded_at DESC;';
    const res = await this.client.query(sql, params);
    const docs = res.rows.map(r => this.mapRowToDocument(r));
    if (filter?.securityId) {
      return docs.filter(d => (d as any).securityAssociations?.some((s: any) => s.securityId === filter.securityId) || d.securityId === filter.securityId);
    }
    return docs;
  }

  public async save(doc: ResearchDocument): Promise<{ saved: boolean; isDuplicate: boolean; document: ResearchDocument }> {
    // Check duplicate by content hash
    const existing = await this.getByHash(doc.contentHash);
    if (existing) {
      return { saved: false, isDuplicate: true, document: existing };
    }

    const d = doc as any;
    const filename = doc.fileName || d.filename || 'unnamed_doc';
    const source = d.source || doc.provider || 'RESEARCH_DOCUMENT';

    const sql = `
      INSERT INTO research_documents (
        document_id, filename, document_type, content_hash, title, source, author,
        published_at, available_from, uploaded_at, processing_status,
        security_associations, metadata, extraction_metadata, page_row_provenance, storage_reference, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      RETURNING *;
    `;
    const params = [
      doc.documentId,
      filename,
      doc.documentType,
      doc.contentHash,
      doc.title,
      source,
      doc.author || null,
      doc.publishedAt ? new Date(doc.publishedAt) : null,
      doc.availableFrom ? new Date(doc.availableFrom) : null,
      doc.uploadedAt ? new Date(doc.uploadedAt) : new Date(),
      doc.processingStatus,
      JSON.stringify(d.securityAssociations || (doc.securityId ? [{ securityId: doc.securityId }] : [])),
      JSON.stringify(doc.metadata || {}),
      JSON.stringify(d.extractionMetadata || {}),
      JSON.stringify(d.pageRowProvenance || []),
      d.storageReference || null
    ];
    const res = await this.client.query(sql, params);
    return { saved: true, isDuplicate: false, document: this.mapRowToDocument(res.rows[0]) };
  }

  public async updateStatus(documentId: string, status: DocumentProcessingStatus, metadata?: any): Promise<boolean> {
    const res = await this.client.query(
      'UPDATE research_documents SET processing_status = $1, metadata = COALESCE($2, metadata), updated_at = NOW() WHERE document_id = $3;',
      [status, metadata ? JSON.stringify(metadata) : null, documentId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM research_documents;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToDocument(row: any): ResearchDocument {
    return {
      documentId: row.document_id,
      fileName: row.filename,
      filename: row.filename,
      documentType: row.document_type,
      contentHash: row.content_hash,
      title: row.title,
      sourceType: 'RESEARCH_DOCUMENT' as const,
      provider: row.source || 'SEC_EDGAR',
      author: row.author || undefined,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : undefined,
      availableFrom: row.available_from ? new Date(row.available_from).toISOString() : undefined,
      uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : new Date().toISOString(),
      processingStatus: row.processing_status,
      epistemicStatus: 'REAL' as const,
      isSimulated: false,
      securityAssociations: typeof row.security_associations === 'string' ? JSON.parse(row.security_associations) : (row.security_associations || []),
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      extractionMetadata: typeof row.extraction_metadata === 'string' ? JSON.parse(row.extraction_metadata) : (row.extraction_metadata || {}),
      pageRowProvenance: typeof row.page_row_provenance === 'string' ? JSON.parse(row.page_row_provenance) : (row.page_row_provenance || []),
      storageReference: row.storage_reference || undefined
    } as unknown as ResearchDocument;
  }
}

// ==========================================
// 3. EVIDENCE REPOSITORY
// ==========================================
export class PostgresEvidenceRepository implements IPersistentEvidenceRepository {
  constructor(private client: PostgresClient) {}

  public async addEvidence(item: EvidenceItem): Promise<boolean> {
    if (!item || !item.evidenceId) return false;

    // Check if evidence already exists
    const existing = await this.getEvidence(item.evidenceId);
    if (existing) {
      return false; // Immutable evidence: no overwriting
    }

    const sql = `
      INSERT INTO evidence_items (
        evidence_id, security_id, source_type, provider, document_id, document_type,
        title, content, structured_value, unit, currency, published_at, filing_date,
        period_start, period_end, retrieved_at, epistemic_status, is_simulated,
        source_reference, metadata, conflict_info, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (evidence_id) DO NOTHING;
    `;
    const params = [
      item.evidenceId,
      item.securityId || null,
      item.sourceType,
      item.provider,
      item.documentId || null,
      item.documentType || null,
      item.title,
      item.content,
      item.structuredValue !== undefined ? JSON.stringify(item.structuredValue) : null,
      item.unit || null,
      item.currency || null,
      item.publishedAt ? new Date(item.publishedAt) : null,
      item.filingDate ? new Date(item.filingDate) : null,
      item.periodStart ? new Date(item.periodStart) : null,
      item.periodEnd ? new Date(item.periodEnd) : null,
      item.retrievedAt ? new Date(item.retrievedAt) : new Date(),
      item.epistemicStatus,
      Boolean(item.isSimulated),
      JSON.stringify(item.sourceReference || {}),
      JSON.stringify(item.metadata || {}),
      (item as any).conflictInfo ? JSON.stringify((item as any).conflictInfo) : null,
      (item as any).version || 1
    ];

    const res = await this.client.query(sql, params);
    return (res.rowCount ?? 0) > 0;
  }

  public async getEvidence(evidenceId: string): Promise<EvidenceItem | null> {
    const res = await this.client.query('SELECT * FROM evidence_items WHERE evidence_id = $1;', [evidenceId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToEvidence(res.rows[0]);
  }

  public async get(evidenceId: string): Promise<EvidenceItem | null> {
    return this.getEvidence(evidenceId);
  }

  public async queryEvidence(filter: EvidenceFilter): Promise<EvidenceItem[]> {
    let sql = 'SELECT * FROM evidence_items WHERE 1=1';
    const params: any[] = [];

    if (filter.securityId) {
      params.push(filter.securityId);
      sql += ` AND security_id = $${params.length}`;
    }
    if (filter.sourceType) {
      const types = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
      params.push(types);
      sql += ` AND source_type = ANY($${params.length})`;
    }
    if (filter.epistemicStatus) {
      const statuses = Array.isArray(filter.epistemicStatus) ? filter.epistemicStatus : [filter.epistemicStatus];
      params.push(statuses);
      sql += ` AND epistemic_status = ANY($${params.length})`;
    }
    if (filter.asOfDate) {
      const asOfStr = typeof filter.asOfDate === 'string' ? filter.asOfDate : (filter.asOfDate as Date).toISOString();
      const targetDate = asOfStr.includes('T') ? new Date(asOfStr) : new Date(`${asOfStr}T23:59:59.999Z`);
      params.push(targetDate);
      sql += ` AND (published_at IS NULL OR published_at <= $${params.length})`;
    }
    sql += ' ORDER BY published_at DESC NULLS LAST, created_at DESC;';

    const res = await this.client.query(sql, params);
    return res.rows.map(r => this.mapRowToEvidence(r));
  }

  public async getHistoricalEvidence(evidenceId: string, asOfDate?: string): Promise<EvidenceItem | null> {
    const item = await this.getEvidence(evidenceId);
    if (!item) return null;
    if (asOfDate && item.publishedAt) {
      const asOfStr = typeof asOfDate === 'string' ? asOfDate : (asOfDate as any).toISOString();
      const targetTime = asOfStr.includes('T') ? new Date(asOfStr).getTime() : new Date(`${asOfStr}T23:59:59.999Z`).getTime();
      if (new Date(item.publishedAt).getTime() > targetTime) {
        return null; // PIT violation: not available at asOfDate
      }
    }
    return item;
  }

  public async getEvidenceLineage(evidenceId: string): Promise<EvidenceItem[]> {
    // In our architecture, evidence versions or root concept relations are queried
    const root = await this.getEvidence(evidenceId);
    if (!root) return [];
    return [root];
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM evidence_items;');
    return Number(res.rows[0]?.total || 0);
  }

  public async getAll(): Promise<EvidenceItem[]> {
    const res = await this.client.query('SELECT * FROM evidence_items ORDER BY created_at DESC;');
    return res.rows.map(r => this.mapRowToEvidence(r));
  }

  private mapRowToEvidence(row: any): EvidenceItem {
    return {
      evidenceId: row.evidence_id,
      securityId: row.security_id || undefined,
      sourceType: row.source_type,
      provider: row.provider,
      documentId: row.document_id || undefined,
      documentType: row.document_type || undefined,
      title: row.title,
      content: row.content,
      structuredValue: row.structured_value !== null ? (typeof row.structured_value === 'string' ? JSON.parse(row.structured_value) : row.structured_value) : undefined,
      unit: row.unit || undefined,
      currency: row.currency || undefined,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : undefined,
      filingDate: row.filing_date ? new Date(row.filing_date).toISOString() : undefined,
      periodStart: row.period_start ? new Date(row.period_start).toISOString() : undefined,
      periodEnd: row.period_end ? new Date(row.period_end).toISOString() : undefined,
      retrievedAt: row.retrieved_at ? new Date(row.retrieved_at).toISOString() : new Date().toISOString(),
      epistemicStatus: row.epistemic_status,
      isSimulated: Boolean(row.is_simulated)
    } as EvidenceItem;
  }
}

// ==========================================
// 4. RESEARCH NOTEBOOK REPOSITORY
// ==========================================
export class PostgresResearchNotebookRepository implements IResearchNotebookRepository {
  constructor(private client: PostgresClient) {}

  public async get(notebookId: string): Promise<ResearchNotebook | null> {
    const res = await this.client.query('SELECT * FROM research_notebooks WHERE notebook_id = $1;', [notebookId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToNotebook(res.rows[0]);
  }

  public async getBySecurityId(securityId: string): Promise<ResearchNotebook | null> {
    const res = await this.client.query('SELECT * FROM research_notebooks WHERE security_id = $1 ORDER BY updated_at DESC LIMIT 1;', [securityId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToNotebook(res.rows[0]);
  }

  public async save(notebook: ResearchNotebook): Promise<ResearchNotebook> {
    const sql = `
      INSERT INTO research_notebooks (
        notebook_id, security_id, query_context, source_registry, evidence_references,
        claims, thesis, bull_case, bear_case, catalysts, risks, evidence_gaps,
        contradictions, invalidation_conditions, quantitative_context, portfolio_context,
        snapshot_references, framework_version, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT (notebook_id) DO UPDATE SET
        source_registry = EXCLUDED.source_registry,
        evidence_references = EXCLUDED.evidence_references,
        claims = EXCLUDED.claims,
        thesis = EXCLUDED.thesis,
        bull_case = EXCLUDED.bull_case,
        bear_case = EXCLUDED.bear_case,
        catalysts = EXCLUDED.catalysts,
        risks = EXCLUDED.risks,
        evidence_gaps = EXCLUDED.evidence_gaps,
        contradictions = EXCLUDED.contradictions,
        invalidation_conditions = EXCLUDED.invalidation_conditions,
        quantitative_context = EXCLUDED.quantitative_context,
        portfolio_context = EXCLUDED.portfolio_context,
        snapshot_references = EXCLUDED.snapshot_references,
        updated_at = NOW()
      RETURNING *;
    `;
    const n = notebook as any;
    const notebookId = n.notebookId || n.id;
    const securityId = n.securityId || n.security?.id || 'unknown';
    const queryContext = n.title || n.queryContext || null;

    const params = [
      notebookId,
      securityId,
      queryContext,
      JSON.stringify(n.sourceRegistry || []),
      JSON.stringify(n.evidenceReferences || []),
      JSON.stringify(n.claims || []),
      JSON.stringify(n.thesis || {}),
      JSON.stringify(n.bullCase || []),
      JSON.stringify(n.bearCase || []),
      JSON.stringify(n.catalysts || []),
      JSON.stringify(n.risks || []),
      JSON.stringify(n.evidenceGaps || []),
      JSON.stringify(n.contradictions || []),
      JSON.stringify(n.invalidationConditions || []),
      JSON.stringify(n.quantitativeContext || {}),
      JSON.stringify(n.portfolioContext || {}),
      JSON.stringify(n.snapshots || []),
      n.frameworkVersion || '1.0.0'
    ];
    const res = await this.client.query(sql, params);
    return this.mapRowToNotebook(res.rows[0]);
  }

  public async getAll(): Promise<ResearchNotebook[]> {
    const res = await this.client.query('SELECT * FROM research_notebooks ORDER BY updated_at DESC;');
    return res.rows.map(r => this.mapRowToNotebook(r));
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM research_notebooks;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToNotebook(row: any): ResearchNotebook {
    const parse = (val: any, def: any) => typeof val === 'string' ? JSON.parse(val) : (val || def);
    return {
      notebookId: row.notebook_id,
      securityId: row.security_id,
      symbol: (row.security_id || '').replace(/^(us|in)-/, '').toUpperCase(),
      title: row.query_context || `Research Notebook ${row.security_id}`,
      description: '',
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      sourceCount: parse(row.source_registry, []).length,
      evidenceCount: parse(row.evidence_references, []).length,
      lastResearchDate: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      researchAsOfDate: null,
      sourceCoverage: {
        availableSources: [],
        missingSources: [],
        unavailableProviders: [],
        latestSourceDate: null,
        oldestSourceDate: null,
        sourceCount: 0,
        evidenceCount: 0,
        status: 'HIGH_EVIDENCE_COVERAGE'
      },
      provenance: {
        provider: 'POSTGRES',
        asOfDate: new Date().toISOString(),
        retrievedAt: new Date().toISOString()
      }
    };
  }
}

// ==========================================
// 5. RESEARCH SNAPSHOT REPOSITORY (IMMUTABLE)
// ==========================================
export class PostgresResearchSnapshotRepository implements IResearchSnapshotRepository {
  constructor(private client: PostgresClient) {}

  public async get(snapshotId: string): Promise<ResearchSnapshot | null> {
    const res = await this.client.query('SELECT * FROM research_snapshots WHERE snapshot_id = $1;', [snapshotId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToSnapshot(res.rows[0]);
  }

  public async getByNotebookId(notebookId: string): Promise<ResearchSnapshot[]> {
    const res = await this.client.query('SELECT * FROM research_snapshots WHERE notebook_id = $1 ORDER BY generated_at ASC;', [notebookId]);
    return res.rows.map(r => this.mapRowToSnapshot(r));
  }

  public async getBySecurityId(securityId: string): Promise<ResearchSnapshot[]> {
    const res = await this.client.query('SELECT * FROM research_snapshots WHERE security_id = $1 ORDER BY generated_at ASC;', [securityId]);
    return res.rows.map(r => this.mapRowToSnapshot(r));
  }

  public async getLatest(securityId: string, asOfDate?: string): Promise<ResearchSnapshot | null> {
    let sql = 'SELECT * FROM research_snapshots WHERE security_id = $1';
    const params: any[] = [securityId];
    if (asOfDate) {
      params.push(asOfDate);
      sql += ` AND as_of_date <= $${params.length}`;
    }
    sql += ' ORDER BY as_of_date DESC, generated_at DESC LIMIT 1;';
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToSnapshot(res.rows[0]);
  }

  public async save(snapshot: ResearchSnapshot): Promise<ResearchSnapshot> {
    // Snapshots are IMMUTABLE: if exists, return existing
    const existing = await this.get(snapshot.snapshotId);
    if (existing) {
      return existing;
    }

    const s = snapshot as any;
    const asOfDate = s.researchAsOfDate || s.asOfDate || new Date().toISOString().split('T')[0];
    const generatedAt = s.createdAt || s.generatedAt ? new Date(s.createdAt || s.generatedAt) : new Date();

    const sql = `
      INSERT INTO research_snapshots (
        snapshot_id, notebook_id, security_id, as_of_date, previous_snapshot_id,
        framework_version, evidence_ids, claim_ids, thesis, bull_case, bear_case,
        catalysts, risks, what_changed, contradictions, evidence_gaps,
        invalidation_conditions, quantitative_context, portfolio_context,
        source_coverage, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (snapshot_id) DO NOTHING
      RETURNING *;
    `;
    const params = [
      s.snapshotId,
      s.notebookId,
      s.securityId,
      asOfDate,
      s.previousSnapshotId || null,
      s.frameworkVersion || '1.0.0',
      JSON.stringify(s.evidenceIds || []),
      JSON.stringify(s.claims || s.claimIds || []),
      typeof s.thesis === 'object' ? JSON.stringify(s.thesis) : (s.thesis || null),
      JSON.stringify(s.bullCase || s.thesis?.bullCase || []),
      JSON.stringify(s.bearCase || s.thesis?.bearCase || []),
      JSON.stringify(s.catalysts || []),
      JSON.stringify(s.risks || []),
      s.whatChanged || s.thesis?.whatChanged ? JSON.stringify(s.whatChanged || s.thesis?.whatChanged) : null,
      JSON.stringify(s.conflicts || s.contradictions || []),
      JSON.stringify(s.evidenceGaps || s.thesis?.evidenceGaps || {}),
      JSON.stringify(s.invalidationConditions || s.thesis?.thesisInvalidationConditions || []),
      JSON.stringify(s.quantitativeContext || s.thesis?.quantitativeContext || {}),
      JSON.stringify(s.portfolioContext || s.thesis?.portfolioContext || {}),
      JSON.stringify(s.sourceCoverage || {}),
      generatedAt
    ];
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) {
      return (await this.get(snapshot.snapshotId))!;
    }
    return this.mapRowToSnapshot(res.rows[0]);
  }

  public async getAll(): Promise<ResearchSnapshot[]> {
    const res = await this.client.query('SELECT * FROM research_snapshots ORDER BY generated_at DESC;');
    return res.rows.map(r => this.mapRowToSnapshot(r));
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM research_snapshots;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToSnapshot(row: any): ResearchSnapshot {
    const parse = (val: any, def: any) => typeof val === 'string' ? JSON.parse(val) : (val || def);
    const rawThesis = parse(row.thesis, null);
    const parsedThesis = typeof rawThesis === 'object' && rawThesis !== null ? rawThesis : {
      executiveThesis: typeof rawThesis === 'string' ? rawThesis : '',
      bullCase: parse(row.bull_case, { summary: '', points: [], evidenceIds: [] }),
      bearCase: parse(row.bear_case, { summary: '', points: [], evidenceIds: [] }),
      catalysts: parse(row.catalysts, []),
      risks: parse(row.risks, []),
      whatChanged: parse(row.what_changed, { status: 'STABLE', hasPriorSnapshot: false, changes: [], newEvidenceCount: 0 }),
      evidenceGaps: parse(row.evidence_gaps, { available: [], missing: [], unavailable: [] }),
      contradictions: parse(row.contradictions, []),
      thesisInvalidationConditions: parse(row.invalidation_conditions, []),
      confidenceCoverage: 'HIGH_EVIDENCE_COVERAGE'
    };

    return {
      snapshotId: row.snapshot_id,
      notebookId: row.notebook_id,
      securityId: row.security_id,
      createdAt: row.generated_at ? new Date(row.generated_at).toISOString() : new Date().toISOString(),
      researchAsOfDate: row.as_of_date,
      evidenceIds: parse(row.evidence_ids, []),
      thesis: parsedThesis,
      claims: parse(row.claim_ids, []),
      risks: parse(row.risks, []),
      catalysts: parse(row.catalysts, []),
      conflicts: parse(row.contradictions, []),
      evidenceGaps: parse(row.evidence_gaps, { available: [], missing: [], unavailable: [] })
    };
  }
}

// ==========================================
// 6. INVESTMENT DECISION REPOSITORY (IMMUTABLE)
// ==========================================
export class PostgresDecisionRepository implements IDecisionRepository {
  constructor(private client: PostgresClient) {}

  public async get(decisionId: string): Promise<InvestmentDecisionAssessment | null> {
    const res = await this.client.query('SELECT * FROM investment_decisions WHERE decision_id = $1;', [decisionId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToDecision(res.rows[0]);
  }

  public async getLatest(securityId: string, asOfDate?: string): Promise<InvestmentDecisionAssessment | null> {
    let sql = 'SELECT * FROM investment_decisions WHERE security_id = $1';
    const params: any[] = [securityId];
    if (asOfDate) {
      params.push(asOfDate);
      sql += ` AND as_of_date <= $${params.length}`;
    }
    sql += ' ORDER BY as_of_date DESC, generated_at DESC LIMIT 1;';
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToDecision(res.rows[0]);
  }

  public async getHistory(securityId: string): Promise<InvestmentDecisionAssessment[]> {
    const res = await this.client.query(
      'SELECT * FROM investment_decisions WHERE security_id = $1 ORDER BY as_of_date DESC, generated_at DESC;',
      [securityId]
    );
    return res.rows.map(r => this.mapRowToDecision(r));
  }

  public async save(decision: InvestmentDecisionAssessment): Promise<InvestmentDecisionAssessment> {
    // Decisions are IMMUTABLE: never overwrite an existing historical record
    const existing = await this.get(decision.decisionId);
    if (existing) {
      return existing;
    }

    const d = decision as any;
    const securityId = d.securityId || d.canonicalSecurity?.id || 'unknown';

    const sql = `
      INSERT INTO investment_decisions (
        decision_id, security_id, as_of_date, composite_score, overall_assessment,
        conviction, dimension_assessments, invalidation_conditions, portfolio_context,
        quant_context, backtest_context, explanation, weights_config, score_inputs,
        data_quality, limitations, is_analytical_only, execution_prohibited,
        framework_version, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (decision_id) DO NOTHING
      RETURNING *;
    `;
    const params = [
      d.decisionId,
      securityId,
      d.asOfDate,
      d.compositeScore,
      d.overallAssessment,
      d.conviction,
      JSON.stringify(d.dimensionAssessments || {}),
      JSON.stringify(d.invalidationConditions || []),
      JSON.stringify(d.portfolioContext || {}),
      JSON.stringify(d.quantitativeContext || d.quantContext || {}),
      JSON.stringify(d.backtestContext || {}),
      JSON.stringify(d.explanation || {}),
      JSON.stringify(d.weightsConfig || {}),
      JSON.stringify(d.scoreInputs || {}),
      JSON.stringify(d.dataQuality || {}),
      JSON.stringify(d.limitations || []),
      true,
      true,
      d.frameworkVersion || '1.0.0',
      d.generatedAt ? new Date(d.generatedAt) : new Date()
    ];
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) {
      return (await this.get(decision.decisionId))!;
    }
    return this.mapRowToDecision(res.rows[0]);
  }

  public async getAll(): Promise<InvestmentDecisionAssessment[]> {
    const res = await this.client.query('SELECT * FROM investment_decisions ORDER BY generated_at DESC;');
    return res.rows.map(r => this.mapRowToDecision(r));
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM investment_decisions;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToDecision(row: any): InvestmentDecisionAssessment {
    const parse = (val: any, def: any) => typeof val === 'string' ? JSON.parse(val) : (val || def);
    const dims = parse(row.dimension_assessments, {});
    return {
      decisionId: row.decision_id,
      securityId: row.security_id,
      canonicalSecurity: {
        id: row.security_id,
        canonicalId: row.security_id,
        ticker: row.security_id.replace(/^(us|in)-/, '').toUpperCase(),
        symbol: row.security_id.replace(/^(us|in)-/, '').toUpperCase(),
        companyName: row.security_id,
        market: row.security_id.startsWith('in-') ? 'INDIA' : 'US',
        exchange: row.security_id.startsWith('in-') ? 'NSE' : 'NASDAQ',
        country: row.security_id.startsWith('in-') ? 'IN' : 'US',
        currency: row.security_id.startsWith('in-') ? 'INR' : 'USD'
      },
      asOfDate: row.as_of_date,
      compositeScore: Number(row.composite_score),
      overallAssessment: row.overall_assessment,
      conviction: row.conviction,
      dimensionAssessments: dims,
      dimensionsList: Object.values(dims),
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
      evidenceCoverage: {
        rating: 'HIGH',
        totalEvidenceCount: 0,
        availableCategories: [],
        missingCategories: [],
        details: ''
      },
      keyDrivers: [],
      counterEvidence: [],
      keyRisks: [],
      catalysts: [],
      thesisStatus: {
        status: 'STABLE',
        summary: ''
      },
      invalidationConditions: parse(row.invalidation_conditions, []),
      portfolioContext: parse(row.portfolio_context, { isHeld: false, marginalRiskRating: 'NOT_HELD', implication: '' }),
      quantitativeContext: parse(row.quant_context, {}),
      valuationContext: {
        status: 'FAIR',
        availableMetrics: [],
        missingMetrics: [],
        rationale: ''
      },
      fundamentalContext: {
        status: 'STABLE',
        availablePeriodsCount: 0,
        summary: ''
      },
      marketContext: {
        currentPrice: 0,
        currency: 'USD',
        trend: 'NEUTRAL',
        provider: 'TWELVE_DATA',
        epistemicStatus: 'REAL'
      },
      dataQuality: parse(row.data_quality, {}),
      explanation: parse(row.explanation, {}),
      limitations: parse(row.limitations, []),
      isAnalyticalOnly: true as const,
      executionProhibited: true as const,
      frameworkVersion: row.framework_version || '1.0.0',
      generatedAt: row.generated_at ? new Date(row.generated_at).toISOString() : new Date().toISOString()
    } as InvestmentDecisionAssessment;
  }
}

// ==========================================
// 7. STRATEGY REPOSITORY
// ==========================================
export class PostgresStrategyRepository implements IStrategyRepository {
  constructor(private client: PostgresClient) {}

  public async get(strategyId: string, _version?: string): Promise<Strategy | null> {
    const res = await this.client.query('SELECT * FROM strategies WHERE strategy_id = $1;', [strategyId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToStrategy(res.rows[0]);
  }

  public async getAll(): Promise<Strategy[]> {
    const res = await this.client.query('SELECT * FROM strategies ORDER BY name ASC;');
    return res.rows.map(r => this.mapRowToStrategy(r));
  }

  public async save(strategy: Strategy): Promise<Strategy> {
    const s = strategy as any;
    const strategyId = s.id || s.strategyId;
    const name = s.title || s.name || strategyId;
    const description = s.description || null;
    const prompt = s.prompt || '';
    const status = s.status || 'AI Generated Strategy';
    const targetUniverse = s.targetUniverse || 'US_EQUITIES';
    const rebalanceFrequency = s.rebalanceFrequency || 'DAILY';

    const sql = `
      INSERT INTO strategies (
        strategy_id, name, description, rules, indicators, position_sizing,
        risk_constraints, portfolio_construction, parameters, version, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (strategy_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        rules = EXCLUDED.rules,
        indicators = EXCLUDED.indicators,
        position_sizing = EXCLUDED.position_sizing,
        risk_constraints = EXCLUDED.risk_constraints,
        portfolio_construction = EXCLUDED.portfolio_construction,
        parameters = EXCLUDED.parameters,
        version = EXCLUDED.version,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      strategyId,
      name,
      description,
      JSON.stringify(s.rules || []),
      JSON.stringify(s.indicators || []),
      JSON.stringify(s.positionSizing || {}),
      JSON.stringify(s.riskConstraints || []),
      JSON.stringify(s.portfolioConstruction || {}),
      JSON.stringify(s.parameters || {}),
      s.version || '1.0.0'
    ];
    const res = await this.client.query(sql, params);
    return this.mapRowToStrategy(res.rows[0]);
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM strategies;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToStrategy(row: any): Strategy {
    const parse = (val: any, def: any) => typeof val === 'string' ? JSON.parse(val) : (val || def);
    return {
      id: row.strategy_id,
      title: row.name,
      description: row.description || '',
      prompt: row.prompt || '',
      status: row.status || 'AI Generated Strategy',
      targetUniverse: row.target_universe || 'US_EQUITIES',
      rebalanceFrequency: row.rebalance_frequency || 'DAILY',
      rules: parse(row.rules, []),
      lastRun: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
    } as Strategy;
  }
}

// ==========================================
// 8. BACKTEST REPOSITORY (IMMUTABLE)
// ==========================================
export class PostgresBacktestRepository implements IBacktestRepository {
  constructor(private client: PostgresClient) {}

  public async get(backtestId: string): Promise<BacktestResult | null> {
    const res = await this.client.query('SELECT * FROM backtests WHERE backtest_id = $1;', [backtestId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToBacktest(res.rows[0]);
  }

  public async getByStrategyId(strategyId: string): Promise<BacktestResult[]> {
    const res = await this.client.query('SELECT * FROM backtests WHERE strategy_id = $1 ORDER BY generated_at DESC;', [strategyId]);
    return res.rows.map(r => this.mapRowToBacktest(r));
  }

  public async getAll(): Promise<BacktestResult[]> {
    const res = await this.client.query('SELECT * FROM backtests ORDER BY generated_at DESC;');
    return res.rows.map(r => this.mapRowToBacktest(r));
  }

  public async save(backtest: BacktestResult): Promise<BacktestResult> {
    // Backtests are IMMUTABLE: never rerun or overwrite
    const b = backtest as any;
    const backtestId = b.backtestId || b.id;
    const existing = await this.get(backtestId);
    if (existing) {
      return existing;
    }

    const strategyId = b.strategyId || b.configuration?.strategyId || 'unknown';
    const strategyVersion = b.strategyVersion || b.configuration?.strategyVersion || '1.0.0';
    const configuration = b.configuration || {};
    const metrics = b.metrics || {
      totalReturn: b.totalReturn,
      totalReturnPct: b.totalReturnPct,
      cagr: b.cagr,
      sharpeRatio: b.sharpeRatio,
      sortinoRatio: b.sortinoRatio,
      maxDrawdown: b.maxDrawdown,
      annualizedVol: b.annualizedVol,
      winRate: b.winRate
    };

    const sql = `
      INSERT INTO backtests (
        backtest_id, strategy_id, strategy_version, configuration, metrics,
        equity_curve, trades, accounting, benchmark, status, data_fingerprint,
        is_analytical_only, execution_prohibited, framework_version, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (backtest_id) DO NOTHING
      RETURNING *;
    `;
    const params = [
      backtestId,
      strategyId,
      strategyVersion,
      JSON.stringify(configuration),
      JSON.stringify(metrics),
      JSON.stringify(b.equityCurve || []),
      JSON.stringify(b.trades || []),
      JSON.stringify(b.accounting || {}),
      JSON.stringify(b.benchmark || {}),
      b.status || 'COMPLETED',
      b.dataFingerprint || null,
      b.isAnalyticalOnly ?? true,
      b.executionProhibited ?? true,
      b.frameworkVersion || '1.0.0',
      b.generatedAt ? new Date(b.generatedAt) : new Date()
    ];
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) {
      return (await this.get(backtestId))!;
    }
    return this.mapRowToBacktest(res.rows[0]);
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM backtests;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToBacktest(row: any): BacktestResult {
    const parse = (val: any, def: any) => typeof val === 'string' ? JSON.parse(val) : (val || def);
    const metrics = parse(row.metrics, {});
    const trades = parse(row.trades, []);
    return {
      id: row.backtest_id,
      backtestId: row.backtest_id,
      strategyId: row.strategy_id,
      strategyVersion: row.strategy_version,
      configuration: parse(row.configuration, {}),
      totalReturn: metrics.totalReturn ?? metrics.totalReturnPct ?? 0,
      totalReturnPct: metrics.totalReturnPct,
      cagr: metrics.cagr ?? 0,
      sharpeRatio: metrics.sharpeRatio ?? 0,
      sortinoRatio: metrics.sortinoRatio ?? 0,
      maxDrawdown: metrics.maxDrawdown ?? 0,
      annualizedVol: metrics.annualizedVol ?? 0,
      winRate: metrics.winRate ?? 0,
      tradesCount: Array.isArray(trades) ? trades.length : 0,
      benchmarkTotalReturn: parse(row.benchmark, {}).totalReturn ?? 0,
      equityCurve: parse(row.equity_curve, []),
      trades: trades,
      status: row.status
    } as BacktestResult;
  }
}

// ==========================================
// 9. WATCHLIST REPOSITORY
// ==========================================
export class PostgresWatchlistRepository implements IWatchlistRepository {
  constructor(private client: PostgresClient) {}

  public async getWatchlist(id = 'default'): Promise<string[]> {
    const res = await this.client.query('SELECT security_ids FROM watchlists WHERE watchlist_id = $1;', [id]);
    if (res.rows.length === 0) return [];
    const val = res.rows[0].security_ids;
    return typeof val === 'string' ? JSON.parse(val) : (val || []);
  }

  public async saveWatchlist(tickers: string[], id = 'default'): Promise<void> {
    const sql = `
      INSERT INTO watchlists (watchlist_id, name, security_ids, updated_at)
      VALUES ($1, 'Default Watchlist', $2, NOW())
      ON CONFLICT (watchlist_id) DO UPDATE SET
        security_ids = EXCLUDED.security_ids,
        updated_at = NOW();
    `;
    await this.client.query(sql, [id, JSON.stringify(tickers)]);
  }

  public async addTicker(ticker: string, id = 'default'): Promise<void> {
    const list = await this.getWatchlist(id);
    if (!list.includes(ticker)) {
      list.push(ticker);
      await this.saveWatchlist(list, id);
    }
  }

  public async removeTicker(ticker: string, id = 'default'): Promise<void> {
    const list = await this.getWatchlist(id);
    const updated = list.filter(t => t !== ticker);
    await this.saveWatchlist(updated, id);
  }
}

// ==========================================
// 10. ALERT REPOSITORY
// ==========================================
export class PostgresAlertRepository implements IAlertRepository {
  constructor(private client: PostgresClient) {}

  public async get(alertId: string): Promise<AlertItem | null> {
    const res = await this.client.query('SELECT * FROM alerts WHERE alert_id = $1;', [alertId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToAlert(res.rows[0]);
  }

  public async getAll(): Promise<AlertItem[]> {
    const res = await this.client.query('SELECT * FROM alerts ORDER BY timestamp DESC;');
    return res.rows.map(r => this.mapRowToAlert(r));
  }

  public async save(alert: AlertItem): Promise<AlertItem> {
    const a = alert as any;
    const message = a.message || a.whatChanged || '';
    const sql = `
      INSERT INTO alerts (alert_id, security_id, ticker, type, severity, title, message, timestamp, is_read)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (alert_id) DO UPDATE SET
        is_read = EXCLUDED.is_read
      RETURNING *;
    `;
    const params = [
      alert.id,
      alert.ticker || null,
      alert.ticker || '',
      alert.type,
      alert.severity,
      alert.title,
      message,
      alert.timestamp,
      alert.read ?? alert.isRead ?? false
    ];
    const res = await this.client.query(sql, params);
    return this.mapRowToAlert(res.rows[0]);
  }

  public async saveMany(alerts: AlertItem[]): Promise<number> {
    let saved = 0;
    for (const a of alerts) {
      await this.save(a);
      saved++;
    }
    return saved;
  }

  public async update(alertId: string, updates: Partial<AlertItem>): Promise<boolean> {
    if (updates.read !== undefined || (updates as any).isRead !== undefined) {
      const readVal = updates.read ?? (updates as any).isRead;
      const res = await this.client.query('UPDATE alerts SET is_read = $1 WHERE alert_id = $2;', [readVal, alertId]);
      return (res.rowCount ?? 0) > 0;
    }
    return false;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM alerts;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToAlert(row: any): AlertItem {
    return {
      id: row.alert_id,
      ticker: row.ticker,
      type: row.type,
      severity: row.severity,
      title: row.title,
      whatChanged: row.message || '',
      whyItMatters: '',
      evidence: { source: 'SYSTEM', filingDate: row.timestamp, confidence: 1.0 },
      timestamp: row.timestamp,
      read: Boolean(row.is_read),
      isRead: Boolean(row.is_read),
      provenanceType: 'FACT'
    };
  }
}

// ==========================================
// 11. PORTFOLIO REPOSITORY
// ==========================================
export class PostgresPortfolioRepository implements IPortfolioRepository {
  constructor(private client: PostgresClient) {}

  public async getPositions(portfolioId = 'default'): Promise<HoldingPosition[]> {
    const res = await this.client.query('SELECT * FROM portfolio_positions WHERE portfolio_id = $1;', [portfolioId]);
    return res.rows.map(r => ({
      ticker: r.ticker,
      shares: Number(r.shares),
      avgCost: Number(r.avg_cost)
    }));
  }

  public async savePositions(positions: HoldingPosition[], portfolioId = 'default'): Promise<void> {
    await this.client.runTransaction(async client => {
      await client.query('DELETE FROM portfolio_positions WHERE portfolio_id = $1;', [portfolioId]);
      for (const pos of positions) {
        await client.query(
          'INSERT INTO portfolio_positions (portfolio_id, ticker, shares, avg_cost, updated_at) VALUES ($1, $2, $3, $4, NOW());',
          [portfolioId, pos.ticker, pos.shares, pos.avgCost]
        );
      }
    });
  }

  public async updatePosition(ticker: string, shares: number, avgCost: number, portfolioId = 'default'): Promise<void> {
    const sql = `
      INSERT INTO portfolio_positions (portfolio_id, ticker, shares, avg_cost, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (portfolio_id, ticker) DO UPDATE SET
        shares = EXCLUDED.shares,
        avg_cost = EXCLUDED.avg_cost,
        updated_at = NOW();
    `;
    await this.client.query(sql, [portfolioId, ticker, shares, avgCost]);
  }
}

// ==========================================
// 12. RESEARCH QUERY REPOSITORY
// ==========================================
export class PostgresResearchQueryRepository implements IResearchQueryRepository {
  constructor(private client: PostgresClient) {}

  public async get(queryId: string): Promise<ResearchQueryItem | null> {
    const res = await this.client.query('SELECT * FROM research_queries WHERE query_id = $1;', [queryId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToQuery(res.rows[0]);
  }

  public async getAll(): Promise<ResearchQueryItem[]> {
    const res = await this.client.query('SELECT * FROM research_queries ORDER BY created_at DESC;');
    return res.rows.map(r => this.mapRowToQuery(r));
  }

  public async save(query: ResearchQueryItem): Promise<ResearchQueryItem> {
    const q = query as any;
    const queryId = q.id || q.queryId;
    const queryString = q.query || '';
    const date = q.date || new Date().toISOString();
    const answerSummary = q.answerSummary || q.generatedAnswer || '';
    const groundedFacts = q.groundedFacts || q.evidenceReferences || [];
    const sources = q.sources || q.securityContext || [];

    const sql = `
      INSERT INTO research_queries (
        query_id, query, intent, security_context, as_of_date, retrieval_metadata,
        evidence_references, generated_answer, framework_version, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (query_id) DO NOTHING
      RETURNING *;
    `;
    const params = [
      queryId,
      queryString,
      q.intent || null,
      JSON.stringify(sources),
      q.asOfDate || null,
      JSON.stringify(q.retrievalMetadata || {}),
      JSON.stringify(groundedFacts),
      answerSummary,
      q.frameworkVersion || '1.0.0'
    ];
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) {
      return (await this.get(queryId))!;
    }
    return this.mapRowToQuery(res.rows[0]);
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM research_queries;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToQuery(row: any): ResearchQueryItem {
    const parse = (val: any, def: any) => typeof val === 'string' ? JSON.parse(val) : (val || def);
    return {
      id: row.query_id,
      query: row.query,
      date: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      answerSummary: row.generated_answer || '',
      groundedFacts: parse(row.evidence_references, []),
      sources: parse(row.security_context, [])
    };
  }
}

// ==========================================
// 13. USER REPOSITORY
// ==========================================
export class PostgresUserRepository implements IUserRepository {
  constructor(private client: PostgresClient) {}

  public async get(userId: string): Promise<User | null> {
    const res = await this.client.query('SELECT * FROM users WHERE user_id = $1 LIMIT 1;', [userId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToUser(res.rows[0]);
  }

  public async getByEmail(normalizedEmail: string): Promise<User | null> {
    const res = await this.client.query('SELECT * FROM users WHERE normalized_email = $1 LIMIT 1;', [normalizedEmail.toLowerCase()]);
    if (res.rows.length === 0) return null;
    return this.mapRowToUser(res.rows[0]);
  }

  public async save(user: User): Promise<User> {
    const sql = `
      INSERT INTO users (user_id, email, normalized_email, password_hash, status, created_at, updated_at, last_login_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        normalized_email = EXCLUDED.normalized_email,
        password_hash = EXCLUDED.password_hash,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at,
        last_login_at = EXCLUDED.last_login_at
      RETURNING *;
    `;
    const params = [
      user.userId,
      user.email,
      user.normalizedEmail,
      user.passwordHash,
      user.status,
      user.createdAt,
      user.updatedAt,
      user.lastLoginAt
    ];
    const res = await this.client.query(sql, params);
    return this.mapRowToUser(res.rows[0]);
  }

  public async update(userId: string, updates: Partial<User>): Promise<boolean> {
    const existing = await this.get(userId);
    if (!existing) return false;
    const merged: User = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await this.save(merged);
    return true;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM users;');
    return Number(res.rows[0]?.total || 0);
  }

  public async getAll(): Promise<User[]> {
    const res = await this.client.query('SELECT * FROM users ORDER BY created_at DESC;');
    return res.rows.map(r => this.mapRowToUser(r));
  }

  private mapRowToUser(row: any): User {
    return {
      userId: row.user_id,
      email: row.email,
      normalizedEmail: row.normalized_email,
      passwordHash: row.password_hash,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    };
  }
}

// ==========================================
// 14. SESSION REPOSITORY
// ==========================================
export class PostgresSessionRepository implements ISessionRepository {
  constructor(private client: PostgresClient) {}

  public async get(sessionId: string): Promise<AuthenticatedSession | null> {
    const res = await this.client.query('SELECT * FROM user_sessions WHERE session_id = $1 AND is_valid = true AND expires_at > NOW() LIMIT 1;', [sessionId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToSession(res.rows[0]);
  }

  public async save(session: AuthenticatedSession): Promise<AuthenticatedSession> {
    const sql = `
      INSERT INTO user_sessions (session_id, user_id, created_at, expires_at, last_activity_at, ip_address, user_agent, is_valid)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (session_id) DO UPDATE SET
        expires_at = EXCLUDED.expires_at,
        last_activity_at = EXCLUDED.last_activity_at,
        is_valid = EXCLUDED.is_valid
      RETURNING *;
    `;
    const params = [
      session.sessionId,
      session.userId,
      session.createdAt,
      session.expiresAt,
      session.lastActivityAt,
      session.ipAddress || null,
      session.userAgent || null,
      session.isValid
    ];
    const res = await this.client.query(sql, params);
    return this.mapRowToSession(res.rows[0]);
  }

  public async invalidate(sessionId: string): Promise<boolean> {
    const res = await this.client.query('UPDATE user_sessions SET is_valid = false WHERE session_id = $1;', [sessionId]);
    return (res.rowCount || 0) > 0;
  }

  public async invalidateAllForUser(userId: string): Promise<number> {
    const res = await this.client.query('UPDATE user_sessions SET is_valid = false WHERE user_id = $1 AND is_valid = true;', [userId]);
    return res.rowCount || 0;
  }

  public async cleanupExpired(): Promise<number> {
    const res = await this.client.query('DELETE FROM user_sessions WHERE is_valid = false OR expires_at <= NOW();');
    return res.rowCount || 0;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM user_sessions WHERE is_valid = true AND expires_at > NOW();');
    return Number(res.rows[0]?.total || 0);
  }

  public async getAll(): Promise<AuthenticatedSession[]> {
    const res = await this.client.query('SELECT * FROM user_sessions ORDER BY created_at DESC;');
    return res.rows.map(r => this.mapRowToSession(r));
  }

  private mapRowToSession(row: any): AuthenticatedSession {
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      lastActivityAt: new Date(row.last_activity_at).toISOString(),
      ipAddress: row.ip_address || undefined,
      userAgent: row.user_agent || undefined,
      isValid: Boolean(row.is_valid)
    };
  }
}

// ==========================================
// 15. INVESTMENT EVENT REPOSITORY (Phase 24)
// ==========================================
export class PostgresInvestmentEventRepository implements IInvestmentEventRepository {
  constructor(private client: PostgresClient) {}

  public async get(eventId: string): Promise<InvestmentEvent | null> {
    const res = await this.client.query('SELECT * FROM investment_events WHERE event_id = $1;', [eventId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToEvent(res.rows[0]);
  }

  public async getBySecurityId(securityId: string, asOfDate?: string): Promise<InvestmentEvent[]> {
    let sql = 'SELECT * FROM investment_events WHERE (security_id = $1 OR UPPER(ticker) = UPPER($1))';
    const params: any[] = [securityId];

    if (asOfDate) {
      const asOfIso = asOfDate.includes('T') ? asOfDate : `${asOfDate}T23:59:59.999Z`;
      sql += ' AND available_at <= $2';
      params.push(asOfIso);
    }

    sql += ' ORDER BY available_at DESC;';
    const res = await this.client.query(sql, params);
    return res.rows.map(r => this.mapRowToEvent(r));
  }

  public async getAll(): Promise<InvestmentEvent[]> {
    const res = await this.client.query('SELECT * FROM investment_events ORDER BY available_at DESC;');
    return res.rows.map(r => this.mapRowToEvent(r));
  }

  public async save(event: InvestmentEvent): Promise<InvestmentEvent> {
    // Immutable: DO NOTHING on conflict
    const query = `
      INSERT INTO investment_events (
        event_id, security_id, ticker, market, exchange, event_type,
        event_date, announced_at, available_at, source_type, source_reference,
        evidence_ids, epistemic_status, is_simulated, title, summary,
        structured_data, previous_state, current_state, affected_dimensions,
        affected_thesis_areas, affected_decision_id, affected_snapshot_id,
        significance, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      ON CONFLICT (event_id) DO NOTHING;
    `;
    const params = [
      event.eventId,
      event.securityId,
      event.ticker || null,
      event.market,
      event.exchange,
      event.eventType,
      event.eventDate,
      event.announcedAt,
      event.availableAt,
      event.sourceType,
      event.sourceReference,
      JSON.stringify(event.evidenceIds || []),
      event.epistemicStatus,
      event.isSimulated,
      event.title,
      event.summary,
      event.structuredData ? JSON.stringify(event.structuredData) : null,
      event.previousState ? JSON.stringify(event.previousState) : null,
      event.currentState ? JSON.stringify(event.currentState) : null,
      event.affectedDimensions ? JSON.stringify(event.affectedDimensions) : null,
      event.affectedThesisAreas ? JSON.stringify(event.affectedThesisAreas) : null,
      event.affectedDecisionId || null,
      event.affectedSnapshotId || null,
      event.significance ? JSON.stringify(event.significance) : null,
      event.createdAt || new Date().toISOString()
    ];

    await this.client.query(query, params);
    const existing = await this.get(event.eventId);
    return existing || event;
  }

  public async saveBatch(events: InvestmentEvent[]): Promise<number> {
    let saved = 0;
    for (const ev of events) {
      await this.save(ev);
      saved++;
    }
    return saved;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) AS total FROM investment_events;');
    return Number(res.rows[0]?.total || 0);
  }

  private mapRowToEvent(row: any): InvestmentEvent {
    return {
      eventId: row.event_id,
      securityId: row.security_id,
      ticker: row.ticker || undefined,
      market: row.market,
      exchange: row.exchange,
      eventType: row.event_type,
      eventDate: row.event_date,
      announcedAt: row.announced_at,
      availableAt: row.available_at,
      sourceType: row.source_type,
      sourceReference: row.source_reference,
      evidenceIds: typeof row.evidence_ids === 'string' ? JSON.parse(row.evidence_ids) : (row.evidence_ids || []),
      epistemicStatus: row.epistemic_status,
      isSimulated: Boolean(row.is_simulated),
      title: row.title,
      summary: row.summary,
      structuredData: typeof row.structured_data === 'string' ? JSON.parse(row.structured_data) : (row.structured_data || undefined),
      previousState: typeof row.previous_state === 'string' ? JSON.parse(row.previous_state) : (row.previous_state || undefined),
      currentState: typeof row.current_state === 'string' ? JSON.parse(row.current_state) : (row.current_state || undefined),
      affectedDimensions: typeof row.affected_dimensions === 'string' ? JSON.parse(row.affected_dimensions) : (row.affected_dimensions || undefined),
      affectedThesisAreas: typeof row.affected_thesis_areas === 'string' ? JSON.parse(row.affected_thesis_areas) : (row.affected_thesis_areas || undefined),
      affectedDecisionId: row.affected_decision_id || undefined,
      affectedSnapshotId: row.affected_snapshot_id || undefined,
      significance: typeof row.significance === 'string' ? JSON.parse(row.significance) : (row.significance || undefined),
      createdAt: new Date(row.created_at).toISOString()
    };
  }
}

// ==========================================
// 16. INVESTMENT MONITOR REPOSITORY
// ==========================================
export class PostgresInvestmentMonitorRepository implements IInvestmentMonitorRepository {
  constructor(private client: PostgresClient) {}

  public async get(monitorId: string): Promise<InvestmentMonitor | null> {
    const res = await this.client.query('SELECT * FROM investment_monitors WHERE monitor_id = $1;', [monitorId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToMonitor(res.rows[0]);
  }

  public async getBySecurityId(securityId: string, userId?: string): Promise<InvestmentMonitor | null> {
    let sql = 'SELECT * FROM investment_monitors WHERE security_id = $1';
    const params: any[] = [securityId];
    if (userId) {
      sql += ' AND (owner_user_id = $2 OR user_id = $2)';
      params.push(userId);
    }
    sql += ' ORDER BY updated_at DESC LIMIT 1;';
    const res = await this.client.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToMonitor(res.rows[0]);
  }

  public async getByUserId(userId: string): Promise<InvestmentMonitor[]> {
    const res = await this.client.query(
      'SELECT * FROM investment_monitors WHERE owner_user_id = $1 OR user_id = $1 ORDER BY updated_at DESC;',
      [userId]
    );
    return res.rows.map(r => this.mapRowToMonitor(r));
  }

  public async getAll(): Promise<InvestmentMonitor[]> {
    const res = await this.client.query('SELECT * FROM investment_monitors ORDER BY updated_at DESC;');
    return res.rows.map(r => this.mapRowToMonitor(r));
  }

  public async save(monitor: InvestmentMonitor): Promise<InvestmentMonitor> {
    const sql = `
      INSERT INTO investment_monitors (
        monitor_id, user_id, owner_user_id, security_id, ticker, company_name, market,
        status, review_cadence, last_reviewed_at, baseline_decision_id, baseline_snapshot_id,
        baseline_event_timestamp, baseline_composite_score, baseline_rating, baseline_thesis_status,
        latest_decision_id, latest_snapshot_id, latest_event_timestamp, latest_composite_score,
        latest_rating, thesis_status, invalidation_status, portfolio_exposure, last_change_summary,
        epistemic_status, is_analytical_only, execution_prohibited, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, true, true, $27, $28
      ) ON CONFLICT (monitor_id) DO UPDATE SET
        status = EXCLUDED.status,
        review_cadence = EXCLUDED.review_cadence,
        last_reviewed_at = EXCLUDED.last_reviewed_at,
        latest_decision_id = EXCLUDED.latest_decision_id,
        latest_snapshot_id = EXCLUDED.latest_snapshot_id,
        latest_event_timestamp = EXCLUDED.latest_event_timestamp,
        latest_composite_score = EXCLUDED.latest_composite_score,
        latest_rating = EXCLUDED.latest_rating,
        thesis_status = EXCLUDED.thesis_status,
        invalidation_status = EXCLUDED.invalidation_status,
        portfolio_exposure = EXCLUDED.portfolio_exposure,
        last_change_summary = EXCLUDED.last_change_summary,
        epistemic_status = EXCLUDED.epistemic_status,
        updated_at = EXCLUDED.updated_at;
    `;
    const params = [
      monitor.monitorId,
      monitor.userId,
      monitor.ownerUserId || monitor.userId,
      monitor.securityId,
      monitor.ticker,
      monitor.companyName,
      monitor.market,
      monitor.status,
      monitor.reviewCadence,
      monitor.lastReviewedAt || null,
      monitor.baselineDecisionId || null,
      monitor.baselineSnapshotId || null,
      monitor.baselineEventTimestamp || null,
      monitor.baselineCompositeScore ?? null,
      monitor.baselineRating || null,
      monitor.baselineThesisStatus || null,
      monitor.latestDecisionId || null,
      monitor.latestSnapshotId || null,
      monitor.latestEventTimestamp || null,
      monitor.latestCompositeScore ?? null,
      monitor.latestRating || null,
      monitor.thesisStatus || null,
      monitor.invalidationStatus,
      JSON.stringify(monitor.portfolioExposure || { hasExposure: false }),
      monitor.lastChangeSummary || null,
      monitor.epistemicStatus || 'REAL',
      monitor.createdAt || new Date().toISOString(),
      monitor.updatedAt || new Date().toISOString()
    ];
    await this.client.query(sql, params);
    return monitor;
  }

  public async update(monitorId: string, updates: Partial<InvestmentMonitor>): Promise<boolean> {
    const existing = await this.get(monitorId);
    if (!existing) return false;
    const merged: InvestmentMonitor = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await this.save(merged);
    return true;
  }

  public async delete(monitorId: string): Promise<boolean> {
    const res = await this.client.query('DELETE FROM investment_monitors WHERE monitor_id = $1;', [monitorId]);
    return (res.rowCount || 0) > 0;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) as cnt FROM investment_monitors;');
    return Number(res.rows[0]?.cnt || 0);
  }

  public async addNote(monitorId: string, note: AnalystReviewNote): Promise<AnalystReviewNote> {
    const sql = `
      INSERT INTO monitor_notes (
        note_id, monitor_id, review_id, user_id, author_name, created_at, content, label, is_immutable
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'USER NOTE', true)
      ON CONFLICT (note_id) DO NOTHING;
    `;
    await this.client.query(sql, [
      note.noteId,
      monitorId,
      note.reviewId || null,
      note.userId,
      note.authorName,
      note.createdAt || new Date().toISOString(),
      note.content
    ]);
    return {
      ...note,
      label: 'USER NOTE',
      isImmutable: true
    };
  }

  public async getNotes(monitorId: string): Promise<AnalystReviewNote[]> {
    const res = await this.client.query(
      'SELECT * FROM monitor_notes WHERE monitor_id = $1 ORDER BY created_at DESC;',
      [monitorId]
    );
    return res.rows.map(r => ({
      noteId: r.note_id,
      monitorId: r.monitor_id,
      reviewId: r.review_id || undefined,
      userId: r.user_id,
      authorName: r.author_name,
      createdAt: new Date(r.created_at).toISOString(),
      content: r.content,
      label: 'USER NOTE' as const,
      isImmutable: true as const
    }));
  }

  private mapRowToMonitor(row: any): InvestmentMonitor {
    return {
      monitorId: row.monitor_id,
      userId: row.user_id,
      ownerUserId: row.owner_user_id || row.user_id,
      securityId: row.security_id,
      ticker: row.ticker,
      companyName: row.company_name,
      market: row.market,
      status: row.status,
      reviewCadence: row.review_cadence,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at).toISOString() : null,
      baselineDecisionId: row.baseline_decision_id || undefined,
      baselineSnapshotId: row.baseline_snapshot_id || undefined,
      baselineEventTimestamp: row.baseline_event_timestamp || undefined,
      baselineCompositeScore: row.baseline_composite_score !== null ? Number(row.baseline_composite_score) : undefined,
      baselineRating: row.baseline_rating || undefined,
      baselineThesisStatus: row.baseline_thesis_status || undefined,
      latestDecisionId: row.latest_decision_id || undefined,
      latestSnapshotId: row.latest_snapshot_id || undefined,
      latestEventTimestamp: row.latest_event_timestamp || undefined,
      latestCompositeScore: row.latest_composite_score !== null ? Number(row.latest_composite_score) : undefined,
      latestRating: row.latest_rating || undefined,
      thesisStatus: row.thesis_status || undefined,
      invalidationStatus: row.invalidation_status || 'ACTIVE_GUARD',
      portfolioExposure: typeof row.portfolio_exposure === 'string' ? JSON.parse(row.portfolio_exposure) : (row.portfolio_exposure || { hasExposure: false }),
      lastChangeSummary: row.last_change_summary || undefined,
      epistemicStatus: row.epistemic_status || 'REAL',
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }
}

// ==========================================
// 17. INVESTMENT MONITOR REVIEW REPOSITORY
// ==========================================
export class PostgresInvestmentMonitorReviewRepository implements IInvestmentMonitorReviewRepository {
  constructor(private client: PostgresClient) {}

  public async get(reviewId: string): Promise<InvestmentMonitorReview | null> {
    const res = await this.client.query('SELECT * FROM monitor_reviews WHERE review_id = $1;', [reviewId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToReview(res.rows[0]);
  }

  public async getByMonitorId(monitorId: string): Promise<InvestmentMonitorReview[]> {
    const res = await this.client.query(
      'SELECT * FROM monitor_reviews WHERE monitor_id = $1 ORDER BY reviewed_at DESC;',
      [monitorId]
    );
    return res.rows.map(r => this.mapRowToReview(r));
  }

  public async getAll(): Promise<InvestmentMonitorReview[]> {
    const res = await this.client.query('SELECT * FROM monitor_reviews ORDER BY reviewed_at DESC;');
    return res.rows.map(r => this.mapRowToReview(r));
  }

  public async save(review: InvestmentMonitorReview): Promise<InvestmentMonitorReview> {
    // IMMUTABLE: check if already exists
    const existing = await this.get(review.reviewId);
    if (existing) return existing;

    const sql = `
      INSERT INTO monitor_reviews (
        review_id, monitor_id, user_id, owner_user_id, security_id, ticker, reviewed_at,
        as_of_date, previous_review_id, previous_decision_id, current_decision_id,
        previous_snapshot_id, current_snapshot_id, change_summary, changes, thesis_health,
        decision_delta, thesis_delta, event_delta, evidence_delta, portfolio_delta,
        quant_delta, valuation_delta, invalidation_delta, data_quality_delta, explanation,
        analyst_notes, epistemic_status, is_analytical_only, execution_prohibited
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
        $27, $28, true, true
      ) ON CONFLICT (review_id) DO NOTHING;
    `;
    const params = [
      review.reviewId,
      review.monitorId,
      review.userId,
      review.ownerUserId || review.userId,
      review.securityId,
      review.ticker,
      review.reviewedAt,
      review.asOfDate,
      review.previousReviewId || null,
      review.previousDecisionId || null,
      review.currentDecisionId || null,
      review.previousSnapshotId || null,
      review.currentSnapshotId || null,
      JSON.stringify(review.changeSummary),
      JSON.stringify(review.changes || []),
      JSON.stringify(review.thesisHealth),
      JSON.stringify(review.decisionDelta || null),
      JSON.stringify(review.thesisDelta || null),
      JSON.stringify(review.eventDelta || null),
      JSON.stringify(review.evidenceDelta || null),
      JSON.stringify(review.portfolioDelta || null),
      JSON.stringify(review.quantDelta || null),
      JSON.stringify(review.valuationDelta || null),
      JSON.stringify(review.invalidationDelta || null),
      JSON.stringify(review.dataQualityDelta || null),
      JSON.stringify(review.explanation),
      JSON.stringify(review.analystNotes || []),
      review.epistemicStatus || 'REAL'
    ];
    await this.client.query(sql, params);
    return review;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) as cnt FROM monitor_reviews;');
    return Number(res.rows[0]?.cnt || 0);
  }

  private mapRowToReview(row: any): InvestmentMonitorReview {
    const parse = (val: any) => (typeof val === 'string' ? JSON.parse(val) : val);
    return {
      reviewId: row.review_id,
      monitorId: row.monitor_id,
      userId: row.user_id,
      ownerUserId: row.owner_user_id || row.user_id,
      securityId: row.security_id,
      ticker: row.ticker,
      reviewedAt: new Date(row.reviewed_at).toISOString(),
      asOfDate: row.as_of_date,
      previousReviewId: row.previous_review_id || undefined,
      previousDecisionId: row.previous_decision_id || undefined,
      currentDecisionId: row.current_decision_id || undefined,
      previousSnapshotId: row.previous_snapshot_id || undefined,
      currentSnapshotId: row.current_snapshot_id || undefined,
      changeSummary: parse(row.change_summary),
      changes: parse(row.changes) || [],
      thesisHealth: parse(row.thesis_health),
      decisionDelta: parse(row.decision_delta) || undefined,
      thesisDelta: parse(row.thesis_delta) || undefined,
      eventDelta: parse(row.event_delta) || undefined,
      evidenceDelta: parse(row.evidence_delta) || undefined,
      portfolioDelta: parse(row.portfolio_delta) || undefined,
      quantDelta: parse(row.quant_delta) || undefined,
      valuationDelta: parse(row.valuation_delta) || undefined,
      invalidationDelta: parse(row.invalidation_delta) || undefined,
      dataQualityDelta: parse(row.data_quality_delta) || undefined,
      explanation: parse(row.explanation),
      analystNotes: parse(row.analyst_notes) || [],
      epistemicStatus: row.epistemic_status,
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }
}

// ==========================================
// 17. MONITORING POLICY REPOSITORY (Phase 27)
// ==========================================
export class PostgresMonitoringPolicyRepository implements IMonitoringPolicyRepository {
  constructor(private client: PostgresClient) {}

  public async get(policyId: string): Promise<MonitoringPolicy | null> {
    const res = await this.client.query('SELECT * FROM monitoring_policies WHERE policy_id = $1;', [policyId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToPolicy(res.rows[0]);
  }

  public async getByUserId(userId: string): Promise<MonitoringPolicy[]> {
    const res = await this.client.query(
      'SELECT * FROM monitoring_policies WHERE user_id = $1 OR owner_user_id = $1 ORDER BY updated_at DESC;',
      [userId]
    );
    return res.rows.map(r => this.mapRowToPolicy(r));
  }

  public async getAll(): Promise<MonitoringPolicy[]> {
    const res = await this.client.query('SELECT * FROM monitoring_policies ORDER BY updated_at DESC;');
    return res.rows.map(r => this.mapRowToPolicy(r));
  }

  public async save(policy: MonitoringPolicy): Promise<MonitoringPolicy> {
    const sql = `
      INSERT INTO monitoring_policies (
        policy_id, user_id, owner_user_id, name, policy_type, enabled, scope,
        monitor_id, security_id, portfolio_id, rules, configuration, min_severity,
        cooldown_minutes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (policy_id) DO UPDATE SET
        name = EXCLUDED.name,
        policy_type = EXCLUDED.policy_type,
        enabled = EXCLUDED.enabled,
        scope = EXCLUDED.scope,
        monitor_id = EXCLUDED.monitor_id,
        security_id = EXCLUDED.security_id,
        portfolio_id = EXCLUDED.portfolio_id,
        rules = EXCLUDED.rules,
        configuration = EXCLUDED.configuration,
        min_severity = EXCLUDED.min_severity,
        cooldown_minutes = EXCLUDED.cooldown_minutes,
        updated_at = EXCLUDED.updated_at;
    `;
    const params = [
      policy.policyId,
      policy.userId,
      policy.ownerUserId || policy.userId,
      policy.name,
      policy.policyType,
      policy.enabled,
      policy.scope,
      policy.monitorId || null,
      policy.securityId || null,
      policy.portfolioId || null,
      JSON.stringify(policy.rules || []),
      JSON.stringify(policy.configuration || {}),
      policy.minSeverity,
      policy.cooldownMinutes,
      policy.createdAt || new Date().toISOString(),
      policy.updatedAt || new Date().toISOString()
    ];
    await this.client.query(sql, params);
    return policy;
  }

  public async update(policyId: string, updates: Partial<MonitoringPolicy>): Promise<boolean> {
    const existing = await this.get(policyId);
    if (!existing) return false;
    const merged: MonitoringPolicy = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    await this.save(merged);
    return true;
  }

  public async delete(policyId: string): Promise<boolean> {
    const res = await this.client.query('DELETE FROM monitoring_policies WHERE policy_id = $1;', [policyId]);
    return (res.rowCount || 0) > 0;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) as cnt FROM monitoring_policies;');
    return Number(res.rows[0]?.cnt || 0);
  }

  private mapRowToPolicy(row: any): MonitoringPolicy {
    const parse = (val: any) => (typeof val === 'string' ? JSON.parse(val) : val);
    return {
      policyId: row.policy_id,
      userId: row.user_id,
      ownerUserId: row.owner_user_id || row.user_id,
      name: row.name,
      policyType: row.policy_type,
      enabled: row.enabled,
      scope: row.scope,
      monitorId: row.monitor_id || undefined,
      securityId: row.security_id || undefined,
      portfolioId: row.portfolio_id || undefined,
      rules: parse(row.rules) || [],
      configuration: parse(row.configuration) || {},
      minSeverity: row.min_severity,
      cooldownMinutes: Number(row.cooldown_minutes),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }
}

// ==========================================
// 18. ALERT ORCHESTRATION REPOSITORY (Phase 27)
// ==========================================
export class PostgresAlertOrchestrationRepository implements IAlertOrchestrationRepository {
  constructor(private client: PostgresClient) {}

  public async get(alertId: string): Promise<AlertInstance | null> {
    const res = await this.client.query('SELECT * FROM orchestrated_alerts WHERE alert_id = $1;', [alertId]);
    if (res.rows.length === 0) return null;
    return this.mapRowToAlert(res.rows[0]);
  }

  public async getByUserId(userId: string, filter?: {
    status?: AlertLifecycleStatus;
    severity?: AlertSeverity;
    monitorId?: string;
    securityId?: string;
    limit?: number;
  }): Promise<AlertInstance[]> {
    let sql = 'SELECT * FROM orchestrated_alerts WHERE (user_id = $1 OR owner_user_id = $1)';
    const params: any[] = [userId];

    if (filter?.status) {
      params.push(filter.status);
      sql += ` AND status = $${params.length}`;
    }
    if (filter?.severity) {
      params.push(filter.severity);
      sql += ` AND severity = $${params.length}`;
    }
    if (filter?.monitorId) {
      params.push(filter.monitorId);
      sql += ` AND monitor_id = $${params.length}`;
    }
    if (filter?.securityId) {
      params.push(filter.securityId);
      sql += ` AND security_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    if (filter?.limit && filter.limit > 0) {
      params.push(filter.limit);
      sql += ` LIMIT $${params.length}`;
    }

    const res = await this.client.query(sql, params);
    return res.rows.map(r => this.mapRowToAlert(r));
  }

  public async getRecentByFingerprint(fingerprint: string): Promise<AlertInstance | null> {
    const res = await this.client.query(
      'SELECT * FROM orchestrated_alerts WHERE fingerprint = $1 ORDER BY created_at DESC LIMIT 1;',
      [fingerprint]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToAlert(res.rows[0]);
  }

  public async getRecentByRule(userId: string, targetId: string, ruleType: AlertRuleType): Promise<AlertInstance | null> {
    const res = await this.client.query(
      `SELECT * FROM orchestrated_alerts 
       WHERE (user_id = $1 OR owner_user_id = $1)
         AND (security_id = $2 OR monitor_id = $2 OR UPPER(symbol) = UPPER($2))
         AND rule_type = $3
       ORDER BY created_at DESC LIMIT 1;`,
      [userId, targetId, ruleType]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToAlert(res.rows[0]);
  }

  public async getAll(): Promise<AlertInstance[]> {
    const res = await this.client.query('SELECT * FROM orchestrated_alerts ORDER BY created_at DESC;');
    return res.rows.map(r => this.mapRowToAlert(r));
  }

  public async save(alert: AlertInstance): Promise<AlertInstance> {
    const sql = `
      INSERT INTO orchestrated_alerts (
        alert_id, candidate_id, policy_id, policy_name, monitor_id, security_id,
        symbol, company_name, portfolio_id, user_id, owner_user_id, rule_type,
        severity, status, title, description, deterministic_explanation,
        contextual_analysis, detected_at, created_at, delivered_at, acknowledged_at,
        resolved_at, dismissed_at, fingerprint, trigger_data, provenance_data,
        review_reference, audit_trail, is_analytical_only, execution_prohibited
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, true, true
      ) ON CONFLICT (alert_id) DO UPDATE SET
        status = EXCLUDED.status,
        delivered_at = EXCLUDED.delivered_at,
        acknowledged_at = EXCLUDED.acknowledged_at,
        resolved_at = EXCLUDED.resolved_at,
        dismissed_at = EXCLUDED.dismissed_at,
        contextual_analysis = EXCLUDED.contextual_analysis,
        audit_trail = EXCLUDED.audit_trail;
    `;
    const params = [
      alert.alertId,
      alert.candidateId,
      alert.policyId || null,
      alert.policyName || null,
      alert.monitorId || null,
      alert.securityId || null,
      alert.symbol || null,
      alert.companyName || null,
      alert.portfolioId || null,
      alert.userId,
      alert.ownerUserId || alert.userId,
      alert.ruleType,
      alert.severity,
      alert.status,
      alert.title,
      alert.description,
      alert.deterministicExplanation,
      alert.contextualAnalysis || null,
      alert.detectedAt,
      alert.createdAt,
      alert.deliveredAt || null,
      alert.acknowledgedAt || null,
      alert.resolvedAt || null,
      alert.dismissedAt || null,
      alert.fingerprint,
      JSON.stringify(alert.trigger),
      JSON.stringify(alert.provenance),
      JSON.stringify(alert.reviewReference || {}),
      JSON.stringify(alert.auditTrail || [])
    ];
    await this.client.query(sql, params);
    return alert;
  }

  public async update(alertId: string, updates: Partial<AlertInstance>): Promise<boolean> {
    const existing = await this.get(alertId);
    if (!existing) return false;
    const merged: AlertInstance = {
      ...existing,
      ...updates
    };
    await this.save(merged);
    return true;
  }

  public async delete(alertId: string): Promise<boolean> {
    const res = await this.client.query('DELETE FROM orchestrated_alerts WHERE alert_id = $1;', [alertId]);
    return (res.rowCount || 0) > 0;
  }

  public async count(): Promise<number> {
    const res = await this.client.query('SELECT COUNT(*) as cnt FROM orchestrated_alerts;');
    return Number(res.rows[0]?.cnt || 0);
  }

  private mapRowToAlert(row: any): AlertInstance {
    const parse = (val: any) => (typeof val === 'string' ? JSON.parse(val) : val);
    return {
      alertId: row.alert_id,
      candidateId: row.candidate_id,
      policyId: row.policy_id || undefined,
      policyName: row.policy_name || undefined,
      monitorId: row.monitor_id || undefined,
      securityId: row.security_id || undefined,
      symbol: row.symbol || undefined,
      companyName: row.company_name || undefined,
      portfolioId: row.portfolio_id || undefined,
      userId: row.user_id,
      ownerUserId: row.owner_user_id || row.user_id,
      ruleType: row.rule_type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      description: row.description,
      deterministicExplanation: row.deterministic_explanation,
      contextualAnalysis: row.contextual_analysis || null,
      detectedAt: new Date(row.detected_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : undefined,
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      dismissedAt: row.dismissed_at ? new Date(row.dismissed_at).toISOString() : null,
      fingerprint: row.fingerprint,
      trigger: parse(row.trigger_data),
      provenance: parse(row.provenance_data),
      reviewReference: parse(row.review_reference),
      auditTrail: parse(row.audit_trail) || [],
      isAnalyticalOnly: true,
      executionProhibited: true
    };
  }
}

// ==========================================
// 19. RESEARCH PRIORITY REPOSITORY
// ==========================================
export class PostgresResearchPriorityRepository implements IResearchPriorityRepository {
  private cache: Map<string, ResearchPrioritySnapshot> = new Map();

  constructor(private client: PostgresClient) {}

  public async getSnapshot(snapshotId: string): Promise<ResearchPrioritySnapshot | null> {
    if (this.cache.has(snapshotId)) {
      return JSON.parse(JSON.stringify(this.cache.get(snapshotId)!));
    }
    return null;
  }

  public async getLatestSnapshot(userId: string, universeType?: string): Promise<ResearchPrioritySnapshot | null> {
    const snaps = Array.from(this.cache.values()).filter(s => {
      if (s.userId !== userId) return false;
      if (universeType && universeType !== 'ALL' && s.universeType !== universeType) return false;
      return true;
    });
    if (snaps.length === 0) return null;
    snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(snaps[0]));
  }

  public async getSnapshotsByUserId(userId: string): Promise<ResearchPrioritySnapshot[]> {
    const snaps = Array.from(this.cache.values()).filter(s => s.userId === userId);
    snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(snaps));
  }

  public async saveSnapshot(snapshot: ResearchPrioritySnapshot): Promise<ResearchPrioritySnapshot> {
    const cloned = JSON.parse(JSON.stringify(snapshot));
    this.cache.set(snapshot.snapshotId, cloned);
    return cloned;
  }

  public async getAll(): Promise<ResearchPrioritySnapshot[]> {
    return Array.from(this.cache.values()).map(s => JSON.parse(JSON.stringify(s)));
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

// ==========================================
// 20. CROSS-INVESTMENT SNAPSHOT REPOSITORY (PHASE 30)
// ==========================================
export class PostgresCrossInvestmentSnapshotRepository implements ICrossInvestmentSnapshotRepository {
  private cache: Map<string, CrossInvestmentSnapshot> = new Map();

  constructor(private client: PostgresClient) {}

  public async getSnapshot(snapshotId: string): Promise<CrossInvestmentSnapshot | null> {
    if (this.cache.has(snapshotId)) {
      return JSON.parse(JSON.stringify(this.cache.get(snapshotId)!));
    }
    return null;
  }

  public async getSnapshotsByUserId(userId: string): Promise<CrossInvestmentSnapshot[]> {
    const snaps = Array.from(this.cache.values()).filter(s => s.userId === userId);
    snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(snaps));
  }

  public async saveSnapshot(snapshot: CrossInvestmentSnapshot): Promise<CrossInvestmentSnapshot> {
    if (this.cache.has(snapshot.snapshotId)) {
      throw new Error(`Snapshot with ID "${snapshot.snapshotId}" already exists. Historical relationship snapshots are strictly immutable.`);
    }
    const cloned = JSON.parse(JSON.stringify(snapshot));
    this.cache.set(snapshot.snapshotId, cloned);
    return cloned;
  }

  public async getAll(): Promise<CrossInvestmentSnapshot[]> {
    return Array.from(this.cache.values()).map(s => JSON.parse(JSON.stringify(s)));
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

// ==========================================
// 21. PORTFOLIO SCENARIO REPOSITORY (PHASE 31)
// ==========================================
export class PostgresPortfolioScenarioRepository implements IPortfolioScenarioRepository {
  private cache: Map<string, PortfolioScenarioSnapshot> = new Map();

  constructor(private client: PostgresClient) {}

  public async getSnapshot(snapshotId: string): Promise<PortfolioScenarioSnapshot | null> {
    if (this.cache.has(snapshotId)) {
      return JSON.parse(JSON.stringify(this.cache.get(snapshotId)!));
    }
    return null;
  }

  public async getSnapshotsByUserId(userId: string): Promise<PortfolioScenarioSnapshot[]> {
    const snaps = Array.from(this.cache.values()).filter(s => s.userId === userId);
    snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(snaps));
  }

  public async saveSnapshot(snapshot: PortfolioScenarioSnapshot): Promise<PortfolioScenarioSnapshot> {
    if (this.cache.has(snapshot.snapshotId)) {
      throw new Error(`Scenario snapshot with ID "${snapshot.snapshotId}" already exists. Historical scenario snapshots are strictly immutable.`);
    }
    const cloned = JSON.parse(JSON.stringify(snapshot));
    this.cache.set(snapshot.snapshotId, cloned);
    return cloned;
  }

  public async getAll(): Promise<PortfolioScenarioSnapshot[]> {
    return Array.from(this.cache.values()).map(s => JSON.parse(JSON.stringify(s)));
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

// ==========================================
// 22. COUNTERFACTUAL REPOSITORY (PHASE 32)
// ==========================================
export class PostgresCounterfactualRepository implements ICounterfactualRepository {
  private cache: Map<string, CounterfactualSnapshot> = new Map();

  constructor(private client: PostgresClient) {}

  public async getSnapshot(snapshotId: string): Promise<CounterfactualSnapshot | null> {
    if (this.cache.has(snapshotId)) {
      return JSON.parse(JSON.stringify(this.cache.get(snapshotId)!));
    }
    return null;
  }

  public async getSnapshotsByUserId(userId: string): Promise<CounterfactualSnapshot[]> {
    const snaps = Array.from(this.cache.values()).filter(s => s.userId === userId);
    snaps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(snaps));
  }

  public async saveSnapshot(snapshot: CounterfactualSnapshot): Promise<CounterfactualSnapshot> {
    if (this.cache.has(snapshot.snapshotId)) {
      throw new Error(`Counterfactual snapshot with ID "${snapshot.snapshotId}" already exists. Historical counterfactual snapshots are strictly immutable.`);
    }
    const cloned = JSON.parse(JSON.stringify(snapshot));
    this.cache.set(snapshot.snapshotId, cloned);
    return cloned;
  }

  public async getAll(): Promise<CounterfactualSnapshot[]> {
    return Array.from(this.cache.values()).map(s => JSON.parse(JSON.stringify(s)));
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresResearchMemoryRepository implements IResearchMemoryRepository {
  private cache: Map<string, ResearchMemoryEntry> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<ResearchMemoryEntry | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getAll(filter?: {
    securityId?: string;
    userId?: string;
    asOfDate?: string;
    memoryType?: ResearchMemoryType;
    status?: ResearchMemoryStatus;
  }): Promise<ResearchMemoryEntry[]> {
    let list = Array.from(this.cache.values());

    if (filter?.securityId) {
      const target = filter.securityId.toLowerCase();
      list = list.filter(m =>
        m.securityId.toLowerCase() === target ||
        m.ticker.toLowerCase() === target ||
        m.securityId.toLowerCase().includes(target)
      );
    }

    if (filter?.userId) {
      list = list.filter(m => m.userId === filter.userId);
    }

    if (filter?.asOfDate) {
      list = list.filter(m => m.asOfDate <= filter.asOfDate!);
    }

    if (filter?.memoryType) {
      list = list.filter(m => m.memoryType === filter.memoryType);
    }

    if (filter?.status) {
      list = list.filter(m => m.status === filter.status);
    }

    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) {
        return b.asOfDate.localeCompare(a.asOfDate);
      }
      if (b.createdAt !== a.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.id.localeCompare(a.id);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(entry: ResearchMemoryEntry): Promise<ResearchMemoryEntry> {
    if (this.cache.has(entry.id)) {
      throw new Error(`Research memory with ID "${entry.id}" already exists. Historical research memories are strictly immutable.`);
    }
    const cloned = JSON.parse(JSON.stringify(entry));
    this.cache.set(entry.id, cloned);
    return cloned;
  }

  public async update(entry: ResearchMemoryEntry): Promise<ResearchMemoryEntry> {
    if (!this.cache.has(entry.id)) {
      throw new Error(`Research memory with ID "${entry.id}" not found.`);
    }
    const cloned = JSON.parse(JSON.stringify(entry));
    this.cache.set(entry.id, cloned);
    return cloned;
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresResearchQuestionRepository implements IResearchQuestionRepository {
  private cache: Map<string, ResearchQuestionEntry> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<ResearchQuestionEntry | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getAll(filter?: {
    securityId?: string;
    userId?: string;
    status?: ResearchQuestionStatus;
    asOfDate?: string;
  }): Promise<ResearchQuestionEntry[]> {
    let list = Array.from(this.cache.values());

    if (filter?.securityId) {
      const target = filter.securityId.toLowerCase();
      list = list.filter(q =>
        q.securityId.toLowerCase() === target ||
        q.ticker.toLowerCase() === target ||
        q.securityId.toLowerCase().includes(target)
      );
    }

    if (filter?.userId) {
      list = list.filter(q => q.userId === filter.userId);
    }

    if (filter?.status) {
      list = list.filter(q => q.status === filter.status);
    }

    if (filter?.asOfDate) {
      list = list.filter(q => q.asOfDate <= filter.asOfDate!);
    }

    list.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      if (b.createdAt !== a.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.id.localeCompare(a.id);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(question: ResearchQuestionEntry): Promise<ResearchQuestionEntry> {
    const cloned = JSON.parse(JSON.stringify(question));
    this.cache.set(question.id, cloned);
    return cloned;
  }

  public async update(question: ResearchQuestionEntry): Promise<ResearchQuestionEntry> {
    if (!this.cache.has(question.id)) {
      throw new Error(`Research question with ID "${question.id}" not found.`);
    }
    const cloned = JSON.parse(JSON.stringify(question));
    this.cache.set(question.id, cloned);
    return cloned;
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresResearchGapRepository implements IResearchGapRepository {
  private cache: Map<string, ResearchGapRecord> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<ResearchGapRecord | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getAll(filter?: {
    securityId?: string;
    userId?: string;
    status?: ResearchGapStatus;
    asOfDate?: string;
    gapType?: ResearchGapType;
  }): Promise<ResearchGapRecord[]> {
    let list = Array.from(this.cache.values());

    if (filter?.securityId) {
      const target = filter.securityId.toLowerCase();
      list = list.filter(g =>
        g.securityId.toLowerCase() === target ||
        g.ticker.toLowerCase() === target ||
        g.securityId.toLowerCase().includes(target)
      );
    }

    if (filter?.userId) {
      list = list.filter(g => g.userId === filter.userId || g.tenantId === filter.userId);
    }

    if (filter?.status) {
      list = list.filter(g => g.status === filter.status);
    }

    if (filter?.gapType) {
      list = list.filter(g => g.gapType === filter.gapType);
    }

    if (filter?.asOfDate) {
      list = list.filter(g => g.asOfDate <= filter.asOfDate!);
    }

    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) {
        return b.asOfDate.localeCompare(a.asOfDate);
      }
      if (b.createdAt !== a.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.gapId.localeCompare(a.gapId);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(gap: ResearchGapRecord): Promise<ResearchGapRecord> {
    if (this.cache.has(gap.gapId)) {
      throw new Error(`Research gap with ID "${gap.gapId}" already exists. Overwrite prohibited.`);
    }
    const cloned = JSON.parse(JSON.stringify(gap));
    this.cache.set(gap.gapId, cloned);
    return cloned;
  }

  public async update(gap: ResearchGapRecord): Promise<ResearchGapRecord> {
    if (!this.cache.has(gap.gapId)) {
      throw new Error(`Research gap with ID "${gap.gapId}" not found.`);
    }
    const cloned = JSON.parse(JSON.stringify(gap));
    this.cache.set(gap.gapId, cloned);
    return cloned;
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresInvestigationPlanRepository implements IInvestigationPlanRepository {
  private cache: Map<string, InvestigationPlan> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<InvestigationPlan | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getAll(filter?: {
    securityId?: string;
    userId?: string;
    status?: InvestigationPlanStatus;
    asOfDate?: string;
  }): Promise<InvestigationPlan[]> {
    let list = Array.from(this.cache.values());

    if (filter?.securityId) {
      const target = filter.securityId.toLowerCase();
      list = list.filter(p =>
        p.securityId.toLowerCase() === target ||
        p.ticker.toLowerCase() === target ||
        p.securityId.toLowerCase().includes(target)
      );
    }

    if (filter?.userId) {
      list = list.filter(p => p.userId === filter.userId || p.tenantId === filter.userId);
    }

    if (filter?.status) {
      list = list.filter(p => p.status === filter.status);
    }

    if (filter?.asOfDate) {
      list = list.filter(p => p.asOfDate <= filter.asOfDate!);
    }

    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) {
        return b.asOfDate.localeCompare(a.asOfDate);
      }
      if (b.createdAt !== a.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.planId.localeCompare(a.planId);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(plan: InvestigationPlan): Promise<InvestigationPlan> {
    if (this.cache.has(plan.planId)) {
      throw new Error(`Investigation plan with ID "${plan.planId}" already exists. Overwrite prohibited.`);
    }
    const cloned = JSON.parse(JSON.stringify(plan));
    this.cache.set(plan.planId, cloned);
    return cloned;
  }

  public async update(plan: InvestigationPlan): Promise<InvestigationPlan> {
    if (!this.cache.has(plan.planId)) {
      throw new Error(`Investigation plan with ID "${plan.planId}" not found.`);
    }
    const cloned = JSON.parse(JSON.stringify(plan));
    this.cache.set(plan.planId, cloned);
    return cloned;
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresInvestigationAuditRepository implements IInvestigationAuditRepository {
  private cache: Map<string, InvestigationAuditRecord> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<InvestigationAuditRecord | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getAll(filter?: {
    targetId?: string;
    tenantId?: string;
    targetType?: string;
    asOfDate?: string;
  }): Promise<InvestigationAuditRecord[]> {
    let list = Array.from(this.cache.values());

    if (filter?.targetId) {
      list = list.filter(a => a.targetId === filter.targetId);
    }

    if (filter?.tenantId) {
      list = list.filter(a => a.tenantId === filter.tenantId);
    }

    if (filter?.targetType) {
      list = list.filter(a => a.targetType === filter.targetType);
    }

    if (filter?.asOfDate) {
      list = list.filter(a => a.asOfDate <= filter.asOfDate!);
    }

    list.sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return b.timestamp.localeCompare(a.timestamp);
      }
      return b.auditId.localeCompare(a.auditId);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(audit: InvestigationAuditRecord): Promise<InvestigationAuditRecord> {
    if (this.cache.has(audit.auditId)) {
      throw new Error(`Investigation audit record with ID "${audit.auditId}" already exists. Append-only enforced.`);
    }
    const cloned = JSON.parse(JSON.stringify(audit));
    this.cache.set(audit.auditId, cloned);
    return cloned;
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresEvidenceCollectionRepository implements IEvidenceCollectionRepository {
  private cache: Map<string, EvidenceCollectionRecord> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<EvidenceCollectionRecord | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getBySourceFingerprint(fingerprint: string, tenantId?: string): Promise<EvidenceCollectionRecord | null> {
    const all = Array.from(this.cache.values());
    const match = all.find(r =>
      r.sourceFingerprint === fingerprint &&
      (!tenantId || r.tenantId === tenantId || r.userId === tenantId) &&
      r.collectionStatus !== 'SUPERSEDED'
    );
    return match ? JSON.parse(JSON.stringify(match)) : null;
  }

  public async getAll(filter?: {
    securityId?: string;
    userId?: string;
    tenantId?: string;
    planId?: string;
    taskId?: string;
    questionId?: string;
    gapId?: string;
    status?: CollectionStatus;
    sourceType?: EvidenceSourceClass;
    epistemicStatus?: EpistemicStatus;
    asOfDate?: string;
  }): Promise<EvidenceCollectionRecord[]> {
    let list = Array.from(this.cache.values());

    if (filter?.securityId) {
      const target = filter.securityId.toLowerCase();
      list = list.filter(r =>
        r.securityId.toLowerCase() === target ||
        r.ticker.toLowerCase() === target ||
        r.securityId.toLowerCase().includes(target)
      );
    }

    const effectiveTenant = filter?.tenantId || filter?.userId;
    if (effectiveTenant) {
      list = list.filter(r => r.tenantId === effectiveTenant || r.userId === effectiveTenant);
    }

    if (filter?.planId) {
      list = list.filter(r => r.planId === filter.planId);
    }

    if (filter?.taskId) {
      list = list.filter(r => r.taskId === filter.taskId);
    }

    if (filter?.questionId) {
      list = list.filter(r => r.questionId === filter.questionId);
    }

    if (filter?.gapId) {
      list = list.filter(r => r.gapId === filter.gapId);
    }

    if (filter?.status) {
      list = list.filter(r => r.collectionStatus === filter.status);
    }

    if (filter?.sourceType) {
      list = list.filter(r => r.sourceType === filter.sourceType);
    }

    if (filter?.epistemicStatus) {
      list = list.filter(r => r.epistemicStatus === filter.epistemicStatus);
    }

    if (filter?.asOfDate) {
      list = list.filter(r => r.asOfDate <= filter.asOfDate! && r.availableAt <= filter.asOfDate!);
    }

    const statusPriority: Record<CollectionStatus, number> = {
      VALIDATED: 0,
      COLLECTED: 1,
      AVAILABLE: 2,
      REQUESTED: 3,
      DISCOVERED: 4,
      CONFLICTING: 5,
      STALE: 6,
      UNAVAILABLE: 7,
      REJECTED: 8,
      SUPERSEDED: 9
    };

    list.sort((a, b) => {
      const prioA = statusPriority[a.collectionStatus] ?? 99;
      const prioB = statusPriority[b.collectionStatus] ?? 99;
      if (prioA !== prioB) return prioA - prioB;
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.collectedAt !== a.collectedAt) return b.collectedAt.localeCompare(a.collectedAt);
      return a.collectionId.localeCompare(b.collectionId);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(record: EvidenceCollectionRecord): Promise<EvidenceCollectionRecord> {
    if (this.cache.has(record.collectionId)) {
      throw new Error(`Evidence collection record with ID "${record.collectionId}" already exists. Overwrite prohibited.`);
    }
    const cloned = JSON.parse(JSON.stringify(record));
    this.cache.set(record.collectionId, cloned);
    return cloned;
  }

  public async update(record: EvidenceCollectionRecord): Promise<EvidenceCollectionRecord> {
    if (!this.cache.has(record.collectionId)) {
      throw new Error(`Evidence collection record with ID "${record.collectionId}" not found.`);
    }
    const cloned = JSON.parse(JSON.stringify(record));
    this.cache.set(record.collectionId, cloned);
    return cloned;
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresEvidenceRelationshipRepository implements IEvidenceRelationshipRepository {
  private cache: Map<string, EvidenceResearchRelationship> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<EvidenceResearchRelationship | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getAll(filter?: {
    sourceId?: string;
    targetId?: string;
    targetType?: string;
    relationshipType?: EvidenceRelationshipType;
    tenantId?: string;
    asOfDate?: string;
  }): Promise<EvidenceResearchRelationship[]> {
    let list = Array.from(this.cache.values());

    if (filter?.sourceId) {
      list = list.filter(r => r.sourceId === filter.sourceId);
    }
    if (filter?.targetId) {
      list = list.filter(r => r.targetId === filter.targetId);
    }
    if (filter?.targetType) {
      list = list.filter(r => r.targetType === filter.targetType);
    }
    if (filter?.relationshipType) {
      list = list.filter(r => r.relationshipType === filter.relationshipType);
    }
    if (filter?.tenantId) {
      list = list.filter(r => r.tenantId === filter.tenantId);
    }
    if (filter?.asOfDate) {
      list = list.filter(r => r.asOfDate <= filter.asOfDate!);
    }

    list.sort((a, b) => {
      if (b.asOfDate !== a.asOfDate) return b.asOfDate.localeCompare(a.asOfDate);
      if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
      return a.relationshipId.localeCompare(b.relationshipId);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(rel: EvidenceResearchRelationship): Promise<EvidenceResearchRelationship> {
    const cloned = JSON.parse(JSON.stringify(rel));
    this.cache.set(rel.relationshipId, cloned);
    return cloned;
  }

  public async delete(relationshipId: string): Promise<boolean> {
    return this.cache.delete(relationshipId);
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}

export class PostgresEvidenceAuditRepository implements IEvidenceAuditRepository {
  private cache: Map<string, EvidenceAuditRecord> = new Map();

  constructor(private client: PostgresClient) {}

  public async get(id: string): Promise<EvidenceAuditRecord | null> {
    if (this.cache.has(id)) {
      return JSON.parse(JSON.stringify(this.cache.get(id)!));
    }
    return null;
  }

  public async getAll(filter?: {
    collectionId?: string;
    tenantId?: string;
    action?: EvidenceAuditAction;
    asOfDate?: string;
  }): Promise<EvidenceAuditRecord[]> {
    let list = Array.from(this.cache.values());

    if (filter?.collectionId) {
      list = list.filter(a => a.collectionId === filter.collectionId);
    }
    if (filter?.tenantId) {
      list = list.filter(a => a.tenantId === filter.tenantId);
    }
    if (filter?.action) {
      list = list.filter(a => a.action === filter.action);
    }
    if (filter?.asOfDate) {
      list = list.filter(a => a.asOfDate <= filter.asOfDate!);
    }

    list.sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return b.timestamp.localeCompare(a.timestamp);
      }
      return b.auditId.localeCompare(a.auditId);
    });

    return JSON.parse(JSON.stringify(list));
  }

  public async save(audit: EvidenceAuditRecord): Promise<EvidenceAuditRecord> {
    if (this.cache.has(audit.auditId)) {
      throw new Error(`Evidence audit record with ID "${audit.auditId}" already exists. Append-only enforced.`);
    }
    const cloned = JSON.parse(JSON.stringify(audit));
    this.cache.set(audit.auditId, cloned);
    return cloned;
  }

  public async count(): Promise<number> {
    return this.cache.size;
  }
}