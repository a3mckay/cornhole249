const Database = require('better-sqlite3');
const request = require('supertest');

let testDb;

jest.mock('../db', () => {
  testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT, nickname TEXT, avatar_url TEXT, is_admin INTEGER DEFAULT 0, elo_rating REAL DEFAULT 1000, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS venues (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, lat REAL, lng REAL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, game_type TEXT, played_at TEXT, season INTEGER, venue_id INTEGER, weather_json TEXT, submitted_by_user_id INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS game_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, user_id INTEGER, team INTEGER, score INTEGER DEFAULT 0, is_winner INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, user_id INTEGER, body TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, achievement_key TEXT NOT NULL, earned_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, achievement_key));
    CREATE TABLE IF NOT EXISTS trash_talk (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, body TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, format TEXT, game_type TEXT, status TEXT DEFAULT 'pending', season INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS tournament_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER, round INTEGER, match_number INTEGER, team1_player_ids TEXT DEFAULT '[]', team2_player_ids TEXT DEFAULT '[]', winner_team INTEGER, score_team1 INTEGER, score_team2 INTEGER, played_at TEXT, next_match_id INTEGER);
    
  `);
  return { getDb: () => testDb, runMigrations: jest.fn() };
});

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));

const app = require('../index');

beforeEach(() => {
  testDb.exec('DELETE FROM game_participants; DELETE FROM games; DELETE FROM users;');
  testDb.prepare(`INSERT INTO users (id, display_name, elo_rating) VALUES (1, 'Alice', 1000), (2, 'Bob', 1000), (3, 'Carol', 1000), (4, 'Dave', 1000)`).run();
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
