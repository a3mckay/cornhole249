const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /auth/me — return current session user
router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  const db = getDb();
  const user = db.prepare(
    `SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating FROM users WHERE id = ?`
  ).get(req.session.userId);
  res.json(user || null);
});

// POST /auth/login — fake one-click login
router.post('/login', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const db = getDb();
  const user = db.prepare(
    `SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating FROM users WHERE id = ?`
  ).get(user_id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  req.session.userId = user.id;
  req.session.isAdmin = user.is_admin === 1;
  res.json(user);
});

// POST /auth/register — create account with a valid join code
router.post('/register', (req, res) => {
  const { code, display_name } = req.body;
  if (!code || !display_name?.trim()) {
    return res.status(400).json({ error: 'code and display_name required' });
  }

  const db = getDb();
  const joinCode = db.prepare(`SELECT * FROM join_codes WHERE code = ?`).get(code.trim().toUpperCase());
  if (!joinCode) return res.status(400).json({ error: 'Invalid join code' });
  if (joinCode.used_by) return res.status(400).json({ error: 'Join code already used' });

  const name = display_name.trim();
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;

  const result = db.prepare(
    `INSERT INTO users (display_name, avatar_url, is_admin, elo_rating) VALUES (?, ?, 0, 1000)`
  ).run(name, avatarUrl);

  const userId = result.lastInsertRowid;

  // Mark code as used
  db.prepare(`UPDATE join_codes SET used_by = ?, used_at = datetime('now') WHERE code = ?`)
    .run(userId, joinCode.code);

  const user = db.prepare(
    `SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating FROM users WHERE id = ?`
  ).get(userId);

  req.session.userId = user.id;
  req.session.isAdmin = false;
  res.status(201).json(user);
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

module.exports = router;
