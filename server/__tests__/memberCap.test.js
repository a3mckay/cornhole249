/**
 * Free-plan member cap (8 players).
 *
 * Every join/add path must honor Pro access from ANY source — plan_override
 * comp, owner Venue plan, superadmin owner — not just the raw leagues.plan
 * column. Regression: a superadmin's free-plan Pool league blocked adding a
 * 9th player, and even comped leagues were capped because the checks read
 * leagues.plan directly.
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
jest.mock('../lib/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(),
  sendJoinRequestEmail: jest.fn().mockResolvedValue(),
  sendJoinApprovedEmail: jest.fn().mockResolvedValue(),
  sendJoinDeniedEmail: jest.fn().mockResolvedValue(),
}));

const request = require('supertest');
const app = require('../index');

const LEAGUE = 2;
const NEWCOMER = 99;

function setupUser(id, name, isAdmin = 0) {
  rawTestDb.prepare(`INSERT INTO users (id, display_name, is_admin, elo_rating, pin) VALUES (?, ?, ?, 1000, '1234')`)
    .run(id, name, isAdmin);
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

// Free league 2 ("pool-night"), owned by user 1, filled to exactly 8 members.
beforeEach(() => {
  rawTestDb.exec(`DELETE FROM league_memberships; DELETE FROM leagues; DELETE FROM users; DELETE FROM plan_override_audit;`);
  rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, is_public, plan) VALUES (1, 'cornhole249', 'Cornhole249', 1, 'pro')`).run();
  rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, is_public, plan, short_code) VALUES (?, 'pool-night', 'Pool Night', 1, 'free', 'POOL42')`).run(LEAGUE);
  setupUser(1, 'Owner');
  addMember(1, LEAGUE, 'owner');
  for (let id = 2; id <= 8; id++) {
    setupUser(id, `P${id}`);
    addMember(id, LEAGUE);
  }
  setupUser(NEWCOMER, 'Friend');
});

const addStub = async () => (await loginAs(1)).post('/api/leagues/pool-night/members/stub').send({ display_name: 'Friend' });
const joinByCode = async () => (await loginAs(NEWCOMER)).post('/api/join/short/POOL42');

describe('free league at 8 members', () => {
  test('blocks admin-add and short-code join', async () => {
    expect((await addStub()).status).toBe(403);
    expect((await joinByCode()).status).toBe(403);
  });

  test('join preview reports the league as full', async () => {
    const res = await request(app).get('/api/join/short/POOL42');
    expect(res.body.is_full).toBe(true);
    expect(res.body.member_limit).toBe(8);
  });
});

describe.each([
  ['superadmin owner', () => rawTestDb.prepare(`UPDATE users SET is_admin = 1 WHERE id = 1`).run()],
  ['plan_override comp', () => rawTestDb.prepare(`UPDATE leagues SET plan_override = 'pro' WHERE id = ?`).run(LEAGUE)],
  ['owner Venue plan', () => rawTestDb.prepare(`UPDATE users SET venue_plan = 'venue', venue_stripe_subscription_id = 'sub_x' WHERE id = 1`).run()],
])('%s lifts the cap', (_label, grant) => {
  beforeEach(grant);

  test('admin can add a 9th player', async () => {
    expect((await addStub()).status).toBe(201);
  });

  test('a friend can join via short code', async () => {
    expect((await joinByCode()).status).toBe(200);
  });

  test('join preview is not full and has no limit', async () => {
    const res = await request(app).get('/api/join/short/POOL42');
    expect(res.body.is_full).toBe(false);
    expect(res.body.member_limit).toBeNull();
  });
});

describe('league creation by a superadmin', () => {
  const create = async (userId) => (await loginAs(userId)).post('/api/leagues').send({ name: 'Brand New', is_public: true });

  test('is comped to Pro immediately, with an audit row', async () => {
    rawTestDb.prepare(`UPDATE users SET is_admin = 1 WHERE id = 1`).run();
    const res = await create(1);
    expect(res.status).toBe(201);
    expect(res.body.league.plan_override).toBe('pro');
    const audit = rawTestDb.prepare(`SELECT to_plan, changed_by_user_id FROM plan_override_audit WHERE league_id = ?`).get(res.body.league.id);
    expect(audit).toEqual({ to_plan: 'pro', changed_by_user_id: 1 });
  });

  test('a regular user gets no comp', async () => {
    const res = await create(NEWCOMER);
    expect(res.status).toBe(201);
    expect(res.body.league.plan_override).toBeNull();
  });
});
