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

  return { getDb: () => kyselyTestDb, runMigrations: jest.fn(), sql };
});

const { evaluateAchievements, awardAchievement } = require('../lib/achievements');

function insertUser(overrides = {}) {
  const r = rawTestDb.prepare(
    `INSERT INTO users (display_name, elo_rating, is_admin) VALUES (?, ?, ?)`
  ).run(overrides.display_name || 'User', overrides.elo_rating || 1000, overrides.is_admin || 0);
  return r.lastInsertRowid;
}

function insertGame(overrides = {}) {
  const r = rawTestDb.prepare(
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
  rawTestDb.prepare(
    `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, ?, ?)`
  ).run(gameId, userId, team, score, isWinner);
}

beforeEach(() => {
  rawTestDb.exec('DELETE FROM achievements; DELETE FROM game_participants; DELETE FROM games; DELETE FROM users;');
});

describe('Achievement evaluation', () => {
  test('win_streak_3 fires after 3 consecutive wins', async () => {
    const userId = insertUser();
    const opponentId = insertUser({ display_name: 'Opponent' });

    for (let i = 0; i < 3; i++) {
      const date = new Date(2025, 0, i + 1).toISOString();
      const gameId = insertGame({ played_at: date });
      insertParticipant(gameId, userId, 1, 21, 1);
      insertParticipant(gameId, opponentId, 2, 10, 0);
    }

    const lastGameId = rawTestDb.prepare(`SELECT id FROM games ORDER BY id DESC LIMIT 1`).get().id;
    const awarded = await evaluateAchievements(lastGameId);

    const streakKeys = awarded.filter((a) => a.userId === userId && a.key === 'win_streak_3');
    expect(streakKeys.length).toBeGreaterThanOrEqual(1);
  });

  test('shutout fires when opponent scores 0', async () => {
    const userId = insertUser();
    const opponentId = insertUser({ display_name: 'Opponent' });
    const gameId = insertGame();
    insertParticipant(gameId, userId, 1, 21, 1);
    insertParticipant(gameId, opponentId, 2, 0, 0);

    const awarded = await evaluateAchievements(gameId);
    const shutout = awarded.find((a) => a.userId === userId && a.key === 'shutout');
    expect(shutout).toBeDefined();
  });

  test('shutout does NOT fire when opponent scores > 0', async () => {
    const userId = insertUser();
    const opponentId = insertUser({ display_name: 'Opponent' });
    const gameId = insertGame();
    insertParticipant(gameId, userId, 1, 21, 1);
    insertParticipant(gameId, opponentId, 2, 5, 0);

    const awarded = await evaluateAchievements(gameId);
    const shutout = awarded.find((a) => a.userId === userId && a.key === 'shutout');
    expect(shutout).toBeUndefined();
  });

  test('giant_slayer fires under correct conditions', async () => {
    const weakUser = insertUser({ display_name: 'Weak', elo_rating: 800 });
    const strongUser = insertUser({ display_name: 'Strong', elo_rating: 1400 });

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

    const finalGame = insertGame({ played_at: new Date(2025, 2, 1).toISOString() });
    insertParticipant(finalGame, weakUser, 1, 21, 1);
    insertParticipant(finalGame, strongUser, 2, 10, 0);

    const awarded = await evaluateAchievements(finalGame);
    const slayer = awarded.find((a) => a.userId === weakUser && a.key === 'giant_slayer');
    expect(slayer).toBeDefined();
  });

  test('achievements are not duplicated', async () => {
    const userId = insertUser();
    await awardAchievement(userId, 'first_blood');
    await awardAchievement(userId, 'first_blood');

    const count = rawTestDb.prepare(
      `SELECT COUNT(*) as c FROM achievements WHERE user_id = ? AND achievement_key = 'first_blood'`
    ).get(userId).c;
    expect(count).toBe(1);
  });
});
