// Race-to-N per-league admin setting (Pool 1.2).
// Exercises PATCH /api/leagues/:slug validation for `race_to_target`:
// off by default, settable to a 1..99 integer, clearable, range-checked.

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

async function loginAs(agent, userId) {
  await agent.post('/auth/login').send({ user_id: userId, pin: '1234' });
}

beforeEach(() => {
  rawTestDb.exec(`
    DELETE FROM league_memberships;
    DELETE FROM leagues;
    DELETE FROM users;
  `);
  rawTestDb.prepare(`INSERT OR IGNORE INTO leagues (id, slug, name, is_public, sport) VALUES (1, 'cornhole249', 'Cornhole249', 1, 'pool')`).run();
  rawTestDb.prepare(`INSERT INTO users (id, display_name, is_admin, elo_rating, pin) VALUES (1, 'Alice', 0, 1000, '1234'), (2, 'Bob', 0, 1000, '1234')`).run();
  rawTestDb.prepare(`INSERT OR IGNORE INTO league_memberships (user_id, league_id, role) VALUES (1, 1, 'owner'), (2, 1, 'player')`).run();
});

describe('Race-to-N admin setting', () => {
  test('defaults to off (null)', async () => {
    const res = await request(app).get('/api/leagues/cornhole249');
    expect(res.status).toBe(200);
    expect(res.body.race_to_target == null).toBe(true);
  });

  test('owner can set a valid target', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.patch('/api/leagues/cornhole249').send({ race_to_target: 7 });
    expect(res.status).toBe(200);
    expect(res.body.race_to_target).toBe(7);
  });

  test('owner can clear the target (null = off)', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    await agent.patch('/api/leagues/cornhole249').send({ race_to_target: 9 });
    const res = await agent.patch('/api/leagues/cornhole249').send({ race_to_target: null });
    expect(res.status).toBe(200);
    expect(res.body.race_to_target == null).toBe(true);
  });

  test('rejects out-of-range target', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const tooHigh = await agent.patch('/api/leagues/cornhole249').send({ race_to_target: 100 });
    expect(tooHigh.status).toBe(400);
    const tooLow = await agent.patch('/api/leagues/cornhole249').send({ race_to_target: 0 });
    expect(tooLow.status).toBe(400);
  });

  test('non-admin member cannot set the target', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 2); // Bob is a player
    const res = await agent.patch('/api/leagues/cornhole249').send({ race_to_target: 7 });
    expect(res.status).toBe(403);
  });
});
