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

  // Insert 3 players
  testDb.prepare(`INSERT INTO users (id, display_name, nickname, avatar_url, elo_rating) VALUES (1, 'Alice', 'A', 'https://x.com/a', 1100)`).run();
  testDb.prepare(`INSERT INTO users (id, display_name, nickname, avatar_url, elo_rating) VALUES (2, 'Bob', 'B', 'https://x.com/b', 1000)`).run();
  testDb.prepare(`INSERT INTO users (id, display_name, nickname, avatar_url, elo_rating) VALUES (3, 'Carol', 'C', 'https://x.com/c', 900)`).run();

  const addGame = (id, p1, p2, p1Score, p2Score, date) => {
    testDb.prepare(`INSERT INTO games (id, game_type, played_at, season, submitted_by_user_id) VALUES (?, '1v1', ?, 2025, 1)`).run(id, date);
    testDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 1, ?, ?)`).run(id, p1, p1Score, p1Score > p2Score ? 1 : 0);
    testDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 2, ?, ?)`).run(id, p2, p2Score, p1Score > p2Score ? 0 : 1);
  };

  // Alice: 3W 2L, Bob: 4W 2L, Carol: 1W 4L
  addGame(1, 1, 2, 21, 15, '2025-01-01T10:00:00Z'); // Alice beats Bob
  addGame(2, 1, 3, 21, 10, '2025-01-02T10:00:00Z'); // Alice beats Carol
  addGame(3, 2, 3, 21, 12, '2025-01-03T10:00:00Z'); // Bob beats Carol
  addGame(4, 2, 1, 21, 18, '2025-01-04T10:00:00Z'); // Bob beats Alice
  addGame(5, 1, 3, 21, 8,  '2025-01-05T10:00:00Z'); // Alice beats Carol
  addGame(6, 3, 2, 21, 19, '2025-01-06T10:00:00Z'); // Carol beats Bob
  addGame(7, 2, 3, 21, 16, '2025-01-07T10:00:00Z'); // Bob beats Carol
  addGame(8, 1, 2, 19, 21, '2025-01-08T10:00:00Z'); // Bob beats Alice
});

describe('Standings API', () => {
  test('GET /api/standings/1v1 returns correct GP, W, L', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const alice = res.body.find((r) => r.display_name === 'Alice');
    const bob = res.body.find((r) => r.display_name === 'Bob');
    const carol = res.body.find((r) => r.display_name === 'Carol');

    expect(alice.gp).toBe(5);
    expect(alice.wins).toBe(3);
    expect(alice.losses).toBe(2);

    expect(bob.gp).toBe(6);
    expect(bob.wins).toBe(4);

    expect(carol.gp).toBe(5);
    expect(carol.wins).toBe(1);
  });

  test('win_pct is calculated correctly', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    const alice = res.body.find((r) => r.display_name === 'Alice');
    expect(alice.win_pct).toBeCloseTo(60.0, 0);
  });

  test('pts = wins * 2', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    for (const row of res.body) {
      expect(row.pts).toBe(row.wins * 2);
    }
  });

  test('streak is computed (recent games)', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    const alice = res.body.find((r) => r.display_name === 'Alice');
    // Alice's last game was game 8 (L), so streak should start with L
    expect(alice.streak).toMatch(/^L/);
  });

  test('last5 contains 5 or fewer results', async () => {
    const res = await request(app).get('/api/standings/1v1?season=2025');
    for (const row of res.body) {
      expect(row.last5.length).toBeLessThanOrEqual(5);
    }
  });
});
