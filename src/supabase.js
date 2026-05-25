/**
 * supabase.js — client-side Supabase init.
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. If either is missing,
 * the app falls back to *mock mode* (no network calls, in-memory data only).
 * This lets the app run as a clickable demo without any Supabase project —
 * exactly what `npm run dev` does out of the box.
 *
 * The anon key may be either:
 *  - the new "publishable" key format: sb_publishable_...
 *  - the legacy JWT anon key (eyJhbGc...)
 * Both work with @supabase/supabase-js.
 */

import { createClient } from '@supabase/supabase-js';

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const useMock = !url || !anonKey;

let _client = null;
if (!useMock) {
  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // We use anonymous auth, so no email/password flow.
      flowType: 'pkce'
    }
  });
}

export const supabase = _client;

/**
 * Sign in anonymously and return the resulting session user, creating one
 * if needed. Resolves to a `User` object with an `id` (uuid).
 */
export async function ensureAnonymousAuth() {
  if (useMock || !supabase) {
    throw new Error('Supabase is not configured (mock mode).');
  }
  // Already signed in?
  const { data: existing } = await supabase.auth.getUser();
  if (existing?.user) return existing.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data?.user) throw new Error('Anonymous sign-in returned no user.');
  return data.user;
}
