const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || './cornhole249.db';

let db;

function getDb() {
  if (!db) {
    const resolved = path.resolve(DB_PATH);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    db = new Database(resolved);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function runMigrations() {
  const db = getDb();

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
      game_type TEXT NOT NULL CHECK(game_type IN ('1v1','2v2')),
      played_at TEXT NOT NULL,
      season INTEGER NOT NULL,
      venue_id INTEGER REFERENCES venues(id),
      weather_json TEXT,
      submitted_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      team INTEGER NOT NULL CHECK(team IN (1,2)),
      score INTEGER NOT NULL DEFAULT 0,
      is_winner INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trash_talk (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      achievement_key TEXT NOT NULL,
      earned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, achievement_key)
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('single_elim','double_elim')),
      game_type TEXT NOT NULL CHECK(game_type IN ('1v1','2v2')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','complete')),
      season INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tournament_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      team1_player_ids TEXT NOT NULL DEFAULT '[]',
      team2_player_ids TEXT NOT NULL DEFAULT '[]',
      winner_team INTEGER,
      score_team1 INTEGER,
      score_team2 INTEGER,
      played_at TEXT,
      next_match_id INTEGER REFERENCES tournament_matches(id)
    );

    CREATE INDEX IF NOT EXISTS idx_games_season ON games(season);
    CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
    CREATE INDEX IF NOT EXISTS idx_game_participants_game_id ON game_participants(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_participants_user_id ON game_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_comments_game_id ON comments(game_id);
    CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
  `);

  // Additive migrations — safe to run on existing databases
  try { db.exec(`ALTER TABLE users ADD COLUMN handedness TEXT NOT NULL DEFAULT 'right'`); } catch (e) { /* column already exists */ }
  try { db.exec(`ALTER TABLE users ADD COLUMN pin TEXT`); } catch (e) { /* column already exists */ }
  try { db.exec(`ALTER TABLE games ADD COLUMN tournament_match_id INTEGER REFERENCES tournament_matches(id)`); } catch (e) { /* already exists */ }
  try { db.exec(`ALTER TABLE tournament_matches ADD COLUMN game_id INTEGER REFERENCES games(id)`); } catch (e) { /* already exists */ }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_games_tournament_match ON games(tournament_match_id)`); } catch (e) { /* already exists */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS join_codes (
      code TEXT PRIMARY KEY,
      created_by INTEGER REFERENCES users(id),
      used_by INTEGER REFERENCES users(id),
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  console.log('[DB] Migrations applied');
}

module.exports = { getDb, runMigrations };
