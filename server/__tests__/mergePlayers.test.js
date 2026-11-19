/**
 * Merging a duplicate placeholder player into the person's real account
 * (POST /api/leagues/:slug/members/merge + lib/mergePlayers).
 *
 * Scenario mirrors the real bug: the owner added "Dave" by name to the
 * cornhole and pool leagues and logged games for him; Dave later signed up
 * himself ("David Le Corre") and joined the pool league with a link. His House
 * was empty because his games and cornhole membership sat on the placeholder.
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
const { swapIdInJsonArray } = require('../lib/mergePlayers');

const OWNER = 1, STUB = 10, REAL = 11, STONES = 12, OTHER_OWNER = 20;

function user(id, name, fields = {}) {
  rawTestDb.prepare(
    `INSERT INTO users (id, display_name, nickname, is_admin, elo_rating, pin, email, password_hash) VALUES (?, ?, ?, 0, 1000, ?, ?, ?)`
  ).run(id, name, fields.nickname ?? null, fields.pin ?? null, fields.email ?? null, fields.password_hash ?? null);
}
function member(userId, leagueId, role = 'player') {
  rawTestDb.prepare(`INSERT OR IGNORE INTO league_memberships (user_id, league_id, role) VALUES (?, ?, ?)`).run(userId, leagueId, role);
}
let nextGame = 1;
function game(leagueId, winner, loser) {
  const id = nextGame++;
  rawTestDb.prepare(`INSERT INTO games (id, game_type, played_at, season, league_id, status, submitted_by_user_id) VALUES (?, '1v1', datetime('now', ?), 1, ?, 'official', ?)`)
    .run(id, `-${100 - id} minutes`, leagueId, OWNER);
  rawTestDb.prepare(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, 1, 21, 1), (?, ?, 2, 10, 0)`)
    .run(id, winner, id, loser);
  return id;
}
async function loginAs(userId) {
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ user_id: userId, pin: '1234' });
  return agent;
}
const count = (q, ...a) => rawTestDb.prepare(q).get(...a).n;

beforeEach(() => {
  nextGame = 1;
  rawTestDb.exec(`
    DELETE FROM game_participants; DELETE FROM games; DELETE FROM league_memberships; DELETE FROM leagues;
    DELETE FROM users; DELETE FROM achievements; DELETE FROM tournament_matches; DELETE FROM user_sport_ratings;
    DELETE FROM join_requests; DELETE FROM comments;
  `);
  rawTestDb.prepare(`
    INSERT INTO leagues (id, slug, name, sport, plan) VALUES
      (1, 'cornhole249', 'Cornhole249', 'cornhole', 'pro'),
      (2, 'pool249', 'Pool249', 'pool', 'pro'),
      (3, 'elsewhere', 'Elsewhere', 'cornhole', 'pro')
  `).run();
  user(OWNER, 'Andrew', { pin: '1234', email: 'andrew@example.com' });
  user(STUB, 'Dave', { nickname: 'The Bayfront Bagger' });             // placeholder: no login
  user(REAL, 'David Le Corre', { pin: '1234', email: 'dave@example.com', password_hash: 'x' });
  user(STONES, 'Stones', { pin: '1234' });
  user(OTHER_OWNER, 'Someone Else', { pin: '1234', email: 'else@example.com' });
  member(OWNER, 1, 'owner'); member(OWNER, 2, 'owner');
  member(STUB, 1); member(STUB, 2);
  member(REAL, 2); // joined pool249 via the link
  member(STONES, 1); member(STONES, 2);
  member(OTHER_OWNER, 3, 'owner');

  game(1, STUB, STONES);   // cornhole
  game(1, STONES, STUB);
  game(2, STUB, STONES);   // pool
});

describe('POST /api/leagues/:slug/members/merge', () => {
  test('folds the placeholder into the real account: memberships, games, nickname, House', async () => {
    rawTestDb.prepare(`INSERT INTO achievements (user_id, achievement_key, league_id) VALUES (?, 'first_win', 1), (?, 'hot_streak', 1), (?, 'first_win', 1)`)
      .run(STUB, STUB, REAL);
    rawTestDb.prepare(`INSERT INTO tournament_matches (id, tournament_id, round, match_number, team1_player_ids, team2_player_ids) VALUES (1, 1, 1, 1, ?, ?)`)
      .run(JSON.stringify([STUB]), JSON.stringify([STONES]));
    rawTestDb.prepare(`INSERT INTO comments (game_id, user_id, body) VALUES (1, ?, 'gg')`).run(STUB);

    const owner = await loginAs(OWNER);
    const res = await owner.post('/api/leagues/pool249/members/merge').send({ from_user_id: STUB, into_user_id: REAL });
    expect(res.status).toBe(200);
    expect(res.body.moved).toMatchObject({ games: 3, memberships: 1, achievements: 1, brackets: 1 });

    // Placeholder gone; real account is in both leagues, once each.
    expect(count(`SELECT COUNT(*) n FROM users WHERE id = ?`, STUB)).toBe(0);
    expect(rawTestDb.prepare(`SELECT league_id FROM league_memberships WHERE user_id = ? ORDER BY league_id`).all(REAL).map((r) => r.league_id)).toEqual([1, 2]);
    expect(count(`SELECT COUNT(*) n FROM league_memberships WHERE user_id = ?`, STUB)).toBe(0);

    // Game history, comments, brackets and achievements now belong to the real account.
    expect(count(`SELECT COUNT(*) n FROM game_participants WHERE user_id = ?`, REAL)).toBe(3);
    expect(count(`SELECT COUNT(*) n FROM comments WHERE user_id = ?`, REAL)).toBe(1);
    expect(JSON.parse(rawTestDb.prepare(`SELECT team1_player_ids t FROM tournament_matches WHERE id = 1`).get().t)).toEqual([REAL]);
    expect(rawTestDb.prepare(`SELECT achievement_key FROM achievements WHERE user_id = ? ORDER BY achievement_key`).all(REAL).map((r) => r.achievement_key))
      .toEqual(['first_win', 'hot_streak']);

    // League nickname carried over; ratings replayed onto the real account.
    expect(rawTestDb.prepare(`SELECT nickname FROM users WHERE id = ?`).get(REAL).nickname).toBe('The Bayfront Bagger');
    expect(rawTestDb.prepare(`SELECT sport FROM user_sport_ratings WHERE user_id = ? ORDER BY sport`).all(REAL).map((r) => r.sport)).toEqual(['cornhole', 'pool']);

    // Dave signs in as himself and his House has both sports.
    const dave = await loginAs(REAL);
    const house = await dave.get('/api/house/me/overview');
    expect(house.body.sports.sort()).toEqual(['cornhole', 'pool']);
    const mine = await dave.get('/api/leagues/mine');
    expect(mine.body.map((l) => l.slug).sort()).toEqual(['cornhole249', 'pool249']);
  });

  test('keeps the stronger role when both accounts were in the same league', async () => {
    rawTestDb.prepare(`UPDATE league_memberships SET role = 'admin' WHERE user_id = ? AND league_id = 2`).run(STUB);
    const owner = await loginAs(OWNER);
    await owner.post('/api/leagues/pool249/members/merge').send({ from_user_id: STUB, into_user_id: REAL });
    expect(rawTestDb.prepare(`SELECT role FROM league_memberships WHERE user_id = ? AND league_id = 2`).get(REAL).role).toBe('admin');
  });

  test('never merges away an account that has its own login', async () => {
    const owner = await loginAs(OWNER);
    const res = await owner.post('/api/leagues/pool249/members/merge').send({ from_user_id: REAL, into_user_id: STUB });
    expect(res.status).toBe(400);
    expect(count(`SELECT COUNT(*) n FROM users WHERE id IN (?, ?)`, STUB, REAL)).toBe(2);
  });

  test('both players must be in this league', async () => {
    const owner = await loginAs(OWNER);
    // REAL isn't in cornhole249 yet.
    const res = await owner.post('/api/leagues/cornhole249/members/merge').send({ from_user_id: STUB, into_user_id: REAL });
    expect(res.status).toBe(404);
  });

  test('refuses when the placeholder has history in a league the requester does not manage', async () => {
    member(STUB, 3);
    game(3, STUB, OTHER_OWNER);
    const owner = await loginAs(OWNER);
    const res = await owner.post('/api/leagues/pool249/members/merge').send({ from_user_id: STUB, into_user_id: REAL });
    expect(res.status).toBe(403);
    expect(count(`SELECT COUNT(*) n FROM users WHERE id = ?`, STUB)).toBe(1);
  });

  test('refuses (and changes nothing) when the two accounts played in the same game', async () => {
    game(2, REAL, STUB);
    const owner = await loginAs(OWNER);
    const res = await owner.post('/api/leagues/pool249/members/merge').send({ from_user_id: STUB, into_user_id: REAL });
    expect(res.status).toBe(409);
    expect(count(`SELECT COUNT(*) n FROM users WHERE id = ?`, STUB)).toBe(1);
    expect(count(`SELECT COUNT(*) n FROM game_participants WHERE user_id = ?`, STUB)).toBe(4);
  });

  test('plain players cannot merge', async () => {
    const stones = await loginAs(STONES);
    const res = await stones.post('/api/leagues/pool249/members/merge').send({ from_user_id: STUB, into_user_id: REAL });
    expect(res.status).toBe(403);
  });

  test('members list flags who has a login', async () => {
    const owner = await loginAs(OWNER);
    const res = await owner.get('/api/leagues/pool249/members');
    const byId = Object.fromEntries(res.body.map((m) => [m.id, !!m.has_login]));
    expect(byId[STUB]).toBe(false);
    expect(byId[REAL]).toBe(true);
  });
});

describe('swapIdInJsonArray', () => {
  test('swaps numeric and string ids, de-dupes, ignores non-matches', () => {
    expect(swapIdInJsonArray('[10, 12]', 10, 11)).toBe('[11,12]');
    expect(swapIdInJsonArray('["10"]', 10, 11)).toBe('["11"]');
    expect(swapIdInJsonArray('[10, 11]', 10, 11)).toBe('[11]');
    expect(swapIdInJsonArray('[110, 12]', 10, 11)).toBeNull();
    expect(swapIdInJsonArray('not json', 10, 11)).toBeNull();
  });
});
