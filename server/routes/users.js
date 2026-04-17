const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/users
router.get('/', (req, res) => {
  const db = getDb();
  const users = db.prepare(
    `SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating, handedness, (pin IS NOT NULL) as has_pin FROM users ORDER BY display_name`
  ).all();
  res.json(users);
});

// GET /api/users/:id — full profile + career stats
router.get('/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare(
    `SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating, handedness, created_at FROM users WHERE id = ?`
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Career stats
  const stats = db.prepare(
    `SELECT
       COUNT(*) as gp,
       SUM(is_winner) as wins,
       COUNT(*) - SUM(is_winner) as losses
     FROM game_participants WHERE user_id = ?`
  ).get(req.params.id);

  // Point differential
  const diff = db.prepare(
    `SELECT
       SUM(gp.score - opp.total_score) as plus_minus
     FROM game_participants gp
     JOIN (
       SELECT game_id, team, SUM(score) as total_score
       FROM game_participants GROUP BY game_id, team
     ) opp ON opp.game_id = gp.game_id AND opp.team != gp.team
     WHERE gp.user_id = ?`
  ).get(req.params.id);

  // Best/worst streak
  const allGames = db.prepare(
    `SELECT gp.is_winner
     FROM game_participants gp
     JOIN games g ON gp.game_id = g.id
     WHERE gp.user_id = ?
     ORDER BY g.played_at ASC`
  ).all(req.params.id);

  let bestStreak = 0, worstStreak = 0;
  let curW = 0, curL = 0;
  for (const g of allGames) {
    if (g.is_winner) { curW++; curL = 0; }
    else { curL++; curW = 0; }
    if (curW > bestStreak) bestStreak = curW;
    if (curL > worstStreak) worstStreak = curL;
  }

  // Season breakdown
  const seasons = db.prepare(
    `SELECT g.season,
       COUNT(*) as gp,
       SUM(gp.is_winner) as wins,
       COUNT(*) - SUM(gp.is_winner) as losses
     FROM game_participants gp
     JOIN games g ON gp.game_id = g.id
     WHERE gp.user_id = ?
     GROUP BY g.season
     ORDER BY g.season DESC`
  ).all(req.params.id);

  res.json({
    ...user,
    career: {
      gp: stats.gp || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      win_pct: stats.gp > 0 ? Math.round((stats.wins / stats.gp) * 100) / 100 : 0,
      plus_minus: diff.plus_minus || 0,
      best_streak: bestStreak,
      worst_streak: worstStreak,
    },
    seasons,
  });
});

// PATCH /api/users/:id
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const targetId = parseInt(req.params.id);
  const isOwn = req.session.userId === targetId;
  const isAdmin = req.session.isAdmin;

  if (!isOwn && !isAdmin) {
    return res.status(403).json({ error: 'Cannot edit another user\'s profile' });
  }

  const { display_name, nickname, avatar_url, handedness } = req.body;
  const updates = [];
  const values = [];

  if (display_name !== undefined) {
    if (!display_name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    updates.push('display_name = ?'); values.push(display_name.trim());
  }
  if (nickname !== undefined) { updates.push('nickname = ?'); values.push(nickname || null); }
  if (avatar_url !== undefined) { updates.push('avatar_url = ?'); values.push(avatar_url || null); }
  if (handedness !== undefined) {
    if (!['right', 'left'].includes(handedness)) return res.status(400).json({ error: 'handedness must be right or left' });
    updates.push('handedness = ?'); values.push(handedness);
  }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(targetId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare(`SELECT id, display_name, nickname, avatar_url, is_admin, elo_rating, handedness FROM users WHERE id = ?`).get(targetId);
  res.json(updated);
});

// DELETE /api/users/:id (admin only, cannot delete yourself)
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const targetId = parseInt(req.params.id);

  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Admin required' });
  }
  if (req.session.userId === targetId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare(`DELETE FROM users WHERE id = ?`).run(targetId);
  res.json({ ok: true });
});

module.exports = router;
