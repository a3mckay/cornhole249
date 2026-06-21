let rawTestDb;
let kyselyTestDb;

jest.mock('../db', () => {
  const Database = require('better-sqlite3');
  const { Kysely, SqliteDialect, sql } = require('kysely');
  const { SCHEMA_SQL } = require('./fixtures');

  rawTestDb = new Database(':memory:');
  rawTestDb.pragma('foreign_keys = ON');
  rawTestDb.exec(SCHEMA_SQL);

  kyselyTestDb = new Kysely({ dialect: new SqliteDialect({ database: rawTestDb }) });

  return {
    getDb: () => kyselyTestDb,
    runMigrations: jest.fn(),
    sql,
  };
});

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));

const request = require('supertest');
const app = require('../index');

beforeEach(() => {
  rawTestDb.exec('DELETE FROM game_participants; DELETE FROM games; DELETE FROM users;');

  rawTestDb.prepare(`INSERT INTO users (id, display_name, nickname, avatar_url, elo_rating) VALUES (1, 'Alice', 'A', 'https://x.com/a', 1100)`).run();
  rawTestDb.prepare(`INSERT INTO users (id, display_name, nickname, avatar_url, elo_rating) VALUES (2, 'Bob', 'B', 'https://x.com/b', 1000)`).run();
  rawTestDb.prepare(`INSERT INTO users (id, display_name, nickname, avatar_url, elo_rating) VALUES (3, 'Carol', 'C', 'https://x.com/c', 900)`).run();

  const addGame = (id, p1, p2, p1Score, p2Score, date) => {
    rawTestDb.prepare(`INSERT INTO games (id, game_type, played_at, season, submitted_by_user_id) VALUES (?, '1v1', ?, 2025, 1)`).run(id, date);
    rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 1, ?, ?)`).run(id, p1, p1Score, p1Score > p2Score ? 1 : 0);
    rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 2, ?, ?)`).run(id, p2, p2Score, p1Score > p2Score ? 0 : 1);
  };

  // Alice: 3W 2L, Bob: 4W 2L, Carol: 1W 4L
  addGame(1, 1, 2, 21, 15, '2025-01-01T10:00:00Z'); // Alice beats Bob
  addGame(2, 1, 3, 21, 10, '2025-01-02T10:00:00Z'); // Alice beats Carol
  addGame(3, 2, 3, 21, 12, '2025-01-03T10:00:00Z'); // Bob beats Carol
  addGame(4, 2, 1, 21, 18, '2025-01-04T10:00:00Z'); // Bob beats Alice
  addGame(5, 1, 3, 21, 8,  '2025-01-05T10:00:00Z'); // Alice beats Carol
  addGame(6, 3, 2, 21, 19, '2025-01-06T10:00:00Z'); // Carol beats Bob
  addGame(7, 2, 3, 21, 16, '2025-01-07T10:00:00Z'); // Bob beats Carol
  addGame(8, 1, 2, 19, 21, '2025-01-08T10:00:00Z'); // Bob beats Alice
});

describe('Standings API', () => {
  test('GET /api/standings/1v1 returns correct GP, W, L', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const alice = res.body.find((r) => r.display_name === 'Alice');
    const bob = res.body.find((r) => r.display_name === 'Bob');
    const carol = res.body.find((r) => r.display_name === 'Carol');

    expect(alice.gp).toBe(5);
    expect(alice.wins).toBe(3);
    expect(alice.losses).toBe(2);

    expect(bob.gp).toBe(6);
    expect(bob.wins).toBe(4);

    expect(carol.gp).toBe(5);
    expect(carol.wins).toBe(1);
  });

  test('win_pct is calculated correctly', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    const alice = res.body.find((r) => r.display_name === 'Alice');
    expect(alice.win_pct).toBeCloseTo(60.0, 0);
  });

  test('pts = wins * 2', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    for (const row of res.body) {
      expect(row.pts).toBe(row.wins * 2);
    }
  });

  test('streak is computed (recent games)', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    const alice = res.body.find((r) => r.display_name === 'Alice');
    expect(alice.streak).toMatch(/^L/);
  });

  test('last5 contains 5 or fewer results', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    for (const row of res.body) {
      expect(row.last5.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('Pool +/- is ball differential', () => {
  // Read over /api/l/pool/* so req.league.sport='pool' resolves (bare /api/*
  // leaves req.league undefined → cornhole point-diff). Public league → read
  // needs no auth, so we insert 8-ball games directly with loser balls.
  beforeEach(() => {
    rawTestDb.exec('DELETE FROM game_participants; DELETE FROM games; DELETE FROM league_memberships; DELETE FROM leagues;');
    rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, is_public, sport) VALUES (1,'pool','Pool249',1,'pool')`).run();

    // season 2099 keeps this off the cornhole tests' shared standings cache key.
    const eight = (id, winner, loser, loserBalls, date) => {
      rawTestDb.prepare(`INSERT INTO games (id, game_type, game_variant, played_at, season, submitted_by_user_id, league_id) VALUES (?, '1v1', 'eight_ball', ?, 2099, 1, 1)`).run(id, date);
      rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner, balls_remaining) VALUES (?, ?, 1, 1, 1, NULL)`).run(id, winner);
      rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner, balls_remaining) VALUES (?, ?, 2, 0, 0, ?)`).run(id, loser, loserBalls);
    };
    eight(1, 1, 2, 4, '2099-01-01T10:00:00Z'); // Alice beats Bob (Bob left 4)
    eight(2, 2, 1, 2, '2099-01-02T10:00:00Z'); // Bob beats Alice (Alice left 2)
  });

  test('1v1 standings +/- counts ball margin, not the 1–0 win/loss diff', async () => {
    const res = await request(app).get('/api/l/pool/standings/1v1?season=2099');
    expect(res.status).toBe(200);
    const alice = res.body.find((r) => r.user_id === 1);
    const bob = res.body.find((r) => r.user_id === 2);
    // Both are 1–1 (W/L diff would be 0). Ball diff: Alice +4 −2 = +2; Bob −4 +2 = −2.
    expect(alice.wins).toBe(1);
    expect(alice.losses).toBe(1);
    expect(alice.plus_minus).toBe(2);
    expect(bob.plus_minus).toBe(-2);
  });
});
