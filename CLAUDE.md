# CLAUDE.md — World Cup 2026 Prediction League

This file tells Claude Code what to build. Read it fully before writing code.
The companion file **`DESIGN.md`** defines the visual system — follow it exactly.

---

## 1. What we are building

A mobile-first website where a private group of ~15 friends predict the results
of the **2026 FIFA World Cup** and compete on a live leaderboard.

- Friends enter the site with one **shared password**, then pick a display name.
- They predict the **score** of every match (all 104).
- They make tournament-long predictions: which 32 teams advance, the 2
  finalists, three individual awards, plus a "dark horse" and "disappointment".
- Match **results are fetched automatically** from a football API.
- Points are computed automatically; a leaderboard updates live.

It is a friendly game, not a commercial product. Favour simplicity and
reliability over scale. The 2026 World Cup kicks off **11 June 2026**, so the
site must be live and friends onboarded before then.

### The 2026 format (important)
First 48-team World Cup: **12 groups of 4** (A–L), **104 matches** total.
From each group the top 2 advance; the **8 best third-placed** teams also
advance — **32 teams** reach a **Round of 32**, then Round of 16, quarter-finals,
semi-finals, third-place playoff, and the final.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React + Vite** | SPA, fast dev, simple build |
| Routing | React Router | |
| Styling | **Plain CSS with CSS custom properties** | All tokens in `src/styles/tokens.css` per `DESIGN.md`. No Tailwind. |
| Database | **Firebase Firestore** | |
| Auth | **Firebase Anonymous Auth** | Gives each browser a uid for security rules; no passwords stored per user |
| Hosting | **Firebase Hosting** | |
| Results fetch | **GitHub Actions** scheduled workflow | Free cron; runs a Node script that calls the football API + writes to Firestore |
| Football data | **football-data.org** API (free tier) | Competition code `WC`. Wrap it in an adapter so it can be swapped |
| Fonts | Google Fonts: Poppins, Inter | |

Keep dependencies minimal. No state-management library — React state +
a few context providers is enough.

---

## 3. Repository structure

```
/
├─ CLAUDE.md                  (this file)
├─ DESIGN.md                  (visual system)
├─ design-reference/          (optional: 2014 palette swatches)
├─ index.html
├─ package.json
├─ vite.config.js
├─ firebase.json              (Hosting + Firestore rules config)
├─ firestore.rules
├─ .github/workflows/
│  └─ fetch-results.yml        (the scheduled cron)
├─ scripts/
│  ├─ seed.mjs                 (one-time: load teams + 104 matches)
│  └─ fetch-results.mjs        (run by the cron: pull results, score)
└─ src/
   ├─ main.jsx
   ├─ App.jsx
   ├─ firebase.js              (Firebase init)
   ├─ styles/
   │  ├─ tokens.css            (← FIRST FILE TO BUILD, from DESIGN.md)
   │  └─ global.css
   ├─ lib/
   │  ├─ scoring.js            (pure scoring functions — see §7)
   │  ├─ standings.js          (derive group standings from scores — §6.3)
   │  └─ footballApi.js        (adapter around football-data.org)
   ├─ context/
   │  ├─ AuthContext.jsx       (shared-password gate + player identity)
   │  └─ DataContext.jsx       (live Firestore subscriptions)
   ├─ components/              (the component library from DESIGN.md §6)
   └─ pages/                   (the routes from §5)
```

`src/lib/scoring.js` and `src/lib/standings.js` must be **pure, framework-free
modules** — they are imported by both the web app (to preview points) and the
Node cron script (to compute official points). Do not duplicate this logic.

---

## 4. Data model (Firestore)

### `config/tournament` — single document
```js
{
  sharedPassword: "string",          // plain text; low-stakes friends game
  predictionsOpen: true,
  tournamentStartsAt: Timestamp,     // 2026-06-11 — deadline for ALL
                                     // tournament-long predictions
  roundMultipliers: {                // see §7.2
    group: 1, r32: 1.25, r16: 1.5625,
    qf: 1.953125, third: 1.953125,
    sf: 2.44140625, final: 3.0517578125
  },
  pollVotingOpen: false,             // admin opens this after the final
  awardsAnnounced: false,
  results: {
    finalists: [],                   // [teamCode, teamCode] — set from bracket
    champion: null,
    bestPlayer: null,                // admin-entered (free text)
    youngPlayer: null,               // admin-entered
    goalkeeper: null,                // admin-entered
    darkHorse: null,                 // set from the group vote tally
    disappointment: null             // set from the group vote tally
  }
}
```

### `teams/{teamCode}`
```js
{ code: "BRA", name: "Brazil", group: "A", flagUrl: "..." }
```
48 documents. `teamCode` is the 3-letter FIFA code.

### `matches/{matchId}`
```js
{
  apiId: 12345,                      // football-data.org match id
  stage: "group"|"r32"|"r16"|"qf"|"sf"|"third"|"final",
  group: "A".."L" | null,            // null for knockout
  matchday: 1,                       // ordering helper
  homeTeam: "BRA" | null,            // null = knockout team not known yet
  awayTeam: "ARG" | null,
  homePlaceholder: "Winner Group A"|null,   // shown before teams known
  awayPlaceholder: "Runner-up Group B"|null,
  kickoffAt: Timestamp,
  status: "scheduled"|"live"|"finished",
  homeScore: null|number,            // final score (incl. extra time)
  awayScore: null|number,
  winner: null|"BRA"                 // knockout only: who advanced
}
```
104 documents, created by `scripts/seed.mjs`.

### `players/{playerId}`
`playerId` = the Firebase Anonymous Auth uid.
```js
{
  name: "Luli",
  isAdmin: false,
  createdAt: Timestamp,
  points: { matches: 0, advancement: 0, finalists: 0, awards: 0, poll: 0, total: 0 },
  stats: { predictionsMade: 0, exactScores: 0 }
}
```

### `predictions/{playerId}_{matchId}`
```js
{
  playerId, matchId,
  stage: "group"|"r32"|...,
  homeScore: 2, awayScore: 1,
  points: 0,                         // computed once the match finishes
  updatedAt: Timestamp
}
```

### `advancementPredictions/{playerId}`
```js
{ teams: ["BRA","ARG", ... 32 codes], confirmedAt: Timestamp, points: 0 }
```

### `finalsPredictions/{playerId}`
```js
{ finalists: ["BRA","FRA"], points: 0 }
```

### `awardPredictions/{playerId}`
```js
{ bestPlayer: "string", youngPlayer: "string", goalkeeper: "string", points: 0 }
```

### `pollPredictions/{playerId}` — made before the tournament
```js
{ darkHorse: "MAR", disappointment: "GER", points: 0 }
```

### `pollVotes/{playerId}` — cast after the tournament
```js
{ darkHorse: "MAR", disappointment: "GER" }
```

---

## 5. Pages / routes

All pages sit inside a single centred column (`--content-max`) with the bottom
tab bar from `DESIGN.md §6`.

| Route | Page | Contents |
|---|---|---|
| `/login` | **Login** | Shared-password field → on success, name entry. Creates the anon-auth session + `players` doc, stores name locally. Returning users skip straight in. |
| `/matches` | **Matches** | All matches grouped by day/stage, filter by stage. Each is a `MatchCard`. Predict & save here. Knockout matches with unknown teams show placeholders and are not yet predictable. |
| `/standings` | **Standings** | Real group tables (`GroupTable`) + a knockout bracket view, populated from the `matches` collection. |
| `/predictions` | **My Predictions** | Tabbed: (a) my group scores + the **derived advancement** confirm flow (§6); (b) finalists; (c) awards; (d) dark horse / disappointment. All locked at `tournamentStartsAt`. |
| `/leaderboard` | **Leaderboard** | Ranked `LeaderboardRow` list; tap a player to see their points breakdown. |
| `/admin` | **Admin** | Only if `players/{me}.isAdmin`. Enter award winners; open poll voting; set the poll result; manual match-result override; "recompute scores" button. |

---

## 6. Key feature: group-stage advancement prediction

This is derived from the player's own match predictions — do **not** make them
pick teams from a flat list.

### 6.1 Flow
1. The player predicts scores for the **72 group-stage matches** on `/matches`.
2. On `/predictions`, the app runs `standings.js` over those predicted scores
   and shows, for each of the 12 groups, the **predicted final table**
   (`GroupTable`) — who finishes 1st–4th.
3. It also computes the **8 best third-placed teams** across all groups.
4. The resulting **32 teams** are auto-saved as the player's
   `advancementPredictions` — **no manual confirm**. Whenever a group
   placar changes in `/matches`, the standings re-derive and the
   `advancement_predictions` row is upserted from inside `savePrediction`.
5. They may keep editing group scores any time until `tournamentStartsAt`;
   the always-fresh derived list is what scores.
6. Partial state is fine: with fewer than 72 group picks the standings
   are best-effort and the advancement row holds whatever the partial
   computation yields. The pending checklist on `/predictions` shows
   "incompleto" until all 72 are predicted.

### 6.2 `standings.js` — required logic
For each group, from the player's predicted scores compute: Played, Won, Drawn,
Lost, GF, GA, GD, Points (W=3, D=1). Rank teams by FIFA criteria in order:
1. Points → 2. Goal difference → 3. Goals for →
4. Head-to-head points/GD/GF among teams still tied →
5. Fair-play / drawing of lots — **not predictable**, so fall back to
   alphabetical by team code and flag the tie in the UI.

Then rank the 12 third-placed teams by Points → GD → GF (same fallback); the
top 8 advance. Output: the ordered standings per group + the set of 32
advancing team codes.

Use the **same module** to compute the *real* standings on `/standings` from
actual results, and the official advancing-32 for scoring.

---

## 7. Scoring engine

All scoring lives in `src/lib/scoring.js` as pure functions. It is run by the
cron script (`fetch-results.mjs`) after results change, and may also be
triggered from `/admin`. The web app imports the same functions to **preview**
potential points but never writes official points itself.

### 7.1 Per-match base points
Given a prediction `(ph, pa)` and an actual result `(ah, aa)`:
```
if (ph === ah && pa === aa)                base = 8   // cravada
else if (sign(ph-pa) === sign(ah-aa))      base = 5   // acerto do resultado
else                                       base = 0
```
So base ∈ {0, 5, 8}. Matching only one team's score with the wrong
outcome scores nothing — the only paths to points are full exact (cravada)
or correct outcome (acerto). Knockout advancer rule on a tie prediction
can shift this to 7 (cravada with wrong advancer) or 5 (predicted tie
+ correct advancer when actual was non-tie). A skipped match scores 0.

### 7.2 Round multiplier
Later rounds are worth more. The base points are multiplied by the round
multiplier and **rounded up**:
```
matchPoints = Math.ceil(base * roundMultipliers[match.stage])
```
Multipliers compound at ×1.25 per round from the group stage:

| Stage | Key | Multiplier |
|---|---|---|
| Group | `group` | 1.0 |
| Round of 32 | `r32` | 1.25 |
| Round of 16 | `r16` | 1.5625 |
| Quarter-final | `qf` | 1.953125 |
| Third-place playoff | `third` | 1.953125 (default; configurable) |
| Semi-final | `sf` | 2.44140625 |
| Final | `final` | 3.0517578125 |

Resulting point values (`ceil(base × multiplier)`):

| Stage | Cravada (8) | Acerto (5) |
|---|---|---|
| Group | 8 | 5 |
| R32 | 10 | 7 |
| R16 | 13 | 8 |
| QF / 3rd | 16 | 10 |
| SF | 20 | 13 |
| Final | 25 | 16 |

Multipliers are read from `config.tournament.roundMultipliers` so they can be
tuned without a code change.

### 7.3 Tournament-long predictions (flat points, no multiplier)
- **Advancement:** `5 × (teams in the player's confirmed prediction that
  actually advanced)`. Max 160. Computed once the group stage finishes.
- **Finalists:** `20 × (correct finalists)`. Max 40. Computed once both finalists
  are known from the bracket.
- **Awards:** `20` for each of best player / young player / goalkeeper that
  matches the admin-entered winner. Max 60.
- **Poll (dark horse + disappointment):** after the final, the admin opens
  voting; every player casts a `pollVotes` doc. The most-voted team for each is
  the official answer (admin breaks any tie on `/admin`). Each player's
  pre-tournament `pollPredictions` earns `15` per match. Max 30.

### 7.4 Player totals
`players/{id}.points` holds the five buckets and `total` (their sum). The cron
recomputes affected buckets whenever data changes. `stats.exactScores` (count
of exact-score hits) is the leaderboard tiebreaker.

### 7.5 Leaderboard ordering
Sort by `points.total` desc, then `stats.exactScores` desc, then name A–Z.
Players genuinely tied on all three share a rank.

---

## 8. Auto-fetch: the results cron

`.github/workflows/fetch-results.yml` runs `scripts/fetch-results.mjs` on a
schedule (`*/10 * * * *` — every 10 minutes; fine for the free API tier).

The script:
1. Calls football-data.org for all `WC` matches (via `footballApi.js` adapter).
2. Upserts each into `matches`: updates `status`, `homeScore`, `awayScore`.
3. For knockout matches, once a feeder match finishes, fills in `homeTeam` /
   `awayTeam` / `winner` so the next round becomes predictable.
4. Runs the scoring engine over every finished match and recomputes
   `predictions.points` + `players.points`.
5. When the group stage is fully finished, computes the official advancing-32
   and scores `advancementPredictions`.
6. When the final's two teams are known, scores `finalsPredictions`.

It authenticates to Firebase with a **service account** (via `firebase-admin`).
Secrets are GitHub Actions repository secrets — never commit them:
- `FOOTBALL_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT` (the service-account JSON)

Awards and the poll result are **not** auto-fetched — there is no API for them.
They are entered by the admin on `/admin`.

---

## 9. Prediction locking

- A **match** prediction can be created or edited only while
  `now < match.kickoffAt` **and** `match.status === "scheduled"`.
- Enforce this in **two places**:
  1. The UI disables the `ScoreStepper`s and shows a `LOCKED` pill.
  2. **Firestore security rules** (`firestore.rules`) reject writes to a
     `predictions` doc when the referenced match's `kickoffAt` is in the past —
     use `get(/databases/$(db)/documents/matches/$(matchId)).data.kickoffAt`
     compared to `request.time`. This is the real lock; the UI is convenience.
- **Tournament-long** predictions (advancement, finalists, awards, poll
  predictions) lock at `config.tournament.tournamentStartsAt`. Rules enforce
  the same way.
- `pollVotes` can only be written while `config.pollVotingOpen === true`.

Security rules summary: a signed-in user may read everything; may write only
their own docs (`playerId === request.auth.uid`); may not write locked
predictions; only an admin may write `config`, `matches`, `teams`, and other
players' docs.

---

## 10. Design system

Follow **`DESIGN.md`** exactly. Non-negotiable rules:

1. **First task:** create `src/styles/tokens.css` from `DESIGN.md` sections 2–4
   (all `:root` blocks) and import it once in `main.jsx`.
2. **No hardcoded values in components** — every colour, font, size, spacing,
   radius, shadow and duration must reference a token. If you need a value that
   isn't a token, add it to `tokens.css` first.
3. Build the component library (`DESIGN.md §6`) before building pages.
4. Mobile-first: design for ~390px wide, then enhance for desktop.
5. Meet the accessibility checklist in `DESIGN.md §7`.

The look is the **2014 FIFA World Cup Brazil** identity: vibrant tropical
palette (Ateneo Blue, Palm Green, Juicy Lime, Gold, American Orange, Rose
Madder), warm cream background, rounded friendly shapes, festive colour banding.

---

## 11. Build order (milestones)

Aim to finish by **early June** so friends can onboard before 11 June kickoff.

1. **Scaffold** — Vite + React app, Firebase init, `tokens.css`, `global.css`.
2. **Component library** — every component in `DESIGN.md §6`.
3. **Auth** — `/login` shared-password gate, anonymous auth, player creation.
4. **Seed data** — `scripts/seed.mjs` loads 48 teams + 104 matches from the API.
5. **Matches + predictions** — `/matches`, score saving, locking, rules.
6. **Scoring + cron** — `scoring.js`, `fetch-results.mjs`, GitHub Actions.
7. **Standings + advancement** — `standings.js`, `/standings`, the derive &
   confirm flow on `/predictions`.
8. **Tournament-long predictions** — finalists, awards, poll forms.
9. **Leaderboard** — `/leaderboard` with breakdown.
10. **Admin** — `/admin` page.
11. **Deploy** — Firebase Hosting; full test pass; onboard friends.

---

## 12. Setup steps for the project owner (Luli — done manually, once)

Claude Code cannot do these; they need real accounts:
1. Create a **Firebase project**; enable **Firestore**, **Anonymous Auth**, and
   **Hosting**.
2. Register at **football-data.org** for a free API key (covers competition
   `WC`). Confirm the 2026 fixtures are listed.
3. Create a Firebase **service account** and add its JSON + the API key as
   **GitHub Actions secrets** (`FIREBASE_SERVICE_ACCOUNT`, `FOOTBALL_API_KEY`).
4. After first deploy, create the `config/tournament` doc: set the
   **shared password** and `tournamentStartsAt` (2026-06-11).
5. Set your own `players/{you}.isAdmin = true`.
6. Run `scripts/seed.mjs` once to load teams and matches.
7. Share the site URL + shared password with the 15 friends.

---

## 13. Limitations & non-goals

- **Awards have no data feed.** Best player / young player / goalkeeper are
  announced by FIFA after the final; the admin enters them manually.
- **Shared password = shared trust.** Anyone with the link + password could
  edit another person's predictions. Accepted: it is a small private group.
  (Anonymous auth still ties a prediction to a browser, which is a mild guard.)
- **Free API tier** has rate limits; results refresh every ~10 minutes, not in
  real time. A match shown as `live` may lag the real game slightly.
- **Locking depends on accurate kickoff times** from the API. If the API's
  kickoff time is wrong, the lock is wrong — the admin can override a match.
- **Not built for scale.** ~15 users; no pagination, no search, no email.
- **No native app, no push notifications.** It is a website opened in a browser.
- **48-team format is new.** Double-check the API returns all 104 matches and
  the third-place-team ranking once the real draw/fixtures are loaded.

---

## 13.5. Hard rule: knockout matches are never user-predictable before teams are defined

The user has made this explicit: **never expose the score stepper / save UI
for a knockout match whose `home_team` or `away_team` is still null**. They
stay as visualization-only (the bracket fills in from real results) until
the football-data.org feed populates both teams. Only after that — i.e.,
once the previous round has finished — can a knockout match become
predictable. Reopening predictability earlier than that is against the
owner's design intent, regardless of how convenient it would be.

---

## 14. Open items to confirm with the owner

- Third-place playoff multiplier currently defaults to the quarter-final value
  (1.953125). Change in `config` if a different weight is wanted.
- All UI copy is in **English**; keep copy strings centralised so it could be
  translated later.
- Knockout rounds are predicted match-by-match only (no separate full-bracket
  game) — confirmed.

---

## 15. Production fixes & gotchas (learned the hard way — READ before debugging)

> The stack drifted from this doc: the real backend is **Supabase** (Postgres
> + RLS), not Firebase, and the app is hosted on **Cloudflare Workers static
> assets**, not Firebase/Netlify. It runs as 3 separate leagues, each its own
> Supabase project: **trupe** (`.env`), **familia** (`.env.familia`), **scib**
> (`.env.scib`, retired). `scripts/leagues.config.json` maps them.

### 15.1 The 1000-row read cap (THE big one — "palpites somindo")
PostgREST caps `.select(...)` at **1000 rows** (for the anon key AND the
service key). Once a league's `predictions` table passes 1000 rows (104
matches × ~15 players ≈ up to ~1560), a plain select **silently returns only
the first 1000** — the newest picks (knockout) never load, so they "disappear"
from the UI and the cron stops scoring them, *even though they're saved*. This
is the real cause behind every "salvei e sumiu / não aparece" report; it first
bit trupe at 1088 rows.

**Always paginate reads of `predictions`** with `.range(from, from+999)` in a
loop until a short page. Implemented as `fetchAllRows()` in
`src/context/DataContext.jsx` and `scripts/fetch-results.mjs`, and inline in
`scripts/backup.mjs`. Any new code that reads a table which can exceed 1000
rows MUST page the same way. **Do not "fix" this by deleting old predictions —
the cron recomputes match points from those rows every run, so deleting them
zeroes everyone's score.**

### 15.2 Deploy reality (`git push` does NOT deploy the app)
- Frontend = Cloudflare Workers. **trupe is a MANUAL deploy**:
  `npm run build && npx wrangler deploy` (top-level env). **familia & scib
  auto-deploy** from `main` via the Cloudflare Git integration.
- Each league bakes its own `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at
  build time. For a manual per-league build use Vite modes
  (`vite build --mode familia`, with those VITE_ vars in `.env.familia`).
  Helper: `scripts/deploy.sh [trupe|familia|scib|all]` (has a guard that aborts
  if the bundle points at the wrong Supabase).
- The **cron** (`scripts/fetch-results.mjs`) runs from **GitHub Actions** on
  `main` and scores all leagues — so `git push` *does* ship scoring/cron
  changes, just not the web app. Verify a deploy by curling the worker URL
  (`wc-2026-bolao.fernando-masagao.workers.dev`) and checking the
  `assets/index-*.js` hash changed.
- **DB migrations** (anything under `supabase/migrations/`) are NOT shipped by
  git — apply the SQL by hand in **each** league's Supabase SQL editor.

### 15.3 Advancement (classificação) rows can be missing
The 32 advancing teams live in `advancement_predictions`, auto-derived from a
player's group scores inside `savePrediction`. Players who finished their group
picks **before** that auto-derive existed (and never re-saved) have **no row**,
so the cron scores their advancement as 0. The group stage is locked, so they
can't trigger it themselves. Fix: re-derive from their stored group predictions
with `computeStandings`/`predictedMatchesFromPlayer`, upsert the row, and
recompute `players.points`. Only do this for players who actually have group
picks — never synthesize a bracket for someone with 0 predictions.
