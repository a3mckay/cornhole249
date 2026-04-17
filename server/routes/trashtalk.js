const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/trash-talk
router.get('/', (req, res) => {
  const db = getDb();
  const { page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as c FROM trash_talk`).get().c;
  const posts = db.prepare(
    `SELECT tt.*, u.display_name, u.nickname, u.avatar_url
     FROM trash_talk tt
     JOIN users u ON tt.user_id = u.id
     ORDER BY tt.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(parseInt(limit), offset);

  // Most commented games this week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const hotGames = db.prepare(
    `SELECT c.game_id, COUNT(*) as comment_count, g.played_at, g.game_type
     FROM comments c
     JOIN games g ON c.game_id = g.id
     WHERE c.created_at >= ?
     GROUP BY c.game_id
     ORDER BY comment_count DESC
     LIMIT 5`
  ).all(weekAgo);

  res.json({ posts, total, hot_games: hotGames });
});

// POST /api/trash-talk
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Post body required' });
  if (body.length > 280) return res.status(400).json({ error: 'Post too long (max 280 chars)' });

  const result = db.prepare(
    `INSERT INTO trash_talk (user_id, body) VALUES (?, ?)`
  ).run(req.session.userId, body.trim());

  const post = db.prepare(
    `SELECT tt.*, u.display_name, u.nickname, u.avatar_url
     FROM trash_talk tt JOIN users u ON tt.user_id = u.id
     WHERE tt.id = ?`
  ).get(result.lastInsertRowid);

  res.status(201).json(post);
});

// DELETE /api/trash-talk/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare(`SELECT * FROM trash_talk WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const isOwn = post.user_id === req.session.userId;
  const isAdmin = req.session.isAdmin;
  if (!isOwn && !isAdmin) {
    return res.status(403).json({ error: 'Cannot delete another user\'s post' });
  }

  db.prepare(`DELETE FROM trash_talk WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
