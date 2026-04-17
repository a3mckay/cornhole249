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

// POST /auth/login
router.post('/login', (req, res) => {
  const { user_id, pin } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const db = getDb();
  const user = db.prepare(
    `SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating, pin FROM users WHERE id = ?`
  ).get(user_id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.pin) {
    if (!pin) return res.status(401).json({ error: 'pin_required' });
    if (pin !== user.pin) return res.status(401).json({ error: 'Incorrect PIN' });
  }

  req.session.userId = user.id;
  req.session.isAdmin = user.is_admin === 1;
  const { pin: _pin, ...safeUser } = user;
  res.json(safeUser);
});

// POST /auth/set-pin — set or update own PIN
router.post('/set-pin', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { pin } = req.body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }
  const db = getDb();
  db.prepare(`UPDATE users SET pin = ? WHERE id = ?`).run(pin, req.session.userId);
  res.json({ ok: true });
});

// POST /auth/register — create account with a valid join code
router.post('/register', (req, res) => {
  const { code, display_name, pin } = req.body;
  if (!code || !display_name?.trim()) {
    return res.status(400).json({ error: 'code and display_name required' });
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }

  const db = getDb();
  const joinCode = db.prepare(`SELECT * FROM join_codes WHERE code = ?`).get(code.trim().toUpperCase());
  if (!joinCode) return res.status(400).json({ error: 'Invalid join code' });
  if (joinCode.used_by) return res.status(400).json({ error: 'Join code already used' });

  const name = display_name.trim();
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;

  const result = db.prepare(
    `INSERT INTO users (display_name, avatar_url, is_admin, elo_rating, pin) VALUES (?, ?, 0, 1000, ?)`
  ).run(name, avatarUrl, pin);

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
