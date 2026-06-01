const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { ACHIEVEMENT_DEFS } = require('../lib/achievements');

// GET /api/achievements/:user_id
router.get('/:user_id', async (req, res) => {
  try {
    const db = getDb();
    const earned = await db
      .selectFrom('achievements')
      .select(['achievement_key', 'earned_at'])
      .where('user_id', '=', parseInt(req.params.user_id))
      .where('league_id', '=', req.leagueId)
      .orderBy('earned_at')
      .execute();

    const earnedKeys = new Set(earned.map((a) => a.achievement_key));

    const result = ACHIEVEMENT_DEFS.map((def) => ({
      ...def,
      earned: earnedKeys.has(def.key),
      earned_at: earned.find((a) => a.achievement_key === def.key)?.earned_at || null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
