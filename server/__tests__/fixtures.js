const Database = require('better-sqlite3');
const { runMigrations } = require('../db');

let _db = null;

function getTestDb() {
  if (!_db) {
    _db = new Database(':memory:');
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

function setupTestDb() {
  // Patch getDb to return in-memory db for tests
  jest.mock('../db', () => ({
    getDb: () => getTestDb(),
    runMigrations: () => {
      const db = getTestDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          display_name TEXT NOT NULL,
          nickname TEXT,
          avatar_url TEXT,
          is_admin INTEGER NOT NULL DEFAULT 0,
          elo_rating REAL NOT NULL DEFAULT 1000,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS venues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          lat REAL,
          lng REAL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_type TEXT NOT NULL,
          played_at TEXT NOT NULL,
          season INTEGER NOT NULL,
          venue_id INTEGER,
          weather_json TEXT,
          submitted_by_user_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS game_participants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          team INTEGER NOT NULL,
          score INTEGER NOT NULL DEFAULT 0,
          is_winner INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          game_id INTEGER,
          user_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS trash_talk (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS achievements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          achievement_key TEXT NOT NULL,
          earned_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, achievement_key)
        );
        CREATE TABLE IF NOT EXISTS tournaments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          format TEXT NOT NULL,
          game_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          season INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS tournament_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tournament_id INTEGER NOT NULL,
          round INTEGER NOT NULL,
          match_number INTEGER NOT NULL,
          team1_player_ids TEXT NOT NULL DEFAULT '[]',
          team2_player_ids TEXT NOT NULL DEFAULT '[]',
          winner_team INTEGER,
          score_team1 INTEGER,
          score_team2 INTEGER,
          played_at TEXT,
          next_match_id INTEGER
        );
      `);
    },
  }));
}

function createUser(db, overrides = {}) {
  const result = db.prepare(
    `INSERT INTO users (display_name, nickname, avatar_url, is_admin, elo_rating) VALUES (?, ?, ?, ?, ?)`
  ).run(
    overrides.display_name || 'TestUser',
    overrides.nickname || 'Tester',
    overrides.avatar_url || 'https://example.com/avatar.svg',
    overrides.is_admin !== undefined ? overrides.is_admin : 0,
    overrides.elo_rating || 1000
  );
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid);
}

function createGame(db, overrides = {}) {
  const result = db.prepare(
    `INSERT INTO games (game_type, played_at, season, venue_id, weather_json, submitted_by_user_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.game_type || '1v1',
    overrides.played_at || new Date().toISOString(),
    overrides.season || 2025,
    overrides.venue_id || null,
    overrides.weather_json || null,
    overrides.submitted_by_user_id || 1
  );
  return db.prepare(`SELECT * FROM games WHERE id = ?`).get(result.lastInsertRowid);
}

function createParticipants(db, gameId, team1Users, team2Users, team1Score, team2Score) {
  const team1Won = team1Score > team2Score;
  for (const user of team1Users) {
    db.prepare(
      `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 1, ?, ?)`
    ).run(gameId, user.id, team1Score, team1Won ? 1 : 0);
  }
  for (const user of team2Users) {
    db.prepare(
      `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 2, ?, ?)`
    ).run(gameId, user.id, team2Score, team1Won ? 0 : 1);
  }
}

module.exports = { getTestDb, createUser, createGame, createParticipants };
