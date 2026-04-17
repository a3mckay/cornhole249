const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { ACHIEVEMENT_DEFS } = require('../lib/achievements');

// GET /api/achievements/:user_id
router.get('/:user_id', (req, res) => {
  const db = getDb();
  const earned = db.prepare(
    `SELECT achievement_key, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at ASC`
  ).all(req.params.user_id);

  const earnedKeys = new Set(earned.map((a) => a.achievement_key));

  const result = ACHIEVEMENT_DEFS.map((def) => ({
    ...def,
    earned: earnedKeys.has(def.key),
    earned_at: earned.find((a) => a.achievement_key === def.key)?.earned_at || null,
  }));

  res.json(result);
});

module.exports = router;
