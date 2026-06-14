const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/games/:id/comments
router.post('/games/:id/comments', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body required' });
    if (body.length > 500) return res.status(400).json({ error: 'Comment too long (max 500 chars)' });

    // Must be a member of this league (and not frozen)
    const membership = await db
      .selectFrom('league_memberships')
      .select(['frozen_at'])
      .where('league_id', '=', req.leagueId)
      .where('user_id', '=', req.session.userId)
      .executeTakeFirst();
    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this league.' });
    }
    if (membership.frozen_at) {
      return res.status(403).json({ error: 'Your access to this league is limited. Ask the league owner to re-upgrade to Pro.' });
    }

    const game = await db
      .selectFrom('games')
      .select(['id'])
      .where('id', '=', parseInt(req.params.id))
      .executeTakeFirst();
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const inserted = await db
      .insertInto('comments')
      .values({ game_id: parseInt(req.params.id), user_id: req.session.userId, body: body.trim(), league_id: req.leagueId })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const { rows } = await sql`
      SELECT c.*, u.display_name, u.nickname, u.avatar_url
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.id = ${inserted.id}
    `.execute(db);

    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/comments/:id
router.delete('/comments/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const comment = await db
      .selectFrom('comments')
      .selectAll()
      .where('id', '=', parseInt(req.params.id))
      .executeTakeFirst();
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const isOwn = comment.user_id === req.session.userId;
    const isAdmin = req.session.isAdmin;
    if (!isOwn && !isAdmin) {
      return res.status(403).json({ error: "Cannot delete another user's comment" });
    }

    await db.deleteFrom('comments').where('id', '=', parseInt(req.params.id)).execute();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
