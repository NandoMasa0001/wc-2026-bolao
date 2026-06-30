/**
 * footballApi.js — adapter around football-data.org's free tier.
 *
 * Provides `fetchTeamsAndMatches({ apiKey, competition })` returning data in
 * our app's shape. Wrap the upstream API here so the rest of the codebase
 * can be swapped to a different provider without ripple changes.
 *
 * Endpoints used (v4):
 *   GET /v4/competitions/{code}/teams    → 48 teams
 *   GET /v4/competitions/{code}/matches  → all matches (group + knockout)
 *
 * @typedef {Object} ApiAdapterTeam
 * @property {string} code      3-letter FIFA code (e.g. "BRA")
 * @property {string} name
 * @property {string} group     "A".."L" or null
 * @property {string} flagUrl
 *
 * @typedef {Object} ApiAdapterMatch
 * @property {string} id        deterministic id ("API-<n>")
 * @property {number} apiId     upstream match id
 * @property {string} stage     group|r32|r16|qf|sf|third|final
 * @property {?string} group    "A".."L" or null
 * @property {number} matchday
 * @property {?string} homeTeam
 * @property {?string} awayTeam
 * @property {?string} homePlaceholder
 * @property {?string} awayPlaceholder
 * @property {string} kickoffAt  ISO string
 * @property {"scheduled"|"live"|"finished"} status
 * @property {?number} homeScore
 * @property {?number} awayScore
 * @property {?string} winner   knockout only
 */

const API_BASE = 'https://api.football-data.org/v4';

/** Map football-data.org stage strings to our short keys. */
const STAGE_MAP = {
  GROUP_STAGE:           'group',
  LAST_32:               'r32',
  ROUND_OF_32:           'r32',
  LAST_16:               'r16',
  ROUND_OF_16:           'r16',
  QUARTER_FINALS:        'qf',
  SEMI_FINALS:           'sf',
  THIRD_PLACE:           'third',
  PLAYOFFS:              'third',
  FINAL:                 'final'
};

/** Map upstream match status to ours. */
function mapStatus(s) {
  if (s === 'FINISHED' || s === 'AWARDED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED' || s === 'LIVE') return 'live';
  return 'scheduled';
}

/**
 * Internal helper to call the football-data.org API.
 * `fetchImpl` is injected so tests / scripts can substitute it.
 */
async function call(path, { apiKey, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': apiKey }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Fetch teams and convert into our shape.
 */
export async function fetchTeams({ apiKey, competition = 'WC', fetchImpl }) {
  const data = await call(`/competitions/${competition}/teams`, { apiKey, fetchImpl });
  const teams = (data.teams || []).map((t) => ({
    code: t.tla || t.shortName?.slice(0, 3).toUpperCase() || t.name?.slice(0, 3).toUpperCase(),
    name: t.name,
    group: null, // will be filled from match group assignments
    flagUrl: t.crest || t.crestUrl || null
  }));
  return teams;
}

/**
 * Fetch all matches and convert into our shape.
 * The `teams` map is used to deduce home/away codes from the upstream payload.
 */
export async function fetchMatches({ apiKey, competition = 'WC', teamsByApiId = {}, fetchImpl }) {
  const data = await call(`/competitions/${competition}/matches`, { apiKey, fetchImpl });
  const out = [];
  for (const m of data.matches || []) {
    const stage = STAGE_MAP[m.stage] || (m.stage || '').toLowerCase();

    // Penalty shootouts: football-data.org folds the shootout INTO `fullTime`
    // (a 1–1 decided on pens shows up as e.g. 3–4 = regularTime+extraTime+
    // penalties). We want the placar to be the 120-minute result only — the
    // shootout merely decides who advances (kept in `winner`). So for a
    // PENALTY_SHOOTOUT we use regularTime + extraTime (always a draw); for
    // everything else `fullTime` is already the right 90/120-min score.
    const sc = m.score || {};
    const isShootout = sc.duration === 'PENALTY_SHOOTOUT';
    const homeScore = isShootout
      ? (sc.regularTime?.home ?? 0) + (sc.extraTime?.home ?? 0)
      : (sc.fullTime?.home ?? null);
    const awayScore = isShootout
      ? (sc.regularTime?.away ?? 0) + (sc.extraTime?.away ?? 0)
      : (sc.fullTime?.away ?? null);

    out.push({
      id: `API-${m.id}`,
      apiId: m.id,
      stage,
      group: m.group ? m.group.replace('GROUP_', '') : null,
      matchday: m.matchday ?? 0,
      homeTeam: lookupCode(m.homeTeam, teamsByApiId),
      awayTeam: lookupCode(m.awayTeam, teamsByApiId),
      homePlaceholder: m.homeTeam?.name && !m.homeTeam?.id ? m.homeTeam.name : null,
      awayPlaceholder: m.awayTeam?.name && !m.awayTeam?.id ? m.awayTeam.name : null,
      kickoffAt: m.utcDate,
      status: mapStatus(m.status),
      homeScore,
      awayScore,
      winner: m.score?.winner === 'HOME_TEAM'
        ? lookupCode(m.homeTeam, teamsByApiId)
        : m.score?.winner === 'AWAY_TEAM'
        ? lookupCode(m.awayTeam, teamsByApiId)
        : null
    });
  }
  return out;
}

// Some country codes that the football-data API returns differ from what
// we seeded into our teams table (we used ISO 3166-1 alpha-3 for a few,
// the API uses FIFA TLAs). Map API → DB to avoid FK violations when the
// API populates R32+ slots after groups end.
const API_CODE_FIXUPS = {
  URU: 'URY' // Uruguay: API says URU, we have URY
};

function lookupCode(apiTeam, teamsByApiId) {
  if (!apiTeam || apiTeam.id == null) return null;
  const raw = teamsByApiId[apiTeam.id]?.code
    || apiTeam.tla
    || apiTeam.shortName?.slice(0, 3).toUpperCase()
    || apiTeam.name?.slice(0, 3).toUpperCase()
    || null;
  return raw && API_CODE_FIXUPS[raw] ? API_CODE_FIXUPS[raw] : raw;
}

/**
 * One-shot helper: fetch teams + matches together and reconcile groups.
 */
export async function fetchTeamsAndMatches({ apiKey, competition = 'WC', fetchImpl }) {
  // Teams first — needs to be done before matches so we have an apiId→code map.
  // The /teams endpoint doesn't include apiId? It does — under the `id` field.
  const teamsPayload = await call(`/competitions/${competition}/teams`, { apiKey, fetchImpl });
  const teamsByApiId = {};
  const teams = (teamsPayload.teams || []).map((t) => {
    const code = t.tla || t.shortName?.slice(0, 3).toUpperCase() || t.name?.slice(0, 3).toUpperCase();
    const entry = {
      apiId: t.id,
      code,
      name: t.name,
      group: null,
      flagUrl: t.crest || t.crestUrl || null
    };
    teamsByApiId[t.id] = entry;
    return entry;
  });

  const matches = await fetchMatches({ apiKey, competition, teamsByApiId, fetchImpl });

  // Backfill team.group from group-stage matches.
  for (const m of matches) {
    if (m.stage !== 'group' || !m.group) continue;
    for (const code of [m.homeTeam, m.awayTeam]) {
      if (!code) continue;
      const team = teams.find(t => t.code === code);
      if (team && !team.group) team.group = m.group;
    }
  }

  // Drop apiId from returned teams — it's an internal join key.
  return {
    teams: teams.map(({ apiId, ...rest }) => rest), // eslint-disable-line no-unused-vars
    matches
  };
}
