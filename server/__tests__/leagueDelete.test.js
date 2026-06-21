// DELETE /api/leagues/:slug — the safety-critical test: deleting a league must
// remove ONLY that league's data, never players, never other leagues, never the
// global per-sport ratings, and never the protected cornhole249 flagship.

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

const run = (s) => rawTestDb.exec(s);
const count = (table, where) => rawTestDb.prepare(`SELECT COUNT(*) c FROM ${table}${where ? ' WHERE ' + where : ''}`).get().c;
async function login(agent, userId) { await agent.post('/auth/login').send({ user_id: userId, pin: '1234' }); }

beforeEach(() => {
  run(`DELETE FROM leagues; DELETE FROM league_memberships; DELETE FROM users; DELETE FROM games;
       DELETE FROM game_participants; DELETE FROM comments; DELETE FROM trash_talk; DELETE FROM achievements;
       DELETE FROM venues; DELETE FROM join_codes; DELETE FROM join_requests; DELETE FROM pending_game_submissions;
       DELETE FROM matches; DELETE FROM tournaments; DELETE FROM tournament_matches; DELETE FROM user_sport_ratings;`);

  // Flagship + two deletable leagues.
  run(`INSERT INTO leagues (id, slug, name, is_public) VALUES
        (1,'cornhole249','Cornhole249',1), (2,'doomed','Doomed League',1), (3,'keeper','Keeper League',1)`);
  // Users: Alice owns doomed+keeper, Bob plays doomed, Carol plays keeper, Dave site admin.
  run(`INSERT INTO users (id, display_name, is_admin, elo_rating, pin) VALUES
        (1,'Alice',0,1000,'1234'), (2,'Bob',0,1000,'1234'), (3,'Carol',0,1000,'1234'), (9,'Dave',1,1000,'1234')`);
  run(`INSERT INTO league_memberships (league_id, user_id, role) VALUES
        (2,1,'owner'), (2,2,'player'), (3,1,'owner'), (3,3,'player')`);

  // Data in BOTH leagues across every league-scoped table.
  for (const lg of [2, 3]) {
    run(`INSERT INTO games (game_type, played_at, season, league_id) VALUES ('1v1', datetime('now'), 2026, ${lg})`);
    const gid = rawTestDb.prepare('SELECT id FROM games WHERE league_id = ? ORDER BY id DESC LIMIT 1').get(lg).id;
    run(`INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (${gid},1,1,21,1),(${gid},${lg === 2 ? 2 : 3},2,15,0)`);
    run(`INSERT INTO comments (game_id, user_id, body, league_id) VALUES (${gid},1,'gg',${lg})`);
    run(`INSERT INTO trash_talk (user_id, body, league_id) VALUES (1,'talk',${lg})`);
    run(`INSERT INTO achievements (user_id, achievement_key, league_id) VALUES (1,'first_win',${lg})`);
    run(`INSERT INTO venues (name, league_id) VALUES ('Bar ${lg}',${lg})`);
    run(`INSERT INTO join_codes (code, league_id) VALUES ('CODE${lg}',${lg})`);
    run(`INSERT INTO join_requests (league_id, user_id, status) VALUES (${lg},3,'pending')`);
    run(`INSERT INTO matches (league_id, season, game_type, side1_player_ids, side2_player_ids, target_wins) VALUES (${lg},2026,'1v1','[1]','[2]',2)`);
  }
  // Global per-sport ratings (NOT league scoped — must survive).
  run(`INSERT INTO user_sport_ratings (user_id, sport, rating) VALUES (1,'pool',1100),(2,'pool',900)`);
});

describe('DELETE /api/leagues/:slug', () => {
  test('owner can delete their league — and ONLY that league', async () => {
    const agent = request.agent(app);
    await login(agent, 1); // Alice, owner of doomed
    const res = await agent.delete('/api/leagues/doomed').send({ confirm: 'Doomed League' });
    expect(res.status).toBe(200);

    // Target league + ALL its rows are gone.
    expect(count('leagues', 'id = 2')).toBe(0);
    for (const t of ['games', 'comments', 'trash_talk', 'achievements', 'venues', 'join_codes', 'join_requests', 'matches', 'league_memberships']) {
      expect(count(t, 'league_id = 2')).toBe(0);
    }
    expect(count('game_participants')).toBe(2); // only keeper's 2 participants remain

    // Players untouched.
    expect(count('users')).toBe(4);

    // Other league fully intact.
    expect(count('leagues', 'id = 3')).toBe(1);
    for (const t of ['games', 'comments', 'trash_talk', 'achievements', 'venues', 'join_codes', 'join_requests', 'matches']) {
      expect(count(t, 'league_id = 3')).toBe(1);
    }
    expect(count('league_memberships', 'league_id = 3')).toBe(2);

    // Delete triggers a recompute (adds cornhole rows for the surviving keeper
    // players) but never wipes the table — pool ratings (no remaining games) survive.
    expect(count('user_sport_ratings', "sport = 'pool'")).toBe(2);
  });

  test('recomputes per-sport ratings from the remaining games after delete', async () => {
    // Both leagues are pool, one 8-ball game each; Alice's pool rating is bogus.
    run(`UPDATE leagues SET sport = 'pool' WHERE id IN (2,3)`);
    run(`UPDATE games SET game_variant = 'eight_ball'`);
    run(`UPDATE user_sport_ratings SET rating = 1500 WHERE user_id = 1 AND sport = 'pool'`);

    const agent = request.agent(app);
    await login(agent, 1);
    const res = await agent.delete('/api/leagues/doomed').send({ confirm: 'Doomed League' });
    expect(res.status).toBe(200);

    // Only keeper's pool game remains (Alice beat Carol). Replayed from 1000 with
    // flat margin (K=32): winner 1016, loser 984. The bogus 1500 is overwritten,
    // proving the recompute ran against the post-delete game set.
    const pool = (uid) => rawTestDb.prepare("SELECT rating FROM user_sport_ratings WHERE user_id = ? AND sport = 'pool'").get(uid)?.rating;
    expect(pool(1)).toBe(1016);
    expect(pool(3)).toBe(984);
  });

  test('the cornhole249 flagship is protected (403)', async () => {
    const agent = request.agent(app);
    await login(agent, 9); // even a site admin
    const res = await agent.delete('/api/leagues/cornhole249').send({ confirm: 'Cornhole249' });
    expect(res.status).toBe(403);
    expect(count('leagues', "slug = 'cornhole249'")).toBe(1);
  });

  test('a non-owner player cannot delete (403)', async () => {
    const agent = request.agent(app);
    await login(agent, 2); // Bob, only a player in doomed
    const res = await agent.delete('/api/leagues/doomed').send({ confirm: 'Doomed League' });
    expect(res.status).toBe(403);
    expect(count('leagues', 'id = 2')).toBe(1);
  });

  test('wrong confirmation text is rejected (400) and nothing is deleted', async () => {
    const agent = request.agent(app);
    await login(agent, 1);
    const res = await agent.delete('/api/leagues/doomed').send({ confirm: 'wrong' });
    expect(res.status).toBe(400);
    expect(count('leagues', 'id = 2')).toBe(1);
    expect(count('games', 'league_id = 2')).toBe(1);
  });

  test('a site admin can delete a non-flagship league', async () => {
    const agent = request.agent(app);
    await login(agent, 9); // Dave, site admin, not a member of doomed
    const res = await agent.delete('/api/leagues/doomed').send({ confirm: 'doomed league' }); // case-insensitive
    expect(res.status).toBe(200);
    expect(count('leagues', 'id = 2')).toBe(0);
    expect(count('users')).toBe(4);
    expect(count('leagues', 'id = 3')).toBe(1);
  });
});
