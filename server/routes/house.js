/**
 * Cross-sport "house" stats HTTP layer.
 *
 * A *house* = the set of leagues owned by one user (ownership = a
 * `league_memberships` row with role='owner'). These endpoints aggregate that
 * user's leagues across every sport and expose the cross-sport boards built in
 * `server/lib/house.js` (rankings, best-at-everything, jack-of-all-trades,
 * sport affinity, cross-sport H2H, nemesis).
 *
 * Design: this layer only does DB I/O (resolve the house's leagues, pull flat
 * participant rows, hydrate users). All math lives in the pure, DB-free
 * `lib/house.js` so it stays sport-agnostic and unit-testable.
 *
 * Routes (mounted at /api/house):
 *   GET /:ownerId/overview            — all overview boards
 *   GET /:ownerId/h2h/:p1/:p2         — cross-sport head-to-head
 *   GET /:ownerId/nemesis/:userId     — a player's worst-record opponent
 */
const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const house = require('../lib/house');

// Only count finalized games — exclude pending/disputed/rejected so the
// boards mirror official standings.
const OFFICIAL_STATUS = 'official';

/** League ids that belong to this owner's house. */
async function houseLeagueIds(db, ownerId) {
  const { rows } = await sql`
    SELECT league_id FROM league_memberships
    WHERE user_id = ${ownerId} AND role = 'owner'
  `.execute(db);
  return rows.map((r) => r.league_id);
}

/**
 * Flat participant rows for a set of leagues, each tagged with its league's
 * sport. Shape matches lib/house.js's expected input.
 */
async function houseRows(db, leagueIds) {
  if (!leagueIds.length) return [];
  const { rows } = await sql`
    SELECT gp.game_id, g.league_id, l.sport, gp.user_id, gp.team, gp.is_winner
    FROM game_participants gp
    JOIN games g ON g.id = gp.game_id
    JOIN leagues l ON l.id = g.league_id
    WHERE g.league_id IN (${idList(leagueIds)})
      AND g.status = ${OFFICIAL_STATUS}
  `.execute(db);
  return rows;
}

/** SQL fragment for `IN (...)` over a list of ids (parameterized). */
function idList(ids) {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

/** Build a hydrate(user_id) -> display fields function for the given ids. */
async function buildHydrator(db, userIds) {
  const ids = [...new Set(userIds)];
  const map = new Map();
  if (ids.length) {
    const { rows } = await sql`
      SELECT id, display_name, nickname, avatar_url
      FROM users WHERE id IN (${idList(ids)})
    `.execute(db);
    for (const u of rows) map.set(u.id, u);
  }
  return (id) => {
    const u = map.get(id);
    return u
      ? { user_id: id, display_name: u.display_name, nickname: u.nickname, avatar_url: u.avatar_url }
      : { user_id: id };
  };
}

/** Resolve owner + the aggregated house, shared by every endpoint. */
async function loadHouse(db, ownerId) {
  const owner = await db
    .selectFrom('users')
    .select(['id', 'display_name', 'nickname', 'avatar_url'])
    .where('id', '=', ownerId)
    .executeTakeFirst();
  if (!owner) return { owner: null };
  const leagueIds = await houseLeagueIds(db, ownerId);
  const rows = await houseRows(db, leagueIds);
  const agg = house.aggregate(rows);
  return { owner, leagueIds, rows, agg };
}

// GET /api/house/:ownerId/overview — every cross-sport overview board.
router.get('/:ownerId/overview', async (req, res) => {
  try {
    const db = getDb();
    const ownerId = parseInt(req.params.ownerId, 10);
    if (!Number.isInteger(ownerId)) return res.status(400).json({ error: 'Invalid owner id' });

    const { owner, rows, agg } = await loadHouse(db, ownerId);
    if (!owner) return res.status(404).json({ error: 'House owner not found' });

    const hydrate = await buildHydrator(db, rows.map((r) => r.user_id));
    const overview = house.buildOverview(agg, hydrate);
    return res.json({ owner, ...overview });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/house/:ownerId/h2h/:p1/:p2 — cross-sport head-to-head.
router.get('/:ownerId/h2h/:p1/:p2', async (req, res) => {
  try {
    const db = getDb();
    const ownerId = parseInt(req.params.ownerId, 10);
    const p1 = parseInt(req.params.p1, 10);
    const p2 = parseInt(req.params.p2, 10);
    if (![ownerId, p1, p2].every(Number.isInteger)) return res.status(400).json({ error: 'Invalid id' });
    if (p1 === p2) return res.status(400).json({ error: 'Two distinct players required' });

    const { owner, agg } = await loadHouse(db, ownerId);
    if (!owner) return res.status(404).json({ error: 'House owner not found' });

    const hydrate = await buildHydrator(db, [p1, p2]);
    return res.json(house.buildH2H(agg, p1, p2, hydrate));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/house/:ownerId/nemesis/:userId — worst-record opponent across sports.
router.get('/:ownerId/nemesis/:userId', async (req, res) => {
  try {
    const db = getDb();
    const ownerId = parseInt(req.params.ownerId, 10);
    const userId = parseInt(req.params.userId, 10);
    if (![ownerId, userId].every(Number.isInteger)) return res.status(400).json({ error: 'Invalid id' });

    const { owner, agg } = await loadHouse(db, ownerId);
    if (!owner) return res.status(404).json({ error: 'House owner not found' });

    // Hydrate the player plus every opponent they've faced.
    const oppIds = [userId];
    const m = agg.ledger.get(userId);
    if (m) for (const opp of m.keys()) oppIds.push(opp);
    const hydrate = await buildHydrator(db, oppIds);

    const nemesis = house.buildNemesis(agg, userId, hydrate);
    if (!nemesis) return res.json({ player: hydrate(userId), nemesis: null });
    return res.json(nemesis);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
