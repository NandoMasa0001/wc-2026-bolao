#!/usr/bin/env node
/**
 * backup.mjs — daily JSON dump of every Supabase table for every league
 * listed in `leagues.config.json`. One file per league.
 *
 * Triggered by .github/workflows/backup.yml.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

function loadLeagues() {
  let configList;
  try {
    const raw = readFileSync(new URL('./leagues.config.json', import.meta.url), 'utf8');
    configList = JSON.parse(raw);
  } catch {
    configList = null;
  }

  const leagues = [];
  if (Array.isArray(configList)) {
    for (const entry of configList) {
      const url = process.env[entry.urlEnv];
      const key = process.env[entry.keyEnv];
      if (!url || !key) {
        console.warn(`Skipping "${entry.name}" — missing ${!url ? entry.urlEnv : entry.keyEnv}`);
        continue;
      }
      leagues.push({ name: entry.name, url, key });
    }
  }
  if (leagues.length === 0 && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    leagues.push({ name: 'default', url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY });
  }
  if (leagues.length === 0) {
    throw new Error('No leagues configured for backup.');
  }
  return leagues;
}

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

async function dumpLeague(league) {
  console.log(`[${league.name}] starting backup…`);
  const supabase = createClient(league.url, league.key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const dump = {
    league: league.name,
    dumpedAt: new Date().toISOString(),
    schemaVersion: 6,
    tables: {}
  };

  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select('*');
    if (error) {
      console.error(`[${league.name}] ${t}: ${error.message}`);
      continue;
    }
    dump.tables[t] = data;
    console.log(`[${league.name}] ${t}: ${data.length} rows`);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const file = `backup-${league.name}-${stamp}.json`;
  writeFileSync(file, JSON.stringify(dump, null, 2));
  console.log(`[${league.name}] wrote ${file}`);
}

async function main() {
  const leagues = loadLeagues();
  console.log(`Backing up ${leagues.length} league(s): ${leagues.map(l => l.name).join(', ')}`);
  for (const league of leagues) {
    await dumpLeague(league);
  }
  console.log('All backups written.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
