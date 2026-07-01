// Cutthroat finish placement (migration 025): 2nd/3rd ordering must persist,
// drive pairwise ELO (2nd loses less than 3rd), feed the standings runner-up /
// last-place columns, and produce three-way odds. Mirrors pool.test.js's
// in-memory SQLite harness.

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

beforeEach(() => {
  rawTestDb.exec('DELETE FROM game_participants; DELETE FROM games; DELETE FROM users; DELETE FROM achievements; DELETE FROM user_sport_ratings;');
  rawTestDb.prepare(`INSERT INTO users (id, display_name, elo_rating) VALUES (1, 'Alice', 1000), (2, 'Bob', 1000), (3, 'Carol', 1000)`).run();
  rawTestDb.prepare(`UPDATE leagues SET sport = 'pool' WHERE id = 1`).run();
});

async function loginAs(agent, userId) {
  await agent.post('/auth/login').send({ user_id: userId });
}

function createCutthroat(agent, { winner, second, third }) {
  return agent.post('/api/games').send({
    game_type: 'cutthroat',
    game_variant: 'cutthroat',
    team1: [{ user_id: winner, placement: 1 }],
    team2: [
      { user_id: second, placement: 2 },
      { user_id: third, placement: 3 },
    ],
  });
}

describe('cutthroat placement', () => {
  test('persists 1/2/3 finish order on the participant rows', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await createCutthroat(agent, { winner: 1, second: 2, third: 3 });
    expect(res.status).toBe(201);

    const parts = rawTestDb
      .prepare('SELECT user_id, placement FROM game_participants WHERE game_id = ?')
      .all(res.body.id);
    const byUser = Object.fromEntries(parts.map((p) => [p.user_id, p.placement]));
    expect(byUser[1]).toBe(1);
    expect(byUser[2]).toBe(2);
    expect(byUser[3]).toBe(3);
  });

  test('2nd place loses less ELO than 3rd; winner gains', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    await createCutthroat(agent, { winner: 1, second: 2, third: 3 });

    const ratingOf = (uid) =>
      rawTestDb.prepare(`SELECT rating FROM user_sport_ratings WHERE sport = 'pool' AND user_id = ?`).get(uid)?.rating;

    const winner = ratingOf(1);
    const second = ratingOf(2);
    const third = ratingOf(3);

    expect(winner).toBeGreaterThan(1000);   // 1st beat both
    expect(second).toBeGreaterThan(third);  // runner-up beat 3rd, so less negative
    expect(third).toBeLessThan(1000);       // last place lost to both
  });

  test('standings expose runner-up (2nd) and last-place (3rd) counts', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    // Alice wins, Bob 2nd, Carol 3rd. Then Bob wins, Carol 2nd, Alice 3rd.
    await createCutthroat(agent, { winner: 1, second: 2, third: 3 });
    await createCutthroat(agent, { winner: 2, second: 3, third: 1 });

    const res = await agent.get('/api/standings/cutthroat');
    expect(res.status).toBe(200);
    const byUser = Object.fromEntries(res.body.map((r) => [r.user_id, r]));

    expect(byUser[1].wins).toBe(1);
    expect(byUser[1].last_place).toBe(1);   // Alice was 3rd once
    expect(byUser[1].runner_up).toBe(0);
    expect(byUser[2].wins).toBe(1);
    expect(byUser[2].runner_up).toBe(1);    // Bob was 2nd once
    expect(byUser[3].runner_up).toBe(1);    // Carol 2nd once
    expect(byUser[3].last_place).toBe(1);   // Carol 3rd once
  });

  test('three-way odds return one probability per player summing to 100', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 1);
    const res = await agent.post('/api/odds').send({
      type: 'cutthroat',
      team1: [1],
      team2: [2, 3],
    });
    expect(res.status).toBe(200);
    expect(res.body.cutthroat).toBe(true);
    expect(res.body.players).toHaveLength(3);
    const sum = res.body.players.reduce((s, p) => s + p.pct, 0);
    expect(sum).toBe(100);
  });
});
