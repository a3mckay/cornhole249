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
  rawTestDb.exec('DELETE FROM users; DELETE FROM games; DELETE FROM game_participants; DELETE FROM comments;');
  rawTestDb.prepare(
    `INSERT INTO users (id, display_name, nickname, is_admin, elo_rating) VALUES (1, 'Andrew', 'The Cannon', 1, 1200), (2, 'Jordan', 'Swish', 0, 1000)`
  ).run();
});

describe('Auth middleware', () => {
  test('requireAuth returns 401 for unauthenticated requests', async () => {
    const res = await request(app).post('/api/games').send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('requireAdmin returns 403 for non-admin users', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ user_id: 2 });

    const res = await agent.delete('/api/games/999');
    expect(res.status).toBe(403);
  });

  test('GET /auth/me returns null when not logged in', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('POST /auth/login sets session', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/auth/login').send({ user_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Andrew');
    expect(res.body.is_admin).toBe(1);

    const meRes = await agent.get('/auth/me');
    expect(meRes.body.id).toBe(1);
  });

  test('POST /auth/logout clears session', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ user_id: 1 });
    await agent.post('/auth/logout');
    const meRes = await agent.get('/auth/me');
    expect(meRes.body).toBeNull();
  });
});
