import { useMemo } from 'react';
import Card from '../components/Card.jsx';
import Pill from '../components/Pill.jsx';
import TeamChip from '../components/TeamChip.jsx';
import { useData } from '../context/DataContext.jsx';
import './RegulamentoPage.css';

export default function RegulamentoPage() {
  const { config, teamsByCode, teamBoosts } = useData();

  const sortedOdds = useMemo(() => {
    const odds = config?.tournamentOdds || {};
    return Object.entries(odds)
      .filter(([code]) => teamsByCode[code])
      .sort((a, b) => b[1] - a[1])
      .map(([code, prob]) => ({
        team: teamsByCode[code],
        prob,
        boost: teamBoosts[code] || 1
      }));
  }, [config, teamsByCode, teamBoosts]);

  const tournamentStartsAt = config?.tournamentStartsAt ? new Date(config.tournamentStartsAt) : null;
  const oddsLocked = tournamentStartsAt && tournamentStartsAt.getTime() <= Date.now();

  return (
    <>
      <h2 className="page-title">Regulamento</h2>
      <p className="muted reg-intro">
        Todas as regras de pontuação do bolão. Em caso de dúvida ou divergência, o admin (Luli) decide.
      </p>

      <Card className="reg-card">
        <h3 className="reg-h">Como funciona, em 30 segundos</h3>
        <ol className="reg-ol">
          <li>Você palpita o <strong>placar de todos os jogos</strong> (104 partidas).</li>
          <li>Você dá <strong>palpites longos</strong>: classificação, finalistas, prêmios individuais, zebra/decepção, e 8 apostas extras.</li>
          <li>Conforme o mundial rola, o sistema computa seus pontos automaticamente.</li>
          <li>O mais pontuado no final ganha. Empate se resolve por mais cravadas → ordem alfabética.</li>
        </ol>
      </Card>

      {/* ======================= 1. POR PARTIDA ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">1. Pontos por partida</h3>
        <p className="muted">
          Sistema enxuto: cravou o placar exato vale 8, acertar só o resultado (vencedor ou empate) vale 5, qualquer outra coisa vale 0. Acertar o número de gols de só um dos times sem acertar o resultado <strong>não pontua</strong>.
        </p>
        <div className="reg-table-wrap">
          <table className="reg-table">
            <thead>
              <tr>
                <th>Seu palpite vs resultado real</th>
                <th className="ta-c">Base</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>Cravada</strong> (placar exato, ex: 2–1 vs 2–1)</td><td className="ta-c"><strong>8</strong></td></tr>
              <tr><td><strong>Acerto</strong> (vencedor correto, ou empate quando deu empate)</td><td className="ta-c"><strong>5</strong></td></tr>
              <tr><td>Qualquer outra coisa (errou o resultado)</td><td className="ta-c">0</td></tr>
              <tr><td className="muted">Sem palpite</td><td className="ta-c muted">0</td></tr>
            </tbody>
          </table>
        </div>
        <div className="reg-section">
          <h4 className="reg-h4">No mata-mata, empate exige escolher quem passa</h4>
          <p>
            Empate não existe em jogo eliminatório — alguém sempre passa (prorrogação / pênaltis). Por isso, sempre que você palpitar um placar de empate num jogo de mata-mata, é obrigatório escolher também a seleção que avança. O sistema usa essa escolha pra recompensar/penalizar:
          </p>
          <ul className="reg-ul">
            <li><strong>Cravou o empate + acertou quem passa</strong>: 8 pts cheios.</li>
            <li><strong>Cravou o empate + errou quem passa</strong>: 7 pts (perde 1).</li>
            <li><strong>Palpitou empate, real foi não-empate + acertou quem passa</strong>: vira "acertou o resultado" (5 pts).</li>
            <li><strong>Palpitou empate, real foi não-empate + errou quem passa</strong>: 0.</li>
          </ul>
          <p className="muted reg-foot">
            Jogos de mata-mata só ficam palpitáveis depois que os times anteriores forem definidos (R32 abre quando grupos terminarem; R16 abre quando R32 terminar; etc.). Cada jogo trava no seu próprio apito inicial.
          </p>
        </div>
      </Card>

      {/* ======================= 2. MULTIPLICADORES ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">2. Multiplicador da fase</h3>
        <p className="muted">
          Quanto mais avança o mundial, mais cada acerto vale. O multiplicador da fase aplica em cima dos pontos base, e o resultado é arredondado pra cima:
        </p>
        <div className="reg-table-wrap">
          <table className="reg-table">
            <thead>
              <tr>
                <th>Fase</th>
                <th className="ta-c">Multiplicador</th>
                <th className="ta-c">Cravada</th>
                <th className="ta-c">Acerto</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Grupos</td><td className="ta-c">×1.00</td><td className="ta-c">8</td><td className="ta-c">5</td></tr>
              <tr><td>32-avos</td><td className="ta-c">×1.25</td><td className="ta-c">10</td><td className="ta-c">7</td></tr>
              <tr><td>Oitavas</td><td className="ta-c">×1.5625</td><td className="ta-c">13</td><td className="ta-c">8</td></tr>
              <tr><td>Quartas / 3º</td><td className="ta-c">×1.9531</td><td className="ta-c">16</td><td className="ta-c">10</td></tr>
              <tr><td>Semi</td><td className="ta-c">×2.4414</td><td className="ta-c">20</td><td className="ta-c">13</td></tr>
              <tr><td>Final</td><td className="ta-c">×3.0518</td><td className="ta-c">25</td><td className="ta-c">16</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted reg-foot">
          Fórmula: <code>pontos = teto(base × multiplicador da fase)</code>.
        </p>
      </Card>

      {/* ======================= 3. PALPITES LONGOS ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">3. Palpites longos do torneio</h3>
        <div className="reg-section">
          <h4 className="reg-h4">3.1. Classificação <span className="muted">— 4 pts por seleção que realmente passar (sem multiplicador)</span></h4>
          <p>
            Você palpita o placar dos 72 jogos da fase de grupos; o sistema deriva automaticamente quem classifica (16 primeiros lugares + 16 segundos + 8 melhores terceiros = 32 seleções).
            Não tem botão de "confirmar" — a sua lista de 32 atualiza sozinha toda vez que você muda um placar em Jogos. Cada acerto vale <strong>4 pontos flat</strong> — sem boost por seleção (volume de 32 picks já dá peso suficiente).
            <br />
            <strong>Máximo possível:</strong> 128 pts (acertando os 32).
          </p>
        </div>

        <div className="reg-section">
          <h4 className="reg-h4">3.2. Finalistas <span className="muted">— 14 pts × multiplicador, por finalista correto</span></h4>
          <p>
            Você escolhe duas seleções; ordem não importa. Usa o <strong>mesmo multiplicador do campeão</strong> (log-prob das odds atuais — ver §4), pra que a diferença entre favoritos siga as odds reais.
            Favorito = <strong>1×</strong>, azarão extremo = <strong>2.5×</strong>.
            <br />
            <strong>Máximo:</strong> 100 pts (ambos zebras extremas), com favoritos = 40 pts.
          </p>
        </div>

        <div className="reg-section">
          <h4 className="reg-h4">3.3. Prêmios individuais <span className="muted">— 14 pts cada (sem multiplicador)</span></h4>
          <ul className="reg-ul">
            <li><strong>Bola de Ouro</strong> (melhor jogador da copa)</li>
            <li><strong>Melhor jogador jovem</strong></li>
            <li><strong>Luva de Ouro</strong> (melhor goleiro)</li>
            <li><strong>Chuteira de Ouro</strong> (artilheiro da copa)</li>
          </ul>
          <p>O nome deve bater <em>exato</em> com o vencedor oficial (não diferencia maiúscula/minúscula). Máximo: 80 pts.</p>
        </div>

        <div className="reg-section">
          <h4 className="reg-h4">3.4. Zebra & decepção <span className="muted">— 11 pts cada (sem multiplicador)</span></h4>
          <p>
            Feito <em>antes</em> do mundial: você palpita qual seleção será a "zebra" (surpresa positiva) e qual será a "decepção" (esperava muito, foi mal).
            Depois da final, os amigos votam e a seleção mais votada vira a resposta oficial. Máximo: 22 pts.
          </p>
        </div>
      </Card>

      {/* ======================= 4. MULTIPLICADOR DE ZEBRA ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">4. Multiplicador de zebra (palpites longos)</h3>
        <p>
          As casas de apostas listam cada seleção pela <em>probabilidade de ser campeã</em>. A gente usa a probabilidade real (não o ranking) pra calcular o multiplicador, com escala logarítmica — assim os favoritos do topo já têm diferenças visíveis entre si (ex: França e Brasil saem com multiplicadores claramente distintos, em vez de quase iguais). <strong>Favorito = 1×, azarão extremo = 2.5×</strong>, log-prob no meio.
        </p>

        <details className="reg-details">
          <summary>
            {oddsLocked
              ? <>Ver odds congeladas no início do mundial ({sortedOdds.length} seleções)</>
              : <>Ver odds atuais ({sortedOdds.length} seleções) — atualiza a cada 10 min até o início do mundial</>
            }
          </summary>
          {sortedOdds.length === 0 ? (
            <p className="muted reg-foot">
              Odds ainda não foram puxadas. O cron precisa rodar pelo menos uma vez (GitHub Actions secrets).
            </p>
          ) : (
            <div className="reg-table-wrap">
              <table className="reg-table reg-odds-table">
                <thead>
                  <tr>
                    <th className="ta-c">#</th>
                    <th>Seleção</th>
                    <th className="ta-c">Prob. campeão</th>
                    <th className="ta-c">Multiplicador</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOdds.map((row, i) => (
                    <tr key={row.team.code}>
                      <td className="ta-c muted">{i + 1}</td>
                      <td><TeamChip team={row.team} size="sm" showCode /></td>
                      <td className="ta-c tabular">{(row.prob * 100).toFixed(1)}%</td>
                      <td className="ta-c tabular"><strong>× {row.boost.toFixed(2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>

        <p className="muted reg-foot">
          <strong>Aplica em:</strong> finalistas, e no palpite de campeão das Extras. <br />
          <strong>NÃO aplica em:</strong> jogos individuais (placar), classificação (4 pts flat por acerto), prêmios individuais, zebra/decepção, e nas outras apostas extras. <br />
          <strong>Trava em:</strong> {tournamentStartsAt ? tournamentStartsAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '11 de junho de 2026'} — depois disso o snapshot fica fixo até o fim da copa.
        </p>
      </Card>

      {/* ======================= 5. EXTRAS ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">5. Apostas extras</h3>
        <p className="muted">8 apostas adicionais.</p>
        <div className="reg-table-wrap">
          <table className="reg-table">
            <thead>
              <tr>
                <th>Aposta</th>
                <th>Tipo</th>
                <th className="ta-c">Pontos</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>O campeão</td><td>Seleção</td><td className="ta-c">21 × multiplicador</td></tr>
              <tr><td>Total de gols na copa</td><td>Número</td><td className="ta-c">42 exato, −4 por gol off</td></tr>
              <tr><td>G+A do Neymar</td><td>Número</td><td className="ta-c">21 (cravada) ou 0</td></tr>
              <tr><td>Nº de gols do artilheiro</td><td>Número</td><td className="ta-c">14 (cravada) ou 0</td></tr>
              <tr><td>Primeiro gol do Brasil</td><td>Jogador (texto)</td><td className="ta-c">18</td></tr>
              <tr><td>Último gol do Brasil</td><td>Jogador (texto)</td><td className="ta-c">18</td></tr>
              <tr><td>100º gol da copa</td><td>Jogador (texto)</td><td className="ta-c">35</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted reg-foot">
          Só o <strong>total de gols</strong> tem a regra de proximidade (após redução: <code>teto(0.7 × max(0, 60 − 5 × |seu palpite − valor real|))</code> = até 42 pts); errar por mais que 12 zera. As outras numéricas (G+A do Neymar, gols do artilheiro) são tudo-ou-nada: cravou o número ganha tudo, errou por qualquer margem ganha zero. Apostas de texto exigem o nome exato (não diferencia maiúscula/minúscula).
        </p>
      </Card>

      {/* ======================= 6. TRAVAS ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">6. Quando os palpites travam</h3>
        <ul className="reg-ul">
          <li><strong>Grupos + palpites longos</strong> travam todos juntos no apito inicial do <strong>primeiro jogo</strong> do mundial (11/jun/2026): 72 placares da fase de grupos, classificação, finalistas, prêmios, zebra, todas as apostas extras.</li>
          <li><strong>Mata-mata</strong> funciona diferente: cada jogo só fica palpitável depois que os times forem definidos pela rodada anterior, e trava no seu próprio apito inicial. Por exemplo, R32 abre quando os grupos terminam, R16 abre quando o R32 termina, etc.</li>
          <li>Depois da trava de um jogo, todo mundo pode ver os palpites dos outros (modal "Ver palpites dos amigos" no card).</li>
          <li><strong>Votação da zebra/decepção</strong> só é permitida quando o admin abrir, depois da final.</li>
        </ul>
        <p className="muted reg-foot">
          As travas valem tanto na UI (botões desabilitados) quanto no banco (regra do Postgres) — ou seja, não tem como burlar.
        </p>
      </Card>

      {/* ======================= 7. CRITÉRIOS DE DESEMPATE ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">7. Desempate</h3>
        <p>Se dois ou mais jogadores empatarem no total de pontos, o desempate é feito nesta ordem:</p>
        <ol className="reg-ol">
          <li>Mais <strong>cravadas</strong> (placares exatos) durante o mundial inteiro.</li>
          <li>Se ainda empatar, ordem <strong>alfabética</strong> do nome.</li>
        </ol>
      </Card>

      {/* ======================= 8. ACESSO ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">8. Acesso e conta</h3>
        <ul className="reg-ul">
          <li><strong>Senha do bolão</strong>: compartilhada entre os amigos, dá acesso à entrada.</li>
          <li><strong>Sua conta</strong>: nome de exibição + PIN de 6 dígitos. <strong>Anote o PIN.</strong></li>
          <li>O <em>mesmo nome + mesmo PIN</em> em qualquer aparelho (celular, computador, navegador anônimo) entra na <strong>mesma conta</strong>, com seus palpites salvos.</li>
          <li>Se você esquecer o PIN, fala com o admin que regenera.</li>
        </ul>
      </Card>

      {/* ======================= 9. ATUALIZACAO AUTOMATICA ======================= */}
      <Card className="reg-card">
        <h3 className="reg-h">9. Resultados em tempo real</h3>
        <p>
          Os resultados dos jogos vêm automaticamente da <a href="https://www.football-data.org" target="_blank" rel="noopener noreferrer">football-data.org</a>, atualizando a cada ~10 minutos. As probabilidades das casas vêm da <a href="https://the-odds-api.com" target="_blank" rel="noopener noreferrer">the-odds-api.com</a>.
          Prêmios individuais e resultado das apostas extras são <strong>inseridos manualmente</strong> pelo admin (não tem API pública pra "Bola de Ouro", "primeiro gol do Brasil" etc).
        </p>
      </Card>

      <Card className="reg-card">
        <h3 className="reg-h">10. Bom senso</h3>
        <p>
          É uma brincadeira entre amigos. Bug, dúvida, regra que parece injusta — fala com o admin. <Pill variant="success">Bom mundial!</Pill>
        </p>
      </Card>
    </>
  );
}
