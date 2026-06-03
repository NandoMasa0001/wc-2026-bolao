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
    me, config, teams, matches, teamsByCode, players, adminActions,
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
        <h3 className="page-section__title">Pré-flight (checagem rápida)</h3>
        <Preflight config={config} teams={teams} matches={matches} players={players} />
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Travas</h3>
        <PauseToggle
          config={config}
          onToggle={(open) => {
            updateConfig({ predictionsOpen: open });
            show(open ? 'Palpites destravados' : 'Palpites pausados', { variant: 'info' });
          }}
        />
      </section>

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
        <RecomputeCard onRun={() => {
          recomputeAllScores();
          show('Pedido de recálculo registrado — o cron processa em até 10 min', { variant: 'success' });
        }} />
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Histórico de ações admin</h3>
        <AdminActionsLog rows={adminActions} />
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

/* ====================================================================== */
/* Preflight checklist — quick visual of league health on /admin top      */
/* ====================================================================== */

function Preflight({ config, teams, matches, players }) {
  const now = Date.now();
  const tournamentTs = config?.tournamentStartsAt ? new Date(config.tournamentStartsAt).getTime() : null;
  const firstKickoffTs = matches.length
    ? Math.min(...matches.map(m => new Date(m.kickoffAt).getTime()).filter(Number.isFinite))
    : null;
  const lastFetchTs = config?.lastFetchAt ? new Date(config.lastFetchAt).getTime() : null;
  const matchesWithoutKickoff = matches.filter(m => !m.kickoffAt).length;
  const dupNames = (() => {
    const seen = new Map();
    for (const p of players) {
      const k = (p.name || '').trim().toLowerCase();
      if (!k) continue;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  })();
  const cronAgeMin = lastFetchTs ? Math.round((now - lastFetchTs) / 60000) : null;

  // Each check: ok | warn | bad, with a human label.
  const checks = [
    {
      label: '48 seleções carregadas',
      status: teams.length === 48 ? 'ok' : teams.length === 0 ? 'bad' : 'warn',
      detail: `${teams.length} seleções`
    },
    {
      label: '104 jogos carregados',
      status: matches.length === 104 ? 'ok' : matches.length === 0 ? 'bad' : 'warn',
      detail: `${matches.length} jogos`
    },
    {
      label: 'Todos os jogos com kickoff',
      status: matchesWithoutKickoff === 0 ? 'ok' : 'bad',
      detail: matchesWithoutKickoff === 0 ? 'OK' : `${matchesWithoutKickoff} sem`
    },
    {
      label: 'Apito inicial bate com primeiro jogo',
      status: (tournamentTs && firstKickoffTs && Math.abs(tournamentTs - firstKickoffTs) < 60 * 60 * 1000) ? 'ok' :
              (tournamentTs && firstKickoffTs) ? 'warn' : 'bad',
      detail: tournamentTs && firstKickoffTs
        ? `Δ ${Math.round((firstKickoffTs - tournamentTs) / 60000)} min`
        : 'falta config'
    },
    {
      label: 'Cron de resultados ativo (< 30 min)',
      status: cronAgeMin == null ? 'warn' : cronAgeMin <= 30 ? 'ok' : cronAgeMin <= 120 ? 'warn' : 'bad',
      detail: cronAgeMin == null ? 'nunca rodou (ou migration 0008 pendente)' :
              cronAgeMin < 60 ? `${cronAgeMin} min atrás` :
              `${Math.round(cronAgeMin / 60)} h atrás`
    },
    {
      label: 'Sem nomes de jogador duplicados',
      status: dupNames.length === 0 ? 'ok' : 'warn',
      detail: dupNames.length === 0 ? 'OK' : dupNames.join(', ')
    }
  ];
  const allOk = checks.every(c => c.status === 'ok');

  return (
    <Card>
      <p className="muted" style={{ marginBottom: 'var(--sp-3)' }}>
        {allOk ? 'Tudo verde — a liga está pronta pro apito inicial.' : 'Atenção: revisar os pontos em amarelo/vermelho.'}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {checks.map(c => (
          <li
            key={c.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr auto',
              alignItems: 'center',
              gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)',
              background: 'var(--bg-app)',
              borderRadius: 'var(--r-md)',
              border: c.status === 'bad'  ? '1px solid var(--c-red)' :
                      c.status === 'warn' ? '1px solid var(--c-orange)' :
                                            '1px solid var(--border)'
            }}
          >
            <span aria-hidden="true" style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--fw-black)',
              color: c.status === 'ok'   ? 'var(--c-green)'  :
                     c.status === 'warn' ? 'var(--c-orange)' :
                                           'var(--c-red)'
            }}>
              {c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗'}
            </span>
            <span style={{ fontWeight: 'var(--fw-semibold)' }}>{c.label}</span>
            <span className="muted" style={{ fontSize: 'var(--fs-small)' }}>{c.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ====================================================================== */
/* Pause toggle — flip predictions_open                                   */
/* ====================================================================== */

function PauseToggle({ config, onToggle }) {
  const open = config?.predictionsOpen !== false; // default true
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
        <div style={{ minWidth: 0 }}>
          <strong>Palpites estão {open ? 'ABERTOS' : 'PAUSADOS'}</strong>
          <p className="muted" style={{ margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-small)' }}>
            Trava de emergência client-side. Pausa esconde botões de salvar em todo o app —
            use se descobrir algo errado no apito e precisar congelar enquanto investiga.
            (A trava forte continua sendo a RLS por data; isso é só pro caso da gente
            precisar pausar antes ou no meio.)
          </p>
        </div>
        <Button
          variant={open ? 'danger' : 'primary'}
          onClick={() => onToggle(!open)}
        >
          {open ? 'Pausar palpites' : 'Destravar palpites'}
        </Button>
      </div>
    </Card>
  );
}

/* ====================================================================== */
/* Recompute card — typed confirmation                                    */
/* ====================================================================== */

function RecomputeCard({ onRun }) {
  const [text, setText] = useState('');
  const phrase = 'RECALCULAR';
  return (
    <Card>
      <p className="muted">
        Roda a engine de pontuação em todos os palpites no próximo ciclo do cron.
        Use depois de sobrescrever um jogo manualmente.
      </p>
      <label className="pred-field" style={{ marginTop: 'var(--sp-3)' }}>
        <span>Pra confirmar, digite <code>{phrase}</code>:</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={phrase}
          autoComplete="off"
        />
      </label>
      <div style={{ marginTop: 'var(--sp-3)' }}>
        <Button
          variant="secondary"
          disabled={text !== phrase}
          onClick={() => { onRun(); setText(''); }}
        >
          Recalcular todas as pontuações
        </Button>
      </div>
    </Card>
  );
}

/* ====================================================================== */
/* Admin actions audit log                                                */
/* ====================================================================== */

function AdminActionsLog({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <Card>
        <p className="muted">Sem ações admin registradas ainda. (Ou esta liga não rodou a migration 0008.)</p>
      </Card>
    );
  }
  return (
    <Card>
      <p className="muted" style={{ marginBottom: 'var(--sp-3)' }}>
        Últimas {rows.length} ações administrativas (mais recente primeiro). Útil pro post-mortem.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 'var(--fs-small)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
        {rows.slice(0, 25).map(r => (
          <li
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)',
              background: 'var(--bg-app)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)'
            }}
          >
            <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span>
              <strong>{r.actor_name || '?'}</strong> → <code>{r.action}</code>
              {r.target ? <> <span className="muted">({r.target})</span></> : null}
            </span>
            <span className="muted" style={{ fontSize: 'var(--fs-tiny)' }}>
              {r.payload ? JSON.stringify(r.payload).slice(0, 60) : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
