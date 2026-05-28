/**
 * predictedBracket.js — build the official FIFA 2026 Round-of-32 bracket
 * filled in with a player's predicted group standings.
 *
 * The 16 R32 matchups below are taken straight from the FIFA fixture list
 * for the 2026 World Cup. 8 of them include a "Best 3rd from {…}" slot —
 * which specific best-3rd team goes into which slot is determined by FIFA
 * via a lookup table over the possible combinations of qualifying groups.
 *
 * We solve it via backtracking: for each combination of 8 best-3rd groups,
 * find an assignment that satisfies every "from" constraint. This produces
 * a valid bracket — not necessarily identical to FIFA's official one for
 * borderline cases, but always feasible.
 */

/** The 16 R32 matchups, in FIFA's match-number order (73 → 88). */
const R32_STRUCTURE = [
  { id: 'M73', home: { type: 'runnerUp', group: 'A' },  away: { type: 'runnerUp', group: 'B' } },
  { id: 'M74', home: { type: 'winner',   group: 'E' },  away: { type: 'best3rd', from: ['A','B','C','D','F'] } },
  { id: 'M75', home: { type: 'winner',   group: 'F' },  away: { type: 'runnerUp', group: 'C' } },
  { id: 'M76', home: { type: 'winner',   group: 'C' },  away: { type: 'runnerUp', group: 'F' } },
  { id: 'M77', home: { type: 'winner',   group: 'I' },  away: { type: 'best3rd', from: ['C','D','F','G','H'] } },
  { id: 'M78', home: { type: 'runnerUp', group: 'E' },  away: { type: 'runnerUp', group: 'I' } },
  { id: 'M79', home: { type: 'winner',   group: 'A' },  away: { type: 'best3rd', from: ['C','E','F','H','I'] } },
  { id: 'M80', home: { type: 'winner',   group: 'L' },  away: { type: 'best3rd', from: ['E','H','I','J','K'] } },
  { id: 'M81', home: { type: 'winner',   group: 'D' },  away: { type: 'best3rd', from: ['B','E','F','I','J'] } },
  { id: 'M82', home: { type: 'winner',   group: 'G' },  away: { type: 'best3rd', from: ['A','E','H','I','J'] } },
  { id: 'M83', home: { type: 'runnerUp', group: 'K' },  away: { type: 'runnerUp', group: 'L' } },
  { id: 'M84', home: { type: 'winner',   group: 'H' },  away: { type: 'runnerUp', group: 'J' } },
  { id: 'M85', home: { type: 'winner',   group: 'B' },  away: { type: 'best3rd', from: ['E','F','G','I','J'] } },
  { id: 'M86', home: { type: 'winner',   group: 'J' },  away: { type: 'runnerUp', group: 'H' } },
  { id: 'M87', home: { type: 'winner',   group: 'K' },  away: { type: 'best3rd', from: ['D','E','I','J','L'] } },
  { id: 'M88', home: { type: 'runnerUp', group: 'D' },  away: { type: 'runnerUp', group: 'G' } }
];

/**
 * Given the 8 best-3rd groups, assign each to one of the 8 R32 slots that
 * accept best-3rds, respecting each slot's "from" constraint. Uses simple
 * backtracking. Returns `{ slotId: groupLetter }` or null if no
 * assignment exists.
 */
function assignBest3rds(best3rdGroups, slotsWithConstraints) {
  if (best3rdGroups.length !== slotsWithConstraints.length) return null;

  const result = {};
  const usedGroups = new Set();

  function backtrack(slotIdx) {
    if (slotIdx === slotsWithConstraints.length) return true;
    const slot = slotsWithConstraints[slotIdx];
    for (const g of best3rdGroups) {
      if (usedGroups.has(g)) continue;
      if (!slot.allowed.has(g)) continue;
      result[slot.id] = g;
      usedGroups.add(g);
      if (backtrack(slotIdx + 1)) return true;
      delete result[slot.id];
      usedGroups.delete(g);
    }
    return false;
  }

  return backtrack(0) ? result : null;
}

/**
 * Build the 16-match R32 preview.
 *
 * @param {object} standings — output of computeStandings(...)
 * @returns {Array} 16 match objects:
 *   { id, label, home: teamCode|null, away: teamCode|null,
 *     labelHome: '1A'|'2B'|'3X', labelAway: '...' }
 */
export function buildPredictedR32(standings) {
  if (!standings || !standings.groups) return [];

  // Pre-compute the best-3rds (top 8) by group letter.
  const top8Thirds = (standings.bestThirds || [])
    .filter(t => standings.advancing?.has(t.team))
    .slice(0, 8);
  const thirdByGroup = {};
  for (const t of top8Thirds) {
    if (t.group) thirdByGroup[t.group] = t.team;
  }

  // Collect the best-3rd slots and try to assign groups.
  const best3rdSlots = R32_STRUCTURE
    .filter(m => m.away.type === 'best3rd' || m.home.type === 'best3rd')
    .map(m => {
      const slot = m.away.type === 'best3rd' ? m.away : m.home;
      return { id: m.id, allowed: new Set(slot.from) };
    });

  const assignment = assignBest3rds(Object.keys(thirdByGroup), best3rdSlots) || {};

  // Resolve a side spec → { team, label }.
  function resolveSide(spec, matchId) {
    if (spec.type === 'winner') {
      const row = standings.groups[spec.group]?.[0];
      return { team: row?.team || null, label: `1${spec.group}` };
    }
    if (spec.type === 'runnerUp') {
      const row = standings.groups[spec.group]?.[1];
      return { team: row?.team || null, label: `2${spec.group}` };
    }
    // best3rd
    const g = assignment[matchId];
    return {
      team: g ? thirdByGroup[g] : null,
      label: g ? `3${g}` : `3º {${spec.from.join('/')}}`
    };
  }

  return R32_STRUCTURE.map(m => {
    const h = resolveSide(m.home, m.id);
    const a = resolveSide(m.away, m.id);
    return {
      id: m.id,
      label: m.id, // "M73", "M74", …
      home: h.team,
      away: a.team,
      labelHome: h.label,
      labelAway: a.label
    };
  });
}
