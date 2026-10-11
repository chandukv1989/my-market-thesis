import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { AuthState, AuthUser, INITIAL_AUTH_STATE, authReducer, createAuthClient, withUnauthorizedHandler } from '../services/authClient';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, INITIAL_AUTH_STATE);
  const client = useMemo(() => createAuthClient(), []);

  // Session restoration (HttpOnly cookie) + global 401 handling for every protected /api call in the app.
  useEffect(() => {
    let cancelled = false;
    const originalFetch = window.fetch.bind(window);
    window.fetch = withUnauthorizedHandler(
      (input: any, init?: RequestInit) => originalFetch(input, init),
      () => dispatch({ type: 'SESSION_EXPIRED' })
    ) as typeof window.fetch;

    client
      .restoreSession()
      .then(user => {
        if (!cancelled) dispatch(user ? { type: 'RESTORE_OK', user } : { type: 'RESTORE_NONE' });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'RESTORE_NONE' });
      });

    return () => {
      cancelled = true;
      window.fetch = originalFetch;
    };
  }, [client]);

  const run = useCallback(
    async (fn: () => Promise<AuthUser>) => {
      dispatch({ type: 'SUBMIT' });
      try {
        dispatch({ type: 'AUTH_OK', user: await fn() });
      } catch (err) {
        dispatch({ type: 'AUTH_FAILED', message: err instanceof Error ? err.message : 'Sign-in failed' });
      }
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login: (email, password) => run(() => client.login(email, password)),
      register: (email, password) => run(() => client.register(email, password)),
      logout: async () => {
        try {
          await client.logout();
        } finally {
          dispatch({ type: 'LOGGED_OUT' });
        }
      }
    }),
    [state, client, run]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
