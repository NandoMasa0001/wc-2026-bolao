#!/usr/bin/env node
/**
 * seed.mjs — one-time bootstrap (Supabase).
 *
 * Pulls 48 teams + ~104 matches from football-data.org and writes them into
 * the Supabase Postgres database, plus the single `config` row.
 *
 * Run locally with:
 *   FOOTBALL_API_KEY=... \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=sb_secret_... \
 *   SHARED_PASSWORD=... \
 *   npm run seed
 *
 * Re-running is safe: every write is an `upsert`.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchTeamsAndMatches } from '../src/lib/footballApi.js';
import { DEFAULT_ROUND_MULTIPLIERS } from '../src/lib/scoring.js';

const {
  FOOTBALL_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SHARED_PASSWORD,
  COMPETITION = 'WC',
  TOURNAMENT_STARTS_AT = '2026-06-11T16:00:00Z'
} = process.env;

function need(name, v) {
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function main() {
  need('FOOTBALL_API_KEY', FOOTBALL_API_KEY);
  need('SUPABASE_URL', SUPABASE_URL);
  need('SUPABASE_SERVICE_KEY', SUPABASE_SERVICE_KEY);
  need('SHARED_PASSWORD', SHARED_PASSWORD);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log(`Fetching teams + matches for competition ${COMPETITION}…`);
  const { teams, matches } = await fetchTeamsAndMatches({
    apiKey: FOOTBALL_API_KEY,
    competition: COMPETITION
  });
  console.log(`  ${teams.length} teams, ${matches.length} matches.`);

  // -------------------- config --------------------
  console.log('Upserting config row…');
  const { error: cfgErr } = await supabase.from('config').upsert({
    id: 'tournament',
    shared_password: SHARED_PASSWORD,
    predictions_open: true,
    tournament_starts_at: new Date(TOURNAMENT_STARTS_AT).toISOString(),
    round_multipliers: DEFAULT_ROUND_MULTIPLIERS,
    poll_voting_open: false,
    awards_announced: false,
    results: {
      finalists: [],
      champion: null,
      bestPlayer: null,
      youngPlayer: null,
      goalkeeper: null,
      topScorer: null,
      darkHorse: null,
      disappointment: null
    },
    tournament_odds: {}
  });
  if (cfgErr) throw cfgErr;

  // -------------------- teams --------------------
  console.log('Upserting teams…');
  const teamRows = teams.map((t) => ({
    code: t.code,
    name: t.name,
    group_letter: t.group,
    flag_url: t.flagUrl
  }));
  const { error: teamErr } = await supabase.from('teams').upsert(teamRows, { onConflict: 'code' });
  if (teamErr) throw teamErr;

  // -------------------- matches --------------------
  console.log('Upserting matches…');
  const matchRows = matches.map((m) => ({
    id: m.id,
    api_id: m.apiId ?? null,
    stage: m.stage,
    group_letter: m.group,
    matchday: m.matchday,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    home_placeholder: m.homePlaceholder,
    away_placeholder: m.awayPlaceholder,
    kickoff_at: new Date(m.kickoffAt).toISOString(),
    status: m.status || 'scheduled',
    home_score: m.homeScore,
    away_score: m.awayScore,
    winner: m.winner,
    odds: m.odds ?? null
  }));
  // Chunk to avoid hitting Postgres limits.
  for (let i = 0; i < matchRows.length; i += 100) {
    const chunk = matchRows.slice(i, i + 100);
    const { error } = await supabase.from('matches').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
