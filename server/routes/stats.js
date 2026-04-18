const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/stats/rivals
router.get('/rivals', (req, res) => {
  const db = getDb();

  // Find pairs with most games
  const pairs = db.prepare(
    `SELECT
       a.user_id as p1, b.user_id as p2,
       COUNT(DISTINCT a.game_id) as games_played,
       SUM(CASE WHEN a.is_winner = 1 THEN 1 ELSE 0 END) as p1_wins,
       SUM(CASE WHEN b.is_winner = 1 THEN 1 ELSE 0 END) as p2_wins
     FROM game_participants a
     JOIN game_participants b ON a.game_id = b.game_id AND a.user_id < b.user_id
       AND a.team != b.team
     GROUP BY a.user_id, b.user_id
     HAVING games_played >= 2
     ORDER BY games_played DESC
     LIMIT 10`
  ).all();

  const result = pairs.map((pair) => {
    const p1 = db.prepare(`SELECT id, display_name, nickname, avatar_url FROM users WHERE id = ?`).get(pair.p1);
    const p2 = db.prepare(`SELECT id, display_name, nickname, avatar_url FROM users WHERE id = ?`).get(pair.p2);
    return {
      player1: p1,
      player2: p2,
      games_played: pair.games_played,
      p1_wins: pair.p1_wins,
      p2_wins: pair.p2_wins,
      win_delta: Math.abs(pair.p1_wins - pair.p2_wins),
    };
  });

  res.json(result);
});

// GET /api/stats/performers
router.get('/performers', (req, res) => {
  const db = getDb();
  const { season } = req.query;

  let seasonFilter = '';
  const params = [];
  if (season) { seasonFilter = 'AND g.season = ?'; params.push(parseInt(season)); }

  const rows = db.prepare(
    `SELECT
       gp.user_id,
       u.display_name,
       u.nickname,
       u.avatar_url,
       COUNT(*) as gp,
       SUM(gp.is_winner) as wins
     FROM game_participants gp
     JOIN games g ON gp.game_id = g.id ${seasonFilter}
     JOIN users u ON gp.user_id = u.id
     GROUP BY gp.user_id
     HAVING gp >= 1
     ORDER BY wins * 1.0 / COUNT(*) DESC`
  ).all(...params);

  const withPct = rows.map((r) => ({
    ...r,
    win_pct: Math.round((r.wins / r.gp) * 1000) / 10,
    losses: r.gp - r.wins,
  }));

  const mid = Math.ceil(withPct.length / 2);
  res.json({
    top: withPct.slice(0, Math.min(3, mid)),
    bottom: withPct.slice(Math.max(withPct.length - 3, mid)).reverse(),
  });
});

// GET /api/stats/head-to-head
router.get('/head-to-head', (req, res) => {
  const db = getDb();
  const { player1, player2 } = req.query;
  if (!player1 || !player2) return res.status(400).json({ error: 'player1 and player2 required' });

  const p1 = parseInt(player1);
  const p2 = parseInt(player2);

  // All games where both players faced each other (opposite teams)
  const games = db.prepare(
    `SELECT g.id, g.played_at, g.game_type,
       a.is_winner as p1_won, a.score as p1_score,
       b.score as p2_score
     FROM games g
     JOIN game_participants a ON a.game_id = g.id AND a.user_id = ?
     JOIN game_participants b ON b.game_id = g.id AND b.user_id = ? AND b.team != a.team
     ORDER BY g.played_at DESC`
  ).all(p1, p2);

  const p1_wins = games.filter((g) => g.p1_won).length;
  const p2_wins = games.length - p1_wins;

  const u1 = db.prepare(`SELECT id, display_name, nickname, avatar_url, elo_rating FROM users WHERE id = ?`).get(p1);
  const u2 = db.prepare(`SELECT id, display_name, nickname, avatar_url, elo_rating FROM users WHERE id = ?`).get(p2);

  res.json({
    player1: u1,
    player2: u2,
    total_games: games.length,
    p1_wins,
    p2_wins,
    last5: games.slice(0, 5),
  });
});

// GET /api/stats/weather
router.get('/weather', (req, res) => {
  const db = getDb();
  const { user_id } = req.query;

  let query = `
    SELECT
      json_extract(g.weather_json, '$.condition') as condition,
      COUNT(*) as gp,
      SUM(gp.is_winner) as wins
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE g.weather_json IS NOT NULL`;
  const params = [];
  if (user_id) { query += ` AND gp.user_id = ?`; params.push(parseInt(user_id)); }
  query += ` GROUP BY condition ORDER BY gp DESC`;

  const rows = db.prepare(query).all(...params);
  res.json(rows.map((r) => ({
    ...r,
    win_pct: r.gp > 0 ? Math.round((r.wins / r.gp) * 1000) / 10 : 0,
  })));
});

// GET /api/stats/venue
router.get('/venue', (req, res) => {
  const db = getDb();
  const { user_id } = req.query;

  let query = `
    SELECT
      v.id as venue_id,
      v.name as venue_name,
      COUNT(DISTINCT g.id) as gp,
      SUM(CASE WHEN gp.is_winner = 1 THEN 1 ELSE 0 END) as wins
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    JOIN venues v ON g.venue_id = v.id`;
  const params = [];
  if (user_id) { query += ` WHERE gp.user_id = ?`; params.push(parseInt(user_id)); }
  query += ` GROUP BY v.id ORDER BY gp DESC`;

  const rows = db.prepare(query).all(...params);
  res.json(rows.map((r) => ({
    ...r,
    win_pct: r.gp > 0 ? Math.round((r.wins / r.gp) * 1000) / 10 : 0,
  })));
});

// GET /api/stats/point-differential
router.get('/point-differential', (req, res) => {
  const db = getDb();
  const { season } = req.query;

  let seasonFilter = '';
  const params = [];
  if (season) { seasonFilter = 'AND g.season = ?'; params.push(parseInt(season)); }

  const rows = db.prepare(
    `SELECT
       gp.user_id,
       u.display_name,
       u.nickname,
       u.avatar_url,
       COUNT(*) as gp,
       AVG(gp.score - opp_team.opp_score) as avg_diff
     FROM game_participants gp
     JOIN games g ON gp.game_id = g.id ${seasonFilter}
     JOIN users u ON gp.user_id = u.id
     JOIN (
       SELECT game_id, team, SUM(score) as opp_score FROM game_participants GROUP BY game_id, team
     ) opp_team ON opp_team.game_id = gp.game_id AND opp_team.team != gp.team
     GROUP BY gp.user_id
     HAVING gp >= 1
     ORDER BY avg_diff DESC`
  ).all(...params);

  res.json(rows.map((r) => ({
    ...r,
    avg_diff: Math.round(r.avg_diff * 10) / 10,
  })));
});

// GET /api/stats/clutch
router.get('/clutch', (req, res) => {
  const db = getDb();
  const { season } = req.query;

  let seasonFilter = '';
  const params = [];
  if (season) { seasonFilter = 'AND g.season = ?'; params.push(parseInt(season)); }

  // Clutch = games decided by ≤3 points
  const rows = db.prepare(
    `SELECT
       gp.user_id,
       u.display_name,
       u.nickname,
       u.avatar_url,
       COUNT(*) as gp,
       SUM(gp.is_winner) as wins
     FROM game_participants gp
     JOIN games g ON gp.game_id = g.id ${seasonFilter}
     JOIN users u ON gp.user_id = u.id
     JOIN (
       SELECT game_id,
         ABS(SUM(CASE WHEN team=1 THEN score ELSE 0 END) - SUM(CASE WHEN team=2 THEN score ELSE 0 END)) as margin
       FROM game_participants
       GROUP BY game_id
       HAVING margin <= 3
     ) close ON close.game_id = gp.game_id
     GROUP BY gp.user_id
     HAVING gp >= 2
     ORDER BY wins * 1.0 / COUNT(*) DESC`
  ).all(...params);

  res.json(rows.map((r) => ({
    ...r,
    win_pct: r.gp > 0 ? Math.round((r.wins / r.gp) * 1000) / 10 : 0,
  })));
});

// GET /api/recap
router.get('/recap', (req, res) => {
  const db = getDb();
  const { season, week } = req.query;

  const now = new Date();
  const weekNum = week ? parseInt(week) : getWeekNumber(now);
  const yr = season ? parseInt(season) : now.getFullYear();

  const { start, end } = getWeekRange(yr, weekNum);

  const games = db.prepare(
    `SELECT g.*, v.name as venue_name
     FROM games g
     LEFT JOIN venues v ON g.venue_id = v.id
     WHERE g.played_at >= ? AND g.played_at < ?
     ORDER BY g.played_at DESC`
  ).all(start.toISOString(), end.toISOString());

  // Biggest win: largest point margin
  let biggestWin = null;
  let biggestUpset = null;
  let maxMargin = 0;

  for (const game of games) {
    const participants = db.prepare(`SELECT * FROM game_participants WHERE game_id = ?`).all(game.id);
    const t1Score = participants.filter(p => p.team === 1).reduce((s, p) => s + p.score, 0);
    const t2Score = participants.filter(p => p.team === 2).reduce((s, p) => s + p.score, 0);
    const margin = Math.abs(t1Score - t2Score);
    if (margin > maxMargin) {
      maxMargin = margin;
      biggestWin = { ...game, margin, t1Score, t2Score };
    }
  }

  // Most active commenter
  const topCommenter = db.prepare(
    `SELECT u.display_name, COUNT(*) as count
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.created_at >= ? AND c.created_at < ?
     GROUP BY c.user_id
     ORDER BY count DESC LIMIT 1`
  ).get(start.toISOString(), end.toISOString());

  // Player of the week (best win% this week, min 2 games)
  const potw = db.prepare(
    `SELECT u.display_name, u.nickname, COUNT(*) as gp, SUM(gp.is_winner) as wins
     FROM game_participants gp
     JOIN games g ON gp.game_id = g.id
     JOIN users u ON gp.user_id = u.id
     WHERE g.played_at >= ? AND g.played_at < ?
     GROUP BY gp.user_id
     HAVING gp >= 2
     ORDER BY wins * 1.0 / COUNT(*) DESC LIMIT 1`
  ).get(start.toISOString(), end.toISOString());

  res.json({
    week: weekNum,
    season: yr,
    start: start.toISOString(),
    end: end.toISOString(),
    games_played: games.length,
    biggest_win: biggestWin,
    top_commenter: topCommenter,
    player_of_the_week: potw,
  });
});

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function getWeekRange(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7;
  const start = new Date(jan4);
  start.setDate(jan4.getDate() - dayOfWeek + (week - 1) * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

// GET /api/stats/streaks
router.get('/streaks', (req, res) => {
  const db = getDb();
  const { season } = req.query;
  const params = [];
  let sf = '';
  if (season) { sf = 'AND g.season = ?'; params.push(parseInt(season)); }

  const rows = db.prepare(`
    SELECT gp.user_id, u.display_name, u.avatar_url, gp.is_winner, g.played_at
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id ${sf}
    JOIN users u ON gp.user_id = u.id
    ORDER BY gp.user_id, g.played_at ASC
  `).all(...params);

  const byUser = {};
  for (const row of rows) {
    if (!byUser[row.user_id]) byUser[row.user_id] = { user_id: row.user_id, display_name: row.display_name, avatar_url: row.avatar_url, results: [] };
    byUser[row.user_id].results.push(row.is_winner === 1 ? 'W' : 'L');
  }

  const result = Object.values(byUser).map(({ user_id, display_name, avatar_url, results }) => {
    let maxWin = 0, maxLoss = 0, tempW = 0, tempL = 0;
    for (const r of results) {
      if (r === 'W') { tempW++; tempL = 0; maxWin = Math.max(maxWin, tempW); }
      else { tempL++; tempW = 0; maxLoss = Math.max(maxLoss, tempL); }
    }
    let curStreak = 0;
    if (results.length > 0) {
      const last = results[results.length - 1];
      let s = 0;
      for (let i = results.length - 1; i >= 0; i--) { if (results[i] === last) s++; else break; }
      curStreak = last === 'W' ? s : -s;
    }
    return { user_id, display_name, avatar_url, max_win_streak: maxWin, max_loss_streak: maxLoss, current_streak: curStreak, gp: results.length };
  });

  res.json(result);
});

// GET /api/stats/venue-kings
router.get('/venue-kings', (req, res) => {
  const db = getDb();
  const { season } = req.query;
  const seasonInt = season ? parseInt(season) : null;
  const seasonJoin = seasonInt ? 'AND g.season = ?' : '';

  const rows = db.prepare(`
    SELECT v.id as venue_id, v.name as venue_name,
      (SELECT COUNT(DISTINCT id) FROM games WHERE venue_id = v.id ${seasonInt ? 'AND season = ?' : ''}) as total_games,
      gp.user_id, u.display_name, u.avatar_url,
      SUM(gp.is_winner) as wins
    FROM venues v
    JOIN games g ON g.venue_id = v.id ${seasonJoin}
    JOIN game_participants gp ON gp.game_id = g.id
    JOIN users u ON u.id = gp.user_id
    GROUP BY v.id, gp.user_id
    ORDER BY v.id, wins DESC
  `).all(...(seasonInt ? [seasonInt, seasonInt] : []));

  const venues = {};
  for (const row of rows) {
    if (!venues[row.venue_id]) {
      venues[row.venue_id] = {
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        total_games: row.total_games,
        king: { user_id: row.user_id, display_name: row.display_name, avatar_url: row.avatar_url, wins: row.wins },
        all_players: [],
      };
    }
    venues[row.venue_id].all_players.push({ user_id: row.user_id, display_name: row.display_name, wins: row.wins });
  }
  res.json(Object.values(venues));
});

// GET /api/stats/elo-leaders
router.get('/elo-leaders', (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.display_name, u.avatar_url, u.elo_rating,
      (SELECT COUNT(*) FROM game_participants WHERE user_id = u.id) as gp
    FROM users u
    WHERE (SELECT COUNT(*) FROM game_participants WHERE user_id = u.id) > 0
    ORDER BY u.elo_rating DESC
  `).all();
  res.json(users);
});

// GET /api/stats/weather-performers
router.get('/weather-performers', (req, res) => {
  const db = getDb();
  const conditions = db.prepare(`
    SELECT DISTINCT json_extract(g.weather_json, '$.condition') as condition
    FROM games g WHERE g.weather_json IS NOT NULL
  `).all().map(r => r.condition).filter(Boolean);

  const result = conditions.map(condition => {
    const players = db.prepare(`
      SELECT gp.user_id, u.display_name, u.avatar_url,
        COUNT(*) as gp, SUM(gp.is_winner) as wins
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      JOIN users u ON u.id = gp.user_id
      WHERE json_extract(g.weather_json, '$.condition') = ?
      GROUP BY gp.user_id HAVING gp >= 1
      ORDER BY wins * 1.0 / COUNT(*) DESC LIMIT 3
    `).all(condition);
    return { condition, players: players.map(p => ({ ...p, win_pct: Math.round((p.wins / p.gp) * 1000) / 10 })) };
  });
  res.json(result.filter(r => r.players.length > 0));
});

module.exports = router;
