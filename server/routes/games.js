const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { evaluateAchievements } = require('../lib/achievements');
const { recalculateAllElos } = require('../lib/elo');
const { fetchWeatherForGame } = require('./weather');

// GET /api/games
router.get('/', (req, res) => {
  const db = getDb();
  const { type, season, venue_id, user_id, page = 1, limit = 20 } = req.query;

  let where = [];
  let params = [];

  if (type) { where.push('g.game_type = ?'); params.push(type); }
  if (season) { where.push('g.season = ?'); params.push(parseInt(season)); }
  if (venue_id) { where.push('g.venue_id = ?'); params.push(parseInt(venue_id)); }
  if (user_id) {
    where.push(`g.id IN (SELECT game_id FROM game_participants WHERE user_id = ?)`);
    params.push(parseInt(user_id));
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as c FROM games g ${whereStr}`).get(...params).c;
  const games = db.prepare(
    `SELECT g.*, v.name as venue_name
     FROM games g
     LEFT JOIN venues v ON g.venue_id = v.id
     ${whereStr}
     ORDER BY g.played_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, parseInt(limit), offset);

  // Attach participants
  for (const game of games) {
    game.participants = db.prepare(
      `SELECT gp.*, u.display_name, u.nickname, u.avatar_url
       FROM game_participants gp
       JOIN users u ON gp.user_id = u.id
       WHERE gp.game_id = ?
       ORDER BY gp.team, gp.id`
    ).all(game.id);
    if (game.weather_json) {
      try { game.weather = JSON.parse(game.weather_json); } catch(e) { game.weather = null; }
    }
    // Latest comment
    game.latest_comment = db.prepare(
      `SELECT c.body, u.display_name FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.game_id = ? ORDER BY c.created_at DESC LIMIT 1`
    ).get(game.id);
  }

  res.json({ games, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/games/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const game = db.prepare(
    `SELECT g.*, v.name as venue_name, v.lat as venue_lat, v.lng as venue_lng
     FROM games g
     LEFT JOIN venues v ON g.venue_id = v.id
     WHERE g.id = ?`
  ).get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  game.participants = db.prepare(
    `SELECT gp.*, u.display_name, u.nickname, u.avatar_url
     FROM game_participants gp
     JOIN users u ON gp.user_id = u.id
     WHERE gp.game_id = ?
     ORDER BY gp.team, gp.id`
  ).all(game.id);

  game.comments = db.prepare(
    `SELECT c.*, u.display_name, u.nickname, u.avatar_url
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.game_id = ?
     ORDER BY c.created_at ASC`
  ).all(game.id);

  if (game.weather_json) {
    try { game.weather = JSON.parse(game.weather_json); } catch(e) { game.weather = null; }
  }

  res.json(game);
});

// POST /api/games
router.post('/', requireAuth, async (req, res) => {
  const db = getDb();
  const { game_type, played_at, season, venue_id, team1, team2, notes } = req.body;

  // Validation
  if (!game_type || !['1v1', '2v2'].includes(game_type)) {
    return res.status(400).json({ error: 'Invalid game_type' });
  }
  if (!team1 || !team2 || !Array.isArray(team1) || !Array.isArray(team2)) {
    return res.status(400).json({ error: 'team1 and team2 required as arrays' });
  }

  const t1Ids = team1.map((p) => p.user_id);
  const t2Ids = team2.map((p) => p.user_id);

  // No player on both teams
  const overlap = t1Ids.filter((id) => t2Ids.includes(id));
  if (overlap.length > 0) {
    return res.status(400).json({ error: 'A player cannot be on both teams' });
  }

  // Validate scores — use team score from first player (all players on a team share the same score)
  const t1Score = team1[0]?.score ?? 0;
  const t2Score = team2[0]?.score ?? 0;

  if (team1.some((p) => (p.score || 0) < 0) || team2.some((p) => (p.score || 0) < 0)) {
    return res.status(400).json({ error: 'Scores must be non-negative' });
  }
  if (team1.some((p) => (p.score || 0) > 99) || team2.some((p) => (p.score || 0) > 99)) {
    return res.status(400).json({ error: 'Score seems too high' });
  }
  if (t1Score === t2Score) {
    return res.status(400).json({ error: 'Games cannot end in a tie' });
  }

  const gameDate = played_at ? new Date(played_at) : new Date();
  const gameSeason = season || gameDate.getFullYear();
  const isTeam1Winner = t1Score > t2Score;

  const insertGame = db.prepare(
    `INSERT INTO games (game_type, played_at, season, venue_id, submitted_by_user_id)
     VALUES (?, ?, ?, ?, ?)`
  );
  const gameResult = insertGame.run(
    game_type,
    gameDate.toISOString(),
    gameSeason,
    venue_id || null,
    req.session.userId
  );
  const gameId = gameResult.lastInsertRowid;

  // Insert participants
  const insertParticipant = db.prepare(
    `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, ?, ?)`
  );

  for (const p of team1) {
    insertParticipant.run(gameId, p.user_id, 1, p.score || 0, isTeam1Winner ? 1 : 0);
  }
  for (const p of team2) {
    insertParticipant.run(gameId, p.user_id, 2, p.score || 0, isTeam1Winner ? 0 : 1);
  }

  // Update Elos
  updateElosAfterGame(gameId, db);

  // Fetch weather (non-blocking)
  if (venue_id) {
    const venue = db.prepare(`SELECT lat, lng FROM venues WHERE id = ?`).get(venue_id);
    if (venue && venue.lat && venue.lng) {
      fetchWeatherForGame(venue.lat, venue.lng, gameDate.toISOString())
        .then((weather) => {
          if (weather) {
            db.prepare(`UPDATE games SET weather_json = ? WHERE id = ?`).run(
              JSON.stringify(weather),
              gameId
            );
          }
        })
        .catch(() => {});
    }
  }

  // Evaluate achievements
  try {
    evaluateAchievements(gameId);
  } catch (e) {
    console.warn('[Achievements] Error:', e.message);
  }

  const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId);
  res.status(201).json(game);
});

// PATCH /api/games/:id (admin only)
router.patch('/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { played_at, venue_id, game_type, t1_score, t2_score } = req.body;
  const updates = [];
  const values = [];

  if (played_at !== undefined) { updates.push('played_at = ?'); values.push(played_at); }
  if (venue_id !== undefined) { updates.push('venue_id = ?'); values.push(venue_id || null); }
  if (game_type !== undefined) { updates.push('game_type = ?'); values.push(game_type); }

  if (updates.length) {
    values.push(req.params.id);
    db.prepare(`UPDATE games SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  // Update scores if provided
  if (t1_score !== undefined && t2_score !== undefined) {
    const s1 = parseInt(t1_score);
    const s2 = parseInt(t2_score);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      return res.status(400).json({ error: 'Scores must be non-negative integers' });
    }
    if (s1 > 10 || s2 > 10) {
      return res.status(400).json({ error: 'Maximum score is 10 (Hamilton rules)' });
    }
    if (s1 === s2) {
      return res.status(400).json({ error: 'Games cannot end in a tie' });
    }
    const t1Won = s1 > s2;
    db.prepare(`UPDATE game_participants SET score = ?, is_winner = ? WHERE game_id = ? AND team = 1`)
      .run(s1, t1Won ? 1 : 0, req.params.id);
    db.prepare(`UPDATE game_participants SET score = ?, is_winner = ? WHERE game_id = ? AND team = 2`)
      .run(s2, t1Won ? 0 : 1, req.params.id);
    // Recalculate all Elos after score change
    updateElosAfterGame(req.params.id, db);
  }

  const updated = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
  res.json(updated);
});

// DELETE /api/games/:id (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare(`DELETE FROM games WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

function updateElosAfterGame(gameId, db) {
  const { recalculateAllElos } = require('../lib/elo');
  const games = db.prepare(`SELECT * FROM games ORDER BY played_at ASC`).all();
  const participants = db.prepare(`SELECT * FROM game_participants`).all();
  const newElos = recalculateAllElos(games, participants);

  const updateElo = db.prepare(`UPDATE users SET elo_rating = ? WHERE id = ?`);
  const updateMany = db.transaction((elos) => {
    for (const [userId, elo] of Object.entries(elos)) {
      updateElo.run(elo, parseInt(userId));
    }
  });
  updateMany(newElos);
}

module.exports = router;
