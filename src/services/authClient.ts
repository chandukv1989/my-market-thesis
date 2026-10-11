/**
 * Phase 38.2B: browser auth client (framework-free so it is unit-testable with an injected fetch).
 *
 * The session itself lives in the HttpOnly `session_id` cookie set by the server, so no credential is ever kept in
 * JS-accessible storage. This module only talks to the documented public auth routes:
 *   POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
 */

export interface AuthUser {
  userId: string;
  email: string;
  status?: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  busy: boolean;
}

export const INITIAL_AUTH_STATE: AuthState = { status: 'loading', user: null, error: null, busy: false };

export type AuthAction =
  | { type: 'RESTORE_OK'; user: AuthUser }
  | { type: 'RESTORE_NONE' }
  | { type: 'SUBMIT' }
  | { type: 'AUTH_OK'; user: AuthUser }
  | { type: 'AUTH_FAILED'; message: string }
  | { type: 'LOGGED_OUT' }
  | { type: 'SESSION_EXPIRED' };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESTORE_OK':
    case 'AUTH_OK':
      return { status: 'authenticated', user: action.user, error: null, busy: false };
    case 'RESTORE_NONE':
    case 'LOGGED_OUT':
      return { status: 'anonymous', user: null, error: null, busy: false };
    case 'SUBMIT':
      return { ...state, busy: true, error: null };
    case 'AUTH_FAILED':
      return { status: 'anonymous', user: null, error: action.message, busy: false };
    case 'SESSION_EXPIRED':
      return { status: 'anonymous', user: null, error: 'Your session has expired. Please sign in again.', busy: false };
    default:
      return state;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AuthClient {
  restoreSession(): Promise<AuthUser | null>;
  login(email: string, password: string): Promise<AuthUser>;
  register(email: string, password: string): Promise<AuthUser>;
  logout(): Promise<void>;
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function createAuthClient(fetchImpl: FetchLike = (i, init) => fetch(i, init)): AuthClient {
  const post = (url: string, body?: unknown) =>
    fetchImpl(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {})
    });

  const authenticate = async (url: string, email: string, password: string): Promise<AuthUser> => {
    const res = await post(url, { email, password });
    const data = await readJson(res);
    if (!res.ok || !data?.authenticated || !data.user) {
      throw new Error((data && (data.error?.message || data.error)) || `Request failed (${res.status})`);
    }
    return data.user as AuthUser;
  };

  return {
    async restoreSession() {
      const res = await fetchImpl('/api/auth/me', { method: 'GET', credentials: 'same-origin' });
      const data = await readJson(res);
      return res.ok && data?.authenticated && data.user ? (data.user as AuthUser) : null;
    },
    login: (email, password) => authenticate('/api/auth/login', email, password),
    register: (email, password) => authenticate('/api/auth/register', email, password),
    async logout() {
      await post('/api/auth/logout');
    }
  };
}

/**
 * Wraps a fetch implementation so any 401 from a protected /api route (other than the auth bootstrap routes)
 * signals that the session is gone. The UI then returns to the sign-in screen instead of showing broken views.
 */
export function withUnauthorizedHandler(fetchImpl: FetchLike, onUnauthorized: () => void): FetchLike {
  return async (input, init) => {
    const res = await fetchImpl(input, init);
    if (res.status === 401 && typeof input === 'string' && input.startsWith('/api/') && !input.startsWith('/api/auth/')) {
      onUnauthorized();
    }
    return res;
  };
}
