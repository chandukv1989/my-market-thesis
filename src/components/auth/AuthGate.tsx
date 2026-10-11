import React, { useState } from 'react';
import { useAuth } from '../../state/AuthContext';

/** Renders the sign-in / registration screen until a session exists. Protected UI mounts only when authenticated. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (auth.status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#051424] text-[#d4e4fa]" role="status">
        Restoring session…
      </div>
    );
  }

  if (auth.status === 'authenticated') {
    return <>{children}</>;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void (mode === 'login' ? auth.login(email, password) : auth.register(email, password));
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#051424] text-[#d4e4fa]">
      <form onSubmit={submit} className="w-96 space-y-4 rounded-lg border border-[#1e3a5f] bg-[#0a1f33] p-8" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
        <h1 className="text-xl font-semibold">Investment Intelligence</h1>
        <p className="text-sm text-[#8aa4c4]">
          {mode === 'login' ? 'Sign in to access your private research workspace.' : 'Create an account. Your research data is private to you.'}
        </p>
        <label className="block text-sm">
          Email
          <input className="mt-1 w-full rounded border border-[#1e3a5f] bg-[#051424] p-2" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm">
          Password
          <input className="mt-1 w-full rounded border border-[#1e3a5f] bg-[#051424] p-2" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {auth.error && <div role="alert" className="text-sm text-red-400">{auth.error}</div>}
        <button type="submit" disabled={auth.busy} className="w-full rounded bg-[#38bdf8] p-2 font-medium text-[#051424] disabled:opacity-50">
          {auth.busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="w-full text-sm text-[#38bdf8]" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
