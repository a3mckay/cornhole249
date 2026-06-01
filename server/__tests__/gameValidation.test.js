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
  rawTestDb.exec('DELETE FROM game_participants; DELETE FROM games; DELETE FROM users; DELETE FROM achievements;');
  rawTestDb.prepare(`INSERT INTO users (id, display_name, elo_rating) VALUES (1, 'Alice', 1000), (2, 'Bob', 1000), (3, 'Carol', 1000), (4, 'Dave', 1000)`).run();
});

async function loginAs(agent, userId) {
  await agent.post('/auth/login').send({ user_id: userId });
}

describe('Game submission validation', () => {
  test('returns 401 if not authenticated', async () => {
    const res = await request(app).post('/api/games').send({
      game_type: '1v1',
      team1: [{ user_id: 1, score: 21 }],
      team2: [{ user_id: 2, score: 10 }],
    });
    expect(res.status).toBe(401);
  });

  test('returns 400 if player is on both teams', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: '1v1',
      team1: [{ user_id: 1, score: 21 }],
      team2: [{ user_id: 1, score: 10 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/both teams/i);
  });

  test('returns 400 for negative scores', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: '1v1',
      team1: [{ user_id: 1, score: -1 }],
      team2: [{ user_id: 2, score: 10 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-negative/i);
  });

  test('returns 400 for tied scores', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: '1v1',
      team1: [{ user_id: 1, score: 21 }],
      team2: [{ user_id: 2, score: 21 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tie/i);
  });

  test('valid game submission returns 201', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: '1v1',
      team1: [{ user_id: 1, score: 21 }],
      team2: [{ user_id: 2, score: 15 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.game_type).toBe('1v1');
  });
});
