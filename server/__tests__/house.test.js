// HTTP integration tests for the cross-sport house endpoints
// (server/routes/house.js). A "house" = all leagues a user owns
// (league_memberships role='owner'), aggregated across sports.

let rawTestDb;
let kyselyTestDb;

jest.mock('../db', () => {
  const Database = require('better-sqlite3');
  const { Kysely, SqliteDialect, sql } = require('kysely');
  const { SCHEMA_SQL } = require('./fixtures');

  rawTestDb = new Database(':memory:');
  rawTestDb.pragma('foreign_keys = OFF');
  rawTestDb.exec(SCHEMA_SQL);

  kyselyTestDb = new Kysely({ dialect: new SqliteDialect({ database: rawTestDb }) });

  return { getDb: () => kyselyTestDb, runMigrations: jest.fn(), sql };
});

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));

const request = require('supertest');
const app = require('../index');

let nextGameId = 1;
function addGame(sport, leagueId, parts) {
  const gid = nextGameId++;
  rawTestDb.prepare(
    `INSERT INTO games (id, game_type, played_at, season, league_id, status) VALUES (?, '1v1', datetime('now'), 1, ?, 'official')`
  ).run(gid, leagueId);
  for (const [userId, team, isWinner] of parts) {
    rawTestDb.prepare(
      `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, 0, ?)`
    ).run(gid, userId, team, isWinner);
  }
  return gid;
}

beforeEach(() => {
  nextGameId = 1;
  rawTestDb.exec(`
    DELETE FROM game_participants;
    DELETE FROM games;
    DELETE FROM league_memberships;
    DELETE FROM leagues;
    DELETE FROM users;
  `);
  // Owner #1 (Andrew) owns two leagues: a cornhole league and a pool league.
  rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, sport) VALUES (1, 'corn', 'Corn', 'cornhole'), (2, 'pool', 'Pool', 'pool')`).run();
  rawTestDb.prepare(`INSERT INTO users (id, display_name, pin) VALUES (1, 'Andrew', '1234'), (2, 'Beth', '1234'), (3, 'Cal', '1234')`).run();
  rawTestDb.prepare(`INSERT INTO league_memberships (user_id, league_id, role) VALUES (1, 1, 'owner'), (1, 2, 'owner'), (2, 1, 'player'), (3, 1, 'player')`).run();

  // Cornhole: Beth dominates Cal.
  addGame('cornhole', 1, [[2, 1, 1], [3, 2, 0]]);
  addGame('cornhole', 1, [[2, 1, 1], [3, 2, 0]]);
  // Pool: Cal beats Beth.
  addGame('pool', 2, [[3, 1, 1], [2, 2, 0]]);
  addGame('pool', 2, [[3, 1, 1], [2, 2, 0]]);
});

describe('GET /api/house/:ownerId/overview', () => {
  test('aggregates the owner house across sports', async () => {
    const res = await request(app).get('/api/house/1/overview');
    expect(res.status).toBe(200);
    expect(res.body.sports.sort()).toEqual(['cornhole', 'pool']);
    expect(res.body.rankings.length).toBe(2);
    // Players are hydrated with display names.
    expect(res.body.rankings[0].display_name).toBeDefined();
  });

  test('unknown owner -> 404', async () => {
    const res = await request(app).get('/api/house/999/overview');
    expect(res.status).toBe(404);
  });

  test('owner with no owned leagues -> empty boards', async () => {
    const res = await request(app).get('/api/house/2/overview');
    expect(res.status).toBe(200);
    expect(res.body.rankings).toEqual([]);
    expect(res.body.sports).toEqual([]);
  });
});

describe('GET /api/house/:ownerId/h2h/:p1/:p2', () => {
  test('returns cross-sport head-to-head', async () => {
    const res = await request(app).get('/api/house/1/h2h/2/3');
    expect(res.status).toBe(200);
    expect(res.body.games).toBe(4);
    expect(res.body.p1_wins).toBe(2); // Beth won 2 cornhole
    expect(res.body.p2_wins).toBe(2); // Cal won 2 pool
    expect(res.body.by_sport.cornhole.games).toBe(2);
    expect(res.body.by_sport.pool.games).toBe(2);
  });

  test('rejects identical players', async () => {
    const res = await request(app).get('/api/house/1/h2h/2/2');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/house/:ownerId/nemesis/:userId', () => {
  test('finds the worst-record opponent across sports', async () => {
    // Beth: 2-0 vs Cal in cornhole, 0-2 vs Cal in pool -> 2-2 overall, even.
    // Give Cal an extra win to make him Beth's nemesis.
    addGame('pool', 2, [[3, 1, 1], [2, 2, 0]]);
    const res = await request(app).get('/api/house/1/nemesis/2');
    expect(res.status).toBe(200);
    expect(res.body.nemesis.user_id).toBe(3);
    expect(res.body.losses).toBeGreaterThan(res.body.wins);
  });

  test('player with no qualifying opponents -> nemesis null', async () => {
    const res = await request(app).get('/api/house/1/nemesis/999');
    expect(res.status).toBe(200);
    expect(res.body.nemesis).toBeNull();
  });
});
