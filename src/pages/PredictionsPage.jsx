import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import GroupTable from '../components/GroupTable.jsx';
import TeamChip from '../components/TeamChip.jsx';
import Pill from '../components/Pill.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { useData } from '../context/DataContext.jsx';
import { computeStandings, predictedMatchesFromPlayer } from '../lib/standings.js';
import './PredictionsPage.css';

const TABS = [
  { key: 'advancement', label: 'Classificação' },
  { key: 'finalists',   label: 'Finalistas' },
  { key: 'awards',      label: 'Prêmios' },
  { key: 'poll',        label: 'Zebra' }
];

export default function PredictionsPage() {
  const {
    teams, teamsByCode, teamsByGroup,
    groupMatches, predictionsByMatchForMe,
    advancementPredictions, finalsPredictions, awardPredictions, pollPredictions,
    teamBoosts,
    me, confirmAdvancement, saveFinalists, saveAwards, savePollPrediction
  } = useData();
  const { show } = useToast();

  const [tab, setTab] = useState('advancement');

  return (
    <>
      <h2 className="page-title">Meus palpites</h2>

      <div className="pred-tabs" role="group" aria-label="Seções de palpites">
        {TABS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            aria-pressed={tab === key}
            className={'chip' + (tab === key ? ' chip--active' : '')}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'advancement' && (
        <AdvancementTab
          groupMatches={groupMatches}
          teamsByCode={teamsByCode}
          teamsByGroup={teamsByGroup}
          predictions={predictionsByMatchForMe}
          confirmed={me ? advancementPredictions[me.id] : null}
          teamBoosts={teamBoosts}
          onConfirm={(arr) => {
            confirmAdvancement(arr);
            show('Palpite de classificação confirmado', { variant: 'success' });
          }}
        />
      )}

      {tab === 'finalists' && (
        <FinalistsTab
          teams={teams}
          current={me ? finalsPredictions[me.id] : null}
          teamBoosts={teamBoosts}
          onSave={(arr) => {
            saveFinalists(arr);
            show('Finalistas salvos', { variant: 'success' });
          }}
        />
      )}

      {tab === 'awards' && (
        <AwardsTab
          current={me ? awardPredictions[me.id] : null}
          onSave={(vals) => {
            saveAwards(vals);
            show('Prêmios salvos', { variant: 'success' });
          }}
        />
      )}

      {tab === 'poll' && (
        <PollTab
          teams={teams}
          current={me ? pollPredictions[me.id] : null}
          onSave={(vals) => {
            savePollPrediction(vals);
            show('Zebra salva', { variant: 'success' });
          }}
        />
      )}
    </>
  );
}

/* ====================================================================== */
/* Advancement                                                            */
/* ====================================================================== */

function AdvancementTab({ groupMatches, teamsByCode, teamsByGroup, predictions, confirmed, teamBoosts = {}, onConfirm }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Build the "as-if predicted" set of matches.
  const predictedMatches = useMemo(
    () => predictedMatchesFromPlayer({ groupMatches, predictionsByMatchId: predictions }),
    [groupMatches, predictions]
  );

  const standings = useMemo(
    () => computeStandings({
      matches: predictedMatches,
      teamsByGroup
    }),
    [predictedMatches, teamsByGroup]
  );

  const allPredicted = standings.missingMatches === 0;
  const advancingArr = Array.from(standings.advancing);
  const isConfirmed = !!confirmed && confirmed.teams &&
    confirmed.teams.length === advancingArr.length &&
    confirmed.teams.every(t => standings.advancing.has(t));

  const bestThirdMarker = (groupKey) => {
    const row = standings.groups[groupKey]?.[2];
    if (!row) return null;
    const top8 = standings.bestThirds.slice(0, Math.min(8, standings.bestThirds.length));
    if (top8.some(t => t.team === row.team)) return row;
    return null;
  };

  return (
    <div className="stack">
      <Card>
        <h3 className="pred-section-title">Suas tabelas previstas</h3>
        <p className="muted">
          Essas tabelas são derivadas dos seus palpites em <strong>Jogos</strong>.
          Atualize um placar lá e elas recalculam aqui.
        </p>

        {!allPredicted && (
          <p className="pred-advancement__warn">
            <Pill variant="warning">Incompleto</Pill> {standings.missingMatches}{' '}
            {standings.missingMatches === 1 ? 'jogo de grupo ainda precisa' : 'jogos de grupo ainda precisam'} de palpite.
            Você pode confirmar a classificação quando todos estiverem prontos.
          </p>
        )}

        <div className="standings__groups" style={{ marginTop: 'var(--sp-3)' }}>
          {Object.entries(standings.groups).map(([group, rows]) => (
            <GroupTable
              key={group}
              group={group}
              rows={rows}
              teamsByCode={teamsByCode}
              contendingThird={bestThirdMarker(group)}
            />
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="pred-section-title">Seleções que você acha que vão se classificar ({advancingArr.length})</h3>
        <p className="muted">
          Cada acerto vale <strong>5 pts × multiplicador da seleção</strong>. Zebras valem mais se passarem.
        </p>
        <div className="pred-advancement__grid">
          {advancingArr.map((code) => {
            const boost = teamBoosts[code] || 1;
            return (
              <div key={code} className="pred-team-wrap">
                <TeamChip team={teamsByCode[code]} selected showCode layout="stacked" />
                {boost > 1.05 && (
                  <span className="pred-team-boost">× {boost.toFixed(2)}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="pred-confirm__row">
          {isConfirmed ? (
            <Pill variant="success">Confirmado — {confirmed.teams.length} seleções travadas</Pill>
          ) : confirmed ? (
            <Pill variant="warning">Confirmação desatualizada — confirme de novo</Pill>
          ) : (
            <Pill variant="neutral">Ainda não confirmado</Pill>
          )}
          <Button
            variant="primary"
            onClick={() => setConfirmOpen(true)}
            disabled={!allPredicted}
          >
            Confirmar meu palpite de classificação
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirmar classificação"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => {
                onConfirm(advancingArr);
                setConfirmOpen(false);
              }}
            >
              Travar
            </Button>
          </>
        }
      >
        <p>Você está confirmando que essas {advancingArr.length} seleções vão passar da fase de grupos. Você pode reconfirmar quantas vezes quiser até o mundial começar.</p>
        <div className="pred-advancement__grid pred-advancement__grid--compact">
          {advancingArr.map((code) => (
            <TeamChip key={code} team={teamsByCode[code]} showCode />
          ))}
        </div>
      </Modal>
    </div>
  );
}

/* ====================================================================== */
/* Finalists                                                              */
/* ====================================================================== */

function FinalistsTab({ teams, current, teamBoosts = {}, onSave }) {
  const [picks, setPicks] = useState(current?.finalists || []);

  const toggle = (code) => {
    setPicks((arr) => {
      if (arr.includes(code)) return arr.filter(c => c !== code);
      if (arr.length >= 2) return arr; // max 2
      return [...arr, code];
    });
  };

  // Order by championship favoritism: favorite first, longest-shot last.
  // Teams without odds data drop to the end alphabetically.
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      const ba = teamBoosts[a.code];
      const bb = teamBoosts[b.code];
      if (ba == null && bb == null) return a.name.localeCompare(b.name, 'pt-BR');
      if (ba == null) return 1;
      if (bb == null) return -1;
      return ba - bb; // lower boost = stronger favorite
    });
  }, [teams, teamBoosts]);

  return (
    <Card>
      <h3 className="pred-section-title">Escolha os dois finalistas</h3>
      <p className="muted">
        20 pontos × multiplicador por finalista correto. Em ordem de favoritismo (do favorito ao azarão).
      </p>
      <div className="pred-finalists__grid">
        {sortedTeams.map(team => {
          const boost = teamBoosts[team.code] || 1;
          return (
            <button
              type="button"
              key={team.code}
              className={'pred-pickable' + (picks.includes(team.code) ? ' is-selected' : '')}
              onClick={() => toggle(team.code)}
              aria-pressed={picks.includes(team.code)}
            >
              <TeamChip team={team} layout="stacked" showCode />
              {boost > 1.05 && (
                <span className="pred-team-boost">× {boost.toFixed(2)}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="pred-confirm__row">
        <Pill variant="neutral">{picks.length}/2 selecionados</Pill>
        <Button
          variant="primary"
          onClick={() => onSave(picks)}
          disabled={picks.length !== 2}
        >
          Salvar finalistas
        </Button>
      </div>
    </Card>
  );
}

/* ====================================================================== */
/* Awards                                                                 */
/* ====================================================================== */

function AwardsTab({ current, onSave }) {
  const [vals, setVals] = useState({
    bestPlayer:  current?.bestPlayer  || '',
    youngPlayer: current?.youngPlayer || '',
    goalkeeper:  current?.goalkeeper  || '',
    topScorer:   current?.topScorer   || ''
  });

  const update = (k) => (e) => setVals(v => ({ ...v, [k]: e.target.value }));
  const anyFilled = Object.values(vals).some(v => v.trim());

  return (
    <Card>
      <h3 className="pred-section-title">Prêmios individuais</h3>
      <p className="muted">
        Texto livre — tem que bater exato com o nome oficial do vencedor (não diferencia maiúscula/minúscula). 20 pontos cada, máx 80.
      </p>
      <div className="pred-awards__grid">
        <label className="pred-field">
          <span>Melhor jogador (Bola de Ouro)</span>
          <input
            type="text"
            value={vals.bestPlayer}
            onChange={update('bestPlayer')}
            placeholder="ex: Vinícius Jr."
          />
        </label>
        <label className="pred-field">
          <span>Melhor jogador jovem</span>
          <input
            type="text"
            value={vals.youngPlayer}
            onChange={update('youngPlayer')}
            placeholder="ex: Lamine Yamal"
          />
        </label>
        <label className="pred-field">
          <span>Melhor goleiro (Luva de Ouro)</span>
          <input
            type="text"
            value={vals.goalkeeper}
            onChange={update('goalkeeper')}
            placeholder="ex: Emiliano Martínez"
          />
        </label>
        <label className="pred-field">
          <span>Artilheiro (Chuteira de Ouro)</span>
          <input
            type="text"
            value={vals.topScorer}
            onChange={update('topScorer')}
            placeholder="ex: Harry Kane"
          />
        </label>
      </div>
      <div className="pred-confirm__row">
        <Button
          variant="primary"
          onClick={() => onSave(vals)}
          disabled={!anyFilled}
        >
          Salvar prêmios
        </Button>
      </div>
    </Card>
  );
}

/* ====================================================================== */
/* Dark horse / disappointment poll predictions                           */
/* ====================================================================== */

function PollTab({ teams, current, onSave }) {
  const [darkHorse, setDarkHorse] = useState(current?.darkHorse || '');
  const [disappointment, setDisappointment] = useState(current?.disappointment || '');

  return (
    <Card>
      <h3 className="pred-section-title">Zebra & decepção</h3>
      <p className="muted">
        Feito antes do mundial. Depois da final, os amigos votam — a seleção mais votada vira a resposta oficial. 15 pontos cada.
      </p>

      <label className="pred-field">
        <span>Zebra (surpresa positiva)</span>
        <select value={darkHorse} onChange={(e) => setDarkHorse(e.target.value)}>
          <option value="">— escolha uma seleção —</option>
          {teams.map(t => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
        </select>
      </label>

      <label className="pred-field">
        <span>Decepção (quem vai mal)</span>
        <select value={disappointment} onChange={(e) => setDisappointment(e.target.value)}>
          <option value="">— escolha uma seleção —</option>
          {teams.map(t => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
        </select>
      </label>

      <div className="pred-confirm__row">
        <Button
          variant="primary"
          onClick={() => onSave({ darkHorse, disappointment })}
          disabled={!darkHorse && !disappointment}
        >
          Salvar
        </Button>
      </div>
    </Card>
  );
}

