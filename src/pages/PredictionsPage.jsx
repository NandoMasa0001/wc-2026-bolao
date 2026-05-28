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
import { buildFullBracket, buildBracketColumns } from '../lib/predictedBracket.js';
import './PredictionsPage.css';

const TABS = [
  { key: 'advancement', label: 'Classificação' },
  { key: 'finalists',   label: 'Finalistas' },
  { key: 'awards',      label: 'Prêmios' },
  { key: 'poll',        label: 'Zebra' },
  { key: 'extras',      label: 'Extras' }
];

export default function PredictionsPage() {
  const {
    teams, teamsByCode, teamsByGroup,
    matches, groupMatches, predictionsByMatchForMe,
    advancementPredictions, finalsPredictions, awardPredictions, pollPredictions,
    extraPredictions, teamBoosts,
    me, confirmAdvancement, saveFinalists, saveAwards, savePollPrediction, saveExtras
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
          allMatches={matches}
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

      {tab === 'extras' && (
        <ExtrasTab
          teams={teams}
          teamBoosts={teamBoosts}
          current={me ? extraPredictions[me.id] : null}
          onSave={(vals) => {
            saveExtras(vals);
            show('Extras salvos', { variant: 'success' });
          }}
        />
      )}
    </>
  );
}

/* ====================================================================== */
/* Advancement                                                            */
/* ====================================================================== */

function AdvancementTab({ groupMatches, allMatches, teamsByCode, teamsByGroup, predictions, confirmed, teamBoosts = {}, onConfirm }) {
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
          Cada acerto vale <strong>5 pts</strong>. Pontuação flat — sem multiplicador.
        </p>
        <div className="pred-advancement__grid">
          {advancingArr.map((code) => (
            <div key={code} className="pred-team-wrap">
              <TeamChip team={teamsByCode[code]} selected showCode layout="stacked" />
            </div>
          ))}
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

      <Card className="bracket-card">
        <PredictedBracket
          standings={standings}
          teamsByCode={teamsByCode}
          allMatches={allMatches}
        />
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
/* Predicted R32 bracket                                                  */
/* ====================================================================== */

function PredictedBracket({ standings, teamsByCode, allMatches }) {
  const bracket = useMemo(
    () => buildFullBracket({ standings, matches: allMatches || [] }),
    [standings, allMatches]
  );

  const cols = useMemo(() => buildBracketColumns(bracket), [bracket]);

  if (!bracket.length) {
    return (
      <p className="muted">
        O preview do mata-mata aparece aqui quando você palpitar a fase de grupos.
      </p>
    );
  }

  return (
    <>
      <h3 className="pred-section-title">Mata-mata previsto</h3>

      <div className="bracket-tree">
        <div className="bracket-half bracket-half--left">
          {cols.left.map((col, i) => (
            <div key={i} className="bracket-col">
              {col.map((cell, j) => (
                <BracketSlot key={j} slot={cell} teamsByCode={teamsByCode} side="left" />
              ))}
            </div>
          ))}
        </div>

        <BracketCenter final={cols.final} third={cols.third} teamsByCode={teamsByCode} />

        <div className="bracket-half bracket-half--right">
          {cols.right.map((col, i) => (
            <div key={i} className="bracket-col">
              {col.map((cell, j) => (
                <BracketSlot key={j} slot={cell} teamsByCode={teamsByCode} side="right" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function BracketSlot({ slot, teamsByCode, side }) {
  const team = slot.team ? teamsByCode[slot.team] : null;
  if (team) {
    return (
      <div className={`bracket-row bracket-row--${side} is-filled`}>
        <img className="bracket-row__flag" src={team.flagUrl} alt={team.name} width="22" height="14" />
        <span className="bracket-row__code">{team.code}</span>
      </div>
    );
  }
  return (
    <div className={`bracket-row bracket-row--${side} is-empty`} title={slot.label}>
      <span className="bracket-row__empty" aria-hidden="true" />
    </div>
  );
}

function BracketCenter({ final, third, teamsByCode }) {
  const champion = final?.winner ? teamsByCode[final.winner] : null;
  const t3home   = third?.home   ? teamsByCode[third.home]    : null;
  const t3away   = third?.away   ? teamsByCode[third.away]    : null;
  const t3winner = third?.winner ? teamsByCode[third.winner]  : null;
  return (
    <div className="bracket-center">
      <div className="bracket-trophy" aria-hidden="true">🏆</div>
      {champion ? (
        <div className="bracket-champion">
          <img src={champion.flagUrl} alt={champion.name} className="bracket-champion__flag" width="42" height="28" />
          <strong className="bracket-champion__code">{champion.code}</strong>
          <span className="bracket-champion__label">Campeão</span>
        </div>
      ) : (
        <div className="bracket-center__placeholder">Campeão</div>
      )}

      <div className="bracket-third">
        <span className="bracket-third__label">3º lugar</span>
        {t3winner ? (
          <div className="bracket-third__winner">
            <img src={t3winner.flagUrl} alt={t3winner.name} width="22" height="14" />
            <span>{t3winner.code}</span>
          </div>
        ) : t3home && t3away ? (
          <div className="bracket-third__pair">
            <img src={t3home.flagUrl} alt={t3home.name} width="18" height="12" />
            <span>vs</span>
            <img src={t3away.flagUrl} alt={t3away.name} width="18" height="12" />
          </div>
        ) : (
          <div className="bracket-third__empty">a definir</div>
        )}
      </div>
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

/* ====================================================================== */
/* Extras (8 side bets)                                                   */
/* ====================================================================== */

function ExtrasTab({ teams, teamBoosts = {}, current, onSave }) {
  const [vals, setVals] = useState({
    champion:         current?.champion         || '',
    totalGoalsWC:     current?.totalGoalsWC     ?? '',
    neymarGA:         current?.neymarGA         ?? '',
    topScorerGoals:   current?.topScorerGoals   ?? '',
    firstGoalBrazil:  current?.firstGoalBrazil  || '',
    lastGoalBrazil:   current?.lastGoalBrazil   || '',
    hundredthGoal:    current?.hundredthGoal    || '',
    mbappeRecord:     current?.mbappeRecord ?? null
  });

  const update = (k) => (e) => setVals(v => ({ ...v, [k]: e.target.value }));
  const updateNum = (k) => (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    setVals(prev => ({ ...prev, [k]: v }));
  };

  // Order teams by favouritism (same logic as Finalists tab).
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      const ba = teamBoosts[a.code];
      const bb = teamBoosts[b.code];
      if (ba == null && bb == null) return a.name.localeCompare(b.name, 'pt-BR');
      if (ba == null) return 1;
      if (bb == null) return -1;
      return ba - bb;
    });
  }, [teams, teamBoosts]);

  const championBoost = vals.champion ? (teamBoosts[vals.champion] || 1) : 1;

  return (
    <div className="stack">
      <Card>
        <h3 className="pred-section-title">O campeão</h3>
        <p className="muted">
          A seleção que levanta a taça. <strong>30 pts × multiplicador da seleção</strong> (favoritos = 1×, zebras até 2.5×). Independente de quem é finalista.
        </p>
        <label className="pred-field">
          <span>Campeão da Copa</span>
          <select value={vals.champion} onChange={update('champion')}>
            <option value="">— escolha —</option>
            {sortedTeams.map(t => (
              <option key={t.code} value={t.code}>
                {t.name} ({t.code}){teamBoosts[t.code] && teamBoosts[t.code] > 1.05 ? ` — × ${teamBoosts[t.code].toFixed(2)}` : ''}
              </option>
            ))}
          </select>
        </label>
        {vals.champion && championBoost > 1.05 && (
          <p className="muted">
            Se acertar: <strong>{Math.ceil(30 * championBoost)} pts</strong>
          </p>
        )}
      </Card>

      <Card>
        <h3 className="pred-section-title">Apostas numéricas</h3>
        <p className="muted">
          Exato = pontuação máxima, <strong>−5 pts por gol de diferença</strong>, mínimo 0.
        </p>
        <label className="pred-field">
          <span>Total de gols na Copa (60 pts)</span>
          <input
            type="text"
            inputMode="numeric"
            value={vals.totalGoalsWC}
            onChange={updateNum('totalGoalsWC')}
            placeholder="ex: 172"
          />
        </label>
        <label className="pred-field">
          <span>Gols + assistências do Neymar (30 pts)</span>
          <input
            type="text"
            inputMode="numeric"
            value={vals.neymarGA}
            onChange={updateNum('neymarGA')}
            placeholder="ex: 5"
          />
        </label>
        <label className="pred-field">
          <span>Nº de gols do artilheiro da copa (20 pts)</span>
          <input
            type="text"
            inputMode="numeric"
            value={vals.topScorerGoals}
            onChange={updateNum('topScorerGoals')}
            placeholder="ex: 8"
          />
        </label>
      </Card>

      <Card>
        <h3 className="pred-section-title">Quem marca</h3>
        <p className="muted">
          Texto livre — tem que bater exato com o nome do jogador.
        </p>
        <label className="pred-field">
          <span>Primeiro gol do Brasil na copa (30 pts)</span>
          <input
            type="text"
            value={vals.firstGoalBrazil}
            onChange={update('firstGoalBrazil')}
            placeholder="ex: Vinícius Jr."
          />
        </label>
        <label className="pred-field">
          <span>Último gol do Brasil na copa (20 pts)</span>
          <input
            type="text"
            value={vals.lastGoalBrazil}
            onChange={update('lastGoalBrazil')}
            placeholder="ex: Rodrygo"
          />
        </label>
        <label className="pred-field">
          <span>100º gol da copa (50 pts)</span>
          <input
            type="text"
            value={vals.hundredthGoal}
            onChange={update('hundredthGoal')}
            placeholder="quem marca?"
          />
        </label>
      </Card>

      <Card>
        <h3 className="pred-section-title">Sim ou não</h3>
        <p className="muted">15 pts cada.</p>
        <label className="pred-field">
          <span>Mbappé bate o recorde de gols em copas?</span>
          <select
            value={vals.mbappeRecord === true ? 'yes' : vals.mbappeRecord === false ? 'no' : ''}
            onChange={(e) => {
              const v = e.target.value;
              setVals(prev => ({ ...prev, mbappeRecord: v === 'yes' ? true : v === 'no' ? false : null }));
            }}
          >
            <option value="">— não opinei —</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </select>
        </label>
      </Card>

      <div className="pred-confirm__row">
        <Button
          variant="primary"
          onClick={() => onSave({
            ...vals,
            totalGoalsWC:    vals.totalGoalsWC    === '' ? null : Number(vals.totalGoalsWC),
            neymarGA:        vals.neymarGA        === '' ? null : Number(vals.neymarGA),
            topScorerGoals:  vals.topScorerGoals  === '' ? null : Number(vals.topScorerGoals)
          })}
        >
          Salvar extras
        </Button>
      </div>
    </div>
  );
}

