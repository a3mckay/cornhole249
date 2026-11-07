/**
 * Adding an existing player (their real account) to another league, so the
 * league shows up in their House instead of splitting them across a second
 * stub account.
 *
 * Exercises GET /api/leagues/:slug/members/candidates and
 * POST /api/leagues/:slug/members, plus the resulting /api/house/me/overview.
 */

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

function setupUser(id, name) {
  rawTestDb.prepare(`INSERT INTO users (id, display_name, is_admin, elo_rating, pin) VALUES (?, ?, 0, 1000, '1234')`).run(id, name);
}
function addMember(userId, leagueId, role = 'player') {
  rawTestDb.prepare(`INSERT OR IGNORE INTO league_memberships (user_id, league_id, role) VALUES (?, ?, ?)`)
    .run(userId, leagueId, role);
}
async function loginAs(userId) {
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ user_id: userId, pin: '1234' });
  return agent;
}

beforeEach(() => {
  rawTestDb.exec(`DELETE FROM join_requests; DELETE FROM game_participants; DELETE FROM games; DELETE FROM league_memberships; DELETE FROM leagues; DELETE FROM users;`);
  rawTestDb.prepare(`
    INSERT INTO leagues (id, slug, name, sport, plan) VALUES
      (1, 'cornhole249', 'Cornhole249', 'cornhole', 'pro'),
      (2, 'pool249', 'Pool249', 'pool', 'pro'),
      (3, 'elsewhere', 'Elsewhere', 'cornhole', 'pro')
  `).run();
  setupUser(1, 'Andrew');   // owns cornhole249 + pool249
  setupUser(2, 'Alex');     // plays in cornhole249 only
  setupUser(3, 'Stranger'); // in a league Andrew doesn't manage
  setupUser(4, 'Pat');      // plain player in cornhole249
  addMember(1, 1, 'owner');
  addMember(1, 2, 'owner');
  addMember(2, 1, 'player');
  addMember(4, 1, 'player');
  addMember(3, 3, 'owner');
});

describe('GET /api/leagues/:slug/members/candidates', () => {
  test('lists people from the requester\'s other managed leagues who aren\'t members yet', async () => {
    const agent = await loginAs(1);
    const res = await agent.get('/api/leagues/pool249/members/candidates');
    expect(res.status).toBe(200);
    const names = res.body.map((c) => c.display_name).sort();
    expect(names).toEqual(['Alex', 'Pat']); // not Andrew (already in), not Stranger
    expect(res.body.find((c) => c.display_name === 'Alex').leagues).toEqual(['Cornhole249']);
  });

  test('non-managers get 403', async () => {
    const agent = await loginAs(4);
    const res = await agent.get('/api/leagues/cornhole249/members/candidates');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/leagues/:slug/members', () => {
  test('adds the existing account, and the league shows up in their House', async () => {
    const owner = await loginAs(1);
    const res = await owner.post('/api/leagues/pool249/members').send({ user_id: 2 });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({ id: 2, display_name: 'Alex', role: 'player' });

    const row = rawTestDb.prepare(`SELECT role FROM league_memberships WHERE user_id = 2 AND league_id = 2`).get();
    expect(row.role).toBe('player');
    // No duplicate account was created.
    expect(rawTestDb.prepare(`SELECT COUNT(*) AS n FROM users WHERE display_name = 'Alex'`).get().n).toBe(1);

    // Games in both leagues -> both sports in Alex's House.
    const addGame = (id, leagueId, winner, loser) => {
      rawTestDb.prepare(`INSERT INTO games (id, game_type, played_at, season, league_id, status) VALUES (?, '1v1', datetime('now'), 1, ?, 'official')`).run(id, leagueId);
      rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 1, 0, 1), (?, ?, 2, 0, 0)`).run(id, winner, id, loser);
    };
    addGame(1, 1, 2, 4);
    addGame(2, 2, 2, 1);
    const alex = await loginAs(2);
    const house = await alex.get('/api/house/me/overview');
    expect(house.status).toBe(200);
    expect(house.body.sports.sort()).toEqual(['cornhole', 'pool']);
  });

  test('adding someone who already asked to join closes out their pending request', async () => {
    rawTestDb.prepare(`INSERT INTO join_requests (league_id, user_id, status) VALUES (2, 2, 'pending')`).run();
    const owner = await loginAs(1);
    const res = await owner.post('/api/leagues/pool249/members').send({ user_id: 2 });
    expect(res.status).toBe(201);
    const jr = rawTestDb.prepare(`SELECT status, reviewed_by FROM join_requests WHERE league_id = 2 AND user_id = 2`).get();
    expect(jr).toEqual({ status: 'approved', reviewed_by: 1 });
    // And Alex sees the league as a full member, not a pending request.
    const alex = await loginAs(2);
    const mine = await alex.get('/api/leagues/mine');
    expect(mine.body.map((l) => l.slug).sort()).toEqual(['cornhole249', 'pool249']);
    const league = await alex.get('/api/leagues/pool249');
    expect(league.body.user_pending_request).toBe(false);
  });

  test('refuses someone outside the requester\'s managed leagues', async () => {
    const owner = await loginAs(1);
    const res = await owner.post('/api/leagues/pool249/members').send({ user_id: 3 });
    expect(res.status).toBe(404);
    expect(rawTestDb.prepare(`SELECT COUNT(*) AS n FROM league_memberships WHERE user_id = 3 AND league_id = 2`).get().n).toBe(0);
  });

  test('refuses someone already in the league', async () => {
    const owner = await loginAs(1);
    const res = await owner.post('/api/leagues/cornhole249/members').send({ user_id: 2 });
    expect(res.status).toBe(404);
  });

  test('non-managers get 403', async () => {
    const pat = await loginAs(4);
    const res = await pat.post('/api/leagues/cornhole249/members').send({ user_id: 3 });
    expect(res.status).toBe(403);
  });

  test('missing user_id -> 400', async () => {
    const owner = await loginAs(1);
    const res = await owner.post('/api/leagues/pool249/members').send({});
    expect(res.status).toBe(400);
  });
});
