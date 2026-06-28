import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import Pill from '../components/Pill.jsx';
import TeamChip from '../components/TeamChip.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useData } from '../context/DataContext.jsx';
import { effectiveBase } from '../lib/scoring.js';
import { isMatchLocked } from '../lib/locking.js';
import './ConsensoPage.css';

/**
 * /consenso — read-only stats page showing the spread of friends' picks
 * per match, for every match that has at least one prediction (including
 * still-open ones). Strictly informational.
 */

const STAGE_LABEL = {
  group: 'Grupos',
  r32:   '32-avos',
  r16:   'Oitavas',
  qf:    'Quartas',
  third: '3º lugar',
  sf:    'Semi',
  final: 'Final'
};

function outcomeLabel(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

function formatKickoff(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

export default function ConsensoPage() {
  const { matches, teamsByCode, predictions, players, config } = useData();
  const [filter, setFilter] = useState('all'); // all | finished | live

  const playersById = useMemo(() => {
    const m = {};
    for (const p of players) m[p.id] = p;
    return m;
  }, [players]);

  /**
   * Stats per match — any match with at least one prediction shows up.
   */
  const stats = useMemo(() => {
    const list = [];

    for (const m of matches) {
      // Privacidade: só mostra o consenso de um jogo depois que ele trava
      // (apito inicial dele). Antes disso ninguém vê o palpite alheio.
      if (!isMatchLocked(m, config?.tournamentStartsAt)) continue;

      const preds = Object.values(predictions).filter(p => p.matchId === m.id);
      if (preds.length === 0) continue; // hide matches with no picks

      // Tally outcomes
      const outcomes = { home: 0, draw: 0, away: 0 };
      const scoreCounts = new Map(); // key "h-a" → count
      let exactScores = [];          // players who nailed it (if finished)
      let outcomeHits = [];          // players who got the outcome right

      for (const pr of preds) {
        const lbl = outcomeLabel(pr.homeScore, pr.awayScore);
        outcomes[lbl] += 1;
        const key = `${pr.homeScore}-${pr.awayScore}`;
        scoreCounts.set(key, (scoreCounts.get(key) || 0) + 1);

        if (m.status === 'finished' && m.homeScore != null && m.awayScore != null) {
          const exact = pr.homeScore === m.homeScore && pr.awayScore === m.awayScore;
          const base = effectiveBase(pr, m, m.stage);
          if (exact) exactScores.push({ player: playersById[pr.playerId], score: key });
          else if (base >= 4) outcomeHits.push({ player: playersById[pr.playerId], score: key });
        }
      }

      // Most popular score
      const topScore = [...scoreCounts.entries()].sort((a, b) => b[1] - a[1])[0];

      list.push({
        match: m,
        preds,
        outcomes,
        topScore,
        exactScores,
        outcomeHits,
        totalPicks: preds.length
      });
    }

    // Sort: live first, then scheduled (chronological), then finished (newest first).
    const rank = (s) => s.match.status === 'live' ? 0 : s.match.status === 'scheduled' ? 1 : 2;
    list.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      const ta = new Date(a.match.kickoffAt).getTime();
      const tb = new Date(b.match.kickoffAt).getTime();
      // Scheduled: soonest first. Finished: most recent first.
      return a.match.status === 'finished' ? tb - ta : ta - tb;
    });

    return list;
  }, [matches, predictions, playersById, config]);

  const filtered = useMemo(() => {
    if (filter === 'all') return stats;
    return stats.filter(s => s.match.status === filter);
  }, [stats, filter]);

  return (
    <>
      <h2 className="page-title">Consenso</h2>
      <p className="muted consenso-help">
        Veja o que a maioria já palpitou em cada jogo. Aparecem só os jogos com pelo menos 1 palpite registrado.
      </p>

      <div className="matches-filter" role="group" aria-label="Filtrar por status">
        {[
          { key: 'all',       label: 'Todos' },
          { key: 'scheduled', label: 'A começar' },
          { key: 'live',      label: 'Ao vivo' },
          { key: 'finished',  label: 'Encerrados' }
        ].map(({ key, label }) => (
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

      {filtered.length === 0 ? (
        <EmptyState
          title="Sem palpites ainda"
          body="As estatísticas aparecem assim que alguém palpitar."
        />
      ) : (
        <div className="consenso-list">
          {filtered.map((s) => (
            <ConsensoCard key={s.match.id} {...s} teamsByCode={teamsByCode} />
          ))}
        </div>
      )}
    </>
  );
}

function ConsensoCard({ match: m, teamsByCode, outcomes, topScore, exactScores, outcomeHits, totalPicks }) {
  const home = teamsByCode[m.homeTeam];
  const away = teamsByCode[m.awayTeam];
  const isLive = m.status === 'live';
  const isFinished = m.status === 'finished';
  const homeName = home?.name || m.homePlaceholder || '?';
  const awayName = away?.name || m.awayPlaceholder || '?';

  // Outcome percentages
  const total = outcomes.home + outcomes.draw + outcomes.away;
  const pct = (n) => total === 0 ? 0 : Math.round(100 * n / total);

  return (
    <Card className="consenso-card">
      <header className="consenso-card__head">
        <div className="consenso-card__labels">
          {m.stage === 'group' && m.group && (
            <Pill variant="group" group={m.group}>Grupo {m.group}</Pill>
          )}
          {m.stage !== 'group' && (
            <Pill variant="neutral">{STAGE_LABEL[m.stage] || m.stage}</Pill>
          )}
          {isLive && <Pill variant="live">Ao vivo</Pill>}
          {isFinished && <Pill variant="success">Encerrado</Pill>}
          <Pill variant="neutral">{totalPicks} palpite{totalPicks === 1 ? '' : 's'}</Pill>
        </div>
        <time className="muted consenso-card__kickoff">{formatKickoff(m.kickoffAt)}</time>
      </header>

      <div className="consenso-card__teams">
        <TeamChip team={home} placeholder={m.homePlaceholder} layout="stacked" showCode />
        <div className="consenso-card__score tabular">
          {m.homeScore ?? '–'}<span className="muted">–</span>{m.awayScore ?? '–'}
        </div>
        <TeamChip team={away} placeholder={m.awayPlaceholder} layout="stacked" showCode />
      </div>

      {totalPicks === 0 ? (
        <p className="muted consenso-card__nopicks">Ninguém palpitou nesse jogo.</p>
      ) : (
        <>
          <div className="consenso-bars">
            <ConsensoBar label={`${homeName} vence`} pct={pct(outcomes.home)} count={outcomes.home} color="var(--c-blue)" />
            <ConsensoBar label="Empate" pct={pct(outcomes.draw)} count={outcomes.draw} color="var(--c-stone)" />
            <ConsensoBar label={`${awayName} vence`} pct={pct(outcomes.away)} count={outcomes.away} color="var(--c-green)" />
          </div>

          {topScore && (
            <p className="consenso-card__top">
              Palpite mais comum: <strong className="tabular">{topScore[0]}</strong> ({topScore[1]} {topScore[1] === 1 ? 'pessoa' : 'pessoas'})
            </p>
          )}

          {isFinished && exactScores.length > 0 && (
            <p className="consenso-card__hits">
              <strong>Cravadas ({exactScores.length}):</strong>{' '}
              {exactScores.map((e, i) => (
                <span key={e.player?.id || i}>
                  {i > 0 && ', '}
                  {e.player?.name || '?'}
                </span>
              ))}
            </p>
          )}
          {isFinished && exactScores.length === 0 && outcomeHits.length > 0 && (
            <p className="consenso-card__hits muted">
              <strong>Acertaram o resultado:</strong>{' '}
              {outcomeHits.map((e, i) => (
                <span key={e.player?.id || i}>
                  {i > 0 && ', '}
                  {e.player?.name || '?'}
                </span>
              ))}
            </p>
          )}
          {isFinished && exactScores.length === 0 && outcomeHits.length === 0 && (
            <p className="muted consenso-card__hits">Ninguém acertou nem o resultado.</p>
          )}
        </>
      )}
    </Card>
  );
}

function ConsensoBar({ label, pct, count, color }) {
  return (
    <div className="consenso-bar">
      <div className="consenso-bar__label">{label}</div>
      <div className="consenso-bar__track">
        <div
          className="consenso-bar__fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="consenso-bar__val tabular">{count} · {pct}%</div>
    </div>
  );
}
