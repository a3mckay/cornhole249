const { expectedScore, winProbability, updateElo, recalculateAllElos, recalculateAllElosBySport } = require('../lib/elo');

describe('Elo engine', () => {
  test('expectedScore: equal ratings give 50%', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });

  test('expectedScore: higher rating gives higher expected score', () => {
    const p = expectedScore(1200, 1000);
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(1);
  });

  test('winProbability: P(A wins) = 1 / (1 + 10^((eloB - eloA)/400))', () => {
    const eloA = 1200;
    const eloB = 1000;
    const expected = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
    expect(winProbability(eloA, eloB)).toBeCloseTo(expected, 5);
  });

  test('winProbability: known values', () => {
    // Elo diff of 400 → ~91% win chance for higher rated
    const p = winProbability(1400, 1000);
    expect(p).toBeCloseTo(0.909, 2);
  });

  test('updateElo: winner gains, loser loses', () => {
    const { newEloA, newEloB } = updateElo(1000, 1000, 1);
    expect(newEloA).toBeGreaterThan(1000);
    expect(newEloB).toBeLessThan(1000);
  });

  test('updateElo: total Elo is conserved', () => {
    const { newEloA, newEloB } = updateElo(1000, 1000, 1);
    expect(newEloA + newEloB).toBe(2000);
  });

  test('recalculateAllElos: 3-player round-robin', () => {
    const games = [
      { id: 1, played_at: '2025-01-01T00:00:00Z' },
      { id: 2, played_at: '2025-01-02T00:00:00Z' },
      { id: 3, played_at: '2025-01-03T00:00:00Z' },
    ];
    const participants = [
      // Game 1: User1 beats User2
      { game_id: 1, user_id: 1, team: 1, is_winner: 1 },
      { game_id: 1, user_id: 2, team: 2, is_winner: 0 },
      // Game 2: User2 beats User3
      { game_id: 2, user_id: 2, team: 1, is_winner: 1 },
      { game_id: 2, user_id: 3, team: 2, is_winner: 0 },
      // Game 3: User1 beats User3
      { game_id: 3, user_id: 1, team: 1, is_winner: 1 },
      { game_id: 3, user_id: 3, team: 2, is_winner: 0 },
    ];

    const elos = recalculateAllElos(games, participants);

    // User1 won 2, User2 won 1, User3 won 0
    expect(elos[1]).toBeGreaterThan(1000);
    expect(elos[3]).toBeLessThan(1000);
    expect(elos[1]).toBeGreaterThan(elos[2]);
    expect(elos[2]).toBeGreaterThan(elos[3]);
  });
});

describe('Per-sport Elo (WS-E)', () => {
  // user1 wins both cornhole games but LOSES the pool game in between.
  const games = [
    { id: 1, played_at: '2025-01-01T00:00:00Z', league_id: 1 }, // cornhole
    { id: 2, played_at: '2025-01-02T00:00:00Z', league_id: 3 }, // pool
    { id: 3, played_at: '2025-01-03T00:00:00Z', league_id: 1 }, // cornhole
  ];
  const participants = [
    { game_id: 1, user_id: 1, team: 1, is_winner: 1 },
    { game_id: 1, user_id: 2, team: 2, is_winner: 0 },
    { game_id: 2, user_id: 1, team: 1, is_winner: 0 }, // user1 loses pool
    { game_id: 2, user_id: 2, team: 2, is_winner: 1 },
    { game_id: 3, user_id: 1, team: 1, is_winner: 1 },
    { game_id: 3, user_id: 2, team: 2, is_winner: 0 },
  ];
  const resolveSport = (g) => (g.league_id === 3 ? 'pool' : 'cornhole');

  test('partitions ratings by sport', () => {
    const bySport = recalculateAllElosBySport(games, participants, resolveSport);
    expect(Object.keys(bySport).sort()).toEqual(['cornhole', 'pool']);
    // user1 swept cornhole → up; user2 lost both → down
    expect(bySport.cornhole[1]).toBeGreaterThan(1000);
    expect(bySport.cornhole[2]).toBeLessThan(1000);
    // user1 lost the pool game → pool rating down (opposite of cornhole)
    expect(bySport.pool[1]).toBeLessThan(1000);
    expect(bySport.pool[2]).toBeGreaterThan(1000);
  });

  test('cornhole ratings are byte-identical to a cornhole-only replay', () => {
    const bySport = recalculateAllElosBySport(games, participants, resolveSport);
    const cornholeGames = games.filter((g) => resolveSport(g) === 'cornhole');
    const ids = new Set(cornholeGames.map((g) => g.id));
    const cornholeParts = participants.filter((p) => ids.has(p.game_id));
    const baseline = recalculateAllElos(cornholeGames, cornholeParts);
    expect(bySport.cornhole).toEqual(baseline);
  });

  test('adding/removing a pool game never moves a cornhole rating', () => {
    const withPool = recalculateAllElosBySport(games, participants, resolveSport);
    const withoutPool = recalculateAllElosBySport(
      games.filter((g) => g.id !== 2),
      participants.filter((p) => p.game_id !== 2),
      resolveSport,
    );
    expect(withPool.cornhole).toEqual(withoutPool.cornhole);
  });

  test('defaults every game to cornhole when no resolver is given', () => {
    const bySport = recalculateAllElosBySport(games, participants);
    expect(Object.keys(bySport)).toEqual(['cornhole']);
    // Equivalent to the legacy single-bucket recalc.
    expect(bySport.cornhole).toEqual(recalculateAllElos(games, participants));
  });
});
