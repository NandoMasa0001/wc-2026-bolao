import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, useMock } from '../supabase.js';
import { mockConfig } from '../lib/mockData.js';

/** Synthesise an email from a username (no real email required). Supabase
 *  needs an email-shaped identifier; we never send mail. */
const SYNTH_DOMAIN = 'bolaotrupe.local';
function nameToSyntheticEmail(name) {
  const slug = (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics (Inês → ines)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}@${SYNTH_DOMAIN}`;
}

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
  const [session, setSession] = useState(null);

  // Restore session on mount from Supabase's own token storage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const sbSession = data?.session;
      if (cancelled || !sbSession?.user) return;
      const uid = sbSession.user.id;
      const { data: row } = await supabase
        .from('players')
        .select('name, is_admin')
        .eq('id', uid)
        .maybeSingle();
      if (cancelled || !row) return;
      setSession({
        id: uid,
        name: row.name,
        isAdmin: !!row.is_admin,
        signedInAt: new Date().toISOString()
      });
    })();
    return () => { cancelled = true; };
  }, []);

  // React to external auth changes (sign-out from another tab, token expiry).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, sbSession) => {
      if (event === 'SIGNED_OUT' || !sbSession?.user) {
        setSession(null);
      }
    });
    return () => data?.subscription?.unsubscribe?.();
  }, []);

  const checkPassword = useCallback(async (pwd) => {
    const { data, error } = await supabase.rpc('check_shared_password', { pwd });
    if (error) throw new Error(error.message);
    return data === true;
  }, []);

  /**
   * Username + 4-digit PIN sign-in/sign-up.
   *
   * Same (name, pin) on any device = same UUID, so predictions persist
   * across devices and after clearing cookies. We synthesise an email
   * from the username and use Supabase's email+password auth under the
   * hood — no actual email is ever sent.
   */
  const signIn = useCallback(async ({ name, pin }) => {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('Coloca seu nome.');
    if (!pin || !/^\d{4}$/.test(pin)) throw new Error('PIN deve ter exatamente 4 dígitos.');

    const email = nameToSyntheticEmail(trimmed);
    if (email === `@${SYNTH_DOMAIN}`) {
      throw new Error('Nome inválido — use letras ou números.');
    }

    // 1) Try sign-in first.
    const signInRes = await supabase.auth.signInWithPassword({ email, password: pin });
    let user = signInRes.data?.user || null;

    if (signInRes.error) {
      const msg = (signInRes.error.message || '').toLowerCase();
      const isInvalidCreds =
        msg.includes('invalid login credentials') || msg.includes('invalid_grant');
      if (!isInvalidCreds) throw new Error(signInRes.error.message);

      // 2) Sign-in failed — assume new user, sign up.
      const signUpRes = await supabase.auth.signUp({ email, password: pin });
      if (signUpRes.error) {
        const sMsg = (signUpRes.error.message || '').toLowerCase();
        if (sMsg.includes('already') || sMsg.includes('registered')) {
          throw new Error('PIN incorreto pra esse nome.');
        }
        if (sMsg.includes('password should') || sMsg.includes('too short') || sMsg.includes('weak')) {
          throw new Error('PIN muito curto pro servidor — peça pro admin baixar o min length de senha pra 4 no painel Supabase.');
        }
        throw new Error(signUpRes.error.message);
      }
      user = signUpRes.data?.user || null;

      // Some configs require email confirmation; we don't, but be defensive.
      if (!signUpRes.data?.session) {
        const retry = await supabase.auth.signInWithPassword({ email, password: pin });
        if (retry.error) {
          throw new Error('Conta criada, mas confirmação de email está ativa. Desliga em Authentication → Providers → Email no Supabase.');
        }
        user = retry.data?.user || user;
      }
    }

    if (!user) throw new Error('Não foi possível autenticar.');
    const uid = user.id;

    // 3) Ensure player row exists, rename if changed.
    const { data: existing } = await supabase
      .from('players')
      .select('name, is_admin')
      .eq('id', uid)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabase
        .from('players')
        .insert({ id: uid, name: trimmed, is_admin: false });
      if (insErr) throw new Error(insErr.message);
    } else if (existing.name !== trimmed) {
      const { error: updErr } = await supabase
        .from('players')
        .update({ name: trimmed })
        .eq('id', uid);
      if (updErr) console.error('player rename:', updErr.message);
    }

    const isAdmin = !!existing?.is_admin;
    const next = { id: uid, name: existing?.name || trimmed, isAdmin, signedInAt: new Date().toISOString() };
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
