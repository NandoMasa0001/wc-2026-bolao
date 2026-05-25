import { useMemo, useState } from 'react';
import ColourBand from '../components/ColourBand.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import './LeaderboardPage.css';

function sortPlayers(players) {
  return [...players].sort((a, b) => {
    if (b.points.total !== a.points.total) return b.points.total - a.points.total;
    if (b.stats.exactScores !== a.stats.exactScores) return b.stats.exactScores - a.stats.exactScores;
    return a.name.localeCompare(b.name, 'pt-BR');
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

const MEDAL_CLASS = {
  1: 'lb-row--gold',
  2: 'lb-row--silver',
  3: 'lb-row--bronze'
};

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

      <p className="muted lb-help">
        Cada coluna mostra de onde vieram os pontos do jogador. Toca em uma linha pra ver detalhes (cravadas, palpites feitos).
      </p>

      <div className="lb-scroll">
        <table className="lb-table">
          <thead>
            <tr>
              <th scope="col" className="ta-c">#</th>
              <th scope="col">Jogador</th>
              <th scope="col" className="ta-c" title="Jogos (placar das 104 partidas)">J</th>
              <th scope="col" className="ta-c" title="Classificação (quem passa da fase de grupos)">C</th>
              <th scope="col" className="ta-c" title="Finalistas">F</th>
              <th scope="col" className="ta-c" title="Prêmios individuais (Bola/Luva/Chuteira de Ouro + jovem)">P</th>
              <th scope="col" className="ta-c" title="Zebra & decepção">Z</th>
              <th scope="col" className="ta-c" title="Apostas extras (campeão, total de gols, etc.)">E</th>
              <th scope="col" className="ta-c lb-total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ player, rank }) => {
              const isMe = session?.id === player.id;
              const cls = [
                'lb-row',
                MEDAL_CLASS[rank] || '',
                isMe ? 'is-me' : ''
              ].filter(Boolean).join(' ');
              const p = player.points || {};
              return (
                <tr
                  key={player.id}
                  className={cls}
                  onClick={() => setSelected(player)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver detalhes de ${player.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(player);
                    }
                  }}
                >
                  <td className="ta-c lb-rank tabular">{rank}</td>
                  <td className="lb-name">
                    {player.name}
                    {player.isAdmin && <span className="lb-admin-tag">admin</span>}
                  </td>
                  <td className="ta-c tabular">{p.matches || 0}</td>
                  <td className="ta-c tabular">{p.advancement || 0}</td>
                  <td className="ta-c tabular">{p.finalists || 0}</td>
                  <td className="ta-c tabular">{p.awards || 0}</td>
                  <td className="ta-c tabular">{p.poll || 0}</td>
                  <td className="ta-c tabular">{p.extras || 0}</td>
                  <td className="ta-c tabular lb-total">{p.total || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="lb-legend">
        <li><strong>J</strong> = Jogos (placar das 104 partidas)</li>
        <li><strong>C</strong> = Classificação (quem passa da fase de grupos)</li>
        <li><strong>F</strong> = Finalistas</li>
        <li><strong>P</strong> = Prêmios individuais</li>
        <li><strong>Z</strong> = Zebra & decepção</li>
        <li><strong>E</strong> = Apostas extras</li>
      </ul>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Detalhes de ${selected.name}` : 'Detalhes'}
      >
        {selected && (
          <div className="breakdown">
            <div className="breakdown__row">
              <span>Jogos</span>
              <strong className="tabular">{selected.points.matches || 0}</strong>
            </div>
            <div className="breakdown__row">
              <span>Classificação</span>
              <strong className="tabular">{selected.points.advancement || 0}</strong>
            </div>
            <div className="breakdown__row">
              <span>Finalistas</span>
              <strong className="tabular">{selected.points.finalists || 0}</strong>
            </div>
            <div className="breakdown__row">
              <span>Prêmios</span>
              <strong className="tabular">{selected.points.awards || 0}</strong>
            </div>
            <div className="breakdown__row">
              <span>Zebra</span>
              <strong className="tabular">{selected.points.poll || 0}</strong>
            </div>
            <div className="breakdown__row">
              <span>Extras</span>
              <strong className="tabular">{selected.points.extras || 0}</strong>
            </div>
            <div className="breakdown__row breakdown__row--total">
              <span>Total</span>
              <strong className="tabular">{selected.points.total || 0}</strong>
            </div>
            <div className="breakdown__row breakdown__row--meta">
              <span>Cravadas</span>
              <strong className="tabular">{selected.stats?.exactScores || 0}</strong>
            </div>
            <div className="breakdown__row breakdown__row--meta">
              <span>Palpites de placar feitos</span>
              <strong className="tabular">{selected.stats?.predictionsMade || 0}</strong>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
