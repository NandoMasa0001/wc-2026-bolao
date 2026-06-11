import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MatchCard from '../components/MatchCard.jsx';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../components/Toast.jsx';
import './MatchesPage.css';

/** Primary filter (stage/status). */
const FILTERS = [
  { key: 'future', label: 'Todos',       match: (m) => m.status !== 'finished' },
  { key: 'past',   label: 'Passados',    match: (m) => m.status === 'finished' },
  { key: 'md1',    label: '1ª rodada',   match: (m) => m.stage === 'group' && m.matchday === 1 },
  { key: 'md2',    label: '2ª rodada',   match: (m) => m.stage === 'group' && m.matchday === 2 },
  { key: 'md3',    label: '3ª rodada',   match: (m) => m.stage === 'group' && m.matchday === 3 },
  { key: 'r32',    label: '32-avos',     match: (m) => m.stage === 'r32' },
  { key: 'r16',    label: 'Oitavas',     match: (m) => m.stage === 'r16' },
  { key: 'qf',     label: 'Quartas',     match: (m) => m.stage === 'qf' },
  { key: 'sf',     label: 'Semi',        match: (m) => m.stage === 'sf' || m.stage === 'third' },
  { key: 'final',  label: 'Final',       match: (m) => m.stage === 'final' }
];

/** Secondary filter (predicted status), combined with the primary above. */
const PRED_FILTERS = [
  { key: 'all',       label: 'Todos',       match: () => true },
  { key: 'predicted', label: 'Já palpitei', match: (m, preds) => !!preds[m.id] },
  { key: 'pending',   label: 'Faltam',      match: (m, preds) =>
      !preds[m.id] && m.status === 'scheduled' && m.homeTeam && m.awayTeam }
];

function dayKey(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'short'
  });
}

export default function MatchesPage() {
  const {
    matches, teamsByCode, predictionsByMatchForMe, predictions,
    finalsPredictions, awardPredictions, pollPredictions, extraPredictions,
    advancementPredictions,
    players, me, config, savePrediction
  } = useData();
  const { show } = useToast();

  const [filter, setFilter] = useState('future');
  const [predFilter, setPredFilter] = useState('all');

  const tournamentStarted = config?.tournamentStartsAt
    ? new Date(config.tournamentStartsAt).getTime() <= Date.now()
    : false;

  // For each match, build the list of {player, prediction} from ALL players.
  // Only used to feed the per-card "ver palpites" modal once the tournament
  // has started.
  const picksByMatch = useMemo(() => {
    if (!tournamentStarted) return {};
    const playersById = Object.fromEntries((players || []).map(p => [p.id, p]));
    const out = {};
    for (const pred of Object.values(predictions || {})) {
      const player = playersById[pred.playerId];
      if (!player) continue;
      if (!out[pred.matchId]) out[pred.matchId] = [];
      out[pred.matchId].push({ player, prediction: pred });
    }
    for (const key of Object.keys(out)) {
      out[key].sort((a, b) => {
        const pa = a.prediction.points || 0;
        const pb = b.prediction.points || 0;
        if (pb !== pa) return pb - pa;
        return a.player.name.localeCompare(b.player.name, 'pt-BR');
      });
    }
    return out;
  }, [tournamentStarted, predictions, players]);
  // Drafts: { [matchId]: { homeScore, awayScore } }. Picks the user has
  // touched but not yet committed via per-card or bulk save.
  const [drafts, setDrafts] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const onDraftChange = useCallback((matchId, value) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (value == null) {
        delete next[matchId];
      } else {
        next[matchId] = value;
      }
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    const primary   = FILTERS.find(f => f.key === filter)?.match     || (() => true);
    const secondary = PRED_FILTERS.find(f => f.key === predFilter)?.match || (() => true);
    const arr = matches.filter(m => {
      // Amistosos de teste só aparecem pro admin — não vão pra Jogos da galera.
      if (m.stage === 'friendly' && !me?.isAdmin) return false;
      return primary(m) && secondary(m, predictionsByMatchForMe);
    });
    const rank = (m) => m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2;
    return [...arr].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      const ta = new Date(a.kickoffAt).getTime();
      const tb = new Date(b.kickoffAt).getTime();
      return a.status === 'finished' ? tb - ta : ta - tb;
    });
  }, [matches, filter, predFilter, predictionsByMatchForMe, me]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const m of visible) {
      const k = dayKey(m.kickoffAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    }
    return Array.from(map.entries());
  }, [visible]);

  const handleSave = (match) => (pick) => {
    savePrediction(match.id, pick);
    show('Palpite salvo', { variant: 'success' });
  };

  const draftCount = Object.keys(drafts).length;

  const saveAll = async () => {
    if (draftCount === 0) return;
    setBulkSaving(true);
    const entries = Object.entries(drafts);
    let saved = 0;
    for (const [matchId, pick] of entries) {
      try {
        await savePrediction(matchId, pick);
        saved += 1;
      } catch (err) {
        console.error('bulk save', matchId, err);
      }
    }
    setDrafts({});
    setBulkSaving(false);
    show(`${saved} palpite${saved === 1 ? '' : 's'} salvo${saved === 1 ? '' : 's'}`, { variant: 'success' });
  };

  // Total de gols na Copa até agora — soma placares finais + parciais.
  // Esconde depois que passar de 100 (já saiu, ninguém mais precisa
  // do contador).
  const totalGoals = useMemo(() => {
    let g = 0;
    for (const m of matches) {
      if (m.stage !== 'group' && m.stage !== 'r32' && m.stage !== 'r16' &&
          m.stage !== 'qf' && m.stage !== 'sf' && m.stage !== 'third' && m.stage !== 'final') continue;
      if (m.homeScore != null) g += m.homeScore;
      if (m.awayScore != null) g += m.awayScore;
    }
    return g;
  }, [matches]);

  return (
    <>
      <div className="matches-header">
        <h2 className="page-title">Jogos</h2>
        <Link to="/consenso" className="matches-header__link">
          Ver consenso →
        </Link>
      </div>

      {totalGoals > 0 && totalGoals < 100 && (
        <GoalCounter total={totalGoals} />
      )}

      <SpecialsBanner
        me={me}
        tournamentStartsAt={config?.tournamentStartsAt}
        finals={me ? finalsPredictions[me.id] : null}
        awards={me ? awardPredictions[me.id] : null}
        poll={me ? pollPredictions[me.id] : null}
        extras={me ? extraPredictions[me.id] : null}
      />
      <PendingNudge
        me={me}
        advancementPred={me ? advancementPredictions[me.id] : null}
        tournamentStartsAt={config?.tournamentStartsAt}
        finals={me ? finalsPredictions[me.id] : null}
        awards={me ? awardPredictions[me.id] : null}
        poll={me ? pollPredictions[me.id] : null}
        extras={me ? extraPredictions[me.id] : null}
      />

      <div className="matches-filter" role="group" aria-label="Filtrar por fase">
        {FILTERS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            aria-pressed={filter === key}
            className={'chip' + (filter === key ? ' chip--active' : '')}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="matches-filter matches-filter--secondary" role="group" aria-label="Filtrar pelos meus palpites">
        {PRED_FILTERS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            aria-pressed={predFilter === key}
            className={'chip chip--secondary' + (predFilter === key ? ' chip--active' : '')}
            onClick={() => setPredFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            predFilter === 'predicted' ? 'Nada palpitado nesse filtro' :
            predFilter === 'pending' ? 'Tudo palpitado! 🎉' :
            'Nenhum jogo nesse filtro'
          }
          body={
            predFilter === 'predicted' ? 'Você ainda não palpitou nenhum desses.' :
            predFilter === 'pending' ? 'Todos os jogos pickeáveis dessa seleção já têm seu palpite.' :
            'Tenta outra fase — a maior parte dos palpites é na fase de grupos.'
          }
        />
      ) : (
        <div className="matches-day-stack">
          {groups.map(([day, list]) => (
            <section key={day} className="matches-day">
              <h3 className="matches-day__title">{day}</h3>
              <div className="matches-grid">
                {list.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    homeTeam={teamsByCode[match.homeTeam]}
                    awayTeam={teamsByCode[match.awayTeam]}
                    prediction={predictionsByMatchForMe[match.id]}
                    multipliers={config?.roundMultipliers}
                    tournamentStartsAt={config?.tournamentStartsAt}
                    allPlayerPicks={picksByMatch[match.id]}
                    draft={drafts[match.id]}
                    onDraftChange={onDraftChange}
                    onSave={handleSave(match)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Sticky bulk-save bar */}
      {draftCount > 0 && (
        <div className="bulk-save-bar" role="region" aria-label="Salvar palpites em lote">
          <span className="bulk-save-bar__count">
            {draftCount} palpite{draftCount === 1 ? '' : 's'} não salvo{draftCount === 1 ? '' : 's'}
          </span>
          <div className="bulk-save-bar__actions">
            <Button variant="ghost" onClick={() => setDrafts({})} disabled={bulkSaving}>
              Descartar
            </Button>
            <Button variant="primary" onClick={saveAll} loading={bulkSaving}>
              Salvar todos
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Banner reminding the user that there are tournament-long predictions
 * beyond the 104 group-stage games. Hides once they've started filling
 * any (or once they manually dismiss, or once the tournament locks).
 */
function SpecialsBanner({ me, tournamentStartsAt, finals, awards, poll, extras }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('specials-banner-dismissed') === '1'; }
    catch { return false; }
  });
  if (dismissed) return null;
  if (!me) return null;

  const tournamentStarted = tournamentStartsAt
    ? new Date(tournamentStartsAt).getTime() <= Date.now()
    : false;
  if (tournamentStarted) return null;

  const hasAny =
    !!(finals?.finalists?.length) ||
    !!(awards && (awards.bestPlayer || awards.youngPlayer || awards.goalkeeper || awards.topScorer)) ||
    !!(poll?.darkHorse || poll?.disappointment) ||
    !!(extras && (extras.champion || extras.totalGoalsWC != null || extras.neymarGA != null ||
                  extras.topScorerGoals != null || extras.firstGoalBrazil || extras.lastGoalBrazil ||
                  extras.hundredthGoal));
  if (hasAny) return null;

  const dismiss = () => {
    try { localStorage.setItem('specials-banner-dismissed', '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="specials-banner" role="region" aria-label="Lembrete de palpites especiais">
      <div className="specials-banner__body">
        <span className="specials-banner__icon" aria-hidden="true">🏆</span>
        <span className="specials-banner__text">
          <strong>Não esqueça os palpites especiais!</strong>
          {' '}
          Campeão, finalistas, prêmios individuais, zebra e mais — todos travam junto no apito inicial.
        </span>
      </div>
      <div className="specials-banner__actions">
        <Link to="/predictions?tab=especiais" className="specials-banner__cta">
          Fazer agora →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="specials-banner__close"
          aria-label="Fechar lembrete"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * Persistent nudge showing the count of tournament-long predictions still
 * pending. Differs from SpecialsBanner: SpecialsBanner is a one-time
 * onboarding that hides as soon as the user fills any especial; this one
 * stays as long as anything is still missing, because it's easy to fill
 * one and forget the other six. Hides after tournament start (everything
 * locks, no point nagging).
 */
function PendingNudge({
  me, tournamentStartsAt, advancementPred,
  finals, awards, poll, extras
}) {
  if (!me) return null;
  const tournamentStarted = tournamentStartsAt
    ? new Date(tournamentStartsAt).getTime() <= Date.now()
    : false;
  if (tournamentStarted) return null;

  const checks = {
    advancement: !!(advancementPred && advancementPred.teams && advancementPred.teams.length > 0),
    champion:    !!extras?.champion,
    finalists:   finals?.finalists?.length === 2,
    awards:      !!(awards && (awards.bestPlayer || awards.youngPlayer || awards.goalkeeper || awards.topScorer)),
    poll:        !!(poll && (poll.darkHorse || poll.disappointment)),
    numericas:   !!(extras && (extras.totalGoalsWC != null || extras.neymarGA != null || extras.topScorerGoals != null)),
    quemmarca:   !!(extras && (extras.firstGoalBrazil || extras.lastGoalBrazil || extras.hundredthGoal))
  };
  const total = Object.keys(checks).length;
  const done = Object.values(checks).filter(Boolean).length;
  const pending = total - done;
  if (pending === 0) return null;

  return (
    <Link to="/predictions" className="pending-nudge" role="region" aria-label="Palpites pendentes">
      <span className="pending-nudge__icon" aria-hidden="true">📝</span>
      <span className="pending-nudge__text">
        <strong>{pending} {pending === 1 ? 'palpite pendente' : 'palpites pendentes'}</strong>
        {' '}— toque pra ver a lista de confirmações que faltam.
      </span>
      <span className="pending-nudge__arrow" aria-hidden="true">→</span>
    </Link>
  );
}

/**
 * Progresso "rumo ao gol 100 da Copa" — barra + contador visíveis no topo
 * da home. Some quando o gol 100 já foi marcado (aposta resolvida) ou
 * antes de qualquer gol sair.
 */
function GoalCounter({ total }) {
  const pct = Math.min(100, (total / 100) * 100);
  const remaining = 100 - total;
  return (
    <div className="goal-counter" role="region" aria-label="Contagem de gols na Copa">
      <div className="goal-counter__top">
        <span className="goal-counter__label">⚽ Gols na Copa</span>
        <span className="goal-counter__count">
          <strong>{total}</strong>
          <span className="goal-counter__sep">/</span>
          <span className="goal-counter__max">100</span>
        </span>
      </div>
      <div className="goal-counter__bar" aria-hidden="true">
        <div className="goal-counter__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="goal-counter__hint">
        {remaining === 1
          ? <>Próximo gol é o 100º — quem palpitou tá no fio da navalha.</>
          : remaining <= 10
          ? <>Faltam <strong>{remaining}</strong> gols pro 100º.</>
          : <>Faltam {remaining} gols pro 100º.</>}
      </div>
    </div>
  );
}
