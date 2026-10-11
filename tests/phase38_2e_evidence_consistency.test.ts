/**
 * Phase 38.2E — Evidence Sharing and Repository Consistency: regression suite
 *
 * Categories (reported separately): [DET] deterministic in-process; [SIM] pg-mem simulated database (an emulator, NOT
 * PostgreSQL); [REAL] real PostgreSQL integration — none exist, none run.
 *
 * Isolation: temp-dir development adapter installed before application modules load; provider adapters stubbed; no
 * network, no database. data/persistence/store.json is hashed before/after.
 */
process.env.MARKET_THESIS_DISABLE_AUTOSTART = '1';
process.env.NODE_ENV = 'test';
for (const k of ['DATABASE_URL', 'GEMINI_API_KEY', 'TWELVE_DATA_API_KEY', 'FYERS_APP_ID', 'FYERS_SECRET_KEY', 'FYERS_ACCESS_TOKEN', 'TRUEDATA_USERNAME', 'TRUEDATA_PASSWORD', 'FINMAGINE_API_KEY', 'PERSISTENCE_MODE', 'PERSISTENCE_STRICT', 'ADMIN_USER_IDS']) process.env[k] = '';

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

type Cat = 'DET' | 'SIM';
const tally = { DET: { p: 0, f: 0 }, SIM: { p: 0, f: 0 } };
const failures: string[] = [];
function check(cat: Cat, c: unknown, name: string, detail?: unknown) {
  if (c) { tally[cat].p++; console.log(`  ✓ [${cat}] ${name}`); }
  else { tally[cat].f++; failures.push(`[${cat}] ${name}`); console.error(`  ✗ [${cat}] FAILED: ${name}${detail !== undefined ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
}
const section = (t: string) => console.log(`\n--- ${t} ---`);
const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const realStore = path.resolve(process.cwd(), 'data', 'persistence', 'store.json');
  const before = fs.existsSync(realStore) ? sha(realStore) : 'absent';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase38_2e-'));
  const mkDev = async (name: string) => { const { DevelopmentPersistenceAdapter } = await import('../server/persistence/devAdapter/developmentPersistenceAdapter'); const a = new DevelopmentPersistenceAdapter(path.join(tmp, name)); await a.initialize(); return a; };

  const { persistenceManager } = await import('../server/persistence/persistenceManager');
  persistenceManager.setAdapter(await mkDev('main'));

  const { EvidenceRepository, evidenceRepository } = await import('../server/services/evidence/evidenceRepository');
  const { evidenceService, classifyProviderEvidence } = await import('../server/services/evidence/evidenceService');
  const { DecisionIntelligenceService } = await import('../server/services/decision/decisionIntelligenceService');
  const { financialDataService } = await import('../server/services/financialDataService');
  const { canRead } = await import('../server/auth/accessPolicy');
  const { metadataEvidenceAdapter } = await import('../server/services/evidence/adapters/metadataEvidenceAdapter');
  const { marketEvidenceAdapter } = await import('../server/services/evidence/adapters/marketEvidenceAdapter');
  const { secEvidenceAdapter } = await import('../server/services/evidence/adapters/secEvidenceAdapter');
  const { finmagineEvidenceAdapter } = await import('../server/services/evidence/adapters/finmagineEvidenceAdapter');
  const { researchNotebookService } = await import('../server/services/research/notebookService');
  const { investmentEventEngine } = await import('../server/services/events/investmentEventEngine');

  const A = 'usr_a_2e';
  const B = 'usr_b_2e';
  const SEC = 'us-aapl';
  const ev = (id: string, extra: Record<string, unknown> = {}) => ({
    evidenceId: id, securityId: SEC, sourceType: 'SEC_EDGAR', provider: 'SEC EDGAR', title: `T ${id}`, content: 'same provider content',
    structuredValue: { metric: 'Revenues', value: 123 }, publishedAt: '2024-03-01T10:00:00.000Z', retrievedAt: '2024-03-02T10:00:00.000Z',
    epistemicStatus: 'REAL', isSimulated: false, sourceReference: { accessionNumber: '0001' }, ...extra
  }) as any;

  // =====================================================================================
  section('E1. A matching provider fetch never promotes or modifies existing evidence');
  // =====================================================================================
  {
    const repo = new EvidenceRepository();
    const legacy = ev('ev-sec-fact-x');                                   // ownerless + unclassified (hydrated legacy)
    repo.addEvidence(legacy);
    const legacyBefore = JSON.parse(JSON.stringify(repo.getEvidence('ev-sec-fact-x')));
    const fresh = ev('ev-sec-fact-x', { visibility: 'SHARED' });          // exact same id & content, now classified SHARED
    const added = repo.addEvidence(fresh);
    const legacyAfter = repo.getEvidence('ev-sec-fact-x');
    check('DET', added === true, 'the fresh SHARED fetch is stored (it is not swallowed as a duplicate of the legacy record)');
    check('DET', same(legacyBefore, legacyAfter) && !legacyAfter!.visibility && !(legacyAfter!.metadata as any)?.classifiedBy, 'legacy record is byte-identical afterwards: still unclassified, no classifiedBy marker, no conflict flag');
    check('DET', !canRead(legacyAfter as any, A) && !canRead(legacyAfter as any, undefined), 'legacy record is still restricted for every principal');
    const all = repo.getAll();
    const revision = all.find(e => e.evidenceId !== 'ev-sec-fact-x');
    check('DET', all.length === 2 && !!revision && revision.visibility === 'SHARED' && revision.evidenceId.startsWith('ev-sec-fact-x~') && (revision.metadata as any)?.requestedEvidenceId === 'ev-sec-fact-x', 'the fresh evidence lives under a domain-derived revision id and records the id it requested', all.map(e => e.evidenceId));
    check('DET', revision!.retrievedAt === fresh.retrievedAt && revision!.publishedAt === fresh.publishedAt, 'fresh evidence keeps its own provenance timestamps');
    check('DET', !!(repo.queryEvidenceForOwner(A, { securityId: SEC }).find(e => e.evidenceId === revision!.evidenceId)) && !repo.queryEvidenceForOwner(A, { securityId: SEC }).some(e => e.evidenceId === 'ev-sec-fact-x'), 'readers see the new SHARED record but never the legacy one');

    // repeated provider fetches do not duplicate
    for (let i = 0; i < 3; i++) check('DET', repo.addEvidence(ev('ev-sec-fact-x', { visibility: 'SHARED' })) === false, `repeated identical fetch #${i + 1} is a duplicate (not stored again)`);
    check('DET', repo.getAll().length === 2, 'repository still holds exactly 2 records after repeated fetches');
    check('DET', same(legacyBefore, repo.getEvidence('ev-sec-fact-x')), 'legacy record still unchanged after repeated fetches');
  }
  {
    // another tenant's private evidence
    const repo = new EvidenceRepository();
    repo.addEvidence(ev('ev-clash', { ownerUserId: B, userId: B, visibility: 'PRIVATE', structuredValue: { metric: 'Revenues', value: 999 } }));
    const bBefore = JSON.parse(JSON.stringify(repo.getEvidence('ev-clash')));
    repo.addEvidence(ev('ev-clash', { visibility: 'SHARED', structuredValue: { metric: 'Revenues', value: 123 } }));
    check('DET', same(bBefore, repo.getEvidence('ev-clash')), "tenant B's private evidence is untouched (not overwritten, no conflict text written into it)");
    check('DET', !(repo.getEvidence('ev-clash') as any).hasConflict && !(repo.getEvidence('ev-clash') as any).conflictDetails, 'no conflict flag crosses the access-domain boundary');
    check('DET', repo.getAll().length === 2 && repo.getAll().some(e => e.visibility === 'SHARED' && e.evidenceId !== 'ev-clash'), 'the SHARED fetch is stored separately');
    check('DET', !repo.queryEvidenceForOwner(A, { securityId: SEC }).some(e => e.evidenceId === 'ev-clash'), "tenant A never sees B's record");
    // tenant B refreshing its own private evidence is its own domain
    check('DET', repo.addEvidence(ev('ev-clash', { ownerUserId: B, userId: B, visibility: 'PRIVATE', structuredValue: { metric: 'Revenues', value: 999 } })) === false, "B's identical re-add is a duplicate inside B's domain");
  }
  {
    // explicitly shared existing
    const repo = new EvidenceRepository();
    repo.addEvidence(ev('ev-shared', { visibility: 'SHARED' }));
    const snapshot = JSON.parse(JSON.stringify(repo.getEvidence('ev-shared')));
    check('DET', repo.addEvidence(ev('ev-shared', { visibility: 'SHARED', retrievedAt: '2030-01-01T00:00:00.000Z' })) === false, 'identical SHARED refresh is deduplicated');
    check('DET', same(snapshot, repo.getEvidence('ev-shared')) && repo.getAll().length === 1, 'the original SHARED record keeps its original retrievedAt/provenance (immutable; later fetch cannot rewrite history)');
  }
  {
    // historical dating
    const repo = new EvidenceRepository();
    repo.addEvidence(ev('ev-dated', { visibility: 'SHARED' }));
    repo.addEvidence(ev('ev-undated', { visibility: 'SHARED', publishedAt: '', structuredValue: { metric: 'X', value: 1 } }));
    const ids = (asOf: string) => repo.queryEvidence({ securityId: SEC, asOfDate: asOf } as any).map(e => e.evidenceId).sort().join();
    check('DET', ids('2024-02-29') === '' && ids('2024-03-01') === 'ev-dated', 'PIT: asOf before publication excludes; same UTC day includes (end-of-day inclusive); undated evidence is never available as of a date');
    check('DET', repo.queryEvidence({ securityId: SEC } as any).length === 2, 'without asOfDate nothing is excluded');
  }

  // =====================================================================================
  section('E1b. New provider evidence gets an explicit, provenance-based visibility decision');
  // =====================================================================================
  check('DET', classifyProviderEvidence(ev('a')) === 'SHARED', 'allow-listed source, named provider, dated => SHARED');
  check('DET', classifyProviderEvidence(ev('b', { provider: '   ' })) === 'PRIVATE', 'blank provider (ambiguous provenance) => restricted');
  check('DET', classifyProviderEvidence(ev('c', { provider: undefined })) === 'PRIVATE', 'missing provider => restricted');
  check('DET', classifyProviderEvidence(ev('d', { sourceType: 'RESEARCH_DOCUMENT' })) === 'PRIVATE', 'non-allow-listed source type (user documents) => restricted');
  check('DET', classifyProviderEvidence(ev('e', { sourceType: 'SEC_FILING' })) === 'PRIVATE', 'unlisted source type (fixture-style SEC_FILING) => restricted');
  check('DET', classifyProviderEvidence(ev('f', { publishedAt: '', retrievedAt: '' })) === 'PRIVATE', 'no parseable date => restricted');
  check('DET', classifyProviderEvidence(ev('g', { ownerUserId: A })) === 'PRIVATE', 'carries an owner => PRIVATE');
  check('DET', classifyProviderEvidence(ev('h', { visibility: 'PRIVATE' })) === 'PRIVATE', 'an explicit PRIVATE is never upgraded');
  {
    const stub = (obj: any, fn: string, impl: any) => { obj[fn] = impl; };
    const secItems = [
      ev('gx-sec-ok'),
      ev('gx-blank-provider', { provider: '', structuredValue: { v: 2 } }),
      ev('gx-doc-like', { sourceType: 'RESEARCH_DOCUMENT', structuredValue: { v: 3 } }),
      ev('gx-simulated', { sourceType: 'MARKET_DATA', provider: 'Simulated India Feed', isSimulated: true, epistemicStatus: 'SIMULATED', structuredValue: { v: 4 } }),
      ev('gx-unavailable', { sourceType: 'MARKET_DATA', provider: 'FYERS_API', epistemicStatus: 'UNAVAILABLE', structuredValue: { v: 5 } })
    ];
    stub(metadataEvidenceAdapter, 'getMetadataEvidence', () => ev('gx-meta', { sourceType: 'CANONICAL_METADATA', provider: 'Canonical Registry', structuredValue: { v: 0 } }));
    stub(marketEvidenceAdapter, 'getQuoteEvidence', async () => []);
    stub(marketEvidenceAdapter, 'getHistoricalEvidence', async () => []);
    stub(secEvidenceAdapter, 'getEvidenceForSecurity', async () => JSON.parse(JSON.stringify(secItems)));
    stub(finmagineEvidenceAdapter, 'getEvidenceForSecurity', async () => []);
    const got = await evidenceService.gatherEvidence({ securityIds: [SEC] });
    const byId = (id: string) => evidenceRepository.getEvidence(id) as any;
    check('DET', byId('gx-sec-ok')?.visibility === 'SHARED' && byId('gx-meta')?.visibility === 'SHARED', 'gather: verified provider items are classified SHARED');
    check('DET', byId('gx-blank-provider')?.visibility === 'PRIVATE' && !byId('gx-blank-provider')?.ownerUserId, 'gather: blank-provider item stays restricted (ownerless + PRIVATE)');
    check('DET', byId('gx-doc-like')?.visibility === 'PRIVATE', 'gather: ownerless document-type item stays restricted');
    check('DET', byId('gx-simulated')?.isSimulated === true && byId('gx-simulated')?.epistemicStatus === 'SIMULATED', 'gather: simulated evidence keeps isSimulated:true / SIMULATED (never relabelled REAL)');
    check('DET', byId('gx-unavailable')?.epistemicStatus === 'UNAVAILABLE', 'gather: unavailable evidence keeps UNAVAILABLE');
    check('DET', !got.some(e => e.evidenceId === 'gx-blank-provider') && got.some(e => e.evidenceId === 'gx-sec-ok'), 'gather result for an anonymous caller contains only readable (SHARED) items');
    const countBefore = evidenceRepository.getAll().length;
    await evidenceService.gatherEvidence({ securityIds: [SEC] });
    await evidenceService.gatherEvidence({ securityIds: [SEC] });
    check('DET', evidenceRepository.getAll().length === countBefore, 'repeated gathers do not duplicate evidence');

    // =====================================================================================
    section('E2. One canonical repository path: gatherEvidence -> decision service');
    // =====================================================================================
    check('DET', evidenceService.getRepository() === (evidenceRepository as any), 'evidenceService and the decision service use the SAME repository instance');
    (financialDataService as any).getSecurityFinancials = async () => { throw new Error('offline'); };
    (financialDataService as any).getHistoricalPrices = async () => { throw new Error('offline'); };
    const dsvc = new (DecisionIntelligenceService as any)() as InstanceType<typeof DecisionIntelligenceService>;
    // authorized evidence collected NOW must reach the NEXT decision evaluation
    const collectedId = 'ev-collected-after';
    evidenceService.getRepository().addEvidence(ev(collectedId, { visibility: 'SHARED', structuredValue: { v: 'collected' } }));
    evidenceService.getRepository().addEvidence(ev('ev-legacy-2e', { structuredValue: { v: 'legacy' } }));
    evidenceService.getRepository().addEvidence(ev('ev-private-b-2e', { ownerUserId: B, userId: B, visibility: 'PRIVATE', structuredValue: { v: 'priv-b' } }));
    evidenceService.getRepository().addEvidence(ev('ev-private-a-2e', { ownerUserId: A, userId: A, visibility: 'PRIVATE', structuredValue: { v: 'priv-a' } }));
    const evalAt = (extra: any = {}) => dsvc.evaluateDecision({ securityId: SEC, asOfDate: '2024-06-01', forceRefresh: true, ...extra } as any);
    const dSys = JSON.stringify(await evalAt());
    check('DET', dSys.includes(collectedId) && dSys.includes('gx-sec-ok'), 'newly collected SHARED evidence and gathered provider evidence are used by the following decision');
    check('DET', !/ev-legacy-2e|ev-private-b-2e|ev-private-a-2e|gx-blank-provider|gx-doc-like/.test(dSys), 'system decision excludes legacy, private (both tenants) and restricted provider items');
    const dA = JSON.stringify(await evalAt({ ownerUserId: A }));
    check('DET', dA.includes('ev-private-a-2e') && !/ev-private-b-2e|ev-legacy-2e|gx-blank-provider/.test(dA), "tenant A's decision uses A's own private evidence plus shared evidence, never B's, legacy or restricted items");
    const dB = JSON.stringify(await evalAt({ ownerUserId: B }));
    check('DET', dB.includes('ev-private-b-2e') && !/ev-private-a-2e|ev-legacy-2e/.test(dB), "tenant B's decision uses B's evidence, never A's or legacy");
    const readsBefore = evidenceRepository.getAll().length;
    await evalAt(); await evalAt();
    check('DET', evidenceRepository.getAll().length === readsBefore, 'repeated decision evaluations (reads) do not duplicate evidence');
    const dd: any = await evalAt();
    check('DET', dd.marketContext?.provider === 'UNAVAILABLE' && dd.marketContext?.epistemicStatus === 'UNAVAILABLE', 'provider failure is represented as UNAVAILABLE, not fabricated as REAL', dd.marketContext);
    check('DET', dd.isAnalyticalOnly === true && dd.executionProhibited === true, 'decision keeps isAnalyticalOnly/executionProhibited');

    // provider failure / empty gather
    stub(secEvidenceAdapter, 'getEvidenceForSecurity', async () => { throw new Error('SEC down'); });
    let threw = false; let empty: any[] = [];
    try { empty = await evidenceService.gatherEvidence({ securityIds: ['us-msft'] }); } catch { threw = true; }
    // a failing provider adapter must not corrupt the repository: nothing from it is stored
    check('DET', !evidenceRepository.getAll().some(e => e.securityId === 'us-msft'), 'a failing provider stores nothing and fabricates nothing' + (threw ? ' (gather rejected)' : ' (gather degraded to empty)'));
    stub(secEvidenceAdapter, 'getEvidenceForSecurity', async () => []);
    stub(metadataEvidenceAdapter, 'getMetadataEvidence', () => ev('gx-meta-msft', { securityId: 'us-msft', sourceType: 'CANONICAL_METADATA', provider: 'Canonical Registry', structuredValue: { v: 'msft' } }));
    const none = await evidenceService.gatherEvidence({ securityIds: ['us-msft'] });
    check('DET', none.length === 1 && none[0].evidenceId === 'gx-meta-msft' && !none.some(e => e.epistemicStatus === 'REAL' && e.sourceType === 'MARKET_DATA'), 'empty provider results yield only the real metadata item (no invented market evidence)');
    void empty;
  }

  // =====================================================================================
  section('E3. Event-engine snapshot lookup uses the notebook id (nb-<canonical security id>)');
  // =====================================================================================
  {
    const nbId = researchNotebookService.notebookIdFor(SEC);
    check('DET', nbId === `nb-${SEC}`, 'domain model: system notebooks are keyed nb-<canonical security id> (notebookService.getOrCreateNotebook / snapshot routes)');
    const snap = (id: string, created: string, extra: any = {}) => ({ snapshotId: id, notebookId: nbId, securityId: SEC, createdAt: created, researchAsOfDate: created.slice(0, 10), claims: [], thesis: { risks: [], catalysts: [] }, evidenceIds: [], ...extra }) as any;
    const map: Map<string, any[]> = (researchNotebookService as any).snapshots;
    const event = { securityId: SEC, availableAt: '2024-05-15T00:00:00.000Z' } as any;
    const impact = () => (investmentEventEngine as any).evaluateResearchImpact(event);

    map.delete(nbId);
    check('DET', (await impact()).hasSnapshotComparison === false && /No archived research snapshots/.test((await impact()).narrative), 'missing reference: no snapshots under the notebook id => no comparison');
    map.set(SEC, [snap('wrong-key-before', '2024-05-01T00:00:00.000Z', { visibility: 'SHARED' }), snap('wrong-key-after', '2024-06-01T00:00:00.000Z', { visibility: 'SHARED' })]);
    check('DET', (await impact()).hasSnapshotComparison === false, 'mismatched identifier: snapshots filed under the bare security id are NOT picked up (no guessing)');
    map.delete(SEC);
    map.set(nbId, [snap('shared-before', '2024-05-01T00:00:00.000Z', { visibility: 'SHARED' }), snap('shared-after', '2024-06-01T00:00:00.000Z', { visibility: 'SHARED' })]);
    const ok = await impact();
    check('DET', ok.hasSnapshotComparison === true && ok.snapshotBeforeId === 'shared-before' && ok.snapshotAfterId === 'shared-after', 'valid SHARED snapshots under the notebook id are compared', ok);
    map.set(nbId, [
      snap('legacy-before', '2024-05-01T00:00:00.000Z'),
      snap('private-after', '2024-06-01T00:00:00.000Z', { ownerUserId: B, userId: B, visibility: 'PRIVATE' }),
      snap('restricted-after', '2024-06-02T00:00:00.000Z', { visibility: 'PRIVATE' })
    ]);
    const hidden = await impact();
    check('DET', hidden.hasSnapshotComparison === false && !hidden.snapshotBeforeId && !hidden.snapshotAfterId, 'legacy, other-tenant and restricted snapshots never enter event research impact (no ids leaked either)', hidden);
    map.set(nbId, [snap('legacy-x', '2024-05-01T00:00:00.000Z'), snap('shared-after-only', '2024-06-01T00:00:00.000Z', { visibility: 'SHARED' })]);
    const mixed = await impact();
    check('DET', mixed.hasSnapshotComparison === false && mixed.snapshotAfterId === 'shared-after-only' && !mixed.snapshotBeforeId, 'mixed provenance: only the shared half is used, the legacy half is ignored');
    map.delete(nbId);
  }

  // =====================================================================================
  section('E4. Durable deletion (development adapter + restart; simulated PostgreSQL)');
  // =====================================================================================
  {
    const dir = path.join(tmp, 'deletion');
    const { DevelopmentPersistenceAdapter } = await import('../server/persistence/devAdapter/developmentPersistenceAdapter');
    const adapter = new DevelopmentPersistenceAdapter(dir); await adapter.initialize();
    persistenceManager.setAdapter(adapter);
    const { documentRegistry } = await import('../server/services/documents/documentRegistry');
    const { DocumentIngestionService } = await import('../server/services/documents/documentIngestionService');
    const ing = new DocumentIngestionService();
    documentRegistry.clear(); evidenceRepository.clear();
    const text = `deletion scenario ${Date.now()} proprietary note`;
    const da = await ing.ingestDocument({ fileName: 'a.txt', fileText: text, ownerUserId: A, securityId: SEC });
    const db = await ing.ingestDocument({ fileName: 'b.txt', fileText: text, ownerUserId: B, securityId: SEC });
    const shared = await ing.ingestDocument({ fileName: 's.txt', fileText: `shared ${Date.now()}`, securityId: SEC, visibility: 'SHARED' } as any);
    const legacy = { documentId: 'doc-legacy-2e', fileName: 'l.txt', documentType: 'TXT', contentHash: `h-${Date.now()}`, title: 'legacy', processingStatus: 'READY', uploadedAt: '2024-01-01T00:00:00.000Z', provider: 'p', sourceType: 'RESEARCH_DOCUMENT' } as any;
    await adapter.getDocumentRepository().save(legacy);
    documentRegistry.register({ ...legacy });
    await new Promise(r => setTimeout(r, 20)); // write-through persistence settles
    const evA = da.document.evidenceIds || [];
    check('DET', evA.length > 0 && (await adapter.getEvidenceRepository().getEvidence(evA[0])) !== null, 'precondition: A\'s document and derived evidence are persisted');

    check('DET', (await ing.deleteDocumentForOwner(da.document.documentId, B)) === false, "tenant B cannot delete A's document");
    check('DET', (await ing.deleteDocumentForOwner(shared.document.documentId, A)) === false, 'a SHARED document cannot be deleted by a user');
    check('DET', (await ing.deleteDocumentForOwner('doc-legacy-2e', A)) === false, 'a legacy ownerless document cannot be deleted by a user');
    check('DET', (await adapter.getDocumentRepository().get(da.document.documentId)) !== null && documentRegistry.getDocument(da.document.documentId) !== undefined, "A's document intact after refused deletions");
    check('DET', (await ing.deleteDocumentForOwner(da.document.documentId, A)) === true, 'the owner can delete');
    check('DET', documentRegistry.getDocument(da.document.documentId) === undefined && evidenceRepository.getEvidence(evA[0]) === undefined, 'in-memory document and derived evidence are gone');
    check('DET', (await adapter.getDocumentRepository().get(da.document.documentId)) === null && (await adapter.getEvidenceRepository().getEvidence(evA[0])) === null, 'persistent document and derived evidence are gone');
    check('DET', documentRegistry.getDocument(db.document.documentId) !== undefined && (await adapter.getDocumentRepository().get(db.document.documentId)) !== null, "tenant B's document (identical content) is unaffected");
    check('DET', (await adapter.getDocumentRepository().get(shared.document.documentId)) !== null && (await adapter.getDocumentRepository().get('doc-legacy-2e')) !== null, 'shared and legacy documents are unaffected');
    check('DET', (await ing.deleteDocumentForOwner(da.document.documentId, A)) === false, 'deleting twice is a no-op');

    // restart: brand-new adapter instance on the same directory + fresh in-memory state + hydration
    const restarted = new DevelopmentPersistenceAdapter(dir); await restarted.initialize();
    persistenceManager.setAdapter(restarted);
    documentRegistry.clear(); evidenceRepository.clear();
    await documentRegistry.hydrateFromPersistence();
    await evidenceRepository.hydrateFromPersistence();
    check('DET', documentRegistry.getDocument(da.document.documentId) === undefined && evidenceRepository.getEvidence(evA[0]) === undefined, 'after restart + hydration the deleted document and evidence do NOT return');
    check('DET', documentRegistry.getDocument(db.document.documentId) !== undefined, "after restart B's document is still there");
    // a stale pre-delete cache cannot resurrect the record through the registry's dedup path
    const reup = await ing.ingestDocument({ fileName: 'a2.txt', fileText: text, ownerUserId: A, securityId: SEC });
    check('DET', reup.isDuplicate === false, 're-uploading after deletion is a fresh upload (no stale duplicate entry pointing at the deleted record)');
    persistenceManager.setAdapter(await mkDev('main2'));
  }
  {
    // simulated PostgreSQL: repository-level owner-guarded delete
    const { newDb } = await import('pg-mem');
    const { PostgresPersistenceAdapter } = await import('../server/persistence/postgres/postgresAdapter');
    const { PostgresClient } = await import('../server/persistence/postgres/postgresClient');
    const { MIGRATIONS } = await import('../server/persistence/migrations/schema');
    const db = newDb({ noAstCoverageCheck: true });
    const { Pool } = db.adapters.createPg();
    const client = new PostgresClient({ databaseUrl: null, isConfigured: false, ssl: false, maxConnections: 2, connectionTimeoutMillis: 1000 } as any, new Pool() as any);
    const pg = new PostgresPersistenceAdapter(client, { migrations: MIGRATIONS.map(m => ({ ...m, up: m.up.filter(s => !/CREATE OR REPLACE VIEW/i.test(s)) })) });
    await pg.initialize();
    const docs = pg.getDocumentRepository(); const evs = pg.getEvidenceRepository();
    const mkDoc = (id: string, owner?: string, vis?: string) => ({ documentId: id, fileName: 'f', documentType: 'TXT', contentHash: `h-${id}`, title: 't', processingStatus: 'READY', uploadedAt: '2024-03-01T00:00:00.000Z', provider: 'p', sourceType: 'RESEARCH_DOCUMENT', ...(owner ? { ownerUserId: owner, userId: owner } : {}), ...(vis ? { visibility: vis } : {}) }) as any;
    await docs.save(mkDoc('pg-a', A, 'PRIVATE')); await docs.save(mkDoc('pg-b', B, 'PRIVATE')); await docs.save(mkDoc('pg-shared', undefined, 'SHARED')); await docs.save(mkDoc('pg-legacy'));
    await evs.addEvidence(ev('pg-ev-a', { ownerUserId: A, userId: A, visibility: 'PRIVATE' })); await evs.addEvidence(ev('pg-ev-shared', { visibility: 'SHARED' }));
    check('SIM', (await docs.deleteForOwner('pg-a', B)) === false && (await docs.get('pg-a')) !== null, "simulated PostgreSQL: another tenant's delete matches no row");
    check('SIM', (await docs.deleteForOwner('pg-shared', A)) === false && (await docs.deleteForOwner('pg-legacy', A)) === false, 'simulated PostgreSQL: SHARED and ownerless rows are not deletable by a user');
    check('SIM', (await docs.deleteForOwner('pg-a', A)) === true && (await docs.get('pg-a')) === null && (await docs.get('pg-b')) !== null, 'simulated PostgreSQL: owner delete removes only that row');
    check('SIM', (await evs.deleteForOwner('pg-ev-shared', A)) === false && (await evs.deleteForOwner('pg-ev-a', B)) === false && (await evs.deleteForOwner('pg-ev-a', A)) === true && (await evs.getEvidence('pg-ev-shared')) !== null, 'simulated PostgreSQL: evidence delete is owner-only; SHARED evidence untouched');
    check('SIM', await (async () => { try { await docs.deleteForOwner('x', ''); return false; } catch { return true; } })(), 'simulated PostgreSQL: delete without tenant scope is refused');
  }
  {
    // HTTP route: authorization + durability end to end
    const adapter = await mkDev('http-del');
    persistenceManager.setAdapter(adapter);
    const { createApp } = await import('../server');
    const { documentRegistry } = await import('../server/services/documents/documentRegistry');
    documentRegistry.clear(); evidenceRepository.clear();
    const app = await createApp({ initializePersistence: false });
    const srv = app.listen(0, '127.0.0.1'); await new Promise<void>(r => srv.once('listening', () => r()));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const j = async (m: string, u: string, tok?: string, body?: unknown) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let b: any = null; try { b = await r.json(); } catch { /* */ } return { s: r.status, b }; };
    const reg = async (n: string) => (await j('POST', '/api/auth/register', undefined, { email: `${n}_${Date.now()}@example.com`, password: 'Delete-Pass-123' })).b.session.sessionId as string;
    const ta = await reg('da'); const tb = await reg('db');
    const up = await j('POST', '/api/documents/upload', ta, { fileName: 'r.txt', fileText: `route deletion ${Date.now()}`, securityId: SEC });
    const id = up.b.document.documentId as string;
    check('DET', (await j('DELETE', `/api/documents/${id}`, tb)).s === 403, 'HTTP: non-owner DELETE -> 403');
    check('DET', (await j('DELETE', `/api/documents/${id}`)).s === 401, 'HTTP: anonymous DELETE -> 401');
    check('DET', (await j('DELETE', `/api/documents/${id}`, ta)).s === 200, 'HTTP: owner DELETE -> 200');
    check('DET', (await j('GET', `/api/documents/${id}`, ta)).s === 404, 'HTTP: deleted document is gone (404)');
    check('DET', (await adapter.getDocumentRepository().get(id)) === null, 'HTTP: deletion reached persistent storage');
    await new Promise<void>(r => srv.close(() => r()));
  }

  // =====================================================================================
  section('Isolation');
  // =====================================================================================
  const after = fs.existsSync(realStore) ? sha(realStore) : 'absent';
  check('DET', before === after, 'data/persistence/store.json is byte-identical before and after (SHA-256)', { before: before.slice(0, 12), after: after.slice(0, 12) });
  fs.rmSync(tmp, { recursive: true, force: true });

  const total = tally.DET.p + tally.DET.f + tally.SIM.p + tally.SIM.f;
  console.log('\n========================================================================');
  console.log(`PHASE 38.2E EVIDENCE/CONSISTENCY SUITE: ${tally.DET.p + tally.SIM.p} PASSED / ${tally.DET.f + tally.SIM.f} FAILED (TOTAL: ${total})`);
  console.log(`  [DET] ${tally.DET.p} passed / ${tally.DET.f} failed   [SIM pg-mem, not real] ${tally.SIM.p} passed / ${tally.SIM.f} failed   [REAL PostgreSQL] 0 run`);
  console.log('========================================================================');
  if (failures.length) { console.error('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch(e => { console.error('Phase 38.2E suite crashed:', e); process.exit(1); });
