/**
 * Full-Stack Express Server with SEC EDGAR Financial Data Provider
 * Integrates Vite middleware in development and serves static assets in production.
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { financialDataService } from './server/services/financialDataService';
import { classifyAndResolve, extractSecuritiesFromText } from './src/services/searchIntelligence';
import { resolveSecurity } from './src/data/canonicalSecurities';
import { geminiResearchEngine } from './server/services/research/geminiResearchEngine';
import { gatherEvidenceForSecurities, classifyAnalysisType } from './server/services/research/researchEngine';
import { evidenceService } from './server/services/evidence/evidenceService';
import { retrievalEngine } from './server/services/retrieval/retrievalEngine';
import { portfolioIntelligenceService } from './server/services/portfolio/portfolioIntelligenceService';
import { fyersMarketProvider } from './server/providers/fyersMarketProvider';
import { watchlistAlertService } from './server/services/alerts/watchlistAlertService';
import { quantStrategyEngine } from './server/services/quant/quantStrategyEngine';
import { backtestService } from './server/services/backtest/backtestService';
import { researchNotebookService } from './server/services/research/notebookService';
import { documentIngestionService } from './server/services/documents/documentIngestionService';
import { documentRegistry } from './server/services/documents/documentRegistry';
import { decisionIntelligenceService } from './server/services/decision/decisionIntelligenceService';
import { decisionDeltaEngine } from './server/services/decision/decisionDeltaEngine';
import { investmentEventEngine } from './server/services/events/investmentEventEngine';
import { investmentMonitorEngine } from './server/services/monitor/investmentMonitorEngine';
import { alertOrchestrationEngine } from './server/services/alerts/alertOrchestrationEngine';
import { researchPrioritizationEngine } from './server/services/discovery/researchPrioritizationEngine';
import { researchCommandCenterService } from './server/services/commandCenter/researchCommandCenterService';
import { crossInvestmentService } from './server/services/relationships/crossInvestmentService';
import { portfolioScenarioService } from './server/services/scenarios/portfolioScenarioService';
import { counterfactualDecisionService } from './server/services/decision/counterfactualDecisionService';
import { researchMemoryService } from './server/services/memory/researchMemoryService';
import { researchQuestionService } from './server/services/investigation/researchQuestionService';
import { researchGapDetectionService } from './server/services/investigation/researchGapDetectionService';
import { investigationPlanService } from './server/services/investigation/investigationPlanService';
import { evidenceCollectionService } from './server/services/evidence/evidenceCollectionService';
import { persistenceManager } from './server/persistence/persistenceManager';
import { SecurityIdentifier, ResearchAnalysisType, ResearchRequest, EvidenceSourceType, EvidenceEpistemicStatus, ResearchEvidenceItem, MarketDataRequest } from './src/types';
import { authService, AuthenticationError } from './server/auth/authService';
import { resolveUser, requireAuth, setSessionCookie, clearSessionCookie } from './server/auth/authMiddleware';
import { authorizationService, AuthorizationError } from './server/auth/authorizationService';
import { apiAuthGate, requireUserId, isAdminUser, AuthenticationRequiredError } from './server/auth/routePolicy';
import { TenantScopeError } from './server/auth/accessPolicy';
import { requestCorrelation } from './server/middleware/requestCorrelation';
import { structuredLogger } from './server/logging/structuredLogger';
import { authRateLimiter, researchRateLimiter, backtestRateLimiter, documentUploadRateLimiter } from './server/middleware/rateLimiter';
import { errorHandler } from './server/middleware/errorHandler';
import { finmagineProvider } from './server/providers/finmagineProvider';
import { environmentConfigService } from './server/config/environmentConfig';
import { pilotReadinessService } from './server/services/pilot/pilotReadinessService';

/**
 * Builds the fully-wired Express application WITHOUT binding a port or attaching Vite/static serving.
 * Exported so route/authorization behavior can be exercised deterministically (Phase 38.2A tests).
 */
export async function createApp(options: { initializePersistence?: boolean; persistence?: Pick<typeof persistenceManager, 'getStorageHealth'> } = {}) {
  const storageSource = options.persistence ?? persistenceManager;
  const app = express();

  /** Maps authorization-flavoured failures onto the right status instead of a blanket 400/500. */
  const statusForError = (err: unknown, fallback: number): number => {
    if (err instanceof AuthenticationRequiredError) return 401;
    if (err instanceof AuthorizationError) return err.statusCode;
    if (err instanceof TenantScopeError) return 401;
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNAUTHORIZED|AuthorizationError|Access denied|Forbidden|not authorized/i.test(msg)) return 403;
    return fallback;
  };

  // Phase 18: Security Headers & Correlation
  app.use(requestCorrelation);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Phase 19: Explicit CORS Origin Control
  const allowedOrigins = [
    process.env.APP_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ].filter(Boolean) as string[];

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        process.env.NODE_ENV !== 'production' ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost');

      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Request-Id, X-CSRF-Token');
      }
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Phase 19: CSRF Protection for state-changing requests using cookie authentication
  app.use((req, res, next) => {
    const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (stateChangingMethods.includes(req.method) && req.headers['cookie']?.includes('session_id=')) {
      const hasAuthHeader = Boolean(req.headers['authorization'] || req.headers['x-session-id'] || req.headers['x-csrf-token']);
      const secFetchSite = req.headers['sec-fetch-site'];
      const isSameSite = secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none';
      const origin = req.headers['origin'] || req.headers['referer'];
      const isTrustedOrigin = origin && (allowedOrigins.some(o => origin.startsWith(o)) || origin.includes('.run.app') || origin.includes('localhost'));

      if (process.env.NODE_ENV === 'production' && !hasAuthHeader && !isSameSite && !isTrustedOrigin) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Cross-Site Request Forgery (CSRF) validation failed. State-changing requests require explicit origin verification or custom authentication headers.',
            requestId: req.requestId,
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
    }
    next();
  });

  // Phase 18: Structured Request Logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const latencyMs = Date.now() - start;
      if (req.originalUrl?.startsWith('/api')) {
        structuredLogger.info('HTTP Request', {
          requestId: req.requestId,
          endpoint: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          latencyMs,
          userId: (req as any).user?.userId
        });
      }
    });
    next();
  });

  // ==========================================
  // PHASE 16: PERSISTENCE INITIALIZATION & HYDRATION
  // ==========================================
  try {
    if (options.initializePersistence !== false) {
      await persistenceManager.initialize();
      await Promise.all([
        documentRegistry.hydrateFromPersistence(),
        (evidenceService.getRepository() as any).hydrateFromPersistence?.(),
        researchNotebookService.hydrateFromPersistence(),
        backtestService.hydrateFromPersistence(),
        investmentEventEngine.ensureInitialized(),
        investmentMonitorEngine.initialize()
      ]);
    }
  } catch (err) {
    console.error('[Server] Persistence initialization error:', err);
  }

  // Phase 38.2A: identity resolution, rate limiting and the auth gate run BEFORE body parsing so anonymous
  // callers are rejected (401) without their (up to 50 MB) payload ever being parsed.
  app.use(resolveUser);

  // Phase 18: Rate Limiting on sensitive and resource-intensive endpoints
  // Only credential-submitting endpoints count toward the limit; session checks (GET /me) and logout must not
  // exhaust a user's login attempts.
  app.use(['/api/auth/login', '/api/auth/register'], authRateLimiter.middleware());
  app.use('/api/research', researchRateLimiter.middleware());
  app.use('/api/backtests', backtestRateLimiter.middleware());
  app.use('/api/documents/upload', documentUploadRateLimiter.middleware());

  // ==========================================
  // PHASE 38.2A: DENY-BY-DEFAULT API AUTHENTICATION GATE
  // Every /api route requires an authenticated server-side session except the enumerated
  // PUBLIC_API_ROUTES (auth bootstrap + liveness). Mounted before all handlers so it cannot be bypassed
  // by a handler (or an error inside one) and so unknown /api paths also answer 401.
  // ==========================================
  app.use('/api', apiAuthGate);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ==========================================
  // PHASE 17: AUTHENTICATION & IDENTITY ROUTES
  // ==========================================

  // Register a new user
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = await authService.register(
        { email, password },
        req.ip,
        req.headers['user-agent']
      );
      setSessionCookie(res, result.session.sessionId, result.session.expiresAt);
      res.status(201).json({
        authenticated: true,
        user: result.user,
        session: {
          sessionId: result.session.sessionId,
          expiresAt: result.session.expiresAt
        }
      });
    } catch (err: unknown) {
      if (err instanceof AuthenticationError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
      }
    }
  });

  // Login existing user
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = await authService.login(
        { email, password },
        req.ip,
        req.headers['user-agent']
      );
      setSessionCookie(res, result.session.sessionId, result.session.expiresAt);
      res.json({
        authenticated: true,
        user: result.user,
        session: {
          sessionId: result.session.sessionId,
          expiresAt: result.session.expiresAt
        }
      });
    } catch (err: unknown) {
      if (err instanceof AuthenticationError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
      }
    }
  });

  // Logout current session
  app.post('/api/auth/logout', async (req, res) => {
    try {
      if (req.session?.sessionId) {
        await authService.logout(req.session.sessionId);
      }
      clearSessionCookie(res);
      res.json({ authenticated: false, message: 'Logged out successfully' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Get current authenticated user profile
  app.get('/api/auth/me', (req, res) => {
    if (req.user) {
      res.json({
        authenticated: true,
        user: req.user
      });
    } else {
      res.json({
        authenticated: false,
        user: null
      });
    }
  });

  // ==========================================
  // FINANCIAL DATA PROVIDER API ROUTES
  // ==========================================

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    // Phase 38.2B: truthful storage reporting without internals (mode + degraded flag only).
    const storage = storageSource.getStorageHealth();
    res.json({
      status: storage.degraded ? 'degraded' : 'ok',
      engine: 'Investment Intelligence Financial Data Service V1.0',
      storage: { mode: storage.mode, degraded: storage.degraded, authoritative: storage.authoritative },
      timestamp: new Date().toISOString()
    });
  });

  // Data sources status and health endpoint
  app.get('/api/data-status', (_req, res) => {
    try {
      const health = financialDataService.getDataSourcesHealth();
      res.json(health);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Search & Ticker Intelligence endpoint (Phase 6)
  app.get('/api/search', (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const result = classifyAndResolve(q);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // SEC EDGAR Normalized Financial Facts & Derived Statements
  app.get('/api/sec/financials/:ticker', async (req, res) => {
    try {
      const ticker = req.params.ticker;
      if (!ticker) {
        res.status(400).json({ error: 'Ticker parameter is required' });
        return;
      }
      const data = await financialDataService.getSecurityFinancials(ticker);
      res.json(data);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        error: errMsg,
        status: 'unavailable',
        ticker: req.params.ticker,
        retrievedAt: new Date().toISOString()
      });
    }
  });

  // SEC EDGAR Verified Filings (10-K, 10-Q, 8-K, etc.)
  app.get('/api/sec/filings/:ticker', async (req, res) => {
    try {
      const ticker = req.params.ticker;
      if (!ticker) {
        res.status(400).json({ error: 'Ticker parameter is required' });
        return;
      }
      const filings = await financialDataService.getRecentFilings(ticker);
      res.json(filings);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // SEC Raw Submissions Metadata
  app.get('/api/sec/submissions/:ticker', async (req, res) => {
    try {
      const ticker = req.params.ticker;
      const submissions = await financialDataService.getSECSubmissions(ticker);
      res.json(submissions);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // SEC Raw Company Facts (XBRL)
  app.get('/api/sec/facts/:ticker', async (req, res) => {
    try {
      const ticker = req.params.ticker;
      const facts = await financialDataService.getSECCompanyFacts(ticker);
      res.json(facts);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Market Provider Quote (Explicitly tagged as Simulated unless configured)
  app.get('/api/market/quote/:ticker', async (req, res) => {
    try {
      const ticker = req.params.ticker;
      const market = req.query.market as 'US' | 'INDIA' | 'GLOBAL' | undefined;
      const exchange = req.query.exchange as string | undefined;
      const provider = req.query.provider as string | undefined;
      const quote = await financialDataService.getQuote({
        symbol: ticker,
        market,
        exchange,
        provider
      });
      res.json(quote);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Batch Market Quotes endpoint (Multi-symbol query)
  app.get('/api/market/batch', async (req, res) => {
    try {
      const symbolsParam = (req.query.symbols as string) || '';
      const market = req.query.market as 'US' | 'INDIA' | 'GLOBAL' | undefined;
      const exchange = req.query.exchange as string | undefined;
      const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);

      const requests: MarketDataRequest[] = symbols.map(s => ({
        symbol: s,
        market,
        exchange
      }));

      const quotes = await financialDataService.getQuotes(requests);
      res.json(quotes);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  app.post('/api/market/batch', async (req, res) => {
    try {
      const { symbols, market, exchange } = req.body;
      const symbolList: string[] = Array.isArray(symbols) ? symbols : [];
      const requests: MarketDataRequest[] = symbolList.map(s => ({
        symbol: s,
        market,
        exchange
      }));

      const quotes = await financialDataService.getQuotes(requests);
      res.json(quotes);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // FYERS Provider Health Status (Server-side metadata, never leaks secrets)
  app.get('/api/fyers/status', (_req, res) => {
    try {
      const health = fyersMarketProvider.getHealthStatus();
      res.json(health);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Phase 18: Finmagine Provider Health Status (Server-side metadata, never leaks secrets)
  app.get('/api/finmagine/status', (_req, res) => {
    try {
      const status = finmagineProvider.getHealthStatus();
      res.json(status);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Phase 18: Safe Production Environment Diagnostics (Never leaks secrets)
  app.get('/api/config/status', (_req, res) => {
    try {
      const summary = environmentConfigService.getSafeSummary();
      res.json(summary);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Market Historical Prices endpoint (OHLCV)
  app.get('/api/market/history/:ticker', async (req, res) => {
    try {
      const ticker = req.params.ticker;
      const market = req.query.market as 'US' | 'INDIA' | 'GLOBAL' | undefined;
      const exchange = req.query.exchange as string | undefined;
      const period = req.query.period as '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX' | undefined;
      const interval = req.query.interval as '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo' | undefined;
      const history = await financialDataService.getHistoricalPrices({
        symbol: ticker,
        market,
        exchange,
        period,
        interval
      });
      res.json(history);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Market Status endpoint (US / INDIA)
  app.get('/api/market/status/:market', async (req, res) => {
    try {
      const market = (req.params.market?.toUpperCase() || 'US') as 'US' | 'INDIA';
      const exchange = req.query.exchange as string | undefined;
      const status = await financialDataService.getMarketStatus({ market, exchange });
      res.json(status);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Invalidate / clear cache
  app.post('/api/sec/cache/clear', (req, res) => {
    // Phase 38.2A: destructive global maintenance (clears the shared evidence repository for ALL tenants).
    // Restricted to operators listed in ADMIN_USER_IDS; fail-closed when unset.
    if (!isAdminUser(req.user?.userId)) {
      res.status(403).json({ error: 'Forbidden', code: 'ADMIN_REQUIRED', message: 'This maintenance endpoint requires an administrator.' });
      return;
    }
    financialDataService.clearCache();
    geminiResearchEngine.clearCache();
    evidenceService.getRepository().clear();
    retrievalEngine.clearCache();
    res.json({ message: 'Financial, research, and evidence provider cache cleared successfully', timestamp: new Date().toISOString() });
  });

  // ==========================================
  // EVIDENCE FOUNDATION & RETRIEVAL (PHASE 8A & 8B)
  // ==========================================

  // Dedicated Semantic Retrieval endpoint (Phase 8B)
  app.post('/api/evidence/search', async (req, res) => {
    try {
      const { query, securityId, securityIds, sourceType, documentType, epistemicStatus, asOfDate, limit } = req.body || {};
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Query parameter is required and must be a string' });
        return;
      }

      const secList: string[] = [];
      if (securityId) secList.push(securityId);
      if (Array.isArray(securityIds)) secList.push(...securityIds);

      // Pre-gather evidence into repository if target securities specified
      const userId = requireUserId(req);
      if (secList.length > 0) {
        await evidenceService.gatherEvidence({ securityIds: secList, asOfDate, ownerUserId: userId });
      }

      const retrievalResult = await retrievalEngine.retrieve({
        query,
        securityId,
        securityIds: secList.length > 0 ? secList : undefined,
        sourceType,
        documentType,
        epistemicStatus,
        asOfDate,
        limit,
        userId
      });

      res.json(retrievalResult);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  app.get('/api/evidence', async (req, res) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.query.securityId as string | undefined;
      const sourceType = req.query.sourceType as EvidenceSourceType | undefined;
      const provider = req.query.provider as string | undefined;
      const epistemicStatus = req.query.epistemicStatus as EvidenceEpistemicStatus | undefined;
      const asOfDate = req.query.asOfDate as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      // If a specific security is queried and not yet in repository, gather it
      if (securityId) {
        await evidenceService.gatherEvidence({ securityIds: [securityId], asOfDate, ownerUserId: userId });
      }

      const repo = evidenceService.getRepository();
      const filter = {
        securityId,
        sourceType,
        provider,
        epistemicStatus,
        asOfDate,
        limit
      };

      // Phase 38.2A: tenant scope is applied by the repository itself (owner's private items + explicitly SHARED only).
      const evidence = asOfDate
        ? repo.getEvidenceAvailableAsOfForOwner(userId, asOfDate, filter)
        : repo.queryEvidenceForOwner(userId, filter);

      res.json({
        evidence,
        count: evidence.length,
        asOfDate: asOfDate || null,
        timestamp: new Date().toISOString()
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // ==========================================
  // GEMINI RESEARCH & ANALYSIS ENGINE (PHASE 7A)
  // ==========================================

  // Research Status endpoint
  app.get('/api/research/status', (_req, res) => {
    res.json({
      engine: geminiResearchEngine.getEngineName(),
      isConfigured: geminiResearchEngine.isConfigured(),
      timestamp: new Date().toISOString()
    });
  });

  // Research Inquiry & Synthesis endpoint
  app.post('/api/research/analyze', async (req, res) => {
    try {
      const { query, securityIds, analysisType, portfolioContext } = req.body || {};

      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Query parameter is required and must be a non-empty string.' });
        return;
      }

      // 1. Resolve securities (from explicit IDs or via text extractor)
      let resolvedSecurities: SecurityIdentifier[] = [];
      if (Array.isArray(securityIds) && securityIds.length > 0) {
        resolvedSecurities = securityIds
          .map(id => resolveSecurity(id))
          .filter((s): s is SecurityIdentifier => s !== null);
      } else {
        resolvedSecurities = extractSecuritiesFromText(query);
      }

      // 2. Classify requested analysis type
      const requestedAnalysisType: ResearchAnalysisType =
        analysisType || classifyAnalysisType(query, resolvedSecurities);

      // 3. Ensure evidence repository is populated with factual multi-provider evidence
      const userId = requireUserId(req);
      await evidenceService.gatherEvidence({
        securities: resolvedSecurities,
        portfolioContext,
        ownerUserId: userId
      });

      // 4. Retrieve bounded, diverse evidence using Semantic Retrieval Engine (Phase 8B)
      const targetSecIds = resolvedSecurities.map(s => s.id || s.symbol);
      const retrievalResult = await retrievalEngine.retrieve({
        query: query.trim(),
        securityIds: targetSecIds.length > 0 ? targetSecIds : undefined,
        userId
      });

      // Map retrievalBundle to ResearchEvidenceItem
      let availableEvidence: ResearchEvidenceItem[] = retrievalResult.evidenceBundle.map(ev => ({
        id: ev.evidenceId,
        securityId: ev.securityId,
        symbol: ev.sourceReference?.symbol || ev.securityId,
        sourceType: ev.sourceType,
        provider: ev.provider,
        epistemicStatus: ev.epistemicStatus,
        isSimulated: ev.isSimulated,
        retrievedAt: ev.retrievedAt,
        filingDate: ev.filingDate,
        accessionNumber: ev.sourceReference?.accessionNumber,
        description: ev.title ? `${ev.title}: ${ev.content}` : ev.content,
        data: (ev.structuredValue as Record<string, unknown>) || null
      }));

      // Fallback: If retrieval returned empty, fallback to direct gatherEvidenceForSecurities
      if (availableEvidence.length === 0) {
        availableEvidence = await gatherEvidenceForSecurities(
          resolvedSecurities,
          query,
          portfolioContext
        );
      }

      // 5. Construct structured research request with retrieval metadata and preserved conflicts
      const topSources = Array.from(new Set(availableEvidence.map(e => `${e.sourceType} (${e.provider})`)));
      const request: ResearchRequest = {
        query: query.trim(),
        securities: resolvedSecurities,
        requestedAnalysisType,
        availableEvidence,
        context: {
          portfolioContext
        },
        retrievalMetadata: {
          retrievalMode: retrievalResult.retrievalMode,
          totalCandidates: retrievalResult.totalCandidates,
          retrievedCount: availableEvidence.length,
          topSources,
          conflictsCount: retrievalResult.conflicts.length
        },
        conflicts: retrievalResult.conflicts
      };

      // 6. Execute analysis via Gemini Research Engine (with seamless fallback)
      const researchResponse = await geminiResearchEngine.analyze(request, { fallbackOnError: true });

      res.json(researchResponse);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isUnavailable = errMsg.includes('missing') || errMsg.includes('unconfigured') || errMsg.includes('not configured');
      res.status(isUnavailable ? 503 : 500).json({
        error: errMsg,
        status: isUnavailable ? 'unavailable' : 'error',
        message: errMsg
      });
    }
  });

  // ==========================================
  // INVESTMENT RESEARCH NOTEBOOK API (PHASE 13)
  // ==========================================

  // List the caller's research notebooks
  app.get('/api/research/notebooks', (req, res) => {
    try {
      const list = researchNotebookService.listNotebooksForOwner(requireUserId(req));
      res.json({ notebooks: list, count: list.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Get or initialize the caller's research notebook for a security
  app.get('/api/research/notebook/:securityId', async (req, res) => {
    try {
      const { securityId } = req.params;
      const asOfDate = req.query.asOfDate as string | undefined;
      const notebook = await researchNotebookService.getOrCreateNotebook(securityId, asOfDate, requireUserId(req));
      res.json(notebook);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Get source registry items for a security (shared provider sources + the caller's own private sources)
  app.get('/api/research/notebook/:securityId/sources', async (req, res) => {
    try {
      const { securityId } = req.params;
      const asOfDate = req.query.asOfDate as string | undefined;
      const sources = await researchNotebookService.getNotebookSources(securityId, asOfDate, requireUserId(req));
      res.json({ sources, count: sources.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Get transparent source coverage for a security
  app.get('/api/research/notebook/:securityId/coverage', async (req, res) => {
    try {
      const { securityId } = req.params;
      const asOfDate = req.query.asOfDate as string | undefined;
      const coverage = await researchNotebookService.getCoverage(securityId, asOfDate, requireUserId(req));
      res.json(coverage);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Execute research inquiry and synthesize snapshot (owner stamped from the authenticated principal)
  app.post('/api/research/notebook/:securityId/execute', async (req, res) => {
    try {
      const { securityId } = req.params;
      const { queryType = 'INVESTMENT_THESIS', customQuery, asOfDate, portfolioContext, sourceFilter } = req.body || {};
      const snapshot = await researchNotebookService.executeResearch({
        securityId,
        queryType,
        customQuery,
        asOfDate,
        portfolioContext,
        sourceFilter,
        ownerUserId: requireUserId(req)
      });
      res.json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // List the caller's historical research snapshots for a notebook
  app.get('/api/research/notebook/:securityId/snapshots', (req, res) => {
    try {
      const userId = requireUserId(req);
      const { securityId } = req.params;
      const canonical = resolveSecurity(securityId);
      const notebookId = researchNotebookService.notebookIdFor(canonical ? canonical.id : securityId, userId);
      const snapshots = researchNotebookService.getSnapshotsForOwner(notebookId, userId);
      res.json({ snapshots, count: snapshots.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Get a single research snapshot by ID (owner only; unknown ids are 404, foreign/legacy ids are 403)
  app.get('/api/research/snapshot/:snapshotId', async (req, res) => {
    try {
      const { snapshotId } = req.params;
      const snapshot = await authorizationService.authorizeSnapshot(snapshotId, requireUserId(req));
      res.json(snapshot);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // ==========================================
  // RESEARCH DOCUMENT INTELLIGENCE API (PHASE 14)
  // ==========================================

  // Ingest & parse uploaded document (ownership is always the authenticated principal, never the request body)
  app.post('/api/documents/upload', async (req, res) => {
    try {
      const userId = requireUserId(req);
      const payload = {
        ...req.body,
        ownerUserId: userId,
        userId,
        visibility: 'PRIVATE',
        uploadedBy: req.user?.email || 'system'
      };
      const result = await documentIngestionService.ingestDocument(payload);
      res.status(200).json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Validate document without persisting
  app.post('/api/documents/validate', async (req, res) => {
    try {
      const result = await documentIngestionService.validateDocument(req.body);
      res.status(200).json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Document Registry Stats (describes only documents the caller may read)
  app.get('/api/documents/stats', (req, res) => {
    try {
      const stats = documentRegistry.getStats(requireUserId(req));
      res.json(stats);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // List the caller's registered research documents (optionally filtered by securityId)
  app.get('/api/documents', (req, res) => {
    try {
      const { securityId } = req.query;
      const userId = requireUserId(req);
      const docs = securityId
        ? documentRegistry.getDocumentsBySecurity(String(securityId), userId)
        : documentRegistry.getAllDocuments(userId);
      res.json({ documents: docs, count: docs.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Get single document by ID (owner only)
  app.get('/api/documents/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;
      const doc = await authorizationService.authorizeDocument(documentId, requireUserId(req), 'read');
      res.json(doc);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // Delete document and purge its evidence from repository (owner only)
  app.delete('/api/documents/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;
      const userId = requireUserId(req);
      await authorizationService.authorizeDocument(documentId, userId, 'write');
      const success = await documentIngestionService.deleteDocumentForOwner(documentId, userId);
      if (!success) {
        res.status(404).json({ error: `Document ${documentId} not found.` });
        return;
      }
      res.json({ success: true, deletedDocumentId: documentId });
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // ==========================================
  // PORTFOLIO INTELLIGENCE & ANALYTICS (PHASE 9)
  // ==========================================

  // Deterministic Portfolio Metrics endpoint (GET)
  app.get('/api/portfolio/metrics', (req, res) => {
    try {
      const baseCurrency = (req.query.baseCurrency as string) === 'INR' ? 'INR' : 'USD';
      const metrics = portfolioIntelligenceService.getPortfolioMetrics(undefined, baseCurrency);
      res.json({
        metrics,
        baseCurrency,
        epistemicStatus: 'CALCULATED',
        timestamp: new Date().toISOString()
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Deterministic Portfolio Metrics endpoint (POST for custom portfolio states)
  app.post('/api/portfolio/metrics', (req, res) => {
    try {
      const { portfolio, baseCurrency = 'USD' } = req.body || {};
      const metrics = portfolioIntelligenceService.getPortfolioMetrics(portfolio, baseCurrency === 'INR' ? 'INR' : 'USD');
      res.json({
        metrics,
        baseCurrency,
        epistemicStatus: 'CALCULATED',
        timestamp: new Date().toISOString()
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Portfolio Inquiry, Attribution & Grounded Explanation endpoint
  app.post('/api/portfolio/analyze', async (req, res) => {
    try {
      const { query, portfolioContext, asOfDate } = req.body || {};

      if (!query || typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Query parameter is required and must be a non-empty string.' });
        return;
      }

      const analysis = await portfolioIntelligenceService.analyzePortfolioQuestion({
        query: query.trim(),
        portfolioContext,
        asOfDate,
        ownerUserId: requireUserId(req)
      });

      res.json(analysis);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // ==========================================
  // WATCHLIST & ALERT INTELLIGENCE (PHASE 10)
  // ==========================================

  // Watchlist endpoints (strictly the caller's own items)
  app.get('/api/watchlist', (req, res) => {
    try {
      const items = watchlistAlertService.getWatchlistForUser(requireUserId(req));
      res.json({ watchlist: items, count: items.length, timestamp: new Date().toISOString() });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  app.post('/api/watchlist', (req, res) => {
    try {
      const { symbol, securityId, market, exchange, currency, notes } = req.body || {};
      if (!symbol || typeof symbol !== 'string') {
        res.status(400).json({ error: 'Symbol is required' });
        return;
      }
      const item = watchlistAlertService.addWatchlistItem({
        symbol,
        securityId,
        market,
        exchange,
        currency,
        notes,
        ownerUserId: requireUserId(req)
      });
      res.status(201).json(item);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  app.delete('/api/watchlist/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const item = await authorizationService.authorizeWatchlistItem(id, requireUserId(req), 'write');
      const success = watchlistAlertService.removeWatchlistItem(item.watchlistItemId);
      if (!success) {
        res.status(404).json({ error: `Watchlist item ${id} not found` });
        return;
      }
      res.json({ success: true, message: `Watchlist item ${id} removed` });
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  app.patch('/api/watchlist/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const item = await authorizationService.authorizeWatchlistItem(id, requireUserId(req), 'write');
      const { enabled } = req.body || {};
      const updated = watchlistAlertService.toggleWatchlistItem(item.watchlistItemId, enabled);
      if (!updated) {
        res.status(404).json({ error: `Watchlist item ${id} not found` });
        return;
      }
      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // Alert Rules endpoints
  app.get('/api/alerts/rules', (req, res) => {
    try {
      const securityId = req.query.securityId as string | undefined;
      const symbol = req.query.symbol as string | undefined;
      const enabled = req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined;
      const alertType = req.query.alertType as any;
      const rules = watchlistAlertService.getAlertRulesForUser(requireUserId(req), { securityId, symbol, enabled, alertType });
      res.json({ rules, count: rules.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  app.post('/api/alerts/rules', (req, res) => {
    try {
      const { securityId, portfolioId, symbol, alertType, threshold, comparison, priority, cooldownMinutes, enabled, metadata } = req.body || {};
      if (!alertType || threshold === undefined) {
        res.status(400).json({ error: 'alertType and threshold are required fields' });
        return;
      }
      const rule = watchlistAlertService.createAlertRule({
        securityId,
        portfolioId,
        symbol,
        alertType,
        threshold,
        comparison,
        priority,
        cooldownMinutes,
        enabled,
        metadata,
        ownerUserId: requireUserId(req)
      });
      res.status(201).json(rule);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  app.patch('/api/alerts/rules/:id', async (req, res) => {
    try {
      const id = req.params.id;
      await authorizationService.authorizeAlertRule(id, requireUserId(req), 'write');
      // Ownership/identity fields are server-controlled and can never be changed by the client.
      const { ownerUserId: _o, userId: _u, tenantId: _t, visibility: _v, alertRuleId: _id, ...safeUpdates } = req.body || {};
      const updated = watchlistAlertService.updateAlertRule(id, safeUpdates);
      if (!updated) {
        res.status(404).json({ error: `Alert rule ${id} not found` });
        return;
      }
      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  app.delete('/api/alerts/rules/:id', async (req, res) => {
    try {
      const id = req.params.id;
      await authorizationService.authorizeAlertRule(id, requireUserId(req), 'write');
      const success = watchlistAlertService.deleteAlertRule(id);
      if (!success) {
        res.status(404).json({ error: `Alert rule ${id} not found` });
        return;
      }
      res.json({ success: true, message: `Alert rule ${id} deleted` });
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // Alert Events and Evaluation endpoints
  app.get('/api/alerts/events', (req, res) => {
    try {
      const isRead = req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined;
      const priority = req.query.priority as any;
      const securityId = req.query.securityId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const events = watchlistAlertService.getAlertEventsForUser(requireUserId(req), { isRead, priority, securityId, limit });
      res.json({ events, count: events.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  app.post('/api/alerts/evaluate', async (req, res) => {
    try {
      const { force, asOfDate } = req.body || {};
      // Evaluation is scoped to the caller's own rules and watchlist; it can never touch other tenants' alert state.
      const result = await watchlistAlertService.evaluateAll({ force, asOfDate, ownerUserId: requireUserId(req) });
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  app.post('/api/alerts/:id/analyze', async (req, res) => {
    try {
      const eventId = req.params.id;
      await authorizationService.authorizeAlertEvent(eventId, requireUserId(req), 'write');
      const analysis = await watchlistAlertService.generateContextForAlert(eventId);
      res.json({ eventId, contextualAnalysis: analysis });
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  app.post('/api/alerts/:id/read', async (req, res) => {
    try {
      const eventId = req.params.id;
      await authorizationService.authorizeAlertEvent(eventId, requireUserId(req), 'write');
      const event = watchlistAlertService.markAlertRead(eventId);
      if (!event) {
        res.status(404).json({ error: `Alert event ${eventId} not found` });
        return;
      }
      res.json(event);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  app.post('/api/alerts/:id/acknowledge', async (req, res) => {
    try {
      const eventId = req.params.id;
      await authorizationService.authorizeAlertEvent(eventId, requireUserId(req), 'write');
      const event = watchlistAlertService.acknowledgeAlert(eventId);
      if (!event) {
        res.status(404).json({ error: `Alert event ${eventId} not found` });
        return;
      }
      res.json(event);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // ==========================================
  // QUANTITATIVE STRATEGY ENGINE API ROUTES (Phase 11)
  // ==========================================

  // List all available strategies
  app.get('/api/strategies', (_req, res) => {
    try {
      const strategies = quantStrategyEngine.getBuiltinStrategies();
      res.json({
        strategies,
        count: strategies.length,
        isAnalyticalOnly: true,
        executionProhibited: true
      });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Get details for a specific strategy (built-in: any authenticated user; custom: owner only)
  app.get('/api/strategies/:id', async (req, res) => {
    try {
      const strategyId = req.params.id;
      await authorizationService.authorizeStrategy(strategyId, requireUserId(req), 'read');
      const strategy = quantStrategyEngine.getStrategy(strategyId);
      if (!strategy) {
        res.status(404).json({ error: `Strategy '${strategyId}' not found` });
        return;
      }
      res.json(strategy);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // Evaluate a quantitative strategy for a security
  app.post('/api/strategies/evaluate', async (req, res) => {
    try {
      const { strategyId, symbol, market, exchange, currency, parameters, asOfDate, portfolioContext } = req.body || {};
      if (strategyId) {
        // A custom strategy owned by someone else (or unowned legacy) must not be evaluable.
        await authorizationService.authorizeStrategy(strategyId, requireUserId(req), 'read');
      }
      const result = await quantStrategyEngine.evaluateStrategy({
        strategyId,
        symbol,
        market,
        exchange,
        currency,
        parameters,
        asOfDate,
        portfolioContext
      });
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // Validate a quantitative strategy definition
  app.post('/api/strategies/validate', (req, res) => {
    try {
      const strategy = req.body;
      const validation = quantStrategyEngine.validateStrategy(strategy);
      res.json(validation);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Register a custom quantitative strategy (owner stamped from the principal; cannot shadow built-ins or others' strategies)
  app.post('/api/strategies/custom', async (req, res) => {
    try {
      const userId = requireUserId(req);
      const { isBuiltIn: _b, visibility: _v, tenantId: _t, ...body } = req.body || {};
      const strategy = {
        ...body,
        isBuiltIn: false,
        ownerUserId: userId,
        userId,
        visibility: 'PRIVATE' as const
      };
      if (strategy.strategyId && quantStrategyEngine.getStrategy(strategy.strategyId)) {
        // Re-registering is allowed only for the owner of an existing custom strategy.
        await authorizationService.authorizeStrategy(strategy.strategyId, userId, 'write');
      }
      const result = quantStrategyEngine.registerCustomStrategy(strategy);
      if (!result.valid) {
        res.status(400).json({ error: 'Validation failed', errors: result.errors });
        return;
      }
      res.json({ message: 'Strategy registered successfully', strategyId: strategy.strategyId });
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // ==========================================
  // PHASE 12A - BACKTESTING ENGINE API ROUTES
  // ==========================================

  // Execute a deterministic backtest (owner stamped from the principal; identity fields are never client-controlled)
  app.post('/api/backtests/run', async (req, res) => {
    try {
      const userId = requireUserId(req);
      const raw = req.body?.config || req.body || {};
      const { ownerUserId: _o, userId: _u, tenantId: _t, visibility: _v, backtestId: _b, id: _id, ...clean } = raw;
      if (clean.strategyId) {
        await authorizationService.authorizeStrategy(clean.strategyId, userId, 'read');
      }
      const config = { ...clean, ownerUserId: userId, userId, visibility: 'PRIVATE' };
      const result = await backtestService.runBacktest(config);
      res.json({
        success: result.status === 'COMPLETED',
        result,
        ...result
      });
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ success: false, error: errMsg });
      }
    }
  });

  // Validate a backtest configuration
  app.post('/api/backtests/validate', async (req, res) => {
    try {
      const config = req.body;
      const validation = await backtestService.validateConfig(config);
      res.json(validation);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Retrieve a backtest result by ID (owner only)
  app.get('/api/backtests/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await authorizationService.authorizeBacktest(id, requireUserId(req), 'read');
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // Retrieve the caller's backtest results
  app.get('/api/backtests', (req, res) => {
    try {
      const backtests = backtestService.getAllBacktestsForOwner(requireUserId(req));
      res.json({ backtests, count: backtests.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Retrieve comprehensive backtest report by ID (owner only)
  app.get('/api/backtests/:id/report', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await authorizationService.authorizeBacktest(id, requireUserId(req), 'read');
      res.json(result.report || { error: 'Report not generated for backtest' });
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) {
        res.status(error.statusCode).json({ error: error.message, code: error.code });
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(statusForError(error, 500)).json({ error: errMsg });
      }
    }
  });

  // ==========================================
  // PHASE 15 - INVESTMENT DECISION INTELLIGENCE
  // ==========================================

  // Evaluate or retrieve an investment decision assessment
  app.get('/api/decisions/:securityId', async (req, res) => {
    try {
      const { securityId } = req.params;
      const asOfDate = req.query.asOfDate as string | undefined;
      const assessment = await decisionIntelligenceService.evaluateDecision({
        securityId,
        asOfDate,
        forceRefresh: req.query.refresh === 'true',
        ownerUserId: requireUserId(req)
      });
      res.json(assessment);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // POST evaluate investment decision with custom parameters or configuration
  app.post('/api/decisions/evaluate', async (req, res) => {
    try {
      const request = req.body;
      if (!request || !request.securityId) {
        res.status(400).json({ error: 'securityId is required in request body.' });
        return;
      }
      // Ownership comes from the principal; any owner/tenant fields in the body are ignored.
      const assessment = await decisionIntelligenceService.evaluateDecision({
        securityId: request.securityId,
        asOfDate: request.asOfDate,
        configuration: request.configuration,
        forceRefresh: request.forceRefresh,
        ownerUserId: requireUserId(req)
      });
      res.json(assessment);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Point-in-time specific decision retrieval
  app.get('/api/decisions/:securityId/as-of/:date', async (req, res) => {
    try {
      const { securityId, date } = req.params;
      const assessment = await decisionIntelligenceService.evaluateDecision({
        securityId,
        asOfDate: date,
        forceRefresh: req.query.refresh === 'true',
        ownerUserId: requireUserId(req)
      });
      res.json(assessment);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Compare two securities' investment decision assessments
  app.post('/api/decisions/compare', async (req, res) => {
    try {
      const request = req.body;
      if (!request || !request.securityIdA || !request.securityIdB) {
        res.status(400).json({ error: 'Both securityIdA and securityIdB are required in request body.' });
        return;
      }
      const comparison = await decisionIntelligenceService.compareDecisions({ ...request, ownerUserId: requireUserId(req) });
      res.json(comparison);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 23 — DECISION TIMELINE, DELTA & MULTI-PEER ROUTES
  // ==========================================

  // Decision Timeline Milestones
  const handleTimeline = async (req: express.Request, res: express.Response) => {
    try {
      const { securityId } = req.params;
      if (!securityId) {
        res.status(400).json({ error: 'securityId is required' });
        return;
      }
      const timeline = await decisionDeltaEngine.getTimeline(securityId, requireUserId(req));
      res.json(timeline);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/decisions/:securityId/timeline', handleTimeline);
  app.get('/api/v1/decision/timeline/:securityId', handleTimeline);

  // Decision Delta Attribution
  const handleDelta = async (req: express.Request, res: express.Response) => {
    try {
      const { securityId, fromDecisionId, toDecisionId } = req.query as Record<string, string>;
      const ownerId = requireUserId(req);
      if (!securityId) {
        res.status(400).json({ error: 'securityId query parameter is required.' });
        return;
      }
      if (fromDecisionId && toDecisionId) {
        const delta = await decisionDeltaEngine.getDeltaBetweenDecisions(securityId, fromDecisionId, toDecisionId, ownerId);
        res.json(delta);
        return;
      }
      if (toDecisionId) {
        const delta = await decisionDeltaEngine.getAdjacentDelta(securityId, toDecisionId, ownerId);
        res.json(delta);
        return;
      }
      res.status(400).json({ error: 'toDecisionId query parameter (and optionally fromDecisionId) is required.' });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/decisions/delta', handleDelta);
  app.get('/api/v1/decision/delta', handleDelta);

  // Multi-Company Peer Benchmark Grid
  const handleComparePeers = async (req: express.Request, res: express.Response) => {
    try {
      const request = req.body;
      if (!request || !Array.isArray(request.securityIds)) {
        res.status(400).json({ error: 'securityIds array is required in request body.' });
        return;
      }
      const result = await decisionIntelligenceService.comparePeers({ ...request, ownerUserId: requireUserId(req) });
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/decisions/compare-peers', handleComparePeers);
  app.post('/api/v1/decision/compare-peers', handleComparePeers);

  // ==========================================
  // PHASE 24 — INVESTMENT EVENT INTELLIGENCE ROUTES
  // ==========================================

  // Event Timeline for a Security (supports ?asOfDate=YYYY-MM-DD for PIT zero lookahead)
  const handleEventTimeline = async (req: express.Request, res: express.Response) => {
    try {
      const { securityId } = req.params;
      const asOfDate = req.query.asOfDate as string | undefined;
      if (!securityId) {
        res.status(400).json({ error: 'securityId is required' });
        return;
      }
      const timeline = await investmentEventEngine.getTimeline(securityId, asOfDate);
      res.json(timeline);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/events/:securityId/timeline', handleEventTimeline);
  app.get('/api/v1/events/timeline/:securityId', handleEventTimeline);

  // Event Causal Impact (What Happened, What Changed, Thesis Impact, Decision Shift, Portfolio Exposure)
  const handleEventImpact = async (req: express.Request, res: express.Response) => {
    try {
      const { eventId } = req.params;
      const asOfDate = req.query.asOfDate as string | undefined;
      if (!eventId) {
        res.status(400).json({ error: 'eventId is required' });
        return;
      }
      const impact = await investmentEventEngine.getEventImpact(eventId, asOfDate);
      res.json(impact);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(404).json({ error: errMsg });
    }
  };
  app.get('/api/events/:eventId/impact', handleEventImpact);
  app.get('/api/v1/events/impact/:eventId', handleEventImpact);

  // Record an Event (Immutable ingestion + auto-alert dispatch for high significance)
  const handleRecordEvent = async (req: express.Request, res: express.Response) => {
    try {
      const eventData = req.body;
      if (!eventData || !eventData.eventId || !eventData.securityId || !eventData.eventType) {
        res.status(400).json({ error: 'eventId, securityId, and eventType are required.' });
        return;
      }
      // Events are shared reference data. Writing to the shared pool is an operator action (ADMIN_USER_IDS).
      if (!isAdminUser(req.user?.userId)) {
        res.status(403).json({ error: 'Forbidden', code: 'ADMIN_REQUIRED', message: 'Recording shared investment events requires an administrator.' });
        return;
      }
      const saved = await investmentEventEngine.recordEvent(eventData);
      res.status(201).json(saved);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/events/record', handleRecordEvent);
  app.post('/api/v1/events/record', handleRecordEvent);

  // Get All Events / Filter by Security
  app.get('/api/events', async (req: express.Request, res: express.Response) => {
    try {
      const { securityId, asOfDate } = req.query as Record<string, string>;
      if (securityId) {
        const timeline = await investmentEventEngine.getTimeline(securityId, asOfDate);
        res.json(timeline.events);
        return;
      }
      // Investment events are shared reference data derived from public disclosures (read-only for any
      // authenticated user; writes are operator-only, see /api/events/record).
      const allEvents = await persistenceManager.getEventRepository().getAll();
      res.json(allEvents);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 25 — INVESTMENT MONITOR & CONTINUOUS CHANGE INTELLIGENCE ROUTES
  // ==========================================

  // List all monitors owned by user
  const handleListMonitors = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const monitors = await investmentMonitorEngine.getMonitors(userId);
      res.json(monitors);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  };
  app.get('/api/monitors', handleListMonitors);
  app.get('/api/v1/monitors', handleListMonitors);

  // Create or register a new monitor
  const handleCreateMonitor = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { securityId, reviewCadence } = req.body || {};
      if (!securityId) {
        res.status(400).json({ error: 'securityId is required' });
        return;
      }
      const monitor = await investmentMonitorEngine.createMonitor(userId, securityId, { reviewCadence });
      res.status(201).json(monitor);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/monitors', handleCreateMonitor);
  app.post('/api/v1/monitors', handleCreateMonitor);

  // Get single monitor
  const handleGetMonitor = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const monitor = await investmentMonitorEngine.getMonitor(monitorId, userId);
      if (!monitor) {
        res.status(404).json({ error: `Monitor ${monitorId} not found` });
        return;
      }
      res.json(monitor);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('UNAUTHORIZED')) {
        res.status(403).json({ error: errMsg });
      } else {
        res.status(500).json({ error: errMsg });
      }
    }
  };
  app.get('/api/monitors/:monitorId', handleGetMonitor);
  app.get('/api/v1/monitors/:monitorId', handleGetMonitor);

  // Update monitor settings (cadence, status)
  const handleUpdateMonitor = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const updates = req.body || {};
      const updated = await investmentMonitorEngine.updateMonitor(monitorId, userId, updates);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.put('/api/monitors/:monitorId', handleUpdateMonitor);
  app.put('/api/v1/monitors/:monitorId', handleUpdateMonitor);

  // Delete monitor
  const handleDeleteMonitor = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const success = await investmentMonitorEngine.deleteMonitor(monitorId, userId);
      res.json({ success, monitorId });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.delete('/api/monitors/:monitorId', handleDeleteMonitor);
  app.delete('/api/v1/monitors/:monitorId', handleDeleteMonitor);

  // Detect all changes ("What Changed?") with PIT support
  const handleDetectChanges = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const asOfDate = req.query.asOfDate as string | undefined;
      const reviewDraft = await investmentMonitorEngine.detectAllChanges(monitorId, userId, asOfDate);
      res.json(reviewDraft);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/monitors/:monitorId/changes', handleDetectChanges);
  app.get('/api/v1/monitors/:monitorId/changes', handleDetectChanges);

  // Execute and commit an immutable review
  const handleExecuteReview = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const { analystNote, reviewAction } = req.body || {};
      const review = await investmentMonitorEngine.executeReview(monitorId, userId, analystNote, reviewAction);
      res.status(201).json(review);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/monitors/:monitorId/review', handleExecuteReview);
  app.post('/api/v1/monitors/:monitorId/review', handleExecuteReview);
  app.post('/api/monitors/:monitorId/reviews', handleExecuteReview);
  app.post('/api/v1/monitors/:monitorId/reviews', handleExecuteReview);

  // Compare two historical reviews point-in-time
  const handleCompareReviews = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const { baseReviewId, targetReviewId } = req.query;
      if (!baseReviewId || !targetReviewId) {
        res.status(400).json({ error: 'Both baseReviewId and targetReviewId query parameters are required.' });
        return;
      }
      const comparison = await investmentMonitorEngine.compareReviews(
        monitorId,
        String(baseReviewId),
        String(targetReviewId),
        userId
      );
      res.json(comparison);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/monitors/:monitorId/reviews/compare', handleCompareReviews);
  app.get('/api/v1/monitors/:monitorId/reviews/compare', handleCompareReviews);

  // Get historical review history for monitor
  const handleGetReviewHistory = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const history = await investmentMonitorEngine.getReviewHistory(monitorId, userId);
      res.json(history);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/monitors/:monitorId/reviews', handleGetReviewHistory);
  app.get('/api/v1/monitors/:monitorId/reviews', handleGetReviewHistory);

  // Get specific historical review
  const handleGetReview = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { reviewId } = req.params;
      const review = await investmentMonitorEngine.getReview(reviewId, userId);
      if (!review) {
        res.status(404).json({ error: `Review ${reviewId} not found` });
        return;
      }
      res.json(review);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/monitors/reviews/:reviewId', handleGetReview);
  app.get('/api/v1/monitors/reviews/:reviewId', handleGetReview);

  // Add analyst review note
  const handleAddNote = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const { content, reviewId, authorName } = req.body || {};
      if (!content || !content.trim()) {
        res.status(400).json({ error: 'Note content is required.' });
        return;
      }
      const note = await investmentMonitorEngine.addAnalystNote(
        monitorId,
        userId,
        authorName || (req as any).user?.name || 'Senior Analyst',
        content,
        reviewId
      );
      res.status(201).json(note);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/monitors/:monitorId/notes', handleAddNote);
  app.post('/api/v1/monitors/:monitorId/notes', handleAddNote);

  // Get notes for monitor
  const handleGetNotes = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId } = req.params;
      const notes = await investmentMonitorEngine.getAnalystNotes(monitorId, userId);
      res.json(notes);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/monitors/:monitorId/notes', handleGetNotes);
  app.get('/api/v1/monitors/:monitorId/notes', handleGetNotes);

  // ==========================================
  // PHASE 27 - CONTINUOUS MONITORING & ALERT ORCHESTRATION ROUTES
  // ==========================================

  // Get monitoring policies (seeds default policies if none exist)
  const handleGetPolicies = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const policies = await alertOrchestrationEngine.getPolicies(userId);
      res.json(policies);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/policies', handleGetPolicies);
  app.get('/api/v1/policies', handleGetPolicies);

  // Create or update a monitoring policy
  const handleSavePolicy = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const policyData = req.body;
      if (!policyData || !policyData.name || !policyData.policyType) {
        res.status(400).json({ error: 'Policy name and policyType are required.' });
        return;
      }
      if (policyData.policyId) {
        // Updating an existing policy id requires owning it; this also blocks overwriting another tenant's policy.
        const existing = await persistenceManager.getPolicyRepository().get(policyData.policyId);
        if (existing) await authorizationService.authorizePolicy(policyData.policyId, userId, 'write');
      }
      const policyId = policyData.policyId || `policy_${userId}_${Date.now()}`;
      const policy = {
        policyId,
        userId,
        ownerUserId: userId,
        name: policyData.name,
        policyType: policyData.policyType,
        enabled: policyData.enabled ?? true,
        scope: policyData.scope || 'ALL_MONITORS',
        monitorId: policyData.monitorId,
        securityId: policyData.securityId,
        portfolioId: policyData.portfolioId,
        rules: policyData.rules || [],
        configuration: policyData.configuration || {},
        minSeverity: policyData.minSeverity || 'HIGH',
        cooldownMinutes: policyData.cooldownMinutes ?? 60,
        createdAt: policyData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const saved = await persistenceManager.getPolicyRepository().save(policy);
      res.status(201).json(saved);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/policies', handleSavePolicy);
  app.post('/api/v1/policies', handleSavePolicy);

  // Delete a monitoring policy
  const handleDeletePolicy = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { policyId } = req.params;
      await authorizationService.authorizePolicy(policyId, userId);
      const deleted = await persistenceManager.getPolicyRepository().delete(policyId);
      res.json({ success: deleted, policyId });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = error instanceof AuthorizationError ? error.statusCode : 400;
      res.status(status).json({ error: errMsg });
    }
  };
  app.delete('/api/policies/:policyId', handleDeletePolicy);
  app.delete('/api/v1/policies/:policyId', handleDeletePolicy);

  // Run a continuous monitoring cycle
  const handleRunMonitoringCycle = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { monitorId, asOfDate } = req.body || {};
      const result = await alertOrchestrationEngine.runMonitoringCycle(userId, { monitorId, asOfDate });
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/orchestration/cycle', handleRunMonitoringCycle);
  app.post('/api/v1/orchestration/cycle', handleRunMonitoringCycle);

  // Get orchestrated alerts (with filtering)
  const handleGetAlerts = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { status, severity, monitorId, securityId, limit } = req.query as Record<string, string | undefined>;
      const alerts = await persistenceManager.getAlertOrchestrationRepository().getByUserId(userId, {
        status: status as any,
        severity: severity as any,
        monitorId,
        securityId,
        limit: limit ? parseInt(limit, 10) : undefined
      });
      res.json(alerts);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/orchestrated-alerts', handleGetAlerts);
  app.get('/api/v1/orchestrated-alerts', handleGetAlerts);

  // Get single orchestrated alert
  const handleGetSingleAlert = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { alertId } = req.params;
      const alert = await authorizationService.authorizeOrchestratedAlert(alertId, userId);
      res.json(alert);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = error instanceof AuthorizationError ? error.statusCode : 400;
      res.status(status).json({ error: errMsg });
    }
  };
  app.get('/api/orchestrated-alerts/:alertId', handleGetSingleAlert);
  app.get('/api/v1/orchestrated-alerts/:alertId', handleGetSingleAlert);

  // Acknowledge alert
  const handleAcknowledgeAlert = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { alertId } = req.params;
      const { note } = req.body || {};
      const updated = await alertOrchestrationEngine.acknowledgeAlert(alertId, userId, note);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = error instanceof AuthorizationError ? error.statusCode : 400;
      res.status(status).json({ error: errMsg });
    }
  };
  app.post('/api/orchestrated-alerts/:alertId/acknowledge', handleAcknowledgeAlert);
  app.post('/api/v1/orchestrated-alerts/:alertId/acknowledge', handleAcknowledgeAlert);

  // Open review for alert (records audit event)
  const handleOpenReviewForAlert = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { alertId } = req.params;
      const updated = await alertOrchestrationEngine.openReviewForAlert(alertId, userId);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = error instanceof AuthorizationError ? error.statusCode : 400;
      res.status(status).json({ error: errMsg });
    }
  };
  app.post('/api/orchestrated-alerts/:alertId/open-review', handleOpenReviewForAlert);
  app.post('/api/v1/orchestrated-alerts/:alertId/open-review', handleOpenReviewForAlert);

  // Dismiss alert
  const handleDismissAlert = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { alertId } = req.params;
      const { note } = req.body || {};
      const updated = await alertOrchestrationEngine.dismissAlert(alertId, userId, note);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = error instanceof AuthorizationError ? error.statusCode : 400;
      res.status(status).json({ error: errMsg });
    }
  };
  app.post('/api/orchestrated-alerts/:alertId/dismiss', handleDismissAlert);
  app.post('/api/v1/orchestrated-alerts/:alertId/dismiss', handleDismissAlert);

  // Resolve alert
  const handleResolveAlert = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { alertId } = req.params;
      const { note } = req.body || {};
      const updated = await alertOrchestrationEngine.resolveAlert(alertId, userId, note);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = error instanceof AuthorizationError ? error.statusCode : 400;
      res.status(status).json({ error: errMsg });
    }
  };
  app.post('/api/orchestrated-alerts/:alertId/resolve', handleResolveAlert);
  app.post('/api/v1/orchestrated-alerts/:alertId/resolve', handleResolveAlert);

  // ==========================================
  // PHASE 28 - INVESTMENT DISCOVERY & RESEARCH PRIORITIZATION ROUTES
  // ==========================================

  // Get research priorities / attention queue
  const handleGetPriorities = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const {
        universe,
        market,
        priority,
        minPriority,
        asOfDate,
        search,
        sortBy,
        sortOrder,
        limit
      } = req.query as Record<string, string | undefined>;

      const snapshot = await researchPrioritizationEngine.generatePrioritization(userId, {
        universeType: universe as any,
        market: market as any,
        priority: priority as any,
        minPriority: minPriority as any,
        asOfDate,
        search,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
        limit: limit ? parseInt(limit, 10) : undefined
      });

      res.json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/discovery/priorities', handleGetPriorities);
  app.get('/api/v1/discovery/priorities', handleGetPriorities);
  app.get('/api/discovery', handleGetPriorities);

  // Get single security research priority
  const handleGetSecurityPriority = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { securityId } = req.params;
      const { asOfDate } = req.query as Record<string, string | undefined>;

      const item = await researchPrioritizationEngine.getSecurityPriority(userId, securityId, asOfDate);
      if (!item) {
        res.status(404).json({ error: 'Security not found in discovery universe' });
        return;
      }
      res.json(item);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/discovery/priorities/:securityId', handleGetSecurityPriority);
  app.get('/api/v1/discovery/priorities/:securityId', handleGetSecurityPriority);
  app.get('/api/discovery/:securityId', handleGetSecurityPriority);

  // Refresh research priority discovery snapshot
  const handleRefreshPriorities = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { universe, asOfDate, market } = req.body || {};

      const snapshot = await researchPrioritizationEngine.generatePrioritization(userId, {
        universeType: universe,
        market,
        asOfDate
      });

      res.status(201).json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/discovery/refresh', handleRefreshPriorities);
  app.post('/api/v1/discovery/refresh', handleRefreshPriorities);

  // Generate analytical briefing (Gemini or deterministic synthesis)
  const handleGenerateBriefing = async (req: express.Request, res: express.Response) => {
    try {
      const item = req.body;
      if (!item || !item.securityId) {
        res.status(400).json({ error: 'Research priority item is required' });
        return;
      }
      const briefing = await researchPrioritizationEngine.generateAnalyticalBriefing(item);
      res.json({ briefing });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.post('/api/discovery/briefing', handleGenerateBriefing);

  // List historical discovery snapshots
  const handleGetDiscoverySnapshots = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshots = await persistenceManager.getResearchPriorityRepository().getSnapshotsByUserId(userId);
      res.json(snapshots);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };
  app.get('/api/discovery/snapshots', handleGetDiscoverySnapshots);

  // Get specific historical discovery snapshot
  const handleGetSingleDiscoverySnapshot = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { snapshotId } = req.params;
      const snapshot = await authorizationService.authorizeResearchPrioritySnapshot(snapshotId, userId);
      res.json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const status = error instanceof AuthorizationError ? error.statusCode : 400;
      res.status(status).json({ error: errMsg });
    }
  };
  app.get('/api/discovery/snapshots/:snapshotId', handleGetSingleDiscoverySnapshot);

  // ==========================================
  // PHASE 29 - INVESTMENT RESEARCH COMMAND CENTER
  // ==========================================

  const handleGetCommandCenter = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { scope, asOfDate, market, limit } = req.query as Record<string, string | undefined>;

      const data = await researchCommandCenterService.getCommandCenterData(userId, {
        scope: scope as any,
        asOfDate,
        market: market as any,
        limit: limit ? parseInt(limit, 10) : undefined
      });

      res.json(data);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  const handlePostCommandCenter = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { scope, asOfDate, market, limit } = req.body || {};

      const data = await researchCommandCenterService.getCommandCenterData(userId, {
        scope,
        asOfDate,
        market,
        limit
      });

      res.json(data);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.get('/api/command-center', handleGetCommandCenter);
  app.get('/api/v1/command-center', handleGetCommandCenter);
  app.post('/api/command-center', handlePostCommandCenter);
  app.post('/api/v1/command-center', handlePostCommandCenter);

  // ==========================================
  // PHASE 30 - CROSS-INVESTMENT INTELLIGENCE & EXPOSURE RELATIONSHIP ANALYSIS
  // ==========================================

  const handleGetCrossInvestment = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { scope, asOfDate, market, sector, relationshipType, securityId, limit } = req.query as Record<string, string | undefined>;

      const data = await crossInvestmentService.getCrossInvestmentData(userId, {
        scope: scope as any,
        asOfDate,
        market: market as any,
        sector,
        relationshipType: relationshipType as any,
        securityId,
        limit: limit ? parseInt(limit, 10) : undefined
      });

      res.json(data);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  const handlePostCrossInvestment = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { scope, asOfDate, market, sector, relationshipType, securityId, limit } = req.body || {};

      const data = await crossInvestmentService.getCrossInvestmentData(userId, {
        scope,
        asOfDate,
        market,
        sector,
        relationshipType,
        securityId,
        limit
      });

      res.json(data);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.get('/api/cross-investment', handleGetCrossInvestment);
  app.get('/api/v1/cross-investment', handleGetCrossInvestment);
  app.post('/api/cross-investment', handlePostCrossInvestment);
  app.post('/api/v1/cross-investment', handlePostCrossInvestment);

  // Single Security Relationships Network
  app.get('/api/cross-investment/relationships/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.params.securityId;
      const { asOfDate, relationshipType } = req.query as Record<string, string | undefined>;

      const data = await crossInvestmentService.getCrossInvestmentData(userId, {
        securityId,
        asOfDate,
        relationshipType: relationshipType as any
      });

      res.json(data);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Clusters endpoint
  app.get('/api/cross-investment/clusters', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { asOfDate, market } = req.query as Record<string, string | undefined>;

      const data = await crossInvestmentService.getCrossInvestmentData(userId, {
        asOfDate,
        market: market as any
      });

      res.json(data.clusters);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Common Drivers endpoint
  app.get('/api/cross-investment/drivers', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { asOfDate, market } = req.query as Record<string, string | undefined>;

      const data = await crossInvestmentService.getCrossInvestmentData(userId, {
        asOfDate,
        market: market as any
      });

      res.json(data.commonDrivers);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Snapshots Persistence
  app.post('/api/cross-investment/snapshots', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { title, data } = req.body || {};
      if (!data) {
        return res.status(400).json({ error: 'data is required to create a snapshot' });
      }

      const snapshot = await crossInvestmentService.saveSnapshot(userId, data, title);
      res.status(201).json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  app.get('/api/cross-investment/snapshots', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshots = await crossInvestmentService.getSnapshotsByUserId(userId);
      res.json(snapshots);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  app.get('/api/cross-investment/snapshots/:snapshotId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshot = await crossInvestmentService.getSnapshot(req.params.snapshotId, userId);
      if (!snapshot) {
        return res.status(404).json({ error: `Snapshot not found: ${req.params.snapshotId}` });
      }
      res.json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('Forbidden')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 31 - PORTFOLIO SCENARIO & STRESS INTELLIGENCE ROUTES
  // ==========================================

  const handleEvaluateScenario = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const request = req.body;
      if (!request || !request.scenarioType) {
        return res.status(400).json({ error: 'scenarioType is required in evaluation request' });
      }
      const evaluation = await portfolioScenarioService.evaluateScenario(userId, request);
      res.json(evaluation);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.post('/api/scenarios/evaluate', handleEvaluateScenario);
  app.post('/api/v1/scenarios/evaluate', handleEvaluateScenario);

  const handleGetScenarioPresets = async (_req: express.Request, res: express.Response) => {
    try {
      const presets = portfolioScenarioService.getPresets();
      res.json(presets);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.get('/api/scenarios/presets', handleGetScenarioPresets);
  app.get('/api/v1/scenarios/presets', handleGetScenarioPresets);

  const handleCompareScenarios = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { scenarios } = req.body || {};
      if (!Array.isArray(scenarios) || scenarios.length === 0) {
        return res.status(400).json({ error: 'scenarios array is required to compare' });
      }
      const comparison = await portfolioScenarioService.compareScenarios(userId, scenarios);
      res.json(comparison);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.post('/api/scenarios/compare', handleCompareScenarios);
  app.post('/api/v1/scenarios/compare', handleCompareScenarios);

  // Scenario Snapshots
  app.post('/api/scenarios/snapshots', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshot = req.body;
      if (!snapshot || !snapshot.evaluation) {
        return res.status(400).json({ error: 'evaluation is required in snapshot body' });
      }
      // The snapshot owner is always the authenticated principal; a client-supplied userId/ownerUserId is ignored.
      const saved = await portfolioScenarioService.saveSnapshot({
        ...snapshot,
        userId,
        ownerUserId: userId
      });
      res.json(saved);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  app.get('/api/scenarios/snapshots', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshots = await portfolioScenarioService.getSnapshotsByUserId(userId);
      res.json(snapshots);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  app.get('/api/scenarios/snapshots/:snapshotId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshot = await portfolioScenarioService.getSnapshot(req.params.snapshotId, userId);
      if (!snapshot) {
        return res.status(404).json({ error: `Snapshot not found: ${req.params.snapshotId}` });
      }
      res.json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Forbidden') || errMsg.includes('not authorized')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 32 — COUNTERFACTUAL DECISION INTELLIGENCE
  // ==========================================
  const handleEvaluateCounterfactual = async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const result = await counterfactualDecisionService.evaluateCounterfactual(userId, req.body);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.post('/api/counterfactuals/evaluate', handleEvaluateCounterfactual);
  app.post('/api/v1/counterfactuals/evaluate', handleEvaluateCounterfactual);

  const handleGetDecisionSensitivity = async (req: express.Request, res: express.Response) => {
    try {
      const securityId = req.params.id;
      const asOfDate = req.query.asOfDate as string | undefined;
      const sensitivity = await counterfactualDecisionService.getSensitivity(securityId, asOfDate, requireUserId(req));
      res.json(sensitivity);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.get('/api/decisions/:id/sensitivity', handleGetDecisionSensitivity);
  app.get('/api/v1/decisions/:id/sensitivity', handleGetDecisionSensitivity);

  const handleGetDecisionTraceability = async (req: express.Request, res: express.Response) => {
    try {
      const decisionId = req.params.id;
      const traceability = await counterfactualDecisionService.getTraceability(decisionId, requireUserId(req));
      res.json(traceability);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.get('/api/decisions/:id/traceability', handleGetDecisionTraceability);
  app.get('/api/v1/decisions/:id/traceability', handleGetDecisionTraceability);

  const handleCompareCounterfactuals = async (req: express.Request, res: express.Response) => {
    try {
      const { securityId, evaluations } = req.body || {};
      if (!securityId || !Array.isArray(evaluations)) {
        return res.status(400).json({ error: 'securityId and evaluations array are required' });
      }
      const comparison = await counterfactualDecisionService.compareCounterfactuals(securityId, evaluations);
      res.json(comparison);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  };

  app.post('/api/counterfactuals/compare', handleCompareCounterfactuals);
  app.post('/api/v1/counterfactuals/compare', handleCompareCounterfactuals);

  // Counterfactual Snapshots
  app.post('/api/counterfactuals/snapshots', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshot = req.body;
      if (!snapshot || !snapshot.evaluation) {
        return res.status(400).json({ error: 'evaluation is required in snapshot body' });
      }
      // The snapshot owner is always the authenticated principal; a client-supplied userId/ownerUserId is ignored.
      const saved = await counterfactualDecisionService.saveSnapshot({
        ...snapshot,
        userId,
        ownerUserId: userId
      });
      res.json(saved);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  app.get('/api/counterfactuals/snapshots', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshots = await counterfactualDecisionService.getSnapshotsByUserId(userId);
      res.json(snapshots);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  app.get('/api/counterfactuals/snapshots/:snapshotId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const snapshot = await counterfactualDecisionService.getSnapshot(req.params.snapshotId, userId);
      if (!snapshot) {
        return res.status(404).json({ error: `Snapshot not found: ${req.params.snapshotId}` });
      }
      res.json(snapshot);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Forbidden') || errMsg.includes('not authorized')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 33: INSTITUTIONAL RESEARCH MEMORY & KNOWLEDGE CONTINUITY ROUTES
  // ==========================================

  // Create Research Memory
  app.post('/api/research-memory', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const created = await researchMemoryService.createMemory(userId, req.body);
      res.json(created);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Research Memory Timeline (Strict Point-in-Time)
  app.get('/api/research-memory/timeline/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.params.securityId;
      const asOfDate = req.query.asOfDate as string | undefined;
      const memoryType = req.query.memoryType as any;
      const status = req.query.status as any;
      const timeline = await researchMemoryService.getTimeline(userId, securityId, { asOfDate, memoryType, status });
      res.json(timeline);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Current Research State (Knowledge continuity synthesis)
  app.get('/api/research-memory/current/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.params.securityId;
      const asOfDate = req.query.asOfDate as string | undefined;
      const state = await researchMemoryService.getCurrentResearchState(userId, securityId, asOfDate);
      res.json(state);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Knowledge Evolution Graph
  app.get('/api/research-memory/evolution/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.params.securityId;
      const asOfDate = req.query.asOfDate as string | undefined;
      const graph = await researchMemoryService.getEvolutionGraph(userId, securityId, asOfDate);
      res.json(graph);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Search Research Memories
  app.get('/api/research-memory/search', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const results = await researchMemoryService.searchMemories(userId, req.query as any);
      res.json(results);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Open Research Questions: List for security
  app.get('/api/research-memory/questions/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.params.securityId;
      const asOfDate = req.query.asOfDate as string | undefined;
      const repo = persistenceManager.getResearchQuestionRepository();
      const questions = await repo.getAll({ securityId, userId, asOfDate });
      res.json(questions);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Create Research Question
  app.post('/api/research-memory/questions', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const question = await researchMemoryService.createQuestion(userId, req.body);
      res.json(question);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Update Research Question Status
  app.patch('/api/research-memory/questions/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { status, resolution } = req.body;
      const updated = await researchMemoryService.updateQuestionStatus(userId, req.params.id, status, resolution);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Supersede Research Memory
  app.post('/api/research-memory/:id/supersede', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const result = await researchMemoryService.supersedeMemory(userId, req.params.id, req.body);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Single Research Memory by ID
  app.get('/api/research-memory/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const memory = await researchMemoryService.getMemory(userId, req.params.id);
      res.json(memory);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        return res.status(404).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 34: RESEARCH PLANNING & INVESTIGATION WORKFLOW
  // ==========================================

  // List Research Questions
  app.get('/api/research/questions', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.query.securityId as string | undefined;
      const status = req.query.status as any;
      const category = req.query.category as any;
      const asOfDate = req.query.asOfDate as string | undefined;
      const planId = req.query.planId as string | undefined;
      const gapId = req.query.gapId as string | undefined;

      const questions = await researchQuestionService.getQuestions(userId, {
        securityId,
        status,
        category,
        asOfDate,
        planId,
        gapId
      });
      res.json(questions);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Create Research Question
  app.post('/api/research/questions', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const question = await researchQuestionService.createQuestion(userId, req.body);
      res.status(201).json(question);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Single Question by ID
  app.get('/api/research/questions/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const q = await researchQuestionService.getQuestion(userId, req.params.id);
      res.json(q);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        return res.status(404).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Update Question Status / Resolution
  app.patch('/api/research/questions/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { status, resolution, reason, attachedEvidenceIds, asOfDate } = req.body;
      const updated = await researchQuestionService.updateQuestionStatus(userId, req.params.id, status, {
        resolution,
        reason,
        attachedEvidenceIds,
        asOfDate
      });
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Deterministically Evaluate Question Completion
  app.post('/api/research/questions/:id/evaluate', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { availableEvidenceIds, resolutionNarrative } = req.body;
      const evaluated = await researchQuestionService.evaluateQuestionCompletion(
        userId,
        req.params.id,
        availableEvidenceIds || [],
        resolutionNarrative
      );
      res.json(evaluated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Generate Questions for Security
  app.post('/api/research/questions/generate/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = (req.query.asOfDate as string | undefined) || req.body.asOfDate;
      const questions = await researchQuestionService.generateQuestionsForSecurity(userId, req.params.securityId, asOfDate);
      res.json(questions);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // List Research Gaps
  app.get('/api/research/gaps', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.query.securityId as string | undefined;
      const status = req.query.status as any;
      const gapType = req.query.gapType as any;
      const asOfDate = req.query.asOfDate as string | undefined;

      const gaps = await researchGapDetectionService.getGaps(userId, {
        securityId,
        status,
        gapType,
        asOfDate
      });
      res.json(gaps);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Create Research Gap
  app.post('/api/research/gaps', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const gap = await researchGapDetectionService.createGap(userId, req.body);
      res.status(201).json(gap);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Single Gap
  app.get('/api/research/gaps/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const gap = await researchGapDetectionService.getGap(userId, req.params.id);
      res.json(gap);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        return res.status(404).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Update Gap Status
  app.patch('/api/research/gaps/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { status, reason, asOfDate } = req.body;
      const updated = await researchGapDetectionService.updateGapStatus(userId, req.params.id, status, reason, asOfDate);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Detect Gaps for Security
  app.post('/api/research/gaps/detect/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = (req.query.asOfDate as string | undefined) || req.body.asOfDate;
      const gaps = await researchGapDetectionService.detectGapsForSecurity(userId, req.params.securityId, asOfDate);
      res.json(gaps);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // List Investigation Plans
  app.get('/api/research/plans', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.query.securityId as string | undefined;
      const status = req.query.status as any;
      const asOfDate = req.query.asOfDate as string | undefined;

      const plans = await investigationPlanService.getPlans(userId, {
        securityId,
        status,
        asOfDate
      });
      res.json(plans);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Create Investigation Plan
  app.post('/api/research/plans', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const plan = await investigationPlanService.createPlan(userId, req.body);
      res.status(201).json(plan);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Single Investigation Plan
  app.get('/api/research/plans/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const plan = await investigationPlanService.getPlan(userId, req.params.id);
      res.json(plan);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        return res.status(404).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Update Plan Status
  app.patch('/api/research/plans/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { status, reason, asOfDate } = req.body;
      const updated = await investigationPlanService.updatePlanStatus(userId, req.params.id, status, reason, asOfDate);
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Add Task to Plan
  app.post('/api/research/plans/:id/tasks', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const task = await investigationPlanService.addTask(userId, {
        planId: req.params.id,
        ...req.body
      });
      res.status(201).json(task);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Update Task Status
  app.patch('/api/research/plans/:planId/tasks/:taskId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { status, resolutionNotes, attachedEvidenceIds, blockedReason, reason, asOfDate } = req.body;
      const updated = await investigationPlanService.updateTaskStatus(
        userId,
        req.params.planId,
        req.params.taskId,
        status,
        {
          resolutionNotes,
          attachedEvidenceIds,
          blockedReason,
          reason,
          asOfDate
        }
      );
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Add Evidence Requirement
  app.post('/api/research/evidence-requirements', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const reqItem = await investigationPlanService.addEvidenceRequirement(userId, req.body);
      res.status(201).json(reqItem);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Fulfill Evidence Requirement
  app.post('/api/research/plans/:planId/fulfill-requirement', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { requirementId, evidenceIds, reason } = req.body;
      const updated = await investigationPlanService.fulfillEvidenceRequirement(
        userId,
        req.params.planId,
        requirementId,
        evidenceIds || [],
        reason
      );
      res.json(updated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Complete Investigation and Record Phase 33 Memory
  app.post('/api/research/investigations/:id/complete', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const result = await investigationPlanService.completeInvestigationAndRecordMemory(
        userId,
        req.params.id,
        req.body
      );
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Investigation Overview
  app.get('/api/research/investigations/overview/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = req.query.asOfDate as string | undefined;
      const overview = await investigationPlanService.generateInvestigationOverview(
        userId,
        req.params.securityId,
        asOfDate
      );
      res.json(overview);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Investigation Audit Trail
  app.get('/api/research/investigations/audit/:targetId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = req.query.asOfDate as string | undefined;
      const audit = await investigationPlanService.getAuditHistory(userId, req.params.targetId, asOfDate);
      res.json(audit);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 35 - INSTITUTIONAL EVIDENCE COLLECTION & RESEARCH EXECUTION LEDGER
  // ==========================================

  // List Evidence Collection Records
  app.get('/api/research/evidence', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const securityId = req.query.securityId as string | undefined;
      const planId = req.query.planId as string | undefined;
      const taskId = req.query.taskId as string | undefined;
      const questionId = req.query.questionId as string | undefined;
      const gapId = req.query.gapId as string | undefined;
      const status = req.query.status as any;
      const sourceType = req.query.sourceType as any;
      const epistemicStatus = req.query.epistemicStatus as any;
      const asOfDate = req.query.asOfDate as string | undefined;

      const list = await evidenceCollectionService.getEvidenceList(userId, {
        securityId,
        planId,
        taskId,
        questionId,
        gapId,
        status,
        sourceType,
        epistemicStatus,
        asOfDate
      });
      res.json(list);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Collect / Register Evidence
  app.post('/api/research/evidence', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const record = await evidenceCollectionService.collectEvidence(userId, req.body);
      res.status(201).json(record);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Evidence Overview for Security
  app.get('/api/research/evidence/overview/:securityId', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = req.query.asOfDate as string | undefined;
      const overview = await evidenceCollectionService.generateEvidenceOverview(
        userId,
        req.params.securityId,
        asOfDate
      );
      res.json(overview);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Get Single Evidence Record
  app.get('/api/research/evidence/:id', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const record = await evidenceCollectionService.getEvidence(userId, req.params.id);
      res.json(record);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      if (errMsg.includes('not found') || errMsg.includes('404')) {
        return res.status(404).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Validate Evidence
  app.post('/api/research/evidence/:id/validate', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const validated = await evidenceCollectionService.validateEvidence(userId, req.params.id, req.body);
      res.json(validated);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Reject Evidence
  app.post('/api/research/evidence/:id/reject', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const rejected = await evidenceCollectionService.rejectEvidence(userId, req.params.id, req.body);
      res.json(rejected);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Supersede Evidence
  app.post('/api/research/evidence/:id/supersede', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const result = await evidenceCollectionService.supersedeEvidence(userId, req.params.id, req.body);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Evidence Audit Trail
  app.get('/api/research/evidence/:id/audit', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = req.query.asOfDate as string | undefined;
      const audit = await evidenceCollectionService.getEvidenceAuditTrail(userId, req.params.id, asOfDate);
      res.json(audit);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Evidence For Question
  app.get('/api/research/questions/:id/evidence', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = req.query.asOfDate as string | undefined;
      const list = await evidenceCollectionService.getEvidenceList(userId, {
        questionId: req.params.id,
        asOfDate
      });
      res.json(list);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Evidence For Task
  app.get('/api/research/tasks/:id/evidence', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = req.query.asOfDate as string | undefined;
      const planId = req.query.planId as string | undefined;
      const list = await evidenceCollectionService.getEvidenceList(userId, {
        taskId: req.params.id,
        planId,
        asOfDate
      });
      res.json(list);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Evidence For Gap
  app.get('/api/research/gaps/:id/evidence', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const asOfDate = req.query.asOfDate as string | undefined;
      const list = await evidenceCollectionService.getEvidenceList(userId, {
        gapId: req.params.id,
        asOfDate
      });
      res.json(list);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // Reconcile Evidence For Question
  app.post('/api/research/evidence/reconcile', async (req: express.Request, res: express.Response) => {
    try {
      const userId = requireUserId(req);
      const { questionId, asOfDate } = req.body;
      if (!questionId) {
        return res.status(400).json({ error: 'questionId is required for reconciliation.' });
      }
      const reconciliation = await evidenceCollectionService.reconcileEvidenceForQuestion(
        userId,
        questionId,
        asOfDate
      );
      res.json(reconciliation);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('AuthorizationError') || errMsg.includes('Access denied') || errMsg.includes('403')) {
        return res.status(403).json({ error: errMsg });
      }
      res.status(statusForError(error, 400)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 16 - PERSISTENCE & HISTORICAL AUDIT ROUTES
  // ==========================================

  // Persistence status and health
  app.get('/api/persistence/status', async (_req, res) => {
    try {
      const status = await persistenceManager.getStatus();
      res.json(status);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Historical decisions for a security (caller's own assessments only)
  app.get('/api/persistence/decisions/:securityId', async (req, res) => {
    try {
      const { securityId } = req.params;
      const history = await decisionIntelligenceService.getHistoricalDecisionsForOwner(securityId, requireUserId(req));
      res.json({ securityId, history, count: history.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Historical research snapshots for a security (caller's own snapshots only)
  app.get('/api/persistence/snapshots/:securityId', async (req, res) => {
    try {
      const { securityId } = req.params;
      const resolved = resolveSecurity(securityId);
      const targetId = resolved ? resolved.id : securityId;
      const snapshots = await persistenceManager.getSnapshotRepository().getBySecurityIdForOwner(targetId, requireUserId(req));
      res.json({ securityId: targetId, snapshots, count: snapshots.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Persisted research documents (caller's own documents only)
  app.get('/api/persistence/documents', async (req, res) => {
    try {
      const docs = await persistenceManager.getDocumentRepository().getAllForOwner(requireUserId(req));
      res.json({ documents: docs, count: docs.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Persisted evidence query (caller's private evidence + explicitly SHARED provider evidence)
  app.get('/api/persistence/evidence', async (req, res) => {
    try {
      const securityId = req.query.securityId as string | undefined;
      const asOfDate = req.query.asOfDate as string | undefined;
      const items = await persistenceManager.getEvidenceRepository().queryEvidenceForOwner(requireUserId(req), { securityId, asOfDate });
      res.json({ evidence: items, count: items.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Persisted backtests (caller's own results only)
  app.get('/api/persistence/backtests', async (req, res) => {
    try {
      const backtests = await persistenceManager.getBacktestRepository().getAllForOwner(requireUserId(req));
      res.json({ backtests, count: backtests.length });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 36: REAL-DATA INTEGRATION & ANALYST PILOT READINESS
  // Phase 38.2A: the pilot tenant is ALWAYS the authenticated principal. A client-supplied tenantId is never
  // used as an identity; if one is supplied and differs from the principal the request is rejected (403).
  // ==========================================

  /** Resolves the pilot tenant from the principal; returns null (and responds 403) on a forged tenantId. */
  const resolvePilotTenant = (req: express.Request, res: express.Response, supplied: unknown): string | null => {
    const principal = requireUserId(req);
    if (supplied !== undefined && supplied !== null && supplied !== '' && supplied !== principal) {
      res.status(403).json({
        error: 'Forbidden',
        code: 'TENANT_MISMATCH',
        message: 'tenantId is derived from the authenticated session and cannot be supplied by the client.'
      });
      return null;
    }
    return principal;
  };

  // Master Pilot Readiness Scorecard
  app.get('/api/pilot/readiness', async (req, res) => {
    try {
      const tenantId = resolvePilotTenant(req, res, req.query.tenantId);
      if (!tenantId) return;
      const scorecard = await pilotReadinessService.generatePilotReadinessScorecard(tenantId);
      res.json(scorecard);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Pilot Universe Specifications & Onboarding
  app.get('/api/pilot/universe', (_req, res) => {
    try {
      const universe = pilotReadinessService.getPilotUniverse();
      res.json(universe);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Live Provider Health & Authenticated Connectivity Audit
  app.get('/api/pilot/providers/health', async (_req, res) => {
    try {
      const audits = await pilotReadinessService.auditProvidersHealth();
      res.json({ audits, checkedAt: new Date().toISOString() });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // Market Data Sanity Validation for Pilot Security
  app.get('/api/pilot/market-sanity/:ticker', async (req, res) => {
    try {
      const { ticker } = req.params;
      const result = await pilotReadinessService.validateMarketDataSanity(ticker);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: errMsg });
    }
  });

  // End-to-End Workflow Verification for Pilot Security
  app.post('/api/pilot/workflow/:ticker', async (req, res) => {
    try {
      const { ticker } = req.params;
      const tenantId = resolvePilotTenant(req, res, req.body?.tenantId);
      if (!tenantId) return;
      const result = await pilotReadinessService.executeWorkflowVerification(ticker, tenantId);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // Ingest SEC Filings for Pilot Security into Phase 35 Ledger
  app.post('/api/pilot/sec-ingest/:ticker', async (req, res) => {
    try {
      const { ticker } = req.params;
      const tenantId = resolvePilotTenant(req, res, req.body?.tenantId);
      if (!tenantId) return;
      const maxFilings = parseInt((req.body?.maxFilings as string) || '5', 10);
      const result = await pilotReadinessService.ingestSecFilingsForSecurity(ticker, tenantId, maxFilings);
      res.json(result);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(statusForError(error, 500)).json({ error: errMsg });
    }
  });

  // ==========================================
  // PHASE 18: STRUCTURED ERROR HANDLING MIDDLEWARE
  // ==========================================
  app.use('/api', errorHandler);

  return app;
}

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await createApp();

  // ==========================================
  // VITE DEV & PRODUCTION MIDDLEWARE
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Investment Intelligence] Full-stack server running on http://0.0.0.0:${PORT}`);
  });

  // Phase 19: Graceful Shutdown
  const gracefulShutdown = async (signal: string) => {
    structuredLogger.info(`Received ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      try {
        await persistenceManager.shutdown();
        structuredLogger.info('Persistence shutdown complete. Process exiting cleanly.');
        process.exit(0);
      } catch (err) {
        structuredLogger.error('Error during graceful shutdown', { errorCategory: 'SHUTDOWN_ERROR', metadata: { error: String(err) } });
        process.exit(1);
      }
    });

    // Hard fallback timeout
    setTimeout(() => {
      structuredLogger.error('Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Tests import createApp() and set MARKET_THESIS_DISABLE_AUTOSTART=1 so importing this module never binds a port.
if (process.env.MARKET_THESIS_DISABLE_AUTOSTART !== '1') {
  startServer();
}
