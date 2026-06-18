/**
 * scoring.js — pure, framework-free scoring functions.
 *
 * Used by the web app to preview points and by the GitHub Actions cron
 * (`scripts/fetch-results.mjs`) to compute official points. Do not import
 * anything React- or Firebase-specific here.
 *
 * See CLAUDE.md §7. Underdog boost spec: README "Underdog boost".
 */

export const DEFAULT_ROUND_MULTIPLIERS = Object.freeze({
  group: 1,
  r32: 1.25,
  r16: 1.5625,
  qf: 1.953125,
  third: 1.953125,
  sf: 2.44140625,
  final: 3.0517578125
});

/** Boost-formula defaults. See README. */
export const BOOST_K   = 1.5;
export const BOOST_CAP = 2.5;

function sign(n) {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

/**
 * Base points for a single match prediction vs the actual result.
 * Returns 8 for an exact score (cravada), 5 for the right outcome
 * (acerto — win/draw/loss matches, regardless of how close the score
 * was), 0 for everything else. Matching just one team's score with the
 * wrong outcome scores nothing — only outcome accuracy or full exact
 * counts.
 */
export function baseMatchPoints(prediction, actual) {
  if (!prediction || !actual) return 0;
  const { homeScore: ph, awayScore: pa } = prediction;
  const { homeScore: ah, awayScore: aa } = actual;
  if (
    ph === null || ph === undefined ||
    pa === null || pa === undefined ||
    ah === null || ah === undefined ||
    aa === null || aa === undefined
  ) {
    return 0;
  }
  if (ph === ah && pa === aa) return 8;
  const outcomeOK = sign(ph - pa) === sign(ah - aa);
  return outcomeOK ? 5 : 0;
}

/**
 * Compute the boost multiplier from an implied probability.
 *
 * boost = 1 + (1 − p) × k, clamped to [1, cap].
 *
 *   p = 1.0  → 1.0×   (sure-thing pick, no boost)
 *   p = 0.5  → 1.75×  (toss-up)
 *   p = 0.0  → 2.5×   (extreme long-shot)
 *
 * Returns 1 if `p` is null/undefined/NaN — i.e. "we have no odds, no boost."
 */
export function boostFromProb(impliedProb, k = BOOST_K, cap = BOOST_CAP) {
  if (impliedProb == null || Number.isNaN(impliedProb)) return 1;
  const p = Math.max(0, Math.min(1, impliedProb));
  const boost = 1 + (1 - p) * k;
  return Math.min(cap, Math.max(1, boost));
}

/**
 * Given a prediction and an odds triple, return the implied probability of
 * the OUTCOME the player picked (home win / draw / away win).
 *
 * `odds` shape: { homeWin: number, draw: number, awayWin: number } where
 * each value is an implied probability (0..1). Returns null if odds are
 * absent.
 */
export function pickedOutcomeProb(prediction, odds) {
  if (!odds || !prediction) return null;
  const { homeScore: ph, awayScore: pa } = prediction;
  if (ph == null || pa == null) return null;
  const diff = ph - pa;
  if (diff > 0) return odds.homeWin ?? null;
  if (diff < 0) return odds.awayWin ?? null;
  return odds.draw ?? null;
}

/**
 * Multiplied match points, rounded up.
 *
 *   points = ceil(base × boost × roundMultiplier)
 *
 * `options` (optional):
 *   boost: number — pre-computed multiplier. Overrides anything else.
 *   odds:  object — H2H odds; if `boost` not provided, we derive it from
 *                   the player's picked outcome.
 *
 * Knockout advancer rule (only when stage !== 'group'):
 *   - If the player predicted a TIE AND included `prediction.advancer`:
 *       • Actual ended non-tie + advancer correct → base += 5
 *         (upgrades 0 to 5 — "acertou o resultado via penalty pick")
 *       • Actual ended tie (cravou) + advancer wrong → base -= 1
 *         (penalty: cravada would be 8 → 7)
 *   "actual winner" comes from `actual.winner` (set by the cron once the
 *   real result lands) or from the score sign as a fallback.
 *
 * Backward-compatible: callers that don't pass options get boost = 1
 * and the advancer rule only applies when `prediction.advancer` is set.
 */
export function matchPoints(
  prediction,
  actual,
  stage,
  multipliers = DEFAULT_ROUND_MULTIPLIERS,
  options = {}
) {
  let base = baseMatchPoints(prediction, actual);

  // Knockout advancer adjustments — only when both prediction and actual
  // have scores, this is a knockout stage, and the player predicted a tie
  // with an explicit advancer.
  const isKnockout = stage && stage !== 'group';
  if (isKnockout && prediction && actual &&
      prediction.homeScore != null && prediction.awayScore != null &&
      actual.homeScore != null && actual.awayScore != null) {
    const ph = prediction.homeScore;
    const pa = prediction.awayScore;
    const ah = actual.homeScore;
    const aa = actual.awayScore;
    const predictedTie = ph === pa;
    const actualTie = ah === aa;

    if (predictedTie && prediction.advancer) {
      // Who actually advanced — prefer the explicit winner field (set on
      // penalty-shootout results), then fall back to score comparison.
      const actualWinner =
        actual.winner ||
        (ah > aa ? actual.homeTeam : aa > ah ? actual.awayTeam : null);

      const advancerCorrect = actualWinner && prediction.advancer === actualWinner;

      if (predictedTie && actualTie && base === 8) {
        // Cravou empate: keep 8 if advancer correct, drop to 7 if wrong.
        if (actualWinner && !advancerCorrect) base -= 1;
      } else if (predictedTie && !actualTie) {
        // Predicted tie, actual non-tie: credit "acertou o resultado" via
        // the advancer pick (+5 base — same as a normal outcome hit).
        if (advancerCorrect) base += 5;
      }
    }
  }

  if (base <= 0) return 0;
  const mult = multipliers[stage] ?? 1;

  let boost = 1;
  if (typeof options.boost === 'number') {
    boost = options.boost;
  } else if (options.odds) {
    const p = pickedOutcomeProb(prediction, options.odds);
    boost = boostFromProb(p);
  }
  return Math.ceil(base * boost * mult);
}

/**
 * Compute a per-team boost map from championship outright odds.
 *
 * `championOdds` is { teamCode: impliedProbabilityToWinChampionship }.
 *
 * Uses a LOG-PROBABILITY interpolation: each team's boost is determined
 * by where its log(prob) sits between the favorite's log(prob) and the
 * longest shot's log(prob). This gives a noticeable gradient even among
 * top favorites — a 20% team and a 12% team land at clearly different
 * boost values, instead of the flat near-1× bunch you'd get from a
 * rank-based scheme.
 *
 *   favorite (highest prob)    → 1×
 *   longest shot (lowest prob) → cap (default 2.5×)
 *   middle teams               → spaced by log-prob ratio
 *
 * Returns { teamCode: boostMultiplier }.
 */
export function rankBoostsFromChampionOdds(championOdds = {}, cap = BOOST_CAP) {
  const entries = Object.entries(championOdds).filter(
    ([, p]) => typeof p === 'number' && p > 0
  );
  if (entries.length < 2) return {};

  const probs = entries.map(([, p]) => p);
  const maxP  = Math.max(...probs);
  const minP  = Math.max(Math.min(...probs), 1e-5);
  const logMax = Math.log(maxP);
  const logMin = Math.log(minP);
  const span   = logMin - logMax; // negative number (logMin < logMax)

  const out = {};
  for (const [code, p] of entries) {
    const safeP = Math.max(p, 1e-5);
    // t ∈ [0, 1]: 0 = favorite, 1 = longest shot
    const t = span === 0 ? 0 : (Math.log(safeP) - logMax) / span;
    const clamped = Math.max(0, Math.min(1, t));
    out[code] = 1 + clamped * (cap - 1);
  }
  return out;
}

/**
 * Advancement: flat 5 × correct team. No boost — the volume of picks (up to
 * 32) makes this category big enough on its own; multiplying would create
 * runaway scores when someone nails a long-shot heavy bracket.
 */
// Multiplicador aplicado em cada item dos palpites longos (advancement,
// finalists, awards, poll, extras). Match points NÃO são afetados — só
// os longos eram pesados demais e foram reduzidos pra 70% do original.
// Aplicado per-item com Math.ceil pra UI labels baterem exato com o que
// o jogador ganha.
export const SPECIAL_BUCKET_MULTIPLIER = 0.7;
const reduce = (n) => Math.ceil(n * SPECIAL_BUCKET_MULTIPLIER);

export function scoreAdvancement(predictedTeams = [], actualAdvancing = []) {
  if (!predictedTeams.length || !actualAdvancing.length) return 0;
  const actualSet = new Set(actualAdvancing);
  let total = 0;
  for (const code of predictedTeams) {
    if (actualSet.has(code)) total += reduce(5); // 5 → 4 per correct
  }
  return total;
}

/**
 * Finalists: 20 × correct. Uses the same per-team boost as champion
 * (log-prob mapping from championship odds), so the gradient between
 * favorites mirrors the real-odds spread instead of being flattened.
 */
export function scoreFinalists(predictedFinalists = [], actualFinalists = [], teamBoosts = {}) {
  if (!predictedFinalists.length || !actualFinalists.length) return 0;
  const actualSet = new Set(actualFinalists);
  let total = 0;
  for (const code of predictedFinalists) {
    if (!actualSet.has(code)) continue;
    const boost = teamBoosts[code] ?? 1;
    total += reduce(20 * boost); // 20 × boost → 14 × boost (ceil)
  }
  return total;
}

/**
 * Awards: 20 each, no boost (no public odds market for awards).
 * Four awards: best player, young player, goalkeeper, top scorer. Max 80.
 */
export function scoreAwards(predicted = {}, actual = {}) {
  const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : null);
  let points = 0;
  for (const key of ['bestPlayer', 'youngPlayer', 'goalkeeper', 'topScorer']) {
    const p = norm(predicted[key]);
    const a = norm(actual[key]);
    if (p && a && p === a) points += reduce(20); // 20 → 14
  }
  return points;
}

/**
 * Poll: 15 each for darkHorse / disappointment, no boost. These markets
 * are themselves "underdog" picks by design, so an extra multiplier on top
 * would double-count.
 */
export function scorePoll(predicted = {}, actual = {}) {
  let points = 0;
  if (predicted.darkHorse && actual.darkHorse && predicted.darkHorse === actual.darkHorse) {
    points += reduce(15); // 15 → 11
  }
  if (predicted.disappointment && actual.disappointment && predicted.disappointment === actual.disappointment) {
    points += reduce(15);
  }
  return points;
}

export function totalPoints(buckets = {}) {
  const keys = ['matches', 'advancement', 'finalists', 'awards', 'poll', 'extras'];
  return keys.reduce((sum, k) => sum + (buckets[k] || 0), 0);
}

/* -------------------------------------------------------------------- */
/*  EXTRAS — 8 side-bet categories. See README "Extras".                */
/* -------------------------------------------------------------------- */

/** Closeness scoring for numeric picks: exact = max, then linearly down. */
export function scoreCloseness(predicted, actual, max, perUnitOff = 5) {
  if (predicted == null || actual == null) return 0;
  const diff = Math.abs(Number(predicted) - Number(actual));
  return Math.max(0, max - perUnitOff * diff);
}

/** Exact-match numeric scoring: predicted === actual → max, else 0. */
export function scoreExactNumber(predicted, actual, max) {
  if (predicted == null || actual == null) return 0;
  return Number(predicted) === Number(actual) ? max : 0;
}

/** Exact-match text scoring (case-insensitive, whitespace-trimmed). */
export function scoreExactText(predicted, actual, points) {
  if (!predicted || !actual) return 0;
  const norm = (s) => String(s).trim().toLowerCase();
  return norm(predicted) === norm(actual) ? points : 0;
}

/** Boolean scoring. */
export function scoreBoolean(predicted, actual, points) {
  if (predicted == null || actual == null) return 0;
  return Boolean(predicted) === Boolean(actual) ? points : 0;
}

/**
 * Compute the "extras" bucket for a player.
 *
 * `predicted` and `actual` carry the same camelCase keys (see schema docs).
 * `teamBoosts` is the rank-based champion map used to boost the `champion`
 * pick (mirrors how advancement/finalists work).
 */
export function scoreExtras(predicted = {}, actual = {}, teamBoosts = {}) {
  let total = 0;

  // 1. Champion (30 × boost → reduzido pra 21 × boost com Math.ceil)
  if (predicted.champion && actual.champion && predicted.champion === actual.champion) {
    const boost = teamBoosts[predicted.champion] ?? 1;
    total += reduce(30 * boost);
  }

  // 2. Total goals in WC (60 → 42 max) — closeness com -5/gol off mantido,
  // a curva fica naturalmente mais íngreme proporcional ao novo max.
  total += reduce(scoreCloseness(predicted.totalGoalsWC, actual.totalGoalsWC, 60));

  // 3. Neymar G+A (30 → 21, EXACT)
  total += reduce(scoreExactNumber(predicted.neymarGA, actual.neymarGA, 30));

  // 4. Top scorer goal count (20 → 14, EXACT)
  total += reduce(scoreExactNumber(predicted.topScorerGoals, actual.topScorerGoals, 20));

  // 5. First goal scorer for Brazil (25 → 18)
  total += reduce(scoreExactText(predicted.firstGoalBrazil, actual.firstGoalBrazil, 25));

  // 6. Last goal scorer for Brazil (25 → 18)
  total += reduce(scoreExactText(predicted.lastGoalBrazil, actual.lastGoalBrazil, 25));

  // 7. 100th goal of the WC (50 → 35)
  total += reduce(scoreExactText(predicted.hundredthGoal, actual.hundredthGoal, 50));

  return total;
}

/**
 * Recompute a player's `matches` bucket. Flat per-match scoring (no
 * underdog boost on individual games — that lives on the tournament-long
 * predictions instead). Returns { points, exactScores }.
 */
export function computeMatchesBucket({ predictions, matches, multipliers = DEFAULT_ROUND_MULTIPLIERS }) {
  let points = 0;
  let exactScores = 0;
  for (const match of matches) {
    if (match.status !== 'finished') continue;
    const pred = predictions[match.id];
    if (!pred) continue;
    const base = baseMatchPoints(pred, match);
    if (base === 7) exactScores += 1;
    points += matchPoints(pred, match, match.stage, multipliers);
  }
  return { points, exactScores };
}
