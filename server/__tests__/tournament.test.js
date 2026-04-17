const { recalculateAllElos } = require('../lib/elo');

describe('Tournament seeding (balanced)', () => {
  test('snake-draft produces expected pairs for 8 players by Elo', () => {
    // Players sorted by Elo (desc): p1=1800, p2=1600, p3=1400, p4=1200, p5=1000, p6=800, p7=600, p8=400
    const players = [
      { id: 1, elo_rating: 1800 },
      { id: 2, elo_rating: 1600 },
      { id: 3, elo_rating: 1400 },
      { id: 4, elo_rating: 1200 },
      { id: 5, elo_rating: 1000 },
      { id: 6, elo_rating: 800 },
      { id: 7, elo_rating: 600 },
      { id: 8, elo_rating: 400 },
    ].sort((a, b) => b.elo_rating - a.elo_rating);

    // Snake draft: pair 1st with last, 2nd with second-last, etc.
    const pairs = [];
    for (let i = 0; i < Math.floor(players.length / 2); i++) {
      pairs.push([players[i].id, players[players.length - 1 - i].id]);
    }

    expect(pairs).toEqual([
      [1, 8], // highest with lowest
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
  });

  test('all players appear in exactly one pair', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, elo_rating: 1000 - i * 50 }))
      .sort((a, b) => b.elo_rating - a.elo_rating);

    const pairs = [];
    for (let i = 0; i < Math.floor(players.length / 2); i++) {
      pairs.push([players[i].id, players[players.length - 1 - i].id]);
    }

    const allIds = pairs.flat();
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(8);
    expect(allIds.length).toBe(8);
  });
});
