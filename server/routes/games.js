const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { evaluateAchievements } = require('../lib/achievements');
const { recalculateAllElos } = require('../lib/elo');
const { fetchWeatherForGame } = require('./weather');

// played_at is stored as UTC ISO / TIMESTAMPTZ. The league plays in Hamilton, ON,
// so we convert to America/Toronto local time to determine the calendar date.
const LEAGUE_TZ = 'America/Toronto';
function utcToLocalDate(isoStr) {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: LEAGUE_TZ });
}

// GET /api/games
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { type, season, venue_id, user_id, date, page = 1, limit = 20 } = req.query;

    // Build an array of WHERE fragments using sql template tags
    const conditions = [sql`g.league_id = ${req.leagueId}`];
    if (type)     conditions.push(sql`g.game_type = ${type}`);
    if (season)   conditions.push(sql`g.season = ${parseInt(season)}`);
    if (venue_id) conditions.push(sql`g.venue_id = ${parseInt(venue_id)}`);
    if (user_id)  conditions.push(sql`g.id IN (SELECT game_id FROM game_participants WHERE user_id = ${parseInt(user_id)})`);

    let dateFilter = null;
    if (date) {
      dateFilter = date;
      const [y, m, d] = date.split('-').map(Number);
      const startUtc = new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString();
      const endUtc   = new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString();
      conditions.push(sql`g.played_at >= ${startUtc} AND g.played_at < ${endUtc}`);
    }

    const where = sql.join(conditions, sql` AND `);

    let games, total;
    if (dateFilter) {
      const { rows } = await sql`
        SELECT g.*, v.name as venue_name
        FROM games g LEFT JOIN venues v ON g.venue_id = v.id
        WHERE ${where}
        ORDER BY g.played_at DESC
      `.execute(db);
      const filtered = rows.filter((r) => utcToLocalDate(r.played_at) === dateFilter);
      total = filtered.length;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      games = filtered.slice(offset, offset + parseInt(limit));
    } else {
      const { rows: countRows } = await sql`SELECT COUNT(*) as c FROM games g WHERE ${where}`.execute(db);
      total = parseInt(countRows[0].c);
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const { rows } = await sql`
        SELECT g.*, v.name as venue_name
        FROM games g LEFT JOIN venues v ON g.venue_id = v.id
        WHERE ${where}
        ORDER BY g.played_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `.execute(db);
      games = rows;
    }

    // Attach participants and comments
    await Promise.all(games.map(async (game) => {
      const { rows: parts } = await sql`
        SELECT gp.*, u.display_name, u.nickname, u.avatar_url
        FROM game_participants gp JOIN users u ON gp.user_id = u.id
        WHERE gp.game_id = ${game.id}
        ORDER BY gp.team, gp.id
      `.execute(db);
      game.participants = parts;

      if (game.weather_json) {
        try { game.weather = JSON.parse(game.weather_json); } catch (e) { game.weather = null; }
      }

      const { rows: latestRows } = await sql`
        SELECT c.body, u.display_name FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.game_id = ${game.id} ORDER BY c.created_at DESC LIMIT 1
      `.execute(db);
      game.latest_comment = latestRows[0] || null;
    }));

    res.json({ games, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/dates — distinct YYYY-MM-DD dates in league local time
router.get('/dates', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`SELECT played_at FROM games WHERE league_id = ${req.leagueId}`.execute(db);
    const dates = new Set();
    for (const row of rows) {
      const local = utcToLocalDate(row.played_at);
      if (local) dates.add(local);
    }
    res.json([...dates].sort());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/:id
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { rows: gameRows } = await sql`
      SELECT g.*, v.name as venue_name, v.lat as venue_lat, v.lng as venue_lng
      FROM games g LEFT JOIN venues v ON g.venue_id = v.id
      WHERE g.id = ${parseInt(req.params.id)}
    `.execute(db);

    const game = gameRows[0];
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const { rows: parts } = await sql`
      SELECT gp.*, u.display_name, u.nickname, u.avatar_url
      FROM game_participants gp JOIN users u ON gp.user_id = u.id
      WHERE gp.game_id = ${game.id}
      ORDER BY gp.team, gp.id
    `.execute(db);
    game.participants = parts;

    const { rows: comments } = await sql`
      SELECT c.*, u.display_name, u.nickname, u.avatar_url
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.game_id = ${game.id}
      ORDER BY c.created_at ASC
    `.execute(db);
    game.comments = comments;

    if (game.weather_json) {
      try { game.weather = JSON.parse(game.weather_json); } catch (e) { game.weather = null; }
    }

    res.json(game);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games
router.post('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { game_type, played_at, season, venue_id, team1, team2 } = req.body;

    if (!game_type || !['1v1', '2v2'].includes(game_type)) {
      return res.status(400).json({ error: 'Invalid game_type' });
    }
    if (!team1 || !team2 || !Array.isArray(team1) || !Array.isArray(team2)) {
      return res.status(400).json({ error: 'team1 and team2 required as arrays' });
    }

    const t1Ids = team1.map((p) => p.user_id);
    const t2Ids = team2.map((p) => p.user_id);
    if (t1Ids.filter((id) => t2Ids.includes(id)).length > 0) {
      return res.status(400).json({ error: 'A player cannot be on both teams' });
    }

    // Reject frozen participants — their access to this league is limited
    const allParticipantIds = [...t1Ids, ...t2Ids];
    const frozenMembers = await db
      .selectFrom('league_memberships as lm')
      .innerJoin('users as u', 'u.id', 'lm.user_id')
      .select(['u.display_name'])
      .where('lm.league_id', '=', req.leagueId)
      .where('lm.user_id', 'in', allParticipantIds)
      .where('lm.frozen_at', 'is not', null)
      .execute();
    if (frozenMembers.length > 0) {
      const names = frozenMembers.map((m) => m.display_name).join(', ');
      return res.status(403).json({ error: `${names} cannot participate — their access to this league is limited.` });
    }

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

    // Insert game
    const newGame = await db
      .insertInto('games')
      .values({
        game_type,
        played_at: gameDate.toISOString(),
        season: gameSeason,
        venue_id: venue_id || null,
        submitted_by_user_id: req.session.userId,
        league_id: req.leagueId,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const gameId = newGame.id;

    // Insert participants
    for (const p of team1) {
      await db.insertInto('game_participants').values({
        game_id: gameId, user_id: p.user_id, team: 1,
        score: p.score || 0, is_winner: isTeam1Winner ? 1 : 0,
      }).execute();
    }
    for (const p of team2) {
      await db.insertInto('game_participants').values({
        game_id: gameId, user_id: p.user_id, team: 2,
        score: p.score || 0, is_winner: isTeam1Winner ? 0 : 1,
      }).execute();
    }

    // Update Elos
    await updateElosAfterGame(gameId, db);

    // Fetch weather (non-blocking)
    if (venue_id) {
      const venue = await db.selectFrom('venues').select(['lat', 'lng']).where('id', '=', venue_id).executeTakeFirst();
      if (venue && venue.lat && venue.lng) {
        fetchWeatherForGame(venue.lat, venue.lng, gameDate.toISOString())
          .then(async (weather) => {
            if (weather) {
              await db.updateTable('games').set({ weather_json: JSON.stringify(weather) }).where('id', '=', gameId).execute();
            }
          })
          .catch(() => {});
      }
    }

    // Evaluate achievements (non-blocking)
    evaluateAchievements(gameId).catch((e) => console.warn('[Achievements]', e.message));

    const { rows: gameRows } = await sql`SELECT * FROM games WHERE id = ${gameId}`.execute(db);
    res.status(201).json(gameRows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/games/:id (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const gameId = parseInt(req.params.id);

    const game = await db.selectFrom('games').selectAll().where('id', '=', gameId).executeTakeFirst();
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const { played_at, venue_id, game_type, t1_score, t2_score } = req.body;
    const updates = {};

    if (played_at !== undefined) updates.played_at = played_at;
    if (venue_id !== undefined) updates.venue_id = venue_id || null;
    if (game_type !== undefined) updates.game_type = game_type;

    if (Object.keys(updates).length) {
      await db.updateTable('games').set(updates).where('id', '=', gameId).execute();
    }

    // Update scores if provided
    if (t1_score !== undefined && t2_score !== undefined) {
      const s1 = parseInt(t1_score);
      const s2 = parseInt(t2_score);
      if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
        return res.status(400).json({ error: 'Scores must be non-negative integers' });
      }
      if (s1 > 10 || s2 > 10) return res.status(400).json({ error: 'Maximum score is 10 (Hamilton rules)' });
      if (s1 === s2) return res.status(400).json({ error: 'Games cannot end in a tie' });

      const t1Won = s1 > s2;
      await db.updateTable('game_participants')
        .set({ score: s1, is_winner: t1Won ? 1 : 0 })
        .where('game_id', '=', gameId)
        .where('team', '=', 1)
        .execute();
      await db.updateTable('game_participants')
        .set({ score: s2, is_winner: t1Won ? 0 : 1 })
        .where('game_id', '=', gameId)
        .where('team', '=', 2)
        .execute();

      await updateElosAfterGame(gameId, db);
    }

    const updated = await db.selectFrom('games').selectAll().where('id', '=', gameId).executeTakeFirstOrThrow();

    const venueChanged = venue_id !== undefined && (venue_id || null) !== (game.venue_id || null);
    const dateChanged = played_at !== undefined && played_at !== game.played_at;
    if (venueChanged || dateChanged) {
      if (updated.venue_id) {
        const venue = await db.selectFrom('venues').select(['lat', 'lng']).where('id', '=', updated.venue_id).executeTakeFirst();
        if (venue && venue.lat && venue.lng) {
          await db.updateTable('games').set({ weather_json: null }).where('id', '=', gameId).execute();
          fetchWeatherForGame(venue.lat, venue.lng, updated.played_at)
            .then(async (weather) => {
              if (weather) {
                await db.updateTable('games').set({ weather_json: JSON.stringify(weather) }).where('id', '=', gameId).execute();
              }
            })
            .catch(() => {});
        }
      } else {
        await db.updateTable('games').set({ weather_json: null }).where('id', '=', gameId).execute();
      }
    }

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/games/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    await db.deleteFrom('games').where('id', '=', parseInt(req.params.id)).execute();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function updateElosAfterGame(gameId, db) {
  const { rows: games } = await sql`SELECT * FROM games ORDER BY played_at ASC`.execute(db);
  const { rows: participants } = await sql`SELECT * FROM game_participants`.execute(db);
  const newElos = recalculateAllElos(games, participants);

  await db.transaction().execute(async (trx) => {
    for (const [userId, elo] of Object.entries(newElos)) {
      await trx.updateTable('users').set({ elo_rating: elo }).where('id', '=', parseInt(userId)).execute();
    }
  });
}

module.exports = router;
