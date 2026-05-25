import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, useMock, ensureAnonymousAuth } from '../supabase.js';
import { mockConfig } from '../lib/mockData.js';

/**
 * AuthContext — dual mode.
 *
 *   Mock mode (no VITE_SUPABASE_*): localStorage-only session, password
 *     is `mockConfig.sharedPassword`, "uid" derived from chosen name.
 *
 *   Supabase mode: real anonymous Auth (signInAnonymously), password is
 *     read from public.config.shared_password, the uid is the Supabase
 *     auth.users id.
 *
 * Exposes the same API in both modes:
 *   { session, signIn, signOut, checkPassword }
 *
 * `session` shape: { id, name, isAdmin, signedInAt } | null.
 */

const STORAGE_KEY = 'wc-prediction-session-v1';
const AuthCtx = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }) {
  return useMock
    ? <MockAuthProvider>{children}</MockAuthProvider>
    : <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
}

/* ------------------------------------------------------------------ */
/* Mock                                                                */
/* ------------------------------------------------------------------ */

function MockAuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  const checkPassword = useCallback(async (pwd) => pwd === mockConfig.sharedPassword, []);

  const signIn = useCallback(async ({ name, isAdmin = false }) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const id = 'user-' + trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const next = {
      id,
      name: trimmed,
      isAdmin: !!isAdmin,
      signedInAt: new Date().toISOString()
    };
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => setSession(null), []);

  const value = useMemo(
    () => ({ session, signIn, signOut, checkPassword }),
    [session, signIn, signOut, checkPassword]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

function SupabaseAuthProvider({ children }) {
  // Local cache so the app shell renders right away after refresh.
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  // Keep local session in sync with Supabase's own session lifecycle (e.g.
  // expired refresh, manual sign-out from another tab).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, sbSession) => {
      if (!sbSession) {
        setSession(null);
      }
    });
    return () => data?.subscription?.unsubscribe?.();
  }, []);

  const checkPassword = useCallback(async (pwd) => {
    // RPC bypasses RLS so the password gate works for unauthenticated
    // visitors without exposing the password itself.
    const { data, error } = await supabase.rpc('check_shared_password', { pwd });
    if (error) throw new Error(error.message);
    return data === true;
  }, []);

  const signIn = useCallback(async ({ name }) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;

    // 1) Anonymous sign-in (Supabase issues a UUID).
    const user = await ensureAnonymousAuth();
    const uid = user.id;

    // 2) Upsert the player row. RLS only lets us insert when id == auth.uid()
    //    and is_admin = false. If a row already exists (returning user),
    //    update its name.
    const { data: existing, error: selErr } = await supabase
      .from('players')
      .select('id, name, is_admin')
      .eq('id', uid)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    if (!existing) {
      const { error: insErr } = await supabase
        .from('players')
        .insert({
          id: uid,
          name: trimmed,
          is_admin: false
        });
      if (insErr) throw new Error(insErr.message);
    } else if (existing.name !== trimmed) {
      const { error: updErr } = await supabase
        .from('players')
        .update({ name: trimmed })
        .eq('id', uid);
      if (updErr) throw new Error(updErr.message);
    }

    const isAdmin = !!existing?.is_admin;
    const next = { id: uid, name: trimmed, isAdmin, signedInAt: new Date().toISOString() };
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, signIn, signOut, checkPassword }),
    [session, signIn, signOut, checkPassword]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
