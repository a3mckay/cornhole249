const express = require('express');
const router = express.Router();
const { calculateOdds } = require('../lib/odds');

// POST /api/odds
router.post('/', async (req, res) => {
  try {
    const { team1, team2 } = req.body;
    if (!team1 || !team2 || !Array.isArray(team1) || !Array.isArray(team2)) {
      return res.status(400).json({ error: 'team1 and team2 arrays required' });
    }
    if (!team1.length || !team2.length) {
      return res.status(400).json({ error: 'Teams must have at least one player' });
    }

    const result = await calculateOdds(team1, team2);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
