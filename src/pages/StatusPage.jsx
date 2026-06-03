import { useMemo } from 'react';
import Card from '../components/Card.jsx';
import Pill from '../components/Pill.jsx';
import { useData } from '../context/DataContext.jsx';
import './StatusPage.css';

export default function StatusPage() {
  const { config, players, matches, predictions } = useData();

  const stats = useMemo(() => {
    const now = Date.now();
    const lastFetchTs = config?.lastFetchAt ? new Date(config.lastFetchAt).getTime() : null;
    const cronAgeMin = lastFetchTs != null ? Math.round((now - lastFetchTs) / 60000) : null;
    const tournamentTs = config?.tournamentStartsAt ? new Date(config.tournamentStartsAt).getTime() : null;
    const tournamentStarted = tournamentTs != null && tournamentTs <= now;

    const finished = matches.filter(m => m.status === 'finished');
    const live     = matches.filter(m => m.status === 'live');
    const upcoming = matches.filter(m => m.status === 'scheduled' && m.kickoffAt);
    upcoming.sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt));
    const next = upcoming[0] || null;

    const totalPredictions = Object.keys(predictions || {}).length;

    let countdown = null;
    if (tournamentTs && tournamentTs > now) {
      const totalMin = Math.floor((tournamentTs - now) / 60000);
      const days  = Math.floor(totalMin / (24 * 60));
      const hours = Math.floor((totalMin % (24 * 60)) / 60);
      countdown = { days, hours };
    }

    return {
      cronAgeMin, tournamentStarted, finished: finished.length, live: live.length,
      upcoming: upcoming.length, next, totalPlayers: players.length, totalPredictions,
      countdown
    };
  }, [config, players, matches, predictions]);

  const fmtMatch = (m) => {
    if (!m) return null;
    const home = m.homeTeam || m.homePlaceholder || '?';
    const away = m.awayTeam || m.awayPlaceholder || '?';
    const dt = new Date(m.kickoffAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `${home} × ${away} — ${dt}`;
  };

  const cronStatus =
    stats.cronAgeMin == null ? { variant: 'neutral',  label: 'sem registro'    } :
    stats.cronAgeMin <= 30   ? { variant: 'success',  label: `${stats.cronAgeMin} min atrás` } :
    stats.cronAgeMin <= 120  ? { variant: 'warning',  label: `${stats.cronAgeMin} min atrás` } :
                               { variant: 'danger',   label: stats.cronAgeMin < 60*24 ? `${Math.round(stats.cronAgeMin/60)} h atrás` : `${Math.round(stats.cronAgeMin/1440)} d atrás` };

  return (
    <>
      <h2 className="page-title">Status do bolão</h2>

      {stats.countdown && (
        <Card className="status-countdown">
          <strong>{stats.countdown.days}d {stats.countdown.hours}h</strong>
          <span>até o apito inicial</span>
        </Card>
      )}

      <Card>
        <h3 className="status-h">Saúde do sistema</h3>
        <ul className="status-list">
          <li><span>Última busca de resultados</span><Pill variant={cronStatus.variant}>{cronStatus.label}</Pill></li>
          <li><span>Mundial começou?</span><Pill variant={stats.tournamentStarted ? 'success' : 'neutral'}>{stats.tournamentStarted ? 'Sim' : 'Ainda não'}</Pill></li>
          <li><span>Jogadores cadastrados</span><strong>{stats.totalPlayers}</strong></li>
          <li><span>Palpites no banco</span><strong>{stats.totalPredictions}</strong></li>
        </ul>
      </Card>

      <Card>
        <h3 className="status-h">Jogos</h3>
        <ul className="status-list">
          <li><span>Finalizados</span><strong>{stats.finished}</strong></li>
          <li><span>Ao vivo agora</span><strong>{stats.live}</strong></li>
          <li><span>Por jogar</span><strong>{stats.upcoming}</strong></li>
          <li><span>Próximo</span><strong style={{ fontSize: 'var(--fs-small)', textAlign: 'right' }}>{fmtMatch(stats.next) || '—'}</strong></li>
        </ul>
      </Card>
    </>
  );
}
