// Covers the batched (non-N+1) hydration in the games feed, the weekly recap
// and 1v1/2v2 rivals — the endpoints that used to run one query per game.
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

  return {
    getDb: () => kyselyTestDb,
    runMigrations: jest.fn(),
    sql,
  };
});

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));

const request = require('supertest');
const app = require('../index');

// All games fall on Wed 2025-06-11 — ISO week 24 of 2025 (Mon Jun 9 – Sun Jun 15).
const iso = (minsAgo) => new Date(Date.UTC(2025, 5, 11, 15, 0) - minsAgo * 60 * 1000).toISOString();

function addGame(id, type, playedAt, teams) {
  rawTestDb.prepare(
    `INSERT INTO games (id, game_type, played_at, season, submitted_by_user_id) VALUES (?, ?, ?, ?, 1)`
  ).run(id, type, playedAt, new Date(playedAt).getFullYear());
  for (const [team, players] of Object.entries(teams)) {
    for (const p of players) {
      rawTestDb.prepare(
        `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, ?, ?)`
      ).run(id, p.user, Number(team), p.score, p.win ? 1 : 0);
    }
  }
}

beforeEach(() => {
  rawTestDb.exec('DELETE FROM comments; DELETE FROM game_participants; DELETE FROM games; DELETE FROM users;');
  const addUser = rawTestDb.prepare(`INSERT INTO users (id, display_name, nickname) VALUES (?, ?, ?)`);
  addUser.run(1, 'Alice', 'A');
  addUser.run(2, 'Bob', null);
  addUser.run(3, 'Carol', null);
  addUser.run(4, 'Dan', 'D');

  // 1v1s (newest first: 3, 2, 1). Game 2 has the biggest margin (21-3).
  addGame(1, '1v1', iso(30), { 1: [{ user: 1, score: 21, win: true }], 2: [{ user: 2, score: 15 }] });
  addGame(2, '1v1', iso(20), { 1: [{ user: 2, score: 21, win: true }], 2: [{ user: 1, score: 3 }] });
  addGame(3, '1v1', iso(10), { 1: [{ user: 1, score: 21, win: true }], 2: [{ user: 3, score: 19 }] });
  // 2v2s between the same two pairs: (1,2) vs (3,4)
  addGame(4, '2v2', iso(9), {
    1: [{ user: 1, score: 21, win: true }, { user: 2, score: 21, win: true }],
    2: [{ user: 3, score: 10 }, { user: 4, score: 10 }],
  });
  addGame(5, '2v2', iso(8), {
    1: [{ user: 4, score: 21, win: true }, { user: 3, score: 21, win: true }],
    2: [{ user: 2, score: 12 }, { user: 1, score: 12 }],
  });

  const addComment = rawTestDb.prepare(
    `INSERT INTO comments (game_id, user_id, body, created_at) VALUES (?, ?, ?, ?)`
  );
  addComment.run(3, 2, 'older', '2025-01-01 10:00:00');
  addComment.run(3, 3, 'newest', '2025-01-01 11:00:00');
  addComment.run(1, 1, 'only one', '2025-01-01 09:00:00');
});

describe('GET /api/games (batched hydration)', () => {
  test('attaches ordered participants and the latest comment per game', async () => {
    const res = await request(app).get('/api/games?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);

    const byId = Object.fromEntries(res.body.games.map((g) => [g.id, g]));

    // Participants ordered by team, then insertion order; user fields joined.
    expect(byId[4].participants.map((p) => [p.team, p.user_id])).toEqual([[1, 1], [1, 2], [2, 3], [2, 4]]);
    expect(byId[3].participants.map((p) => p.display_name)).toEqual(['Alice', 'Carol']);
    expect(byId[3].participants[0].nickname).toBe('A');

    expect(byId[3].latest_comment).toEqual({ body: 'newest', display_name: 'Carol' });
    expect(byId[1].latest_comment).toEqual({ body: 'only one', display_name: 'Alice' });
    expect(byId[2].latest_comment).toBeNull();
  });

  test('paging still hydrates only the returned games', async () => {
    const res = await request(app).get('/api/games?limit=2&page=2');
    expect(res.status).toBe(200);
    expect(res.body.games.map((g) => g.id)).toEqual([3, 2]);
    expect(res.body.games.every((g) => g.participants.length === 2)).toBe(true);
  });

  test('empty league returns no games without querying participants', async () => {
    rawTestDb.exec('DELETE FROM comments; DELETE FROM game_participants; DELETE FROM games;');
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body.games).toEqual([]);
  });
});

describe('GET /api/stats/recap (batched participants)', () => {
  test('finds the biggest win of the week', async () => {
    const res = await request(app).get('/api/stats/recap?season=2025&week=24');
    expect(res.status).toBe(200);
    expect(res.body.games_played).toBe(5);
    // Recap sums each team's scores, so the 2v2 blowout (42–20) wins out over
    // the 1v1 21–3.
    expect(res.body.biggest_win).toMatchObject({ id: 4, t1Score: 42, t2Score: 20, margin: 22 });
  });

  test('a week with no games has no biggest win', async () => {
    const res = await request(app).get('/api/stats/recap?season=2025&week=30');
    expect(res.status).toBe(200);
    expect(res.body.games_played).toBe(0);
    expect(res.body.biggest_win).toBeNull();
  });
});

describe('GET /api/stats/rivals', () => {
  test('1v1 pairs are hydrated with both players', async () => {
    const res = await request(app).get('/api/stats/rivals?type=1v1');
    expect(res.status).toBe(200);
    const ab = res.body.find((r) => r.player1.id === 1 && r.player2.id === 2);
    expect(ab).toMatchObject({ games_played: 2, p1_wins: 1, p2_wins: 1 });
    expect(ab.player1.display_name).toBe('Alice');
    expect(ab.player2.display_name).toBe('Bob');
  });

  test('2v2 matchups group both games between the same pairs', async () => {
    const res = await request(app).get('/api/stats/rivals?type=2v2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const [m] = res.body;
    expect(m.games_played).toBe(2);
    expect(m.team1.map((p) => p.user_id)).toEqual([1, 2]);
    expect(m.team2.map((p) => p.user_id)).toEqual([3, 4]);
    expect(m.team1_wins).toBe(1);
    expect(m.team2_wins).toBe(1);
  });
});
