/**
 * Phase 38.2A: API Route Protection Policy
 *
 * Deny-by-default gate for everything under /api. Only the routes enumerated in
 * PUBLIC_API_ROUTES may be reached without an authenticated server-side session;
 * every other /api route (including routes that do not exist) answers 401.
 *
 * The gate is mounted once, before any route handler, so a handler that forgets to
 * check authentication can never become anonymously reachable, and an error thrown
 * inside a handler cannot bypass it.
 */

import { Request, Response, NextFunction } from 'express';

export interface PublicRoute {
  method: string;
  /** Path including the /api prefix, lowercase, no trailing slash. */
  path: string;
  reason: string;
}

/**
 * Explicit enumeration of intentionally public routes.
 * Anything not listed here requires authentication.
 */
export const PUBLIC_API_ROUTES: readonly PublicRoute[] = Object.freeze([
  { method: 'POST', path: '/api/auth/register', reason: 'Account creation must be reachable before a session exists.' },
  { method: 'POST', path: '/api/auth/login', reason: 'Session establishment must be reachable before a session exists.' },
  { method: 'POST', path: '/api/auth/logout', reason: 'Idempotent cookie/session clear; reveals no data and acts only on the caller\'s own session.' },
  { method: 'GET', path: '/api/auth/me', reason: 'Session probe; returns {authenticated:false} for anonymous callers and no data.' },
  { method: 'GET', path: '/api/health', reason: 'Liveness probe for load balancers; static payload, no provider/config detail.' }
]);

function normalizePath(p: string): string {
  const noQuery = p.split('?')[0];
  const trimmed = noQuery.length > 1 ? noQuery.replace(/\/+$/, '') : noQuery;
  return trimmed.toLowerCase();
}

export function isPublicApiRoute(method: string, fullPath: string): boolean {
  const m = method.toUpperCase();
  const p = normalizePath(fullPath);
  return PUBLIC_API_ROUTES.some(r => r.method === m && r.path === p);
}

/**
 * Express middleware. Mount with app.use('/api', apiAuthGate) AFTER resolveUser.
 */
export function apiAuthGate(req: Request, res: Response, next: NextFunction): void {
  if (isPublicApiRoute(req.method, req.originalUrl || `${req.baseUrl}${req.path}`)) {
    next();
    return;
  }
  if (!req.user || !req.session || typeof req.user.userId !== 'string' || !req.user.userId.trim()) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required to access this resource',
      code: 'AUTH_REQUIRED'
    });
    return;
  }
  next();
}

export class AuthenticationRequiredError extends Error {
  public readonly statusCode = 401;
  constructor() {
    super('Authentication required to access this resource');
    this.name = 'AuthenticationRequiredError';
  }
}

/**
 * Returns the authenticated principal's userId or throws. There is NO fallback identity.
 */
export function requireUserId(req: Request): string {
  const id = req.user?.userId;
  if (typeof id !== 'string' || !id.trim()) {
    throw new AuthenticationRequiredError();
  }
  return id;
}

/**
 * Operator allow-list for destructive/global maintenance endpoints.
 * Comma-separated user ids in ADMIN_USER_IDS. Empty/unset => nobody (fail-closed).
 */
export function isAdminUser(userId: string | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS || '';
  const admins = raw.split(',').map(s => s.trim()).filter(Boolean);
  return admins.includes(userId);
}
