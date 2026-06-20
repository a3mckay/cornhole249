/**
 * League permission ENFORCEMENT, exercised over the real league-scoped path
 * (/api/l/:slug/...), which is what the client always uses — so req.leagueRole
 * is populated by leagueMiddleware exactly as in production.
 *
 * Covers the three controls in the League Settings → Permissions panel:
 *   - score_submit_policy   (all_members | admins_only | select_players)
 *   - score_verify_mode     (immediate | opponent_approve | both_submit)
 *   - tournament_create_policy (admins_only | …)
 */

let rawTestDb;
let kyselyTestDb;

jest.mock('../db', () => {
  const Database = require('better-sqlite3');
  const { Kysely, SqliteDialect, sql } = require('kysely');
  const { SCHEMA_SQL } = require('./fixtures');

  rawTestDb = new Database(':memory:');
  rawTestDb.pragma('foreign_keys = OFF');
  rawTestDb.exec(SCHEMA_SQL);

  kyselyTestDb = new Kysely({ dialect: new SqliteDialect({ database: rawTestDb }) });
  return { getDb: () => kyselyTestDb, runMigrations: jest.fn(), sql };
});

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));

const request = require('supertest');
const app = require('../index');

function setupUser(id, name, is_admin = 0) {
  rawTestDb.prepare(`INSERT INTO users (id, display_name, is_admin, elo_rating, pin) VALUES (?, ?, ?, 1000, '1234')`)
    .run(id, name, is_admin);
}
function addMember(userId, leagueId, role = 'player') {
  rawTestDb.prepare(`INSERT OR IGNORE INTO league_memberships (user_id, league_id, role) VALUES (?, ?, ?)`)
    .run(userId, leagueId, role);
}
function setLeague(fields) {
  const keys = Object.keys(fields);
  rawTestDb.prepare(`UPDATE leagues SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`)
    .run(...keys.map((k) => fields[k]));
}
async function loginAs(userId) {
  const res = await request(app).post('/auth/login').send({ user_id: userId, pin: '1234' });
  return res.headers['set-cookie'];
}
const game = (a, b) => ({ game_type: '1v1', team1: [{ user_id: a, score: 21 }], team2: [{ user_id: b, score: 15 }] });
function postGame(cookie, a, b) {
  return request(app).post('/api/l/cornhole249/games').set('Cookie', cookie).send(game(a, b));
}

beforeEach(() => {
  rawTestDb.exec(`DELETE FROM game_participants; DELETE FROM games; DELETE FROM league_memberships; DELETE FROM leagues; DELETE FROM users;`);
  rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, is_public) VALUES (1, 'cornhole249', 'Cornhole249', 1)`).run();
  setupUser(1, 'Alice');   // owner
  setupUser(2, 'Bob');     // player
  setupUser(3, 'Carol');   // player
  addMember(1, 1, 'owner');
  addMember(2, 1, 'player');
  addMember(3, 1, 'player');
});

describe('score_submit_policy', () => {
  test('all_members (default): a plain player can submit', async () => {
    const res = await postGame(await loginAs(2), 2, 1);
    expect(res.status).toBe(201);
  });

  test('admins_only: player blocked (403), owner allowed', async () => {
    setLeague({ score_submit_policy: 'admins_only' });
    const blocked = await postGame(await loginAs(2), 2, 1);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/admins/i);

    const allowed = await postGame(await loginAs(1), 1, 2);
    expect(allowed.status).toBe(201);
  });

  test('select_players: only listed players may submit', async () => {
    setLeague({ score_submit_policy: 'select_players', score_submit_allowed_ids: JSON.stringify([3]) });
    const blocked = await postGame(await loginAs(2), 2, 1); // Bob not listed
    expect(blocked.status).toBe(403);

    const allowed = await postGame(await loginAs(3), 3, 2); // Carol listed
    expect(allowed.status).toBe(201);
  });
});

describe('score_verify_mode', () => {
  test('immediate (default): game is official right away', async () => {
    const res = await postGame(await loginAs(1), 1, 2);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('official');
  });

  test('opponent_approve: game lands as pending_approval, not official', async () => {
    setLeague({ score_verify_mode: 'opponent_approve' });
    const res = await postGame(await loginAs(1), 1, 2);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_approval');
  });

  test('both_submit: first submission is held (202 pending), no game yet', async () => {
    setLeague({ score_verify_mode: 'both_submit' });
    const res = await postGame(await loginAs(1), 1, 2);
    expect(res.status).toBe(202);
    expect(res.body.pending).toBe(true);
    const count = rawTestDb.prepare('SELECT COUNT(*) c FROM games').get();
    expect(count.c).toBe(0);
  });
});

describe('tournament_create_policy', () => {
  beforeEach(() => setLeague({ plan_override: 'pro' })); // tournaments are Pro-gated

  test('admins_only (default): player blocked, owner passes the permission gate', async () => {
    setLeague({ tournament_create_policy: 'admins_only' });

    const blocked = await request(app).post('/api/l/cornhole249/tournaments')
      .set('Cookie', await loginAs(2))
      .send({ name: 'T', format: 'single_elim', game_type: '1v1', season: 2025, teams: [[1], [2]] });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/admins/i);

    // Owner clears the permission gate (may fail later validation, but NOT 403).
    const owner = await request(app).post('/api/l/cornhole249/tournaments')
      .set('Cookie', await loginAs(1))
      .send({ name: 'T', format: 'single_elim', game_type: '1v1', season: 2025, teams: [[1], [2]] });
    expect(owner.status).not.toBe(403);
  });
});
