#!/usr/bin/env node
/**
 * restore.mjs — restore palpites from a backup.mjs (or admin-downloaded)
 * JSON dump into a Supabase project. Single-league: it uses the
 * SUPABASE_URL / SUPABASE_SERVICE_KEY env vars from the .env file you
 * source, NOT leagues.config.json. Restore to the same league the dump
 * came from.
 *
 * Usage:
 *   node --env-file=.env.familia scripts/restore.mjs backup-familia-2026-06-02.json --yes
 *
 * Flags:
 *   --yes                 actually run (default is dry-run preview)
 *   --tables=a,b,c        restrict to specific tables (default: all
 *                         prediction tables; never config/teams/matches/players
 *                         unless --full is also passed)
 *   --full                also restore config/teams/matches/players
 *                         (dangerous — players FK to auth.users that may
 *                         not exist in the target project)
 *
 * By default this UPSERTS — existing rows with matching keys are
 * overwritten with the backup contents, new ones are inserted, rows that
 * were added after the backup remain untouched. Run with --full only for
 * full-disaster recovery.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const dryRun = !args.includes('--yes');
const fullRestore = args.includes('--full');
const tablesArg = args.find(a => a.startsWith('--tables='));
const onlyTables = tablesArg ? tablesArg.slice('--tables='.length).split(',') : null;

if (!file) {
  console.error('Usage: restore.mjs <backup.json> [--yes] [--full] [--tables=a,b,c]');
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY (source a .env.<league> file).');
  process.exit(1);
}

const dump = JSON.parse(readFileSync(file, 'utf8'));
console.log(`Backup file: ${file}`);
console.log(`  league   : ${dump.league}`);
console.log(`  dumpedAt : ${dump.dumpedAt}`);
console.log(`  target   : ${process.env.SUPABASE_URL}`);
console.log(`  dryRun   : ${dryRun}`);
console.log(`  full     : ${fullRestore}`);
console.log('');

// Order matters: predictions depend on players + matches existing.
// `players` has FK to auth.users which we can't recreate from JSON,
// so it stays off by default even with --full.
const PREDICTION_TABLES = [
  { table: 'predictions',              conflict: 'player_id,match_id' },
  { table: 'advancement_predictions',  conflict: 'player_id' },
  { table: 'finals_predictions',       conflict: 'player_id' },
  { table: 'award_predictions',        conflict: 'player_id' },
  { table: 'poll_predictions',         conflict: 'player_id' },
  { table: 'poll_votes',               conflict: 'player_id' },
  { table: 'extra_predictions',        conflict: 'player_id' }
];
const FULL_TABLES = [
  { table: 'config',  conflict: 'id' },
  { table: 'teams',   conflict: 'code' },
  { table: 'matches', conflict: 'id' },
  ...PREDICTION_TABLES
];

const candidates = fullRestore ? FULL_TABLES : PREDICTION_TABLES;
const targets = onlyTables
  ? candidates.filter(c => onlyTables.includes(c.table))
  : candidates;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

console.log('Plan:');
for (const { table } of targets) {
  const rows = dump.tables?.[table] || [];
  console.log(`  ${table.padEnd(28)} — ${rows.length} rows from backup`);
}
console.log('');

if (dryRun) {
  console.log('Dry-run only. Add --yes to actually upsert.');
  process.exit(0);
}

for (const { table, conflict } of targets) {
  const rows = dump.tables?.[table] || [];
  if (rows.length === 0) {
    console.log(`${table}: skip (empty in backup)`);
    continue;
  }
  // Upsert in chunks to stay under PostgREST request-size limits.
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: conflict });
    if (error) {
      console.error(`${table}: ERROR at chunk ${i}: ${error.message}`);
      process.exit(2);
    }
    total += slice.length;
  }
  console.log(`${table}: ${total} rows restored`);
}
console.log('Done.');
