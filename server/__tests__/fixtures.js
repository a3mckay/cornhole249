// Shared test fixtures for route tests.
// Returns a Kysely instance backed by an in-memory better-sqlite3 database.
// `rawDb` is the underlying better-sqlite3 instance, used for sync setup/cleanup.

const Database = require('better-sqlite3');
const { Kysely, SqliteDialect } = require('kysely');

let _rawDb = null;
let _db = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_user_id INTEGER,
    plan TEXT NOT NULL DEFAULT 'free',
    plan_override TEXT,
    plan_override_reason TEXT,
    is_public INTEGER NOT NULL DEFAULT 1,
    rules TEXT NOT NULL DEFAULT 'hamilton',
    custom_rules_json TEXT,
    theme_json TEXT,
    tagline TEXT,
    invite_token TEXT,
    invite_token_expires_at TEXT,
    expires_at TEXT,
    pass_warning_sent_at TEXT,
    use_case TEXT,
    grace_period_ends_at TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    stripe_current_period_end TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO leagues (id, slug, name, plan) VALUES (1, 'cornhole249', 'Cornhole249', 'pro');

  CREATE TABLE IF NOT EXISTS league_memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    frozen_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(league_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS plan_override_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id INTEGER NOT NULL,
    changed_by_user_id INTEGER,
    from_plan TEXT,
    to_plan TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name TEXT NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    elo_rating REAL NOT NULL DEFAULT 1000,
    ref_token TEXT,
    pin TEXT,
    referred_by_user_id INTEGER,
    handedness TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    email_verified_at TEXT,
    email_verify_token TEXT,
    email_verify_token_expires_at TEXT,
    password_reset_token TEXT,
    password_reset_expires_at TEXT,
    google_id TEXT UNIQUE,
    google_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL,
    lng REAL,
    league_id INTEGER NOT NULL DEFAULT 1,
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
    tournament_match_id INTEGER,
    league_id INTEGER NOT NULL DEFAULT 1,
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
    league_id INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS trash_talk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    league_id INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_key TEXT NOT NULL,
    league_id INTEGER NOT NULL DEFAULT 1,
    earned_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, achievement_key, league_id)
  );
  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    game_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    season INTEGER NOT NULL,
    league_id INTEGER NOT NULL DEFAULT 1,
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
    next_match_id INTEGER,
    game_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS join_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER,
    used_at TEXT,
    used_by INTEGER,
    league_id INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

function getRawDb() {
  if (!_rawDb) {
    _rawDb = new Database(':memory:');
    _rawDb.pragma('journal_mode = WAL');
    _rawDb.pragma('foreign_keys = ON');
    _rawDb.exec(SCHEMA_SQL);
  }
  return _rawDb;
}

function getTestDb() {
  if (!_db) {
    _db = new Kysely({ dialect: new SqliteDialect({ database: getRawDb() }) });
  }
  return _db;
}

// Synchronous helper — uses the raw better-sqlite3 API for test data setup.
function createUser(overrides = {}) {
  const rawDb = getRawDb();
  const result = rawDb.prepare(
    `INSERT INTO users (display_name, nickname, avatar_url, is_admin, elo_rating) VALUES (?, ?, ?, ?, ?)`
  ).run(
    overrides.display_name || 'TestUser',
    overrides.nickname || 'Tester',
    overrides.avatar_url || 'https://example.com/avatar.svg',
    overrides.is_admin !== undefined ? overrides.is_admin : 0,
    overrides.elo_rating || 1000
  );
  return rawDb.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid);
}

function createGame(overrides = {}) {
  const rawDb = getRawDb();
  const result = rawDb.prepare(
    `INSERT INTO games (game_type, played_at, season, venue_id, weather_json, submitted_by_user_id, league_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.game_type || '1v1',
    overrides.played_at || new Date().toISOString(),
    overrides.season || 2025,
    overrides.venue_id || null,
    overrides.weather_json || null,
    overrides.submitted_by_user_id || 1,
    overrides.league_id || 1
  );
  return rawDb.prepare(`SELECT * FROM games WHERE id = ?`).get(result.lastInsertRowid);
}

function addLeagueMember(userId, leagueId = 1, role = 'player') {
  const rawDb = getRawDb();
  rawDb.prepare(
    `INSERT OR IGNORE INTO league_memberships (league_id, user_id, role) VALUES (?, ?, ?)`
  ).run(leagueId, userId, role);
}

function createParticipants(gameId, team1Users, team2Users, team1Score, team2Score) {
  const rawDb = getRawDb();
  const team1Won = team1Score > team2Score;
  for (const user of team1Users) {
    rawDb.prepare(
      `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 1, ?, ?)`
    ).run(gameId, user.id, team1Score, team1Won ? 1 : 0);
  }
  for (const user of team2Users) {
    rawDb.prepare(
      `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 2, ?, ?)`
    ).run(gameId, user.id, team2Score, team1Won ? 0 : 1);
  }
}

module.exports = { getRawDb, getTestDb, createUser, createGame, createParticipants, addLeagueMember, SCHEMA_SQL };
