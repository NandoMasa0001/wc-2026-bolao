#!/usr/bin/env node
/**
 * backup.mjs — daily JSON dump of every Supabase table.
 *
 * Run by .github/workflows/backup.yml every day at 06:00 UTC.
 * The resulting backup-YYYY-MM-DD.json gets uploaded as a workflow
 * artifact with 90-day retention.
 *
 * To restore (quick & dirty): read the JSON and upsert each table back
 * via the service role key.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TABLES = [
  'config',
  'teams',
  'matches',
  'players',
  'predictions',
  'advancement_predictions',
  'finals_predictions',
  'award_predictions',
  'poll_predictions',
  'poll_votes',
  'extra_predictions'
];

const dump = {
  dumpedAt: new Date().toISOString(),
  schemaVersion: 5, // bump when migrations change shape
  tables: {}
};

for (const t of TABLES) {
  const { data, error } = await supabase.from(t).select('*');
  if (error) {
    console.error(`${t}: ${error.message}`);
    continue;
  }
  dump.tables[t] = data;
  console.log(`${t}: ${data.length} rows`);
}

const stamp = new Date().toISOString().slice(0, 10);
const file = `backup-${stamp}.json`;
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`Wrote ${file}`);
