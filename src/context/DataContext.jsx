import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { supabase, useMock } from '../supabase.js';
import { computeStandings, predictedMatchesFromPlayer } from '../lib/standings.js';
import { isMatchLocked } from '../lib/locking.js';
import {
  mockConfig,
  mockTeams,
  mockTeamsByCode,
  mockTeamsByGroup,
  mockMatches,
  mockPlayers,
  mockPredictions,
  mockAdvancementPredictions,
  mockFinalsPredictions,
  mockAwardPredictions,
  mockPollPredictions,
  mockExtraPredictions
} from '../lib/mockData.js';
import { computeMatchesBucket, rankBoostsFromChampionOdds } from '../lib/scoring.js';

/**
 * DataContext — dual mode.
 *
 *   Mock mode: in-memory state seeded from mockData.js.
 *   Supabase mode: initial fetch + realtime channel subscriptions per table.
 *     Mutators call Supabase. Points (`players.points`) are written by the
 *     cron only; client writes user-input fields.
 *
 * Same API in both modes (see value object near the bottom of each impl).
 */

const DataCtx = createContext(null);

export function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

export function DataProvider({ children }) {
  return useMock
    ? <MockDataProvider>{children}</MockDataProvider>
    : <SupabaseDataProvider>{children}</SupabaseDataProvider>;
}

/* ====================================================================== */
/* MOCK MODE                                                              */
/* ====================================================================== */

function MockDataProvider({ children }) {
  const { session } = useAuth();

  const [config, setConfig] = useState(mockConfig);
  const [teams] = useState(mockTeams);
  const [matches, setMatches] = useState(mockMatches);
  const [players, setPlayers] = useState(mockPlayers);
  const [predictions, setPredictions] = useState(mockPredictions);
  const [advancementPredictions, setAdvancementPredictions] = useState(mockAdvancementPredictions);
  const [finalsPredictions, setFinalsPredictions] = useState(mockFinalsPredictions);
  const [awardPredictions, setAwardPredictions] = useState(mockAwardPredictions);
  const [pollPredictions, setPollPredictions] = useState(mockPollPredictions);
  const [extraPredictions, setExtraPredictions] = useState(mockExtraPredictions);

  useEffect(() => {
    if (!session) return;
    setPlayers((prev) => {
      if (prev.some(p => p.id === session.id)) {
        return prev.map(p =>
          p.id === session.id ? { ...p, isAdmin: session.isAdmin } : p
        );
      }
      return [
        ...prev,
        {
          id: session.id,
          name: session.name,
          isAdmin: session.isAdmin,
          createdAt: new Date().toISOString(),
          points: { matches: 0, advancement: 0, finalists: 0, awards: 0, poll: 0, extras: 0, total: 0 },
          stats: { predictionsMade: 0, exactScores: 0 }
        }
      ];
    });
  }, [session]);

  const me = useMemo(
    () => players.find(p => p.id === session?.id) || null,
    [players, session]
  );

  const groupMatches = useMemo(
    () => matches.filter(m => m.stage === 'group'),
    [matches]
  );

  const predictionsByMatchForMe = useMemo(() => {
    if (!session) return {};
    const out = {};
    for (const p of Object.values(predictions)) {
      if (p.playerId === session.id) out[p.matchId] = p;
    }
    return out;
  }, [predictions, session]);

  const predictionsByPlayer = useMemo(() => {
    const out = {};
    for (const p of Object.values(predictions)) {
      if (!out[p.playerId]) out[p.playerId] = {};
      out[p.playerId][p.matchId] = p;
    }
    return out;
  }, [predictions]);

  const recomputePlayer = useCallback((playerId, freshPredictions, freshMatches, freshConfig) => {
    const preds = freshPredictions
      ? Object.values(freshPredictions).filter(p => p.playerId === playerId)
      : Object.values(predictions).filter(p => p.playerId === playerId);
    const predsByMatchId = {};
    for (const p of preds) predsByMatchId[p.matchId] = p;

    const matchesBucket = computeMatchesBucket({
      predictions: predsByMatchId,
      matches: freshMatches || matches,
      multipliers: (freshConfig || config).roundMultipliers
    });

    setPlayers((prev) =>
      prev.map((pl) => {
        if (pl.id !== playerId) return pl;
        const buckets = {
          matches: matchesBucket.points,
          advancement: pl.points.advancement || 0,
          finalists: pl.points.finalists || 0,
          awards: pl.points.awards || 0,
          poll: pl.points.poll || 0
        };
        const total = Object.values(buckets).reduce((s, v) => s + v, 0);
        return {
          ...pl,
          points: { ...buckets, total },
          stats: {
            predictionsMade: preds.length,
            exactScores: matchesBucket.exactScores
          }
        };
      })
    );
  }, [predictions, matches, config]);

  const recomputeAllScores = useCallback(() => {
    for (const pl of players) recomputePlayer(pl.id);
  }, [players, recomputePlayer]);

  const savePrediction = useCallback(async (matchId, { homeScore, awayScore, advancer }) => {
    if (!session) throw new Error('Sua sessão expirou. Saia e entre de novo.');
    const match = matches.find(m => m.id === matchId);
    if (!match) throw new Error('Jogo não encontrado — recarrega a página.');
    if (isMatchLocked(match, config?.tournamentStartsAt)) {
      throw new Error('Esse jogo já começou — os palpites travaram.');
    }

    const key = `${session.id}_${matchId}`;
    const next = {
      playerId: session.id, matchId, stage: match.stage,
      homeScore, awayScore,
      advancer: advancer ?? null,
      points: 0,
      updatedAt: new Date().toISOString()
    };
    setPredictions((prev) => {
      const updated = { ...prev, [key]: next };
      queueMicrotask(() => recomputePlayer(session.id, updated, matches, config));
      return updated;
    });
  }, [session, matches, config, recomputePlayer]);

  const saveMatchResult = useCallback(async (matchId, { homeScore, awayScore, status = 'finished' }) => {
    setMatches((prev) => {
      const updated = prev.map(m =>
        m.id === matchId ? { ...m, homeScore, awayScore, status } : m
      );
      queueMicrotask(() => {
        for (const pl of players) recomputePlayer(pl.id, predictions, updated, config);
      });
      return updated;
    });
  }, [players, predictions, config, recomputePlayer]);

  const confirmAdvancement = useCallback(async (teamsArr) => {
    if (!session) return;
    setAdvancementPredictions((prev) => ({
      ...prev,
      [session.id]: { teams: teamsArr, confirmedAt: new Date().toISOString(), points: 0 }
    }));
  }, [session]);

  const saveFinalists = useCallback(async (finalists) => {
    if (!session) return;
    setFinalsPredictions((prev) => ({
      ...prev,
      [session.id]: { finalists, points: 0 }
    }));
  }, [session]);

  const saveAwards = useCallback(async ({ bestPlayer, youngPlayer, goalkeeper }) => {
    if (!session) return;
    setAwardPredictions((prev) => ({
      ...prev,
      [session.id]: { bestPlayer, youngPlayer, goalkeeper, points: 0 }
    }));
  }, [session]);

  const savePollPrediction = useCallback(async ({ darkHorse, disappointment }) => {
    if (!session) return;
    setPollPredictions((prev) => ({
      ...prev,
      [session.id]: { darkHorse, disappointment, points: 0 }
    }));
  }, [session]);

  const saveExtras = useCallback(async (extras) => {
    if (!session) return;
    setExtraPredictions((prev) => {
      const current = prev[session.id] || {};
      return {
        ...prev,
        [session.id]: { ...current, ...extras, points: 0 }
      };
    });
  }, [session]);

  const updateConfig = useCallback(async (patch) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateConfigResults = useCallback(async (patch) => {
    setConfig((prev) => ({
      ...prev,
      results: { ...prev.results, ...patch }
    }));
  }, []);

  const deletePlayer = useCallback(async (playerId) => {
    setPlayers((prev) => prev.filter(p => p.id !== playerId));
    setPredictions((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].playerId === playerId) delete next[key];
      }
      return next;
    });
    setAdvancementPredictions((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    setFinalsPredictions((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    setAwardPredictions((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    setPollPredictions((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    setExtraPredictions((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
  }, []);

  const teamBoosts = useMemo(
    () => rankBoostsFromChampionOdds(config.tournamentOdds || {}),
    [config.tournamentOdds]
  );

  const value = useMemo(
    () => ({
      config, teams, teamsByCode: mockTeamsByCode, teamsByGroup: mockTeamsByGroup,
      matches, groupMatches, players, predictions,
      predictionsByMatchForMe, predictionsByPlayer,
      advancementPredictions, finalsPredictions, awardPredictions, pollPredictions,
      extraPredictions,
      teamBoosts,
      me, loading: false,
      adminActions: [], logAdminAction: async () => {},
      savePrediction, saveMatchResult, confirmAdvancement, saveFinalists,
      saveAwards, savePollPrediction, saveExtras, updateConfig, updateConfigResults,
      deletePlayer, recomputeAllScores
    }),
    [
      config, teams, matches, groupMatches, players, predictions,
      predictionsByMatchForMe, predictionsByPlayer,
      advancementPredictions, finalsPredictions, awardPredictions, pollPredictions,
      extraPredictions,
      teamBoosts,
      me,
      savePrediction, saveMatchResult, confirmAdvancement, saveFinalists,
      saveAwards, savePollPrediction, saveExtras, updateConfig, updateConfigResults,
      deletePlayer, recomputeAllScores
    ]
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/* ====================================================================== */
/* SUPABASE MODE                                                          */
/* ====================================================================== */

/* ---------- snake_case ↔ camelCase mappers ---------- */

const fromConfigRow = (r) => r ? ({
  sharedPassword:       r.shared_password,
  predictionsOpen:      r.predictions_open,
  tournamentStartsAt:   r.tournament_starts_at,
  roundMultipliers:     r.round_multipliers,
  pollVotingOpen:       r.poll_voting_open,
  awardsAnnounced:      r.awards_announced,
  results:              r.results || {},
  tournamentOdds:       r.tournament_odds || {},
  lastFetchAt:          r.last_fetch_at || null
}) : null;

const fromTeamRow = (r) => ({
  code:    r.code,
  name:    r.name,
  group:   r.group_letter,
  flagUrl: r.flag_url
});

const fromMatchRow = (r) => ({
  id:               r.id,
  apiId:            r.api_id,
  stage:            r.stage,
  group:            r.group_letter,
  matchday:         r.matchday,
  homeTeam:         r.home_team,
  awayTeam:         r.away_team,
  homePlaceholder:  r.home_placeholder,
  awayPlaceholder:  r.away_placeholder,
  kickoffAt:        r.kickoff_at,
  status:           r.status,
  homeScore:        r.home_score,
  awayScore:        r.away_score,
  winner:           r.winner,
  odds:             r.odds
});

const fromPlayerRow = (r) => ({
  id:        r.id,
  name:      r.name,
  isAdmin:   r.is_admin,
  createdAt: r.created_at,
  points:    r.points || { matches:0, advancement:0, finalists:0, awards:0, poll:0, total:0 },
  stats:     r.stats  || { predictionsMade:0, exactScores:0 }
});

const fromPredictionRow = (r) => ({
  playerId:  r.player_id,
  matchId:   r.match_id,
  stage:     r.stage,
  homeScore: r.home_score,
  awayScore: r.away_score,
  advancer:  r.advancer || null,
  points:    r.points,
  updatedAt: r.updated_at
});

const fromAdvRow = (r) => ({ teams: r.teams || [], confirmedAt: r.confirmed_at, points: r.points });
const fromFinRow = (r) => ({ finalists: r.finalists || [], points: r.points });
const fromAwdRow = (r) => ({
  bestPlayer: r.best_player, youngPlayer: r.young_player,
  goalkeeper: r.goalkeeper, topScorer: r.top_scorer,
  points: r.points
});
const fromPollRow = (r) => ({
  darkHorse: r.dark_horse, disappointment: r.disappointment, points: r.points
});

const fromExtraRow = (r) => ({
  champion:         r.champion,
  firstGoalBrazil:  r.first_goal_brazil,
  lastGoalBrazil:   r.last_goal_brazil,
  hundredthGoal:    r.hundredth_goal,
  totalGoalsWC:     r.total_goals_wc,
  neymarGA:         r.neymar_ga,
  topScorerGoals:   r.top_scorer_goals,
  points:           r.points
});

/**
 * Fetch EVERY row of a table, paging past PostgREST's default 1000-row cap.
 *
 * Critical for `predictions`: once a league passes 1000 prediction rows
 * (104 matches × ~15 players can reach ~1500), a plain `.select('*')`
 * silently returns only the first 1000 — so the rows past the cap never
 * load and those picks "disappear" from the UI even though they're saved
 * in the DB. This pages in 1000-row chunks until the table is exhausted.
 */
async function fetchAllRows(table) {
  const PAGE = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) { console.error(`fetchAllRows(${table})`, error); break; }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function SupabaseDataProvider({ children }) {
  const { session } = useAuth();

  const [config, setConfig] = useState(null);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [predictions, setPredictions] = useState({});         // key: `${playerId}_${matchId}`
  const [advancementPredictions, setAdvancementPredictions] = useState({}); // key: playerId
  const [finalsPredictions, setFinalsPredictions] = useState({});
  const [awardPredictions, setAwardPredictions] = useState({});
  const [pollPredictions, setPollPredictions] = useState({});
  const [extraPredictions, setExtraPredictions] = useState({});
  const [adminActions, setAdminActions] = useState([]); // audit log rows
  const [loading, setLoading] = useState(true);

  /* -------------- Initial fetch + realtime channels -------------- */
  useEffect(() => {
    // Wait for the user to be signed in before fetching/subscribing —
    // the RLS policies are scoped to `authenticated` and we don't want
    // a barrage of permission-denied errors on the login screen.
    if (!session) {
      setConfig(null);
      setTeams([]);
      setMatches([]);
      setPlayers([]);
      setPredictions({});
      setAdvancementPredictions({});
      setFinalsPredictions({});
      setAwardPredictions({});
      setPollPredictions({});
      setExtraPredictions({});
      setLoading(true);
      return;
    }

    let cancelled = false;
    const channels = [];

    const upsertById = (setter, mapper, idKey = 'id') => (payload) => {
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.[idKey];
        if (id == null) return;
        setter((prev) => prev.filter(x => x[idKey === 'id' ? 'id' : idKey] !== id));
        return;
      }
      const row = mapper(payload.new);
      setter((prev) => {
        const i = prev.findIndex(x => x.id === row.id);
        if (i === -1) return [...prev, row];
        const copy = prev.slice();
        copy[i] = row;
        return copy;
      });
    };

    const upsertKeyed = (setter, mapper, keyFn) => (payload) => {
      if (payload.eventType === 'DELETE') {
        const key = keyFn(payload.old);
        setter((prev) => {
          const out = { ...prev };
          delete out[key];
          return out;
        });
        return;
      }
      const row = mapper(payload.new);
      const key = keyFn(payload.new);
      setter((prev) => ({ ...prev, [key]: row }));
    };

    (async () => {
      // ---- Initial fetch (parallel) ----
      const [
        cfgRes, teamsRes, matchesRes, playersRes,
        predsRes, advRes, finRes, awdRes, pollRes, extraRes
      ] = await Promise.all([
        supabase.from('config').select('*').eq('id', 'tournament').maybeSingle(),
        supabase.from('teams').select('*'),
        supabase.from('matches').select('*'),
        supabase.from('players').select('*'),
        // Paginated: predictions can exceed PostgREST's 1000-row cap, which
        // would silently drop picks past row 1000 (they vanish from the UI).
        fetchAllRows('predictions').then((data) => ({ data })),
        supabase.from('advancement_predictions').select('*'),
        supabase.from('finals_predictions').select('*'),
        supabase.from('award_predictions').select('*'),
        supabase.from('poll_predictions').select('*'),
        supabase.from('extra_predictions').select('*')
      ]);

      if (cancelled) return;

      // Audit log (best-effort — table may not exist if migration 0008
      // hasn't been applied to this league yet; we silently fall back
      // to an empty list so /admin can keep rendering.)
      try {
        const { data: aaRows } = await supabase
          .from('admin_actions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (aaRows) setAdminActions(aaRows);
      } catch { /* table missing — ignore */ }

      if (cfgRes.data)     setConfig(fromConfigRow(cfgRes.data));
      if (teamsRes.data)   setTeams(teamsRes.data.map(fromTeamRow));
      if (matchesRes.data) setMatches(matchesRes.data.map(fromMatchRow));
      if (playersRes.data) setPlayers(playersRes.data.map(fromPlayerRow));

      if (predsRes.data) {
        const m = {};
        for (const r of predsRes.data) {
          const p = fromPredictionRow(r);
          m[`${p.playerId}_${p.matchId}`] = p;
        }
        setPredictions(m);
      }

      const buildKeyed = (rows, mapper) => {
        const m = {};
        for (const r of rows || []) m[r.player_id] = mapper(r);
        return m;
      };
      setAdvancementPredictions(buildKeyed(advRes.data, fromAdvRow));
      setFinalsPredictions(buildKeyed(finRes.data, fromFinRow));
      setAwardPredictions(buildKeyed(awdRes.data, fromAwdRow));
      setPollPredictions(buildKeyed(pollRes.data, fromPollRow));
      setExtraPredictions(buildKeyed(extraRes.data, fromExtraRow));

      setLoading(false);

      // ---- Realtime channels ----
      channels.push(
        supabase
          .channel('rt-config')
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'config' },
              (payload) => {
                if (!payload.new) return;
                setConfig(fromConfigRow(payload.new));
              })
          .subscribe()
      );

      channels.push(
        supabase
          .channel('rt-teams')
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'teams' },
              (payload) => {
                if (payload.eventType === 'DELETE') {
                  const code = payload.old?.code;
                  setTeams((prev) => prev.filter(t => t.code !== code));
                  return;
                }
                const row = fromTeamRow(payload.new);
                setTeams((prev) => {
                  const i = prev.findIndex(t => t.code === row.code);
                  if (i === -1) return [...prev, row];
                  const copy = prev.slice();
                  copy[i] = row;
                  return copy;
                });
              })
          .subscribe()
      );

      channels.push(
        supabase
          .channel('rt-matches')
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'matches' },
              upsertById(setMatches, fromMatchRow))
          .subscribe()
      );

      channels.push(
        supabase
          .channel('rt-players')
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'players' },
              upsertById(setPlayers, fromPlayerRow))
          .subscribe()
      );

      channels.push(
        supabase
          .channel('rt-predictions')
          .on('postgres_changes',
              { event: '*', schema: 'public', table: 'predictions' },
              upsertKeyed(setPredictions, fromPredictionRow,
                          (r) => `${r.player_id}_${r.match_id}`))
          .subscribe()
      );

      const tlMappers = [
        ['advancement_predictions', setAdvancementPredictions, fromAdvRow],
        ['finals_predictions',      setFinalsPredictions,      fromFinRow],
        ['award_predictions',       setAwardPredictions,       fromAwdRow],
        ['poll_predictions',        setPollPredictions,        fromPollRow],
        ['extra_predictions',       setExtraPredictions,       fromExtraRow]
      ];
      for (const [table, setter, mapper] of tlMappers) {
        channels.push(
          supabase
            .channel(`rt-${table}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table },
                upsertKeyed(setter, mapper, (r) => r.player_id))
            .subscribe()
        );
      }
    })();

    return () => {
      cancelled = true;
      for (const ch of channels) supabase.removeChannel(ch);
    };
  }, [session]);

  /* -------------- Derived selectors -------------- */
  const teamsByCode = useMemo(() => {
    const out = {};
    for (const t of teams) out[t.code] = t;
    return out;
  }, [teams]);

  const teamsByGroup = useMemo(() => {
    const out = {};
    for (const t of teams) {
      if (!t.group) continue;
      if (!out[t.group]) out[t.group] = [];
      out[t.group].push(t.code);
    }
    return out;
  }, [teams]);

  const me = useMemo(
    () => players.find(p => p.id === session?.id) || null,
    [players, session]
  );

  const groupMatches = useMemo(
    () => matches.filter(m => m.stage === 'group'),
    [matches]
  );

  const predictionsByMatchForMe = useMemo(() => {
    if (!session) return {};
    const out = {};
    for (const p of Object.values(predictions)) {
      if (p.playerId === session.id) out[p.matchId] = p;
    }
    return out;
  }, [predictions, session]);

  const predictionsByPlayer = useMemo(() => {
    const out = {};
    for (const p of Object.values(predictions)) {
      if (!out[p.playerId]) out[p.playerId] = {};
      out[p.playerId][p.matchId] = p;
    }
    return out;
  }, [predictions]);

  const teamBoosts = useMemo(
    () => rankBoostsFromChampionOdds(config?.tournamentOdds || {}),
    [config]
  );

  /* -------------- Mutators -------------- */
  // Soft pause: admin can flip predictions_open to false in /admin to
  // freeze every saver. The hard lock is still the RLS check against
  // tournament_starts_at; this one stops in-app before hitting Postgres.
  const paused = config?.predictionsOpen === false;
  // Tournament-long predictions also lock at the apito inicial — once
  // tournament_starts_at is in the past, the DB-side RLS rejects writes
  // (silently from the user's POV). Mirror that on the client so the
  // UI can disable buttons and stop showing fake "Salvo" toasts.
  const tournamentLocked = !!config?.tournamentStartsAt &&
    new Date(config.tournamentStartsAt).getTime() <= Date.now();
  const longLocked = paused || tournamentLocked;

  const savePrediction = useCallback(async (matchId, { homeScore, awayScore, advancer }) => {
    // IMPORTANT: this function THROWS on any failure so the UI can show a
    // real error and keep the unsaved draft. Never swallow errors here —
    // a silent failure makes the user think a pick saved when it didn't.
    if (!session) throw new Error('Sua sessão expirou. Saia e entre de novo.');
    if (paused) throw new Error('Os palpites estão pausados pelo admin.');
    const match = matches.find(m => m.id === matchId);
    if (!match) throw new Error('Jogo não encontrado — recarrega a página.');
    // Trava de horário no relógio local: rejeita palpite depois do apito
    // inicial mesmo que o cron ainda não tenha mudado o status do jogo.
    // (O RLS no Supabase é a trava dura no servidor; esta é a primeira
    // barreira, pra UI não fingir que salvou.)
    if (isMatchLocked(match, config?.tournamentStartsAt)) {
      throw new Error('Esse jogo já começou — os palpites travaram.');
    }
    const payload = {
      player_id: session.id,
      match_id: matchId,
      stage: match.stage,
      home_score: homeScore,
      away_score: awayScore,
      // Sempre grava o advancer (null quando não é empate) pra limpar
      // qualquer escolha antiga de "quem passa" ao trocar de empate p/
      // placar decisivo. Antes só gravava quando != null e deixava resíduo.
      advancer: advancer ?? null,
      points: 0,
      updated_at: new Date().toISOString()
    };

    // Safety-net: keep a local copy of every save in localStorage. If
    // Supabase has a wobble during a match, the user (or admin) can
    // recover the picks from the browser. Single row per (player, match).
    try {
      const key = `bolao-pred-${session.id}-${matchId}`;
      localStorage.setItem(key, JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
    } catch { /* private mode / quota — ignore */ }

    // `.select()` makes the write self-verifying: if RLS silently drops it
    // or the row doesn't come back, we treat it as a failure instead of a
    // fake success.
    const { data, error } = await supabase
      .from('predictions')
      .upsert(payload, { onConflict: 'player_id,match_id' })
      .select();
    if (error) {
      console.error('savePrediction', error);
      throw new Error('Não consegui salvar (' + (error.message || 'erro de rede') + '). Tenta de novo.');
    }
    if (!data || data.length === 0) {
      throw new Error('O palpite não foi confirmado pelo servidor. Tenta de novo.');
    }

    // Auto-classificação: changing a group placar shifts the standings,
    // so re-derive the 32 advancing teams and upsert advancement_predictions
    // automatically. No more "Confirmar" button on /palpites.
    if (match.stage === 'group') {
      const updatedForMe = {
        ...predictionsByMatchForMe,
        [matchId]: { matchId, stage: 'group', homeScore, awayScore }
      };
      const predicted = predictedMatchesFromPlayer({
        groupMatches, predictionsByMatchId: updatedForMe
      });
      const standings = computeStandings({ matches: predicted, teamsByGroup });
      const advancingTeams = Array.from(standings.advancing);
      const { error: advErr } = await supabase
        .from('advancement_predictions')
        .upsert({
          player_id:    session.id,
          teams:        advancingTeams,
          confirmed_at: new Date().toISOString(),
          points:       0
        }, { onConflict: 'player_id' });
      if (advErr) console.error('auto-advancement upsert', advErr);
    }
  }, [session, matches, paused, config, predictionsByMatchForMe, groupMatches, teamsByGroup]);

  const saveMatchResult = useCallback(async (matchId, { homeScore, awayScore, status }) => {
    if (!me?.isAdmin) return;
    const { error } = await supabase
      .from('matches')
      .update({ home_score: homeScore, away_score: awayScore, status })
      .eq('id', matchId);
    if (error) console.error('saveMatchResult', error);
    else { /* fire-and-forget log */ logAdminAction('match.override', matchId, { homeScore, awayScore, status }); }
  }, [me]);

  const confirmAdvancement = useCallback(async (teamsArr) => {
    if (!session) return;
    if (longLocked) { console.warn('confirmAdvancement blocked — tournament locked'); return; }
    const { error } = await supabase
      .from('advancement_predictions')
      .upsert({
        player_id: session.id,
        teams: teamsArr,
        confirmed_at: new Date().toISOString(),
        points: 0
      }, { onConflict: 'player_id' });
    if (error) console.error('confirmAdvancement', error);
  }, [session, longLocked]);

  const saveFinalists = useCallback(async (finalists) => {
    if (!session) return;
    if (longLocked) { console.warn('saveFinalists blocked — tournament locked'); return; }
    const { error } = await supabase
      .from('finals_predictions')
      .upsert({ player_id: session.id, finalists, points: 0 },
              { onConflict: 'player_id' });
    if (error) console.error('saveFinalists', error);
  }, [session, longLocked]);

  const saveAwards = useCallback(async ({ bestPlayer, youngPlayer, goalkeeper, topScorer }) => {
    if (!session) return;
    if (longLocked) { console.warn('saveAwards blocked — tournament locked'); return; }
    const { error } = await supabase
      .from('award_predictions')
      .upsert({
        player_id: session.id,
        best_player: bestPlayer || null,
        young_player: youngPlayer || null,
        goalkeeper: goalkeeper || null,
        top_scorer: topScorer || null,
        points: 0
      }, { onConflict: 'player_id' });
    if (error) console.error('saveAwards', error);
  }, [session, longLocked]);

  const savePollPrediction = useCallback(async ({ darkHorse, disappointment }) => {
    if (!session) return;
    if (longLocked) { console.warn('savePollPrediction blocked — tournament locked'); return; }
    const { error } = await supabase
      .from('poll_predictions')
      .upsert({
        player_id: session.id,
        dark_horse: darkHorse || null,
        disappointment: disappointment || null,
        points: 0
      }, { onConflict: 'player_id' });
    if (error) console.error('savePollPrediction', error);
  }, [session, longLocked]);

  const saveExtras = useCallback(async (extras) => {
    if (!session) return;
    if (longLocked) { console.warn('saveExtras blocked — tournament locked'); return; }
    // Partial update: only override fields that are explicitly present in
    // `extras`. Fields not passed get preserved from the existing row.
    const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
    const KEYMAP = {
      champion:        'champion',
      firstGoalBrazil: 'first_goal_brazil',
      lastGoalBrazil:  'last_goal_brazil',
      hundredthGoal:   'hundredth_goal',
      totalGoalsWC:    'total_goals_wc',
      neymarGA:        'neymar_ga',
      topScorerGoals:  'top_scorer_goals'
    };
    const NUMERIC = new Set(['totalGoalsWC','neymarGA','topScorerGoals']);

    // Fetch existing so we can merge.
    const { data: existing } = await supabase
      .from('extra_predictions')
      .select('*')
      .eq('player_id', session.id)
      .maybeSingle();

    const merged = { ...(existing || { player_id: session.id }), points: 0 };
    for (const [camelKey, snakeKey] of Object.entries(KEYMAP)) {
      if (Object.prototype.hasOwnProperty.call(extras, camelKey)) {
        const val = extras[camelKey];
        merged[snakeKey] = NUMERIC.has(camelKey) ? numOrNull(val) : (val || null);
      }
    }
    delete merged.mbappe_record; // legacy column — leave nullable in DB, just don't write to it

    const { error } = await supabase
      .from('extra_predictions')
      .upsert(merged, { onConflict: 'player_id' });
    if (error) console.error('saveExtras', error);
  }, [session, longLocked]);

  // Audit log writer. Best-effort: if the admin_actions table isn't
  // available on this league yet (pre-0008 migration), we silently fail
  // so admin work isn't blocked. Otherwise inserts one row per action.
  const logAdminAction = useCallback(async (action, target, payload) => {
    if (!me?.isAdmin) return;
    try {
      await supabase.from('admin_actions').insert({
        actor_id:   session?.id,
        actor_name: me.name,
        action,
        target: target ?? null,
        payload: payload ?? null
      });
    } catch { /* table missing — ignore */ }
  }, [me, session]);

  const updateConfig = useCallback(async (patch) => {
    if (!me?.isAdmin) return;
    // Convert camelCase patch keys to snake_case columns we know about.
    const row = {};
    if ('predictionsOpen'    in patch) row.predictions_open     = patch.predictionsOpen;
    if ('pollVotingOpen'     in patch) row.poll_voting_open     = patch.pollVotingOpen;
    if ('awardsAnnounced'    in patch) row.awards_announced     = patch.awardsAnnounced;
    if ('tournamentStartsAt' in patch) row.tournament_starts_at = patch.tournamentStartsAt;
    if ('roundMultipliers'   in patch) row.round_multipliers    = patch.roundMultipliers;
    if ('sharedPassword'     in patch) row.shared_password      = patch.sharedPassword;
    if ('tournamentOdds'     in patch) row.tournament_odds      = patch.tournamentOdds;
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('config').update(row).eq('id', 'tournament');
    if (error) console.error('updateConfig', error);
    else logAdminAction('config.update', 'tournament', patch);
  }, [me, logAdminAction]);

  const updateConfigResults = useCallback(async (patch) => {
    if (!me?.isAdmin) return;
    const merged = { ...(config?.results || {}), ...patch };
    const { error } = await supabase
      .from('config')
      .update({ results: merged })
      .eq('id', 'tournament');
    if (error) console.error('updateConfigResults', error);
    else logAdminAction('config.results.update', 'tournament', patch);
  }, [me, config, logAdminAction]);

  const deletePlayer = useCallback(async (playerId) => {
    if (!me?.isAdmin) return;
    const victim = players.find(p => p.id === playerId);
    // RLS allows admin to delete; ON DELETE CASCADE removes predictions/etc.
    // The auth.users row stays — if they log back in with same name+PIN
    // they'll get a fresh players row (with no points). Admin can re-delete.
    const { error } = await supabase.from('players').delete().eq('id', playerId);
    if (error) console.error('deletePlayer', error);
    else logAdminAction('player.delete', playerId, { name: victim?.name });
  }, [me, players, logAdminAction]);

  const recomputeAllScores = useCallback(async () => {
    // The cron is authoritative in Supabase mode. UI just surfaces a notice.
    console.warn('recomputeAllScores in Supabase mode is owned by the GitHub Actions cron — trigger a manual run there.');
    logAdminAction('scores.recompute_request', null, null);
  }, [logAdminAction]);

  const value = useMemo(
    () => ({
      config, teams, teamsByCode, teamsByGroup,
      matches, groupMatches, players, predictions,
      predictionsByMatchForMe, predictionsByPlayer,
      advancementPredictions, finalsPredictions, awardPredictions, pollPredictions,
      extraPredictions,
      teamBoosts,
      me, loading,
      adminActions, logAdminAction,
      tournamentLocked,
      savePrediction, saveMatchResult, confirmAdvancement, saveFinalists,
      saveAwards, savePollPrediction, saveExtras, updateConfig, updateConfigResults,
      deletePlayer, recomputeAllScores
    }),
    [
      config, teams, teamsByCode, teamsByGroup,
      matches, groupMatches, players, predictions,
      predictionsByMatchForMe, predictionsByPlayer,
      advancementPredictions, finalsPredictions, awardPredictions, pollPredictions,
      extraPredictions,
      teamBoosts,
      me, loading,
      adminActions, logAdminAction,
      tournamentLocked,
      savePrediction, saveMatchResult, confirmAdvancement, saveFinalists,
      saveAwards, savePollPrediction, saveExtras, updateConfig, updateConfigResults,
      deletePlayer, recomputeAllScores
    ]
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
