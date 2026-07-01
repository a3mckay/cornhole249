const express = require('express');
const router = express.Router();
const { calculateOdds, calculateCutthroatOdds } = require('../lib/odds');

// POST /api/odds
router.post('/', async (req, res) => {
  try {
    const { team1, team2, type } = req.body;
    if (!team1 || !team2 || !Array.isArray(team1) || !Array.isArray(team2)) {
      return res.status(400).json({ error: 'team1 and team2 arrays required' });
    }
    if (!team1.length || !team2.length) {
      return res.status(400).json({ error: 'Teams must have at least one player' });
    }

    // Cutthroat is a three-way free-for-all — return one probability per player
    // instead of a winner-vs-losers split.
    if (type === 'cutthroat') {
      const result = await calculateCutthroatOdds([...team1, ...team2], req.league?.sport);
      return res.json(result);
    }

    const result = await calculateOdds(team1, team2, req.league?.sport);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
