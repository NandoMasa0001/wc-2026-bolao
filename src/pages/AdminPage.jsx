import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import Pill from '../components/Pill.jsx';
import TeamChip from '../components/TeamChip.jsx';
import ScoreStepper from '../components/ScoreStepper.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { supabase } from '../supabase.js';
import './AdminPage.css';

const BACKUP_TABLES = [
  'config', 'teams', 'matches', 'players',
  'predictions', 'advancement_predictions', 'finals_predictions',
  'award_predictions', 'poll_predictions', 'poll_votes', 'extra_predictions'
];

function leagueFromHost() {
  const h = typeof window !== 'undefined' ? window.location.hostname : '';
  if (h.includes('bolaofamilia') || h.includes('bolao-familia')) return 'familia';
  if (h.includes('bolao-scib')   || h.includes('bolaoscib'))     return 'scib';
  if (h.includes('bolaotrupe'))                                  return 'trupe';
  return 'manual';
}

async function downloadFullBackup() {
  const dump = {
    league: leagueFromHost(),
    dumpedAt: new Date().toISOString(),
    schemaVersion: 6,
    tables: {}
  };
  for (const t of BACKUP_TABLES) {
    const { data, error } = await supabase.from(t).select('*');
    if (error) throw new Error(`${t}: ${error.message}`);
    dump.tables[t] = data;
  }
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  a.download = `backup-${dump.league}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return BACKUP_TABLES.map(t => ({ table: t, rows: dump.tables[t]?.length || 0 }));
}

export default function AdminPage() {
  const { session } = useAuth();
  const {
    me, config, teams, matches, teamsByCode, players,
    saveMatchResult, updateConfig, updateConfigResults, recomputeAllScores, deletePlayer
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
        <h3 className="page-section__title">Jogadores</h3>
        <PlayersManager
          players={players}
          currentId={session?.id}
          onDelete={async (id, name) => {
            await deletePlayer(id);
            show(`${name} removido`, { variant: 'info' });
          }}
        />
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Backup & restauração</h3>
        <BackupSection show={show} />
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

function BackupSection({ show }) {
  const [busy, setBusy] = useState(false);
  const [lastReport, setLastReport] = useState(null);
  const handle = async () => {
    setBusy(true);
    try {
      const report = await downloadFullBackup();
      setLastReport(report);
      show('Backup baixado', { variant: 'success' });
    } catch (e) {
      console.error(e);
      show(`Erro no backup: ${e.message}`, { variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <p className="muted">
        Baixa um JSON com tudo da liga: config, times, jogos, jogadores, palpites,
        avanços, finalistas, prêmios, zebra, votos e extras. Mesmo formato do
        backup automático diário (GitHub Actions).
      </p>
      <div style={{ marginTop: 'var(--sp-3)' }}>
        <Button variant="secondary" onClick={handle} loading={busy}>
          Baixar backup completo (.json)
        </Button>
      </div>
      {lastReport && (
        <ul style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-small)', paddingLeft: 'var(--sp-4)' }}>
          {lastReport.map(r => (
            <li key={r.table}><strong>{r.table}</strong>: {r.rows} linhas</li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-small)' }}>
        <strong>Pra restaurar</strong>, rode no terminal local (precisa da SUPABASE_SERVICE_KEY desta liga):
        <br />
        <code style={{ background: 'var(--bg-app)', padding: '2px 6px', borderRadius: 4 }}>
          node --env-file=.env.&lt;liga&gt; scripts/restore.mjs &lt;arquivo.json&gt; --yes
        </code>
      </p>
    </Card>
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

function PlayersManager({ players, currentId, onDelete }) {
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...players].sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await onDelete(toDelete.id, toDelete.name);
      setToDelete(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <p className="muted">
        Removendo um jogador apaga todos os palpites dele. Se a pessoa logar de novo com mesmo nome+PIN, ela volta com uma conta nova (zerada).
      </p>
      <ul className="admin-players">
        {sorted.map(p => (
          <li key={p.id} className="admin-players__item">
            <div className="admin-players__info">
              <strong>{p.name}</strong>
              {p.isAdmin && <Pill variant="neutral">admin</Pill>}
              {p.id === currentId && <Pill variant="neutral">você</Pill>}
              <span className="muted admin-players__pts">{p.points?.total || 0} pts</span>
            </div>
            <Button
              variant="danger"
              onClick={() => setToDelete(p)}
              disabled={p.id === currentId}
              aria-label={`Remover ${p.name}`}
            >
              Remover
            </Button>
          </li>
        ))}
      </ul>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Confirmar remoção"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={busy}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete} loading={busy}>Remover de vez</Button>
          </>
        }
      >
        {toDelete && (
          <p>
            Tem certeza que quer remover <strong>{toDelete.name}</strong>?
            <br />
            Todos os palpites desse jogador (placares, classificação, finalistas, prêmios, zebra e extras) serão deletados em cascata.
            Essa ação <strong>não pode ser desfeita</strong>.
          </p>
        )}
      </Modal>
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
    hundredthGoal:    current.hundredthGoal    || ''
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
            hundredthGoal:    vals.hundredthGoal || null
          })}
        >
          Salvar resultados extras
        </Button>
      </div>
    </Card>
  );
}
