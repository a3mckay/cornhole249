const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/trash-talk
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: countRows } = await sql`SELECT COUNT(*) as c FROM trash_talk WHERE league_id = ${req.leagueId}`.execute(db);
    const total = parseInt(countRows[0].c);

    const { rows: posts } = await sql`
      SELECT tt.*, u.display_name, u.nickname, u.avatar_url
      FROM trash_talk tt
      JOIN users u ON tt.user_id = u.id
      WHERE tt.league_id = ${req.leagueId}
      ORDER BY tt.created_at DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `.execute(db);

    // Most commented games this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { rows: hotGames } = await sql`
      SELECT c.game_id, COUNT(*) as comment_count, g.played_at, g.game_type
      FROM comments c
      JOIN games g ON c.game_id = g.id
      WHERE c.league_id = ${req.leagueId} AND c.created_at >= ${weekAgo}
      GROUP BY c.game_id, g.played_at, g.game_type
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `.execute(db);

    res.json({ posts, total, hot_games: hotGames });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/trash-talk
router.post('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Post body required' });
    if (body.length > 280) return res.status(400).json({ error: 'Post too long (max 280 chars)' });

    const inserted = await db
      .insertInto('trash_talk')
      .values({ user_id: req.session.userId, body: body.trim(), league_id: req.leagueId })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const { rows } = await sql`
      SELECT tt.*, u.display_name, u.nickname, u.avatar_url
      FROM trash_talk tt JOIN users u ON tt.user_id = u.id
      WHERE tt.id = ${inserted.id}
    `.execute(db);

    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/trash-talk/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const post = await db
      .selectFrom('trash_talk')
      .selectAll()
      .where('id', '=', parseInt(req.params.id))
      .executeTakeFirst();
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isOwn = post.user_id === req.session.userId;
    const isAdmin = req.session.isAdmin;
    if (!isOwn && !isAdmin) {
      return res.status(403).json({ error: "Cannot delete another user's post" });
    }

    await db.deleteFrom('trash_talk').where('id', '=', parseInt(req.params.id)).execute();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
