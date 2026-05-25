#!/usr/bin/env node
/**
 * fetch-results.mjs — run by the GitHub Actions cron every 10 minutes
 * against Supabase Postgres.
 *
 * 1. Pull all WC matches from football-data.org.
 * 2. Upsert each into `matches`: status, scores, knockout winners.
 * 3. (Optional) Pull H2H + outright odds from the-odds-api, attach to
 *    matches and write championship outrights into config.tournament_odds.
 * 4. Score every prediction with `scoring.js`.
 * 5. Once the group stage is fully finished, score advancement_predictions.
 * 6. Once both finalists are known, score finals_predictions.
 * 7. Recompute awards + poll buckets from config.results each run.
 * 8. Recompute every player's totals.
 */

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
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  ODDS_API_KEY,
  COMPETITION = 'WC'
} = process.env;

function need(name, v) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  need('FOOTBALL_API_KEY', FOOTBALL_API_KEY);
  need('SUPABASE_URL', SUPABASE_URL);
  need('SUPABASE_SERVICE_KEY', SUPABASE_SERVICE_KEY);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ---------------- 1. Read config ----------------
  const { data: cfgRow, error: cfgErr } = await supabase
    .from('config')
    .select('*')
    .eq('id', 'tournament')
    .maybeSingle();
  if (cfgErr) throw cfgErr;
  if (!cfgRow) throw new Error('config row missing — run seed.mjs first.');
  const multipliers = cfgRow.round_multipliers || DEFAULT_ROUND_MULTIPLIERS;

  // ---------------- 2. Fresh matches ----------------
  console.log('Fetching matches from football-data.org…');
  const { matches: apiMatches } = await fetchTeamsAndMatches({
    apiKey: FOOTBALL_API_KEY,
    competition: COMPETITION
  });
  console.log(`  ${apiMatches.length} matches returned.`);

  // ---------------- 2b. Championship outright odds (optional) ----------------
  // Per-match (H2H) odds are NOT used by scoring — the boost only applies
  // to tournament-long bets via championship outrights. We only fetch the
  // outrights, and we lock the snapshot the moment the tournament starts.
  let championOdds = null;
  const tournamentStartsAt = cfgRow.tournament_starts_at ? new Date(cfgRow.tournament_starts_at) : null;
  const tournamentStarted = tournamentStartsAt && tournamentStartsAt.getTime() <= Date.now();

  if (tournamentStarted) {
    console.log('Tournament has started — odds are locked (skipping the-odds-api fetch).');
  } else if (ODDS_API_KEY) {
    try {
      console.log('Fetching championship outright odds…');
      const championByName = await fetchChampionOdds({ apiKey: ODDS_API_KEY });
      const { data: teamRows } = await supabase.from('teams').select('code, name');
      const nameToCode = {};
      for (const r of teamRows || []) {
        if (r.name) nameToCode[r.name.toLowerCase()] = r.code;
      }
      const byCode = {};
      for (const [name, prob] of Object.entries(championByName)) {
        const code = nameToCode[name.toLowerCase()];
        if (code) byCode[code] = prob;
      }
      if (Object.keys(byCode).length > 0) championOdds = byCode;
      console.log(`  outright odds matched for ${Object.keys(byCode).length} teams`);
    } catch (err) {
      console.warn('Champion-odds fetch failed (continuing without):', err.message);
    }
    if (championOdds) {
      await supabase
        .from('config')
        .update({ tournament_odds: championOdds })
        .eq('id', 'tournament');
    }
  }

  // ---------------- 3. Upsert matches ----------------
  console.log('Upserting matches…');
  const matchRows = apiMatches.map((m) => ({
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
    status: m.status,
    home_score: m.homeScore,
    away_score: m.awayScore,
    winner: m.winner
  }));
  for (let i = 0; i < matchRows.length; i += 100) {
    const chunk = matchRows.slice(i, i + 100);
    const { error } = await supabase.from('matches').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }

  // ---------------- 4. Score predictions ----------------
  console.log('Scoring predictions…');
  const { data: predRows } = await supabase.from('predictions').select('*');
  const { data: matchRowsAll } = await supabase.from('matches').select('*');
  const matchesById = Object.fromEntries(
    (matchRowsAll || []).map((m) => [m.id, {
      ...m,
      stage: m.stage,
      homeScore: m.home_score,
      awayScore: m.away_score,
      odds: m.odds
    }])
  );

  const playerAgg = new Map(); // playerId -> { matches, exactScores, predictionsMade }
  const predUpdates = [];

  for (const pr of predRows || []) {
    const match = matchesById[pr.match_id];
    if (!match) continue;
    const predObj = { homeScore: pr.home_score, awayScore: pr.away_score };
    let points = 0;
    if (match.status === 'finished') {
      points = matchPoints(predObj, match, match.stage, multipliers);
    }
    if (points !== pr.points) {
      predUpdates.push({ ...pr, points });
    }
    if (!playerAgg.has(pr.player_id)) {
      playerAgg.set(pr.player_id, { matches: 0, exactScores: 0, predictionsMade: 0 });
    }
    const agg = playerAgg.get(pr.player_id);
    agg.predictionsMade += 1;
    if (match.status === 'finished') {
      agg.matches += points;
      if (baseMatchPoints(predObj, match) === 7) agg.exactScores += 1;
    }
  }

  if (predUpdates.length > 0) {
    for (let i = 0; i < predUpdates.length; i += 100) {
      const chunk = predUpdates.slice(i, i + 100);
      const { error } = await supabase.from('predictions').upsert(chunk, {
        onConflict: 'player_id,match_id'
      });
      if (error) throw error;
    }
  }

  // ---------------- 5a. Advancement scoring ----------------
  const groupMatches = (matchRowsAll || []).filter(m => m.stage === 'group');
  const allGroupFinished = groupMatches.length > 0 &&
    groupMatches.every(m => m.status === 'finished');

  let officialAdvancing = null;
  if (allGroupFinished) {
    console.log('Group stage complete — computing official advancing 32…');
    const { data: teamRows } = await supabase.from('teams').select('*');
    const teamsByGroup = {};
    for (const t of teamRows || []) {
      if (!t.group_letter) continue;
      if (!teamsByGroup[t.group_letter]) teamsByGroup[t.group_letter] = [];
      teamsByGroup[t.group_letter].push(t.code);
    }
    const standings = computeStandings({
      matches: groupMatches.map((m) => ({
        ...m,
        stage: m.stage,
        group: m.group_letter,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        homeScore: m.home_score,
        awayScore: m.away_score
      })),
      teamsByGroup
    });
    officialAdvancing = Array.from(standings.advancing);
  }

  // 5b. Finalists
  const finalMatch = (matchRowsAll || []).find(m => m.stage === 'final');
  const officialFinalists = finalMatch && finalMatch.home_team && finalMatch.away_team
    ? [finalMatch.home_team, finalMatch.away_team]
    : null;

  // Per-team boost from championship outrights.
  const tournamentOdds = cfgRow.tournament_odds || championOdds || {};
  const teamBoosts = rankBoostsFromChampionOdds(tournamentOdds);

  // 5c. Awards + poll from config.results
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

  // ---------------- 6. Tournament-long scoring ----------------
  console.log('Scoring tournament-long predictions…');
  const [{ data: advRows }, { data: finRows }, { data: awdRows }, { data: pollRows }, { data: extraRows }, { data: playerRows }] =
    await Promise.all([
      supabase.from('advancement_predictions').select('*'),
      supabase.from('finals_predictions').select('*'),
      supabase.from('award_predictions').select('*'),
      supabase.from('poll_predictions').select('*'),
      supabase.from('extra_predictions').select('*'),
      supabase.from('players').select('*')
    ]);

  const advByPlayer  = byId(advRows);
  const finByPlayer  = byId(finRows);
  const awdByPlayer  = byId(awdRows);
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
      advancement = scoreAdvancement(advByPlayer[pid].teams, officialAdvancing, teamBoosts);
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
      const camelPred = {
        darkHorse: pollByPlayer[pid].dark_horse,
        disappointment: pollByPlayer[pid].disappointment
      };
      poll = scorePoll(camelPred, pollActual);
      if (pollByPlayer[pid].points !== poll) {
        pollUpdates.push({ ...pollByPlayer[pid], points: poll });
      }
    }

    // Extras (8 side bets)
    let extras = 0;
    if (extraByPlayer[pid]) {
      const er = extraByPlayer[pid];
      const camelPred = {
        champion:        er.champion,
        firstGoalBrazil: er.first_goal_brazil,
        lastGoalBrazil:  er.last_goal_brazil,
        hundredthGoal:   er.hundredth_goal,
        totalGoalsWC:    er.total_goals_wc,
        neymarGA:        er.neymar_ga,
        topScorerGoals:  er.top_scorer_goals,
        mbappeRecord:    er.mbappe_record
      };
      const extrasActual = {
        champion:        results.champion,
        firstGoalBrazil: results.firstGoalBrazil,
        lastGoalBrazil:  results.lastGoalBrazil,
        hundredthGoal:   results.hundredthGoal,
        totalGoalsWC:    results.totalGoalsWC,
        neymarGA:        results.neymarGA,
        topScorerGoals:  results.topScorerGoals,
        mbappeRecord:    results.mbappeRecord
      };
      extras = scoreExtras(camelPred, extrasActual, teamBoosts);
      if (er.points !== extras) {
        extraUpdates.push({ ...er, points: extras });
      }
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

  // Flush updates (only fields touched, via upsert).
  await flushUpdates(supabase, 'advancement_predictions', advUpdates, 'player_id');
  await flushUpdates(supabase, 'finals_predictions',      finUpdates, 'player_id');
  await flushUpdates(supabase, 'award_predictions',       awdUpdates, 'player_id');
  await flushUpdates(supabase, 'poll_predictions',        pollUpdates, 'player_id');
  await flushUpdates(supabase, 'extra_predictions',       extraUpdates, 'player_id');

  // Players: update each individually (only writing points + stats).
  for (const p of playerUpdates) {
    const { error } = await supabase
      .from('players')
      .update({ points: p.points, stats: p.stats })
      .eq('id', p.id);
    if (error) console.error(`update player ${p.id}:`, error.message);
  }

  console.log('Done.');
}

function byId(rows) {
  const m = {};
  for (const r of rows || []) m[r.player_id] = r;
  return m;
}

async function flushUpdates(supabase, table, rows, onConflict) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) console.error(`flush ${table}:`, error.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
