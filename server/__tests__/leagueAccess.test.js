/**
 * Tests for the multi-tenant league access control layer.
 *
 * Covers:
 *  - Non-member can read a public league
 *  - Non-member cannot write to any league
 *  - Non-member cannot read a private league
 *  - Authenticated member can read & write their league
 *  - Site admin (is_admin=1) can read any league
 *  - POST /api/leagues enforces 2-league free cap
 *  - GET /api/l/:slug/standings/1v1 is isolated per league
 */

let rawTestDb;
let kyselyTestDb;

jest.mock('../db', () => {
  const Database = require('better-sqlite3');
  const { Kysely, SqliteDialect, sql } = require('kysely');
  const { SCHEMA_SQL } = require('./fixtures');

  rawTestDb = new Database(':memory:');
  rawTestDb.pragma('foreign_keys = OFF'); // FK off for simpler test setup
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupLeague({ id, slug, name, is_public = 1 }) {
  rawTestDb.prepare(
    `INSERT OR IGNORE INTO leagues (id, slug, name, is_public) VALUES (?, ?, ?, ?)`
  ).run(id, slug, name, is_public);
}

function setupUser({ id, display_name = 'User', is_admin = 0, pin = '1234' }) {
  rawTestDb.prepare(
    `INSERT INTO users (id, display_name, is_admin, elo_rating, pin) VALUES (?, ?, ?, 1000, ?)`
  ).run(id, display_name, is_admin, pin);
}

function addMember(userId, leagueId, role = 'player') {
  rawTestDb.prepare(
    `INSERT OR IGNORE INTO league_memberships (user_id, league_id, role) VALUES (?, ?, ?)`
  ).run(userId, leagueId, role);
}

function addGame(leagueId, p1Id, p2Id) {
  const result = rawTestDb.prepare(
    `INSERT INTO games (game_type, played_at, season, submitted_by_user_id, league_id) VALUES ('1v1', datetime('now'), 2025, ?, ?)`
  ).run(p1Id, leagueId);
  const gameId = result.lastInsertRowid;
  rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 1, 21, 1)`).run(gameId, p1Id);
  rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 2, 15, 0)`).run(gameId, p2Id);
  return gameId;
}

// Log in as a user and return the cookie
async function loginAs(userId) {
  const res = await request(app)
    .post('/auth/login')
    .send({ user_id: userId, pin: '1234' });
  return res.headers['set-cookie'];
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  rawTestDb.exec(`
    DELETE FROM game_participants;
    DELETE FROM games;
    DELETE FROM league_memberships;
    DELETE FROM leagues;
    DELETE FROM users;
  `);

  // Re-seed default league
  rawTestDb.prepare(`INSERT OR IGNORE INTO leagues (id, slug, name, is_public) VALUES (1, 'cornhole249', 'Cornhole249', 1)`).run();

  // Users
  setupUser({ id: 1, display_name: 'Alice', pin: '1234' });
  setupUser({ id: 2, display_name: 'Bob', pin: '1234' });
  setupUser({ id: 3, display_name: 'Carol', pin: '1234' });
  setupUser({ id: 99, display_name: 'Admin', is_admin: 1, pin: '1234' });

  // Public league (cornhole249, id=1) — Alice is a member
  addMember(1, 1, 'owner');
  addMember(2, 1, 'player');
  addGame(1, 1, 2); // game in league 1

  // Second league: "bach" (id=2) — Bob is owner, public
  setupLeague({ id: 2, slug: 'bach', name: 'Bach Party', is_public: 1 });
  addMember(2, 2, 'owner');
  addGame(2, 2, 1); // game in league 2

  // Third league: "private-club" (id=3) — Carol is owner, private
  setupLeague({ id: 3, slug: 'private-club', name: 'Private Club', is_public: 0 });
  addMember(3, 3, 'owner');
  addGame(3, 3, 1); // game in league 3
});

// ── Access control tests ──────────────────────────────────────────────────────

describe('Public league reads', () => {
  test('non-member can read public league standings', async () => {
    const res = await request(app).get('/api/l/cornhole249/standings/1v1?season=2025');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('non-member can read second public league standings', async () => {
    const res = await request(app).get('/api/l/bach/standings/1v1?season=2025');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Private league reads', () => {
  test('unauthenticated request to private league returns 401', async () => {
    const res = await request(app).get('/api/l/private-club/standings/1v1');
    expect(res.status).toBe(401);
  });

  test('non-member authenticated user cannot read private league', async () => {
    const cookie = await loginAs(1); // Alice is not in private-club
    const res = await request(app)
      .get('/api/l/private-club/standings/1v1')
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  test('member can read private league', async () => {
    const cookie = await loginAs(3); // Carol is in private-club
    const res = await request(app)
      .get('/api/l/private-club/standings/1v1')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

describe('Write access', () => {
  test('non-member cannot POST a game to any league', async () => {
    // Carol is not a member of cornhole249
    const cookie = await loginAs(3);
    const res = await request(app)
      .post('/api/l/cornhole249/games')
      .set('Cookie', cookie)
      .send({
        game_type: '1v1',
        team1: [{ user_id: 3, score: 21 }],
        team2: [{ user_id: 1, score: 15 }],
      });
    expect(res.status).toBe(403);
  });

  test('unauthenticated cannot POST a game', async () => {
    const res = await request(app)
      .post('/api/l/cornhole249/games')
      .send({
        game_type: '1v1',
        team1: [{ user_id: 1, score: 21 }],
        team2: [{ user_id: 2, score: 15 }],
      });
    expect(res.status).toBe(401);
  });
});

describe('Site admin access', () => {
  test('admin user can read any public league', async () => {
    const cookie = await loginAs(99);
    const res = await request(app)
      .get('/api/l/bach/standings/1v1')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  test('admin user can read private league', async () => {
    const cookie = await loginAs(99);
    const res = await request(app)
      .get('/api/l/private-club/standings/1v1')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

describe('Data isolation', () => {
  test('standings for league 1 do not include games from league 2', async () => {
    const res = await request(app).get('/api/l/cornhole249/standings/1v1?season=2025');
    expect(res.status).toBe(200);
    // Only Alice and Bob have games in league 1; Carol does not
    const names = res.body.map((r) => r.display_name);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
    expect(names).not.toContain('Carol');
  });

  test('standings for league 2 only show its own games', async () => {
    const res = await request(app).get('/api/l/bach/standings/1v1?season=2025');
    expect(res.status).toBe(200);
    const names = res.body.map((r) => r.display_name);
    expect(names).not.toContain('Carol');
  });
});

describe('League creation cap', () => {
  test('POST /api/leagues creates a new league', async () => {
    const cookie = await loginAs(1); // Alice (currently owns league 1)
    const res = await request(app)
      .post('/api/leagues')
      .set('Cookie', cookie)
      .send({ name: 'New League', is_public: true });
    expect(res.status).toBe(201);
    expect(res.body.league).toBeDefined();
    expect(res.body.joinCode).toBeDefined();
  });

  test('POST /api/leagues defaults sport to cornhole when omitted', async () => {
    const cookie = await loginAs(1);
    const res = await request(app)
      .post('/api/leagues')
      .set('Cookie', cookie)
      .send({ name: 'Default Sport League', is_public: true });
    expect(res.status).toBe(201);
    expect(res.body.league.sport).toBe('cornhole');
  });

  test('POST /api/leagues accepts a valid live sport', async () => {
    const cookie = await loginAs(1);
    const res = await request(app)
      .post('/api/leagues')
      .set('Cookie', cookie)
      .send({ name: 'Felt Night', is_public: true, sport: 'pool' });
    expect(res.status).toBe(201);
    expect(res.body.league.sport).toBe('pool');
  });

  test('POST /api/leagues rejects an unsupported/not-yet-built sport', async () => {
    const cookie = await loginAs(1);
    const res = await request(app)
      .post('/api/leagues')
      .set('Cookie', cookie)
      .send({ name: 'Shuffleboard Crew', is_public: true, sport: 'shuffleboard' });
    expect(res.status).toBe(400);
  });

  test('POST /api/leagues returns 403 with upgrade:true after hitting the cap', async () => {
    // Alice already owns league 1. Create league 2 for Alice too.
    rawTestDb.prepare(`INSERT OR IGNORE INTO league_memberships (user_id, league_id, role) VALUES (1, 2, 'owner')`).run();

    const cookie = await loginAs(1);
    const res = await request(app)
      .post('/api/leagues')
      .set('Cookie', cookie)
      .send({ name: 'One Too Many', is_public: true });
    expect(res.status).toBe(403);
    expect(res.body.upgrade).toBe(true);
  });
});

describe('Unknown league slug', () => {
  test('returns 404 for unknown slug', async () => {
    const res = await request(app).get('/api/l/does-not-exist/standings/1v1');
    expect(res.status).toBe(404);
  });
});
