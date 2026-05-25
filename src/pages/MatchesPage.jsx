import { useCallback, useMemo, useState } from 'react';
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
    matches, teamsByCode, predictionsByMatchForMe,
    config, savePrediction
  } = useData();
  const { show } = useToast();

  const [filter, setFilter] = useState('future');
  const [predFilter, setPredFilter] = useState('all');
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
    const arr = matches.filter(m =>
      primary(m) && secondary(m, predictionsByMatchForMe)
    );
    const rank = (m) => m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2;
    return [...arr].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      const ta = new Date(a.kickoffAt).getTime();
      const tb = new Date(b.kickoffAt).getTime();
      return a.status === 'finished' ? tb - ta : ta - tb;
    });
  }, [matches, filter, predFilter, predictionsByMatchForMe]);

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

  return (
    <>
      <h2 className="page-title">Jogos</h2>
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
