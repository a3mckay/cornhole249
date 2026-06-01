const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');

// GET /api/stats/rivals?type=1v1|2v2
router.get('/rivals', async (req, res) => {
  try {
    const db = getDb();
    const { type = '1v1' } = req.query;

    if (type === '1v1') {
      const { rows: pairs } = await sql`
        SELECT
          a.user_id as p1, b.user_id as p2,
          COUNT(DISTINCT a.game_id) as games_played,
          SUM(CASE WHEN a.is_winner = 1 THEN 1 ELSE 0 END) as p1_wins,
          SUM(CASE WHEN b.is_winner = 1 THEN 1 ELSE 0 END) as p2_wins
        FROM game_participants a
        JOIN game_participants b ON a.game_id = b.game_id AND a.user_id < b.user_id
          AND a.team != b.team
        JOIN games g ON g.id = a.game_id AND g.game_type = '1v1' AND g.league_id = ${req.leagueId}
        GROUP BY a.user_id, b.user_id
        HAVING COUNT(DISTINCT a.game_id) >= 1
        ORDER BY COUNT(DISTINCT a.game_id) DESC
        LIMIT 10
      `.execute(db);

      const result = await Promise.all(pairs.map(async (pair) => {
        const [p1, p2] = await Promise.all([
          db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url']).where('id', '=', pair.p1).executeTakeFirst(),
          db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url']).where('id', '=', pair.p2).executeTakeFirst(),
        ]);
        return { player1: p1, player2: p2, games_played: parseInt(pair.games_played), p1_wins: parseInt(pair.p1_wins), p2_wins: parseInt(pair.p2_wins) };
      }));
      return res.json(result);
    }

    // 2v2: pair-vs-pair rivalries
    const { rows: games2v2 } = await sql`SELECT id FROM games WHERE game_type = '2v2' AND league_id = ${req.leagueId}`.execute(db);
    const matchups = {};

    for (const { id: gameId } of games2v2) {
      const { rows: parts } = await sql`
        SELECT gp.user_id, gp.team, gp.is_winner, u.display_name, u.avatar_url
        FROM game_participants gp JOIN users u ON u.id = gp.user_id
        WHERE gp.game_id = ${gameId}
      `.execute(db);

      const t1 = parts.filter((p) => p.team === 1).sort((a, b) => a.user_id - b.user_id);
      const t2 = parts.filter((p) => p.team === 2).sort((a, b) => a.user_id - b.user_id);
      if (t1.length !== 2 || t2.length !== 2) continue;

      const t1Key = t1.map((p) => p.user_id).join('-');
      const t2Key = t2.map((p) => p.user_id).join('-');
      const [sideA, sideB] = t1Key < t2Key ? [t1, t2] : [t2, t1];
      const mKey = `${sideA.map((p) => p.user_id).join('-')}_vs_${sideB.map((p) => p.user_id).join('-')}`;

      if (!matchups[mKey]) {
        matchups[mKey] = {
          team1: sideA.map((p) => ({ user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url })),
          team2: sideB.map((p) => ({ user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url })),
          games_played: 0, team1_wins: 0, team2_wins: 0,
        };
      }

      const m = matchups[mKey];
      m.games_played++;
      const sideAUserId = sideA[0].user_id;
      const sideAWon = parts.find((p) => p.user_id === sideAUserId)?.is_winner === 1;
      if (sideAWon) m.team1_wins++; else m.team2_wins++;
    }

    res.json(Object.values(matchups).sort((a, b) => b.games_played - a.games_played).slice(0, 10));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/performers
router.get('/performers', async (req, res) => {
  try {
    const db = getDb();
    const { season } = req.query;

    const { rows } = await sql`
      SELECT
        gp.user_id, u.display_name, u.nickname, u.avatar_url,
        COUNT(*) as gp, SUM(gp.is_winner) as wins
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
        ${season ? sql`AND g.season = ${parseInt(season)}` : sql``}
      JOIN users u ON gp.user_id = u.id
      GROUP BY gp.user_id, u.display_name, u.nickname, u.avatar_url
      HAVING COUNT(*) >= 1
      ORDER BY SUM(gp.is_winner) * 1.0 / COUNT(*) DESC
    `.execute(db);

    const withPct = rows.map((r) => ({
      ...r,
      gp: parseInt(r.gp),
      wins: parseInt(r.wins),
      win_pct: Math.round((parseInt(r.wins) / parseInt(r.gp)) * 1000) / 10,
      losses: parseInt(r.gp) - parseInt(r.wins),
    }));

    const mid = Math.ceil(withPct.length / 2);
    res.json({
      top: withPct.slice(0, Math.min(3, mid)),
      bottom: withPct.slice(Math.max(withPct.length - 3, mid)).reverse(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/head-to-head
router.get('/head-to-head', async (req, res) => {
  try {
    const db = getDb();
    const { player1, player2 } = req.query;
    if (!player1 || !player2) return res.status(400).json({ error: 'player1 and player2 required' });

    const p1 = parseInt(player1);
    const p2 = parseInt(player2);

    const { rows: games } = await sql`
      SELECT g.id, g.played_at, g.game_type,
        a.is_winner as p1_won, a.score as p1_score, b.score as p2_score
      FROM games g
      JOIN game_participants a ON a.game_id = g.id AND a.user_id = ${p1}
      JOIN game_participants b ON b.game_id = g.id AND b.user_id = ${p2} AND b.team != a.team
      WHERE g.league_id = ${req.leagueId}
      ORDER BY g.played_at DESC
    `.execute(db);

    const p1_wins = games.filter((g) => g.p1_won).length;
    const p2_wins = games.length - p1_wins;

    const [u1, u2] = await Promise.all([
      db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url', 'elo_rating']).where('id', '=', p1).executeTakeFirst(),
      db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url', 'elo_rating']).where('id', '=', p2).executeTakeFirst(),
    ]);

    res.json({ player1: u1, player2: u2, total_games: games.length, p1_wins, p2_wins, last5: games.slice(0, 5) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/weather
// json_extract(col, '$.field') → col::json->>'field' in Postgres
router.get('/weather', async (req, res) => {
  try {
    const db = getDb();
    const { user_id } = req.query;

    const { rows } = await sql`
      SELECT
        g.weather_json::json->>'condition' as condition,
        COUNT(*) as gp,
        SUM(gp.is_winner) as wins
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE g.weather_json IS NOT NULL AND g.league_id = ${req.leagueId}
      ${user_id ? sql`AND gp.user_id = ${parseInt(user_id)}` : sql``}
      GROUP BY g.weather_json::json->>'condition'
      ORDER BY COUNT(*) DESC
    `.execute(db);

    res.json(rows.map((r) => ({
      ...r,
      gp: parseInt(r.gp),
      wins: parseInt(r.wins),
      win_pct: parseInt(r.gp) > 0 ? Math.round((parseInt(r.wins) / parseInt(r.gp)) * 1000) / 10 : 0,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/venue
router.get('/venue', async (req, res) => {
  try {
    const db = getDb();
    const { user_id } = req.query;

    const { rows } = await sql`
      SELECT
        v.id as venue_id, v.name as venue_name,
        COUNT(DISTINCT g.id) as gp,
        SUM(CASE WHEN gp.is_winner = 1 THEN 1 ELSE 0 END) as wins
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
      JOIN venues v ON g.venue_id = v.id
      ${user_id ? sql`WHERE gp.user_id = ${parseInt(user_id)}` : sql``}
      GROUP BY v.id, v.name ORDER BY COUNT(DISTINCT g.id) DESC
    `.execute(db);

    res.json(rows.map((r) => ({
      ...r,
      gp: parseInt(r.gp),
      wins: parseInt(r.wins),
      win_pct: parseInt(r.gp) > 0 ? Math.round((parseInt(r.wins) / parseInt(r.gp)) * 1000) / 10 : 0,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/point-differential
router.get('/point-differential', async (req, res) => {
  try {
    const db = getDb();
    const { season } = req.query;

    const { rows } = await sql`
      SELECT
        gp.user_id, u.display_name, u.nickname, u.avatar_url,
        COUNT(*) as gp,
        AVG(gp.score - opp_team.opp_score) as avg_diff
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
        ${season ? sql`AND g.season = ${parseInt(season)}` : sql``}
      JOIN users u ON gp.user_id = u.id
      JOIN (
        SELECT game_id, team, MAX(score) as opp_score FROM game_participants GROUP BY game_id, team
      ) opp_team ON opp_team.game_id = gp.game_id AND opp_team.team != gp.team
      GROUP BY gp.user_id, u.display_name, u.nickname, u.avatar_url
      HAVING COUNT(*) >= 1
      ORDER BY AVG(gp.score - opp_team.opp_score) DESC
    `.execute(db);

    res.json(rows.map((r) => ({
      ...r,
      gp: parseInt(r.gp),
      avg_diff: Math.round(parseFloat(r.avg_diff) * 10) / 10,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/clutch
router.get('/clutch', async (req, res) => {
  try {
    const db = getDb();
    const { season } = req.query;

    const { rows } = await sql`
      SELECT
        gp.user_id, u.display_name, u.nickname, u.avatar_url,
        COUNT(*) as gp, SUM(gp.is_winner) as wins
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
        ${season ? sql`AND g.season = ${parseInt(season)}` : sql``}
      JOIN users u ON gp.user_id = u.id
      JOIN (
        SELECT game_id,
          ABS(SUM(CASE WHEN team=1 THEN score ELSE 0 END) - SUM(CASE WHEN team=2 THEN score ELSE 0 END)) as margin
        FROM game_participants
        GROUP BY game_id
        HAVING ABS(SUM(CASE WHEN team=1 THEN score ELSE 0 END) - SUM(CASE WHEN team=2 THEN score ELSE 0 END)) <= 3
      ) close ON close.game_id = gp.game_id
      GROUP BY gp.user_id, u.display_name, u.nickname, u.avatar_url
      HAVING COUNT(*) >= 2
      ORDER BY SUM(gp.is_winner) * 1.0 / COUNT(*) DESC
    `.execute(db);

    res.json(rows.map((r) => ({
      ...r,
      gp: parseInt(r.gp),
      wins: parseInt(r.wins),
      win_pct: parseInt(r.gp) > 0 ? Math.round((parseInt(r.wins) / parseInt(r.gp)) * 1000) / 10 : 0,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/recap
router.get('/recap', async (req, res) => {
  try {
    const db = getDb();
    const { season, week } = req.query;
    const now = new Date();
    const weekNum = week ? parseInt(week) : getWeekNumber(now);
    const yr = season ? parseInt(season) : now.getFullYear();
    const { start, end } = getWeekRange(yr, weekNum);

    const { rows: games } = await sql`
      SELECT g.*, v.name as venue_name
      FROM games g LEFT JOIN venues v ON g.venue_id = v.id
      WHERE g.league_id = ${req.leagueId} AND g.played_at >= ${start.toISOString()} AND g.played_at < ${end.toISOString()}
      ORDER BY g.played_at DESC
    `.execute(db);

    let biggestWin = null;
    let maxMargin = 0;
    for (const game of games) {
      const { rows: participants } = await sql`SELECT * FROM game_participants WHERE game_id = ${game.id}`.execute(db);
      const t1Score = participants.filter(p => p.team === 1).reduce((s, p) => s + p.score, 0);
      const t2Score = participants.filter(p => p.team === 2).reduce((s, p) => s + p.score, 0);
      const margin = Math.abs(t1Score - t2Score);
      if (margin > maxMargin) {
        maxMargin = margin;
        biggestWin = { ...game, margin, t1Score, t2Score };
      }
    }

    const { rows: topCommenterRows } = await sql`
      SELECT u.display_name, COUNT(*) as count
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.league_id = ${req.leagueId} AND c.created_at >= ${start.toISOString()} AND c.created_at < ${end.toISOString()}
      GROUP BY c.user_id, u.display_name
      ORDER BY COUNT(*) DESC LIMIT 1
    `.execute(db);
    const topCommenter = topCommenterRows[0] || null;

    const { rows: potwRows } = await sql`
      SELECT u.display_name, u.nickname, COUNT(*) as gp, SUM(gp.is_winner) as wins
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      JOIN users u ON gp.user_id = u.id
      WHERE g.league_id = ${req.leagueId} AND g.played_at >= ${start.toISOString()} AND g.played_at < ${end.toISOString()}
      GROUP BY gp.user_id, u.display_name, u.nickname
      HAVING COUNT(*) >= 2
      ORDER BY SUM(gp.is_winner) * 1.0 / COUNT(*) DESC LIMIT 1
    `.execute(db);
    const potw = potwRows[0] || null;

    res.json({
      week: weekNum, season: yr,
      start: start.toISOString(), end: end.toISOString(),
      games_played: games.length,
      biggest_win: biggestWin,
      top_commenter: topCommenter,
      player_of_the_week: potw,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
router.get('/streaks', async (req, res) => {
  try {
    const db = getDb();
    const { season } = req.query;

    const { rows } = await sql`
      SELECT gp.user_id, u.display_name, u.avatar_url, gp.is_winner, g.played_at
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
        ${season ? sql`AND g.season = ${parseInt(season)}` : sql``}
      JOIN users u ON gp.user_id = u.id
      ORDER BY gp.user_id, g.played_at ASC
    `.execute(db);

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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/venue-kings
router.get('/venue-kings', async (req, res) => {
  try {
    const db = getDb();
    const { season } = req.query;
    const seasonInt = season ? parseInt(season) : null;

    const { rows } = await sql`
      SELECT v.id as venue_id, v.name as venue_name,
        (SELECT COUNT(DISTINCT id) FROM games WHERE venue_id = v.id AND league_id = ${req.leagueId} ${seasonInt ? sql`AND season = ${seasonInt}` : sql``}) as total_games,
        gp.user_id, u.display_name, u.avatar_url,
        SUM(gp.is_winner) as wins
      FROM venues v
      JOIN games g ON g.venue_id = v.id AND g.league_id = ${req.leagueId} ${seasonInt ? sql`AND g.season = ${seasonInt}` : sql``}
      JOIN game_participants gp ON gp.game_id = g.id
      JOIN users u ON u.id = gp.user_id
      GROUP BY v.id, v.name, gp.user_id, u.display_name, u.avatar_url
      ORDER BY v.id, SUM(gp.is_winner) DESC
    `.execute(db);

    const venues = {};
    for (const row of rows) {
      if (!venues[row.venue_id]) {
        venues[row.venue_id] = {
          venue_id: row.venue_id,
          venue_name: row.venue_name,
          total_games: parseInt(row.total_games),
          king: { user_id: row.user_id, display_name: row.display_name, avatar_url: row.avatar_url, wins: parseInt(row.wins) },
          all_players: [],
        };
      }
      venues[row.venue_id].all_players.push({ user_id: row.user_id, display_name: row.display_name, wins: parseInt(row.wins) });
    }
    res.json(Object.values(venues));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/elo-leaders
router.get('/elo-leaders', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT u.id, u.display_name, u.avatar_url, u.elo_rating,
        (SELECT COUNT(*) FROM game_participants gp JOIN games g ON gp.game_id = g.id WHERE gp.user_id = u.id AND g.league_id = ${req.leagueId}) as gp
      FROM users u
      WHERE (SELECT COUNT(*) FROM game_participants gp JOIN games g ON gp.game_id = g.id WHERE gp.user_id = u.id AND g.league_id = ${req.leagueId}) > 0
      ORDER BY u.elo_rating DESC
    `.execute(db);
    res.json(rows.map((r) => ({ ...r, gp: parseInt(r.gp) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats/weather-performers
// json_extract → ::json->>'field'
router.get('/weather-performers', async (req, res) => {
  try {
    const db = getDb();
    const { rows: condRows } = await sql`
      SELECT DISTINCT g.weather_json::json->>'condition' as condition
      FROM games g WHERE g.weather_json IS NOT NULL AND g.league_id = ${req.leagueId}
    `.execute(db);
    const conditions = condRows.map((r) => r.condition).filter(Boolean);

    const result = await Promise.all(
      conditions.map(async (condition) => {
        const { rows: players } = await sql`
          SELECT gp.user_id, u.display_name, u.avatar_url,
            COUNT(*) as gp, SUM(gp.is_winner) as wins
          FROM game_participants gp
          JOIN games g ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
          JOIN users u ON u.id = gp.user_id
          WHERE g.weather_json::json->>'condition' = ${condition}
          GROUP BY gp.user_id, u.display_name, u.avatar_url
          HAVING COUNT(*) >= 1
          ORDER BY SUM(gp.is_winner) * 1.0 / COUNT(*) DESC LIMIT 3
        `.execute(db);
        return {
          condition,
          players: players.map((p) => ({
            ...p,
            gp: parseInt(p.gp),
            wins: parseInt(p.wins),
            win_pct: Math.round((parseInt(p.wins) / parseInt(p.gp)) * 1000) / 10,
          })),
        };
      })
    );
    res.json(result.filter((r) => r.players.length > 0));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
