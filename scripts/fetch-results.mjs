#!/usr/bin/env node
/**
 * fetch-results.mjs — run every 10 min by GitHub Actions.
 *
 * MULTI-LEAGUE: reads `scripts/leagues.config.json`, runs the cron for
 * every configured league in one invocation. External API calls
 * (football-data.org + the-odds-api) happen ONCE; results get written
 * to all leagues' databases.
 *
 * PRIMARY → SECONDARY sync: admin-entered tournament results
 * (`config.results` — best player, top scorer, dark horse, etc.) live
 * in the primary league. Each cron run copies them to the secondary
 * leagues so all bolões share the same official answers.
 *
 * Env:
 *   FOOTBALL_API_KEY        required
 *   ODDS_API_KEY            optional (boost stays at 1× without it)
 *   SUPABASE_URL_{NAME}     per league listed in leagues.config.json
 *   SUPABASE_SERVICE_KEY_{NAME}
 *   SCORING_ONLY=1          skip API fetches, only run scoring
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetchTeamsAndMatches } from '../src/lib/footballApi.js';
import { fetchChampionOdds } from '../src/lib/oddsApi.js';
import {
  baseMatchPoints,
  matchPoints,
  scoreAdvancement,
  scoreFinalists,
  scoreAwards,
  scorePoll,
  scoreExtras,
  rankBoostsFromChampionOdds,
  DEFAULT_ROUND_MULTIPLIERS
} from '../src/lib/scoring.js';
import { computeStandings } from '../src/lib/standings.js';

const {
  FOOTBALL_API_KEY,
  ODDS_API_KEY,
  COMPETITION = 'WC',
  SCORING_ONLY
} = process.env;

const scoringOnly = SCORING_ONLY === '1' || SCORING_ONLY === 'true';

/* -------------------------------------------------------------------- */
/* Load the list of leagues + their per-league env vars.                */
/* -------------------------------------------------------------------- */

function loadLeagues() {
  // Try the JSON config first.
  let configList;
  try {
    const raw = readFileSync(new URL('./leagues.config.json', import.meta.url), 'utf8');
    configList = JSON.parse(raw);
  } catch {
    configList = null;
  }

  const leagues = [];
  if (Array.isArray(configList) && configList.length > 0) {
    for (const entry of configList) {
      const url = process.env[entry.urlEnv];
      const key = process.env[entry.keyEnv];
      if (!url || !key) {
        console.warn(
          `[league "${entry.name}"] skipping — missing ${!url ? entry.urlEnv : entry.keyEnv}`
        );
        continue;
      }
      leagues.push({
        name: entry.name,
        url,
        key,
        isPrimary: !!entry.isPrimary
      });
    }
  }

  // Backward compat: old single-league env scheme.
  if (leagues.length === 0 && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    leagues.push({
      name: 'default',
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_KEY,
      isPrimary: true
    });
  }

  if (leagues.length === 0) {
    throw new Error(
      'No leagues configured. Either populate SUPABASE_URL_{NAME} env vars matching leagues.config.json, or fall back to single-league SUPABASE_URL/SUPABASE_SERVICE_KEY.'
    );
  }
  return leagues;
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function byId(rows) {
  const m = {};
  for (const r of rows || []) m[r.player_id] = r;
  return m;
}

async function flushUpdates(supabase, table, rows, onConflict, name) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) console.error(`[${name}] flush ${table}:`, error.message);
  }
}

/* -------------------------------------------------------------------- */
/* Process one league's database.                                       */
/* -------------------------------------------------------------------- */

async function runForLeague({ league, apiMatches, championOdds, primaryResults, primaryMatches }) {
  const tag = `[${league.name}]`;
  console.log(`${tag} processing…`);

  const supabase = makeClient(league.url, league.key);

  // ---- Config row ----
  const { data: cfgRow, error: cfgErr } = await supabase
    .from('config')
    .select('*')
    .eq('id', 'tournament')
    .maybeSingle();
  if (cfgErr) throw new Error(`${tag} config: ${cfgErr.message}`);
  if (!cfgRow) {
    console.warn(`${tag} skipping — config.tournament missing (seed first).`);
    return null;
  }
  const multipliers = cfgRow.round_multipliers || DEFAULT_ROUND_MULTIPLIERS;

  // ---- Sync admin-entered results from primary (if any) ----
  if (primaryResults && league.isPrimary === false) {
    const merged = { ...(cfgRow.results || {}), ...primaryResults };
    await supabase.from('config').update({ results: merged }).eq('id', 'tournament');
    cfgRow.results = merged;
    console.log(`${tag} synced config.results from primary league.`);
  }

  // ---- Sync championship odds from shared fetch ----
  const tournamentStartsAt = cfgRow.tournament_starts_at ? new Date(cfgRow.tournament_starts_at) : null;
  const tournamentStarted = tournamentStartsAt && tournamentStartsAt.getTime() <= Date.now();
  if (!scoringOnly && !tournamentStarted && championOdds && Object.keys(championOdds).length > 0) {
    // Translate championOdds (team names from the-odds-api) into team codes via this league's teams table
    const { data: teamRows } = await supabase.from('teams').select('code, name');
    const nameToCode = {};
    for (const r of teamRows || []) {
      if (r.name) nameToCode[r.name.toLowerCase()] = r.code;
    }
    const byCode = {};
    for (const [name, prob] of Object.entries(championOdds)) {
      const code = nameToCode[name.toLowerCase()];
      if (code) byCode[code] = prob;
    }
    if (Object.keys(byCode).length > 0) {
      await supabase.from('config').update({ tournament_odds: byCode }).eq('id', 'tournament');
      cfgRow.tournament_odds = byCode;
    }
  } else if (tournamentStarted) {
    console.log(`${tag} odds locked (tournament started).`);
  }

  // ---- Upsert matches ----
  // Source of truth for the match table:
  //   - Primary league: API (with admin-override preservation, see below)
  //   - Secondary leagues: PRIMARY league's matches table. This lets the
  //     admin enter a result once on the primary and have it ripple to
  //     all other leagues automatically.
  const matchSource = league.isPrimary === false && primaryMatches?.length
    ? primaryMatches
    : apiMatches;

  if (!scoringOnly && matchSource.length > 0) {
    // Read current DB state to know which matches already have a result
    // we shouldn't overwrite (when source is API).
    const ids = matchSource.map(m => m.id);
    const existingById = {};
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data } = await supabase
        .from('matches')
        .select('id, status, home_score, away_score')
        .in('id', chunk);
      for (const r of data || []) existingById[r.id] = r;
    }

    const rows = matchSource.map((m) => {
      const existing = existingById[m.id];
      // The score is what matters for protecting admin overrides — status
      // alone is unreliable (API can mark a match FINISHED but still
      // have null home/away scores for hours; if we trusted status here,
      // we'd clobber the manual placar back to null).
      const apiHasScore = m.homeScore != null && m.awayScore != null;
      const dbHasScore  = existing && existing.home_score != null && existing.away_score != null;

      const base = {
        id: m.id,
        api_id: m.apiId ?? null,
        stage: m.stage,
        group_letter: m.group,
        matchday: m.matchday,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        home_placeholder: m.homePlaceholder,
        away_placeholder: m.awayPlaceholder,
        kickoff_at: new Date(m.kickoffAt).toISOString()
      };

      if (apiHasScore) {
        // API knows the score → it's the truth, overwrite any DB state.
        base.status     = m.status;
        base.home_score = m.homeScore;
        base.away_score = m.awayScore;
        base.winner     = m.winner;
      } else if (dbHasScore) {
        // DB has an admin-entered score but API doesn't know yet —
        // preserve DB.
        base.status     = existing.status;
        base.home_score = existing.home_score;
        base.away_score = existing.away_score;
      } else {
        // Neither side has a score: just take API's status (scheduled/
        // live without numbers), keep scores null.
        base.status     = m.status;
        base.home_score = m.homeScore;
        base.away_score = m.awayScore;
        base.winner     = m.winner;
      }
      return base;
    });

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from('matches').upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(`${tag} matches upsert: ${error.message}`);
    }
  }

  // ---- Score predictions (placar) ----
  const { data: predRows } = await supabase.from('predictions').select('*');
  const { data: matchRowsAll } = await supabase.from('matches').select('*');
  const matchesById = Object.fromEntries(
    (matchRowsAll || []).map((m) => [m.id, {
      ...m,
      stage: m.stage,
      homeScore: m.home_score,
      awayScore: m.away_score
    }])
  );

  const playerAgg = new Map();
  const predUpdates = [];

  for (const pr of predRows || []) {
    const match = matchesById[pr.match_id];
    if (!match) continue;
    const predObj = {
      homeScore: pr.home_score,
      awayScore: pr.away_score,
      advancer: pr.advancer || null
    };
    // Pass the full match object so scoring can read winner/homeTeam/awayTeam
    // for the knockout advancer rule.
    const actualForScoring = {
      homeScore: match.home_score,
      awayScore: match.away_score,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      winner: match.winner
    };
    let points = 0;
    if (match.status === 'finished') {
      points = matchPoints(predObj, actualForScoring, match.stage, multipliers);
    }
    if (points !== pr.points) predUpdates.push({ ...pr, points });
    if (!playerAgg.has(pr.player_id)) {
      playerAgg.set(pr.player_id, { matches: 0, exactScores: 0, predictionsMade: 0 });
    }
    const agg = playerAgg.get(pr.player_id);
    agg.predictionsMade += 1;
    if (match.status === 'finished') {
      agg.matches += points;
      if (baseMatchPoints(predObj, actualForScoring) === 7) agg.exactScores += 1;
    }
  }

  await flushUpdates(supabase, 'predictions', predUpdates, 'player_id,match_id', league.name);

  // ---- Compute advancing-32 + finalists ----
  const groupMatches = (matchRowsAll || []).filter(m => m.stage === 'group');
  const allGroupFinished = groupMatches.length > 0 &&
    groupMatches.every(m => m.status === 'finished');

  let officialAdvancing = null;
  if (allGroupFinished) {
    const { data: teamRows } = await supabase.from('teams').select('*');
    const teamsByGroup = {};
    for (const t of teamRows || []) {
      if (!t.group_letter) continue;
      if (!teamsByGroup[t.group_letter]) teamsByGroup[t.group_letter] = [];
      teamsByGroup[t.group_letter].push(t.code);
    }
    const standings = computeStandings({
      matches: groupMatches.map((m) => ({
        ...m, stage: m.stage, group: m.group_letter,
        homeTeam: m.home_team, awayTeam: m.away_team,
        homeScore: m.home_score, awayScore: m.away_score
      })),
      teamsByGroup
    });
    officialAdvancing = Array.from(standings.advancing);
  }

  const finalMatch = (matchRowsAll || []).find(m => m.stage === 'final');
  const officialFinalists = finalMatch && finalMatch.home_team && finalMatch.away_team
    ? [finalMatch.home_team, finalMatch.away_team]
    : null;

  const teamBoosts = rankBoostsFromChampionOdds(cfgRow.tournament_odds || {});
  const results = cfgRow.results || {};
  const awardsActual = {
    bestPlayer: results.bestPlayer,
    youngPlayer: results.youngPlayer,
    goalkeeper: results.goalkeeper,
    topScorer: results.topScorer
  };
  const pollActual = {
    darkHorse: results.darkHorse,
    disappointment: results.disappointment
  };

  // ---- Score tournament-long buckets ----
  const [{ data: advRows }, { data: finRows }, { data: awdRows }, { data: pollRows }, { data: extraRows }, { data: playerRows }] =
    await Promise.all([
      supabase.from('advancement_predictions').select('*'),
      supabase.from('finals_predictions').select('*'),
      supabase.from('award_predictions').select('*'),
      supabase.from('poll_predictions').select('*'),
      supabase.from('extra_predictions').select('*'),
      supabase.from('players').select('*')
    ]);

  const advByPlayer = byId(advRows);
  const finByPlayer = byId(finRows);
  const awdByPlayer = byId(awdRows);
  const pollByPlayer = byId(pollRows);
  const extraByPlayer = byId(extraRows);

  const advUpdates = [];
  const finUpdates = [];
  const awdUpdates = [];
  const pollUpdates = [];
  const extraUpdates = [];
  const playerUpdates = [];

  for (const player of playerRows || []) {
    const pid = player.id;
    const matchAgg = playerAgg.get(pid) || { matches: 0, exactScores: 0, predictionsMade: 0 };

    // Advancement
    let advancement = 0;
    if (officialAdvancing && advByPlayer[pid]?.teams) {
      advancement = scoreAdvancement(advByPlayer[pid].teams, officialAdvancing);
      if (advByPlayer[pid].points !== advancement) {
        advUpdates.push({ ...advByPlayer[pid], points: advancement });
      }
    } else {
      advancement = advByPlayer[pid]?.points || 0;
    }

    // Finalists
    let finalists = 0;
    if (officialFinalists && finByPlayer[pid]?.finalists) {
      finalists = scoreFinalists(finByPlayer[pid].finalists, officialFinalists, teamBoosts);
      if (finByPlayer[pid].points !== finalists) {
        finUpdates.push({ ...finByPlayer[pid], points: finalists });
      }
    } else {
      finalists = finByPlayer[pid]?.points || 0;
    }

    // Awards
    let awards = 0;
    if (awdByPlayer[pid]) {
      const camelPred = {
        bestPlayer: awdByPlayer[pid].best_player,
        youngPlayer: awdByPlayer[pid].young_player,
        goalkeeper: awdByPlayer[pid].goalkeeper,
        topScorer: awdByPlayer[pid].top_scorer
      };
      awards = scoreAwards(camelPred, awardsActual);
      if (awdByPlayer[pid].points !== awards) {
        awdUpdates.push({ ...awdByPlayer[pid], points: awards });
      }
    }

    // Poll
    let poll = 0;
    if (pollByPlayer[pid]) {
      poll = scorePoll(
        { darkHorse: pollByPlayer[pid].dark_horse, disappointment: pollByPlayer[pid].disappointment },
        pollActual
      );
      if (pollByPlayer[pid].points !== poll) {
        pollUpdates.push({ ...pollByPlayer[pid], points: poll });
      }
    }

    // Extras
    let extras = 0;
    if (extraByPlayer[pid]) {
      const er = extraByPlayer[pid];
      const camelPred = {
        champion: er.champion,
        firstGoalBrazil: er.first_goal_brazil,
        lastGoalBrazil: er.last_goal_brazil,
        hundredthGoal: er.hundredth_goal,
        totalGoalsWC: er.total_goals_wc,
        neymarGA: er.neymar_ga,
        topScorerGoals: er.top_scorer_goals
      };
      const extrasActual = {
        champion: results.champion,
        firstGoalBrazil: results.firstGoalBrazil,
        lastGoalBrazil: results.lastGoalBrazil,
        hundredthGoal: results.hundredthGoal,
        totalGoalsWC: results.totalGoalsWC,
        neymarGA: results.neymarGA,
        topScorerGoals: results.topScorerGoals
      };
      extras = scoreExtras(camelPred, extrasActual, teamBoosts);
      if (er.points !== extras) extraUpdates.push({ ...er, points: extras });
    }

    const total = matchAgg.matches + advancement + finalists + awards + poll + extras;

    playerUpdates.push({
      id: pid,
      points: {
        matches: matchAgg.matches,
        advancement, finalists, awards, poll, extras,
        total
      },
      stats: {
        predictionsMade: matchAgg.predictionsMade,
        exactScores: matchAgg.exactScores
      }
    });
  }

  await flushUpdates(supabase, 'advancement_predictions', advUpdates, 'player_id', league.name);
  await flushUpdates(supabase, 'finals_predictions', finUpdates, 'player_id', league.name);
  await flushUpdates(supabase, 'award_predictions', awdUpdates, 'player_id', league.name);
  await flushUpdates(supabase, 'poll_predictions', pollUpdates, 'player_id', league.name);
  await flushUpdates(supabase, 'extra_predictions', extraUpdates, 'player_id', league.name);

  for (const p of playerUpdates) {
    const { error } = await supabase
      .from('players')
      .update({ points: p.points, stats: p.stats })
      .eq('id', p.id);
    if (error) console.error(`${tag} update player ${p.id}:`, error.message);
  }

  // Stamp last-fetch timestamp so the /admin preflight can flag a
  // stale cron. Failure here is non-fatal — old column on a not-yet-
  // migrated DB just gets ignored.
  {
    const { error: stampErr } = await supabase
      .from('config')
      .update({ last_fetch_at: new Date().toISOString() })
      .eq('id', 'tournament');
    if (stampErr && !/column .* does not exist/i.test(stampErr.message)) {
      console.warn(`${tag} could not stamp last_fetch_at: ${stampErr.message}`);
    }
  }

  console.log(`${tag} done (${playerUpdates.length} players scored).`);

  // Return the primary league's results so secondaries can sync.
  return league.isPrimary ? cfgRow.results : null;
}

/* -------------------------------------------------------------------- */
/* Main                                                                  */
/* -------------------------------------------------------------------- */

async function main() {
  const leagues = loadLeagues();
  console.log(`Configured leagues: ${leagues.map(l => l.name + (l.isPrimary ? '*' : '')).join(', ')}`);

  // External APIs are shared across leagues — fetch ONCE.
  let apiMatches = [];
  let championOddsByName = null;

  if (!scoringOnly) {
    if (!FOOTBALL_API_KEY) throw new Error('Missing FOOTBALL_API_KEY');
    console.log('Fetching matches from football-data.org…');
    const result = await fetchTeamsAndMatches({ apiKey: FOOTBALL_API_KEY, competition: COMPETITION });
    apiMatches = result.matches;
    console.log(`  ${apiMatches.length} matches.`);

    if (ODDS_API_KEY) {
      try {
        championOddsByName = await fetchChampionOdds({ apiKey: ODDS_API_KEY });
        console.log(`  championship outright odds for ${Object.keys(championOddsByName).length} teams.`);
      } catch (err) {
        console.warn('Odds fetch failed (continuing):', err.message);
      }
    }
  } else {
    console.log('SCORING_ONLY — skipping API fetches.');
  }

  // Process primary first to capture its config.results.
  const primary = leagues.find(l => l.isPrimary) || leagues[0];
  const others  = leagues.filter(l => l !== primary);

  const primaryResults = await runForLeague({
    league: primary,
    apiMatches,
    championOdds: championOddsByName,
    primaryResults: null
  });

  // Re-read primary's final matches state (post-upsert with any admin
  // overrides preserved) so secondaries inherit from it. This makes the
  // admin's manual entry on the primary league propagate automatically
  // to every secondary league.
  let primaryMatches = [];
  if (!scoringOnly) {
    const primaryClient = makeClient(primary.url, primary.key);
    const { data } = await primaryClient.from('matches').select('*');
    primaryMatches = (data || []).map(r => ({
      id: r.id,
      apiId: r.api_id,
      stage: r.stage,
      group: r.group_letter,
      matchday: r.matchday,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      homePlaceholder: r.home_placeholder,
      awayPlaceholder: r.away_placeholder,
      kickoffAt: r.kickoff_at,
      status: r.status,
      homeScore: r.home_score,
      awayScore: r.away_score,
      winner: r.winner
    }));
    console.log(`Captured ${primaryMatches.length} matches from primary (${primary.name}) for secondary propagation.`);
  }

  for (const league of others) {
    await runForLeague({
      league,
      apiMatches,
      championOdds: championOddsByName,
      primaryResults,
      primaryMatches
    });
  }

  console.log('All leagues processed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
