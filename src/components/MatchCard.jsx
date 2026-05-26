import { useEffect, useState } from 'react';
import Card from './Card.jsx';
import Pill from './Pill.jsx';
import TeamChip from './TeamChip.jsx';
import ScoreStepper from './ScoreStepper.jsx';
import Button from './Button.jsx';
import { baseMatchPoints, matchPoints, DEFAULT_ROUND_MULTIPLIERS } from '../lib/scoring.js';
import './MatchCard.css';

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
  draft,         // { homeScore, awayScore } | undefined
  onSave,
  onDraftChange  // (matchId, { homeScore, awayScore } | null) -> void
}) {
  const isKnockoutPlaceholder =
    match.stage !== 'group' && (!match.homeTeam || !match.awayTeam);

  // Source of truth precedence: draft > saved prediction > 0/0.
  const initialHome = draft?.homeScore ?? prediction?.homeScore ?? 0;
  const initialAway = draft?.awayScore ?? prediction?.awayScore ?? 0;
  const [home, setHome] = useState(initialHome);
  const [away, setAway] = useState(initialAway);
  const [editing, setEditing] = useState(false);

  // Keep local state in sync when a saved prediction or draft arrives from outside.
  useEffect(() => {
    setHome(draft?.homeScore ?? prediction?.homeScore ?? 0);
    setAway(draft?.awayScore ?? prediction?.awayScore ?? 0);
  }, [prediction?.homeScore, prediction?.awayScore, draft?.homeScore, draft?.awayScore]);

  // Bubble stepper changes up to the parent so a "Save all" button can
  // commit them at once. Only fires when the value differs from what's
  // currently saved (otherwise stops being a draft).
  const reportDraft = (h, a) => {
    if (!onDraftChange) return;
    const matchesSaved =
      prediction && prediction.homeScore === h && prediction.awayScore === a;
    if (matchesSaved) {
      onDraftChange(match.id, null);
    } else {
      onDraftChange(match.id, { homeScore: h, awayScore: a });
    }
  };

  const setHomeAndReport = (n) => { setHome(n); reportDraft(n, away); };
  const setAwayAndReport = (n) => { setAway(n); reportDraft(home, n); };

  const kickoffAt = new Date(match.kickoffAt);
  const isPastKickoff = kickoffAt.getTime() <= Date.now();
  const locked = match.status !== 'scheduled' || isPastKickoff || isKnockoutPlaceholder;
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const hasPrediction = !!prediction;

  const countdown = useCountdown(match.kickoffAt);

  // Compute points if finished.
  let earnedBase = 0;
  let earnedPoints = 0;
  let stageMultiplier = 1;
  if (isFinished && hasPrediction) {
    earnedBase = baseMatchPoints(prediction, match);
    earnedPoints = matchPoints(prediction, match, match.stage, multipliers);
    stageMultiplier = (multipliers || DEFAULT_ROUND_MULTIPLIERS)[match.stage] ?? 1;
  }

  const showSteppers = !locked && (editing || !hasPrediction);

  const handleSave = () => {
    onSave?.({ homeScore: home, awayScore: away });
    setEditing(false);
    onDraftChange?.(match.id, null);
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
            Palpitável quando os jogos anteriores terminarem.
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
            <div className="match-card__actions">
              {hasPrediction && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setHome(prediction.homeScore);
                    setAway(prediction.awayScore);
                    onDraftChange?.(match.id, null);
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button variant="primary" onClick={handleSave} disabled={locked}>
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
              {isFinished && (
                <span
                  className={
                    earnedBase === 7
                      ? 'match-card__verdict match-card__verdict--exact'
                      : earnedBase >= 2
                      ? 'match-card__verdict match-card__verdict--ok'
                      : 'match-card__verdict match-card__verdict--miss'
                  }
                >
                  {earnedBase === 7 ? 'Cravou!' : earnedBase >= 2 ? 'Acertou o resultado' : 'Errou'}
                </span>
              )}
              {!isFinished && !locked && (
                <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>
              )}
              {!isFinished && locked && (
                <span className="match-card__locked-hint muted">
                  Travado no apito inicial
                </span>
              )}
            </div>

            {isFinished && (
              <aside className="match-card__breakdown" aria-label="Detalhamento da pontuação">
                <div className="match-card__breakdown-title">Como foi pontuado</div>
                <BreakdownRow label={
                  earnedBase === 7 ? 'Placar exato'
                  : earnedBase === 3 ? 'Resultado + 1 placar'
                  : earnedBase === 2 ? 'Resultado correto'
                  : earnedBase === 1 ? '1 placar correto'
                  : 'Nada'
                } value={`${earnedBase} pt${earnedBase === 1 ? '' : 's'}`} />
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
      </div>
    </Card>
  );
}
