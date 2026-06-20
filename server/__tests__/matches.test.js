// Match/series (ROADMAP WS-G): pure progress logic + the full create-match →
// log-games → auto-complete flow through the shared /api/games handler.

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

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));

const request = require('supertest');
const { matchProgress, gameFitsMatch } = require('../lib/matches');
const app = require('../index');

describe('matchProgress (pure)', () => {
  const match = { side1_player_ids: '[1]', side2_player_ids: '[2]', target_wins: 2, status: 'open', winner_side: null };
  const win = (winnerId) => ({ participants: [
    { user_id: 1, is_winner: winnerId === 1 ? 1 : 0 },
    { user_id: 2, is_winner: winnerId === 2 ? 1 : 0 },
  ] });

  test('counts wins per side and stays open below target', () => {
    const p = matchProgress(match, [win(1)]);
    expect(p.side1_wins).toBe(1);
    expect(p.side2_wins).toBe(0);
    expect(p.status).toBe('open');
  });

  test('completes when a side reaches target_wins', () => {
    const p = matchProgress(match, [win(1), win(2), win(1)]);
    expect(p.side1_wins).toBe(2);
    expect(p.side2_wins).toBe(1);
    expect(p.status).toBe('completed');
    expect(p.winner_side).toBe(1);
  });
});

describe('gameFitsMatch', () => {
  test('matches the two sides in either orientation', () => {
    expect(gameFitsMatch([1], [2], [1], [2])).toBe(true);
    expect(gameFitsMatch([2], [1], [1], [2])).toBe(true); // swapped
    expect(gameFitsMatch([1], [3], [1], [2])).toBe(false); // wrong opponent
  });

  test('2v2 needs the same player sets', () => {
    expect(gameFitsMatch([1, 2], [3, 4], [3, 4], [1, 2])).toBe(true);
    expect(gameFitsMatch([1, 2], [3, 5], [1, 2], [3, 4])).toBe(false);
  });
});

describe('Match flow (best of 3) through /api/games', () => {
  beforeEach(() => {
    rawTestDb.exec('DELETE FROM game_participants; DELETE FROM games; DELETE FROM users; DELETE FROM matches;');
    rawTestDb.prepare(`INSERT INTO users (id, display_name, elo_rating) VALUES (1,'Alice',1000),(2,'Bob',1000)`).run();
    rawTestDb.prepare(`UPDATE leagues SET sport = 'cornhole' WHERE id = 1`).run();
  });

  async function login(agent, id) { await agent.post('/auth/login').send({ user_id: id }); }

  test('create match, log games, auto-complete at target', async () => {
    const agent = request.agent(app);
    await login(agent, 1);

    // Best of 3 (first to 2) between Alice and Bob.
    const created = await agent.post('/api/matches').send({
      game_type: '1v1', side1: [1], side2: [2], target_wins: 2, format_label: 'Best of 3',
    });
    expect(created.status).toBe(201);
    const matchId = created.body.id;
    expect(created.body.status).toBe('open');
    expect(created.body.progress).toEqual(expect.objectContaining({ side1_wins: 0, side2_wins: 0 }));

    // Game 1: Alice wins. Match stays open at 1–0.
    let g = await agent.post('/api/games').send({
      game_type: '1v1', match_id: matchId,
      team1: [{ user_id: 1, score: 21 }], team2: [{ user_id: 2, score: 15 }],
    });
    expect(g.status).toBe(201);
    let detail = await agent.get(`/api/matches/${matchId}`);
    expect(detail.body.progress).toEqual(expect.objectContaining({ side1_wins: 1, side2_wins: 0, status: 'open' }));

    // Game 2: Bob wins (orientation swapped — Bob listed as team1). Now 1–1.
    g = await agent.post('/api/games').send({
      game_type: '1v1', match_id: matchId,
      team1: [{ user_id: 2, score: 21 }], team2: [{ user_id: 1, score: 17 }],
    });
    expect(g.status).toBe(201);
    detail = await agent.get(`/api/matches/${matchId}`);
    expect(detail.body.progress).toEqual(expect.objectContaining({ side1_wins: 1, side2_wins: 1, status: 'open' }));

    // Game 3: Alice wins → she reaches 2 → match completes, winner side 1.
    g = await agent.post('/api/games').send({
      game_type: '1v1', match_id: matchId,
      team1: [{ user_id: 1, score: 21 }], team2: [{ user_id: 2, score: 19 }],
    });
    expect(g.status).toBe(201);
    detail = await agent.get(`/api/matches/${matchId}`);
    expect(detail.body.progress).toEqual(expect.objectContaining({ side1_wins: 2, side2_wins: 1, status: 'completed', winner_side: 1 }));
    expect(detail.body.status).toBe('completed');
    expect(detail.body.games.length).toBe(3);

    // A 4th game into a completed match is rejected.
    g = await agent.post('/api/games').send({
      game_type: '1v1', match_id: matchId,
      team1: [{ user_id: 1, score: 21 }], team2: [{ user_id: 2, score: 0 }],
    });
    expect(g.status).toBe(400);
    expect(g.body.error).toMatch(/already complete/i);
  });

  test('rejects a game whose players are not the match sides', async () => {
    const agent = request.agent(app);
    await login(agent, 1);
    rawTestDb.prepare(`INSERT INTO users (id, display_name, elo_rating) VALUES (3,'Carol',1000)`).run();
    const created = await agent.post('/api/matches').send({ game_type: '1v1', side1: [1], side2: [2], target_wins: 2 });
    const g = await agent.post('/api/games').send({
      game_type: '1v1', match_id: created.body.id,
      team1: [{ user_id: 1, score: 21 }], team2: [{ user_id: 3, score: 15 }],
    });
    expect(g.status).toBe(400);
    expect(g.body.error).toMatch(/sides/i);
  });
});
