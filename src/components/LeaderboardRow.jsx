import Pill from './Pill.jsx';
import './LeaderboardRow.css';

const MEDAL = {
  1: 'leaderboard-row--gold',
  2: 'leaderboard-row--silver',
  3: 'leaderboard-row--bronze'
};

export default function LeaderboardRow({
  rank,
  player,
  isMe = false,
  onClick
}) {
  const medalClass = MEDAL[rank] || '';
  const classes = [
    'leaderboard-row',
    medalClass,
    isMe ? 'is-me' : '',
    onClick ? 'is-clickable' : ''
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="leaderboard-row__rank tabular">{rank}</span>
      <span className="leaderboard-row__name">
        {player.name}
        {player.isAdmin && <span className="leaderboard-row__tag">admin</span>}
      </span>
      <Pill variant="points">{player.points.total} pts</Pill>
    </button>
  );
}
