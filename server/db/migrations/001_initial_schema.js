/**
 * Migration 001: Initial schema — all existing tables ported to Postgres DDL.
 *
 * Differences from SQLite:
 *   - SERIAL PRIMARY KEY instead of INTEGER PRIMARY KEY AUTOINCREMENT
 *   - TIMESTAMPTZ NOT NULL DEFAULT NOW() instead of TEXT DEFAULT (datetime('now'))
 *   - TEXT columns remain TEXT
 *   - REAL stays REAL (Postgres accepts it)
 *   - games ↔ tournament_matches circular FK added via ALTER after both tables exist
 */

const { sql } = require('kysely');

async function up(db) {
  // users
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      display_name TEXT NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      elo_rating REAL NOT NULL DEFAULT 1000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      handedness TEXT NOT NULL DEFAULT 'right',
      pin TEXT,
      referred_by_user_id INTEGER REFERENCES users(id),
      ref_token TEXT UNIQUE
    )
  `.execute(db);

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ref_token ON users(ref_token)`.execute(db);

  // venues
  await sql`
    CREATE TABLE IF NOT EXISTS venues (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      lat REAL,
      lng REAL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // games (tournament_match_id added later via ALTER to handle circular FK)
  await sql`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      game_type TEXT NOT NULL CHECK(game_type IN ('1v1','2v2')),
      played_at TIMESTAMPTZ NOT NULL,
      season INTEGER NOT NULL,
      venue_id INTEGER REFERENCES venues(id),
      weather_json TEXT,
      submitted_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // tournament_matches (game_id added later via ALTER to handle circular FK)
  await sql`
    CREATE TABLE IF NOT EXISTS tournament_matches (
      id SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      team1_player_ids TEXT NOT NULL DEFAULT '[]',
      team2_player_ids TEXT NOT NULL DEFAULT '[]',
      winner_team INTEGER,
      score_team1 INTEGER,
      score_team2 INTEGER,
      played_at TIMESTAMPTZ,
      next_match_id INTEGER REFERENCES tournament_matches(id)
    )
  `.execute(db);

  // Add circular FKs now that both tables exist
  await sql`
    ALTER TABLE games
    ADD COLUMN IF NOT EXISTS tournament_match_id INTEGER REFERENCES tournament_matches(id)
  `.execute(db);

  await sql`
    ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS game_id INTEGER REFERENCES games(id)
  `.execute(db);

  // tournaments (note: references tournament_matches implicitly via app logic)
  await sql`
    CREATE TABLE IF NOT EXISTS tournaments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('single_elim','double_elim')),
      game_type TEXT NOT NULL CHECK(game_type IN ('1v1','2v2')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','complete')),
      season INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Add tournament_id FK to tournament_matches now that tournaments table exists
  await sql`
    ALTER TABLE tournament_matches
    ADD CONSTRAINT fk_tm_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
  `.execute(db);

  // game_participants
  await sql`
    CREATE TABLE IF NOT EXISTS game_participants (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      team INTEGER NOT NULL CHECK(team IN (1,2)),
      score INTEGER NOT NULL DEFAULT 0,
      is_winner INTEGER NOT NULL DEFAULT 0
    )
  `.execute(db);

  // comments
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // trash_talk
  await sql`
    CREATE TABLE IF NOT EXISTS trash_talk (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // achievements
  await sql`
    CREATE TABLE IF NOT EXISTS achievements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      achievement_key TEXT NOT NULL,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, achievement_key)
    )
  `.execute(db);

  // join_codes
  await sql`
    CREATE TABLE IF NOT EXISTS join_codes (
      code TEXT PRIMARY KEY,
      created_by INTEGER REFERENCES users(id),
      used_by INTEGER REFERENCES users(id),
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // kv_store (used for one-time migration guards in startup)
  await sql`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `.execute(db);

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_games_season ON games(season)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_games_tournament_match ON games(tournament_match_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_game_participants_game_id ON game_participants(game_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_game_participants_user_id ON game_participants(user_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_comments_game_id ON comments(game_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id)`.execute(db);
}

module.exports = { up };
