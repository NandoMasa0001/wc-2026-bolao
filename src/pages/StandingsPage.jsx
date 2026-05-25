import { useMemo } from 'react';
import GroupTable from '../components/GroupTable.jsx';
import Card from '../components/Card.jsx';
import TeamChip from '../components/TeamChip.jsx';
import Pill from '../components/Pill.jsx';
import { useData } from '../context/DataContext.jsx';
import { computeStandings } from '../lib/standings.js';
import './StandingsPage.css';

const STAGE_LABEL = {
  r32: 'Oitavas (R32)',
  r16: '16-avos',
  qf: 'Quartas',
  sf: 'Semifinais',
  third: 'Disputa do 3º',
  final: 'Final'
};

export default function StandingsPage() {
  const { matches, teamsByCode, teamsByGroup } = useData();

  const standings = useMemo(
    () => computeStandings({
      matches: matches.filter(m => m.stage === 'group'),
      teamsByGroup
    }),
    [matches, teamsByGroup]
  );

  const bestThirdAdvancing = standings.bestThirds.slice(
    0,
    Math.min(8, standings.bestThirds.length)
  );

  // Knockout matches (non-group) for the simple bracket view.
  const knockout = matches.filter(m => m.stage !== 'group');

  return (
    <>
      <h2 className="page-title">Tabelas</h2>

      <section className="page-section">
        <h3 className="page-section__title">Fase de grupos</h3>
        <p className="muted standings__hint">
          Tabelas em tempo real, calculadas com base nos resultados. Linhas verdes se classificam, linha dourada disputa vaga como melhor terceiro.
        </p>
        <div className="standings__groups">
          {Object.entries(standings.groups).map(([group, rows]) => (
            <GroupTable
              key={group}
              group={group}
              rows={rows}
              teamsByCode={teamsByCode}
              contendingThird={
                bestThirdAdvancing.find(t => rows[2] && t.team === rows[2].team) || null
              }
            />
          ))}
        </div>
      </section>

      <section className="page-section">
        <h3 className="page-section__title">Mata-mata</h3>
        <div className="stack">
          {knockout.map((m) => {
            const home = teamsByCode[m.homeTeam];
            const away = teamsByCode[m.awayTeam];
            return (
              <Card key={m.id} className="standings__knockout">
                <header className="standings__knockout-header">
                  <Pill variant="neutral">{STAGE_LABEL[m.stage] || m.stage}</Pill>
                  {m.status === 'live' && <Pill variant="live">Ao vivo</Pill>}
                  {m.status === 'finished' && <Pill variant="points">Encerrado</Pill>}
                </header>
                <div className="standings__knockout-body">
                  <TeamChip team={home} placeholder={m.homePlaceholder} showCode />
                  <span className="standings__knockout-vs tabular">
                    {m.status === 'scheduled' ? 'vs' : `${m.homeScore ?? '–'} – ${m.awayScore ?? '–'}`}
                  </span>
                  <TeamChip team={away} placeholder={m.awayPlaceholder} showCode />
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
