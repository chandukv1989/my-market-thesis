/**
 * Phase 38.2D — Legacy Sharing Defect Remediation: regression suite
 *
 * Proves that private, ownerless/unclassified (legacy) and mixed-provenance inputs cannot be exposed through a derived
 * artifact that is classified SHARED:
 *   D1  legacy/private notebook snapshots can no longer influence a decision
 *   D2  an ownerless notebook snapshot built from a custom query / portfolio context is never SHARED
 *   D3  the same rule for the other decision inputs found by this audit (evidence, backtests, configuration)
 *   D4  chained scenario: restricted snapshot -> later system decision
 *
 * Isolation: a temp-dir development adapter is installed BEFORE any application module is loaded; provider calls are
 * stubbed; no network, no database. The original data/persistence/store.json is hashed before/after.
 */
process.env.MARKET_THESIS_DISABLE_AUTOSTART = '1';
process.env.NODE_ENV = 'test';
for (const k of ['DATABASE_URL', 'GEMINI_API_KEY', 'TWELVE_DATA_API_KEY', 'FYERS_APP_ID', 'FYERS_SECRET_KEY', 'FYERS_ACCESS_TOKEN', 'TRUEDATA_USERNAME', 'TRUEDATA_PASSWORD', 'FINMAGINE_API_KEY', 'PERSISTENCE_MODE', 'PERSISTENCE_STRICT']) process.env[k] = '';

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(c: unknown, name: string, detail?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.error(`  ✗ FAILED: ${name}${detail !== undefined ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
}
const section = (t: string) => console.log(`\n--- ${t} ---`);
const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function main() {
  const realStore = path.resolve(process.cwd(), 'data', 'persistence', 'store.json');
  const before = fs.existsSync(realStore) ? sha(realStore) : 'absent';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase38_2d-'));

  const { persistenceManager } = await import('../server/persistence/persistenceManager');
  const { DevelopmentPersistenceAdapter } = await import('../server/persistence/devAdapter/developmentPersistenceAdapter');
  const dev = new DevelopmentPersistenceAdapter(tmp);
  await dev.initialize();
  persistenceManager.setAdapter(dev);

  const { researchNotebookService } = await import('../server/services/research/notebookService');
  const { DecisionIntelligenceService } = await import('../server/services/decision/decisionIntelligenceService');
  const { financialDataService } = await import('../server/services/financialDataService');
  const { evidenceService } = await import('../server/services/evidence/evidenceService');
  const { evidenceRepository } = await import('../server/services/evidence/evidenceRepository');
  const { backtestService } = await import('../server/services/backtest/backtestService');
  const { evaluateAccess } = await import('../server/auth/accessPolicy');
  const { visibleToEngine } = await import('../server/auth/engineScope');

  // ---- deterministic stubs (no provider/network) ----
  (financialDataService as any).getSecurityFinancials = async () => { throw new Error('offline'); };
  (financialDataService as any).getHistoricalPrices = async () => { throw new Error('offline'); };
  (evidenceService as any).gatherEvidence = async () => [];
  const decisionSvc = new (DecisionIntelligenceService as any)() as InstanceType<typeof DecisionIntelligenceService>;

  const A = 'usr_owner_a';
  const B = 'usr_owner_b';
  const SEC = 'us-aapl';
  const ASOF = '2024-06-01';
  const nbId = researchNotebookService.notebookIdFor(SEC); // shared system notebook id
  const snap = (id: string, marker: string, extra: Record<string, unknown> = {}) => ({
    snapshotId: id, notebookId: nbId, securityId: SEC, createdAt: '2024-05-20T00:00:00.000Z', researchAsOfDate: '2024-05-20',
    thesis: { executiveThesis: marker, bullCase: { summary: marker, points: [marker], evidenceIds: [] }, bearCase: { summary: '', points: [], evidenceIds: [] }, risks: [{ title: `${marker}-RISK`, severity: 'HIGH', description: marker }], catalysts: [] },
    claims: [], risks: [], catalysts: [], conflicts: [], evidenceIds: [], evidenceGaps: { available: [], missing: [], unavailable: [] }, ...extra
  }) as any;
  const setSnapshots = (list: any[]) => (researchNotebookService as any).snapshots.set(nbId, list);
  const text = (o: unknown) => JSON.stringify(o);
  const fresh = async (opts: Record<string, unknown> = {}) => decisionSvc.evaluateDecision({ securityId: SEC, asOfDate: ASOF, forceRefresh: true, ...opts } as any);

  // =====================================================================================
  section('D1. Notebook snapshots must pass the visibility policy before influencing a decision');
  // =====================================================================================
  // order matters: the unfiltered implementation used the LAST snapshot, so hostile ones are placed last.
  setSnapshots([
    snap('snap-shared-ok', 'SHARED-SNAP-MARKER', { visibility: 'SHARED' }),
    snap('snap-legacy', 'LEGACY-SNAP-MARKER'),                                                  // ownerless, unclassified (hydrated legacy)
    snap('snap-private-b', 'PRIVATE-B-SNAP-MARKER', { ownerUserId: B, userId: B, visibility: 'PRIVATE' }),
    snap('snap-restricted', 'RESTRICTED-SNAP-MARKER', { visibility: 'PRIVATE' })              // ownerless + PRIVATE
  ]);
  check(researchNotebookService.getLatestSnapshot(nbId)?.snapshotId === 'snap-restricted', 'precondition: the unfiltered (internal) accessor would have returned the hostile last snapshot');
  check(researchNotebookService.getLatestSnapshotVisibleTo(nbId)?.snapshotId === 'snap-shared-ok', 'no principal: only the explicitly SHARED snapshot qualifies');
  check(researchNotebookService.getLatestSnapshotVisibleTo(nbId, A)?.snapshotId === 'snap-shared-ok', "user A: other tenant's, legacy and restricted snapshots are skipped");
  check(researchNotebookService.getLatestSnapshotVisibleTo(nbId, B)?.snapshotId === 'snap-private-b', "user B: own private snapshot qualifies (it is B's own input)");

  const sysDecision = await fresh();
  const sysText = text(sysDecision);
  check(sysText.includes('SHARED-SNAP-MARKER'), 'non-vacuous: the SHARED snapshot content does reach the system decision', sysDecision.thesisStatus);
  check(!/LEGACY-SNAP-MARKER|PRIVATE-B-SNAP-MARKER|RESTRICTED-SNAP-MARKER/.test(sysText), 'system decision contains NO legacy / other-tenant / restricted snapshot content');
  check((sysDecision as any).visibility === 'SHARED', 'a decision built only from shared inputs is classified SHARED');

  const decA = await fresh({ ownerUserId: A });
  check(!/LEGACY-SNAP-MARKER|PRIVATE-B-SNAP-MARKER|RESTRICTED-SNAP-MARKER/.test(text(decA)), "user A's private decision also excludes legacy / other-tenant snapshot content");
  check((decA as any).visibility === 'PRIVATE' && (decA as any).ownerUserId === A, "user A's decision is PRIVATE and owner-stamped");
  const decB = await fresh({ ownerUserId: B });
  check(text(decB).includes('PRIVATE-B-SNAP-MARKER') && !/LEGACY-SNAP-MARKER|RESTRICTED-SNAP-MARKER/.test(text(decB)), "user B's decision uses B's own snapshot but still excludes legacy and restricted ones");

  // a hostile snapshot that is the ONLY candidate is ignored entirely (fail-closed: no input rather than a leaked input)
  setSnapshots([snap('snap-legacy-only', 'LEGACY-ONLY-MARKER')]);
  const noInput = await fresh();
  check(!text(noInput).includes('LEGACY-ONLY-MARKER'), 'when only a legacy snapshot exists, the decision simply has no snapshot input');

  // =====================================================================================
  section('D2. Ownerless notebook artifacts are SHARED only when no caller-supplied input is present');
  // =====================================================================================
  // seed shared provider evidence so executeResearch has something deterministic to work with
  evidenceService.getRepository().addEvidence({ evidenceId: 'ev-shared-aapl', securityId: SEC, sourceType: 'SEC_EDGAR', provider: 'SEC EDGAR', title: 'AAPL 10-K', content: 'AAPL annual report revenue', publishedAt: '2024-01-15T00:00:00.000Z', retrievedAt: '2024-01-16T00:00:00.000Z', epistemicStatus: 'REAL', isSimulated: false, visibility: 'SHARED' } as any);
  const run = (p: Record<string, unknown>) => researchNotebookService.executeResearch({ securityId: SEC, queryType: 'INVESTMENT_THESIS', asOfDate: ASOF, ...p } as any);

  const plain = await run({});
  check((plain as any).visibility === 'SHARED' && !(plain as any).ownerUserId, 'ownerless snapshot from shared inputs only => SHARED');
  const withQuery = await run({ customQuery: 'What does our private channel check say about AAPL?' });
  check((withQuery as any).visibility === 'PRIVATE' && !(withQuery as any).ownerUserId, 'ownerless snapshot with a custom query is NOT shared (restricted)');
  check(evaluateAccess(withQuery as any, A) === 'LEGACY_UNOWNED', 'access policy: that snapshot is restricted for every user (LEGACY_UNOWNED)');
  const withPortfolio = await run({ portfolioContext: { holdings: [{ symbol: 'AAPL', weightPct: 12 }] } });
  check((withPortfolio as any).visibility === 'PRIVATE' && evaluateAccess(withPortfolio as any, A) === 'LEGACY_UNOWNED', 'ownerless snapshot with portfolio context is NOT shared (restricted)');
  const blankQuery = await run({ customQuery: '   ' });
  check((blankQuery as any).visibility === 'SHARED', 'a blank custom query is not caller-supplied input (still SHARED)');
  const owned = await run({ customQuery: 'my query', ownerUserId: A });
  check((owned as any).visibility === 'PRIVATE' && (owned as any).ownerUserId === A, 'owned snapshot with custom query stays PRIVATE to its owner');
  check(!visibleToEngine(withQuery, A) && !visibleToEngine(withPortfolio, A) && !visibleToEngine(withQuery, undefined), 'restricted ownerless snapshots are invisible to every engine view');
  check(withQuery.snapshotId !== plain.snapshotId && !!withQuery.createdAt && !!withQuery.researchAsOfDate, 'ids and timestamps are still generated normally (no history rewritten)');

  // D4 chain: the restricted snapshot (custom query) must not enter a later system decision
  const markerQuery = 'CHAIN-QUERY-MARKER private question';
  const chained = await run({ customQuery: markerQuery });
  const chain = await fresh();
  check(!text(chain).includes('CHAIN-QUERY-MARKER') && !text(chain).includes(chained.snapshotId), 'chain: a restricted custom-query snapshot never reaches a later system decision');
  check((researchNotebookService as any).snapshots.get(nbId).some((s: any) => s.snapshotId === chained.snapshotId), 'the restricted snapshot is preserved in history (nothing deleted or rewritten)');

  // =====================================================================================
  section('D3. Other inputs of a SHARED decision follow the same rule (evidence, backtests, configuration)');
  // =====================================================================================
  setSnapshots([]);
  const ev = (id: string, extra: Record<string, unknown>) => ({ evidenceId: id, securityId: SEC, sourceType: 'SEC_EDGAR', provider: 'SEC EDGAR', title: `T ${id}`, content: `C ${id}`, publishedAt: '2024-05-01T00:00:00.000Z', retrievedAt: '2024-05-02T00:00:00.000Z', epistemicStatus: 'REAL', isSimulated: false, structuredValue: { v: id }, ...extra }) as any;
  evidenceRepository.addEvidence(ev('ev-in-shared', { visibility: 'SHARED' }));
  evidenceRepository.addEvidence(ev('ev-in-legacy', {}));
  evidenceRepository.addEvidence(ev('ev-in-private-a', { ownerUserId: A, userId: A, visibility: 'PRIVATE', structuredValue: { v: 'private-a' } }));
  const ids = (d: any) => text(d);
  const dEv = await fresh();
  const evSeen = (['ev-in-shared', 'ev-in-legacy', 'ev-in-private-a'] as const).map(i => ids(dEv).includes(i));
  check(evSeen[0], 'non-vacuous: the explicitly SHARED evidence is referenced by the system decision', evSeen);
  check(!evSeen[1] && !evSeen[2], 'system decision references neither legacy nor private evidence', evSeen);
  const dEvA = await fresh({ ownerUserId: A });
  check(ids(dEvA).includes('ev-in-private-a') && !ids(dEvA).includes('ev-in-legacy'), "owner A's decision may use A's own private evidence but never legacy evidence", { own: ids(dEvA).includes('ev-in-private-a') });
  const queryVisible = evidenceRepository.query({ securityId: SEC, asOfDate: ASOF } as any);
  // 38.2E: decisions read the single canonical repository, which also holds the shared seed fixture ev-shared-aapl; assert the three fixtures are present
  check(['ev-in-shared', 'ev-in-legacy', 'ev-in-private-a'].every(i => queryVisible.some((q: any) => q.evidenceId === i)) && queryVisible.every((q: any) => ['ev-in-shared', 'ev-in-legacy', 'ev-in-private-a', 'ev-shared-aapl'].includes(q.evidenceId)), 'precondition: the raw repository holds all three evidence items plus only the known shared seed (filtering happens at the consumer)');

  const bt = (id: string, title: string, extra: Record<string, unknown>) => ({ backtestId: id, configuration: { symbol: 'AAPL' }, strategyTitle: title, sharpeRatio: 4.321, cagr: 21.5, maxDrawdown: 9.1, winRate: 61.7, profitFactor: 2.2, status: 'COMPLETED', ...extra }) as any;
  const cache: Map<string, any> = (backtestService as any).resultsCache;
  cache.clear();
  cache.set('bt-private', bt('bt-private', 'PRIVATE-BT-MARKER', { ownerUserId: A, userId: A, visibility: 'PRIVATE' }));
  cache.set('bt-legacy', bt('bt-legacy', 'LEGACY-BT-MARKER', {}));
  const dBt = await fresh();
  check(!/PRIVATE-BT-MARKER|LEGACY-BT-MARKER|4\.321/.test(text(dBt)), "private and legacy backtest metrics (strategy name, Sharpe) never enter a SHARED decision");
  cache.set('bt-shared', bt('bt-shared', 'SHARED-BT-MARKER', { visibility: 'SHARED' }));
  const dBt2 = await fresh();
  check(/SHARED-BT-MARKER/.test(text(dBt2)), 'non-vacuous: an explicitly SHARED backtest does feed the decision');
  const dBtA = await fresh({ ownerUserId: A });
  check(/PRIVATE-BT-MARKER/.test(text(dBtA)) || /SHARED-BT-MARKER/.test(text(dBtA)), "owner A's decision may use A's own private backtest or a shared one");
  const dBtB = await fresh({ ownerUserId: B });
  check(!/PRIVATE-BT-MARKER|LEGACY-BT-MARKER/.test(text(dBtB)), "user B's decision never uses A's private or the legacy backtest");

  const custom = await decisionSvc.evaluateDecision({ securityId: SEC, asOfDate: ASOF, forceRefresh: true, configuration: { version: 'custom-v9' } as any });
  check((custom as any).visibility === 'PRIVATE' && !(custom as any).ownerUserId && evaluateAccess(custom as any, A) === 'LEGACY_UNOWNED', 'ownerless evaluation with a caller-supplied configuration is restricted, not SHARED');
  const baselineAgain = await decisionSvc.evaluateDecision({ securityId: SEC, asOfDate: ASOF });
  check((baselineAgain as any).visibility === 'SHARED' && baselineAgain.decisionId !== custom.decisionId, 'the canonical shared assessment is not polluted by (or confused with) the custom-configuration one');

  // =====================================================================================
  section('Invariants and isolation');
  // =====================================================================================
  for (const d of [sysDecision, decA, decB, dEv, custom]) {
    check(d.isAnalyticalOnly === true && d.executionProhibited === true, `decision ${d.decisionId.slice(0, 40)} keeps isAnalyticalOnly/executionProhibited`);
  }
  check(typeof sysDecision.generatedAt === 'string' && sysDecision.asOfDate === ASOF, 'point-in-time fields (asOfDate, generatedAt) preserved');
  const src = fs.readFileSync('server/services/decision/decisionIntelligenceService.ts', 'utf8');
  check(!/getLatestSnapshot\(/.test(src.replace(/getLatestSnapshotVisibleTo\(/g, '')), 'decision service no longer calls the unfiltered snapshot accessor');
  const after = fs.existsSync(realStore) ? sha(realStore) : 'absent';
  check(before === after, 'data/persistence/store.json is byte-identical before and after (SHA-256)', { before: before.slice(0, 12), after: after.slice(0, 12) });
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('\n========================================================================');
  console.log(`PHASE 38.2D LEGACY-SHARING SUITE: ${pass} PASSED / ${fail} FAILED (TOTAL: ${pass + fail})`);
  console.log('========================================================================');
  if (fail) { console.error('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch(e => { console.error('Phase 38.2D suite crashed:', e); process.exit(1); });
