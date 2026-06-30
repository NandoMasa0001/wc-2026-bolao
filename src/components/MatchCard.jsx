import { useEffect, useState } from 'react';
import Card from './Card.jsx';
import Pill from './Pill.jsx';
import TeamChip from './TeamChip.jsx';
import ScoreStepper from './ScoreStepper.jsx';
import Button from './Button.jsx';
import Modal from './Modal.jsx';
import { effectiveBase, matchPoints, DEFAULT_ROUND_MULTIPLIERS } from '../lib/scoring.js';
import { isMatchLocked } from '../lib/locking.js';
import './MatchCard.css';

/**
 * Human label for an effective-base value (see scoring.effectiveBase).
 * Covers the knockout tie matrix: 7/6 = cravou o empate, 4 = só quem passa.
 */
function verdictLabel(base) {
  switch (base) {
    case 8: return 'Cravou!';
    case 7: return 'Cravou o empate + quem passa';
    case 6: return 'Cravou o empate (errou quem passa)';
    case 5: return 'Acertou o resultado';
    case 4: return 'Acertou quem passa';
    case 2.5: return 'Acertou quem passa (palpitou empate)';
    default: return 'Errou';
  }
}

function BreakdownRow({ label, value, strong = false }) {
  return (
    <div className={'match-card__breakdown-row' + (strong ? ' is-strong' : '')}>
      <span>{label}</span>
      <strong className="tabular">{value}</strong>
    </div>
  );
}

const STAGE_LABEL = {
  group: 'Grupo',
  friendly: 'Amistoso (teste)',
  r32: 'Oitavas (R32)',
  r16: '16-avos',
  qf: 'Quartas',
  sf: 'Semifinal',
  third: 'Disputa 3º',
  final: 'Final'
};

function formatKickoff(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCountdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days >= 1)  return `em ${days}d ${hours}h`;
  if (hours >= 1) return `em ${hours}h ${mins.toString().padStart(2, '0')}m`;
  if (mins >= 1)  return `em ${mins}m ${secs.toString().padStart(2, '0')}s`;
  return `em ${secs}s`;
}

/**
 * Live-updating countdown that re-renders at an interval calibrated to
 * the time remaining: every second under 1 hour, every minute under
 * 1 day, every 10 minutes beyond that. Returns null when the target
 * has already passed.
 */
function useCountdown(targetIso) {
  const [, force] = useState(0);
  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const compute = () => {
      const remaining = target - Date.now();
      if (remaining <= 0) return null;
      if (remaining < 60 * 60 * 1000)         return 1000;        // < 1h: tick each second
      if (remaining < 24 * 60 * 60 * 1000)    return 60 * 1000;   // < 1d: each minute
      return 10 * 60 * 1000;                                       // else: each 10 min
    };
    let interval = compute();
    if (!interval) return;
    const id = setInterval(() => {
      force(n => n + 1);
      const next = compute();
      if (!next || next !== interval) {
        clearInterval(id);
        // re-mount the effect with the new cadence
        force(n => n + 1);
      }
    }, interval);
    return () => clearInterval(id);
  }, [targetIso]);

  return formatCountdown(targetIso);
}

export default function MatchCard({
  match,
  homeTeam,
  awayTeam,
  prediction,
  multipliers,
  tournamentStartsAt,
  allPlayerPicks,   // Array<{ player, prediction }> — populated after lock
  draft,            // { homeScore, awayScore } | undefined
  onSave,
  onDraftChange     // (matchId, { homeScore, awayScore } | null) -> void
}) {
  const [picksOpen, setPicksOpen] = useState(false);
  // Knockout matches are predictable ONLY when both teams are known
  // (i.e., after the previous round finishes). Until then they stay as
  // visualization placeholders.
  const isKnockout = match.stage !== 'group';
  const isKnockoutPlaceholder = isKnockout && (!match.homeTeam || !match.awayTeam);

  // Source of truth precedence: draft > saved prediction > 0/0.
  const initialHome = draft?.homeScore ?? prediction?.homeScore ?? 0;
  const initialAway = draft?.awayScore ?? prediction?.awayScore ?? 0;
  const [home, setHome] = useState(initialHome);
  const [away, setAway] = useState(initialAway);
  const [advancer, setAdvancer] = useState(draft?.advancer ?? prediction?.advancer ?? '');
  const [editing, setEditing] = useState(false);

  // Keep local state in sync when a saved prediction or draft arrives from outside.
  useEffect(() => {
    setHome(draft?.homeScore ?? prediction?.homeScore ?? 0);
    setAway(draft?.awayScore ?? prediction?.awayScore ?? 0);
    setAdvancer(draft?.advancer ?? prediction?.advancer ?? '');
  }, [prediction?.homeScore, prediction?.awayScore, prediction?.advancer,
      draft?.homeScore, draft?.awayScore, draft?.advancer]);

  // Whether the current pick needs an advancer (knockout + predicted tie).
  const needsAdvancer = isKnockout && home === away;
  const advancerValid = !needsAdvancer || (advancer === match.homeTeam || advancer === match.awayTeam);

  // Bubble stepper changes up to the parent so a "Save all" button can
  // commit them at once. Only fires when the value differs from what's
  // currently saved (otherwise stops being a draft).
  const reportDraft = (h, a, adv) => {
    if (!onDraftChange) return;
    const matchesSaved =
      prediction &&
      prediction.homeScore === h &&
      prediction.awayScore === a &&
      (prediction.advancer || '') === (adv || '');
    if (matchesSaved) {
      onDraftChange(match.id, null);
    } else {
      onDraftChange(match.id, { homeScore: h, awayScore: a, advancer: adv || null });
    }
  };

  const setHomeAndReport = (n) => { setHome(n); reportDraft(n, away, advancer); };
  const setAwayAndReport = (n) => { setAway(n); reportDraft(home, n, advancer); };
  const setAdvancerAndReport = (v) => { setAdvancer(v); reportDraft(home, away, v); };

  // Lock rule lives in lib/locking.js — mirrors the Supabase RLS but uses
  // the device's local clock, so a match locks the instant its kickoff
  // passes regardless of when the cron flips its status.
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const locked = isMatchLocked(match, tournamentStartsAt);
  const hasPrediction = !!prediction;

  // For group matches the lock is global (apito inicial do mundial), not
  // each match's kickoff — count down to that. Knockout matches keep
  // their per-match countdown.
  const lockAt = isKnockout ? match.kickoffAt : (tournamentStartsAt || match.kickoffAt);
  const countdown = useCountdown(lockAt);

  // Compute points if finished.
  let earnedBase = 0;
  let earnedPoints = 0;
  let stageMultiplier = 1;
  if (isFinished && hasPrediction) {
    earnedBase = effectiveBase(prediction, match, match.stage);
    earnedPoints = matchPoints(prediction, match, match.stage, multipliers);
    stageMultiplier = (multipliers || DEFAULT_ROUND_MULTIPLIERS)[match.stage] ?? 1;
  }

  const showSteppers = !locked && (editing || !hasPrediction);

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!advancerValid || saving) return;
    const payload = { homeScore: home, awayScore: away };
    if (needsAdvancer) payload.advancer = advancer;
    else payload.advancer = null; // clear stale advancer if user changed from tie to non-tie
    setSaving(true);
    try {
      await onSave?.(payload);
      // Only on success: exit edit mode and clear the draft.
      setEditing(false);
      onDraftChange?.(match.id, null);
    } catch {
      // Failure already surfaced via toast; keep the draft + edit mode so
      // the user can retry without re-typing.
    } finally {
      setSaving(false);
    }
  };

  const cardClasses = [
    'match-card',
    isLive ? 'match-card--live' : '',
    !isLive && hasPrediction && !isFinished ? 'match-card--predicted' : ''
  ].filter(Boolean).join(' ');

  return (
    <Card className={cardClasses} as="article">
      <header className="match-card__header">
        <div className="match-card__labels">
          {match.stage === 'group' && match.group && (
            <Pill variant="group" group={match.group}>
              Grupo {match.group}
            </Pill>
          )}
          {match.stage !== 'group' && (
            <Pill variant="neutral">{STAGE_LABEL[match.stage] || match.stage}</Pill>
          )}
          {isLive && <Pill variant="live">Ao vivo</Pill>}
          {locked && isLive && <Pill variant="locked">Palpites travados</Pill>}
          {locked && !isLive && !isFinished && <Pill variant="locked">Travado</Pill>}
          {isFinished && hasPrediction && (
            <Pill variant="points">+{earnedPoints}</Pill>
          )}
          {isFinished && !hasPrediction && (
            <Pill variant="neutral">Sem palpite</Pill>
          )}
        </div>
        <div className="match-card__kickoff">
          <time dateTime={match.kickoffAt}>{formatKickoff(match.kickoffAt)}</time>
          {!locked && countdown && (
            <span className="match-card__until tabular"> · trava {countdown}</span>
          )}
        </div>
      </header>

      <div className="match-card__teams">
        <div className="match-card__team match-card__team--home">
          <TeamChip
            team={homeTeam}
            placeholder={match.homePlaceholder}
            layout="stacked"
            showCode
            size="md"
          />
        </div>

        <div className="match-card__center">
          {isFinished || isLive ? (
            <div className="match-card__actual tabular">
              {match.homeScore ?? '–'}<span className="match-card__sep">–</span>{match.awayScore ?? '–'}
            </div>
          ) : (
            <div className="match-card__vs">vs</div>
          )}
        </div>

        <div className="match-card__team match-card__team--away">
          <TeamChip
            team={awayTeam}
            placeholder={match.awayPlaceholder}
            layout="stacked"
            showCode
            size="md"
          />
        </div>
      </div>

      {/* Prediction area */}
      <div className="match-card__prediction">
        {isKnockoutPlaceholder ? (
          <p className="match-card__hint muted">
            Mata-mata — visualização. Veja o bracket completo em <strong>Palpites → Classificação</strong>.
          </p>
        ) : showSteppers ? (
          <>
            <div className="match-card__steppers">
              <ScoreStepper
                value={home}
                onChange={setHomeAndReport}
                disabled={locked}
                ariaLabel={`Gols para ${homeTeam?.name || 'mandante'}`}
              />
              <span className="match-card__steppers-sep tabular">–</span>
              <ScoreStepper
                value={away}
                onChange={setAwayAndReport}
                disabled={locked}
                ariaLabel={`Gols para ${awayTeam?.name || 'visitante'}`}
              />
            </div>
            {needsAdvancer && (
              <div className="match-card__advancer">
                <label htmlFor={`adv-${match.id}`}>
                  Quem passa? <span className="muted">(obrigatório no empate)</span>
                </label>
                <select
                  id={`adv-${match.id}`}
                  value={advancer}
                  onChange={(e) => setAdvancerAndReport(e.target.value)}
                >
                  <option value="">— escolha —</option>
                  <option value={match.homeTeam}>{homeTeam?.name || match.homeTeam}</option>
                  <option value={match.awayTeam}>{awayTeam?.name || match.awayTeam}</option>
                </select>
              </div>
            )}
            <div className="match-card__actions">
              {hasPrediction && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setHome(prediction.homeScore);
                    setAway(prediction.awayScore);
                    setAdvancer(prediction.advancer || '');
                    onDraftChange?.(match.id, null);
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saving}
                disabled={locked || !advancerValid || saving}
              >
                {hasPrediction ? 'Atualizar' : 'Salvar palpite'}
              </Button>
            </div>
          </>
        ) : hasPrediction ? (
          <div className={'match-card__predicted' + (isFinished ? ' match-card__predicted--finished' : '')}>
            <div className="match-card__predicted-main">
              <div className="match-card__predicted-label muted">Seu palpite</div>
              <div className="match-card__predicted-score tabular">
                {prediction.homeScore}<span className="match-card__sep">–</span>{prediction.awayScore}
              </div>
              {prediction.advancer && (
                <div className="match-card__predicted-advancer muted">
                  Passa: <strong>{prediction.advancer === match.homeTeam ? (homeTeam?.name || match.homeTeam) : (awayTeam?.name || match.awayTeam)}</strong>
                </div>
              )}
              {isFinished && (
                <span
                  className={
                    earnedBase >= 6
                      ? 'match-card__verdict match-card__verdict--exact'
                      : earnedBase >= 2.5
                      ? 'match-card__verdict match-card__verdict--ok'
                      : 'match-card__verdict match-card__verdict--miss'
                  }
                >
                  {verdictLabel(earnedBase)}
                </span>
              )}
              {!isFinished && !locked && (
                <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>
              )}
              {!isFinished && locked && (
                <span className="match-card__locked-hint muted">
                  Travado
                </span>
              )}
            </div>

            {isFinished && (
              <aside className="match-card__breakdown" aria-label="Detalhamento da pontuação">
                <div className="match-card__breakdown-title">Como foi pontuado</div>
                <BreakdownRow
                  label={verdictLabel(earnedBase)}
                  value={`${earnedBase} pt${earnedBase === 1 ? '' : 's'}`}
                />
                {stageMultiplier !== 1 && (
                  <BreakdownRow
                    label="Multiplicador da fase"
                    value={`× ${stageMultiplier.toFixed(stageMultiplier >= 2 ? 2 : 4)}`}
                  />
                )}
                <div className="match-card__breakdown-divider" />
                <BreakdownRow label="Total" value={`${earnedPoints} pt${earnedPoints === 1 ? '' : 's'}`} strong />
              </aside>
            )}
          </div>
        ) : (
          <div className="match-card__no-pick">
            <span className="muted">Sem palpite ainda.</span>
          </div>
        )}

        {/* "Ver palpites dos amigos" — só depois que ESTE jogo trava (apito
            inicial dele), pra ninguém copiar palpite antes. */}
        {locked && allPlayerPicks && allPlayerPicks.length > 0 && (
          <button
            type="button"
            className="match-card__see-picks"
            onClick={() => setPicksOpen(true)}
          >
            Ver palpites dos amigos ({allPlayerPicks.length})
          </button>
        )}
      </div>

      <Modal
        open={picksOpen}
        onClose={() => setPicksOpen(false)}
        title={`Palpites — ${homeTeam?.name || match.homePlaceholder || '?'} vs ${awayTeam?.name || match.awayPlaceholder || '?'}`}
      >
        <PlayerPicksTable
          picks={allPlayerPicks || []}
          isFinished={isFinished}
          actualScore={isFinished ? { home: match.homeScore, away: match.awayScore } : null}
          isKnockout={isKnockout}
          match={match}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
        />
      </Modal>
    </Card>
  );
}

function PlayerPicksTable({ picks, isFinished, actualScore, isKnockout, match, homeTeam, awayTeam }) {
  if (picks.length === 0) {
    return <p className="muted">Ninguém palpitou esse jogo.</p>;
  }
  // Resolve an advancer team code to a readable name (falls back to the code).
  const advancerName = (code) => {
    if (!code) return null;
    if (code === match?.homeTeam) return homeTeam?.name || code;
    if (code === match?.awayTeam) return awayTeam?.name || code;
    return code;
  };
  return (
    <div className="picks-table-wrap">
      {isFinished && actualScore && (
        <p className="muted picks-table__actual">
          Resultado real: <strong className="tabular">{actualScore.home}–{actualScore.away}</strong>
        </p>
      )}
      <table className="picks-table">
        <thead>
          <tr>
            <th>Jogador</th>
            <th className="ta-c">Palpite</th>
            {isKnockout && <th className="ta-c">Passa</th>}
            {isFinished && <th className="ta-c">Pts</th>}
          </tr>
        </thead>
        <tbody>
          {picks.map(({ player, prediction }) => {
            const isExact = isFinished && actualScore &&
              prediction.homeScore === actualScore.home &&
              prediction.awayScore === actualScore.away;
            // "Quem passa" only matters when the player predicted a tie.
            const predictedTie = prediction.homeScore === prediction.awayScore;
            const adv = predictedTie ? advancerName(prediction.advancer) : null;
            return (
              <tr key={player.id} className={isExact ? 'is-exact' : ''}>
                <td>{player.name}</td>
                <td className="ta-c tabular">
                  {prediction.homeScore}–{prediction.awayScore}
                  {isExact && <span title="Cravou!" aria-label="Cravou"> ✓</span>}
                </td>
                {isKnockout && (
                  <td className="ta-c">
                    {adv ? adv : <span className="muted">—</span>}
                  </td>
                )}
                {isFinished && (
                  <td className="ta-c tabular">{prediction.points || 0}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
