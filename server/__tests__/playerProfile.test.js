/**
 * Player profile scoping:
 *   - via /api/l/:slug/users/:id the career stats are restricted to that league
 *   - the global /api/users/:id remains all-leagues (back-compat)
 *   - ?type=1v1 / ?type=2v2 filter career stats by game format
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

let gameSeq = 0;
function addGame({ league_id, game_type = '1v1', season = 2026 }) {
  gameSeq += 1;
  rawTestDb.prepare(
    `INSERT INTO games (id, game_type, played_at, season, league_id) VALUES (?, ?, ?, ?, ?)`
  ).run(gameSeq, game_type, `2026-01-${String(gameSeq).padStart(2, '0')}T12:00:00Z`, season, league_id);
  return gameSeq;
}
function addParticipant(gameId, userId, { team = 1, score = 21, is_winner = 1 } = {}) {
  rawTestDb.prepare(
    `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, ?, ?)`
  ).run(gameId, userId, team, score, is_winner);
}

beforeEach(() => {
  gameSeq = 0;
  rawTestDb.exec(`DELETE FROM game_participants; DELETE FROM games; DELETE FROM league_memberships; DELETE FROM leagues; DELETE FROM users;`);
  rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, is_public, plan) VALUES (1, 'cornhole249', 'Cornhole249', 1, 'pro')`).run();
  rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, is_public, plan) VALUES (2, 'other', 'Other League', 1, 'pro')`).run();
  rawTestDb.prepare(`INSERT INTO users (id, display_name, elo_rating) VALUES (1, 'Andrew', 1200)`).run();

  // League 1: a 1v1 win and a 2v2 loss
  const g1 = addGame({ league_id: 1, game_type: '1v1' });
  addParticipant(g1, 1, { team: 1, is_winner: 1 });
  const g2 = addGame({ league_id: 1, game_type: '2v2' });
  addParticipant(g2, 1, { team: 2, is_winner: 0 });

  // League 2: a 1v1 win (should NOT count in league-1-scoped profile)
  const g3 = addGame({ league_id: 2, game_type: '1v1' });
  addParticipant(g3, 1, { team: 1, is_winner: 1 });
});

describe('Player profile league scoping', () => {
  test('league-scoped profile counts only that league', async () => {
    const res = await request(app).get('/api/l/cornhole249/users/1');
    expect(res.status).toBe(200);
    expect(res.body.career.gp).toBe(2);     // 1v1 win + 2v2 loss in league 1
    expect(res.body.career.wins).toBe(1);
    expect(res.body.career.losses).toBe(1);
  });

  test('global profile counts all leagues (back-compat)', async () => {
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(200);
    expect(res.body.career.gp).toBe(3);     // includes league 2 game
    expect(res.body.career.wins).toBe(2);
  });

  test('?type=1v1 filters career to 1v1 only', async () => {
    const res = await request(app).get('/api/l/cornhole249/users/1?type=1v1');
    expect(res.status).toBe(200);
    expect(res.body.career.gp).toBe(1);
    expect(res.body.career.wins).toBe(1);
    expect(res.body.career.losses).toBe(0);
  });

  test('?type=2v2 filters career to 2v2 only', async () => {
    const res = await request(app).get('/api/l/cornhole249/users/1?type=2v2');
    expect(res.status).toBe(200);
    expect(res.body.career.gp).toBe(1);
    expect(res.body.career.wins).toBe(0);
    expect(res.body.career.losses).toBe(1);
  });
});

describe('Stats endpoints honor game-type filter', () => {
  test('performers ?type=2v2 only counts 2v2 games', async () => {
    const res = await request(app).get('/api/l/cornhole249/stats/performers?type=2v2');
    expect(res.status).toBe(200);
    const all = [...(res.body.top || []), ...(res.body.bottom || [])];
    const andrew = all.find((p) => p.user_id === 1);
    expect(andrew.gp).toBe(1);
    expect(andrew.wins).toBe(0);
  });

  test('streaks ?type=1v1 only counts 1v1 games', async () => {
    const res = await request(app).get('/api/l/cornhole249/stats/streaks?type=1v1');
    expect(res.status).toBe(200);
    const andrew = res.body.find((s) => s.user_id === 1);
    expect(andrew.gp).toBe(1);
    expect(andrew.max_win_streak).toBe(1);
  });
});
