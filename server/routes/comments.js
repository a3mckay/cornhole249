const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// POST /api/games/:id/comments
router.post('/games/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body required' });
  if (body.length > 500) return res.status(400).json({ error: 'Comment too long (max 500 chars)' });

  const game = db.prepare(`SELECT id FROM games WHERE id = ?`).get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const result = db.prepare(
    `INSERT INTO comments (game_id, user_id, body) VALUES (?, ?, ?)`
  ).run(req.params.id, req.session.userId, body.trim());

  const comment = db.prepare(
    `SELECT c.*, u.display_name, u.nickname, u.avatar_url
     FROM comments c JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`
  ).get(result.lastInsertRowid);

  res.status(201).json(comment);
});

// DELETE /api/comments/:id
router.delete('/comments/:id', requireAuth, (req, res) => {
  const db = getDb();
  const comment = db.prepare(`SELECT * FROM comments WHERE id = ?`).get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const isOwn = comment.user_id === req.session.userId;
  const isAdmin = req.session.isAdmin;

  if (!isOwn && !isAdmin) {
    return res.status(403).json({ error: 'Cannot delete another user\'s comment' });
  }

  db.prepare(`DELETE FROM comments WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
