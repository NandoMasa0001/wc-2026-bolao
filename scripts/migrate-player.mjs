#!/usr/bin/env node
/**
 * migrate-player.mjs — copy a single player's predictions from one
 * Supabase project to another, remapping their UUID.
 *
 * Use case: you joined a 2nd league (different Supabase) and want to
 * carry over your existing picks instead of re-typing 104 matches.
 *
 * The two leagues share the same match IDs (both seeded from
 * football-data.org), so predictions translate cleanly — only the
 * player_id needs remapping.
 *
 * Usage:
 *   SOURCE_URL=https://A.supabase.co \
 *   SOURCE_SERVICE_KEY=sb_secret_... \
 *   TARGET_URL=https://B.supabase.co \
 *   TARGET_SERVICE_KEY=sb_secret_... \
 *   SOURCE_PLAYER_ID=<uuid in source DB> \
 *   TARGET_PLAYER_ID=<uuid in target DB> \
 *   node scripts/migrate-player.mjs
 */

import { createClient } from '@supabase/supabase-js';

const {
  SOURCE_URL, SOURCE_SERVICE_KEY,
  TARGET_URL, TARGET_SERVICE_KEY,
  SOURCE_PLAYER_ID, TARGET_PLAYER_ID
} = process.env;

function need(name, v) {
  if (!v) { console.error(`Missing env: ${name}`); process.exit(1); }
}
need('SOURCE_URL', SOURCE_URL);
need('SOURCE_SERVICE_KEY', SOURCE_SERVICE_KEY);
need('TARGET_URL', TARGET_URL);
need('TARGET_SERVICE_KEY', TARGET_SERVICE_KEY);
need('SOURCE_PLAYER_ID', SOURCE_PLAYER_ID);
need('TARGET_PLAYER_ID', TARGET_PLAYER_ID);

const auth = { auth: { persistSession: false, autoRefreshToken: false } };
const source = createClient(SOURCE_URL, SOURCE_SERVICE_KEY, auth);
const target = createClient(TARGET_URL, TARGET_SERVICE_KEY, auth);

console.log(`Migrating player ${SOURCE_PLAYER_ID} (source) → ${TARGET_PLAYER_ID} (target)`);

// --- 1. predictions (many rows) ---
{
  const { data, error } = await source
    .from('predictions')
    .select('*')
    .eq('player_id', SOURCE_PLAYER_ID);
  if (error) throw error;
  if (data.length === 0) {
    console.log('  predictions: 0 rows (nothing to copy)');
  } else {
    const translated = data.map(r => ({ ...r, player_id: TARGET_PLAYER_ID, points: 0 }));
    const { error: ue } = await target
      .from('predictions')
      .upsert(translated, { onConflict: 'player_id,match_id' });
    if (ue) throw ue;
    console.log(`  predictions: ${translated.length} rows copied`);
  }
}

// --- 2-6. one-row-per-player tables ---
const singletonTables = [
  'advancement_predictions',
  'finals_predictions',
  'award_predictions',
  'poll_predictions',
  'extra_predictions'
];

for (const t of singletonTables) {
  const { data, error } = await source
    .from(t)
    .select('*')
    .eq('player_id', SOURCE_PLAYER_ID)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    console.log(`  ${t}: no row to copy`);
    continue;
  }
  const translated = { ...data, player_id: TARGET_PLAYER_ID, points: 0 };
  // strip any auto-generated columns we don't want to override
  // (timestamps are fine to keep)
  const { error: ue } = await target
    .from(t)
    .upsert(translated, { onConflict: 'player_id' });
  if (ue) throw ue;
  console.log(`  ${t}: 1 row copied`);
}

console.log('Done. Run the cron in TARGET to recompute points: SCORING_ONLY=1 node ...');
