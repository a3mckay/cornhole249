// Pool sport (multi-sport Phase 2) — variant submission + ELO margin tests.
// Exercises the shared /api/games POST handler with league 1 flipped to sport
// 'pool', proving cornhole leagues are unaffected and pool variants persist.

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
const { ballsRemainingMultiplier, pointMarginMultiplier, getSport } = require('../lib/sports');
const app = require('../index');

beforeEach(() => {
  rawTestDb.exec('DELETE FROM game_participants; DELETE FROM games; DELETE FROM users; DELETE FROM achievements;');
  rawTestDb.prepare(`INSERT INTO users (id, display_name, elo_rating) VALUES (1, 'Alice', 1000), (2, 'Bob', 1000), (3, 'Carol', 1000)`).run();
  // Default league back to cornhole; pool tests opt in explicitly.
  rawTestDb.prepare(`UPDATE leagues SET sport = 'cornhole' WHERE id = 1`).run();
});

function setSport(sport) {
  rawTestDb.prepare(`UPDATE leagues SET sport = ? WHERE id = 1`).run(sport);
}

async function loginAs(agent, userId) {
  await agent.post('/auth/login').send({ user_id: userId });
}

describe('Pool sport gating', () => {
  test('cornhole league rejects cutthroat game_type', async () => {
    setSport('cornhole');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: 'cutthroat',
      team1: [{ user_id: 1 }],
      team2: [{ user_id: 2 }, { user_id: 3 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/game_type/i);
  });

  test('pool league accepts cutthroat (1 winner, 2 losers)', async () => {
    setSport('pool');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: 'cutthroat',
      game_variant: 'cutthroat',
      team1: [{ user_id: 1 }],
      team2: [{ user_id: 2 }, { user_id: 3 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.game_variant).toBe('cutthroat');

    const parts = rawTestDb.prepare('SELECT user_id, team, is_winner FROM game_participants WHERE game_id = ? ORDER BY team', ).all(res.body.id);
    expect(parts.find((p) => p.user_id === 1).is_winner).toBe(1);
    expect(parts.filter((p) => p.team === 2).every((p) => p.is_winner === 0)).toBe(true);
  });

  test('pool league rejects bad cutthroat shape', async () => {
    setSport('pool');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: 'cutthroat',
      game_variant: 'cutthroat',
      team1: [{ user_id: 1 }, { user_id: 2 }],
      team2: [{ user_id: 3 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cutthroat requires/i);
  });

  test('pool 8-ball persists variant + loser balls_remaining', async () => {
    setSport('pool');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: '1v1',
      game_variant: 'eight_ball',
      eight_ball_end_condition: 'sunk',
      balls_remaining: 4,
      team1: [{ user_id: 1, score: 1 }],
      team2: [{ user_id: 2, score: 0 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.game_variant).toBe('eight_ball');
    expect(res.body.eight_ball_end_condition).toBe('sunk');

    const winner = rawTestDb.prepare('SELECT balls_remaining FROM game_participants WHERE game_id = ? AND user_id = 1').get(res.body.id);
    const loser = rawTestDb.prepare('SELECT balls_remaining FROM game_participants WHERE game_id = ? AND user_id = 2').get(res.body.id);
    expect(winner.balls_remaining).toBeNull();
    expect(loser.balls_remaining).toBe(4);
  });

  test('balls_remaining clamps to 0..7', async () => {
    setSport('pool');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: '1v1',
      game_variant: 'eight_ball',
      balls_remaining: 99,
      team1: [{ user_id: 1, score: 1 }],
      team2: [{ user_id: 2, score: 0 }],
    });
    expect(res.status).toBe(201);
    const loser = rawTestDb.prepare('SELECT balls_remaining FROM game_participants WHERE game_id = ? AND user_id = 2').get(res.body.id);
    expect(loser.balls_remaining).toBe(7);
  });

  test('cornhole league ignores variant fields (stays NULL)', async () => {
    setSport('cornhole');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/games').send({
      game_type: '1v1',
      game_variant: 'eight_ball',
      balls_remaining: 5,
      team1: [{ user_id: 1, score: 21 }],
      team2: [{ user_id: 2, score: 15 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.game_variant).toBeNull();
    const loser = rawTestDb.prepare('SELECT balls_remaining FROM game_participants WHERE game_id = ? AND user_id = 2').get(res.body.id);
    expect(loser.balls_remaining).toBeNull();
  });
});

describe('Pool variant standings', () => {
  async function submitPool(agent, body) {
    return agent.post('/api/games').send(body);
  }

  test('1v1 standings filter by variant', async () => {
    setSport('pool');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    // One 8-ball game (Alice beats Bob) and one 9-ball game (Bob beats Alice).
    await submitPool(agent, { game_type: '1v1', game_variant: 'eight_ball', team1: [{ user_id: 1, score: 1 }], team2: [{ user_id: 2, score: 0 }] });
    await submitPool(agent, { game_type: '1v1', game_variant: 'nine_ball', team1: [{ user_id: 2, score: 1 }], team2: [{ user_id: 1, score: 0 }] });

    const eight = await agent.get('/api/standings/1v1?variant=eight_ball');
    expect(eight.status).toBe(200);
    const aliceEight = eight.body.find((r) => r.user_id === 1);
    expect(aliceEight.wins).toBe(1);
    expect(aliceEight.gp).toBe(1); // 9-ball game excluded

    const all = await agent.get('/api/standings/1v1');
    const aliceAll = all.body.find((r) => r.user_id === 1);
    expect(aliceAll.gp).toBe(2); // both variants counted
  });

  test('cutthroat standings: winner has the win, losers the losses', async () => {
    setSport('pool');
    const agent = request.agent(app);
    await loginAs(agent, 1);
    await submitPool(agent, {
      game_type: 'cutthroat', game_variant: 'cutthroat',
      team1: [{ user_id: 1 }],
      team2: [{ user_id: 2 }, { user_id: 3 }],
    });

    const res = await agent.get('/api/standings/cutthroat');
    expect(res.status).toBe(200);
    const winner = res.body.find((r) => r.user_id === 1);
    const loser = res.body.find((r) => r.user_id === 2);
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(loser.wins).toBe(0);
    expect(loser.losses).toBe(1);
  });
});

describe('Pool ELO margin model', () => {
  test('ballsRemainingMultiplier: 0 balls = 1.0x, 5 = 1.5x cap', () => {
    expect(ballsRemainingMultiplier(0)).toBeCloseTo(1.0);
    expect(ballsRemainingMultiplier(3)).toBeCloseTo(1.3);
    expect(ballsRemainingMultiplier(5)).toBeCloseTo(1.5);
    expect(ballsRemainingMultiplier(7)).toBeCloseTo(1.5); // capped
  });

  test('pointMarginMultiplier unchanged for cornhole', () => {
    expect(pointMarginMultiplier(21, 21)).toBeCloseTo(1.0);
    expect(pointMarginMultiplier(21, 0)).toBeCloseTo(1.5); // capped
  });

  test('pool marginFn routes by variant', () => {
    const pool = getSport('pool');
    // cutthroat = flat 1x
    expect(pool.marginFn({ score: 1 }, { score: 0 }, { game_variant: 'cutthroat' })).toBe(1);
    // 8-ball = balls_remaining proxy
    expect(pool.marginFn({}, { balls_remaining: 3 }, { game_variant: 'eight_ball' })).toBeCloseTo(1.3);
    // 9-ball / straight = racks (point) margin, NOT a flat 1x
    expect(pool.marginFn({ score: 5 }, { score: 0 }, { game_variant: 'nine_ball' })).toBeGreaterThan(1.0);
    expect(pool.marginFn({ score: 100 }, { score: 0 }, { game_variant: 'straight_pool' })).toBeCloseTo(1.5);
  });
});
