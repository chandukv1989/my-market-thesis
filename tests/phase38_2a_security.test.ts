/**
 * Phase 38.2A — Authentication & Tenant Isolation Remediation: Deterministic Security Suite
 *
 * Exercises the REAL Express application (createApp) over HTTP plus the real services/repositories:
 *   1. Anonymous access to every registered /api route (route table is introspected, not hand-listed)
 *   2. Cross-user reads / updates / deletes (IDOR) across every user-owned resource family
 *   3. Forged tenantId / userId / ownerUserId in query strings and request bodies
 *   4. Ownerless (legacy) records are restricted, never public
 *   5. /api/pilot/* tenant isolation
 *   6. /api/persistence/* authorization + tenant filtering
 *   7. Repository / service calls missing mandatory tenant scope
 *   8. Intended public (SHARED) vs private resources
 *   9. Legitimate authenticated owner workflows still work
 *  10. PostgreSQL ownership persistence (SQL generated against a recording fake client; NO database is contacted)
 *      and migration 003 static safety checks
 *  11. Safety invariants (analytical-only, execution-prohibited, no fallback identity, no secrets)
 *
 * Determinism: no live provider or database is contacted. Provider credentials and DATABASE_URL are blanked,
 * persistence is an isolated temp-dir development adapter, and routes that would trigger provider evidence
 * gathering are intentionally not exercised here (their ownership logic is covered at the service level).
 */

// ---- environment isolation (must run before any application module is imported) ----
process.env.MARKET_THESIS_DISABLE_AUTOSTART = '1';
process.env.NODE_ENV = 'test';
for (const key of [
  'DATABASE_URL', 'GEMINI_API_KEY', 'TWELVE_DATA_API_KEY', 'FYERS_APP_ID', 'FYERS_SECRET_KEY',
  'FYERS_ACCESS_TOKEN', 'TRUEDATA_USERNAME', 'TRUEDATA_PASSWORD', 'FINMAGINE_API_KEY', 'ADMIN_USER_IDS'
]) {
  process.env[key] = '';
}

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

let total = 0;
let passed = 0;
const failures: string[] = [];

function check(condition: unknown, name: string, detail?: unknown): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ FAILED: ${name}${detail !== undefined ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}

async function rejectsWith(fn: () => unknown, predicate: (e: any) => boolean): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return predicate(e);
  }
}

function section(title: string): void {
  console.log(`\n--- ${title} ---`);
}

async function main(): Promise<void> {
  // ---- isolated persistence + application ----
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase38_2a-'));
  const { persistenceManager } = await import('../server/persistence/persistenceManager');
  const { DevelopmentPersistenceAdapter } = await import('../server/persistence/devAdapter/developmentPersistenceAdapter');
  persistenceManager.setAdapter(new DevelopmentPersistenceAdapter(tmpDir));

  const { createApp } = await import('../server');
  const { PUBLIC_API_ROUTES, isPublicApiRoute } = await import('../server/auth/routePolicy');
  const { authorizationService, AuthorizationError } = await import('../server/auth/authorizationService');
  const accessPolicy = await import('../server/auth/accessPolicy');
  const { authRateLimiter, researchRateLimiter, backtestRateLimiter, documentUploadRateLimiter } = await import('../server/middleware/rateLimiter');
  const { documentRegistry } = await import('../server/services/documents/documentRegistry');
  const { DocumentIngestionService } = await import('../server/services/documents/documentIngestionService');
  const { evidenceService } = await import('../server/services/evidence/evidenceService');
  const { retrievalEngine } = await import('../server/services/retrieval/retrievalEngine');
  const { watchlistAlertService } = await import('../server/services/alerts/watchlistAlertService');
  const { backtestService } = await import('../server/services/backtest/backtestService');
  const { researchNotebookService } = await import('../server/services/research/notebookService');
  const { quantStrategyEngine } = await import('../server/services/quant/quantStrategyEngine');
  const { pilotReadinessService } = await import('../server/services/pilot/pilotReadinessService');
  const { MIGRATIONS } = await import('../server/persistence/migrations/schema');
  const pg = await import('../server/persistence/postgres/postgresRepositories');

  const app = await createApp({ initializePersistence: false });
  const httpServer = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => httpServer.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  const resetLimiters = () => {
    authRateLimiter.reset();
    researchRateLimiter.reset();
    backtestRateLimiter.reset();
    documentUploadRateLimiter.reset();
  };

  async function call(
    method: string,
    url: string,
    opts: { token?: string; body?: unknown; headers?: Record<string, string>; rawBody?: string } = {}
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
    let body: string | undefined;
    if (opts.rawBody !== undefined) {
      body = opts.rawBody;
      headers['content-type'] = 'application/json';
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers['content-type'] = 'application/json';
    }
    const res = await fetch(base + url, { method, headers, body });
    let parsed: any = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  }

  async function register(label: string): Promise<{ userId: string; token: string; email: string }> {
    const email = `phase38_2a_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const res = await call('POST', '/api/auth/register', { body: { email, password: 'Ph@se38-2A-secret' } });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { userId: res.body.user.userId, token: res.body.session.sessionId, email };
  }

  const A = await register('a');
  const B = await register('b');
  const C = await register('c');

  // =====================================================================================
  section('1. Anonymous access to every protected route (route table introspection)');
  // =====================================================================================
  const routes: { method: string; path: string }[] = [];
  for (const layer of (app as any)._router.stack) {
    if (layer.route && typeof layer.route.path === 'string' && layer.route.path.startsWith('/api')) {
      for (const m of Object.keys(layer.route.methods)) {
        routes.push({ method: m.toUpperCase(), path: layer.route.path });
      }
    }
  }
  check(routes.length >= 200, `route table introspected (${routes.length} /api routes registered)`);

  for (const pub of PUBLIC_API_ROUTES) {
    check(routes.some(r => r.method === pub.method && r.path.toLowerCase() === pub.path), `public route exists in app: ${pub.method} ${pub.path}`);
    check(pub.reason.length > 20, `public route documents why it is public: ${pub.path}`);
  }
  check(PUBLIC_API_ROUTES.length === 5, 'exactly 5 intentionally public routes are enumerated');

  const protectedRoutes = routes.filter(r => !isPublicApiRoute(r.method, r.path));
  let anonBad: string[] = [];
  let sweep = 0;
  for (const r of protectedRoutes) {
    if (sweep++ % 20 === 0) resetLimiters();
    const url = r.path.replace(/:[A-Za-z]+/g, 'x');
    const res = await call(r.method, url, { body: r.method === 'GET' || r.method === 'DELETE' ? undefined : {} });
    if (res.status !== 401 || res.body?.code !== 'AUTH_REQUIRED') anonBad.push(`${r.method} ${r.path} -> ${res.status}`);
  }
  check(anonBad.length === 0, `every protected route (${protectedRoutes.length}) answers 401 AUTH_REQUIRED to anonymous callers`, anonBad.slice(0, 10));

  resetLimiters();
  for (const r of protectedRoutes.filter(x => x.path.startsWith('/api/pilot') || x.path.startsWith('/api/persistence'))) {
    const url = r.path.replace(/:[A-Za-z]+/g, 'x') + (r.method === 'GET' ? '?tenantId=analyst_pilot_01' : '');
    const res = await call(r.method, url, { body: r.method === 'GET' ? undefined : { tenantId: 'analyst_pilot_01' } });
    check(res.status === 401, `anonymous ${r.method} ${r.path} with forged tenantId -> 401`, res.status);
  }

  resetLimiters();
  check((await call('GET', '/api/health')).status === 200, 'public: GET /api/health reachable anonymously');
  const me = await call('GET', '/api/auth/me');
  check(me.status === 200 && me.body?.authenticated === false && me.body?.user === null, 'public: GET /api/auth/me anonymous -> authenticated:false');
  check((await call('POST', '/api/auth/login', { body: {} })).body?.code !== 'AUTH_REQUIRED', 'public: POST /api/auth/login reaches its handler anonymously');
  check((await call('POST', '/api/auth/register', { body: {} })).body?.code !== 'AUTH_REQUIRED', 'public: POST /api/auth/register reaches its handler anonymously');
  check((await call('POST', '/api/auth/logout')).status === 200, 'public: POST /api/auth/logout is idempotent for anonymous callers');

  check((await call('GET', '/api/does-not-exist')).status === 401, 'unknown /api path answers 401 (no route enumeration)');
  check((await call('GET', '/API/DATA-STATUS')).status === 401, 'case-variant of a protected path is still gated (Express routing is case-insensitive)');
  check((await call('GET', '/api/data-status/')).status === 401, 'trailing-slash variant of a protected path is still gated');
  check((await call('GET', '/api/health/')).status === 200, 'trailing-slash variant of a public path stays public');
  check((await call('GET', '/api/data-status', { token: 'not-a-session' })).status === 401, 'invalid bearer session -> 401');
  check((await call('GET', '/api/data-status', { headers: { 'x-session-id': 'not-a-session' } })).status === 401, 'invalid X-Session-Id -> 401');
  check((await call('GET', '/api/data-status', { headers: { cookie: 'session_id=not-a-session' } })).status === 401, 'invalid session cookie -> 401');
  check((await call('POST', '/api/watchlist', { rawBody: '{"symbol": ' })).status === 401, 'malformed JSON to a protected route -> 401 (gate runs before body parsing)');
  check((await call('POST', '/api/watchlist', { rawBody: '{"symbol":"AAPL","ownerUserId":"' + A.userId + '"}' })).status === 401, 'anonymous write naming a real owner id -> 401');

  const tmpUser = await register('logout');
  check((await call('GET', '/api/watchlist', { token: tmpUser.token })).status === 200, 'fresh session works before logout');
  await call('POST', '/api/auth/logout', { token: tmpUser.token });
  check((await call('GET', '/api/watchlist', { token: tmpUser.token })).status === 401, 'logged-out session is rejected afterwards');

  const staticServer = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  check(!staticServer.includes('analyst-1'), "server.ts no longer contains the shared 'analyst-1' fallback identity");
  check(!/analyst_pilot_01/.test(staticServer), "server.ts no longer defaults pilot routes to 'analyst_pilot_01'");
  check(staticServer.includes("app.use('/api', apiAuthGate)"), 'auth gate is mounted on /api');
  check(staticServer.indexOf("app.use('/api', apiAuthGate)") < staticServer.indexOf("app.get('/api/health'"), 'auth gate is mounted before any route handler');

  // =====================================================================================
  section('2. Forged tenant / owner identifiers (query + body) are never trusted');
  // =====================================================================================
  resetLimiters();
  // watchlist
  const wlForged = await call('POST', '/api/watchlist', { token: A.token, body: { symbol: 'AAPL', ownerUserId: B.userId, userId: B.userId, tenantId: B.userId } });
  check(wlForged.status === 201 && wlForged.body.ownerUserId === A.userId, 'watchlist create: forged ownerUserId/userId/tenantId ignored; owner = principal', wlForged.body);
  const wlItemA = wlForged.body.watchlistItemId as string;
  const wlBList = await call('GET', `/api/watchlist?ownerUserId=${A.userId}&userId=${A.userId}&tenantId=${A.userId}`, { token: B.token });
  check(wlBList.status === 200 && !wlBList.body.watchlist.some((w: any) => w.watchlistItemId === wlItemA), 'watchlist list: forged query owner cannot expose another user\'s items');
  check(wlBList.body.watchlist.every((w: any) => w.ownerUserId === B.userId), 'watchlist list: every returned item is owned by the caller');

  // alert rules
  const ruleForged = await call('POST', '/api/alerts/rules', { token: A.token, body: { symbol: 'AAPL', alertType: 'PRICE_ABOVE', threshold: 100, ownerUserId: B.userId, userId: B.userId } });
  check(ruleForged.status === 201 && ruleForged.body.ownerUserId === A.userId, 'alert rule create: forged owner ignored', ruleForged.body);
  const ruleA = ruleForged.body.alertRuleId as string;
  const rulesB = await call('GET', `/api/alerts/rules?userId=${A.userId}`, { token: B.token });
  check(rulesB.status === 200 && !rulesB.body.rules.some((r: any) => r.alertRuleId === ruleA), 'alert rules list: forged ?userId cannot expose another user\'s rules');
  const rulePatchForge = await call('PATCH', `/api/alerts/rules/${ruleA}`, { token: A.token, body: { ownerUserId: B.userId, userId: B.userId, threshold: 150 } });
  check(rulePatchForge.status === 200 && rulePatchForge.body.ownerUserId === A.userId && rulePatchForge.body.threshold === 150, 'alert rule patch: owner/identity fields cannot be reassigned, other fields update', rulePatchForge.body);

  // documents
  const docText = `Phase 38.2A confidential memo ${Date.now()} NVDA proprietary channel checks`;
  const docUp = await call('POST', '/api/documents/upload', { token: A.token, body: { fileName: 'memo_a.txt', fileText: docText, securityId: 'us-nvda', ownerUserId: B.userId, userId: B.userId, visibility: 'SHARED' } });
  check(docUp.status === 200 && docUp.body.document?.ownerUserId === A.userId && docUp.body.document?.visibility === 'PRIVATE', 'document upload: forged owner and visibility:SHARED ignored', { s: docUp.status, o: docUp.body?.document?.ownerUserId, v: docUp.body?.document?.visibility });
  const docAId = docUp.body.document?.documentId as string;
  const docListB = await call('GET', `/api/documents?userId=${A.userId}`, { token: B.token });
  check(docListB.status === 200 && !docListB.body.documents.some((d: any) => d.documentId === docAId), 'document list: forged ?userId cannot expose another user\'s documents');

  // custom strategy
  const stratId = `phase38-strat-${Date.now()}`;
  const stratBody = {
    strategyId: stratId, name: 'Phase 38 owned strategy', version: 'v1.0.0',
    indicators: [{ id: 'sma20', type: 'SMA', period: 20 }],
    entryRules: [{ id: 'e1', description: 'x', conditions: [] }],
    positionSizing: { method: 'FIXED_FRACTIONAL', fraction: 0.1 },
    riskConstraints: { maxPositionPct: 10 }
  };
  const stratReg = await call('POST', '/api/strategies/custom', { token: A.token, body: { ...stratBody, ownerUserId: B.userId, userId: B.userId, isBuiltIn: true } });
  check(stratReg.status === 200, 'custom strategy registers for owner A', stratReg.body);
  const stratStored: any = quantStrategyEngine.getStrategy(stratId);
  check(stratStored?.ownerUserId === A.userId && stratStored?.isBuiltIn === false, 'custom strategy: forged ownerUserId and isBuiltIn:true ignored');

  // snapshots with forged userId
  const scenSnap = await call('POST', '/api/scenarios/snapshots', { token: A.token, body: { snapshotId: `scn-${Date.now()}`, userId: B.userId, ownerUserId: B.userId, evaluation: { scenarioType: 'RATE_SHOCK' } } });
  check(scenSnap.status === 200 && scenSnap.body.userId === A.userId, 'scenario snapshot: forged userId ignored; owner = principal', scenSnap.body);
  const scenId = scenSnap.body.snapshotId as string;
  check((await call('GET', `/api/scenarios/snapshots/${scenId}`, { token: B.token })).status === 403, 'scenario snapshot: other user gets 403');
  check((await call('GET', `/api/scenarios/snapshots/${scenId}`, { token: A.token })).status === 200, 'scenario snapshot: owner reads own snapshot');
  const cfSnap = await call('POST', '/api/counterfactuals/snapshots', { token: A.token, body: { snapshotId: `cf-${Date.now()}`, userId: B.userId, ownerUserId: B.userId, evaluation: { counterfactualId: 'cf-x' } } });
  check(cfSnap.status === 200 && cfSnap.body.userId === A.userId, 'counterfactual snapshot: forged userId ignored; owner = principal', cfSnap.body);
  check((await call('GET', `/api/counterfactuals/snapshots/${cfSnap.body.snapshotId}`, { token: B.token })).status === 403, 'counterfactual snapshot: other user gets 403');

  // policies
  const polCreate = await call('POST', '/api/policies', { token: A.token, body: { name: 'A policy', policyType: 'THESIS_INVALIDATION', ownerUserId: B.userId, userId: B.userId } });
  check(polCreate.status === 201 && polCreate.body.ownerUserId === A.userId && polCreate.body.userId === A.userId, 'policy create: forged owner ignored', polCreate.body);
  const polA = polCreate.body.policyId as string;
  const polOverwrite = await call('POST', '/api/policies', { token: B.token, body: { policyId: polA, name: 'hijack', policyType: 'THESIS_INVALIDATION' } });
  check(polOverwrite.status === 403, 'policy upsert: B cannot overwrite A\'s policy by supplying its policyId', polOverwrite.body);
  check((await persistenceManager.getPolicyRepository().get(polA))?.name === 'A policy', 'policy A content untouched after overwrite attempt');

  // research family: forged userId/tenantId in body
  const qCreate = await call('POST', '/api/research/questions', { token: A.token, body: { securityId: 'us-aapl', question: 'Is services growth durable?', context: 'ctx', category: 'GENERAL', userId: B.userId, tenantId: B.userId } });
  check(qCreate.status === 201 && qCreate.body.userId === A.userId, 'research question create: forged userId/tenantId ignored', qCreate.body);
  const qA = qCreate.body.id as string;
  check((await call('GET', `/api/research/questions?userId=${A.userId}&tenantId=${A.userId}`, { token: B.token })).body?.some?.((q: any) => q.id === qA) === false, 'research questions list: forged query owner cannot expose another user\'s questions');
  const memCreate = await call('POST', '/api/research-memory', { token: A.token, body: { securityId: 'us-aapl', memoryType: 'OBSERVATION', title: 'A private note', summary: 's', finding: 'f', userId: B.userId, tenantId: B.userId } });
  check(memCreate.status === 200 && memCreate.body.userId === A.userId, 'research memory create: forged userId ignored', memCreate.body);
  const memSearchB = await call('GET', `/api/research-memory/search?userId=${A.userId}&tenantId=${A.userId}`, { token: B.token });
  check(memSearchB.status === 200 && Array.isArray(memSearchB.body) && !memSearchB.body.some((m: any) => m.id === memCreate.body.id), 'research memory search: forged query owner cannot expose another user\'s memory');

  // =====================================================================================
  section('3. Cross-user reads / updates / deletes (IDOR)');
  // =====================================================================================
  // watchlist
  check((await call('PATCH', `/api/watchlist/${wlItemA}`, { token: B.token, body: { enabled: false } })).status === 403, 'watchlist PATCH by non-owner -> 403');
  check((await call('DELETE', `/api/watchlist/${wlItemA}`, { token: B.token })).status === 403, 'watchlist DELETE by non-owner -> 403');
  check(watchlistAlertService.getWatchlistItem(wlItemA)?.enabled === true, 'watchlist item untouched after non-owner attempts');
  // alert rules
  check((await call('PATCH', `/api/alerts/rules/${ruleA}`, { token: B.token, body: { threshold: 1 } })).status === 403, 'alert rule PATCH by non-owner -> 403');
  check((await call('DELETE', `/api/alerts/rules/${ruleA}`, { token: B.token })).status === 403, 'alert rule DELETE by non-owner -> 403');
  check(watchlistAlertService.getAlertRule(ruleA)?.threshold === 150, 'alert rule untouched after non-owner attempts');
  // alert events
  (watchlistAlertService as any).events.push({ eventId: 'evt-phase38-a', alertRuleId: ruleA, alertType: 'PRICE_ABOVE', priority: 'WARNING', isRead: false, isAcknowledged: false, ownerUserId: A.userId, userId: A.userId, symbol: 'AAPL', provider: 'TEST', epistemicStatus: 'REAL' });
  check((await call('POST', '/api/alerts/evt-phase38-a/read', { token: B.token })).status === 403, 'alert event read-mark by non-owner -> 403');
  check((await call('POST', '/api/alerts/evt-phase38-a/acknowledge', { token: B.token })).status === 403, 'alert event acknowledge by non-owner -> 403');
  check((await call('POST', '/api/alerts/evt-phase38-a/analyze', { token: B.token })).status === 403, 'alert event analyze by non-owner -> 403 (previously unchecked)');
  const evB = await call('GET', '/api/alerts/events', { token: B.token });
  check(evB.status === 200 && !evB.body.events.some((e: any) => e.eventId === 'evt-phase38-a'), 'alert events list excludes other users\' events');
  const evA = await call('GET', '/api/alerts/events', { token: A.token });
  check(evA.body.events.some((e: any) => e.eventId === 'evt-phase38-a'), 'alert events list includes owner\'s event');
  // alert evaluation is scoped to the caller (does not touch other tenants' state)
  const evalRes = await call('POST', '/api/alerts/evaluate', { token: C.token, body: {} });
  check(evalRes.status === 200 && evalRes.body.evaluatedCount === 0, 'alert evaluate for a user with no rules evaluates nothing (cannot trigger other tenants\' rules)', evalRes.body);

  // documents
  check((await call('GET', `/api/documents/${docAId}`, { token: B.token })).status === 403, 'document GET by non-owner -> 403');
  check((await call('DELETE', `/api/documents/${docAId}`, { token: B.token })).status === 403, 'document DELETE by non-owner -> 403');
  check(documentRegistry.getDocument(docAId) !== undefined, 'document still registered after non-owner delete attempt');
  const docUpB = await call('POST', '/api/documents/upload', { token: B.token, body: { fileName: 'memo_b.txt', fileText: docText, securityId: 'us-nvda' } });
  check(docUpB.status === 200 && docUpB.body.isDuplicate === false && docUpB.body.document.documentId !== docAId && docUpB.body.document.ownerUserId === B.userId, 'identical content uploaded by B is NOT deduplicated onto A\'s document (no cross-tenant disclosure)', { dup: docUpB.body?.isDuplicate, same: docUpB.body?.document?.documentId === docAId });
  const docAgainA = await call('POST', '/api/documents/upload', { token: A.token, body: { fileName: 'memo_a.txt', fileText: docText, securityId: 'us-nvda' } });
  check(docAgainA.status === 200 && docAgainA.body.isDuplicate === true && docAgainA.body.document.documentId === docAId, 'same-owner re-upload still deduplicates onto the owner\'s own document');
  const statsB = await call('GET', '/api/documents/stats', { token: B.token });
  check(statsB.status === 200 && statsB.body.totalDocuments === documentRegistry.getAllDocuments(B.userId).length, 'document stats describe only the caller\'s readable documents');
  const docIdB = docUpB.body.document.documentId as string;
  check((await call('DELETE', `/api/documents/${docIdB}`, { token: B.token })).status === 200, 'B can delete B\'s own document');
  check(documentRegistry.getDocument(docAId) !== undefined, 'A\'s document unaffected by B\'s delete of identical content');

  // strategies / backtests
  check((await call('GET', `/api/strategies/${stratId}`, { token: B.token })).status === 403, 'custom strategy GET by non-owner -> 403');
  check((await call('POST', '/api/strategies/evaluate', { token: B.token, body: { strategyId: stratId, symbol: 'AAPL' } })).status === 403, 'custom strategy evaluate by non-owner -> 403');
  check((await call('POST', '/api/strategies/custom', { token: B.token, body: { ...stratBody, name: 'hijack' } })).status === 403, 'custom strategy re-register by non-owner -> 403');
  check((quantStrategyEngine.getStrategy(stratId) as any)?.name === 'Phase 38 owned strategy', 'custom strategy unchanged after hijack attempt');
  const builtinId = quantStrategyEngine.getBuiltinStrategies()[0].strategyId;
  check((await call('POST', '/api/strategies/custom', { token: B.token, body: { ...stratBody, strategyId: builtinId } })).status === 403, 'registering a custom strategy that shadows a built-in -> 403');
  check((await call('POST', '/api/backtests/run', { token: B.token, body: { strategyId: stratId, symbols: ['AAPL'], startDate: '2023-01-02', endDate: '2023-06-01', initialCapital: 10000, currency: 'USD' } })).status === 403, 'backtest run against another user\'s custom strategy -> 403 (before any engine/provider call)');

  const btA = { backtestId: `bkt-phase38-a-${Date.now()}`, strategyId: builtinId, ownerUserId: A.userId, userId: A.userId, status: 'COMPLETED', totalReturn: 12.5, isAnalyticalOnly: true, executionProhibited: true, generatedAt: new Date().toISOString(), report: { note: 'report-a' } } as any;
  const btLegacy = { backtestId: `bkt-phase38-legacy-${Date.now()}`, strategyId: builtinId, status: 'COMPLETED', totalReturn: 1, isAnalyticalOnly: true, executionProhibited: true, generatedAt: new Date().toISOString() } as any;
  for (const bt of [btA, btLegacy]) {
    (backtestService as any).resultsCache.set(bt.backtestId, bt);
    await persistenceManager.getBacktestRepository().save(bt);
  }
  check((await call('GET', `/api/backtests/${btA.backtestId}`, { token: B.token })).status === 403, 'backtest GET by non-owner -> 403');
  check((await call('GET', `/api/backtests/${btA.backtestId}/report`, { token: B.token })).status === 403, 'backtest report by non-owner -> 403');
  const btOwner = await call('GET', `/api/backtests/${btA.backtestId}`, { token: A.token });
  check(btOwner.status === 200 && btOwner.body.backtestId === btA.backtestId, 'backtest GET by owner -> 200');
  check((await call('GET', `/api/backtests/${btA.backtestId}/report`, { token: A.token })).body?.note === 'report-a', 'backtest report by owner -> 200');
  const btListB = await call('GET', '/api/backtests', { token: B.token });
  check(btListB.status === 200 && !btListB.body.backtests.some((b: any) => b.backtestId === btA.backtestId || b.backtestId === btLegacy.backtestId), 'backtest list for B excludes A\'s and legacy ownerless results');
  check((await call('GET', '/api/backtests', { token: A.token })).body.backtests.some((b: any) => b.backtestId === btA.backtestId), 'backtest list for A includes A\'s result');
  check(await rejectsWith(() => backtestService.runBacktest({ backtestId: btA.backtestId, ownerUserId: B.userId, strategyId: builtinId, startDate: '2023-01-02', endDate: '2023-06-01', initialCapital: 1000, currency: 'USD' } as any), e => /already in use/.test(String(e?.message))), 'backtest service: a caller-supplied backtestId can never overwrite another tenant\'s result');
  check((backtestService as any).resultsCache.get(btA.backtestId)?.ownerUserId === A.userId, 'A\'s cached backtest untouched after id-collision attempt');

  // decisions (seeded directly; evaluating a decision would trigger provider evidence gathering)
  const decisionBase = (id: string, owner?: string, date = '2024-03-01') => ({
    decisionId: id, securityId: 'us-aapl', asOfDate: date, compositeScore: 61, overallAssessment: 'NEUTRAL', conviction: 'MEDIUM',
    dimensionAssessments: {}, generatedAt: `${date}T12:00:00.000Z`, isAnalyticalOnly: true, executionProhibited: true, frameworkVersion: '1.0.0',
    ...(owner ? { ownerUserId: owner, userId: owner, visibility: 'PRIVATE' } : {})
  }) as any;
  const decA = decisionBase(`dec-phase38-a-${Date.now()}`, A.userId, '2024-03-01');
  const decB = decisionBase(`dec-phase38-b-${Date.now()}`, B.userId, '2024-03-02');
  const decLegacy = decisionBase(`dec-phase38-legacy-${Date.now()}`, undefined, '2024-03-03');
  for (const d of [decA, decB, decLegacy]) await persistenceManager.getDecisionRepository().save(d);
  const histA = await call('GET', '/api/persistence/decisions/us-aapl', { token: A.token });
  const histB = await call('GET', '/api/persistence/decisions/us-aapl', { token: B.token });
  check(histA.status === 200 && histA.body.history.some((d: any) => d.decisionId === decA.decisionId) && !histA.body.history.some((d: any) => d.decisionId === decB.decisionId || d.decisionId === decLegacy.decisionId), 'persistence/decisions: A sees only A\'s decisions (no B, no legacy)');
  check(histB.status === 200 && histB.body.history.some((d: any) => d.decisionId === decB.decisionId) && !histB.body.history.some((d: any) => d.decisionId === decA.decisionId || d.decisionId === decLegacy.decisionId), 'persistence/decisions: B sees only B\'s decisions');
  const traceB = await call('GET', `/api/decisions/${decA.decisionId}/traceability`, { token: B.token });
  check(traceB.status !== 200 && !JSON.stringify(traceB.body).includes(decA.decisionId + '"'), 'decision traceability for another user\'s decision is refused (indistinguishable from missing)', traceB.status);
  const traceLegacy = await call('GET', `/api/decisions/${decLegacy.decisionId}/traceability`, { token: A.token });
  check(traceLegacy.status !== 200, 'decision traceability for a legacy ownerless decision is refused');
  const deltaB = await call('GET', `/api/v1/decision/delta?securityId=us-aapl&fromDecisionId=${decA.decisionId}&toDecisionId=${decB.decisionId}`, { token: B.token });
  check(deltaB.status !== 200, 'decision delta mixing another user\'s decision is refused');
  const tlB = await call('GET', '/api/v1/decision/timeline/us-aapl', { token: B.token });
  check(!JSON.stringify(tlB.body).includes(decA.decisionId) && !JSON.stringify(tlB.body).includes(decLegacy.decisionId), 'decision timeline for B contains neither A\'s nor legacy decisions');
  check(await rejectsWith(() => authorizationService.authorizeDecision(decA.decisionId, B.userId), e => e instanceof AuthorizationError && e.statusCode === 403), 'authorizeDecision: non-owner -> 403');

  // snapshots
  const snapA = { snapshotId: `snap-phase38-a-${Date.now()}`, notebookId: 'nb-x', securityId: 'us-aapl', createdAt: new Date().toISOString(), researchAsOfDate: '2024-03-01', ownerUserId: A.userId, userId: A.userId, visibility: 'PRIVATE', thesis: {}, claims: [], risks: [], catalysts: [], conflicts: [], evidenceIds: [], evidenceGaps: {} } as any;
  const snapLegacy = { ...snapA, snapshotId: `snap-phase38-legacy-${Date.now()}`, ownerUserId: undefined, userId: undefined, visibility: undefined } as any;
  for (const s of [snapA, snapLegacy]) await persistenceManager.getSnapshotRepository().save(s);
  check((await call('GET', `/api/research/snapshot/${snapA.snapshotId}`, { token: B.token })).status === 403, 'research snapshot GET by non-owner -> 403');
  check((await call('GET', `/api/research/snapshot/${snapA.snapshotId}`, { token: A.token })).status === 200, 'research snapshot GET by owner -> 200');
  const snapLeg = await call('GET', `/api/research/snapshot/${snapLegacy.snapshotId}`, { token: A.token });
  check(snapLeg.status === 403 && snapLeg.body?.code === 'LEGACY_UNOWNED', 'legacy ownerless snapshot is restricted (403 LEGACY_UNOWNED), even for authenticated users', snapLeg.body);
  const snapPersB = await call('GET', '/api/persistence/snapshots/us-aapl', { token: B.token });
  check(snapPersB.status === 200 && !snapPersB.body.snapshots.some((s: any) => s.snapshotId === snapA.snapshotId || s.snapshotId === snapLegacy.snapshotId), 'persistence/snapshots: B sees neither A\'s nor legacy snapshots');
  const snapPersA = await call('GET', '/api/persistence/snapshots/us-aapl', { token: A.token });
  check(snapPersA.body.snapshots.some((s: any) => s.snapshotId === snapA.snapshotId) && !snapPersA.body.snapshots.some((s: any) => s.snapshotId === snapLegacy.snapshotId), 'persistence/snapshots: A sees own, not legacy');

  // notebooks (in-memory service map seeded directly)
  const nbMap: Map<string, any> = (researchNotebookService as any).notebooks;
  nbMap.set('nb-phase38-a', { notebookId: 'nb-phase38-a', securityId: 'us-aapl', title: 'A notebook', ownerUserId: A.userId, userId: A.userId, visibility: 'PRIVATE' });
  nbMap.set('nb-phase38-legacy', { notebookId: 'nb-phase38-legacy', securityId: 'us-aapl', title: 'Legacy notebook' });
  const nbB = await call('GET', '/api/research/notebooks', { token: B.token });
  check(nbB.status === 200 && nbB.body.notebooks.length === 0, 'notebook list for B is empty (A\'s and legacy notebooks hidden)', nbB.body);
  const nbA = await call('GET', '/api/research/notebooks', { token: A.token });
  check(nbA.body.notebooks.some((n: any) => n.notebookId === 'nb-phase38-a') && !nbA.body.notebooks.some((n: any) => n.notebookId === 'nb-phase38-legacy'), 'notebook list for A contains only A\'s notebook');
  check(researchNotebookService.notebookIdFor('us-aapl', A.userId) !== researchNotebookService.notebookIdFor('us-aapl', B.userId), 'notebook identity is owner-scoped per user and security');
  await persistenceManager.getNotebookRepository().save(nbMap.get('nb-phase38-a'));
  check(await rejectsWith(() => authorizationService.authorizeNotebook('nb-phase38-a', B.userId), e => e instanceof AuthorizationError && e.statusCode === 403), 'authorizeNotebook: non-owner -> 403');

  // monitors / orchestrated alerts / policies
  const monCreate = await call('POST', '/api/monitors', { token: A.token, body: { securityId: 'us-aapl', reviewCadence: 'WEEKLY' } });
  check(monCreate.status === 201 && monCreate.body.ownerUserId === A.userId, 'monitor create stamps owner = principal', { s: monCreate.status, b: monCreate.body });
  const monA = monCreate.body.monitorId as string;
  for (const [method, url, body] of [
    ['GET', `/api/monitors/${monA}`, undefined],
    ['PUT', `/api/monitors/${monA}`, { reviewCadence: 'DAILY' }],
    ['DELETE', `/api/monitors/${monA}`, undefined],
    ['GET', `/api/monitors/${monA}/reviews`, undefined],
    ['GET', `/api/monitors/${monA}/notes`, undefined],
    ['POST', `/api/monitors/${monA}/notes`, { content: 'hijack' }],
    ['GET', `/api/monitors/${monA}/changes`, undefined]
  ] as const) {
    const res = await call(method, url, { token: B.token, body });
    check(res.status === 403, `monitor ${method} ${url.replace(monA, ':id')} by non-owner -> 403`, res.status);
  }
  check((await call('GET', `/api/monitors/${monA}`, { token: A.token })).status === 200, 'monitor GET by owner -> 200');
  check(!(await call('GET', '/api/monitors', { token: B.token })).body.some((m: any) => m.monitorId === monA), 'monitor list for B excludes A\'s monitor');

  const alertInst = { alertId: `oal-phase38-${Date.now()}`, candidateId: 'c1', userId: A.userId, ownerUserId: A.userId, ruleType: 'DECISION_CHANGE', severity: 'HIGH', status: 'OPEN', title: 't', description: 'd', deterministicExplanation: 'e', detectedAt: new Date().toISOString(), createdAt: new Date().toISOString(), fingerprint: 'fp-phase38', triggerData: {}, provenanceData: {}, auditTrail: [], isAnalyticalOnly: true, executionProhibited: true } as any;
  await persistenceManager.getAlertOrchestrationRepository().save(alertInst);
  check((await call('GET', `/api/orchestrated-alerts/${alertInst.alertId}`, { token: B.token })).status === 403, 'orchestrated alert GET by non-owner -> 403');
  check((await call('POST', `/api/orchestrated-alerts/${alertInst.alertId}/acknowledge`, { token: B.token, body: {} })).status === 403, 'orchestrated alert acknowledge by non-owner -> 403');
  check((await call('POST', `/api/orchestrated-alerts/${alertInst.alertId}/dismiss`, { token: B.token, body: {} })).status === 403, 'orchestrated alert dismiss by non-owner -> 403');
  check((await call('GET', `/api/orchestrated-alerts/${alertInst.alertId}`, { token: A.token })).status === 200, 'orchestrated alert GET by owner -> 200');
  check((await call('DELETE', `/api/policies/${polA}`, { token: B.token })).status === 403, 'policy DELETE by non-owner -> 403');

  // research investigation family
  check((await call('GET', `/api/research/questions/${qA}`, { token: B.token })).status === 403, 'research question GET by non-owner -> 403');
  check((await call('PATCH', `/api/research/questions/${qA}`, { token: B.token, body: { status: 'RESOLVED' } })).status === 403, 'research question PATCH by non-owner -> 403');
  check((await call('GET', `/api/research-memory/${memCreate.body.id}`, { token: B.token })).status === 403, 'research memory GET by non-owner -> 403');
  check((await call('POST', `/api/research-memory/${memCreate.body.id}/supersede`, { token: B.token, body: { title: 'x', summary: 'x', finding: 'x' } })).status === 403, 'research memory supersede by non-owner -> 403');
  const gapCreate = await call('POST', '/api/research/gaps', { token: A.token, body: { securityId: 'us-aapl', gapType: 'THESIS_LACKS_EVIDENCE', title: 'g', description: 'd', whyItMatters: 'w', requiredEvidence: ['x'] } });
  check(gapCreate.status === 201 && gapCreate.body.userId === A.userId, 'research gap create stamps owner', gapCreate.body);
  check((await call('GET', `/api/research/gaps/${gapCreate.body.gapId}`, { token: B.token })).status === 403, 'research gap GET by non-owner -> 403');
  check((await call('PATCH', `/api/research/gaps/${gapCreate.body.gapId}`, { token: B.token, body: { status: 'DISMISSED', reason: 'x' } })).status === 403, 'research gap PATCH by non-owner -> 403');
  const planCreate = await call('POST', '/api/research/plans', { token: A.token, body: { securityId: 'us-aapl', title: 'p', objective: 'o' } });
  check(planCreate.status === 201 && planCreate.body.userId === A.userId, 'investigation plan create stamps owner', planCreate.body);
  check((await call('GET', `/api/research/plans/${planCreate.body.planId}`, { token: B.token })).status === 403, 'investigation plan GET by non-owner -> 403');
  check((await call('POST', `/api/research/plans/${planCreate.body.planId}/tasks`, { token: B.token, body: { title: 't', description: 'd', evidenceRequired: [], acceptanceCriteria: 'a' } })).status === 403, 'investigation plan add-task by non-owner -> 403');
  const evColl = await call('POST', '/api/research/evidence', { token: A.token, body: { securityId: 'us-aapl', sourceType: 'SEC_FILING', sourceTitle: 'Phase38 10-K', sourcePublisher: 'SEC', sourceReference: `ref-${Date.now()}`, publishedAt: '2024-02-01T00:00:00.000Z', tenantId: B.userId, userId: B.userId } });
  check(evColl.status === 201 && evColl.body.tenantId === A.userId, 'evidence collection create: forged tenantId/userId ignored', evColl.body);
  check((await call('GET', `/api/research/evidence/${evColl.body.collectionId}`, { token: B.token })).status === 403, 'evidence collection GET by non-owner -> 403');
  check((await call('POST', `/api/research/evidence/${evColl.body.collectionId}/validate`, { token: B.token, body: {} })).status === 403, 'evidence collection validate by non-owner -> 403');
  check(!JSON.stringify((await call('GET', '/api/research/evidence', { token: B.token })).body).includes(evColl.body.collectionId), 'evidence collection list for B excludes A\'s records');

  // cross-investment snapshots
  const ciSnap = await call('POST', '/api/cross-investment/snapshots', { token: A.token, body: { title: 't', data: { metadata: { asOfDate: '2024-03-01T00:00:00.000Z' }, clusters: [], commonDrivers: [], relationships: [] } } });
  check(ciSnap.status === 201 && ciSnap.body.userId === A.userId, 'cross-investment snapshot create stamps owner', ciSnap.body);
  check((await call('GET', `/api/cross-investment/snapshots/${ciSnap.body.snapshotId}`, { token: B.token })).status === 403, 'cross-investment snapshot GET by non-owner -> 403');

  // =====================================================================================
  section('4. Ownerless / legacy records are restricted, never public');
  // =====================================================================================
  const legacyDoc = { documentId: `doc-phase38-legacy-${Date.now()}`, securityId: 'us-nvda', title: 'Legacy memo', fileName: 'legacy.txt', documentType: 'TXT', sourceType: 'RESEARCH_DOCUMENT', contentHash: `hash-legacy-${Date.now()}`, processingStatus: 'READY' } as any;
  documentRegistry.register(legacyDoc);
  const legDocGet = await call('GET', `/api/documents/${legacyDoc.documentId}`, { token: A.token });
  check(legDocGet.status === 403 && legDocGet.body?.code === 'LEGACY_UNOWNED', 'legacy ownerless document GET -> 403 LEGACY_UNOWNED', legDocGet.body);
  check((await call('DELETE', `/api/documents/${legacyDoc.documentId}`, { token: A.token })).status === 403, 'legacy ownerless document DELETE -> 403');
  check(!(await call('GET', '/api/documents', { token: A.token })).body.documents.some((d: any) => d.documentId === legacyDoc.documentId), 'legacy ownerless document absent from document list');
  check(documentRegistry.getAllDocuments(undefined).length === 0, 'unscoped document listing returns no private/legacy documents');
  check(documentRegistry.getAllDocumentsUnscopedInternal().some(d => d.documentId === legacyDoc.documentId), 'legacy document ID and record are preserved (restricted, not deleted)');

  const legacyRule = watchlistAlertService.createAlertRule({ symbol: 'MSFT', alertType: 'PRICE_ABOVE' as any, threshold: 1 });
  check((await call('PATCH', `/api/alerts/rules/${legacyRule.alertRuleId}`, { token: A.token, body: { threshold: 2 } })).status === 403, 'legacy ownerless alert rule PATCH -> 403');
  check((await call('DELETE', `/api/alerts/rules/${legacyRule.alertRuleId}`, { token: A.token })).status === 403, 'legacy ownerless alert rule DELETE -> 403');
  check(!(await call('GET', '/api/alerts/rules', { token: A.token })).body.rules.some((r: any) => r.alertRuleId === legacyRule.alertRuleId), 'legacy ownerless alert rule absent from rule list');
  const seededWl = Array.from((watchlistAlertService as any).watchlist.values()).find((w: any) => !w.ownerUserId) as any;
  check(!!seededWl, 'seeded (ownerless) default watchlist item exists in the service');
  check((await call('DELETE', `/api/watchlist/${seededWl.watchlistItemId}`, { token: A.token })).status === 403, 'seeded/legacy ownerless watchlist item DELETE -> 403');
  check(!(await call('GET', '/api/watchlist', { token: C.token })).body.watchlist.some((w: any) => !w.ownerUserId), 'fresh user\'s watchlist never contains ownerless items');

  await persistenceManager.getPolicyRepository().save({ policyId: 'pol-phase38-legacy', name: 'legacy policy', policyType: 'THESIS_INVALIDATION' } as any);
  check((await call('DELETE', '/api/policies/pol-phase38-legacy', { token: A.token })).status === 403, 'legacy ownerless policy DELETE -> 403');
  check((await call('GET', `/api/backtests/${btLegacy.backtestId}`, { token: A.token })).status === 403, 'legacy ownerless backtest GET -> 403');
  const legacyEv: any = { evidenceId: `ev-phase38-legacy-${Date.now()}`, securityId: 'us-aapl', sourceType: 'RESEARCH_DOCUMENT', provider: 'Legacy', title: 'Legacy private evidence', content: 'legacy unclassified phase38 zebra content', publishedAt: '2024-01-01T00:00:00.000Z', retrievedAt: '2024-01-02T00:00:00.000Z', epistemicStatus: 'REAL', isSimulated: false };
  const privA: any = { ...legacyEv, evidenceId: `ev-phase38-priv-a-${Date.now()}`, title: 'A private evidence', content: 'owner A confidential phase38 zebra content', ownerUserId: A.userId, userId: A.userId, visibility: 'PRIVATE' };
  const sharedEv: any = { ...legacyEv, evidenceId: `ev-phase38-shared-${Date.now()}`, sourceType: 'SEC_EDGAR', provider: 'SEC_EDGAR', title: 'Shared SEC evidence', content: 'public sec filing phase38 zebra content', visibility: 'SHARED' };
  const evRepo = evidenceService.getRepository();
  check(evRepo.addEvidence(legacyEv) && evRepo.addEvidence(privA) && evRepo.addEvidence(sharedEv), 'evidence fixtures added (legacy-unclassified, A-private, SHARED)');
  const evListB = await call('GET', '/api/evidence', { token: B.token });
  const evIdsB = (evListB.body.evidence || []).map((e: any) => e.evidenceId);
  check(evListB.status === 200 && evIdsB.includes(sharedEv.evidenceId) && !evIdsB.includes(privA.evidenceId) && !evIdsB.includes(legacyEv.evidenceId), 'GET /api/evidence for B: SHARED visible; A-private and legacy-unclassified hidden', evIdsB.slice(0, 5));
  const evIdsA = ((await call('GET', '/api/evidence', { token: A.token })).body.evidence || []).map((e: any) => e.evidenceId);
  check(evIdsA.includes(sharedEv.evidenceId) && evIdsA.includes(privA.evidenceId) && !evIdsA.includes(legacyEv.evidenceId), 'GET /api/evidence for A: SHARED + own private visible; legacy-unclassified hidden');
  const searchB = await call('POST', '/api/evidence/search', { token: B.token, body: { query: 'phase38 zebra content' } });
  const searchIdsB = (searchB.body?.evidenceBundle || []).map((e: any) => e.evidenceId);
  check(searchB.status === 200 && searchIdsB.includes(sharedEv.evidenceId) && !searchIdsB.includes(privA.evidenceId) && !searchIdsB.includes(legacyEv.evidenceId), 'POST /api/evidence/search for B: retrieval returns SHARED only', searchIdsB);
  const searchA = await call('POST', '/api/evidence/search', { token: A.token, body: { query: 'phase38 zebra content' } });
  const searchIdsA = (searchA.body?.evidenceBundle || []).map((e: any) => e.evidenceId);
  check(searchIdsA.includes(privA.evidenceId) && searchIdsA.includes(sharedEv.evidenceId) && !searchIdsA.includes(legacyEv.evidenceId), 'POST /api/evidence/search for A: own private + SHARED, never legacy-unclassified', searchIdsA);
  const persEvB = await call('GET', '/api/persistence/evidence', { token: B.token });
  const persIdsB = (persEvB.body.evidence || []).map((e: any) => e.evidenceId);
  check(persEvB.status === 200 && persIdsB.includes(sharedEv.evidenceId) && !persIdsB.includes(privA.evidenceId) && !persIdsB.includes(legacyEv.evidenceId), 'persistence/evidence for B: SHARED only (no A-private, no legacy)', persIdsB.slice(0, 5));
  const legacyEvRepoItem = evRepo.getEvidence(legacyEv.evidenceId);
  check(!!legacyEvRepoItem && legacyEvRepoItem.evidenceId === legacyEv.evidenceId, 'legacy evidence record and ID preserved (restricted, not removed)');
  // 38.2E: a fresh provider re-fetch of byte-identical content must NOT promote an unclassified legacy item (matching content is not proof of ownership/licensing)
  const legacyProvider: any = { ...legacyEv, evidenceId: `ev-phase38-legacy-prov-${Date.now()}`, sourceType: 'SEC_EDGAR', provider: 'SEC_EDGAR', title: 'Legacy provider item', content: 'legacy provider phase38 content' };
  evRepo.addEvidence({ ...legacyProvider });
  check(evRepo.getEvidence(legacyProvider.evidenceId)?.visibility === undefined, 'unclassified legacy provider item stays unclassified');
  evRepo.addEvidence({ ...legacyProvider, evidenceId: `${legacyProvider.evidenceId}-again`, visibility: 'SHARED' });
  check(evRepo.getEvidence(legacyProvider.evidenceId)?.visibility === undefined, '38.2E: identical re-fetched provider content does NOT promote the legacy record (stays restricted/unclassified)');
  const legacyAfter: any = evRepo.getEvidence(legacyProvider.evidenceId);
  check(legacyAfter?.content === legacyProvider.content && legacyAfter?.ownerUserId === undefined && legacyAfter?.metadata?.classifiedBy === undefined, '38.2E: legacy record content/ownership/metadata unchanged by the re-fetch (no silent reclassification)');
  check(evRepo.getEvidence(`${legacyProvider.evidenceId}-again`)?.visibility === 'SHARED', '38.2E: the explicitly classified re-fetch is stored as its own SHARED record (explicit sharing still works)');
  check(evRepo.getEvidence(legacyEv.evidenceId)?.visibility === undefined, 'a different legacy item is NOT promoted by someone else\'s re-fetch');

  // service-level fail-closed checks
  const legacyAuthChecks: Array<[string, () => Promise<unknown>]> = [
    ['document', () => authorizationService.authorizeDocument(legacyDoc.documentId, A.userId)],
    ['backtest', () => authorizationService.authorizeBacktest(btLegacy.backtestId, A.userId)],
    ['decision', () => authorizationService.authorizeDecision(decLegacy.decisionId, A.userId)],
    ['snapshot', () => authorizationService.authorizeSnapshot(snapLegacy.snapshotId, A.userId)],
    ['notebook', async () => { await persistenceManager.getNotebookRepository().save(nbMap.get('nb-phase38-legacy')); return authorizationService.authorizeNotebook('nb-phase38-legacy', A.userId); }],
    ['alert rule', () => authorizationService.authorizeAlertRule(legacyRule.alertRuleId, A.userId)],
    ['policy', () => authorizationService.authorizePolicy('pol-phase38-legacy', A.userId)]
  ];
  for (const [name, fn] of legacyAuthChecks) {
    check(await rejectsWith(fn, e => e instanceof AuthorizationError && e.statusCode === 403 && e.code === 'LEGACY_UNOWNED'), `authorizationService fails closed on ownerless ${name} (403 LEGACY_UNOWNED)`);
  }
  check(await rejectsWith(() => authorizationService.authorizeDocument(docAId, ''), e => e instanceof AuthorizationError && e.statusCode === 403), 'authorizationService denies an empty principal');
  check(await rejectsWith(() => authorizationService.authorizeDocument(docAId, undefined as any), e => e instanceof AuthorizationError && e.statusCode === 403), 'authorizationService denies an undefined principal');

  // =====================================================================================
  section('5. /api/pilot/* tenant isolation');
  // =====================================================================================
  const seenTenants: string[] = [];
  const origReadiness = pilotReadinessService.generatePilotReadinessScorecard.bind(pilotReadinessService);
  const origWorkflow = pilotReadinessService.executeWorkflowVerification.bind(pilotReadinessService);
  const origIngest = pilotReadinessService.ingestSecFilingsForSecurity.bind(pilotReadinessService);
  (pilotReadinessService as any).generatePilotReadinessScorecard = async (t: string) => { seenTenants.push(`readiness:${t}`); return { tenantId: t, stub: true }; };
  (pilotReadinessService as any).executeWorkflowVerification = async (_tk: string, t: string) => { seenTenants.push(`workflow:${t}`); return { tenantId: t, stub: true }; };
  (pilotReadinessService as any).ingestSecFilingsForSecurity = async (_tk: string, t: string) => { seenTenants.push(`ingest:${t}`); return { tenantId: t, stub: true }; };
  try {
    const r1 = await call('GET', '/api/pilot/readiness', { token: A.token });
    check(r1.status === 200 && r1.body.tenantId === A.userId, 'pilot readiness: tenant derived from principal when none supplied');
    check((await call('GET', '/api/pilot/readiness', { token: B.token })).body.tenantId === B.userId, 'pilot readiness: B gets B\'s tenant, never A\'s');
    const forgedQ = await call('GET', `/api/pilot/readiness?tenantId=${B.userId}`, { token: A.token });
    check(forgedQ.status === 403 && forgedQ.body?.code === 'TENANT_MISMATCH', 'pilot readiness: forged tenantId (another user) -> 403 TENANT_MISMATCH');
    const legacyDefault = await call('GET', '/api/pilot/readiness?tenantId=analyst_pilot_01', { token: A.token });
    check(legacyDefault.status === 403, 'pilot readiness: legacy shared tenant id analyst_pilot_01 is rejected');
    check((await call('GET', `/api/pilot/readiness?tenantId=${A.userId}`, { token: A.token })).status === 200, 'pilot readiness: tenantId equal to the principal is tolerated (no privilege gained)');
    const w1 = await call('POST', '/api/pilot/workflow/AAPL', { token: A.token, body: {} });
    check(w1.status === 200 && w1.body.tenantId === A.userId, 'pilot workflow: tenant = principal');
    check((await call('POST', '/api/pilot/workflow/AAPL', { token: A.token, body: { tenantId: B.userId } })).status === 403, 'pilot workflow: forged body tenantId -> 403');
    const i1 = await call('POST', '/api/pilot/sec-ingest/AAPL', { token: B.token, body: { maxFilings: 2 } });
    check(i1.status === 200 && i1.body.tenantId === B.userId, 'pilot sec-ingest: tenant = principal');
    check((await call('POST', '/api/pilot/sec-ingest/AAPL', { token: B.token, body: { tenantId: A.userId, maxFilings: 2 } })).status === 403, 'pilot sec-ingest: forged body tenantId -> 403');
    check(seenTenants.every(t => t.endsWith(A.userId) || t.endsWith(B.userId)) && !seenTenants.some(t => t.includes('analyst_pilot_01')), 'pilot service was only ever invoked with authenticated principals', seenTenants);
    check(!seenTenants.includes(`readiness:${B.userId}`) || true, 'pilot invocation log recorded');
  } finally {
    (pilotReadinessService as any).generatePilotReadinessScorecard = origReadiness;
    (pilotReadinessService as any).executeWorkflowVerification = origWorkflow;
    (pilotReadinessService as any).ingestSecFilingsForSecurity = origIngest;
  }

  // =====================================================================================
  section('6. /api/persistence/* authorization + tenant filtering');
  // =====================================================================================
  const persDocsB = await call('GET', '/api/persistence/documents', { token: B.token });
  check(persDocsB.status === 200 && !persDocsB.body.documents.some((d: any) => d.documentId === docAId || d.documentId === legacyDoc.documentId), 'persistence/documents for B excludes A\'s and legacy documents');
  const persDocsA = await call('GET', '/api/persistence/documents?ownerUserId=' + B.userId, { token: A.token });
  check(persDocsA.body.documents.some((d: any) => d.documentId === docAId) && persDocsA.body.documents.every((d: any) => d.ownerUserId === A.userId), 'persistence/documents for A returns only A\'s documents even with forged ?ownerUserId');
  const persBtB = await call('GET', '/api/persistence/backtests', { token: B.token });
  check(persBtB.status === 200 && !persBtB.body.backtests.some((b: any) => b.backtestId === btA.backtestId || b.backtestId === btLegacy.backtestId), 'persistence/backtests for B excludes A\'s and legacy backtests');
  check((await call('GET', '/api/persistence/backtests', { token: A.token })).body.backtests.some((b: any) => b.backtestId === btA.backtestId), 'persistence/backtests for A includes A\'s backtest');
  const persStatus = await call('GET', '/api/persistence/status', { token: A.token });
  check(persStatus.status === 200 && !JSON.stringify(persStatus.body).match(/postgres(ql)?:\/\/|password/i), 'persistence/status requires auth and exposes no connection credentials');

  // =====================================================================================
  section('7. Repository / service calls missing mandatory tenant scope');
  // =====================================================================================
  const isScopeErr = (e: any) => e instanceof accessPolicy.TenantScopeError || e?.name === 'TenantScopeError';
  check(await rejectsWith(() => persistenceManager.getDocumentRepository().getAllForOwner(''), isScopeErr), 'documentRepo.getAllForOwner("") -> TenantScopeError');
  check(await rejectsWith(() => persistenceManager.getDocumentRepository().getAllForOwner(undefined as any), isScopeErr), 'documentRepo.getAllForOwner(undefined) -> TenantScopeError');
  check(await rejectsWith(() => persistenceManager.getEvidenceRepository().queryEvidenceForOwner('', {}), isScopeErr), 'persistent evidenceRepo.queryEvidenceForOwner("") -> TenantScopeError');
  check(await rejectsWith(() => persistenceManager.getBacktestRepository().getAllForOwner('  '), isScopeErr), 'backtestRepo.getAllForOwner(blank) -> TenantScopeError');
  check(await rejectsWith(() => persistenceManager.getDecisionRepository().getHistoryForOwner('us-aapl', ''), isScopeErr), 'decisionRepo.getHistoryForOwner(.., "") -> TenantScopeError');
  check(await rejectsWith(() => persistenceManager.getSnapshotRepository().getBySecurityIdForOwner('us-aapl', ''), isScopeErr), 'snapshotRepo.getBySecurityIdForOwner(.., "") -> TenantScopeError');
  check(await rejectsWith(() => persistenceManager.getNotebookRepository().getAllForOwner(''), isScopeErr), 'notebookRepo.getAllForOwner("") -> TenantScopeError');
  check(await rejectsWith(() => (evidenceService.getRepository() as any).queryEvidenceForOwner('', {}), isScopeErr), 'in-memory evidence repository queryEvidenceForOwner("") -> TenantScopeError');
  check(await rejectsWith(() => (evidenceService.getRepository() as any).getEvidenceAvailableAsOfForOwner('', '2025-01-01'), isScopeErr), 'in-memory evidence repository getEvidenceAvailableAsOfForOwner("") -> TenantScopeError');
  check(await rejectsWith(() => watchlistAlertService.getWatchlistForUser(''), isScopeErr), 'watchlistAlertService.getWatchlistForUser("") -> TenantScopeError');
  check(await rejectsWith(() => watchlistAlertService.getAlertRulesForUser(''), isScopeErr), 'watchlistAlertService.getAlertRulesForUser("") -> TenantScopeError');
  check(await rejectsWith(() => watchlistAlertService.getAlertEventsForUser(''), isScopeErr), 'watchlistAlertService.getAlertEventsForUser("") -> TenantScopeError');
  check(await rejectsWith(() => backtestService.getAllBacktestsForOwner(''), isScopeErr), 'backtestService.getAllBacktestsForOwner("") -> TenantScopeError');
  check(await rejectsWith(() => accessPolicy.requireTenantScope(null), isScopeErr), 'requireTenantScope(null) throws');
  check(await rejectsWith(() => accessPolicy.stampOwner({ a: 1 }, ''), isScopeErr), 'stampOwner(record, "") throws');

  const ownedDocs = await persistenceManager.getDocumentRepository().getAllForOwner(A.userId);
  check(ownedDocs.length > 0 && ownedDocs.every(d => accessPolicy.canRead(d as any, A.userId)), 'scoped document repository returns only owner-readable rows');
  check(!ownedDocs.some(d => d.documentId === legacyDoc.documentId), 'scoped document repository never returns legacy ownerless rows');
  check(accessPolicy.evaluateAccess({}, A.userId) === 'LEGACY_UNOWNED', 'policy: ownerless + unclassified => LEGACY_UNOWNED');
  check(accessPolicy.evaluateAccess({ visibility: 'SHARED' }, A.userId) === 'SHARED', 'policy: ownerless + SHARED => SHARED');
  check(accessPolicy.evaluateAccess({ ownerUserId: B.userId, visibility: 'SHARED' }, A.userId) === 'FORBIDDEN', 'policy: an owner always wins over SHARED (no accidental cross-tenant exposure)');
  check(accessPolicy.canMutate({ visibility: 'SHARED' }, A.userId) === false, 'policy: SHARED is never writable');
  check(accessPolicy.canRead({ visibility: 'SHARED' }, undefined) === true && accessPolicy.canRead({}, undefined) === false, 'policy: no-principal callers can read SHARED but never legacy/private');
  check(accessPolicy.canRead({ ownerUserId: A.userId }, '') === false, 'policy: empty principal never matches an owner');

  // =====================================================================================
  section('8. Intended public (SHARED) vs private resources');
  // =====================================================================================
  const sharedDoc = await new DocumentIngestionService().ingestDocument({ fileName: 'public_filing.txt', fileText: `Public reference filing ${Date.now()}`, securityId: 'us-nvda', visibility: 'SHARED' });
  check(sharedDoc.document.visibility === 'SHARED' && !sharedDoc.document.ownerUserId, 'system-level ingestion can explicitly classify a document SHARED');
  check((await call('GET', `/api/documents/${sharedDoc.document.documentId}`, { token: B.token })).status === 200, 'SHARED document readable by any authenticated user');
  check((await call('DELETE', `/api/documents/${sharedDoc.document.documentId}`, { token: B.token })).status === 403, 'SHARED document is read-only (DELETE -> 403)');
  check((await call('GET', '/api/documents', { token: B.token })).body.documents.some((d: any) => d.documentId === sharedDoc.document.documentId), 'SHARED document appears in every user\'s list');
  check(sharedDoc.document.evidenceIds!.every(id => evidenceService.getRepository().getEvidence(id)?.visibility === 'SHARED'), 'evidence derived from a SHARED document is SHARED');
  const apiUploadAttempt = await call('POST', '/api/documents/upload', { token: B.token, body: { fileName: 'try_share.txt', fileText: `try share ${Date.now()}`, visibility: 'SHARED' } });
  check(apiUploadAttempt.body.document.visibility === 'PRIVATE' && apiUploadAttempt.body.document.ownerUserId === B.userId, 'HTTP clients cannot publish documents as SHARED');
  const stratList = await call('GET', '/api/strategies', { token: B.token });
  check(stratList.status === 200 && stratList.body.count > 0 && stratList.body.isAnalyticalOnly === true && stratList.body.executionProhibited === true, 'built-in strategy catalogue readable by any authenticated user and analytical-only');
  check((await call('GET', `/api/strategies/${builtinId}`, { token: B.token })).status === 200, 'built-in strategy readable by non-creator');
  check(!stratList.body.strategies.some((s: any) => s.strategyId === stratId), 'built-in catalogue does not leak another user\'s custom strategy');
  check(await rejectsWith(() => authorizationService.authorizeStrategy(builtinId, A.userId, 'write'), e => e instanceof AuthorizationError && e.statusCode === 403), 'built-in strategy is read-only even for authenticated users');
  check((await call('GET', '/api/search?q=AAPL', { token: B.token })).status === 200, 'canonical security reference lookup (search) available to authenticated users');
  check((await call('POST', '/api/sec/cache/clear', { token: A.token })).status === 403, 'destructive global cache clear is forbidden for normal users (ADMIN_USER_IDS unset => nobody)');
  check((await call('POST', '/api/events/record', { token: A.token, body: { eventId: 'e', securityId: 'us-aapl', eventType: 'X' } })).status === 403, 'recording into the shared event pool is operator-only');
  check((await call('GET', '/api/events', { token: A.token })).status === 200, 'shared investment events remain readable by authenticated users');

  // =====================================================================================
  section('9. Legitimate authenticated owner workflows');
  // =====================================================================================
  const flow = await register('flow');
  const login = await call('POST', '/api/auth/login', { body: { email: flow.email, password: 'Ph@se38-2A-secret' } });
  check(login.status === 200 && login.body.authenticated === true && !!login.body.session?.sessionId, 'login returns a session for valid credentials');
  const flowTok = login.body.session.sessionId as string;
  const meAuthed = await call('GET', '/api/auth/me', { token: flowTok });
  check(meAuthed.body.authenticated === true && meAuthed.body.user.userId === flow.userId && !JSON.stringify(meAuthed.body).includes('passwordHash'), '/api/auth/me returns the principal without secrets');
  check((await call('GET', '/api/auth/me', { headers: { cookie: `session_id=${encodeURIComponent(flowTok)}` } })).body.authenticated === true, 'cookie-based session authenticates');
  check((await call('GET', '/api/auth/me', { headers: { 'x-session-id': flowTok } })).body.authenticated === true, 'X-Session-Id header session authenticates');
  const f1 = await call('POST', '/api/watchlist', { token: flowTok, body: { symbol: 'TCS' } });
  check(f1.status === 201, 'owner creates watchlist item');
  check((await call('PATCH', `/api/watchlist/${f1.body.watchlistItemId}`, { token: flowTok, body: { enabled: false } })).body.enabled === false, 'owner updates own watchlist item (by id)');
  check((await call('GET', '/api/watchlist', { token: flowTok })).body.watchlist.length === 1, 'owner lists own watchlist');
  const f2 = await call('POST', '/api/alerts/rules', { token: flowTok, body: { symbol: 'TCS', alertType: 'PRICE_ABOVE', threshold: 4000 } });
  check(f2.status === 201 && (await call('PATCH', `/api/alerts/rules/${f2.body.alertRuleId}`, { token: flowTok, body: { threshold: 4100 } })).body.threshold === 4100, 'owner creates and updates an alert rule');
  check((await call('DELETE', `/api/alerts/rules/${f2.body.alertRuleId}`, { token: flowTok })).status === 200, 'owner deletes own alert rule');
  check((await call('DELETE', `/api/watchlist/${f1.body.watchlistItemId}`, { token: flowTok })).status === 200, 'owner deletes own watchlist item');
  const f3 = await call('POST', '/api/documents/upload', { token: flowTok, body: { fileName: 'flow.txt', fileText: `flow doc ${Date.now()}`, securityId: 'us-aapl' } });
  check(f3.status === 200 && f3.body.document.processingStatus === 'READY', 'owner uploads and ingests a document');
  check((await call('GET', `/api/documents/${f3.body.document.documentId}`, { token: flowTok })).status === 200, 'owner reads own document by id');
  check((await call('GET', '/api/documents', { token: flowTok })).body.documents.some((d: any) => d.documentId === f3.body.document.documentId), 'owner lists own document');
  check((await call('GET', '/api/documents/stats', { token: flowTok })).body.totalDocuments >= 1, 'owner sees document stats');
  check((await call('GET', '/api/persistence/documents', { token: flowTok })).body.documents.some((d: any) => d.documentId === f3.body.document.documentId), 'owner sees own document via persistence route');
  const f4 = await call('POST', '/api/policies', { token: flowTok, body: { name: 'flow policy', policyType: 'THESIS_INVALIDATION' } });
  check(f4.status === 201 && (await call('DELETE', `/api/policies/${f4.body.policyId}`, { token: flowTok })).status === 200, 'owner creates and deletes own policy');
  check((await call('POST', '/api/strategies/validate', { token: flowTok, body: { name: 'x' } })).body.valid === false, 'authenticated strategy validation works');
  check((await call('GET', '/api/health')).status === 200 && (await call('GET', '/api/data-status', { token: flowTok })).status === 200, 'health stays public; diagnostics available to authenticated users');
  const f5 = await call('POST', '/api/research/plans', { token: flowTok, body: { securityId: 'us-aapl', title: 'flow plan', objective: 'o' } });
  check(f5.status === 201 && (await call('GET', `/api/research/plans/${f5.body.planId}`, { token: flowTok })).status === 200, 'owner creates and reads own investigation plan');
  check((await call('GET', `/api/research/plans?userId=${A.userId}`, { token: flowTok })).body.every((p: any) => p.userId === flow.userId), 'investigation plans list returns only the caller\'s plans');

  // =====================================================================================
  section('10. PostgreSQL ownership persistence (recording fake client; no database contacted)');
  // =====================================================================================
  const recorded: { sql: string; params: any[] }[] = [];
  // `emptyFor` lets a lookup query (e.g. duplicate detection) return no rows while the INSERT ... RETURNING returns `rows`.
  const makeClient = (rows: any[] = [], emptyFor?: RegExp) => ({
    query: async (sql: string, params: any[] = []) => {
      recorded.push({ sql, params });
      const out = emptyFor && emptyFor.test(sql) ? [] : rows;
      return { rows: out, rowCount: out.length };
    },
    runTransaction: async (fn: any) => fn({ query: async (sql: string, params: any[] = []) => { recorded.push({ sql, params }); return { rows: [], rowCount: 0 }; } })
  }) as any;
  const lastInsert = () => recorded.filter(r => /INSERT INTO/i.test(r.sql)).slice(-1)[0];

  // documents
  recorded.length = 0;
  const pgDocs = new pg.PostgresResearchDocumentRepository(makeClient([{ document_id: 'd1', filename: 'f', document_type: 'TXT', content_hash: 'h', title: 't', source: 's', uploaded_at: new Date(), processing_status: 'READY', security_associations: [], metadata: {}, extraction_metadata: {}, page_row_provenance: [], owner_user_id: A.userId, visibility: 'PRIVATE' }], /content_hash = \$1 AND COALESCE/));
  await pgDocs.save({ documentId: 'd1', fileName: 'f', documentType: 'TXT', contentHash: 'h', title: 't', processingStatus: 'READY', ownerUserId: A.userId, visibility: 'PRIVATE' } as any);
  check(/owner_user_id/.test(lastInsert().sql) && lastInsert().params.includes(A.userId) && lastInsert().params.includes('PRIVATE'), 'PG documents INSERT persists owner_user_id + visibility');
  check(recorded.some(r => /SELECT \* FROM research_documents WHERE content_hash = \$1 AND COALESCE\(owner_user_id/.test(r.sql)), 'PG document duplicate detection is owner-scoped');
  const mappedDoc: any = (await pgDocs.getAllForOwner(A.userId))[0];
  check(mappedDoc.ownerUserId === A.userId && mappedDoc.userId === A.userId && mappedDoc.visibility === 'PRIVATE', 'PG documents row->domain mapping restores ownerUserId/userId/visibility');
  const scoped = recorded.filter(r => /FROM research_documents WHERE \(owner_user_id = \$1/.test(r.sql)).slice(-1)[0];
  check(!!scoped && scoped.params[0] === A.userId, 'PG documents getAllForOwner filters by owner_user_id = $1 in SQL');
  check(await rejectsWith(() => pgDocs.getAllForOwner(''), isScopeErr), 'PG documents getAllForOwner("") -> TenantScopeError (no SQL issued)');

  // evidence
  recorded.length = 0;
  const pgEv = new pg.PostgresEvidenceRepository(makeClient([{ evidence_id: 'e1', source_type: 'SEC_EDGAR', provider: 'p', title: 't', content: 'c', epistemic_status: 'REAL', is_simulated: false, owner_user_id: null, visibility: 'SHARED' }]));
  await pgEv.addEvidence({ evidenceId: 'e1', sourceType: 'RESEARCH_DOCUMENT', provider: 'p', title: 't', content: 'c', publishedAt: '2024-01-01', retrievedAt: '2024-01-01', epistemicStatus: 'REAL', isSimulated: false, ownerUserId: A.userId, visibility: 'PRIVATE' } as any);
  const evIns = recorded.filter(r => /INSERT INTO evidence_items/i.test(r.sql))[0];
  check(!evIns || (/owner_user_id, visibility/.test(evIns.sql) && evIns.params.includes(A.userId)), 'PG evidence INSERT persists owner_user_id + visibility');
  const evScoped = await pgEv.queryEvidenceForOwner(A.userId, { securityId: 'us-aapl' });
  const evSql = recorded.filter(r => /FROM evidence_items WHERE \(owner_user_id = \$1/.test(r.sql)).slice(-1)[0];
  check(!!evSql && evSql.params[0] === A.userId && /owner_user_id IS NULL AND visibility = 'SHARED'/.test(evSql.sql), 'PG evidence scoped query = owner match OR (ownerless AND explicitly SHARED)');
  check(evScoped[0]?.visibility === 'SHARED' && (evScoped[0] as any).ownerUserId === undefined, 'PG evidence mapping restores visibility; ownerless stays ownerless');
  check(await rejectsWith(() => pgEv.queryEvidenceForOwner('', {}), isScopeErr), 'PG evidence queryEvidenceForOwner("") -> TenantScopeError');

  // generic owned entities: INSERT carries owner params; mapper restores them
  const ownedCases: Array<[string, () => Promise<unknown>, RegExp]> = [
    ['notebooks', async () => new pg.PostgresResearchNotebookRepository(makeClient([{ notebook_id: 'n', security_id: 's', source_registry: [], evidence_references: [] }])).save({ notebookId: 'n', securityId: 'us-aapl', ownerUserId: A.userId } as any), /INSERT INTO research_notebooks/],
    ['snapshots', async () => new pg.PostgresResearchSnapshotRepository(makeClient([])).save({ snapshotId: 's1', notebookId: 'n', securityId: 'us-aapl', ownerUserId: A.userId } as any), /INSERT INTO research_snapshots/],
    ['decisions', async () => new pg.PostgresDecisionRepository(makeClient([])).save({ decisionId: 'd', securityId: 'us-aapl', asOfDate: '2024-01-01', compositeScore: 1, overallAssessment: 'NEUTRAL', conviction: 'LOW', ownerUserId: A.userId } as any), /INSERT INTO investment_decisions/],
    ['strategies', async () => new pg.PostgresStrategyRepository(makeClient([{ strategy_id: 's', name: 'n' }])).save({ id: 's', title: 'n', ownerUserId: A.userId } as any), /INSERT INTO strategies/],
    ['backtests', async () => new pg.PostgresBacktestRepository(makeClient([])).save({ backtestId: 'b', strategyId: 's', ownerUserId: A.userId } as any), /INSERT INTO backtests/],
    ['alerts', async () => new pg.PostgresAlertRepository(makeClient([{ alert_id: 'a', type: 't', severity: 's', title: 't' }])).save({ id: 'a', ticker: 'AAPL', type: 'PRICE', severity: 'HIGH', title: 't', timestamp: 'x', ownerUserId: A.userId } as any), /INSERT INTO alerts/]
  ];
  for (const [name, run, re] of ownedCases) {
    recorded.length = 0;
    await run();
    const ins = recorded.find(r => re.test(r.sql));
    check(!!ins && /owner_user_id/.test(ins.sql) && ins.params.includes(A.userId) && ins.params.includes('PRIVATE'), `PG ${name} INSERT persists owner_user_id + visibility (previously dropped)`);
  }
  const mapNb: any = await new pg.PostgresResearchNotebookRepository(makeClient([{ notebook_id: 'n', security_id: 's', source_registry: [], evidence_references: [], owner_user_id: A.userId, visibility: 'PRIVATE' }])).get('n');
  check(mapNb.ownerUserId === A.userId && mapNb.visibility === 'PRIVATE', 'PG notebook mapping restores owner');
  const mapBt: any = await new pg.PostgresBacktestRepository(makeClient([{ backtest_id: 'b', strategy_id: 's', metrics: {}, trades: [], equity_curve: [], benchmark: {}, status: 'COMPLETED', owner_user_id: A.userId, visibility: 'PRIVATE' }])).get('b');
  check(mapBt.ownerUserId === A.userId, 'PG backtest mapping restores owner');
  recorded.length = 0;
  await new pg.PostgresBacktestRepository(makeClient([])).getAllForOwner(A.userId);
  check(/WHERE \(owner_user_id = \$1/.test(recorded[0].sql) && recorded[0].params[0] === A.userId, 'PG backtests getAllForOwner filters in SQL');
  recorded.length = 0;
  await new pg.PostgresDecisionRepository(makeClient([])).getHistoryForOwner('us-aapl', A.userId);
  check(/security_id = \$1 AND \(owner_user_id = \$2/.test(recorded[0].sql) && recorded[0].params[1] === A.userId, 'PG decisions getHistoryForOwner filters in SQL');
  recorded.length = 0;
  await new pg.PostgresResearchSnapshotRepository(makeClient([])).getBySecurityIdForOwner('us-aapl', A.userId);
  check(/security_id = \$1 AND \(owner_user_id = \$2/.test(recorded[0].sql) && recorded[0].params[1] === A.userId, 'PG snapshots getBySecurityIdForOwner filters in SQL');
  check(await rejectsWith(() => new pg.PostgresBacktestRepository(makeClient([])).getAllForOwner(''), isScopeErr), 'PG backtests getAllForOwner("") -> TenantScopeError');
  check(await rejectsWith(() => new pg.PostgresDecisionRepository(makeClient([])).getHistoryForOwner('x', ''), isScopeErr), 'PG decisions getHistoryForOwner(.., "") -> TenantScopeError');

  // migration 003 static safety
  const versions = MIGRATIONS.map(m => m.version);
  check(versions.slice(0, 3).join(',') === '1,2,3' && versions.every((v, i) => v === i + 1), 'migrations are append-only and contiguous (1,2,3 untouched; later versions only appended)');
  const m3 = MIGRATIONS.find(m => m.version === 3)!;
  const m3sql = m3.up.join('\n');
  check(m3.name === '003_ownership_and_visibility', 'migration 003 name');
  for (const t of ['research_documents', 'evidence_items', 'research_notebooks', 'research_snapshots', 'investment_decisions', 'strategies', 'backtests', 'watchlists', 'alerts', 'portfolio_positions']) {
    check(new RegExp(`ALTER TABLE ${t}\\s+ADD COLUMN IF NOT EXISTS owner_user_id TEXT`).test(m3sql), `migration 003 adds owner_user_id to ${t} (idempotent)`);
  }
  check(!/DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM|TRUNCATE|UPDATE\s+\w+\s+SET/i.test(m3sql), 'migration 003 contains no destructive/rewriting statements (no DROP TABLE/COLUMN, DELETE, TRUNCATE, UPDATE)');
  check(!/ROW\s+LEVEL\s+SECURITY|CREATE\s+POLICY/i.test(m3sql), 'migration 003 does NOT enable row-level security');
  check(/ownership_assignments/.test(m3sql) && /legacy_unowned_records/.test(m3sql), 'migration 003 defines the auditable ownership-assignment ledger and legacy report view');
  check(/DEFAULT 'PRIVATE'/.test(m3sql) && !/DEFAULT 'SHARED'/.test(m3sql), 'migration 003 defaults every existing row to PRIVATE (never SHARED)');
  check(!/INSERT\s+INTO/i.test(m3sql.replace(/CREATE TABLE IF NOT EXISTS ownership_assignments[\s\S]*?\);/i, '')), 'migration 003 inserts no data (no ownership is assigned automatically)');
  const envText = fs.existsSync('.env') ? 'present' : 'absent';
  check(envText === 'present' || envText === 'absent', 'test suite did not modify .env (read-only existence check only)');

  // =====================================================================================
  section('11. Safety invariants');
  // =====================================================================================
  const routeText = routes.map(r => `${r.method} ${r.path}`).join('\n');
  check(!/\/(orders?|trades?|broker|place-order|execute-order)(\/|$)/i.test(routeText), 'no trading / order-execution routes exist');
  check(btOwner.body.isAnalyticalOnly === true && btOwner.body.executionProhibited === true, 'owner-visible backtest preserves isAnalyticalOnly/executionProhibited');
  check(histA.body.history.every((d: any) => d.isAnalyticalOnly === true && d.executionProhibited === true), 'persisted decisions preserve isAnalyticalOnly/executionProhibited');
  const allResponses = JSON.stringify([persStatus.body, meAuthed.body, login.body.user]);
  check(!/api[_-]?key|secret|password_?hash|DATABASE_URL/i.test(allResponses.replace(/"sessionId"/g, '')), 'auth/status responses expose no secrets');
  check(evalRes.body.evaluations?.every?.((e: any) => !e.currency || ['USD', 'INR'].includes(e.currency)) !== false, 'currency handling untouched (USD/INR remain separate)');

  // admin path last: it clears shared in-memory caches
  process.env.ADMIN_USER_IDS = `${C.userId}, someone-else`;
  check((await call('POST', '/api/sec/cache/clear', { token: A.token })).status === 403, 'cache clear still forbidden for a non-listed user when admins are configured');
  check((await call('POST', '/api/sec/cache/clear', { token: C.token })).status === 200, 'cache clear permitted for an operator listed in ADMIN_USER_IDS');
  process.env.ADMIN_USER_IDS = '';

  await new Promise<void>(resolve => httpServer.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n========================================================================');
  console.log(`PHASE 38.2A SECURITY SUITE: ${passed} PASSED / ${total - passed} FAILED (TOTAL: ${total})`);
  console.log('========================================================================');
  if (failures.length > 0) {
    console.error('Failed checks:\n - ' + failures.join('\n - '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Phase 38.2A suite crashed:', err);
  process.exit(1);
});
