const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/venues
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const venues = await db.selectFrom('venues').selectAll().where('league_id', '=', req.leagueId).orderBy('name').execute();
    res.json(venues);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/venues
router.post('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { name, lat, lng } = req.body;
    if (!name) return res.status(400).json({ error: 'Venue name required' });

    const venue = await db
      .insertInto('venues')
      .values({ name, lat: lat || null, lng: lng || null, league_id: req.leagueId })
      .returningAll()
      .executeTakeFirstOrThrow();

    res.status(201).json(venue);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/venues/:id — update lat/lng
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });

    const venue = await db
      .updateTable('venues')
      .set({ lat, lng })
      .where('id', '=', parseInt(req.params.id))
      .returningAll()
      .executeTakeFirst();

    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    res.json(venue);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
