const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');

// POST /api/admin/fix-games — TEMPORARY: fix game IDs and scores
router.post('/fix-games', requireAdmin, (req, res) => {
  const db = getDb();

  // Remap game IDs 111->1, 112->2 and fix scores
  // Game 111: Cat won 11-3, Game 112: Andrew won 11-0
  // First update game_participants scores, then remap IDs

  // Get current games to find player IDs
  const games = db.prepare(`SELECT * FROM games ORDER BY id`).all();
  const participants = db.prepare(`SELECT * FROM game_participants ORDER BY game_id, team`).all();

  // Update scores for game IDs 111 and 112
  // We need to know which team won each game
  // Game 111: winner score=11, loser score=3
  // Game 112: winner score=11, loser score=0
  const scoreMap = {
    [games[0]?.id]: { winnerScore: 11, loserScore: 3 },
    [games[1]?.id]: { winnerScore: 11, loserScore: 0 },
  };

  for (const [gameId, scores] of Object.entries(scoreMap)) {
    if (!gameId || gameId === 'undefined') continue;
    db.prepare(`UPDATE game_participants SET score = ? WHERE game_id = ? AND is_winner = 1`).run(scores.winnerScore, parseInt(gameId));
    db.prepare(`UPDATE game_participants SET score = ? WHERE game_id = ? AND is_winner = 0`).run(scores.loserScore, parseInt(gameId));
  }

  // Reset sqlite_sequence and remap IDs
  // Temporarily disable foreign keys to remap
  db.pragma('foreign_keys = OFF');
  games.forEach((g, i) => {
    const newId = i + 1;
    if (g.id !== newId) {
      db.prepare(`UPDATE game_participants SET game_id = ? WHERE game_id = ?`).run(newId, g.id);
      db.prepare(`UPDATE games SET id = ? WHERE id = ?`).run(newId, g.id);
    }
  });
  db.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = 'games'`).run(games.length);
  db.pragma('foreign_keys = ON');

  res.json({ ok: true, message: `Fixed ${games.length} games` });
});

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(`SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating, created_at FROM users ORDER BY display_name`).all();
  res.json(users);
});

// PATCH /api/admin/users/:id/admin
router.patch('/users/:id/admin', requireAdmin, (req, res) => {
  const db = getDb();
  const targetId = parseInt(req.params.id);

  // Can't revoke own admin
  if (targetId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot modify your own admin status' });
  }

  const { is_admin } = req.body;
  db.prepare(`UPDATE users SET is_admin = ? WHERE id = ?`).run(is_admin ? 1 : 0, targetId);
  const user = db.prepare(`SELECT id, display_name, is_admin FROM users WHERE id = ?`).get(targetId);
  res.json(user);
});

// GET /api/admin/join-codes
router.get('/join-codes', requireAdmin, (req, res) => {
  const db = getDb();
  const codes = db.prepare(`
    SELECT jc.code, jc.created_at, jc.used_at,
      cb.display_name as created_by_name,
      ub.display_name as used_by_name
    FROM join_codes jc
    LEFT JOIN users cb ON cb.id = jc.created_by
    LEFT JOIN users ub ON ub.id = jc.used_by
    ORDER BY jc.created_at DESC
  `).all();
  res.json(codes);
});

// POST /api/admin/join-codes — generate a new code
router.post('/join-codes', requireAdmin, (req, res) => {
  const db = getDb();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0,O,1,I)
  let code;
  // Ensure uniqueness
  do {
    code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (db.prepare(`SELECT 1 FROM join_codes WHERE code = ?`).get(code));

  db.prepare(`INSERT INTO join_codes (code, created_by) VALUES (?, ?)`).run(code, req.session.userId);
  res.status(201).json({ code });
});

// DELETE /api/admin/join-codes/:code — revoke an unused code
router.delete('/join-codes/:code', requireAdmin, (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM join_codes WHERE code = ?`).get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Code not found' });
  if (row.used_by) return res.status(400).json({ error: 'Cannot revoke an already-used code' });
  db.prepare(`DELETE FROM join_codes WHERE code = ?`).run(req.params.code);
  res.json({ ok: true });
});

// DELETE /api/admin/games — bulk delete by date range
router.delete('/games', requireAdmin, (req, res) => {
  const db = getDb();
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

  const result = db.prepare(
    `DELETE FROM games WHERE played_at >= ? AND played_at <= ?`
  ).run(from, to);

  res.json({ deleted: result.changes });
});

module.exports = router;
