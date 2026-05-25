import { useMemo, useState } from 'react';
import LeaderboardRow from '../components/LeaderboardRow.jsx';
import ColourBand from '../components/ColourBand.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import './LeaderboardPage.css';

function sortPlayers(players) {
  return [...players].sort((a, b) => {
    if (b.points.total !== a.points.total) return b.points.total - a.points.total;
    if (b.stats.exactScores !== a.stats.exactScores) return b.stats.exactScores - a.stats.exactScores;
    return a.name.localeCompare(b.name);
  });
}

function assignRanks(sorted) {
  const out = [];
  let lastKey = null;
  let lastRank = 0;
  sorted.forEach((p, idx) => {
    const key = `${p.points.total}|${p.stats.exactScores}`;
    const rank = key === lastKey ? lastRank : idx + 1;
    lastKey = key;
    lastRank = rank;
    out.push({ player: p, rank });
  });
  return out;
}

export default function LeaderboardPage() {
  const { session } = useAuth();
  const { players } = useData();
  const [selected, setSelected] = useState(null);

  const ranked = useMemo(
    () => assignRanks(sortPlayers(players)),
    [players]
  );

  return (
    <>
      <h2 className="page-title">Classificação</h2>
      <ColourBand />

      <div className="leaderboard-list">
        {ranked.map(({ player, rank }) => (
          <LeaderboardRow
            key={player.id}
            rank={rank}
            player={player}
            isMe={session?.id === player.id}
            onClick={() => setSelected(player)}
          />
        ))}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Detalhes de ${selected.name}` : 'Detalhes'}
      >
        {selected && (
          <div className="breakdown">
            <div className="breakdown__row">
              <span>Jogos</span>
              <strong className="tabular">{selected.points.matches}</strong>
            </div>
            <div className="breakdown__row">
              <span>Classificação</span>
              <strong className="tabular">{selected.points.advancement}</strong>
            </div>
            <div className="breakdown__row">
              <span>Finalistas</span>
              <strong className="tabular">{selected.points.finalists}</strong>
            </div>
            <div className="breakdown__row">
              <span>Prêmios</span>
              <strong className="tabular">{selected.points.awards}</strong>
            </div>
            <div className="breakdown__row">
              <span>Zebra</span>
              <strong className="tabular">{selected.points.poll}</strong>
            </div>
            <div className="breakdown__row breakdown__row--total">
              <span>Total</span>
              <strong className="tabular">{selected.points.total}</strong>
            </div>
            <div className="breakdown__row breakdown__row--meta">
              <span>Cravadas</span>
              <strong className="tabular">{selected.stats.exactScores}</strong>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
