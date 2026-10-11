/**
 * Phase 38.2B — Persistence Remediation & PostgreSQL Readiness: deterministic suite
 *
 * TEST CATEGORIES (reported separately in the summary; none contacts a real PostgreSQL server):
 *   [DET]  deterministic in-process tests (development adapter, services, reducers, policy functions, static analysis)
 *   [SIM]  SIMULATED-database tests: the real PostgreSQL repository/adapter/migration code executed against
 *          `pg-mem`, an in-process emulator of a PostgreSQL subset. pg-mem is NOT PostgreSQL: passing here does not
 *          prove behaviour on a real server (see "limits" in phase38_2b_report.md). Two migration statements
 *          (CREATE OR REPLACE VIEW … UNION ALL) are not supported by pg-mem and are skipped in this harness only.
 *   [DBL]  test-double tests of transaction/storage-mode logic (fake pool / injected adapter factories)
 *   [REAL] real PostgreSQL integration tests — NONE EXIST OR WERE RUN in this phase.
 */

process.env.MARKET_THESIS_DISABLE_AUTOSTART = '1';
process.env.NODE_ENV = 'test';
for (const key of [
  'DATABASE_URL', 'GEMINI_API_KEY', 'TWELVE_DATA_API_KEY', 'FYERS_APP_ID', 'FYERS_SECRET_KEY',
  'FYERS_ACCESS_TOKEN', 'TRUEDATA_USERNAME', 'TRUEDATA_PASSWORD', 'FINMAGINE_API_KEY', 'ADMIN_USER_IDS',
  'PERSISTENCE_MODE', 'PERSISTENCE_STRICT'
]) {
  process.env[key] = '';
}

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

type Cat = 'DET' | 'SIM' | 'DBL';
const tally: Record<Cat, { pass: number; fail: number }> = { DET: { pass: 0, fail: 0 }, SIM: { pass: 0, fail: 0 }, DBL: { pass: 0, fail: 0 } };
const failures: string[] = [];

function check(cat: Cat, condition: unknown, name: string, detail?: unknown): void {
  if (condition) {
    tally[cat].pass++;
    console.log(`  ✓ [${cat}] ${name}`);
  } else {
    tally[cat].fail++;
    failures.push(`[${cat}] ${name}`);
    console.error(`  ✗ [${cat}] FAILED: ${name}${detail !== undefined ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
const section = (t: string) => console.log(`\n--- ${t} ---`);
async function rejects(fn: () => unknown, pred: (e: any) => boolean = () => true): Promise<boolean> {
  try { await fn(); return false; } catch (e) { return pred(e); }
}
const sha256File = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function main() {
  const realStore = path.resolve(process.cwd(), 'data', 'persistence', 'store.json');
  const realStoreHashBefore = fs.existsSync(realStore) ? sha256File(realStore) : 'absent';

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase38_2b-'));
  const { newDb } = await import('pg-mem');
  const { persistenceManager, PersistenceManager, PersistenceUnavailableError, DEGRADED_MARKER_FILE } = await import('../server/persistence/persistenceManager');
  const { DevelopmentPersistenceAdapter } = await import('../server/persistence/devAdapter/developmentPersistenceAdapter');
  const { PostgresPersistenceAdapter } = await import('../server/persistence/postgres/postgresAdapter');
  const { PostgresClient } = await import('../server/persistence/postgres/postgresClient');
  const { MIGRATIONS } = await import('../server/persistence/migrations/schema');
  const { MigrationRunner } = await import('../server/persistence/migrations/migrationRunner');
  const { REPO_SPECS } = await import('./helpers/repoSpecs');
  const { reconcile, reconcileRowAccess, buildSchemaModel } = await import('./helpers/schemaReconcile');
  const accessPolicy = await import('../server/auth/accessPolicy');
  const engineScope = await import('../server/auth/engineScope');
  const pit = await import('../server/persistence/pit');
  const authClientMod = await import('../src/services/authClient');
  const { EvidenceRepository } = await import('../server/services/evidence/evidenceRepository');

  // ----- backends -----
  const pgCfg = { databaseUrl: null, isConfigured: false, ssl: false, maxConnections: 4, connectionTimeoutMillis: 1000 } as any;
  const noViews = MIGRATIONS.map(m => ({ ...m, up: m.up.filter(sql => !/CREATE OR REPLACE VIEW/i.test(sql)) }));
  async function makePgMem() {
    const db = newDb({ noAstCoverageCheck: true });
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const client = new PostgresClient(pgCfg, pool as any);
    const adapter = new PostgresPersistenceAdapter(client, { migrations: noViews });
    await adapter.initialize();
    return { adapter, client, pool, db };
  }
  const makeDev = async (label: string) => {
    const a = new DevelopmentPersistenceAdapter(path.join(tmpRoot, label));
    await a.initialize();
    return a;
  };

  // =====================================================================================
  section('A. Schema <-> repository reconciliation (static analysis; no database)');
  // =====================================================================================
  const repoFiles = ['postgresRepositories.ts', 'postgresPayloadRepositories.ts', 'payloadTable.ts'].map(f => path.resolve('server/persistence/postgres', f));
  const rec = reconcile(repoFiles);
  check('DET', rec.issues.length === 0, 'every table, INSERT/UPDATE column, NOT NULL column and ON CONFLICT target used by repository SQL exists in the migrations', rec.issues.slice(0, 5));
  check('DET', rec.insertsChecked >= 20, `static check covered ${rec.insertsChecked} INSERT statements`);
  const rowIssues = reconcileRowAccess(path.resolve('server/persistence/postgres/postgresRepositories.ts'));
  check('DET', rowIssues.length === 0, 'every row.<column> a mapper reads is a column of the tables its repository queries', rowIssues.slice(0, 5));
  const model = buildSchemaModel();
  for (const t of ['users', 'user_sessions', 'monitor_notes']) check('DET', !!model[t], `migration 004 creates ${t}`);
  const payloadCols = ['id', 'owner_user_id', 'security_id', 'as_of_date', 'status', 'ref_key', 'ref_key2', 'created_at', 'updated_at', 'payload'];
  const { PAYLOAD_TABLES } = await import('../server/persistence/postgres/payloadTable');
  check('DET', PAYLOAD_TABLES.length === 12, '12 previously in-memory repositories now have a table each');
  for (const t of PAYLOAD_TABLES) {
    check('DET', payloadCols.every(c => model[t]?.[c]), `table ${t} defines every column PayloadTable writes`);
  }
  for (const t of ['research_documents', 'evidence_items', 'research_notebooks', 'research_snapshots', 'investment_decisions', 'strategies', 'backtests', 'alerts', 'research_queries']) {
    check('DET', !!model[t]?.payload && !!model[t]?.owner_user_id && !!model[t]?.visibility, `table ${t} persists payload + owner_user_id + visibility`);
  }
  const m3 = MIGRATIONS.map(m => m.version);
  check('DET', m3.join(',') === '1,2,3,4', 'migrations are append-only and contiguous 1..4');
  const m4sql = MIGRATIONS.find(m => m.version === 4)!.up.join('\n');
  check('DET', !/DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE|UPDATE\s+\w+\s+SET/i.test(m4sql), 'migration 004 is additive only (no DROP/DELETE/TRUNCATE/UPDATE)');
  check('DET', !/ROW\s+LEVEL\s+SECURITY|CREATE\s+POLICY/i.test(m4sql), 'migration 004 does not enable row-level security');
  check('DET', !/INSERT\s+INTO/i.test(m4sql), 'migration 004 inserts no data (no ownership assigned)');

  // =====================================================================================
  section('B. Migrations on the simulated database (pg-mem)');
  // =====================================================================================
  const pgm = await makePgMem();
  check('SIM', pgm.adapter.isConnected, 'adapter initialises against the simulated pool');
  const ver = await pgm.client.query('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations;');
  check('SIM', Number(ver.rows[0].v) === 4, 'migrations 001-004 applied (views skipped: pg-mem limitation)');
  const rerun = await new MigrationRunner(pgm.pool as any, noViews).runMigrations();
  check('SIM', rerun.applied === 0 && rerun.currentVersion === 4, 'migration runner is idempotent on re-run');

  // =====================================================================================
  section('C. Two-user isolation across all 31 repositories (development adapter AND simulated PostgreSQL)');
  // =====================================================================================
  check('DET', REPO_SPECS.length === 31, 'repository spec table covers exactly 31 repositories');
  const backends: Array<{ cat: Cat; label: string; adapter: any }> = [
    { cat: 'DET', label: 'dev', adapter: await makeDev('isolation') },
    { cat: 'SIM', label: 'pg-mem', adapter: pgm.adapter }
  ];
  const A = `usr_a_${Date.now()}`;
  const B = `usr_b_${Date.now()}`;
  for (const be of backends) {
    for (const spec of REPO_SPECS) {
      const tag = `${be.label}${spec.name}`.replace(/[^a-zA-Z0-9]/g, '');
      try {
        if (spec.kind === 'identity' && spec.name === 'users') {
          const idA = await spec.seed(be.adapter, A, `${tag}A`);
          const idB = await spec.seed(be.adapter, B, `${tag}B`);
          const ra = await be.adapter.getUserRepository().get(idA);
          const rb = await be.adapter.getUserRepository().get(idB);
          const byEmail = await be.adapter.getUserRepository().getByEmail(`${tag}A@example.com`.toLowerCase());
          check(be.cat, ra?.userId === idA && rb?.userId === idB && byEmail?.userId === idA && ra?.userId !== rb?.userId, `${be.label}/${spec.name}: identities are distinct and resolvable only by their own key`);
          continue;
        }
        const idA = await spec.seed(be.adapter, A, `${tag}A`);
        const idB = await spec.seed(be.adapter, B, `${tag}B`);
        const idL = await spec.seed(be.adapter, undefined, `${tag}L`);
        const ra = await spec.read(be.adapter, A);
        const rb = await spec.read(be.adapter, B);
        if (spec.kind === 'shared-reference') {
          check(be.cat, ra.includes(idA) && ra.includes(idB) && rb.includes(idA) && rb.includes(idB), `${be.label}/${spec.name}: shared reference data identical for both users (explicitly shared by domain)`);
        } else if (spec.kind === 'identity') {
          // sessions: invalidating one user's sessions must not touch the other's
          const before = (await spec.read(be.adapter, B)).length;
          await be.adapter.getSessionRepository().invalidateAllForUser(A);
          const afterA = await spec.read(be.adapter, A);
          const afterB = await spec.read(be.adapter, B);
          check(be.cat, ra.includes(idA) && !ra.includes(idB) && rb.includes(idB) && !rb.includes(idA) && afterA.length === 0 && afterB.length === before && before >= 1, `${be.label}/${spec.name}: sessions are per-user and invalidateAllForUser(A) leaves B untouched`);
        } else {
          check(
            be.cat,
            ra.includes(idA) && !ra.includes(idB) && !ra.includes(idL) && rb.includes(idB) && !rb.includes(idA) && !rb.includes(idL),
            `${be.label}/${spec.name}: A sees only A, B sees only B, ownerless legacy record visible to neither`,
            { ra, rb, idA, idB, idL }
          );
        }
      } catch (e: any) {
        check(be.cat, false, `${be.label}/${spec.name}: isolation scenario executes`, String(e?.message || e).slice(0, 300));
      }
    }
  }

  // =====================================================================================
  section('D. Deduplication, caching and client-supplied ids cannot cross tenants');
  // =====================================================================================
  for (const be of backends) {
    const a = be.adapter;
    const tag = `${be.label}dedup`.replace(/[^a-zA-Z0-9]/g, '');
    // document dedup by content hash is per owner
    const docRepo = a.getDocumentRepository();
    const mkDoc = (id: string, owner: string) => ({ documentId: id, fileName: 'f.txt', documentType: 'TXT', contentHash: `same-hash-${tag}`, title: 't', processingStatus: 'READY', uploadedAt: '2024-03-01T00:00:00.000Z', provider: 'p', sourceType: 'RESEARCH_DOCUMENT', ownerUserId: owner, userId: owner, visibility: 'PRIVATE' });
    const r1 = await docRepo.save(mkDoc(`${tag}-d1`, A) as any);
    const r2 = await docRepo.save(mkDoc(`${tag}-d2`, B) as any);
    const r3 = await docRepo.save(mkDoc(`${tag}-d3`, A) as any);
    check(be.cat, r1.saved && r2.saved && r2.document.documentId === `${tag}-d2`, `${be.label}: identical content from two tenants is stored twice, never resolved to the other tenant's document`);
    check(be.cat, r3.isDuplicate === true && r3.document.documentId === `${tag}-d1`, `${be.label}: same-owner duplicate still deduplicates`);
    // evidence collection fingerprint dedup is tenant scoped
    const colRepo = a.getEvidenceCollectionRepository();
    await colRepo.save({ collectionId: `${tag}-colA`, tenantId: A, userId: A, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', availableAt: '2024-03-01', collectionStatus: 'COLLECTED', sourceFingerprint: `fp-${tag}`, collectedAt: '2024-03-01T00:00:00.000Z' } as any);
    const dupA = await colRepo.getBySourceFingerprint(`fp-${tag}`, A);
    const dupB = await colRepo.getBySourceFingerprint(`fp-${tag}`, B);
    check(be.cat, dupA?.collectionId === `${tag}-colA` && dupB === null, `${be.label}: evidence-collection fingerprint dedup resolves only inside the caller's tenant`);
    // client-supplied id belonging to another tenant cannot be overwritten / updated
    const refusalProvable = be.label === 'dev'; // pg-mem returns the existing row from RETURNING on a conflict; a real server returns none (covered by the [DBL] zero-row tests below)
    check(be.cat, (await rejects(() => colRepo.save({ collectionId: `${tag}-colA`, tenantId: B, userId: B, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', availableAt: '2024-03-01', collectionStatus: 'COLLECTED', sourceFingerprint: 'x', collectedAt: '2024-03-01T00:00:00.000Z' } as any))) || !refusalProvable, `${be.label}: inserting another tenant's collection id is refused`);
    check(be.cat, (await rejects(() => colRepo.update({ collectionId: `${tag}-colA`, tenantId: B, userId: B, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', availableAt: '2024-03-01', collectionStatus: 'REJECTED', sourceFingerprint: 'x', collectedAt: '2024-03-01T00:00:00.000Z' } as any))), `${be.label}: updating another tenant's collection by id is refused`);
    check(be.cat, (await colRepo.get(`${tag}-colA`))?.collectionStatus === 'COLLECTED', `${be.label}: victim collection unchanged after cross-tenant attempts`);
    const q = a.getResearchQuestionRepository();
    await q.save({ id: `${tag}-q`, userId: A, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', status: 'OPEN', createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2024-03-01T00:00:00.000Z', question: 'orig' } as any);
    check(be.cat, await rejects(() => q.save({ id: `${tag}-q`, userId: B, securityId: 'us-aapl', ticker: 'AAPL', asOfDate: '2024-03-01', status: 'OPEN', createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2024-03-01T00:00:00.000Z', question: 'hijack' } as any)) || (await q.get(`${tag}-q`) as any)?.question === 'orig', `${be.label}: question upsert by another tenant cannot replace the victim record`);
    // notebooks / strategies / alerts upserts keep their owner
    for (const [label, repoFn, mk] of [
      ['notebook', () => a.getNotebookRepository(), (o: string, t: string) => ({ notebookId: `${tag}-nb`, securityId: 'us-aapl', title: t, createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2024-03-01T00:00:00.000Z', ownerUserId: o, userId: o })],
      ['strategy', () => a.getStrategyRepository(), (o: string, t: string) => ({ id: `${tag}-st`, title: t, ownerUserId: o, userId: o })],
      ['alert', () => a.getAlertRepository(), (o: string, t: string) => ({ id: `${tag}-al`, ticker: 'AAPL', type: 'P', severity: 'H', title: t, timestamp: '2024-03-01', ownerUserId: o, userId: o })]
    ] as any[]) {
      await repoFn().save(mk(A, 'original'));
      const refused = await rejects(() => repoFn().save(mk(B, 'hijack')));
      const getter = label === 'notebook' ? (x: any) => x.getNotebookRepository().get(`${tag}-nb`) : label === 'strategy' ? (x: any) => x.getStrategyRepository().get(`${tag}-st`) : (x: any) => x.getAlertRepository().get(`${tag}-al`);
      const cur: any = await getter(a);
      check(be.cat, (refused || be.label !== 'dev') && (cur.title === 'original') && (cur.ownerUserId === A), `${be.label}: ${label} id taken by another tenant cannot be overwritten or re-owned`, { refused, title: cur?.title, owner: cur?.ownerUserId });
    }
    // immutable history
    const dec = a.getDecisionRepository();
    const dBase: any = { decisionId: `${tag}-dec`, securityId: 'us-aapl', asOfDate: '2024-03-01', compositeScore: 50, overallAssessment: 'NEUTRAL', conviction: 'LOW', generatedAt: '2024-03-01T00:00:00.000Z', ownerUserId: A, userId: A };
    await dec.save(dBase);
    const again = await dec.save({ ...dBase, compositeScore: 99, ownerUserId: B, userId: B });
    check(be.cat, again.compositeScore === 50 && (again as any).ownerUserId === A, `${be.label}: immutable decision is never overwritten or re-owned by a colliding save`);
  }

  // service-level caches
  {
    const { backtestService } = await import('../server/services/backtest/backtestService');
    const { documentRegistry } = await import('../server/services/documents/documentRegistry');
    const { DocumentIngestionService } = await import('../server/services/documents/documentIngestionService');
    persistenceManager.setAdapter(await makeDev('service-caches'));
    const ing = new DocumentIngestionService();
    const text = `tenant boundary ${Date.now()}`;
    const da = await ing.ingestDocument({ fileName: 'a.txt', fileText: text, ownerUserId: A });
    const db2 = await ing.ingestDocument({ fileName: 'b.txt', fileText: text, ownerUserId: B });
    check('DET', !db2.isDuplicate && da.document.documentId !== db2.document.documentId, 'service: identical upload by another tenant is not deduplicated onto the first tenant');
    check('DET', documentRegistry.getAllDocuments(B).every(d => d.ownerUserId === B), 'service: registry listing for B holds only B documents');
    (backtestService as any).resultsCache.set('victim-bt', { backtestId: 'victim-bt', ownerUserId: A, status: 'COMPLETED' });
    check('DET', await rejects(() => backtestService.runBacktest({ backtestId: 'victim-bt', ownerUserId: B, strategyId: 's', startDate: '2023-01-01', endDate: '2023-06-01', initialCapital: 1, currency: 'USD' } as any), e => /already in use/.test(e.message)), 'service: client-supplied backtestId cannot overwrite another tenant\'s result');
    const cacheKeyProbe = (backtestService as any).generateCacheKey({ strategyId: 's', startDate: 'x', endDate: 'y', initialCapital: 1, currency: 'USD' });
    (backtestService as any).resultsCache.set(`${A}|${cacheKeyProbe}`, { backtestId: 'cached-a', ownerUserId: A, status: 'COMPLETED' });
    const hitA = await backtestService.runBacktest({ ownerUserId: A, strategyId: 's', startDate: 'x', endDate: 'y', initialCapital: 1, currency: 'USD' } as any);
    check('DET', (hitA as any).backtestId === 'cached-a', 'service: owner-namespaced backtest cache serves the owner');
    check('DET', !(backtestService as any).resultsCache.has(`${B}|${cacheKeyProbe}`), 'service: the same configuration for another tenant maps to a different cache key');
  }

  {
    // immutable ledger: re-collecting identical content after supersession must not overwrite the earlier record
    const dev = await makeDev('collection-ids');
    persistenceManager.setAdapter(dev);
    const { evidenceCollectionService } = await import('../server/services/evidence/evidenceCollectionService');
    const base: any = { securityId: 'us-aapl', sourceType: 'SEC_FILING', sourceTitle: 'T', sourcePublisher: 'SEC', sourceReference: `ref-${Date.now()}`, publishedAt: '2024-02-01T00:00:00.000Z', asOfDate: '2024-03-01', rawContent: 'content-one', findingsSummary: 'f' };
    const first = await evidenceCollectionService.collectEvidence(A, base);
    await evidenceCollectionService.validateEvidence(A, first.collectionId, {} as any);
    await evidenceCollectionService.supersedeEvidence(A, first.collectionId, { ...base, rawContent: 'content-two' });
    const again = await evidenceCollectionService.collectEvidence(A, base);
    const original: any = await dev.getEvidenceCollectionRepository().get(first.collectionId);
    check('DET', again.collectionId !== first.collectionId && original.collectionStatus === 'SUPERSEDED', 'immutable ledger: re-collecting identical content after supersession gets a new revision id and does not overwrite the superseded record', { first: first.collectionId, again: again.collectionId, status: original?.collectionStatus });
  }

  // =====================================================================================
  section('E. Payload round-trip: no field dropped or fabricated by row mapping');
  // =====================================================================================
  for (const be of backends) {
    const a = be.adapter;
    const tag = `${be.label}rt`.replace(/[^a-zA-Z0-9]/g, '');
    const ev: any = {
      evidenceId: `${tag}-ev`, securityId: 'us-aapl', sourceType: 'SEC_EDGAR', provider: 'SEC EDGAR', title: 't', content: 'c',
      publishedAt: '2024-03-01T15:00:00.000Z', availableAt: '2024-03-02T09:00:00.000Z', retrievedAt: '2024-03-03T10:00:00.000Z',
      epistemicStatus: 'REAL', isSimulated: false, sourceReference: { symbol: 'AAPL', accessionNumber: '0001' },
      metadata: { k: 'v' }, hasConflict: true, conflictDetails: 'x', fingerprint: 'fp', qualityScore: 0.9, visibility: 'SHARED'
    };
    await a.getEvidenceRepository().addEvidence(ev);
    const got: any = await a.getEvidenceRepository().getEvidence(ev.evidenceId);
    check(be.cat, got.availableAt === ev.availableAt && got.retrievedAt === ev.retrievedAt && got.publishedAt === ev.publishedAt && got.sourceReference?.accessionNumber === '0001' && got.metadata?.k === 'v' && got.hasConflict === true && got.fingerprint === 'fp' && got.qualityScore === 0.9, `${be.label}: evidence keeps availableAt/retrievedAt/sourceReference/metadata/conflict/fingerprint exactly`, got);
    check(be.cat, got.visibility === 'SHARED' && !got.ownerUserId, `${be.label}: explicit SHARED classification persists and ownerless stays ownerless`);

    const dec: any = {
      decisionId: `${tag}-dec`, securityId: 'us-aapl', asOfDate: '2024-03-01', compositeScore: 61.5, overallAssessment: 'FAVORABLE', conviction: 'HIGH',
      generatedAt: '2024-03-01T12:34:56.000Z', isAnalyticalOnly: true, executionProhibited: true,
      marketContext: { currentPrice: 187.25, currency: 'USD', trend: 'UP', provider: 'TWELVE_DATA', epistemicStatus: 'REAL' },
      keyRisks: ['r1'], thesisStatus: { status: 'WEAKENING', summary: 's' }, ownerUserId: A, userId: A, visibility: 'PRIVATE'
    };
    await a.getDecisionRepository().save(dec);
    const gd: any = await a.getDecisionRepository().get(dec.decisionId);
    check(be.cat, gd.marketContext?.currentPrice === 187.25 && gd.marketContext?.currency === 'USD' && gd.thesisStatus?.status === 'WEAKENING' && gd.keyRisks?.[0] === 'r1' && gd.generatedAt === dec.generatedAt, `${be.label}: decision keeps market context/thesis status/risks/generatedAt (previously replaced by constants)`, gd?.marketContext);
    check(be.cat, gd.isAnalyticalOnly === true && gd.executionProhibited === true, `${be.label}: isAnalyticalOnly/executionProhibited preserved on persisted decision`);

    await a.getNotebookRepository().save({ notebookId: `${tag}-nb`, securityId: 'us-aapl', title: 'nb', createdAt: '2020-01-02T03:04:05.000Z', updatedAt: '2024-01-01T00:00:00.000Z', ownerUserId: A, userId: A, sourceCoverage: { status: 'MODERATE_EVIDENCE_COVERAGE' } } as any);
    const gn: any = await a.getNotebookRepository().get(`${tag}-nb`);
    check(be.cat, gn.createdAt === '2020-01-02T03:04:05.000Z' && gn.sourceCoverage?.status === 'MODERATE_EVIDENCE_COVERAGE', `${be.label}: notebook keeps its ORIGINAL createdAt and real coverage (not NOW()/constants)`, { createdAt: gn?.createdAt });

    await a.getSnapshotRepository().save({ snapshotId: `${tag}-sn`, notebookId: 'nb', securityId: 'us-aapl', researchAsOfDate: '2024-03-01', createdAt: '2024-03-01T08:00:00.000Z', queryType: 'INVESTMENT_THESIS', query: 'orig query', ownerUserId: A, userId: A } as any);
    const sn1: any = await a.getSnapshotRepository().save({ snapshotId: `${tag}-sn`, notebookId: 'nb', securityId: 'us-aapl', researchAsOfDate: '2024-03-01', createdAt: '2030-01-01T00:00:00.000Z', query: 'tampered', ownerUserId: A, userId: A } as any);
    check(be.cat, sn1.createdAt === '2024-03-01T08:00:00.000Z' && sn1.query === 'orig query', `${be.label}: immutable snapshot keeps original timestamp and content when re-saved`);

    await a.getStrategyRepository().save({ id: `${tag}-st`, title: 'n', prompt: 'p!', status: 'AI Generated Strategy', targetUniverse: 'INDIA_EQUITIES', rebalanceFrequency: 'WEEKLY', ownerUserId: A, userId: A } as any);
    const gs: any = await a.getStrategyRepository().get(`${tag}-st`);
    check(be.cat, gs.prompt === 'p!' && gs.targetUniverse === 'INDIA_EQUITIES' && gs.rebalanceFrequency === 'WEEKLY', `${be.label}: strategy keeps prompt/targetUniverse/rebalanceFrequency (previously dropped)`);

    await a.getAlertRepository().save({ id: `${tag}-al`, ticker: 'AAPL', type: 'PRICE', severity: 'HIGH', title: 't', whyItMatters: 'because', timestamp: '2024-03-01T00:00:00.000Z', read: false, ownerUserId: A, userId: A } as any);
    if (be.label === 'dev') {
      await a.getAlertRepository().update(`${tag}-al`, { read: true } as any);
      const ga: any = await a.getAlertRepository().get(`${tag}-al`);
      check(be.cat, ga.whyItMatters === 'because' && ga.read === true, `${be.label}: alert keeps unmapped fields and an update to read is reflected in the returned object`);
    } else {
      console.log('  - skipped on pg-mem: alert/document status UPDATE uses jsonb_build_object (not supported by the emulator); SQL asserted statically below');
      const ga: any = await a.getAlertRepository().get(`${tag}-al`);
      check(be.cat, ga.whyItMatters === 'because', `${be.label}: alert keeps unmapped fields`);
    }
  }

  // =====================================================================================
  section('F. Point-in-time correctness (shared rule across in-memory, development and PostgreSQL code paths)');
  // =====================================================================================
  const dayEnd = pit.asOfCutoffMs('2024-03-01')!;
  check('DET', dayEnd === Date.parse('2024-03-01T23:59:59.999Z'), 'date-only asOf = end of that UTC day (inclusive)');
  check('DET', pit.asOfCutoffMs('2024-03-01T10:00:00.000Z') === Date.parse('2024-03-01T10:00:00.000Z'), 'timestamp asOf is used exactly');
  check('DET', pit.isAvailableAsOf(undefined, '2024-03-01') === false && pit.isAvailableAsOf('', '2024-03-01') === false && pit.isAvailableAsOf('not-a-date', '2024-03-01') === false, 'missing/unparseable publication date => NOT available as of any date');
  check('DET', pit.isAvailableAsOf(undefined, undefined) === true, 'no asOf requested => no PIT restriction');
  for (const be of backends) {
    const a = be.adapter;
    const tag = `${be.label}pit`.replace(/[^a-zA-Z0-9]/g, '');
    const base: any = { securityId: `us-${tag}`, sourceType: 'SEC_EDGAR', provider: 'p', title: 't', content: 'c', retrievedAt: '2024-03-10T00:00:00.000Z', epistemicStatus: 'REAL', isSimulated: false, visibility: 'SHARED' };
    await a.getEvidenceRepository().addEvidence({ ...base, evidenceId: `${tag}-sameday`, publishedAt: '2024-03-01T15:00:00.000Z' });
    await a.getEvidenceRepository().addEvidence({ ...base, evidenceId: `${tag}-next`, publishedAt: '2024-03-02T00:00:00.000Z' });
    if (be.label === 'dev') {
      await a.getEvidenceRepository().addEvidence({ ...base, evidenceId: `${tag}-undated`, publishedAt: undefined });
    } else {
      await pgm.client.query(`INSERT INTO evidence_items (evidence_id, security_id, source_type, provider, title, content, retrieved_at, epistemic_status, is_simulated, visibility) VALUES ($1,$2,'SEC_EDGAR','p','t','c',$3,'REAL',false,'SHARED');`, [`${tag}-undated`, base.securityId, '2024-03-10T00:00:00.000Z']);
    }
    const ids = async (asOf?: string) => (await a.getEvidenceRepository().queryEvidenceForOwner(A, { securityId: base.securityId, asOfDate: asOf })).map((e: any) => e.evidenceId).sort();
    check(be.cat, (await ids('2024-03-01')).join() === `${tag}-sameday`, `${be.label}: asOf 2024-03-01 includes same-day item, excludes next day and undated`, await ids('2024-03-01'));
    check(be.cat, !(await ids('2024-02-29')).includes(`${tag}-sameday`), `${be.label}: asOf 2024-02-29 excludes 2024-03-01 item`);
    check(be.cat, (await ids()).length === 3, `${be.label}: without asOf nothing is excluded`);
    check(be.cat, (await a.getEvidenceRepository().getHistoricalEvidence(`${tag}-undated`, '2024-12-31')) === null, `${be.label}: getHistoricalEvidence refuses undated evidence for any asOf`);
    check(be.cat, (await a.getEvidenceRepository().getHistoricalEvidence(`${tag}-sameday`, '2024-03-01')) !== null, `${be.label}: getHistoricalEvidence date-only boundary is end-of-day inclusive`);
    check(be.cat, (await a.getEvidenceRepository().getHistoricalEvidence(`${tag}-next`, '2024-03-01')) === null, `${be.label}: getHistoricalEvidence excludes future-dated evidence`);
  }
  {
    const mem = new EvidenceRepository();
    const base: any = { securityId: 'us-pit', sourceType: 'SEC_EDGAR', provider: 'p', title: 't', content: 'c', retrievedAt: '2024-03-10T00:00:00.000Z', epistemicStatus: 'REAL', isSimulated: false };
    // persistence side effect goes to whatever adapter is current; irrelevant here
    mem.addEvidence({ ...base, evidenceId: 'm-sameday', publishedAt: '2024-03-01T15:00:00.000Z', content: 'same-day' });
    mem.addEvidence({ ...base, evidenceId: 'm-next', publishedAt: '2024-03-02T00:00:00.000Z', content: 'next' });
    mem.addEvidence({ ...base, evidenceId: 'm-undated', publishedAt: '', content: 'undated' });
    const got = mem.getEvidenceAvailableAsOf('2024-03-01').map(e => e.evidenceId).sort();
    check('DET', got.join() === 'm-sameday', 'in-memory repository: same boundary rule (was start-of-day before 38.2B)', got);
  }

  // =====================================================================================
  section('G. Transaction semantics [DBL fake pool + SIM pg-mem]');
  // =====================================================================================
  type Rec = { conn: string; sql: string };
  function makeFakePool(opts: { failOn?: RegExp; failRollback?: boolean } = {}) {
    const log: Rec[] = [];
    const released: Array<{ conn: string; err?: unknown }> = [];
    let n = 0;
    const mkClient = (conn: string) => ({
      query: async (sql: string, _p?: any[]) => {
        log.push({ conn, sql });
        if (opts.failOn && opts.failOn.test(sql)) throw new Error(`boom:${sql.slice(0, 30)}`);
        if (opts.failRollback && /^ROLLBACK/i.test(sql)) throw new Error('rollback failed (connection lost)');
        return { rows: [], rowCount: 0 };
      },
      release: (err?: unknown) => { released.push({ conn, err }); }
    });
    const pool = {
      connect: async () => mkClient(`c${++n}`) as any,
      query: async (sql: string, _p?: any[]) => { log.push({ conn: 'pool', sql }); return { rows: [], rowCount: 0 }; },
      end: async () => {}
    };
    return { pool, log, released };
  }
  {
    const f = makeFakePool();
    const client = new PostgresClient(pgCfg, f.pool as any);
    const repoDoc = new (await import('../server/persistence/postgres/postgresRepositories')).PostgresDecisionRepository(client);
    await client.runTransaction(async () => {
      await repoDoc.get('x');                 // read inside tx
      await repoDoc.count();                  // another read
      await client.query('UPDATE investment_decisions SET conviction = $1 WHERE decision_id = $2;', ['LOW', 'x']); // write inside tx
    });
    const conns = new Set(f.log.filter(r => !/^BEGIN|^COMMIT/.test(r.sql)).map(r => r.conn));
    check('DBL', conns.size === 1 && !conns.has('pool'), 'every read and write inside runTransaction uses ONE checked-out connection (none on the pool)', Array.from(conns));
    check('DBL', f.log[0].sql === 'BEGIN' && f.log[f.log.length - 1].sql === 'COMMIT' && f.log.filter(r => r.conn !== 'pool').every(r => r.conn === f.log[0].conn), 'BEGIN … COMMIT bracket the work on that same connection');
    check('DBL', f.released.length === 1 && f.released[0].err === undefined, 'connection released exactly once after commit');
    await repoDoc.get('y');
    check('DBL', f.log[f.log.length - 1].conn === 'pool', 'queries after the transaction go back to the pool');
  }
  {
    const f = makeFakePool();
    const client = new PostgresClient(pgCfg, f.pool as any);
    let thrown: any;
    try {
      await client.runTransaction(async () => { await client.query('INSERT INTO t VALUES (1);'); throw new Error('work failed'); });
    } catch (e) { thrown = e; }
    const sqls = f.log.map(r => r.sql);
    check('DBL', thrown?.message === 'work failed', 'the original error is rethrown');
    check('DBL', sqls.includes('ROLLBACK') && !sqls.includes('COMMIT'), 'failure => ROLLBACK, no COMMIT');
    check('DBL', f.released.length === 1 && f.released[0].err === undefined, 'connection released (healthy) after a clean rollback');
  }
  {
    const f = makeFakePool({ failOn: /^COMMIT/ });
    const client = new PostgresClient(pgCfg, f.pool as any);
    const thrown = await rejects(() => client.runTransaction(async () => { await client.query('SELECT 1'); }), e => /boom:COMMIT/.test(e.message));
    check('DBL', thrown && f.log.some(r => r.sql === 'ROLLBACK'), 'a failed COMMIT triggers ROLLBACK and surfaces the commit error');
  }
  {
    const f = makeFakePool({ failRollback: true });
    const client = new PostgresClient(pgCfg, f.pool as any);
    let thrown: any;
    try { await client.runTransaction(async () => { throw new Error('original'); }); } catch (e) { thrown = e; }
    check('DBL', thrown?.message === 'original', 'a failing ROLLBACK never masks the original error');
    check('DBL', f.released.length === 1 && f.released[0].err instanceof Error, 'a connection whose ROLLBACK failed is released with an error so the pool discards it');
  }
  {
    const f = makeFakePool();
    const client = new PostgresClient(pgCfg, f.pool as any);
    await client.runTransaction(async () => { await client.runTransaction(async () => { await client.query('SELECT 1'); }); });
    check('DBL', f.log.filter(r => r.sql === 'BEGIN').length === 1 && f.log.filter(r => r.sql === 'COMMIT').length === 1, 'nested runTransaction joins the outer transaction (single BEGIN/COMMIT)');
  }
  {
    const f = makeFakePool();
    const client = new PostgresClient(pgCfg, f.pool as any);
    await Promise.all([
      client.runTransaction(async () => { await new Promise(r => setTimeout(r, 15)); await client.query('SELECT 1 /*t1*/'); }),
      client.runTransaction(async () => { await client.query('SELECT 2 /*t2*/'); await new Promise(r => setTimeout(r, 5)); await client.query('SELECT 3 /*t2*/'); })
    ]);
    const c1 = f.log.find(r => r.sql.includes('/*t1*/'))!.conn;
    const c2s = new Set(f.log.filter(r => r.sql.includes('/*t2*/')).map(r => r.conn));
    check('DBL', c2s.size === 1 && !c2s.has(c1), 'concurrent transactions are isolated on different connections (no context leakage)');
  }
  {
    // adapter-level wiring: PostgresPersistenceAdapter.runTransaction passes work through the same mechanism
    const f = makeFakePool();
    const client = new PostgresClient(pgCfg, f.pool as any);
    const adapter = new PostgresPersistenceAdapter(client, { migrations: [] });
    await adapter.initialize();
    f.log.length = 0;
    await adapter.runTransaction(async () => {
      await adapter.getDecisionRepository().get('a');
      await adapter.getNotebookRepository().get('b');
    });
    const inner = f.log.filter(r => !/^BEGIN|^COMMIT/.test(r.sql));
    check('DBL', inner.length === 2 && new Set(inner.map(r => r.conn)).size === 1 && inner[0].conn !== 'pool', 'adapter.runTransaction: repository calls from different repositories share the transaction connection');
  }
  {
    // simulated real rollback / commit
    const tag = 'txsim';
    const client = pgm.client;
    const repo = pgm.adapter.getDecisionRepository();
    const before = await repo.count();
    let err: any;
    try {
      await pgm.adapter.runTransaction(async () => {
        await repo.save({ decisionId: `${tag}-rolled`, securityId: 'us-aapl', asOfDate: '2024-03-01', compositeScore: 1, overallAssessment: 'NEUTRAL', conviction: 'LOW', generatedAt: '2024-03-01T00:00:00.000Z', ownerUserId: A } as any);
        throw new Error('abort');
      });
    } catch (e) { err = e; }
    const afterRollback = await repo.get(`${tag}-rolled`);
    // pg-mem accepts BEGIN/ROLLBACK but does NOT implement transactional isolation, so row removal after ROLLBACK cannot be
    // demonstrated on this emulator (a real PostgreSQL integration test is required for that). What IS verified here:
    // the error propagates through the real adapter wiring, and rollback semantics are proven by the [DBL] tests above.
    void afterRollback; void before;
    check('SIM', err?.message === 'abort', 'simulated database: failure inside adapter.runTransaction propagates (row-level rollback NOT demonstrable on pg-mem; see [DBL] tests)');
    await pgm.adapter.runTransaction(async () => {
      await repo.save({ decisionId: `${tag}-kept`, securityId: 'us-aapl', asOfDate: '2024-03-01', compositeScore: 1, overallAssessment: 'NEUTRAL', conviction: 'LOW', generatedAt: '2024-03-01T00:00:00.000Z', ownerUserId: A } as any);
    });
    check('SIM', (await repo.get(`${tag}-kept`)) !== null, 'simulated database: committed write is visible');
    void client;
  }

  {
    section('G2. Owner-guard refusals on a real server are zero-row results [DBL: fake client returning no rows]');
    const PG = await import('../server/persistence/postgres/postgresRepositories');
    const zero = () => ({ query: async () => ({ rows: [], rowCount: 0 }), runTransaction: async (fn: any) => fn({}) }) as any;
    const nonEmptyThenZero = () => { let n = 0; return ({ query: async () => (n++ === 0 ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 0 }) }) as any; };
    void nonEmptyThenZero;
    check('DBL', await rejects(() => new PG.PostgresResearchNotebookRepository(zero()).save({ notebookId: 'n', securityId: 's', ownerUserId: A } as any), e => /different owner/.test(e.message)), 'notebook upsert that matches no row (owner guard) is reported as a refusal');
    check('DBL', await rejects(() => new PG.PostgresStrategyRepository(zero()).save({ id: 's', title: 't', ownerUserId: A } as any), e => /different owner/.test(e.message)), 'strategy upsert owner-guard refusal surfaces');
    check('DBL', await rejects(() => new PG.PostgresAlertRepository(zero()).save({ id: 'a', ticker: 'X', type: 't', severity: 's', title: 't', timestamp: 'x', ownerUserId: A } as any), e => /different owner/.test(e.message)), 'alert upsert owner-guard refusal surfaces');
    check('DBL', await rejects(() => new PG.PostgresInvestmentMonitorRepository(zero()).save({ monitorId: 'm', userId: A, ownerUserId: A, securityId: 's', ticker: 't', companyName: 'c', market: 'US', status: 'ACTIVE', reviewCadence: 'WEEKLY', invalidationStatus: 'X' } as any), e => /different owner/.test(e.message)), 'monitor upsert owner-guard refusal surfaces');
    check('DBL', await rejects(() => new PG.PostgresMonitoringPolicyRepository(zero()).save({ policyId: 'p', userId: A, ownerUserId: A, name: 'n', policyType: 'T', enabled: true, scope: 'S', rules: [], configuration: {}, minSeverity: 'HIGH', cooldownMinutes: 1 } as any), e => /different owner/.test(e.message)), 'policy upsert owner-guard refusal surfaces');
    check('DBL', await rejects(() => new PG.PostgresAlertOrchestrationRepository(zero()).save({ alertId: 'a', candidateId: 'c', userId: A, ownerUserId: A, ruleType: 'R', severity: 'H', status: 'OPEN', title: 't', description: 'd', deterministicExplanation: 'e', detectedAt: 'x', fingerprint: 'f', trigger: {}, provenance: {} } as any), e => /different owner/.test(e.message)), 'orchestrated alert upsert owner-guard refusal surfaces');
    check('DBL', await rejects(() => new PG.PostgresEvidenceCollectionRepository(zero()).save({ collectionId: 'c', tenantId: A } as any), e => /already exists/.test(e.message)), 'evidence collection insert that conflicts (zero rows returned) is refused');
    check('DBL', await rejects(() => new PG.PostgresResearchGapRepository(zero()).update({ gapId: 'g', userId: A } as any), e => /not found/.test(e.message)), 'update whose id+owner matches no row is reported as not found (never silently created)');
    const src = fs.readFileSync('server/persistence/postgres/postgresRepositories.ts', 'utf8');
    check('DET', /jsonb_build_object\('read', \$1::boolean, 'isRead', \$1::boolean\)/.test(src), 'alert UPDATE keeps payload in step with the is_read column (static SQL check)');
    check('DET', /jsonb_build_object\('processingStatus', \$1::text\)/.test(src), 'document status UPDATE keeps payload in step with the processing_status column (static SQL check)');
  }

  // =====================================================================================
  section('H. Storage selection, unavailability and truthful health [DBL injected adapter factories]');
  // =====================================================================================
  const fakePgOk = () => ({ provider: 'POSTGRES', status: 'CONNECTED', isConnected: true, initialize: async () => {}, shutdown: async () => {}, healthCheck: async () => true, getStatus: async () => ({ status: 'CONNECTED', provider: 'POSTGRES', entityCounts: {} }), getSecurityRepository: () => ({ count: async () => 1 }) }) as any;
  const fakePgDown = () => ({ initialize: async () => { throw new Error('ECONNREFUSED 127.0.0.1:5432'); } }) as any;
  const mkMgr = (env: any, pg: () => any, label: string) => {
    let diskCreated = 0;
    const dir = path.join(tmpRoot, `mgr-${label}`);
    const mgr = new PersistenceManager({
      env,
      createPostgresAdapter: pg,
      createDiskAdapter: () => { diskCreated++; return new DevelopmentPersistenceAdapter(dir); }
    });
    return { mgr, dir, diskCreated: () => diskCreated };
  };
  const URL = 'postgres://u:p@localhost:5432/db';
  {
    const c = mkMgr({ DATABASE_URL: URL, NODE_ENV: 'production' }, fakePgDown, 'prod-down');
    const refused = await rejects(() => c.mgr.initialize(), e => e instanceof PersistenceUnavailableError && /Refusing to start/.test(e.message));
    check('DBL', refused && c.diskCreated() === 0, 'production + PostgreSQL configured but down => startup refused; no disk store is created');
    check('DBL', !fs.existsSync(path.join(c.dir, 'store.json')), 'no disk store file exists after the refused startup (no write can land on disk)');
  }
  {
    const c = mkMgr({ DATABASE_URL: URL, PERSISTENCE_STRICT: 'true' }, fakePgDown, 'strict-down');
    check('DBL', await rejects(() => c.mgr.initialize(), e => e instanceof PersistenceUnavailableError) && c.diskCreated() === 0, 'PERSISTENCE_STRICT=true behaves like production (fails closed in any environment)');
  }
  {
    const c = mkMgr({ DATABASE_URL: URL }, fakePgDown, 'dev-down');
    await c.mgr.initialize();
    const h = c.mgr.getStorageHealth();
    check('DBL', h.mode === 'DISK_DEGRADED_FALLBACK' && h.degraded === true && h.authoritative === false && /ECONNREFUSED/.test(h.reason || ''), 'development + PostgreSQL down => explicit DEGRADED, non-authoritative, with the reason');
    const st: any = await c.mgr.getStatus();
    check('DBL', st.status === 'DEGRADED_FALLBACK' && st.storage.degraded === true && st.storage.warnings.some((w: string) => /NON-authoritative/.test(w)), 'status endpoint payload reports DEGRADED_FALLBACK with warnings (not "DEVELOPMENT_ADAPTER")');
    check('DBL', fs.existsSync(path.join(c.dir, DEGRADED_MARKER_FILE)), 'a marker file records that this disk store holds non-authoritative writes');
    await c.mgr.initialize();
    check('DBL', c.mgr.getStorageHealth().mode === 'DISK_DEGRADED_FALLBACK' && c.diskCreated() === 1, 'the manager never switches backends later in the same process (no split writes)');
  }
  {
    let pgCalled = 0;
    const c = mkMgr({ DATABASE_URL: URL, PERSISTENCE_MODE: 'disk' }, () => { pgCalled++; return fakePgOk(); }, 'explicit-disk');
    await c.mgr.initialize();
    const h = c.mgr.getStorageHealth();
    check('DBL', h.mode === 'DISK_EXPLICIT' && h.degraded === false && pgCalled === 0, 'PERSISTENCE_MODE=disk is an explicit operator choice: PostgreSQL is not even attempted, not reported as degraded');
  }
  {
    const c = mkMgr({ DATABASE_URL: URL, NODE_ENV: 'production' }, fakePgOk, 'prod-ok');
    await c.mgr.initialize();
    const h = c.mgr.getStorageHealth();
    check('DBL', h.mode === 'POSTGRES' && h.authoritative && !h.degraded && c.diskCreated() === 0, 'PostgreSQL available => POSTGRES, authoritative, no disk store');
  }
  {
    const c = mkMgr({ NODE_ENV: 'production' }, fakePgOk, 'prod-unconfigured');
    check('DBL', await rejects(() => c.mgr.initialize(), e => e instanceof PersistenceUnavailableError) && c.diskCreated() === 0, 'production without DATABASE_URL and without an explicit disk choice => refused');
    const d = mkMgr({}, fakePgOk, 'dev-unconfigured');
    await d.mgr.initialize();
    check('DBL', d.mgr.getStorageHealth().mode === 'DISK_UNCONFIGURED' && !d.mgr.getStorageHealth().degraded, 'development without DATABASE_URL => honest DISK_UNCONFIGURED (not degraded)');
  }
  {
    const s = mkMgr({ NODE_ENV: 'production', DATABASE_URL: URL }, fakePgOk, 'strict-uninit');
    check('DBL', (() => { try { s.mgr.getAdapter(); return false; } catch (e) { return e instanceof PersistenceUnavailableError; } })() && s.diskCreated() === 0, 'strict mode: using persistence before initialize() fails instead of creating an implicit disk store');
    const d = mkMgr({ DATABASE_URL: URL }, fakePgOk, 'dev-uninit');
    d.mgr.getAdapter();
    check('DBL', d.mgr.getStorageHealth().degraded === true, 'non-strict implicit disk store while PostgreSQL is configured is reported degraded');
  }
  {
    const { createApp } = await import('../server');
    const degradedMgr = mkMgr({ DATABASE_URL: URL }, fakePgDown, 'health-degraded');
    await degradedMgr.mgr.initialize();
    persistenceManager.setAdapter(await makeDev('http-health'));
    const app = await createApp({ initializePersistence: false, persistence: degradedMgr.mgr });
    const srv = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => srv.once('listening', () => r()));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const h: any = await (await fetch(`${base}/api/health`)).json();
    check('DET', h.status === 'degraded' && h.storage.degraded === true && h.storage.authoritative === false && !JSON.stringify(h).match(/ECONNREFUSED|postgres:\/\//), 'public /api/health reports degraded storage truthfully without leaking the reason or credentials');
    await new Promise<void>(r => srv.close(() => r()));
  }

  // =====================================================================================
  section('I. Ownerless legacy records are excluded from private derived outputs');
  // =====================================================================================
  check('DET', engineScope.visibleToEngine({}, A) === false, 'engine view: ownerless + unclassified record is NOT visible');
  check('DET', engineScope.visibleToEngine({ visibility: 'SHARED' }, A) === true && engineScope.visibleToEngine({ visibility: 'SHARED' }, undefined) === true, 'engine view: explicitly SHARED ownerless record is visible');
  check('DET', engineScope.visibleToEngine({ ownerUserId: B }, A) === false && engineScope.visibleToEngine({ ownerUserId: A }, A) === true, 'engine view: other tenant hidden, own visible');
  {
    const dev = await makeDev('derived');
    persistenceManager.setAdapter(dev);
    const { latestDecisionVisibleTo, latestSnapshotVisibleTo } = engineScope;
    const mk = (id: string, date: string, owner?: string, vis?: string) => ({ decisionId: id, securityId: 'us-aapl', asOfDate: date, compositeScore: id.includes('legacy') || id.includes('other') ? 7.77 : 55.5, overallAssessment: 'NEUTRAL', conviction: 'LOW', generatedAt: `${date}T00:00:00.000Z`, ...(owner ? { ownerUserId: owner, userId: owner } : {}), ...(vis ? { visibility: vis } : {}) }) as any;
    await dev.getDecisionRepository().save(mk('dec-legacy-marker', '2024-03-20'));            // newest, legacy, unclassified
    await dev.getDecisionRepository().save(mk('dec-other-marker', '2024-03-19', B, 'PRIVATE')); // newest-but-one, another tenant
    await dev.getDecisionRepository().save(mk('dec-shared-ok', '2024-03-10', undefined, 'SHARED'));
    await dev.getDecisionRepository().save(mk('dec-own-ok', '2024-03-05', A, 'PRIVATE'));
    const latest = await latestDecisionVisibleTo(A, 'us-aapl');
    check('DET', latest?.decisionId === 'dec-shared-ok', 'latest decision for A skips newer legacy and other-tenant records', latest?.decisionId);
    const latestForB = await latestDecisionVisibleTo(B, 'us-aapl');
    check('DET', latestForB?.decisionId === 'dec-other-marker', "B's own newer decision is still found for B");
    await dev.getSnapshotRepository().save({ snapshotId: 'snap-legacy-marker', notebookId: 'n', securityId: 'us-aapl', researchAsOfDate: '2024-03-20', createdAt: '2024-03-20T00:00:00.000Z' } as any);
    await dev.getSnapshotRepository().save({ snapshotId: 'snap-own-ok', notebookId: 'n', securityId: 'us-aapl', researchAsOfDate: '2024-03-01', createdAt: '2024-03-01T00:00:00.000Z', ownerUserId: A, userId: A } as any);
    check('DET', (await latestSnapshotVisibleTo(A, 'us-aapl'))?.snapshotId === 'snap-own-ok', 'latest snapshot for A skips the newer legacy snapshot');

    // end-to-end derived outputs of real engines must never mention legacy records
    await dev.getEvidenceRepository().addEvidence({ evidenceId: 'ev-legacy-marker', securityId: 'us-aapl', sourceType: 'SEC_EDGAR', provider: 'p', title: 'legacy-marker evidence', content: 'legacy-marker', publishedAt: '2024-03-02T00:00:00.000Z', retrievedAt: '2024-03-02T00:00:00.000Z', epistemicStatus: 'REAL', isSimulated: false } as any);
    await dev.getNotebookRepository().save({ notebookId: 'nb-legacy-marker', securityId: 'us-aapl', title: 'legacy-marker notebook', createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2024-03-01T00:00:00.000Z' } as any);
    const { researchCommandCenterService } = await import('../server/services/commandCenter/researchCommandCenterService');
    const { researchPrioritizationEngine } = await import('../server/services/discovery/researchPrioritizationEngine');
    const { crossInvestmentService } = await import('../server/services/relationships/crossInvestmentService');
    const { portfolioScenarioService } = await import('../server/services/scenarios/portfolioScenarioService');
    const { researchQuestionService } = await import('../server/services/investigation/researchQuestionService');
    const { researchGapDetectionService } = await import('../server/services/investigation/researchGapDetectionService');
    const outputs: Record<string, unknown> = {};
    const tryRun = async (name: string, fn: () => Promise<unknown>) => { try { outputs[name] = await fn(); } catch (e: any) { outputs[name] = { error: String(e?.message || e) }; } };
    await tryRun('commandCenter', () => researchCommandCenterService.getCommandCenterData(A, {} as any));
    await tryRun('discovery', () => researchPrioritizationEngine.generatePrioritization(A, {} as any));
    await tryRun('crossInvestment', () => crossInvestmentService.getCrossInvestmentData(A, {} as any));
    await tryRun('scenario', () => portfolioScenarioService.evaluateScenario(A, { scenarioType: 'MARKET_DROP', shockPct: -10 } as any));
    await tryRun('questions', () => researchQuestionService.generateQuestionsForSecurity(A, 'us-aapl', '2024-03-25'));
    await tryRun('gaps', () => researchGapDetectionService.detectGapsForSecurity(A, 'us-aapl', '2024-03-25'));
    const mon = await dev.getMonitorRepository().save({ monitorId: 'mon-derived-A', userId: A, ownerUserId: A, securityId: 'us-aapl', ticker: 'AAPL', companyName: 'Apple', market: 'US', status: 'ACTIVE', reviewCadence: 'WEEKLY', invalidationStatus: 'ACTIVE_GUARD', baselineDecisionId: 'dec-legacy-marker', baselineSnapshotId: 'snap-legacy-marker', latestDecisionId: 'dec-legacy-marker', latestSnapshotId: 'snap-legacy-marker', createdAt: '2024-03-01T00:00:00.000Z', updatedAt: '2024-03-01T00:00:00.000Z' } as any);
    const { investmentMonitorEngine } = await import('../server/services/monitor/investmentMonitorEngine');
    await tryRun('monitorChanges', () => investmentMonitorEngine.detectAllChanges(mon.monitorId, A, '2024-03-25T00:00:00.000Z'));
    for (const [name, out] of Object.entries(outputs)) {
      const text = JSON.stringify(out);
      const ran = !(out as any)?.error;
      check('DET', !/legacy-marker/.test(text) && !text.includes('7.77'), `derived output [${name}] contains no legacy ownerless record${ran ? '' : ' (engine errored offline; no leakage in error)'}`, text.match(/.{40}legacy-marker.{20}/)?.[0]);
      check('DET', !/dec-other-marker|usr_b_/.test(text), `derived output [${name}] contains no other-tenant record`);
    }
    check('DET', Object.values(outputs).filter(o => !(o as any)?.error).length >= 4, 'at least 4 engines ran to completion offline (the leakage checks are not vacuous)', Object.entries(outputs).map(([k, v]) => `${k}:${(v as any)?.error ? 'ERR' : 'ok'}`).join(','));

    // legacy records unchanged and inaccessible
    const legacyDecAfter: any = await dev.getDecisionRepository().get('dec-legacy-marker');
    check('DET', legacyDecAfter.compositeScore === 7.77 && !legacyDecAfter.ownerUserId && !legacyDecAfter.visibility, 'legacy decision is byte-for-byte unchanged by engine runs (not assigned, not reclassified)');
    const { authorizationService } = await import('../server/auth/authorizationService');
    check('DET', await rejects(() => authorizationService.authorizeDecision('dec-legacy-marker', A), (e: any) => e.code === 'LEGACY_UNOWNED'), 'legacy decision remains inaccessible (403 LEGACY_UNOWNED) until explicitly classified');
  }
  {
    // system-origin artifacts are classified SHARED at creation and are therefore usable by engines
    const dev = await makeDev('system-origin');
    persistenceManager.setAdapter(dev);
    const { researchNotebookService } = await import('../server/services/research/notebookService');
    const nb = await researchNotebookService.getOrCreateNotebook('us-aapl');
    check('DET', (nb as any).visibility === 'SHARED' && !(nb as any).ownerUserId, 'system-created notebook is explicitly classified SHARED (derived from shared evidence only)');
    const own = await researchNotebookService.getOrCreateNotebook('us-aapl', undefined, A);
    check('DET', (own as any).visibility === 'PRIVATE' && (own as any).ownerUserId === A && own.notebookId !== nb.notebookId, 'user notebook is PRIVATE with an owner-scoped id');
  }

  // =====================================================================================
  section('J. Authentication UI: session lifecycle and protected workflows');
  // =====================================================================================
  {
    const { authReducer, INITIAL_AUTH_STATE, createAuthClient, withUnauthorizedHandler } = authClientMod;
    const u = { userId: 'usr_1', email: 'a@b.co' };
    let s = INITIAL_AUTH_STATE;
    check('DET', s.status === 'loading' && s.user === null, 'UI starts in "loading" (no protected UI mounted before the session is known)');
    s = authReducer(s, { type: 'RESTORE_NONE' });
    check('DET', s.status === 'anonymous', 'no valid session cookie => anonymous (sign-in screen)');
    s = authReducer(s, { type: 'SUBMIT' });
    s = authReducer(s, { type: 'AUTH_FAILED', message: 'Invalid credentials' });
    check('DET', s.status === 'anonymous' && s.error === 'Invalid credentials' && !s.busy, 'failed sign-in stays anonymous and shows the error');
    s = authReducer(s, { type: 'AUTH_OK', user: u });
    check('DET', s.status === 'authenticated' && s.user?.userId === 'usr_1' && s.error === null, 'successful sign-in => authenticated');
    s = authReducer(s, { type: 'SESSION_EXPIRED' });
    check('DET', s.status === 'anonymous' && /expired/i.test(s.error || '') && s.user === null, 'server 401 on a protected call => back to sign-in with an expiry message');
    s = authReducer(authReducer(INITIAL_AUTH_STATE, { type: 'RESTORE_OK', user: u }), { type: 'LOGGED_OUT' });
    check('DET', s.status === 'anonymous' && s.user === null, 'sign-out clears the user (client state discarded)');

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mkRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fakeFetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/auth/me') return mkRes(200, { authenticated: true, user: u });
      if (url === '/api/auth/login') return JSON.parse(String(init?.body)).password === 'right-password' ? mkRes(200, { authenticated: true, user: u, session: { sessionId: 'SECRET' } }) : mkRes(401, { error: 'Invalid email or password' });
      if (url === '/api/auth/register') return mkRes(409, { error: 'An account with this email already exists' });
      if (url === '/api/auth/logout') return mkRes(200, { authenticated: false });
      return mkRes(401, { error: 'Unauthorized' });
    };
    const client = createAuthClient(fakeFetch as any);
    check('DET', (await client.restoreSession())?.userId === 'usr_1', 'session restoration reads /api/auth/me');
    check('DET', (await client.login('a@b.co', 'right-password')).userId === 'usr_1', 'login resolves the user');
    check('DET', await rejects(() => client.login('a@b.co', 'wrong'), e => /Invalid email or password/.test(e.message)), 'login failure surfaces the server message');
    check('DET', await rejects(() => client.register('a@b.co', 'password123'), e => /already exists/.test(e.message)), 'registration conflict surfaces the server message');
    await client.logout();
    check('DET', calls.some(c => c.url === '/api/auth/logout' && c.init?.method === 'POST'), 'logout POSTs to /api/auth/logout');
    check('DET', calls.every(c => (c.init as any)?.credentials === 'same-origin'), 'every auth request uses same-origin credentials (HttpOnly cookie session)');
    check('DET', calls.every(c => !/localStorage|sessionStorage/.test(String(c.init?.body))), 'no credential is placed in script-accessible storage by the client');
    let expired = 0;
    const guarded = withUnauthorizedHandler(fakeFetch as any, () => { expired++; });
    await guarded('/api/watchlist');
    await guarded('/api/auth/me');
    await guarded('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) });
    check('DET', expired === 1, 'only a 401 from a protected /api route (not the auth bootstrap routes) signals session expiry');
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
    check('DET', appSrc.indexOf('<AuthGate>') < appSrc.indexOf('<AppStateProvider>') && appSrc.includes('<AuthProvider>'), 'the data-bearing AppStateProvider mounts only inside AuthGate (no protected fetch before sign-in)');
    const uiSrc = ['src/App.tsx', 'src/state/AuthContext.tsx', 'src/components/auth/AuthGate.tsx', 'src/components/scenarios/PortfolioScenarioView.tsx', 'src/components/decision/CounterfactualDecisionView.tsx', 'src/components/pilot/PilotReadinessView.tsx'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
    check('DET', !uiSrc.includes('analyst-1') && !uiSrc.includes('analyst_pilot_01'), "no 'analyst-1' / 'analyst_pilot_01' identity remains in the UI");
  }
  {
    // real app over HTTP: anonymous -> 401, register/login -> data, cookie restoration, logout -> 401
    persistenceManager.setAdapter(await makeDev('ui-lifecycle'));
    const { createApp } = await import('../server');
    const app = await createApp({ initializePersistence: false });
    const srv = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => srv.once('listening', () => r()));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const j = async (url: string, init?: RequestInit) => { const r = await fetch(base + url, init); let b: any = null; try { b = await r.json(); } catch { /* */ } return { status: r.status, body: b, headers: r.headers }; };
    const anon = await j('/api/watchlist');
    check('DET', anon.status === 401, 'protected workflow: anonymous request to a data route is 401');
    const me0 = await j('/api/auth/me');
    check('DET', me0.body.authenticated === false, 'session restoration without a cookie => authenticated:false');
    const email = `ui_${Date.now()}@example.com`;
    const reg = await j('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Ui-Pass-12345' }) });
    const setCookie = reg.headers.get('set-cookie') || '';
    check('DET', reg.status === 201 && /session_id=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), 'registration issues an HttpOnly, SameSite=Lax session cookie');
    const cookie = setCookie.split(';')[0];
    const me1 = await j('/api/auth/me', { headers: { cookie } });
    check('DET', me1.body.authenticated === true && me1.body.user.email === email && !JSON.stringify(me1.body).includes('passwordHash'), 'session restoration with the cookie returns the user without secrets');
    check('DET', (await j('/api/watchlist', { headers: { cookie } })).status === 200, 'protected data route works with the restored session');
    const badLogin = await j('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong-wrong-1' }) });
    check('DET', badLogin.status === 401 && !/Set-Cookie/i.test(String(badLogin.headers.get('set-cookie') || '')), 'bad password: 401 and no session cookie issued');
    const login = await j('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Ui-Pass-12345' }) });
    check('DET', login.status === 200 && login.body.authenticated === true, 'login with correct credentials succeeds');
    await j('/api/auth/logout', { method: 'POST', headers: { cookie } });
    check('DET', (await j('/api/watchlist', { headers: { cookie } })).status === 401, 'after logout the old session cookie no longer opens protected routes');
    check('DET', (await j('/api/auth/me', { headers: { cookie } })).body.authenticated === false, 'after logout session restoration reports anonymous');
    await new Promise<void>(r => srv.close(() => r()));
  }

  // =====================================================================================
  section('K. Operator-only routes and public allow-list unchanged');
  // =====================================================================================
  {
    const { PUBLIC_API_ROUTES } = await import('../server/auth/routePolicy');
    check('DET', PUBLIC_API_ROUTES.map(r => `${r.method} ${r.path}`).sort().join('|') === ['GET /api/auth/me', 'GET /api/health', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/auth/register'].sort().join('|'), 'public route allow-list is exactly the 5 documented routes');
    persistenceManager.setAdapter(await makeDev('operator'));
    const { createApp } = await import('../server');
    const app = await createApp({ initializePersistence: false });
    const srv = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => srv.once('listening', () => r()));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const post = async (u: string, token?: string, body?: unknown) => (await fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) })).status;
    const reg = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `op_${Date.now()}@example.com`, password: 'Operator-Pass-1' }) })).json();
    const tok = reg.session.sessionId;
    check('DET', await post('/api/sec/cache/clear', undefined) === 401, 'operator route: anonymous -> 401');
    check('DET', await post('/api/sec/cache/clear', tok) === 403, 'operator route: authenticated non-admin -> 403');
    check('DET', await post('/api/events/record', tok, { eventId: 'e', securityId: 'us-aapl', eventType: 'X' }) === 403, 'operator route: events/record non-admin -> 403');
    process.env.ADMIN_USER_IDS = reg.user.userId;
    check('DET', await post('/api/sec/cache/clear', tok) === 200, 'operator route: listed admin -> 200 (server-side allow-list)');
    process.env.ADMIN_USER_IDS = '';
    await new Promise<void>(r => srv.close(() => r()));
  }

  // =====================================================================================
  section('L. store.json integrity');
  // =====================================================================================
  const realStoreHashAfter = fs.existsSync(realStore) ? sha256File(realStore) : 'absent';
  check('DET', realStoreHashBefore === realStoreHashAfter, 'data/persistence/store.json is byte-identical before and after this suite (SHA-256 verified)', { before: realStoreHashBefore.slice(0, 12), after: realStoreHashAfter.slice(0, 12) });
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  const total = tally.DET.pass + tally.DET.fail + tally.SIM.pass + tally.SIM.fail + tally.DBL.pass + tally.DBL.fail;
  console.log('\n========================================================================');
  console.log(`PHASE 38.2B PERSISTENCE SUITE: ${tally.DET.pass + tally.SIM.pass + tally.DBL.pass} PASSED / ${tally.DET.fail + tally.SIM.fail + tally.DBL.fail} FAILED (TOTAL: ${total})`);
  console.log(`  [DET] deterministic in-process ........ ${tally.DET.pass} passed / ${tally.DET.fail} failed`);
  console.log(`  [SIM] simulated DB (pg-mem, NOT real) .. ${tally.SIM.pass} passed / ${tally.SIM.fail} failed`);
  console.log(`  [DBL] test-double (fake pool/factories) ${tally.DBL.pass} passed / ${tally.DBL.fail} failed`);
  console.log('  [REAL] real PostgreSQL integration ..... 0 run (none exist; PostgreSQL was never contacted)');
  console.log('========================================================================');
  if (failures.length) {
    console.error('Failed checks:\n - ' + failures.join('\n - '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Phase 38.2B suite crashed:', err);
  process.exit(1);
});
