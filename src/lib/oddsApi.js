/**
 * oddsApi.js — adapter around the-odds-api.com.
 *
 * Returns implied probabilities (not raw American/decimal odds) so the
 * scoring engine doesn't have to know about bookmaker conventions.
 *
 * Free tier: 500 requests/month. Each call below counts as ONE request.
 *
 * Endpoints used:
 *   GET /v4/sports/soccer_fifa_world_cup/odds         (h2h match odds)
 *   GET /v4/sports/soccer_fifa_world_cup_winner/odds  (outright champion)
 */

const API_BASE = 'https://api.the-odds-api.com/v4';

const DEFAULT_SPORT_H2H = 'soccer_fifa_world_cup';
const DEFAULT_SPORT_OUTRIGHT = 'soccer_fifa_world_cup_winner';

async function call(path, { apiKey, fetchImpl = fetch, params = {} }) {
  const qp = new URLSearchParams({ apiKey, ...params });
  const res = await fetchImpl(`${API_BASE}${path}?${qp}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`the-odds-api ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Decimal odds → implied probability with overround removed.
 * Sum of 1/decimal across outcomes typically > 1 because of the book's edge;
 * we divide by that sum so probabilities sum to 1.
 */
function normaliseToProbs(decimalOdds) {
  const raws = decimalOdds.map(d => (d > 0 ? 1 / d : 0));
  const sum = raws.reduce((s, v) => s + v, 0) || 1;
  return raws.map(p => p / sum);
}

/**
 * Average decimal odds across all bookmakers for a given outcome name.
 * `event.bookmakers[*].markets[*].outcomes[*].name` matches `outcomeName`.
 */
function avgOddsForOutcome(event, marketKey, outcomeName) {
  let sum = 0, n = 0;
  for (const bk of event.bookmakers || []) {
    for (const mk of bk.markets || []) {
      if (mk.key !== marketKey) continue;
      for (const out of mk.outcomes || []) {
        if (out.name === outcomeName && typeof out.price === 'number' && out.price > 0) {
          sum += out.price; n += 1;
        }
      }
    }
  }
  return n > 0 ? sum / n : null;
}

/**
 * Fetch H2H odds for every WC match. Returns an array of:
 *   { apiEventId, commenceTime, homeTeamName, awayTeamName,
 *     odds: { homeWin, draw, awayWin, bookmaker: 'consensus' } }
 *
 * The returned `homeTeamName` / `awayTeamName` are the names the-odds-api
 * gives; you'll need to map them to your FIFA-code teams via your seed.
 */
export async function fetchMatchOdds({ apiKey, sport = DEFAULT_SPORT_H2H, fetchImpl }) {
  const events = await call(`/sports/${sport}/odds`, {
    apiKey,
    fetchImpl,
    params: { regions: 'eu,uk,us', markets: 'h2h', oddsFormat: 'decimal' }
  });
  const out = [];
  for (const ev of events || []) {
    const homeName = ev.home_team;
    const awayName = ev.away_team;
    const dHome = avgOddsForOutcome(ev, 'h2h', homeName);
    const dDraw = avgOddsForOutcome(ev, 'h2h', 'Draw');
    const dAway = avgOddsForOutcome(ev, 'h2h', awayName);
    if (dHome == null || dAway == null) continue;
    const [pHome, pDraw, pAway] = normaliseToProbs([
      dHome, dDraw ?? 0, dAway
    ]);
    out.push({
      apiEventId: ev.id,
      commenceTime: ev.commence_time,
      homeTeamName: homeName,
      awayTeamName: awayName,
      odds: {
        homeWin: pHome,
        draw:    dDraw == null ? null : pDraw,
        awayWin: pAway,
        bookmaker: 'consensus'
      }
    });
  }
  return out;
}

/**
 * Fetch the outright "World Cup winner" odds and return a map of
 * { teamName: impliedProbability }.
 *
 * Note: team names from the-odds-api are full names (e.g. "Brazil"),
 * not 3-letter codes. The cron is responsible for mapping these to
 * the seed teams.
 */
export async function fetchChampionOdds({ apiKey, sport = DEFAULT_SPORT_OUTRIGHT, fetchImpl }) {
  const events = await call(`/sports/${sport}/odds`, {
    apiKey,
    fetchImpl,
    params: { regions: 'eu,uk,us', markets: 'outrights', oddsFormat: 'decimal' }
  });
  // Outrights typically come back as one "event" with many outcomes.
  // We average across bookmakers per outcome, normalise, return a map.
  const outcomes = new Map(); // name → [decimal odds...]
  for (const ev of events || []) {
    for (const bk of ev.bookmakers || []) {
      for (const mk of bk.markets || []) {
        if (mk.key !== 'outrights') continue;
        for (const out of mk.outcomes || []) {
          if (typeof out.price !== 'number' || out.price <= 0) continue;
          if (!outcomes.has(out.name)) outcomes.set(out.name, []);
          outcomes.get(out.name).push(out.price);
        }
      }
    }
  }
  if (outcomes.size === 0) return {};
  const entries = [...outcomes.entries()].map(([name, prices]) => {
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
    return [name, avg];
  });
  const probs = normaliseToProbs(entries.map(([, d]) => d));
  const result = {};
  for (let i = 0; i < entries.length; i++) {
    result[entries[i][0]] = probs[i];
  }
  return result;
}
