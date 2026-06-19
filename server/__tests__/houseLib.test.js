// Pure unit tests for the DB-free cross-sport aggregator (server/lib/house.js).
// No DB, no HTTP — exercises the math directly: percentiles, overview boards,
// cross-sport H2H, and nemesis.

const house = require('../lib/house');

// Helper to build participant rows compactly.
// game(id, sport, [ [user, team, isWinner], ... ])
function game(game_id, sport, parts, league_id = 1) {
  return parts.map(([user_id, team, is_winner]) => ({
    game_id, league_id, sport, user_id, team, is_winner,
  }));
}

describe('percentiles', () => {
  test('single player sits at 100', () => {
    const p = house.percentiles(new Map([[1, 0.5]]));
    expect(p.get(1)).toBe(100);
  });

  test('empty input -> empty map', () => {
    expect(house.percentiles(new Map()).size).toBe(0);
  });

  test('orders ascending: lowest winPct = 0, highest = 100', () => {
    const p = house.percentiles(new Map([[1, 0.2], [2, 0.8], [3, 0.5]]));
    expect(p.get(1)).toBe(0);
    expect(p.get(3)).toBe(50);
    expect(p.get(2)).toBe(100);
  });

  test('ties get average rank', () => {
    // two players tied at the bottom, one at top
    const p = house.percentiles(new Map([[1, 0.5], [2, 0.5], [3, 1]]));
    // indices 0,1 tie -> avgIndex 0.5 -> (0.5/2)*100 = 25
    expect(p.get(1)).toBe(25);
    expect(p.get(2)).toBe(25);
    expect(p.get(3)).toBe(100);
  });
});

describe('aggregate + buildOverview', () => {
  // Two sports. Cornhole: A beats B, A beats B (A 100%, B 0%).
  // Pool: B beats A (B higher). Cross-sport, A is strong in cornhole,
  // B strong in pool.
  const rows = [
    ...game(1, 'cornhole', [[1, 1, 1], [2, 2, 0]]),
    ...game(2, 'cornhole', [[1, 1, 1], [2, 2, 0]]),
    ...game(3, 'pool', [[1, 1, 0], [2, 2, 1]]),
    ...game(4, 'pool', [[1, 1, 0], [2, 2, 1]]),
  ];

  test('discovers sports from data', () => {
    const agg = house.aggregate(rows);
    expect(agg.sports.sort()).toEqual(['cornhole', 'pool']);
  });

  test('overview ranks by average win % across sports', () => {
    const agg = house.aggregate(rows);
    const ov = house.buildOverview(agg);
    // A: cornhole 100% (2-0), pool 0% (0-2) -> avg 50. B: mirror -> avg 50.
    expect(ov.rankings.length).toBe(2);
    expect(ov.rankings[0].avg_win_pct).toBe(50);
    expect(ov.rankings[1].avg_win_pct).toBe(50);
    expect(ov.rankings[0].rank).toBe(1);
    expect(ov.rankings[1].rank).toBe(2);
  });

  test('rankings use raw win %, not field-normalized percentile', () => {
    // 2-player cornhole where A wins 60% and B wins 40%. Percentile would slam
    // these to 100/0; win % must report the actual 60/40.
    const r = [
      ...game(1, 'cornhole', [[1, 1, 1], [2, 2, 0]]),
      ...game(2, 'cornhole', [[1, 1, 1], [2, 2, 0]]),
      ...game(3, 'cornhole', [[1, 1, 1], [2, 2, 0]]),
      ...game(4, 'cornhole', [[1, 1, 0], [2, 2, 1]]),
      ...game(5, 'cornhole', [[1, 1, 0], [2, 2, 1]]),
    ];
    const ov = house.buildOverview(house.aggregate(r));
    const a = ov.rankings.find((x) => x.user_id === 1);
    const b = ov.rankings.find((x) => x.user_id === 2);
    expect(a.avg_win_pct).toBe(60);
    expect(b.avg_win_pct).toBe(40);
    expect(a.per_sport).toEqual({ cornhole: 60 });
  });

  test('per_sport breakdown is exposed on rankings', () => {
    const agg = house.aggregate(rows);
    const ov = house.buildOverview(agg);
    const a = ov.rankings.find((r) => r.user_id === 1);
    expect(a.per_sport).toEqual({ cornhole: 100, pool: 0 });
    expect(a.sports_played).toBe(2);
  });

  test('best_at_everything needs >=2 sports and scores by min win %', () => {
    const agg = house.aggregate(rows);
    const ov = house.buildOverview(agg);
    // both played 2 sports, both have a 0% sport
    expect(ov.best_at_everything.length).toBe(2);
    expect(ov.best_at_everything[0].min_win_pct).toBe(0);
  });

  test('jack_of_all_trades counts sports with a winning record', () => {
    const agg = house.aggregate(rows);
    const ov = house.buildOverview(agg);
    // A: cornhole 100% (>=50), pool 0% -> 1 sport with a winning record.
    const a = ov.jack_of_all_trades.find((r) => r.user_id === 1);
    expect(a.sports_at_baseline).toBe(1);
  });

  test('sport_affinity picks the over-performed sport', () => {
    const agg = house.aggregate(rows);
    const ov = house.buildOverview(agg);
    const a = ov.sport_affinity.find((r) => r.user_id === 1);
    // A's avg win % is 50; cornhole 100 is +50 over, pool 0 is -50.
    expect(a.sport).toBe('cornhole');
    expect(a.over_performance).toBe(50);
  });

  test('hydrate is applied to board entries', () => {
    const agg = house.aggregate(rows);
    const ov = house.buildOverview(agg, (id) => ({ user_id: id, display_name: `P${id}` }));
    expect(ov.rankings[0].display_name).toMatch(/^P\d$/);
  });
});

describe('buildH2H', () => {
  const rows = [
    ...game(1, 'cornhole', [[1, 1, 1], [2, 2, 0]]),
    ...game(2, 'cornhole', [[1, 1, 0], [2, 2, 1]]),
    ...game(3, 'pool', [[1, 1, 1], [2, 2, 0]]),
  ];

  test('aggregates wins across sports with a by_sport breakdown', () => {
    const agg = house.aggregate(rows);
    const h = house.buildH2H(agg, 1, 2);
    expect(h.games).toBe(3);
    expect(h.p1_wins).toBe(2);
    expect(h.p2_wins).toBe(1);
    expect(h.by_sport.cornhole).toEqual({ p1_wins: 1, p2_wins: 1, games: 2 });
    expect(h.by_sport.pool).toEqual({ p1_wins: 1, p2_wins: 0, games: 1 });
  });

  test('never-met players return zeroes', () => {
    const agg = house.aggregate(rows);
    const h = house.buildH2H(agg, 1, 99);
    expect(h.games).toBe(0);
    expect(h.p1_wins).toBe(0);
  });
});

describe('buildNemesis', () => {
  test('returns the worst-record opponent above the meeting threshold', () => {
    const rows = [
      // vs player 2: lose twice (worst record)
      ...game(1, 'cornhole', [[1, 1, 0], [2, 2, 1]]),
      ...game(2, 'cornhole', [[1, 1, 0], [2, 2, 1]]),
      // vs player 3: split (1-1)
      ...game(3, 'pool', [[1, 1, 1], [3, 2, 0]]),
      ...game(4, 'pool', [[1, 1, 0], [3, 2, 1]]),
    ];
    const agg = house.aggregate(rows);
    const n = house.buildNemesis(agg, 1);
    expect(n.nemesis.user_id).toBe(2);
    expect(n.games).toBe(2);
    expect(n.wins).toBe(0);
    expect(n.losses).toBe(2);
    expect(n.win_rate).toBe(0);
  });

  test('opponents below the meeting threshold are ignored', () => {
    const rows = [
      ...game(1, 'cornhole', [[1, 1, 0], [2, 2, 1]]), // only 1 meeting
    ];
    const agg = house.aggregate(rows);
    expect(house.buildNemesis(agg, 1)).toBeNull();
  });

  test('unknown player -> null', () => {
    const agg = house.aggregate([]);
    expect(house.buildNemesis(agg, 1)).toBeNull();
  });
});
