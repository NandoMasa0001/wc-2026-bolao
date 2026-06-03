import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Button from '../components/Button.jsx';
import GroupTable from '../components/GroupTable.jsx';
import TeamChip from '../components/TeamChip.jsx';
import Pill from '../components/Pill.jsx';
import { useToast } from '../components/Toast.jsx';
import { useData } from '../context/DataContext.jsx';
import { computeStandings, predictedMatchesFromPlayer } from '../lib/standings.js';
import { finalistBoost } from '../lib/scoring.js';
import { buildFullBracket, buildBracketColumns } from '../lib/predictedBracket.js';
import './PredictionsPage.css';

function downloadMyPredictions({ me, predictionsByMatchForMe, advancementPredictions, finalsPredictions, awardPredictions, pollPredictions, extraPredictions }) {
  const data = {
    player:  { id: me.id, name: me.name },
    dumpedAt: new Date().toISOString(),
    schemaVersion: 1,
    matches:     predictionsByMatchForMe,
    advancement: advancementPredictions[me.id] || null,
    finalists:   finalsPredictions[me.id]     || null,
    awards:      awardPredictions[me.id]      || null,
    poll:        pollPredictions[me.id]       || null,
    extras:      extraPredictions[me.id]      || null
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `meus-palpites-${(me.name || 'jogador').toLowerCase().replace(/\s+/g, '_')}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const TABS = [
  { key: 'advancement', label: 'Classificação' },
  { key: 'especiais',   label: 'Especiais' }
];

export default function PredictionsPage() {
  const {
    teams, teamsByCode, teamsByGroup,
    matches, groupMatches, predictionsByMatchForMe,
    advancementPredictions, finalsPredictions, awardPredictions, pollPredictions,
    extraPredictions, teamBoosts,
    me, config, saveFinalists, saveAwards, savePollPrediction, saveExtras
  } = useData();
  const { show } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return TABS.some(x => x.key === t) ? t : 'advancement';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (TABS.some(x => x.key === t) && t !== tab) setTab(t);
  }, [searchParams, tab]);

  const switchTab = (key) => {
    setTab(key);
    setSearchParams({ tab: key }, { replace: true });
  };

  // Jump to a specific section: switch tab if needed, then scroll the anchor.
  // Used by the PendingChecklist below.
  const goToSection = (targetTab, anchorId) => {
    switchTab(targetTab);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(anchorId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    });
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>Meus palpites</h2>
        {me && (
          <button
            type="button"
            onClick={() => downloadMyPredictions({ me, predictionsByMatchForMe, advancementPredictions, finalsPredictions, awardPredictions, pollPredictions, extraPredictions })}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)',
              padding: '4px var(--sp-3)',
              fontSize: 'var(--fs-small)',
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--fw-semibold)',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            ⬇ Baixar meus palpites (.json)
          </button>
        )}
      </div>

      <PendingChecklist
        me={me}
        config={config}
        advancementPredictions={advancementPredictions}
        finalsPredictions={finalsPredictions}
        awardPredictions={awardPredictions}
        pollPredictions={pollPredictions}
        extraPredictions={extraPredictions}
        predictionsByMatchForMe={predictionsByMatchForMe}
        groupMatches={groupMatches}
        teamsByGroup={teamsByGroup}
        onGo={goToSection}
      />

      <div className="pred-tabs" role="group" aria-label="Seções de palpites">
        {TABS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            aria-pressed={tab === key}
            className={'chip' + (tab === key ? ' chip--active' : '')}
            onClick={() => switchTab(key)}
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
        />
      )}

      {tab === 'especiais' && (
        <EspeciaisTab
          teams={teams}
          teamBoosts={teamBoosts}
          finalsCurrent={me ? finalsPredictions[me.id] : null}
          awardsCurrent={me ? awardPredictions[me.id] : null}
          pollCurrent={me ? pollPredictions[me.id] : null}
          extrasCurrent={me ? extraPredictions[me.id] : null}
          onSaveFinalists={(arr) => { saveFinalists(arr); show('Finalistas salvos', { variant: 'success' }); }}
          onSaveAwards={(vals) => { saveAwards(vals); show('Prêmios salvos', { variant: 'success' }); }}
          onSavePoll={(vals) => { savePollPrediction(vals); show('Zebra salva', { variant: 'success' }); }}
          onSaveExtras={(vals) => { saveExtras(vals); show('Extras salvos', { variant: 'success' }); }}
        />
      )}
    </>
  );
}

/* ====================================================================== */
/* PendingChecklist — top-of-page nag listing what still needs a save.    */
/* Sits above the tabs on /palpites. Hides itself once everything is OK   */
/* or once the tournament has started (locks → no more edits possible).   */
/* ====================================================================== */

const CHECKLIST_ITEMS = [
  { key: 'advancement', label: 'Classificação dos 32', tab: 'advancement', anchor: 'sec-advancement' },
  { key: 'champion',    label: 'Campeão da Copa',       tab: 'especiais',   anchor: 'sec-campeao'     },
  { key: 'finalists',   label: 'Finalistas',            tab: 'especiais',   anchor: 'sec-finalistas'  },
  { key: 'awards',      label: 'Prêmios individuais',   tab: 'especiais',   anchor: 'sec-premios'     },
  { key: 'poll',        label: 'Zebra & decepção',      tab: 'especiais',   anchor: 'sec-zebra'       },
  { key: 'numericas',   label: 'Apostas numéricas',     tab: 'especiais',   anchor: 'sec-numericas'   },
  { key: 'quemmarca',   label: 'Quem marca o gol',      tab: 'especiais',   anchor: 'sec-quemmarca'   }
];

function PendingChecklist({
  me, config,
  advancementPredictions, finalsPredictions, awardPredictions,
  pollPredictions, extraPredictions,
  predictionsByMatchForMe, groupMatches, teamsByGroup,
  onGo
}) {
  const statuses = useMemo(() => {
    if (!me) return null;

    // Advancement is auto-saved on every group placar save, so the only
    // meaningful state for the checklist is: do we have all 72 group
    // predictions in? If yes → "ok", otherwise → "incomplete".
    const predictedMatches = predictedMatchesFromPlayer({
      groupMatches, predictionsByMatchId: predictionsByMatchForMe
    });
    const standings = computeStandings({ matches: predictedMatches, teamsByGroup });
    const advStatus = standings.missingMatches === 0 ? 'ok' : 'incomplete';

    const extras = extraPredictions[me.id];
    const awards = awardPredictions[me.id];
    const poll   = pollPredictions[me.id];
    const fin    = finalsPredictions[me.id];

    return {
      advancement: advStatus,
      champion:   extras?.champion ? 'ok' : 'missing',
      finalists:  (fin?.finalists?.length === 2) ? 'ok' : 'missing',
      awards:     (awards && (awards.bestPlayer || awards.youngPlayer || awards.goalkeeper || awards.topScorer)) ? 'ok' : 'missing',
      poll:       (poll && (poll.darkHorse || poll.disappointment)) ? 'ok' : 'missing',
      numericas:  (extras && (extras.totalGoalsWC != null || extras.neymarGA != null || extras.topScorerGoals != null)) ? 'ok' : 'missing',
      quemmarca:  (extras && (extras.firstGoalBrazil || extras.lastGoalBrazil || extras.hundredthGoal)) ? 'ok' : 'missing'
    };
  }, [me, advancementPredictions, finalsPredictions, awardPredictions,
      pollPredictions, extraPredictions, predictionsByMatchForMe,
      groupMatches, teamsByGroup]);

  if (!me || !statuses) return null;

  const tournamentStarted = config?.tournamentStartsAt
    ? new Date(config.tournamentStartsAt).getTime() <= Date.now()
    : false;
  if (tournamentStarted) return null;

  const pendingCount = CHECKLIST_ITEMS.filter(it => statuses[it.key] !== 'ok').length;
  if (pendingCount === 0) return null;

  const hintFor = (status) => {
    switch (status) {
      case 'ok':         return 'Confirmado';
      case 'stale':      return 'Reconfirme';
      case 'incomplete': return 'Faltam jogos';
      default:           return 'Falta salvar';
    }
  };
  const iconFor = (status) => {
    switch (status) {
      case 'ok':    return '✓';
      case 'stale': return '⚠';
      default:      return '○';
    }
  };

  return (
    <Card className="pending-checklist">
      <h3 className="pred-section-title">
        Faltam {pendingCount} de {CHECKLIST_ITEMS.length} confirmações
      </h3>
      <p className="muted pending-checklist__intro">
        Tudo trava no apito inicial da Copa. Toque em cada pendência pra ir direto pro botão de salvar.
      </p>
      <ul className="pending-checklist__list">
        {CHECKLIST_ITEMS.map(it => {
          const s = statuses[it.key];
          return (
            <li key={it.key} className={`pending-checklist__row pending-checklist__row--${s}`}>
              <span className="pending-checklist__icon" aria-hidden="true">{iconFor(s)}</span>
              <span className="pending-checklist__label">{it.label}</span>
              <span className="pending-checklist__hint">{hintFor(s)}</span>
              {s !== 'ok' && (
                <button
                  type="button"
                  className="pending-checklist__cta"
                  onClick={() => onGo(it.tab, it.anchor)}
                >
                  Ir →
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ====================================================================== */
/* Advancement                                                            */
/* ====================================================================== */

function AdvancementTab({ groupMatches, allMatches, teamsByCode, teamsByGroup, predictions }) {
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
          Atualize um placar lá e a classificação que você vê aqui se salva sozinha — não tem mais botão de confirmar.
        </p>

        {!allPredicted && (
          <p className="pred-advancement__warn">
            <Pill variant="warning">Incompleto</Pill> {standings.missingMatches}{' '}
            {standings.missingMatches === 1 ? 'jogo de grupo ainda precisa' : 'jogos de grupo ainda precisam'} de palpite.
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

      <Card id="sec-advancement">
        <h3 className="pred-section-title">Seleções que você acha que vão se classificar ({advancingArr.length})</h3>
        <p className="muted">
          Cada acerto vale <strong>5 pts</strong>. Pontuação flat — sem multiplicador. Atualiza automaticamente quando você muda placares em <strong>Jogos</strong>.
        </p>
        <div className="pred-advancement__grid">
          {advancingArr.map((code) => (
            <div key={code} className="pred-team-wrap">
              <TeamChip team={teamsByCode[code]} selected showCode layout="stacked" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="bracket-card">
        <PredictedBracket
          standings={standings}
          teamsByCode={teamsByCode}
          allMatches={allMatches}
        />
      </Card>
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

/* ====================================================================== */
/* EspeciaisTab — wrapper combining Finalistas, Prêmios, Zebra, Extras    */
/* into a single scrollable page with clear section headings.             */
/* ====================================================================== */

function EspeciaisTab({
  teams, teamBoosts,
  finalsCurrent, awardsCurrent, pollCurrent, extrasCurrent,
  onSaveFinalists, onSaveAwards, onSavePoll, onSaveExtras
}) {
  // Progress: how many of the 5 sections have at least one field filled?
  const progress = useMemo(() => {
    const sections = {
      campeao:    !!extrasCurrent?.champion,
      finalistas: !!(finalsCurrent?.finalists?.length),
      premios:    !!(awardsCurrent && (awardsCurrent.bestPlayer || awardsCurrent.youngPlayer || awardsCurrent.goalkeeper || awardsCurrent.topScorer)),
      zebra:      !!(pollCurrent?.darkHorse || pollCurrent?.disappointment),
      numericas:  !!(extrasCurrent && (extrasCurrent.totalGoalsWC != null || extrasCurrent.neymarGA != null || extrasCurrent.topScorerGoals != null)),
      quemMarca:  !!(extrasCurrent && (extrasCurrent.firstGoalBrazil || extrasCurrent.lastGoalBrazil || extrasCurrent.hundredthGoal))
    };
    const filled = Object.values(sections).filter(Boolean).length;
    const total = Object.keys(sections).length;
    return { sections, filled, total };
  }, [finalsCurrent, awardsCurrent, pollCurrent, extrasCurrent]);

  return (
    <div className="stack especiais-stack">
      <Card className="especiais-progress">
        <strong>{progress.filled}/{progress.total}</strong> seções com pelo menos um palpite preenchido.
        {progress.filled < progress.total && (
          <p className="muted">Role pra baixo pra preencher os que faltam — cada bloco salva separadamente.</p>
        )}
      </Card>

      <CampeaoSection
        teams={teams}
        teamBoosts={teamBoosts}
        current={extrasCurrent}
        onSave={(champion) => onSaveExtras({ champion })}
      />

      <FinalistsTab
        teams={teams}
        current={finalsCurrent}
        teamBoosts={teamBoosts}
        onSave={onSaveFinalists}
      />

      <AwardsTab current={awardsCurrent} onSave={onSaveAwards} />

      <PollTab teams={teams} current={pollCurrent} onSave={onSavePoll} />

      <NumericasSection current={extrasCurrent} onSave={onSaveExtras} />

      <QuemMarcaSection current={extrasCurrent} onSave={onSaveExtras} />
    </div>
  );
}

function CampeaoSection({ teams, teamBoosts, current, onSave }) {
  const [champion, setChampion] = useState(current?.champion || '');
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
  const championBoost = champion ? (teamBoosts[champion] || 1) : 1;

  return (
    <Card id="sec-campeao">
      <h3 className="pred-section-title">O campeão</h3>
      <p className="muted">
        A seleção que levanta a taça. <strong>30 pts × multiplicador da seleção</strong> (favoritos = 1×, zebras até 2.5×). Independente de quem é finalista.
      </p>
      <label className="pred-field">
        <span>Campeão da Copa</span>
        <select value={champion} onChange={(e) => setChampion(e.target.value)}>
          <option value="">— escolha —</option>
          {sortedTeams.map(t => (
            <option key={t.code} value={t.code}>
              {t.name} ({t.code}){teamBoosts[t.code] && teamBoosts[t.code] > 1.05 ? ` — × ${teamBoosts[t.code].toFixed(2)}` : ''}
            </option>
          ))}
        </select>
      </label>
      {champion && championBoost > 1.05 && (
        <p className="muted">
          Se acertar: <strong>{Math.ceil(30 * championBoost)} pts</strong>
        </p>
      )}
      <div className="pred-confirm__row">
        <Button variant="primary" onClick={() => onSave(champion || null)} disabled={!champion}>
          Salvar campeão
        </Button>
      </div>
    </Card>
  );
}

function NumericasSection({ current, onSave }) {
  const [vals, setVals] = useState({
    totalGoalsWC:   current?.totalGoalsWC   ?? '',
    neymarGA:       current?.neymarGA       ?? '',
    topScorerGoals: current?.topScorerGoals ?? ''
  });
  const updateNum = (k) => (e) => {
    const v = e.target.value.replace(/[^\d]/g, '');
    setVals(prev => ({ ...prev, [k]: v }));
  };
  const handleSave = () => onSave({
    totalGoalsWC:    vals.totalGoalsWC    === '' ? null : Number(vals.totalGoalsWC),
    neymarGA:        vals.neymarGA        === '' ? null : Number(vals.neymarGA),
    topScorerGoals:  vals.topScorerGoals  === '' ? null : Number(vals.topScorerGoals)
  });

  return (
    <Card id="sec-numericas">
      <h3 className="pred-section-title">Apostas numéricas</h3>
      <p className="muted">
        Só o <strong>total de gols</strong> usa proximidade (−5 pts por gol errado, mínimo 0). G+A do Neymar e gols do artilheiro são tudo-ou-nada: cravou ganha tudo, errou ganha 0.
      </p>
      <label className="pred-field">
        <span>Total de gols na Copa (60 pts — proximidade)</span>
        <input type="text" inputMode="numeric" value={vals.totalGoalsWC} onChange={updateNum('totalGoalsWC')} placeholder="ex: 172" />
      </label>
      <label className="pred-field">
        <span>Gols + assistências do Neymar (30 pts — cravada)</span>
        <input type="text" inputMode="numeric" value={vals.neymarGA} onChange={updateNum('neymarGA')} placeholder="ex: 5" />
      </label>
      <label className="pred-field">
        <span>Nº de gols do artilheiro da copa (20 pts — cravada)</span>
        <input type="text" inputMode="numeric" value={vals.topScorerGoals} onChange={updateNum('topScorerGoals')} placeholder="ex: 8" />
      </label>
      <div className="pred-confirm__row">
        <Button variant="primary" onClick={handleSave}>Salvar numéricas</Button>
      </div>
    </Card>
  );
}

function QuemMarcaSection({ current, onSave }) {
  const [vals, setVals] = useState({
    firstGoalBrazil: current?.firstGoalBrazil || '',
    lastGoalBrazil:  current?.lastGoalBrazil  || '',
    hundredthGoal:   current?.hundredthGoal   || ''
  });
  const update = (k) => (e) => setVals(prev => ({ ...prev, [k]: e.target.value }));
  const handleSave = () => onSave({
    firstGoalBrazil: vals.firstGoalBrazil || null,
    lastGoalBrazil:  vals.lastGoalBrazil  || null,
    hundredthGoal:   vals.hundredthGoal   || null
  });

  return (
    <Card id="sec-quemmarca">
      <h3 className="pred-section-title">Quem marca o gol</h3>
      <p className="muted">Texto livre — tem que bater exato com o nome do jogador.</p>
      <label className="pred-field">
        <span>Primeiro gol do Brasil na copa (30 pts)</span>
        <input type="text" value={vals.firstGoalBrazil} onChange={update('firstGoalBrazil')} placeholder="ex: Vinícius Jr." />
      </label>
      <label className="pred-field">
        <span>Último gol do Brasil na copa (20 pts)</span>
        <input type="text" value={vals.lastGoalBrazil} onChange={update('lastGoalBrazil')} placeholder="ex: Rodrygo" />
      </label>
      <label className="pred-field">
        <span>100º gol da copa (50 pts)</span>
        <input type="text" value={vals.hundredthGoal} onChange={update('hundredthGoal')} placeholder="quem marca?" />
      </label>
      <div className="pred-confirm__row">
        <Button variant="primary" onClick={handleSave}>Salvar quem marca</Button>
      </div>
    </Card>
  );
}

const FINALISTS_TOP_N = 12;

function FinalistsTab({ teams, current, teamBoosts = {}, onSave }) {
  const [picks, setPicks] = useState(current?.finalists || []);
  const [showAll, setShowAll] = useState(false);

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

  // Default view: top N favorites + whatever the user has already picked
  // (so a zebra selection doesn't disappear when the list collapses).
  // Expanded view: show all 48.
  const visibleTeams = useMemo(() => {
    if (showAll) return sortedTeams;
    const top = sortedTeams.slice(0, FINALISTS_TOP_N);
    const topCodes = new Set(top.map(t => t.code));
    const extraPicks = sortedTeams.filter(t => picks.includes(t.code) && !topCodes.has(t.code));
    return [...top, ...extraPicks];
  }, [sortedTeams, showAll, picks]);

  const hiddenCount = sortedTeams.length - visibleTeams.length;

  return (
    <Card id="sec-finalistas">
      <h3 className="pred-section-title">Escolha os dois finalistas</h3>
      <p className="muted">
        20 pontos × multiplicador por finalista correto. O multiplicador de zebra é mais suave do que o do campeão (porque chegar à final é bem mais fácil que ganhar a copa) — favorito = 1×, azarão extremo = 1.75×.
      </p>
      <div className="pred-finalists__grid">
        {visibleTeams.map(team => {
          const boost = finalistBoost(teamBoosts[team.code] || 1);
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
      {hiddenCount > 0 && (
        <div style={{ marginTop: 'var(--sp-3)', textAlign: 'center' }}>
          <Button variant="ghost" onClick={() => setShowAll(true)}>
            Mostrar mais {hiddenCount} seleções ↓
          </Button>
        </div>
      )}
      {showAll && (
        <div style={{ marginTop: 'var(--sp-3)', textAlign: 'center' }}>
          <Button variant="ghost" onClick={() => setShowAll(false)}>
            Mostrar só os favoritos ↑
          </Button>
        </div>
      )}
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
    <Card id="sec-premios">
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
    <Card id="sec-zebra">
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


