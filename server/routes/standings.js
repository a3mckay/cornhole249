const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

function computePairStreak(ids, db, season) {
  let query = `
    SELECT gp1.is_winner, g.played_at
    FROM games g
    JOIN game_participants gp1 ON gp1.game_id = g.id AND gp1.user_id = ?
    JOIN game_participants gp2 ON gp2.game_id = g.id AND gp2.user_id = ? AND gp2.team = gp1.team
    WHERE g.game_type = '2v2'`;
  const params = [ids[0], ids[1]];
  if (season) { query += ` AND g.season = ?`; params.push(season); }
  query += ` ORDER BY g.played_at DESC LIMIT 20`;

  const rows = db.prepare(query).all(...params);
  if (!rows.length) return '';
  const first = rows[0].is_winner;
  let count = 0;
  for (const r of rows) {
    if (r.is_winner === first) count++;
    else break;
  }
  return (first ? 'W' : 'L') + count;
}

function computePairLast5(ids, db, season) {
  let query = `
    SELECT gp1.is_winner
    FROM games g
    JOIN game_participants gp1 ON gp1.game_id = g.id AND gp1.user_id = ?
    JOIN game_participants gp2 ON gp2.game_id = g.id AND gp2.user_id = ? AND gp2.team = gp1.team
    WHERE g.game_type = '2v2'`;
  const params = [ids[0], ids[1]];
  if (season) { query += ` AND g.season = ?`; params.push(season); }
  query += ` ORDER BY g.played_at DESC LIMIT 5`;

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => (r.is_winner ? 'W' : 'L'));
}

function computeStreak(userId, db, season) {
  let query = `
    SELECT gp.is_winner
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ?`;
  const params = [userId];
  if (season) { query += ` AND g.season = ?`; params.push(season); }
  query += ` ORDER BY g.played_at DESC LIMIT 20`;

  const rows = db.prepare(query).all(...params);
  if (!rows.length) return '';

  const first = rows[0].is_winner;
  let count = 0;
  for (const r of rows) {
    if (r.is_winner === first) count++;
    else break;
  }
  return (first ? 'W' : 'L') + count;
}

function computeLast5(userId, db, season) {
  let query = `
    SELECT gp.is_winner
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ?`;
  const params = [userId];
  if (season) { query += ` AND g.season = ?`; params.push(season); }
  query += ` ORDER BY g.played_at DESC LIMIT 5`;

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => (r.is_winner ? 'W' : 'L'));
}

// GET /api/standings/1v1
router.get('/1v1', (req, res) => {
  const db = getDb();
  const { season } = req.query;

  let seasonFilter = '';
  const params = ['1v1'];
  if (season) { seasonFilter = 'AND g.season = ?'; params.push(parseInt(season)); }

  const rows = db.prepare(
    `SELECT
       gp.user_id,
       u.display_name,
       u.nickname,
       u.avatar_url,
       u.elo_rating,
       COUNT(*) as gp,
       SUM(gp.is_winner) as wins,
       COUNT(*) - SUM(gp.is_winner) as losses,
       SUM(gp.score) as total_scored,
       SUM(CASE WHEN gp.team = 1 THEN opp.opp_score ELSE opp2.opp_score END) as total_against
     FROM game_participants gp
     JOIN games g ON gp.game_id = g.id AND g.game_type = ? ${seasonFilter}
     JOIN users u ON gp.user_id = u.id
     LEFT JOIN (
       SELECT game_id, SUM(score) as opp_score FROM game_participants WHERE team = 2 GROUP BY game_id
     ) opp ON opp.game_id = gp.game_id AND gp.team = 1
     LEFT JOIN (
       SELECT game_id, SUM(score) as opp_score FROM game_participants WHERE team = 1 GROUP BY game_id
     ) opp2 ON opp2.game_id = gp.game_id AND gp.team = 2
     GROUP BY gp.user_id
     ORDER BY wins * 2 DESC, wins * 1.0 / COUNT(*) DESC`
  ).all(...params);

  const result = rows.map((r, i) => ({
    rank: i + 1,
    user_id: r.user_id,
    display_name: r.display_name,
    nickname: r.nickname,
    avatar_url: r.avatar_url,
    elo_rating: r.elo_rating,
    gp: r.gp,
    wins: r.wins,
    losses: r.losses,
    pts: r.wins * 2,
    win_pct: r.gp > 0 ? Math.round((r.wins / r.gp) * 1000) / 10 : 0,
    plus_minus: (r.total_scored || 0) - (r.total_against || 0),
    streak: computeStreak(r.user_id, db, season ? parseInt(season) : null),
    last5: computeLast5(r.user_id, db, season ? parseInt(season) : null),
  }));

  res.json(result);
});

// GET /api/standings/2v2
router.get('/2v2', (req, res) => {
  const db = getDb();
  const { season } = req.query;

  let seasonFilter = '';
  const params = ['2v2'];
  if (season) { seasonFilter = 'AND g.season = ?'; params.push(parseInt(season)); }

  // Get all 2v2 games
  const games = db.prepare(
    `SELECT g.id as game_id, g.played_at
     FROM games g
     WHERE g.game_type = ? ${seasonFilter}
     ORDER BY g.played_at ASC`
  ).all(...params);

  // Build pair stats
  const pairStats = {};

  for (const game of games) {
    const participants = db.prepare(
      `SELECT gp.*, u.display_name, u.nickname, u.avatar_url
       FROM game_participants gp
       JOIN users u ON gp.user_id = u.id
       WHERE gp.game_id = ?
       ORDER BY gp.team`
    ).all(game.game_id);

    const team1 = participants.filter((p) => p.team === 1);
    const team2 = participants.filter((p) => p.team === 2);

    if (team1.length < 2 || team2.length < 2) continue;

    const processTeam = (team, opponent) => {
      const ids = team.map((p) => p.user_id).sort((a, b) => a - b);
      const key = ids.join('-');
      if (!pairStats[key]) {
        pairStats[key] = {
          key,
          user_ids: ids,
          players: team.map((p) => ({ user_id: p.user_id, display_name: p.display_name, nickname: p.nickname, avatar_url: p.avatar_url })),
          gp: 0, wins: 0, losses: 0,
          total_scored: 0, total_against: 0,
        };
      }
      const won = team[0].is_winner === 1;
      pairStats[key].gp++;
      if (won) pairStats[key].wins++;
      else pairStats[key].losses++;
      // Each player is recorded with the full team score, so use team[0].score (not sum)
      pairStats[key].total_scored += team[0].score || 0;
      pairStats[key].total_against += opponent[0].score || 0;
    };

    processTeam(team1, team2);
    processTeam(team2, team1);
  }

  const seasonInt = season ? parseInt(season) : null;
  const result = Object.values(pairStats)
    .sort((a, b) => (b.wins * 2) - (a.wins * 2) || (b.wins / b.gp) - (a.wins / a.gp))
    .map((pair, i) => ({
      rank: i + 1,
      ...pair,
      pts: pair.wins * 2,
      win_pct: pair.gp > 0 ? Math.round((pair.wins / pair.gp) * 1000) / 10 : 0,
      plus_minus: pair.total_scored - pair.total_against,
      streak: computePairStreak(pair.user_ids, db, seasonInt),
      last5: computePairLast5(pair.user_ids, db, seasonInt),
    }));

  res.json(result);
});

// GET /api/standings/team/:p1/:p2 — full profile for a 2v2 pair
router.get('/team/:p1/:p2', (req, res) => {
  const db = getDb();
  const p1 = parseInt(req.params.p1);
  const p2 = parseInt(req.params.p2);
  if (isNaN(p1) || isNaN(p2) || p1 === p2) {
    return res.status(400).json({ error: 'Two distinct player IDs required' });
  }

  const u1 = db.prepare(`SELECT id, display_name, nickname, avatar_url, elo_rating FROM users WHERE id = ?`).get(p1);
  const u2 = db.prepare(`SELECT id, display_name, nickname, avatar_url, elo_rating FROM users WHERE id = ?`).get(p2);
  if (!u1 || !u2) return res.status(404).json({ error: 'Player not found' });

  const { season } = req.query;
  const seasonClause = season ? 'AND g.season = ?' : '';
  const teamQueryParams = season ? [p1, p2, parseInt(season)] : [p1, p2];

  // All games where p1 and p2 were on the same team
  const teamGames = db.prepare(`
    SELECT g.id as game_id, g.played_at, g.season, g.venue_id, g.weather_json,
           gp1.team, gp1.score, gp1.is_winner
    FROM games g
    JOIN game_participants gp1 ON gp1.game_id = g.id AND gp1.user_id = ?
    JOIN game_participants gp2 ON gp2.game_id = g.id AND gp2.user_id = ? AND gp2.team = gp1.team
    WHERE g.game_type = '2v2' ${seasonClause}
    ORDER BY g.played_at ASC
  `).all(...teamQueryParams);

  const gp = teamGames.length;
  const wins = teamGames.filter((g) => g.is_winner === 1).length;
  const losses = gp - wins;

  // Plus/minus
  let totalFor = 0, totalAgainst = 0;
  for (const g of teamGames) {
    const oppScore = db.prepare(
      `SELECT SUM(score) as s FROM game_participants WHERE game_id = ? AND team != ?`
    ).get(g.game_id, g.team);
    totalFor += g.score || 0;
    totalAgainst += oppScore?.s || 0;
  }

  // Season breakdown
  const seasonMap = {};
  for (const g of teamGames) {
    if (!seasonMap[g.season]) seasonMap[g.season] = { season: g.season, gp: 0, wins: 0, losses: 0 };
    seasonMap[g.season].gp++;
    if (g.is_winner) seasonMap[g.season].wins++;
    else seasonMap[g.season].losses++;
  }
  const seasons = Object.values(seasonMap).sort((a, b) => b.season - a.season);

  // Win% history (cumulative)
  let cumWins = 0;
  const history = teamGames.map((g, i) => {
    if (g.is_winner) cumWins++;
    return {
      game_number: i + 1,
      played_at: g.played_at,
      is_winner: g.is_winner,
      cumulative_win_pct: Math.round((cumWins / (i + 1)) * 1000) / 10,
    };
  });

  // Streaks
  let bestStreak = 0, worstStreak = 0, curW = 0, curL = 0;
  for (const g of teamGames) {
    if (g.is_winner) { curW++; curL = 0; } else { curL++; curW = 0; }
    if (curW > bestStreak) bestStreak = curW;
    if (curL > worstStreak) worstStreak = curL;
  }

  // Recent games (last 10) — hydrate with participants
  const recentGameIds = teamGames.slice(-10).reverse().map((g) => g.game_id);
  const recentGames = recentGameIds.map((gameId) => {
    const game = db.prepare(`SELECT g.*, v.name as venue_name FROM games g LEFT JOIN venues v ON v.id = g.venue_id WHERE g.id = ?`).get(gameId);
    game.participants = db.prepare(
      `SELECT gp.*, u.display_name, u.nickname, u.avatar_url FROM game_participants gp JOIN users u ON u.id = gp.user_id WHERE gp.game_id = ? ORDER BY gp.team, gp.id`
    ).all(gameId);
    if (game.weather_json) { try { game.weather = JSON.parse(game.weather_json); } catch(e) {} }
    return game;
  });

  // H2H vs other teams they've faced together
  const h2hMap = {};
  for (const g of teamGames) {
    const opponents = db.prepare(
      `SELECT gp.user_id, u.display_name, u.avatar_url FROM game_participants gp JOIN users u ON u.id = gp.user_id WHERE gp.game_id = ? AND gp.team != ? ORDER BY gp.user_id`
    ).all(g.game_id, g.team);
    if (opponents.length < 2) continue;
    const key = opponents.map((o) => o.user_id).sort((a, b) => a - b).join('-');
    if (!h2hMap[key]) h2hMap[key] = { opponents, gp: 0, wins: 0, losses: 0 };
    h2hMap[key].gp++;
    if (g.is_winner) h2hMap[key].wins++;
    else h2hMap[key].losses++;
  }
  const h2h = Object.values(h2hMap).sort((a, b) => b.gp - a.gp);

  res.json({
    players: [u1, u2],
    overall: { gp, wins, losses, win_pct: gp > 0 ? Math.round((wins / gp) * 1000) / 10 : 0, plus_minus: totalFor - totalAgainst, best_streak: bestStreak, worst_streak: worstStreak },
    seasons,
    history,
    recent_games: recentGames,
    h2h,
  });
});

// GET /api/standings/history/:user_id
router.get('/history/:user_id', (req, res) => {
  const db = getDb();
  const { season, type } = req.query;

  let query = `
    SELECT g.id as game_id, g.played_at, g.season, gp.is_winner
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ?`;
  const params = [req.params.user_id];
  if (type) { query += ` AND g.game_type = ?`; params.push(type); }
  if (season) { query += ` AND g.season = ?`; params.push(parseInt(season)); }
  query += ` ORDER BY g.played_at ASC`;

  const rows = db.prepare(query).all(...params);

  let wins = 0, total = 0;
  const history = rows.map((r) => {
    total++;
    if (r.is_winner) wins++;
    return {
      game_id: r.game_id,
      played_at: r.played_at,
      season: r.season,
      is_winner: r.is_winner,
      cumulative_win_pct: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      game_number: total,
    };
  });

  res.json(history);
});

module.exports = router;
