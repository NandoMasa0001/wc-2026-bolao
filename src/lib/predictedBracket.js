/**
 * predictedBracket.js — full FIFA 2026 knockout bracket (R32 → Final),
 * filled with the player's predicted advancing teams AND propagated
 * through each round using the player's predicted knockout scores.
 *
 * If a player hasn't predicted a knockout match (or predicted a tie),
 * the downstream slot stays null and we display a placeholder.
 *
 * Source: FIFA 2026 fixture list (matches 73 → 104).
 */

/** Bracket structure — 32 matches total. */
const BRACKET = [
  // ---------------- Round of 32 (M73 → M88) ----------------
  { id: 'M73', stage: 'r32', home: { type: 'groupPos', group: 'A', pos: 2 }, away: { type: 'groupPos', group: 'B', pos: 2 } },
  { id: 'M74', stage: 'r32', home: { type: 'groupPos', group: 'E', pos: 1 }, away: { type: 'best3rd', from: ['A','B','C','D','F'] } },
  { id: 'M75', stage: 'r32', home: { type: 'groupPos', group: 'F', pos: 1 }, away: { type: 'groupPos', group: 'C', pos: 2 } },
  { id: 'M76', stage: 'r32', home: { type: 'groupPos', group: 'C', pos: 1 }, away: { type: 'groupPos', group: 'F', pos: 2 } },
  { id: 'M77', stage: 'r32', home: { type: 'groupPos', group: 'I', pos: 1 }, away: { type: 'best3rd', from: ['C','D','F','G','H'] } },
  { id: 'M78', stage: 'r32', home: { type: 'groupPos', group: 'E', pos: 2 }, away: { type: 'groupPos', group: 'I', pos: 2 } },
  { id: 'M79', stage: 'r32', home: { type: 'groupPos', group: 'A', pos: 1 }, away: { type: 'best3rd', from: ['C','E','F','H','I'] } },
  { id: 'M80', stage: 'r32', home: { type: 'groupPos', group: 'L', pos: 1 }, away: { type: 'best3rd', from: ['E','H','I','J','K'] } },
  { id: 'M81', stage: 'r32', home: { type: 'groupPos', group: 'D', pos: 1 }, away: { type: 'best3rd', from: ['B','E','F','I','J'] } },
  { id: 'M82', stage: 'r32', home: { type: 'groupPos', group: 'G', pos: 1 }, away: { type: 'best3rd', from: ['A','E','H','I','J'] } },
  { id: 'M83', stage: 'r32', home: { type: 'groupPos', group: 'K', pos: 2 }, away: { type: 'groupPos', group: 'L', pos: 2 } },
  { id: 'M84', stage: 'r32', home: { type: 'groupPos', group: 'H', pos: 1 }, away: { type: 'groupPos', group: 'J', pos: 2 } },
  { id: 'M85', stage: 'r32', home: { type: 'groupPos', group: 'B', pos: 1 }, away: { type: 'best3rd', from: ['E','F','G','I','J'] } },
  { id: 'M86', stage: 'r32', home: { type: 'groupPos', group: 'J', pos: 1 }, away: { type: 'groupPos', group: 'H', pos: 2 } },
  { id: 'M87', stage: 'r32', home: { type: 'groupPos', group: 'K', pos: 1 }, away: { type: 'best3rd', from: ['D','E','I','J','L'] } },
  { id: 'M88', stage: 'r32', home: { type: 'groupPos', group: 'D', pos: 2 }, away: { type: 'groupPos', group: 'G', pos: 2 } },

  // ---------------- Round of 16 (M89 → M96) ----------------
  { id: 'M89', stage: 'r16', home: { type: 'winnerOf', match: 'M74' }, away: { type: 'winnerOf', match: 'M77' } },
  { id: 'M90', stage: 'r16', home: { type: 'winnerOf', match: 'M73' }, away: { type: 'winnerOf', match: 'M75' } },
  { id: 'M91', stage: 'r16', home: { type: 'winnerOf', match: 'M76' }, away: { type: 'winnerOf', match: 'M78' } },
  { id: 'M92', stage: 'r16', home: { type: 'winnerOf', match: 'M79' }, away: { type: 'winnerOf', match: 'M80' } },
  { id: 'M93', stage: 'r16', home: { type: 'winnerOf', match: 'M83' }, away: { type: 'winnerOf', match: 'M84' } },
  { id: 'M94', stage: 'r16', home: { type: 'winnerOf', match: 'M81' }, away: { type: 'winnerOf', match: 'M82' } },
  { id: 'M95', stage: 'r16', home: { type: 'winnerOf', match: 'M86' }, away: { type: 'winnerOf', match: 'M88' } },
  { id: 'M96', stage: 'r16', home: { type: 'winnerOf', match: 'M85' }, away: { type: 'winnerOf', match: 'M87' } },

  // ---------------- Quarter-finals (M97 → M100) ----------------
  { id: 'M97',  stage: 'qf', home: { type: 'winnerOf', match: 'M89' }, away: { type: 'winnerOf', match: 'M90' } },
  { id: 'M98',  stage: 'qf', home: { type: 'winnerOf', match: 'M93' }, away: { type: 'winnerOf', match: 'M94' } },
  { id: 'M99',  stage: 'qf', home: { type: 'winnerOf', match: 'M91' }, away: { type: 'winnerOf', match: 'M92' } },
  { id: 'M100', stage: 'qf', home: { type: 'winnerOf', match: 'M95' }, away: { type: 'winnerOf', match: 'M96' } },

  // ---------------- Semi-finals (M101 → M102) ----------------
  { id: 'M101', stage: 'sf', home: { type: 'winnerOf', match: 'M97' }, away: { type: 'winnerOf', match: 'M98' } },
  { id: 'M102', stage: 'sf', home: { type: 'winnerOf', match: 'M99' }, away: { type: 'winnerOf', match: 'M100' } },

  // ---------------- Bronze final (M103) ----------------
  { id: 'M103', stage: 'third', home: { type: 'loserOf', match: 'M101' }, away: { type: 'loserOf', match: 'M102' } },

  // ---------------- Final (M104) ----------------
  { id: 'M104', stage: 'final', home: { type: 'winnerOf', match: 'M101' }, away: { type: 'winnerOf', match: 'M102' } }
];

/* ============== Best-3rd assignment ============== */

function assignBest3rds(groupsAvailable, slots) {
  if (groupsAvailable.length !== slots.length) return null;
  const result = {};
  const used = new Set();
  function go(i) {
    if (i === slots.length) return true;
    const slot = slots[i];
    for (const g of groupsAvailable) {
      if (used.has(g) || !slot.allowed.has(g)) continue;
      result[slot.id] = g;
      used.add(g);
      if (go(i + 1)) return true;
      delete result[slot.id];
      used.delete(g);
    }
    return false;
  }
  return go(0) ? result : null;
}

/* ============== FIFA ↔ DB id map ============== */

const FIFA_START = { r32: 73, r16: 89, qf: 97, sf: 101, third: 103, final: 104 };

function buildFifaToDbMap(matches) {
  const out = {};
  for (const stage of Object.keys(FIFA_START)) {
    const inStage = matches
      .filter(m => m.stage === stage)
      .sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt));
    for (let i = 0; i < inStage.length; i++) {
      out[`M${FIFA_START[stage] + i}`] = inStage[i].id;
    }
  }
  return out;
}

/* ============== Build the full bracket ============== */

/**
 * @param {object} args
 * @param {object} args.standings — output of computeStandings(...)
 * @param {Array}  args.matches   — all matches with stage, id, kickoffAt,
 *                                  status, homeScore, awayScore (real
 *                                  results, populated by the cron).
 *
 * Knockout matches are NOT player-predictable — this bracket is purely
 * a visualization that fills R16+ slots from the *actual* results of
 * earlier rounds as they finish. Before any knockout has played, only
 * R32 has its teams filled (from the player's group-stage predictions).
 *
 * Returns the 32 bracket entries, each with:
 *   { id, stage, home, away, homeLabel, awayLabel, winner, loser,
 *     actualScore: { homeScore, awayScore } | null,
 *     status: 'scheduled' | 'live' | 'finished' | null,
 *     dbMatchId: string | null }
 */
export function buildFullBracket({ standings, matches }) {
  if (!standings || !standings.groups) return [];

  // 1. Best-3rds (top 8) and groups.
  const top8Thirds = (standings.bestThirds || [])
    .filter(t => standings.advancing?.has(t.team))
    .slice(0, 8);
  const thirdByGroup = {};
  for (const t of top8Thirds) {
    if (t.group) thirdByGroup[t.group] = t.team;
  }

  // 2. Solve best-3rd slot assignment.
  const best3rdSlots = BRACKET
    .filter(m => m.home.type === 'best3rd' || m.away.type === 'best3rd')
    .map(m => {
      const slot = m.away.type === 'best3rd' ? m.away : m.home;
      return { id: m.id, allowed: new Set(slot.from) };
    });
  const best3rdAssignment =
    assignBest3rds(Object.keys(thirdByGroup), best3rdSlots) || {};

  // 3. FIFA → DB id map + lookup by DB id.
  const fifaToDb = buildFifaToDbMap(matches);
  const dbMatchById = {};
  for (const m of matches) dbMatchById[m.id] = m;

  // 4. Resolve matches recursively, caching.
  const resolved = {};

  function resolveSide(spec, fifaId) {
    if (spec.type === 'groupPos') {
      const row = standings.groups[spec.group]?.[spec.pos - 1];
      return { team: row?.team || null, label: `${spec.pos}${spec.group}` };
    }
    if (spec.type === 'best3rd') {
      const g = best3rdAssignment[fifaId];
      return {
        team: g ? thirdByGroup[g] : null,
        label: g ? `3${g}` : '3º'
      };
    }
    if (spec.type === 'winnerOf') {
      const r = resolveMatch(spec.match);
      return { team: r.winner, label: r.winner ? null : `W ${spec.match}` };
    }
    if (spec.type === 'loserOf') {
      const r = resolveMatch(spec.match);
      return { team: r.loser, label: r.loser ? null : `L ${spec.match}` };
    }
    return { team: null, label: '?' };
  }

  function resolveMatch(fifaId) {
    if (resolved[fifaId]) return resolved[fifaId];
    const m = BRACKET.find(x => x.id === fifaId);
    const home = resolveSide(m.home, fifaId);
    const away = resolveSide(m.away, fifaId);
    const dbMatchId = fifaToDb[fifaId] || null;
    const dbMatch = dbMatchId ? dbMatchById[dbMatchId] : null;

    // Winners come from REAL results once the match finishes. Until
    // then, downstream slots stay null (we render placeholders).
    let winner = null, loser = null;
    let actualScore = null;
    let status = dbMatch?.status || null;
    if (dbMatch && dbMatch.status === 'finished' &&
        dbMatch.homeScore != null && dbMatch.awayScore != null) {
      actualScore = { homeScore: dbMatch.homeScore, awayScore: dbMatch.awayScore };
      // Knockout matches can't end in a tie in real life; if the API
      // reports one, fall back to dbMatch.winner if present.
      if (dbMatch.homeScore > dbMatch.awayScore) {
        winner = home.team; loser = away.team;
      } else if (dbMatch.awayScore > dbMatch.homeScore) {
        winner = away.team; loser = home.team;
      } else if (dbMatch.winner) {
        winner = dbMatch.winner;
        loser = dbMatch.winner === home.team ? away.team : home.team;
      }
    }

    resolved[fifaId] = {
      id: fifaId,
      stage: m.stage,
      home: home.team,
      away: away.team,
      homeLabel: home.label,
      awayLabel: away.label,
      winner,
      loser,
      actualScore,
      status,
      dbMatchId
    };
    return resolved[fifaId];
  }

  return BRACKET.map(m => resolveMatch(m.id));
}

/* ============== Column layout for the tree view ============== */

/**
 * Reshape the bracket into the column-by-column layout used by the
 * tree visualisation (5 columns per side + center Final/3rd).
 *
 * Returns:
 *   {
 *     left:   [ col1 (16), col2 (8), col3 (4), col4 (2), col5 (1) ],
 *     right:  [ col1 (16), col2 (8), col3 (4), col4 (2), col5 (1) ],
 *     final:  { id, home, away, winner, ... } | null,
 *     third:  { id, home, away, winner, ... } | null
 *   }
 *
 * Each column entry is `{ team: code|null, label: string }`.
 *
 * The ordering within each column follows the FIFA bracket so that
 * adjacent pairs in column N collapse into single entries at the
 * matching mid-position in column N+1 (perfect alignment with CSS
 * `justify-content: space-around`).
 */
export function buildBracketColumns(bracket) {
  const byId = Object.fromEntries(bracket.map(m => [m.id, m]));

  // R32 vertical order. Pairs adjacent matches whose winners meet in R16.
  const LEFT_R32  = ['M74','M77','M73','M75','M83','M84','M81','M82'];
  const RIGHT_R32 = ['M76','M78','M79','M80','M86','M88','M85','M87'];

  const LEFT_R16  = ['M89','M90','M93','M94'];
  const RIGHT_R16 = ['M91','M92','M95','M96'];

  const LEFT_QF   = ['M97','M98'];
  const RIGHT_QF  = ['M99','M100'];

  const teamSlot = (code, label) => ({ team: code || null, label });
  const winnerSlot = (mId) => teamSlot(byId[mId]?.winner, mId);

  const teamsCol = (r32Ids) => {
    const out = [];
    for (const mId of r32Ids) {
      const m = byId[mId];
      out.push(teamSlot(m.home, m.homeLabel));
      out.push(teamSlot(m.away, m.awayLabel));
    }
    return out;
  };

  return {
    left: [
      teamsCol(LEFT_R32),
      LEFT_R32.map(winnerSlot),
      LEFT_R16.map(winnerSlot),
      LEFT_QF.map(winnerSlot),
      [winnerSlot('M101')]
    ],
    right: [
      teamsCol(RIGHT_R32),
      RIGHT_R32.map(winnerSlot),
      RIGHT_R16.map(winnerSlot),
      RIGHT_QF.map(winnerSlot),
      [winnerSlot('M102')]
    ],
    final: byId['M104'] || null,
    third: byId['M103'] || null
  };
}

