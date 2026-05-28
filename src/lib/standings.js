/**
 * standings.js — pure functions to derive group standings + the 32 advancing
 * teams from a set of group matches (predicted or actual).
 *
 * Used both for the live /standings page (real results) and for the
 * derived-advancement flow on /predictions (player's predicted scores).
 *
 * See CLAUDE.md §6.2.
 */

function emptyRow(team) {
  return {
    team,
    played: 0, won: 0, drawn: 0, lost: 0,
    gf: 0, ga: 0, gd: 0, pts: 0
  };
}

function applyMatch(row, gf, ga) {
  row.played += 1;
  row.gf += gf;
  row.ga += ga;
  row.gd = row.gf - row.ga;
  if (gf > ga) { row.won += 1; row.pts += 3; }
  else if (gf === ga) { row.drawn += 1; row.pts += 1; }
  else { row.lost += 1; }
}

/**
 * Build per-group standings rows from a list of group matches.
 * `matches` items must have: group, homeTeam, awayTeam, homeScore, awayScore.
 * Items with null scores are skipped (treated as not yet played).
 *
 * `teamsByGroup` is { [groupKey]: ["BRA","ARG", ...] } so empty rows still
 * appear for teams that haven't played yet.
 */
function buildRowsByGroup(matches, teamsByGroup) {
  const rows = {};
  for (const group of Object.keys(teamsByGroup)) {
    rows[group] = {};
    for (const code of teamsByGroup[group]) {
      rows[group][code] = emptyRow(code);
    }
  }
  for (const m of matches) {
    if (m.stage !== 'group') continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    const g = m.group;
    if (!rows[g]) continue;
    if (!rows[g][m.homeTeam] || !rows[g][m.awayTeam]) continue;
    applyMatch(rows[g][m.homeTeam], m.homeScore, m.awayScore);
    applyMatch(rows[g][m.awayTeam], m.awayScore, m.homeScore);
  }
  return rows;
}

/**
 * FIFA tiebreaker comparator for teams *within the same group*.
 * Order: 1) Points, 2) GD, 3) GF, 4) Head-to-head pts/GD/GF among tied teams,
 * 5) Fair-play/lots — not predictable, fall back to alphabetical and flag tied.
 */
function compareGroupRows(a, b, allMatches, tiedTeams) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;

  // Head-to-head only among the currently-tied subset.
  if (tiedTeams && tiedTeams.size > 1 && tiedTeams.has(a.team) && tiedTeams.has(b.team)) {
    const h2h = computeHeadToHead(allMatches, tiedTeams);
    const ra = h2h[a.team];
    const rb = h2h[b.team];
    if (ra && rb) {
      if (rb.pts !== ra.pts) return rb.pts - ra.pts;
      if (rb.gd !== ra.gd) return rb.gd - ra.gd;
      if (rb.gf !== ra.gf) return rb.gf - ra.gf;
    }
  }
  // Fallback: alphabetical (not predictable in real life).
  return a.team < b.team ? -1 : a.team > b.team ? 1 : 0;
}

function computeHeadToHead(matches, teamSet) {
  const rows = {};
  for (const t of teamSet) rows[t] = emptyRow(t);
  for (const m of matches) {
    if (m.stage !== 'group') continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    if (!teamSet.has(m.homeTeam) || !teamSet.has(m.awayTeam)) continue;
    applyMatch(rows[m.homeTeam], m.homeScore, m.awayScore);
    applyMatch(rows[m.awayTeam], m.awayScore, m.homeScore);
  }
  return rows;
}

/**
 * Find groups of teams with identical pts/gd/gf so we can flag visible ties
 * and apply head-to-head only to those subsets.
 */
function findTiedClusters(sortedRows) {
  const clusters = [];
  let current = [];
  let last = null;
  for (const row of sortedRows) {
    if (
      last &&
      last.pts === row.pts &&
      last.gd === row.gd &&
      last.gf === row.gf
    ) {
      current.push(row);
    } else {
      if (current.length > 1) clusters.push(current);
      current = [row];
    }
    last = row;
  }
  if (current.length > 1) clusters.push(current);
  return clusters;
}

/**
 * Sort one group's rows. Returns an array of rows in finishing order with
 * `tied: true` set on any row that is in a tie cluster that the primary
 * criteria couldn't break (so the UI can show "tied / lots" warnings).
 */
function sortGroup(rows, matches) {
  const arr = Object.values(rows);

  // First pass: by primary criteria.
  arr.sort((a, b) => compareGroupRows(a, b, matches, null));

  // Identify clusters tied on pts/gd/gf, then resort within each via h2h.
  const clusters = findTiedClusters(arr);
  for (const cluster of clusters) {
    const set = new Set(cluster.map(r => r.team));
    cluster.sort((a, b) => compareGroupRows(a, b, matches, set));

    // After head-to-head, check whether the cluster is still tied at the end.
    // We flag any row that remains identical to its neighbour after h2h.
    const h2h = computeHeadToHead(matches, set);
    for (let i = 0; i < cluster.length - 1; i++) {
      const a = cluster[i];
      const b = cluster[i + 1];
      const ra = h2h[a.team] || emptyRow(a.team);
      const rb = h2h[b.team] || emptyRow(b.team);
      const tiedH2H =
        ra.pts === rb.pts && ra.gd === rb.gd && ra.gf === rb.gf;
      if (tiedH2H) {
        a.tied = true;
        b.tied = true;
      }
    }
    // Reinsert in the original array order.
    let idx = arr.findIndex(r => set.has(r.team));
    for (const c of cluster) {
      arr[idx++] = c;
    }
  }

  return arr.map((row, i) => ({ ...row, position: i + 1 }));
}

/**
 * Compute standings for every group + the 32 advancing teams.
 *
 * @param {Object} args
 * @param {Array}  args.matches      All group-stage matches with scores
 *                                   (predicted or actual). Items without
 *                                   scores are skipped.
 * @param {Object} args.teamsByGroup { A: ["BRA","ARG", ...], B: [...], ... }
 * @returns {Object} {
 *   groups: { A: [row, row, row, row], ... },
 *   advancing: Set<string> of teamCodes (top 2 of each + 8 best 3rds),
 *   bestThirds: row[],          // ordered ranking of all third-placed teams
 *   missingMatches: number      // group matches still without scores
 * }
 */
export function computeStandings({ matches, teamsByGroup }) {
  const rowsByGroup = buildRowsByGroup(matches, teamsByGroup);
  const groups = {};
  const groupKeys = Object.keys(teamsByGroup).sort();

  for (const g of groupKeys) {
    groups[g] = sortGroup(rowsByGroup[g], matches);
  }

  // Best-third ranking across all groups, by pts → gd → gf → alpha.
  // Carry the group letter through so downstream code (e.g. the bracket)
  // can map a third-placed team back to its group of origin.
  const thirds = groupKeys
    .map(g => groups[g][2] ? { ...groups[g][2], group: g } : null)
    .filter(Boolean);

  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team < b.team ? -1 : a.team > b.team ? 1 : 0;
  });

  // 12 groups → top 8 thirds advance. With fewer mock groups we still take
  // up to ceil(N*2/3) thirds, but the production rule is "8 best thirds".
  const ADVANCING_THIRDS = Math.min(8, thirds.length);
  const advancing = new Set();
  for (const g of groupKeys) {
    if (groups[g][0]) advancing.add(groups[g][0].team);
    if (groups[g][1]) advancing.add(groups[g][1].team);
  }
  for (let i = 0; i < ADVANCING_THIRDS; i++) {
    if (thirds[i]) advancing.add(thirds[i].team);
  }

  // How many group matches are still missing scores?
  let missingMatches = 0;
  for (const m of matches) {
    if (m.stage !== 'group') continue;
    if (m.homeScore == null || m.awayScore == null) missingMatches += 1;
  }

  return { groups, advancing, bestThirds: thirds, missingMatches };
}

/**
 * Given a player's predictions Map ({ matchId -> {homeScore, awayScore} })
 * and the canonical list of group matches, build the same-shape input
 * `computeStandings` expects, but using the player's predicted scores.
 *
 * Matches with no prediction are dropped (treated as not yet played).
 */
export function predictedMatchesFromPlayer({ groupMatches, predictionsByMatchId }) {
  return groupMatches.map(m => {
    const p = predictionsByMatchId[m.id];
    if (!p) return { ...m, homeScore: null, awayScore: null };
    return { ...m, homeScore: p.homeScore, awayScore: p.awayScore };
  });
}
