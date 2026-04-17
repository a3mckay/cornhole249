const Database = require('better-sqlite3');

// Set up in-memory DB before importing app
let testDb;

jest.mock('../db', () => {
  testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      elo_rating REAL NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, game_type TEXT, played_at TEXT, season INTEGER, venue_id INTEGER, weather_json TEXT, submitted_by_user_id INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS game_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, user_id INTEGER, team INTEGER, score INTEGER DEFAULT 0, is_winner INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER, user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS trash_talk (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, achievement_key TEXT NOT NULL, earned_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, achievement_key));
    CREATE TABLE IF NOT EXISTS venues (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, lat REAL, lng REAL, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, format TEXT, game_type TEXT, status TEXT DEFAULT 'pending', season INTEGER, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS tournament_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER, round INTEGER, match_number INTEGER, team1_player_ids TEXT DEFAULT '[]', team2_player_ids TEXT DEFAULT '[]', winner_team INTEGER, score_team1 INTEGER, score_team2 INTEGER, played_at TEXT, next_match_id INTEGER);
    
  `);
  return {
    getDb: () => testDb,
    runMigrations: jest.fn(),
  };
});

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));

const request = require('supertest');
const app = require('../index');

beforeEach(() => {
  testDb.exec('DELETE FROM users; DELETE FROM games; DELETE FROM game_participants; DELETE FROM comments;');
  testDb.prepare(
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
    // Log in as non-admin
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
