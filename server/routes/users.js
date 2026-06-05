const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT u.id, u.display_name, u.nickname, u.avatar_url, u.is_admin, u.elo_rating, u.handedness,
             (u.pin IS NOT NULL)::int as has_pin, lm.frozen_at
      FROM users u
      JOIN league_memberships lm ON lm.user_id = u.id AND lm.league_id = ${req.leagueId}
      ORDER BY u.display_name
    `.execute(db);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/:id — full profile + career stats
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.id);

    const user = await db
      .selectFrom('users')
      .select(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'handedness', 'created_at'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Career stats
    const { rows: statsRows } = await sql`
      SELECT
        COUNT(*) as gp,
        SUM(is_winner) as wins,
        COUNT(*) - SUM(is_winner) as losses
      FROM game_participants WHERE user_id = ${userId}
    `.execute(db);
    const stats = statsRows[0];

    // Point differential (MAX avoids double-counting 2v2)
    const { rows: diffRows } = await sql`
      SELECT SUM(gp.score - opp.total_score) as plus_minus
      FROM game_participants gp
      JOIN (
        SELECT game_id, team, MAX(score) as total_score
        FROM game_participants GROUP BY game_id, team
      ) opp ON opp.game_id = gp.game_id AND opp.team != gp.team
      WHERE gp.user_id = ${userId}
    `.execute(db);
    const diff = diffRows[0];

    // Best/worst streak
    const { rows: allGames } = await sql`
      SELECT gp.is_winner
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE gp.user_id = ${userId}
      ORDER BY g.played_at ASC
    `.execute(db);

    let bestStreak = 0, worstStreak = 0;
    let curW = 0, curL = 0;
    for (const g of allGames) {
      if (g.is_winner) { curW++; curL = 0; }
      else { curL++; curW = 0; }
      if (curW > bestStreak) bestStreak = curW;
      if (curL > worstStreak) worstStreak = curL;
    }

    // Season breakdown
    const { rows: seasons } = await sql`
      SELECT g.season,
        COUNT(*) as gp,
        SUM(gp.is_winner) as wins,
        COUNT(*) - SUM(gp.is_winner) as losses
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE gp.user_id = ${userId}
      GROUP BY g.season
      ORDER BY g.season DESC
    `.execute(db);

    const gp = parseInt(stats.gp) || 0;
    const wins = parseInt(stats.wins) || 0;
    const losses = parseInt(stats.losses) || 0;

    res.json({
      ...user,
      career: {
        gp,
        wins,
        losses,
        win_pct: gp > 0 ? Math.round((wins / gp) * 100) / 100 : 0,
        plus_minus: diff.plus_minus || 0,
        best_streak: bestStreak,
        worst_streak: worstStreak,
      },
      seasons: seasons.map((s) => ({
        ...s,
        gp: parseInt(s.gp),
        wins: parseInt(s.wins),
        losses: parseInt(s.losses),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/users/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id);
    const isOwn = req.session.userId === targetId;
    const isAdmin = req.session.isAdmin;

    if (!isOwn && !isAdmin) {
      return res.status(403).json({ error: "Cannot edit another user's profile" });
    }

    const { display_name, nickname, avatar_url, handedness } = req.body;
    const updates = {};

    if (display_name !== undefined) {
      if (!display_name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      updates.display_name = display_name.trim();
    }
    if (nickname !== undefined) updates.nickname = nickname || null;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url || null;
    if (handedness !== undefined) {
      if (!['right', 'left'].includes(handedness)) {
        return res.status(400).json({ error: 'handedness must be right or left' });
      }
      updates.handedness = handedness;
    }

    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });

    const updated = await db
      .updateTable('users')
      .set(updates)
      .where('id', '=', targetId)
      .returning(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'handedness'])
      .executeTakeFirstOrThrow();

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/users/:id (admin only, cannot delete yourself)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id);

    if (!req.session.isAdmin) return res.status(403).json({ error: 'Admin required' });
    if (req.session.userId === targetId) return res.status(400).json({ error: 'Cannot delete your own account' });

    const user = await db.selectFrom('users').select(['id']).where('id', '=', targetId).executeTakeFirst();
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.deleteFrom('users').where('id', '=', targetId).execute();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
