/**
 * mockData.js — single source of mock seed data for Milestone 1.
 *
 * All fake data lives here so it can be swapped for live Firestore
 * subscriptions later without touching the rest of the app.
 *
 * Includes:
 *  - 2 groups of 4 teams (8 teams total)
 *  - 12 group matches across scheduled / live / finished states
 *  - 2 knockout matches (1 with placeholders, 1 with known teams)
 *  - 6 fake players with seeded predictions
 *  - a mock `config/tournament` document
 */

import { computeMatchesBucket } from './scoring.js';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export const mockConfig = {
  sharedPassword: 'test',
  predictionsOpen: true,
  tournamentStartsAt: new Date('2026-06-11T16:00:00Z'),
  roundMultipliers: {
    group: 1,
    r32: 1.25,
    r16: 1.5625,
    qf: 1.953125,
    third: 1.953125,
    sf: 2.44140625,
    final: 3.0517578125
  },
  pollVotingOpen: false,
  awardsAnnounced: false,
  results: {
    finalists: [],
    champion: null,
    bestPlayer: null,
    youngPlayer: null,
    goalkeeper: null,
    darkHorse: null,
    disappointment: null
  },
  // Championship outright (implied probability per team). Used to derive
  // per-team boosts for tournament-long bets (advancement, finalists).
  // In production these come from the-odds-api via fetch-results.mjs.
  tournamentOdds: {
    BRA: 0.18,
    ARG: 0.16,
    FRA: 0.14,
    ENG: 0.12,
    ESP: 0.11,
    GER: 0.09,
    MEX: 0.04,
    USA: 0.03
  }
};

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

const flag = (iso2) => `https://flagcdn.com/w80/${iso2}.png`;

export const mockTeams = [
  // Group A
  { code: 'BRA', name: 'Brazil',    group: 'A', flagUrl: flag('br') },
  { code: 'ARG', name: 'Argentina', group: 'A', flagUrl: flag('ar') },
  { code: 'MEX', name: 'Mexico',    group: 'A', flagUrl: flag('mx') },
  { code: 'USA', name: 'USA',       group: 'A', flagUrl: flag('us') },
  // Group B
  { code: 'FRA', name: 'France',    group: 'B', flagUrl: flag('fr') },
  { code: 'GER', name: 'Germany',   group: 'B', flagUrl: flag('de') },
  { code: 'ENG', name: 'England',   group: 'B', flagUrl: flag('gb-eng') },
  { code: 'ESP', name: 'Spain',     group: 'B', flagUrl: flag('es') }
];

export const mockTeamsByCode = Object.fromEntries(
  mockTeams.map(t => [t.code, t])
);

export const mockTeamsByGroup = mockTeams.reduce((acc, t) => {
  if (!acc[t.group]) acc[t.group] = [];
  acc[t.group].push(t.code);
  return acc;
}, {});

/* ------------------------------------------------------------------ */
/* Matches                                                             */
/* ------------------------------------------------------------------ */

// Relative kickoff times so the demo always feels "current" regardless of when
// it's loaded.
const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ko = (offsetHours) => new Date(NOW + offsetHours * HOUR).toISOString();

/**
 * Group matches: every team plays every other in its group (6 per group → 12).
 *
 * State distribution:
 *  Group A: 4 finished, 1 live, 1 scheduled
 *  Group B: 2 finished, 1 live, 3 scheduled
 */
/**
 * Helper: build the odds object for a match.
 * Pass implied probabilities for home / draw / away.
 */
const odds = (homeWin, draw, awayWin) => ({
  homeWin, draw, awayWin,
  bookmaker: 'mock'
});

export const mockMatches = [
  /* ----- Group A ----- */
  {
    id: 'GA-01', stage: 'group', group: 'A', matchday: 1,
    homeTeam: 'BRA', awayTeam: 'MEX',
    kickoffAt: ko(-3 * DAY / HOUR),
    status: 'finished', homeScore: 2, awayScore: 1, winner: null,
    odds: odds(0.65, 0.20, 0.15) // BRA strong favorite
  },
  {
    id: 'GA-02', stage: 'group', group: 'A', matchday: 1,
    homeTeam: 'ARG', awayTeam: 'USA',
    kickoffAt: ko(-3 * DAY / HOUR + 3),
    status: 'finished', homeScore: 3, awayScore: 0, winner: null,
    odds: odds(0.70, 0.18, 0.12)
  },
  {
    id: 'GA-03', stage: 'group', group: 'A', matchday: 2,
    homeTeam: 'BRA', awayTeam: 'USA',
    kickoffAt: ko(-2 * DAY / HOUR),
    status: 'finished', homeScore: 1, awayScore: 1, winner: null,
    odds: odds(0.62, 0.22, 0.16)
  },
  {
    id: 'GA-04', stage: 'group', group: 'A', matchday: 2,
    homeTeam: 'ARG', awayTeam: 'MEX',
    kickoffAt: ko(-2 * DAY / HOUR + 3),
    status: 'finished', homeScore: 2, awayScore: 0, winner: null,
    odds: odds(0.60, 0.23, 0.17)
  },
  {
    id: 'GA-05', stage: 'group', group: 'A', matchday: 3,
    homeTeam: 'BRA', awayTeam: 'ARG',
    kickoffAt: ko(-0.5),
    status: 'live', homeScore: 1, awayScore: 1, winner: null,
    odds: odds(0.40, 0.30, 0.30) // tight rivalry
  },
  {
    id: 'GA-06', stage: 'group', group: 'A', matchday: 3,
    homeTeam: 'MEX', awayTeam: 'USA',
    kickoffAt: ko(2 * DAY / HOUR),
    status: 'scheduled', homeScore: null, awayScore: null, winner: null,
    odds: odds(0.40, 0.30, 0.30)
  },

  /* ----- Group B ----- */
  {
    id: 'GB-01', stage: 'group', group: 'B', matchday: 1,
    homeTeam: 'FRA', awayTeam: 'ENG',
    kickoffAt: ko(-3 * DAY / HOUR + 1.5),
    status: 'finished', homeScore: 2, awayScore: 2, winner: null,
    odds: odds(0.40, 0.28, 0.32)
  },
  {
    id: 'GB-02', stage: 'group', group: 'B', matchday: 1,
    homeTeam: 'GER', awayTeam: 'ESP',
    kickoffAt: ko(-3 * DAY / HOUR + 4.5),
    status: 'finished', homeScore: 0, awayScore: 1, winner: null,
    odds: odds(0.33, 0.27, 0.40) // ESP slight favorite
  },
  {
    id: 'GB-03', stage: 'group', group: 'B', matchday: 2,
    homeTeam: 'FRA', awayTeam: 'GER',
    kickoffAt: ko(-0.25),
    status: 'live', homeScore: 0, awayScore: 0, winner: null,
    odds: odds(0.42, 0.28, 0.30)
  },
  {
    id: 'GB-04', stage: 'group', group: 'B', matchday: 2,
    homeTeam: 'ENG', awayTeam: 'ESP',
    kickoffAt: ko(1 * DAY / HOUR),
    status: 'scheduled', homeScore: null, awayScore: null, winner: null,
    odds: odds(0.36, 0.28, 0.36)
  },
  {
    id: 'GB-05', stage: 'group', group: 'B', matchday: 3,
    homeTeam: 'FRA', awayTeam: 'ESP',
    kickoffAt: ko(3 * DAY / HOUR),
    status: 'scheduled', homeScore: null, awayScore: null, winner: null,
    odds: odds(0.38, 0.27, 0.35)
  },
  {
    id: 'GB-06', stage: 'group', group: 'B', matchday: 3,
    homeTeam: 'GER', awayTeam: 'ENG',
    kickoffAt: ko(3 * DAY / HOUR + 3),
    status: 'scheduled', homeScore: null, awayScore: null, winner: null,
    odds: odds(0.34, 0.28, 0.38)
  },

  /* ----- Knockout: 2 R32 matches ----- */
  {
    id: 'R32-01', stage: 'r32', group: null, matchday: 1,
    homeTeam: 'BRA', awayTeam: 'GER',
    homePlaceholder: null, awayPlaceholder: null,
    kickoffAt: ko(7 * DAY / HOUR),
    status: 'scheduled', homeScore: null, awayScore: null, winner: null,
    odds: odds(0.45, 0.27, 0.28)
  },
  {
    // Teams unknown — odds also unknown until the API resolves them.
    id: 'R32-02', stage: 'r32', group: null, matchday: 1,
    homeTeam: null, awayTeam: null,
    homePlaceholder: 'Winner Group A', awayPlaceholder: 'Runner-up Group B',
    kickoffAt: ko(7 * DAY / HOUR + 3),
    status: 'scheduled', homeScore: null, awayScore: null, winner: null,
    odds: null
  }
];

/* ------------------------------------------------------------------ */
/* Fake players + their predictions                                    */
/* ------------------------------------------------------------------ */

const fakePlayerSeeds = [
  {
    id: 'mock-luli',  name: 'Luli',    isAdmin: true,
    predictions: {
      'GA-01': [2, 1], // exact
      'GA-02': [2, 0], // outcome + 1 team (ARG correct, score wrong)
      'GA-03': [1, 1], // exact
      'GA-04': [2, 0], // exact
      'GB-01': [3, 1], // wrong outcome
      'GB-02': [0, 1], // exact
      'GA-05': [2, 1],
      'GB-03': [1, 0]
    }
  },
  {
    id: 'mock-rafa',  name: 'Rafa',
    predictions: {
      'GA-01': [3, 0], // outcome only
      'GA-02': [2, 1], // outcome
      'GA-03': [2, 2], // outcome (draw)
      'GA-04': [1, 0],
      'GB-01': [2, 2], // exact
      'GB-02': [1, 1], // wrong outcome
      'GA-05': [0, 0],
      'GB-03': [1, 1]
    }
  },
  {
    id: 'mock-marco', name: 'Marco',
    predictions: {
      'GA-01': [1, 2], // wrong outcome
      'GA-02': [3, 0], // exact
      'GA-03': [0, 0], // outcome (draw)
      'GA-04': [3, 0],
      'GB-01': [2, 0],
      'GB-02': [2, 0],
      'GA-05': [2, 2],
      'GB-03': [0, 1]
    }
  },
  {
    id: 'mock-ines',  name: 'Inês',
    predictions: {
      'GA-01': [2, 0], // outcome + 1 team
      'GA-02': [3, 0], // exact
      'GA-03': [2, 1], // wrong outcome
      'GA-04': [2, 1],
      'GB-01': [1, 1], // outcome (draw)
      'GB-02': [0, 2],
      'GA-05': [3, 1]
    }
  },
  {
    id: 'mock-pedro', name: 'Pedro',
    predictions: {
      'GA-01': [0, 0],
      'GA-02': [1, 1],
      'GA-03': [2, 2],
      'GA-04': [2, 0], // outcome + 1
      'GB-01': [1, 0],
      'GB-02': [3, 0],
      'GB-03': [2, 1]
    }
  },
  {
    id: 'mock-juli',  name: 'Juli',
    predictions: {
      'GA-01': [2, 1], // exact
      'GA-02': [3, 0], // exact
      'GA-03': [1, 1], // exact
      'GA-04': [2, 0], // exact
      'GB-01': [2, 2], // exact
      'GB-02': [0, 1], // exact
      'GA-05': [1, 2],
      'GB-03': [3, 3]
    }
  }
];

/**
 * Build the seed predictions map and player point buckets by running
 * scoring.js over the seed data — so the leaderboard shows real values
 * derived from the same logic the live app will use.
 */
function buildSeedState() {
  const predictions = {}; // keyed `${playerId}_${matchId}`
  const players = [];

  const finishedMatches = mockMatches.filter(m => m.status === 'finished');

  for (const seed of fakePlayerSeeds) {
    const predsByMatchId = {};
    for (const [matchId, [homeScore, awayScore]] of Object.entries(seed.predictions)) {
      const match = mockMatches.find(m => m.id === matchId);
      if (!match) continue;
      const pred = {
        playerId: seed.id,
        matchId,
        stage: match.stage,
        homeScore,
        awayScore,
        points: 0,
        updatedAt: new Date().toISOString()
      };
      predictions[`${seed.id}_${matchId}`] = pred;
      predsByMatchId[matchId] = pred;
    }

    const matchesBucket = computeMatchesBucket({
      predictions: predsByMatchId,
      matches: finishedMatches,
      multipliers: mockConfig.roundMultipliers
    });

    const buckets = {
      matches: matchesBucket.points,
      advancement: 0,
      finalists: 0,
      awards: 0,
      poll: 0
    };
    const total = Object.values(buckets).reduce((s, v) => s + v, 0);

    players.push({
      id: seed.id,
      name: seed.name,
      isAdmin: !!seed.isAdmin,
      createdAt: new Date().toISOString(),
      points: { ...buckets, total },
      stats: {
        predictionsMade: Object.keys(seed.predictions).length,
        exactScores: matchesBucket.exactScores
      }
    });
  }

  return { players, predictions };
}

const seed = buildSeedState();

export const mockPlayers = seed.players;
export const mockPredictions = seed.predictions;

/* ------------------------------------------------------------------ */
/* Empty tournament-long prediction collections                        */
/* ------------------------------------------------------------------ */

export const mockAdvancementPredictions = {};   // { [playerId]: { teams, confirmedAt, points } }
export const mockFinalsPredictions = {};        // { [playerId]: { finalists, points } }
export const mockAwardPredictions = {};         // { [playerId]: { bestPlayer, ... } }
export const mockPollPredictions = {};          // { [playerId]: { darkHorse, disappointment } }
