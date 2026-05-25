import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import Pill from '../components/Pill.jsx';
import TeamChip from '../components/TeamChip.jsx';
import ScoreStepper from '../components/ScoreStepper.jsx';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../components/Toast.jsx';
import './AdminPage.css';

export default function AdminPage() {
  const {
    me, config, teams, matches, teamsByCode,
    saveMatchResult, updateConfig, updateConfigResults, recomputeAllScores
  } = useData();
  const { show } = useToast();

  if (!me?.isAdmin) {
    return <Navigate to="/matches" replace />;
  }

  return (
    <>
      <h2 className="page-title">Admin</h2>

      <section className="page-section">
        <h3 className="page-section__title">Vencedores dos prêmios</h3>
        <AwardsForm
          current={config.results}
          onSave={(next) => {
            updateConfigResults(next);
            updateConfig({ awardsAnnounced: true });
            show('Prêmios salvos', { variant: 'success' });
          }}
        />
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Votação da zebra</h3>
        <PollAdmin
          teams={teams}
          config={config}
          onToggle={(open) => {
            updateConfig({ pollVotingOpen: open });
            show(open ? 'Votação aberta' : 'Votação fechada', { variant: 'info' });
          }}
          onSetResult={(result) => {
            updateConfigResults(result);
            show('Resultado da votação salvo', { variant: 'success' });
          }}
        />
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Resultados das Extras</h3>
        <ExtrasResults
          teams={teams}
          current={config.results || {}}
          onSave={(patch) => {
            updateConfigResults(patch);
            show('Resultados extras salvos', { variant: 'success' });
          }}
        />
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Sobrescrever resultado</h3>
        <MatchOverride
          matches={matches}
          teamsByCode={teamsByCode}
          onSave={(matchId, vals) => {
            saveMatchResult(matchId, vals);
            show('Jogo atualizado', { variant: 'success' });
          }}
        />
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Recalcular</h3>
        <Card>
          <p className="muted">
            Roda novamente a engine de pontuação em todos os palpites. Use depois de sobrescrever um jogo manualmente.
          </p>
          <div style={{ marginTop: 'var(--sp-3)' }}>
            <Button variant="secondary" onClick={() => {
              recomputeAllScores();
              show('Pontuações recalculadas', { variant: 'success' });
            }}>
              Recalcular todas as pontuações
            </Button>
          </div>
        </Card>
      </section>
    </>
  );
}

function AwardsForm({ current, onSave }) {
  const [vals, setVals] = useState({
    bestPlayer:  current.bestPlayer  || '',
    youngPlayer: current.youngPlayer || '',
    goalkeeper:  current.goalkeeper  || '',
    topScorer:   current.topScorer   || ''
  });
  const update = (k) => (e) => setVals(v => ({ ...v, [k]: e.target.value }));

  return (
    <Card>
      <div className="pred-awards__grid">
        <label className="pred-field">
          <span>Melhor jogador (Bola de Ouro)</span>
          <input value={vals.bestPlayer} onChange={update('bestPlayer')} />
        </label>
        <label className="pred-field">
          <span>Melhor jogador jovem</span>
          <input value={vals.youngPlayer} onChange={update('youngPlayer')} />
        </label>
        <label className="pred-field">
          <span>Melhor goleiro (Luva de Ouro)</span>
          <input value={vals.goalkeeper} onChange={update('goalkeeper')} />
        </label>
        <label className="pred-field">
          <span>Artilheiro (Chuteira de Ouro)</span>
          <input value={vals.topScorer} onChange={update('topScorer')} />
        </label>
      </div>
      <div className="pred-confirm__row">
        <Button variant="primary" onClick={() => onSave(vals)}>Salvar prêmios</Button>
      </div>
    </Card>
  );
}

function PollAdmin({ teams, config, onToggle, onSetResult }) {
  const [darkHorse, setDarkHorse] = useState(config.results.darkHorse || '');
  const [disappointment, setDisappointment] = useState(config.results.disappointment || '');

  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          {config.pollVotingOpen
            ? <Pill variant="success">Votação aberta</Pill>
            : <Pill variant="locked">Votação fechada</Pill>}
        </span>
        <Button
          variant={config.pollVotingOpen ? 'ghost' : 'primary'}
          onClick={() => onToggle(!config.pollVotingOpen)}
        >
          {config.pollVotingOpen ? 'Fechar votação' : 'Abrir votação'}
        </Button>
      </div>

      <label className="pred-field">
        <span>Zebra oficial</span>
        <select value={darkHorse} onChange={(e) => setDarkHorse(e.target.value)}>
          <option value="">— nenhuma —</option>
          {teams.map(t => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
        </select>
      </label>

      <label className="pred-field">
        <span>Decepção oficial</span>
        <select value={disappointment} onChange={(e) => setDisappointment(e.target.value)}>
          <option value="">— nenhuma —</option>
          {teams.map(t => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
        </select>
      </label>

      <div className="pred-confirm__row">
        <Button
          variant="primary"
          onClick={() => onSetResult({ darkHorse, disappointment })}
        >
          Salvar resultado
        </Button>
      </div>
    </Card>
  );
}

function MatchOverride({ matches, teamsByCode, onSave }) {
  const [matchId, setMatchId] = useState(matches[0]?.id || '');
  const match = matches.find(m => m.id === matchId);
  const [home, setHome] = useState(match?.homeScore ?? 0);
  const [away, setAway] = useState(match?.awayScore ?? 0);
  const [status, setStatus] = useState(match?.status || 'finished');

  const pickMatch = (id) => {
    setMatchId(id);
    const m = matches.find(x => x.id === id);
    setHome(m?.homeScore ?? 0);
    setAway(m?.awayScore ?? 0);
    setStatus(m?.status || 'finished');
  };

  return (
    <Card>
      <label className="pred-field">
        <span>Jogo</span>
        <select value={matchId} onChange={(e) => pickMatch(e.target.value)}>
          {matches.map(m => {
            const h = teamsByCode[m.homeTeam]?.name || m.homePlaceholder || '?';
            const a = teamsByCode[m.awayTeam]?.name || m.awayPlaceholder || '?';
            return <option key={m.id} value={m.id}>{m.id} · {h} vs {a}</option>;
          })}
        </select>
      </label>

      {match && (
        <>
          <div className="admin-match__steppers">
            <div className="admin-match__team">
              <TeamChip team={teamsByCode[match.homeTeam]} placeholder={match.homePlaceholder} layout="stacked" showCode />
              <ScoreStepper value={home} onChange={setHome} ariaLabel="Placar mandante" />
            </div>
            <div className="admin-match__sep">–</div>
            <div className="admin-match__team">
              <TeamChip team={teamsByCode[match.awayTeam]} placeholder={match.awayPlaceholder} layout="stacked" showCode />
              <ScoreStepper value={away} onChange={setAway} ariaLabel="Placar visitante" />
            </div>
          </div>

          <label className="pred-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="scheduled">agendado</option>
              <option value="live">ao vivo</option>
              <option value="finished">encerrado</option>
            </select>
          </label>

          <div className="pred-confirm__row">
            <Button
              variant="primary"
              onClick={() => onSave(matchId, { homeScore: home, awayScore: away, status })}
            >
              Sobrescrever
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ExtrasResults({ teams, current, onSave }) {
  const [vals, setVals] = useState({
    champion:         current.champion         || '',
    totalGoalsWC:     current.totalGoalsWC     ?? '',
    neymarGA:         current.neymarGA         ?? '',
    topScorerGoals:   current.topScorerGoals   ?? '',
    firstGoalBrazil:  current.firstGoalBrazil  || '',
    lastGoalBrazil:   current.lastGoalBrazil   || '',
    hundredthGoal:    current.hundredthGoal    || '',
    mbappeRecord:     current.mbappeRecord ?? null
  });
  const update = (k) => (e) => setVals(v => ({ ...v, [k]: e.target.value }));
  const updateNum = (k) => (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    setVals(prev => ({ ...prev, [k]: v }));
  };

  return (
    <Card>
      <label className="pred-field">
        <span>Campeão</span>
        <select value={vals.champion} onChange={update('champion')}>
          <option value="">— ainda não definido —</option>
          {teams.map(t => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
        </select>
      </label>
      <label className="pred-field">
        <span>Total de gols na copa</span>
        <input type="text" inputMode="numeric" value={vals.totalGoalsWC} onChange={updateNum('totalGoalsWC')} />
      </label>
      <label className="pred-field">
        <span>G+A do Neymar</span>
        <input type="text" inputMode="numeric" value={vals.neymarGA} onChange={updateNum('neymarGA')} />
      </label>
      <label className="pred-field">
        <span>Nº de gols do artilheiro</span>
        <input type="text" inputMode="numeric" value={vals.topScorerGoals} onChange={updateNum('topScorerGoals')} />
      </label>
      <label className="pred-field">
        <span>Primeiro gol do Brasil (jogador)</span>
        <input type="text" value={vals.firstGoalBrazil} onChange={update('firstGoalBrazil')} />
      </label>
      <label className="pred-field">
        <span>Último gol do Brasil (jogador)</span>
        <input type="text" value={vals.lastGoalBrazil} onChange={update('lastGoalBrazil')} />
      </label>
      <label className="pred-field">
        <span>100º gol da copa (jogador)</span>
        <input type="text" value={vals.hundredthGoal} onChange={update('hundredthGoal')} />
      </label>
      <label className="pred-field">
        <span>Mbappé bateu o recorde?</span>
        <select
          value={vals.mbappeRecord === true ? 'yes' : vals.mbappeRecord === false ? 'no' : ''}
          onChange={(e) => {
            const v = e.target.value;
            setVals(prev => ({ ...prev, mbappeRecord: v === 'yes' ? true : v === 'no' ? false : null }));
          }}
        >
          <option value="">— ainda não definido —</option>
          <option value="yes">Sim</option>
          <option value="no">Não</option>
        </select>
      </label>
      <div className="pred-confirm__row">
        <Button
          variant="primary"
          onClick={() => onSave({
            champion:         vals.champion || null,
            totalGoalsWC:     vals.totalGoalsWC === '' ? null : Number(vals.totalGoalsWC),
            neymarGA:         vals.neymarGA === '' ? null : Number(vals.neymarGA),
            topScorerGoals:   vals.topScorerGoals === '' ? null : Number(vals.topScorerGoals),
            firstGoalBrazil:  vals.firstGoalBrazil || null,
            lastGoalBrazil:   vals.lastGoalBrazil || null,
            hundredthGoal:    vals.hundredthGoal || null,
            mbappeRecord:     vals.mbappeRecord
          })}
        >
          Salvar resultados extras
        </Button>
      </div>
    </Card>
  );
}
