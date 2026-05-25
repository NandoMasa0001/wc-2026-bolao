# WC 2026 Bolão — Prediction League

A mobile-first website where a private group of friends predict every match
of the 2026 FIFA World Cup and compete on a live leaderboard.

- **Tech**: React + Vite SPA, **Supabase** (Postgres + Anonymous Auth + Realtime),
  football-data.org API, the-odds-api.com for the underdog boost, GitHub Actions cron.
- **Look**: 2014 FIFA World Cup Brazil palette. See `DESIGN.md`.
- **Spec**: see `CLAUDE.md` for the full product description.

---

## Run the demo (no accounts, no keys)

```bash
npm install
npm run dev
```

Open http://localhost:5173 and log in with password **`test`**. The app loads
2 groups of 4 teams + a handful of matches from `src/lib/mockData.js` and
runs entirely in-memory. Tick the "Sign me in as admin" box on the name step
to also see the Admin tab.

This demo mode runs **only** when the `VITE_SUPABASE_*` env vars are unset.
Adding them flips the app into production / Supabase mode automatically.

---

## Production setup (one-time, by the project owner)

### 1. Supabase project
- https://supabase.com → New project → free tier → pick a region close to you.
- Wait ~2 min for provisioning.
- **Project Settings → API**:
  - Copy the **Project URL** (e.g. `https://abc.supabase.co`).
  - Copy the **publishable** (anon) key (`sb_publishable_...` or legacy JWT).
  - Generate / reveal the **secret** key (`sb_secret_...` or legacy `service_role`).
    Keep this safe — it bypasses RLS.

### 2. Apply the schema migration
Install the Supabase CLI: `npm i -g supabase` (or `brew install supabase/tap/supabase`).
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```
This applies `supabase/migrations/0001_init.sql`: 10 tables, RLS policies,
helper functions, realtime publication.

### 3. football-data.org API key
- https://www.football-data.org/client/register → free tier → grab the token.
- Confirm competition code `WC` lists 2026 fixtures.

### 4. the-odds-api key (optional, for the underdog boost)
- https://the-odds-api.com → free 500 reqs/month.
- Without it the cron still works but every pick scores at 1× (no boost).

### 5. Local `.env`
```bash
cp .env.example .env
```
Fill in:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret key)
- `FOOTBALL_API_KEY`, `ODDS_API_KEY`
- `SHARED_PASSWORD` (anything you'll tell the friends)

### 6. Seed Firestore (one-time)
```bash
npm run seed
```
Calls football-data.org, writes 48 teams + 104 matches + the config row.

### 7. Deploy the SPA to Netlify
1. Push the repo to GitHub.
2. https://app.netlify.com → "Add new site" → "Import from Git" → pick the repo.
3. Build command: `npm run build`. Publish directory: `dist`.
4. Site settings → Environment variables → add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Netlify gives you `https://<slug>.netlify.app`.

### 8. Sign in once, then promote yourself
1. Open the live URL → log in → display name "Luli".
2. Supabase Dashboard → Table Editor → `players` → find your row →
   set `is_admin = true` → save.
3. Sign out and back in on the site. The **Admin** tab appears.

### 9. GitHub Actions secrets
In the GitHub repo → Settings → Secrets and variables → Actions →
New repository secret, add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | from step 1 |
| `SUPABASE_SERVICE_KEY` | the secret key |
| `FOOTBALL_API_KEY` | from step 3 |
| `ODDS_API_KEY` | from step 4 (optional) |

### 10. Trigger the cron once + verify
GitHub → Actions → **fetch-results** → "Run workflow" → wait ~30s. Open the
live site — match scores should be live, odds populated, leaderboard set.

### 11. Share
Send the friends the Netlify URL + the shared password. Done.

---

## Project layout

```
/
├─ CLAUDE.md                    spec
├─ DESIGN.md                    visual system
├─ supabase/
│  ├─ config.toml                CLI project alias
│  └─ migrations/
│     └─ 0001_init.sql           tables + RLS + realtime publication
├─ .github/workflows/
│  └─ fetch-results.yml          */10 min cron
├─ scripts/
│  ├─ seed.mjs                   one-time: load teams + matches + config
│  └─ fetch-results.mjs          cron: pull results + odds, run scoring
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  ├─ supabase.js                Supabase client + useMock flag
│  ├─ styles/
│  │  ├─ tokens.css              all design tokens (DESIGN.md §2–4)
│  │  └─ global.css
│  ├─ lib/
│  │  ├─ scoring.js              pure scoring engine + boost
│  │  ├─ standings.js            FIFA tiebreakers + best-third
│  │  ├─ footballApi.js          football-data.org adapter
│  │  ├─ oddsApi.js              the-odds-api.com adapter
│  │  └─ mockData.js             demo seed (used in mock mode only)
│  ├─ context/
│  │  ├─ AuthContext.jsx         dual: Mock | Supabase Anonymous Auth
│  │  └─ DataContext.jsx         dual: Mock | Supabase realtime subs
│  ├─ components/                Button, Card, MatchCard, ScoreStepper, Pill,
│  │                             TeamChip, LeaderboardRow, Tabs, GroupTable,
│  │                             Toast, Modal, EmptyState, ColourBand, icons
│  └─ pages/
│     ├─ LoginPage.jsx
│     ├─ MatchesPage.jsx
│     ├─ StandingsPage.jsx
│     ├─ PredictionsPage.jsx     incl. derived advancement flow
│     ├─ LeaderboardPage.jsx
│     └─ AdminPage.jsx
```

`src/lib/scoring.js` and `src/lib/standings.js` are framework-free; both the
web app (preview) and the GitHub Actions cron (official points) call the
exact same functions.

---

## Scoring rules

Per-match base (before multipliers):

| Outcome                          | Base |
|----------------------------------|:----:|
| Exact score                      | 5    |
| Correct outcome + one team exact | 3    |
| Correct outcome only             | 2    |
| One team exact, wrong outcome    | 1    |
| Nothing                          | 0    |

Round multipliers compound at ×1.25 from the group stage; `Math.ceil` after.

Tournament-long (flat, no round multiplier):
- Advancement: 5 × correct × team boost.
- Finalists: 20 × correct × team boost.
- Awards: 20 × correct (no boost).
- Poll: 15 × correct (no boost — these markets are themselves underdog picks).

Leaderboard ordering: total ↓ → exact-scores ↓ → name A–Z.

### Underdog boost

```
boost = 1 + (1 − p) × 1.5, clamped to [1, 2.5]
```

- **Matches**: `p` is the average bookmaker implied probability of the picked
  outcome (home win / draw / away win) from the-odds-api `soccer_fifa_world_cup`.
- **Advancement & Finalists**: rank-based on championship outright odds.
  Favorite team → 1×, longest-shot team → 2.5×, linear in between.
- **Awards & Poll**: no boost (no public odds market exists).

The boost multiplies base points *before* the round multiplier, so a long-shot
final exact score tops out at `ceil(5 × 2.5 × 3.0517…) = 39 pts` instead of 16.

If `ODDS_API_KEY` is missing, the cron skips odds entirely; every pick scores
at 1×.

---

## Locking

- Match predictions lock at `match.kickoff_at` or when status leaves
  `scheduled`. Enforced in the UI AND in the SQL RLS policies via
  `public.is_match_open(match_id)`.
- Tournament-long predictions lock at `config.tournament_starts_at`.
- `poll_votes` only writable while `config.poll_voting_open = true`.

---

## Limitations

- Awards have no public data feed; the admin enters them on `/admin`.
- Shared password = shared trust. Accepted for a small private group.
- Free API tiers are rate-limited; the cron runs every 10 minutes.
- Locking depends on accurate kickoff times from the API; admin can override
  a single match on `/admin` if needed.
- Supabase free-tier projects pause after **7 days of zero traffic**. During
  the tournament this won't happen. If it does (e.g. before kickoff), one
  click in the dashboard wakes it back up — no data is lost.
