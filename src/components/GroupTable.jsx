import Pill from './Pill.jsx';
import TeamChip from './TeamChip.jsx';
import './GroupTable.css';

/**
 * GroupTable — standings for one group.
 *
 * Props:
 *  - group:   "A" .. "L"
 *  - rows:    output of standings.js for that group
 *  - teamsByCode: lookup so we can render flags
 *  - highlightAdvancing: when true, top 2 get a "✓" badge
 *  - contendingThirdsByGroup: { groupKey: rowOrNull } to gold-tint the 3rd row
 */
export default function GroupTable({
  group,
  rows = [],
  teamsByCode = {},
  highlightAdvancing = true,
  contendingThird = null
}) {
  return (
    <div className="group-table">
      <header className="group-table__header">
        <Pill variant="group" group={group}>Grupo {group}</Pill>
      </header>
      <div className="group-table__scroll">
        <table className="group-table__table">
          <thead>
            <tr>
              <th scope="col" className="ta-c">#</th>
              <th scope="col">Seleção</th>
              <th scope="col" className="ta-c group-table__pts-col">Pts</th>
              <th scope="col" className="ta-c" title="Jogos">J</th>
              <th scope="col" className="ta-c" title="Vitórias">V</th>
              <th scope="col" className="ta-c" title="Empates">E</th>
              <th scope="col" className="ta-c" title="Derrotas">D</th>
              <th scope="col" className="ta-c" title="Gols feitos">GP</th>
              <th scope="col" className="ta-c" title="Gols sofridos">GC</th>
              <th scope="col" className="ta-c" title="Saldo de gols">SG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const advancing = highlightAdvancing && idx < 2;
              const contending = highlightAdvancing && idx === 2 && contendingThird?.team === row.team;
              const rowClass = [
                advancing ? 'is-advancing' : '',
                contending ? 'is-contending' : '',
                row.tied ? 'is-tied' : ''
              ].filter(Boolean).join(' ');
              const team = teamsByCode[row.team];
              return (
                <tr key={row.team} className={rowClass}>
                  <td className="ta-c">{row.position}</td>
                  <td>
                    <div className="group-table__team-cell">
                      <TeamChip team={team} size="sm" showCode />
                      {advancing && (
                        <span className="group-table__check" title="Classificado">
                          <span aria-hidden="true">✓</span>
                          <span className="sr-only">Classificado</span>
                        </span>
                      )}
                      {row.tied && (
                        <span className="group-table__tie" title="Empate técnico — resolvido por sorteio na vida real">≈</span>
                      )}
                    </div>
                  </td>
                  <td className="ta-c tabular group-table__pts">{row.pts}</td>
                  <td className="ta-c tabular">{row.played}</td>
                  <td className="ta-c tabular">{row.won}</td>
                  <td className="ta-c tabular">{row.drawn}</td>
                  <td className="ta-c tabular">{row.lost}</td>
                  <td className="ta-c tabular">{row.gf}</td>
                  <td className="ta-c tabular">{row.ga}</td>
                  <td className="ta-c tabular">{row.gd}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
