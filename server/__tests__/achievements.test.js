const Database = require('better-sqlite3');

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

const { evaluateAchievements, awardAchievement } = require('../lib/achievements');

function insertUser(overrides = {}) {
  const r = testDb.prepare(
    `INSERT INTO users (display_name, elo_rating, is_admin) VALUES (?, ?, ?)`
  ).run(overrides.display_name || 'User', overrides.elo_rating || 1000, overrides.is_admin || 0);
  return r.lastInsertRowid;
}

function insertGame(overrides = {}) {
  const r = testDb.prepare(
    `INSERT INTO games (game_type, played_at, season, weather_json, submitted_by_user_id) VALUES (?, ?, ?, ?, ?)`
  ).run(
    overrides.game_type || '1v1',
    overrides.played_at || new Date().toISOString(),
    overrides.season || 2025,
    overrides.weather_json || null,
    overrides.submitted_by || 1
  );
  return r.lastInsertRowid;
}

function insertParticipant(gameId, userId, team, score, isWinner) {
  testDb.prepare(
    `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, ?, ?)`
  ).run(gameId, userId, team, score, isWinner);
}

beforeEach(() => {
  testDb.exec('DELETE FROM achievements; DELETE FROM game_participants; DELETE FROM games; DELETE FROM users;');
});

describe('Achievement evaluation', () => {
  test('win_streak_3 fires after 3 consecutive wins', () => {
    const userId = insertUser();
    const opponentId = insertUser({ display_name: 'Opponent' });

    for (let i = 0; i < 3; i++) {
      const date = new Date(2025, 0, i + 1).toISOString();
      const gameId = insertGame({ played_at: date });
      insertParticipant(gameId, userId, 1, 21, 1);
      insertParticipant(gameId, opponentId, 2, 10, 0);
    }

    const lastGameId = testDb.prepare(`SELECT id FROM games ORDER BY id DESC LIMIT 1`).get().id;
    const awarded = evaluateAchievements(lastGameId);

    const streakKeys = awarded.filter((a) => a.userId === userId && a.key === 'win_streak_3');
    expect(streakKeys.length).toBeGreaterThanOrEqual(1);
  });

  test('shutout fires when opponent scores 0', () => {
    const userId = insertUser();
    const opponentId = insertUser({ display_name: 'Opponent' });
    const gameId = insertGame();
    insertParticipant(gameId, userId, 1, 21, 1);
    insertParticipant(gameId, opponentId, 2, 0, 0);

    const awarded = evaluateAchievements(gameId);
    const shutout = awarded.find((a) => a.userId === userId && a.key === 'shutout');
    expect(shutout).toBeDefined();
  });

  test('shutout does NOT fire when opponent scores > 0', () => {
    const userId = insertUser();
    const opponentId = insertUser({ display_name: 'Opponent' });
    const gameId = insertGame();
    insertParticipant(gameId, userId, 1, 21, 1);
    insertParticipant(gameId, opponentId, 2, 5, 0);

    const awarded = evaluateAchievements(gameId);
    const shutout = awarded.find((a) => a.userId === userId && a.key === 'shutout');
    expect(shutout).toBeUndefined();
  });

  test('giant_slayer fires under correct conditions', () => {
    // User with < 40% win rate beats user with > 70% win rate
    const weakUser = insertUser({ display_name: 'Weak', elo_rating: 800 });
    const strongUser = insertUser({ display_name: 'Strong', elo_rating: 1400 });

    // Give weakUser a bad record (2W 8L = 20%)
    for (let i = 0; i < 8; i++) {
      const d = new Date(2025, 0, i + 1).toISOString();
      const g = insertGame({ played_at: d });
      insertParticipant(g, weakUser, 2, 10, 0);
      insertParticipant(g, strongUser, 1, 21, 1);
    }
    for (let i = 0; i < 2; i++) {
      const d = new Date(2025, 1, i + 1).toISOString();
      const g = insertGame({ played_at: d });
      insertParticipant(g, weakUser, 1, 21, 1);
      insertParticipant(g, strongUser, 2, 10, 0);
    }

    // Now weakUser wins against strongUser — should trigger giant_slayer
    const finalGame = insertGame({ played_at: new Date(2025, 2, 1).toISOString() });
    insertParticipant(finalGame, weakUser, 1, 21, 1);
    insertParticipant(finalGame, strongUser, 2, 10, 0);

    const awarded = evaluateAchievements(finalGame);
    const slayer = awarded.find((a) => a.userId === weakUser && a.key === 'giant_slayer');
    expect(slayer).toBeDefined();
  });

  test('achievements are not duplicated', () => {
    const userId = insertUser();
    awardAchievement(userId, 'first_blood');
    awardAchievement(userId, 'first_blood'); // second award should be ignored

    const count = testDb.prepare(
      `SELECT COUNT(*) as c FROM achievements WHERE user_id = ? AND achievement_key = 'first_blood'`
    ).get(userId).c;
    expect(count).toBe(1);
  });
});
