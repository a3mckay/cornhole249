const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/venues
router.get('/', (req, res) => {
  const db = getDb();
  const venues = db.prepare(`SELECT * FROM venues ORDER BY name`).all();
  res.json(venues);
});

// POST /api/venues
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, lat, lng } = req.body;
  if (!name) return res.status(400).json({ error: 'Venue name required' });

  const result = db.prepare(
    `INSERT INTO venues (name, lat, lng) VALUES (?, ?, ?)`
  ).run(name, lat || null, lng || null);

  const venue = db.prepare(`SELECT * FROM venues WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(venue);
});

module.exports = router;
