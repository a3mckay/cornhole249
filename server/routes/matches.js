/**
 * Matches / series (ROADMAP WS-G) — a race between two FIXED sides to N game
 * wins (cornhole "best of 3", pool "race to 5", …). Sport-agnostic. Mounted at
 * /api/matches (cornhole249) and /api/l/:slug/matches (other leagues), so it
 * inherits req.leagueId the same way games do.
 *
 *   POST /            create an open match
 *   GET  /            list this league's matches (open first), with running score
 *   GET  /:id         match detail: sides, running score, rack-by-rack games
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { matchProgress, parseIds } = require('../lib/matches');

/** Hydrate a list of user ids into display fields, preserving order. */
async function hydrateUsers(db, ids) {
  if (!ids.length) return [];
  const rows = await db
    .selectFrom('users')
    .select(['id', 'display_name', 'nickname', 'avatar_url'])
    .where('id', 'in', ids)
    .execute();
  const byId = new Map(rows.map((u) => [Number(u.id), u]));
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}

// POST /api/matches — start a new (open) match between two fixed sides.
router.post('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { game_type, game_variant = null, side1, side2, target_wins, format_label = null, venue_id = null, season } = req.body;

    if (!['1v1', '2v2'].includes(game_type)) {
      return res.status(400).json({ error: 'game_type must be 1v1 or 2v2' });
    }
    if (!Array.isArray(side1) || !Array.isArray(side2)) {
      return res.status(400).json({ error: 'side1 and side2 must be arrays of user ids' });
    }
    const expected = game_type === '2v2' ? 2 : 1;
    if (side1.length !== expected || side2.length !== expected) {
      return res.status(400).json({ error: `Each side needs exactly ${expected} player(s) for ${game_type}` });
    }
    const s1 = side1.map(Number);
    const s2 = side2.map(Number);
    if (s1.some((id) => s2.includes(id))) {
      return res.status(400).json({ error: 'A player cannot be on both sides' });
    }
    const target = parseInt(target_wins);
    if (!Number.isInteger(target) || target < 1 || target > 99) {
      return res.status(400).json({ error: 'target_wins must be between 1 and 99' });
    }

    const created = await db
      .insertInto('matches')
      .values({
        league_id: req.leagueId,
        season: season || new Date().getFullYear(),
        venue_id: venue_id || null,
        game_type,
        game_variant: game_variant || null,
        side1_player_ids: JSON.stringify(s1),
        side2_player_ids: JSON.stringify(s2),
        target_wins: target,
        format_label: format_label || null,
        status: 'open',
        created_by_user_id: req.session.userId,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const match = await loadMatch(db, created.id);
    res.status(201).json(match);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/matches — this league's matches, open first then most-recent.
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const status = req.query.status; // optional 'open' | 'completed'
    let q = db.selectFrom('matches').selectAll().where('league_id', '=', req.leagueId);
    if (status === 'open' || status === 'completed') q = q.where('status', '=', status);
    const matches = await q.execute();

    // Sort open before completed, then newest first.
    matches.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const out = await Promise.all(matches.map((m) => decorateMatch(db, m)));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/matches/:id — full detail with the rack-by-rack games.
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const match = await loadMatch(db, parseInt(req.params.id));
    if (!match || match.league_id !== req.leagueId) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json(match);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** A match row + sides hydrated + running score (no games list). */
async function decorateMatch(db, m) {
  const games = await db.selectFrom('games').select(['id']).where('match_id', '=', m.id).execute();
  let withParts = [];
  if (games.length) {
    const ids = games.map((g) => g.id);
    const parts = await db
      .selectFrom('game_participants')
      .select(['game_id', 'user_id', 'is_winner'])
      .where('game_id', 'in', ids)
      .execute();
    withParts = games.map((g) => ({ ...g, participants: parts.filter((p) => p.game_id === g.id) }));
  }
  const progress = matchProgress(m, withParts);
  const [side1_players, side2_players] = await Promise.all([
    hydrateUsers(db, parseIds(m.side1_player_ids)),
    hydrateUsers(db, parseIds(m.side2_player_ids)),
  ]);
  return { ...m, side1_players, side2_players, progress };
}

/** decorateMatch + the rack-by-rack games (with their participants/players). */
async function loadMatch(db, id) {
  const m = await db.selectFrom('matches').selectAll().where('id', '=', id).executeTakeFirst();
  if (!m) return null;
  const decorated = await decorateMatch(db, m);

  const games = await db
    .selectFrom('games')
    .select(['id', 'played_at', 'game_variant'])
    .where('match_id', '=', id)
    .execute();
  games.sort((a, b) => new Date(a.played_at) - new Date(b.played_at));
  let gamesOut = [];
  if (games.length) {
    const ids = games.map((g) => g.id);
    const parts = await db
      .selectFrom('game_participants as gp')
      .innerJoin('users as u', 'u.id', 'gp.user_id')
      .select(['gp.game_id', 'gp.user_id', 'gp.team', 'gp.is_winner', 'gp.balls_remaining', 'u.display_name', 'u.nickname'])
      .where('gp.game_id', 'in', ids)
      .execute();
    gamesOut = games.map((g) => ({ ...g, participants: parts.filter((p) => p.game_id === g.id) }));
  }
  return { ...decorated, games: gamesOut };
}

module.exports = router;
