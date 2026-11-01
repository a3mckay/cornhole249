/**
 * Batched hydration helpers for game lists.
 *
 * List endpoints used to run one or two queries *per game* (participants,
 * latest comment). Pool leagues log every rack as its own game, so a single
 * night can produce dozens of games and those N+1 loops dominated page-load
 * time. These helpers fetch everything for a set of games in one query each.
 *
 * SQL is kept portable (plain `IN (...)` lists + ROW_NUMBER) so it runs on
 * both Postgres (production) and SQLite (tests).
 */
const { sql } = require('../db');

/** Parameterized `IN (...)` list body for a non-empty array of ids. */
function idList(ids) {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

function uniqueIds(ids) {
  return [...new Set(ids.filter((id) => id != null))];
}

/**
 * Map<game_id, participant[]> for the given games, each participant joined to
 * its user's display fields and ordered by team then insertion (the same order
 * the old per-game query used).
 */
async function participantsByGame(db, gameIds) {
  const ids = uniqueIds(gameIds);
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const { rows } = await sql`
    SELECT gp.*, u.display_name, u.nickname, u.avatar_url
    FROM game_participants gp JOIN users u ON gp.user_id = u.id
    WHERE gp.game_id IN (${idList(ids)})
    ORDER BY gp.game_id, gp.team, gp.id
  `.execute(db);
  for (const r of rows) {
    if (!map.has(r.game_id)) map.set(r.game_id, []);
    map.get(r.game_id).push(r);
  }
  return map;
}

/** Map<game_id, { body, display_name }> holding each game's newest comment. */
async function latestCommentByGame(db, gameIds) {
  const ids = uniqueIds(gameIds);
  const map = new Map();
  if (!ids.length) return map;
  const { rows } = await sql`
    SELECT game_id, body, display_name FROM (
      SELECT c.game_id, c.body, u.display_name,
             ROW_NUMBER() OVER (PARTITION BY c.game_id ORDER BY c.created_at DESC, c.id DESC) AS rn
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.game_id IN (${idList(ids)})
    ) latest
    WHERE rn = 1
  `.execute(db);
  for (const r of rows) map.set(r.game_id, { body: r.body, display_name: r.display_name });
  return map;
}

/** Map<user_id, { id, display_name, nickname, avatar_url }>. */
async function usersById(db, userIds) {
  const ids = uniqueIds(userIds);
  const map = new Map();
  if (!ids.length) return map;
  const { rows } = await sql`
    SELECT id, display_name, nickname, avatar_url FROM users WHERE id IN (${idList(ids)})
  `.execute(db);
  for (const u of rows) map.set(u.id, u);
  return map;
}

module.exports = { idList, participantsByGame, latestCommentByGame, usersById };
