const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');

// ── Simple in-memory TTL cache ────────────────────────────────────────────────
// Standings are expensive to compute (streak + last-5 queries per player).
// Cache results for 30 seconds — negligible staleness vs. large query savings.
const _cache = new Map();
const CACHE_TTL = 30_000;

function getCache(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) { _cache.delete(key); return null; }
  return hit.data;
}

function setCache(key, data) {
  _cache.set(key, { data, exp: Date.now() + CACHE_TTL });
}

// ── Streak / last-5 helpers ───────────────────────────────────────────────────

async function computePairStreak(ids, db, season, leagueId) {
  const { rows } = await sql`
    SELECT gp1.is_winner, g.played_at
    FROM games g
    JOIN game_participants gp1 ON gp1.game_id = g.id AND gp1.user_id = ${ids[0]}
    JOIN game_participants gp2 ON gp2.game_id = g.id AND gp2.user_id = ${ids[1]} AND gp2.team = gp1.team
    WHERE g.game_type = '2v2' AND g.league_id = ${leagueId}
    ${season ? sql`AND g.season = ${season}` : sql``}
    ORDER BY g.played_at DESC LIMIT 20
  `.execute(db);

  if (!rows.length) return '';
  const first = rows[0].is_winner;
  let count = 0;
  for (const r of rows) {
    if (r.is_winner === first) count++;
    else break;
  }
  return (first ? 'W' : 'L') + count;
}

async function computePairLast5(ids, db, season, leagueId) {
  const { rows } = await sql`
    SELECT gp1.is_winner
    FROM games g
    JOIN game_participants gp1 ON gp1.game_id = g.id AND gp1.user_id = ${ids[0]}
    JOIN game_participants gp2 ON gp2.game_id = g.id AND gp2.user_id = ${ids[1]} AND gp2.team = gp1.team
    WHERE g.game_type = '2v2' AND g.league_id = ${leagueId}
    ${season ? sql`AND g.season = ${season}` : sql``}
    ORDER BY g.played_at DESC LIMIT 5
  `.execute(db);

  return rows.map((r) => (r.is_winner ? 'W' : 'L'));
}

async function computeStreak(userId, db, season, leagueId) {
  const { rows } = await sql`
    SELECT gp.is_winner
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ${userId} AND g.league_id = ${leagueId}
    ${season ? sql`AND g.season = ${season}` : sql``}
    ORDER BY g.played_at DESC LIMIT 20
  `.execute(db);

  if (!rows.length) return '';
  const first = rows[0].is_winner;
  let count = 0;
  for (const r of rows) {
    if (r.is_winner === first) count++;
    else break;
  }
  return (first ? 'W' : 'L') + count;
}

async function computeLast5(userId, db, season, leagueId) {
  const { rows } = await sql`
    SELECT gp.is_winner
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ${userId} AND g.league_id = ${leagueId}
    ${season ? sql`AND g.season = ${season}` : sql``}
    ORDER BY g.played_at DESC LIMIT 5
  `.execute(db);

  return rows.map((r) => (r.is_winner ? 'W' : 'L'));
}

// ── GET /api/standings/1v1 ────────────────────────────────────────────────────
router.get('/1v1', async (req, res) => {
  try {
    const db = getDb();
    const { season, variant } = req.query;
    const seasonInt = season ? parseInt(season) : null;
    const leagueId = req.leagueId;
    // Optional pool variant filter (e.g. ?variant=eight_ball). Cornhole ignores.
    const variantFilter = variant && variant !== 'all' ? variant : null;

    const cacheKey = `${leagueId}:1v1:${seasonInt ?? ''}:${variantFilter ?? ''}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await sql`
      SELECT
        gp.user_id,
        u.display_name, u.nickname, u.avatar_url, u.elo_rating,
        COUNT(*) as gp,
        SUM(gp.is_winner) as wins,
        COUNT(*) - SUM(gp.is_winner) as losses,
        SUM(gp.score) as total_scored,
        SUM(CASE WHEN gp.team = 1 THEN opp.opp_score ELSE opp2.opp_score END) as total_against
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id AND g.game_type = '1v1' AND g.league_id = ${leagueId}
        ${seasonInt ? sql`AND g.season = ${seasonInt}` : sql``}
        ${variantFilter ? sql`AND g.game_variant = ${variantFilter}` : sql``}
      JOIN users u ON gp.user_id = u.id
      LEFT JOIN (
        SELECT game_id, SUM(score) as opp_score FROM game_participants WHERE team = 2 GROUP BY game_id
      ) opp ON opp.game_id = gp.game_id AND gp.team = 1
      LEFT JOIN (
        SELECT game_id, SUM(score) as opp_score FROM game_participants WHERE team = 1 GROUP BY game_id
      ) opp2 ON opp2.game_id = gp.game_id AND gp.team = 2
      GROUP BY gp.user_id, u.display_name, u.nickname, u.avatar_url, u.elo_rating
      ORDER BY SUM(gp.is_winner) * 2 DESC, SUM(gp.is_winner) * 1.0 / COUNT(*) DESC
    `.execute(db);

    const result = await Promise.all(
      rows.map(async (r, i) => ({
        rank: i + 1,
        user_id: r.user_id,
        display_name: r.display_name,
        nickname: r.nickname,
        avatar_url: r.avatar_url,
        elo_rating: r.elo_rating,
        gp: parseInt(r.gp),
        wins: parseInt(r.wins),
        losses: parseInt(r.losses),
        pts: parseInt(r.wins) * 2,
        win_pct: parseInt(r.gp) > 0 ? Math.round((parseInt(r.wins) / parseInt(r.gp)) * 1000) / 10 : 0,
        plus_minus: (parseInt(r.total_scored) || 0) - (parseInt(r.total_against) || 0),
        streak: await computeStreak(r.user_id, db, seasonInt, leagueId),
        last5: await computeLast5(r.user_id, db, seasonInt, leagueId),
      }))
    );

    setCache(cacheKey, result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/standings/2v2 ────────────────────────────────────────────────────
router.get('/2v2', async (req, res) => {
  try {
    const db = getDb();
    const { season, variant } = req.query;
    const seasonInt = season ? parseInt(season) : null;
    const leagueId = req.leagueId;
    const variantFilter = variant && variant !== 'all' ? variant : null;

    const cacheKey = `${leagueId}:2v2:${seasonInt ?? ''}:${variantFilter ?? ''}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    // Fetch all 2v2 participants in one query instead of N+1 per-game queries.
    // Map preserves insertion order (games sorted by played_at ASC).
    const { rows: allRows } = await sql`
      SELECT gp.game_id, gp.team, gp.user_id, gp.score, gp.is_winner,
             u.display_name, u.nickname, u.avatar_url
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      JOIN users u ON gp.user_id = u.id
      WHERE g.game_type = '2v2' AND g.league_id = ${leagueId}
      ${seasonInt ? sql`AND g.season = ${seasonInt}` : sql``}
      ${variantFilter ? sql`AND g.game_variant = ${variantFilter}` : sql``}
      ORDER BY g.played_at ASC, gp.team
    `.execute(db);

    // Group participants by game
    const gameMap = new Map();
    for (const row of allRows) {
      if (!gameMap.has(row.game_id)) gameMap.set(row.game_id, []);
      gameMap.get(row.game_id).push(row);
    }

    const pairStats = {};

    const processTeam = (team, opponent) => {
      const ids = team.map((p) => p.user_id).sort((a, b) => a - b);
      const key = ids.join('-');
      if (!pairStats[key]) {
        pairStats[key] = {
          key, user_ids: ids,
          players: team.map((p) => ({ user_id: p.user_id, display_name: p.display_name, nickname: p.nickname, avatar_url: p.avatar_url })),
          gp: 0, wins: 0, losses: 0, total_scored: 0, total_against: 0,
        };
      }
      const won = team[0].is_winner === 1;
      pairStats[key].gp++;
      if (won) pairStats[key].wins++;
      else pairStats[key].losses++;
      pairStats[key].total_scored += team[0].score || 0;
      pairStats[key].total_against += opponent[0].score || 0;
    };

    for (const participants of gameMap.values()) {
      const team1 = participants.filter((p) => p.team === 1);
      const team2 = participants.filter((p) => p.team === 2);
      if (team1.length < 2 || team2.length < 2) continue;
      processTeam(team1, team2);
      processTeam(team2, team1);
    }

    const sorted = Object.values(pairStats).sort(
      (a, b) => (b.wins * 2) - (a.wins * 2) || (b.wins / b.gp) - (a.wins / a.gp)
    );

    const result = await Promise.all(
      sorted.map(async (pair, i) => ({
        rank: i + 1,
        ...pair,
        pts: pair.wins * 2,
        win_pct: pair.gp > 0 ? Math.round((pair.wins / pair.gp) * 1000) / 10 : 0,
        plus_minus: pair.total_scored - pair.total_against,
        streak: await computePairStreak(pair.user_ids, db, seasonInt, leagueId),
        last5: await computePairLast5(pair.user_ids, db, seasonInt, leagueId),
      }))
    );

    setCache(cacheKey, result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/standings/cutthroat ─────────────────────────────────────────────
// Per-player W/L for pool cutthroat games (winner = team1, losers = team2).
// No scores; ranked by wins then win %.
router.get('/cutthroat', async (req, res) => {
  try {
    const db = getDb();
    const { season } = req.query;
    const seasonInt = season ? parseInt(season) : null;
    const leagueId = req.leagueId;

    const cacheKey = `${leagueId}:cutthroat:${seasonInt ?? ''}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = await sql`
      SELECT
        gp.user_id,
        u.display_name, u.nickname, u.avatar_url, u.elo_rating,
        COUNT(*) as gp,
        SUM(gp.is_winner) as wins,
        COUNT(*) - SUM(gp.is_winner) as losses
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
        AND g.game_type = 'cutthroat' AND g.league_id = ${leagueId}
        ${seasonInt ? sql`AND g.season = ${seasonInt}` : sql``}
      JOIN users u ON gp.user_id = u.id
      GROUP BY gp.user_id, u.display_name, u.nickname, u.avatar_url, u.elo_rating
      ORDER BY SUM(gp.is_winner) DESC, SUM(gp.is_winner) * 1.0 / COUNT(*) DESC
    `.execute(db);

    const result = rows.map((r, i) => ({
      rank: i + 1,
      user_id: r.user_id,
      display_name: r.display_name,
      nickname: r.nickname,
      avatar_url: r.avatar_url,
      elo_rating: r.elo_rating,
      gp: parseInt(r.gp),
      wins: parseInt(r.wins),
      losses: parseInt(r.losses),
      pts: parseInt(r.wins) * 2,
      win_pct: parseInt(r.gp) > 0 ? Math.round((parseInt(r.wins) / parseInt(r.gp)) * 1000) / 10 : 0,
    }));

    setCache(cacheKey, result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/standings/team/:p1/:p2 ──────────────────────────────────────────
router.get('/team/:p1/:p2', async (req, res) => {
  try {
    const db = getDb();
    const p1 = parseInt(req.params.p1);
    const p2 = parseInt(req.params.p2);
    if (isNaN(p1) || isNaN(p2) || p1 === p2) {
      return res.status(400).json({ error: 'Two distinct player IDs required' });
    }

    const [u1, u2] = await Promise.all([
      db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url', 'elo_rating']).where('id', '=', p1).executeTakeFirst(),
      db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url', 'elo_rating']).where('id', '=', p2).executeTakeFirst(),
    ]);
    if (!u1 || !u2) return res.status(404).json({ error: 'Player not found' });

    const { season } = req.query;
    const seasonInt = season ? parseInt(season) : null;

    const leagueId = req.leagueId;
    const { rows: teamGames } = await sql`
      SELECT g.id as game_id, g.played_at, g.season, g.venue_id, g.weather_json,
             gp1.team, gp1.score, gp1.is_winner
      FROM games g
      JOIN game_participants gp1 ON gp1.game_id = g.id AND gp1.user_id = ${p1}
      JOIN game_participants gp2 ON gp2.game_id = g.id AND gp2.user_id = ${p2} AND gp2.team = gp1.team
      WHERE g.game_type = '2v2' AND g.league_id = ${leagueId}
      ${seasonInt ? sql`AND g.season = ${seasonInt}` : sql``}
      ORDER BY g.played_at ASC
    `.execute(db);

    const gp = teamGames.length;
    const wins = teamGames.filter((g) => g.is_winner === 1).length;
    const losses = gp - wins;

    let totalFor = 0, totalAgainst = 0;
    for (const g of teamGames) {
      const { rows: oppRows } = await sql`
        SELECT MAX(score) as s FROM game_participants WHERE game_id = ${g.game_id} AND team != ${g.team}
      `.execute(db);
      totalFor += g.score || 0;
      totalAgainst += oppRows[0]?.s || 0;
    }

    const seasonMap = {};
    for (const g of teamGames) {
      if (!seasonMap[g.season]) seasonMap[g.season] = { season: g.season, gp: 0, wins: 0, losses: 0 };
      seasonMap[g.season].gp++;
      if (g.is_winner) seasonMap[g.season].wins++;
      else seasonMap[g.season].losses++;
    }
    const seasons = Object.values(seasonMap).sort((a, b) => b.season - a.season);

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

    let bestStreak = 0, worstStreak = 0, curW = 0, curL = 0;
    for (const g of teamGames) {
      if (g.is_winner) { curW++; curL = 0; } else { curL++; curW = 0; }
      if (curW > bestStreak) bestStreak = curW;
      if (curL > worstStreak) worstStreak = curL;
    }

    const recentGameIds = teamGames.slice(-10).reverse().map((g) => g.game_id);
    const recentGames = await Promise.all(
      recentGameIds.map(async (gameId) => {
        const { rows: gameRows } = await sql`
          SELECT g.*, v.name as venue_name FROM games g LEFT JOIN venues v ON v.id = g.venue_id WHERE g.id = ${gameId}
        `.execute(db);
        const game = gameRows[0];
        const { rows: parts } = await sql`
          SELECT gp.*, u.display_name, u.nickname, u.avatar_url
          FROM game_participants gp JOIN users u ON u.id = gp.user_id
          WHERE gp.game_id = ${gameId} ORDER BY gp.team, gp.id
        `.execute(db);
        game.participants = parts;
        if (game.weather_json) { try { game.weather = JSON.parse(game.weather_json); } catch (e) {} }
        return game;
      })
    );

    const h2hMap = {};
    for (const g of teamGames) {
      const { rows: opponents } = await sql`
        SELECT gp.user_id, u.display_name, u.avatar_url
        FROM game_participants gp JOIN users u ON u.id = gp.user_id
        WHERE gp.game_id = ${g.game_id} AND gp.team != ${g.team}
        ORDER BY gp.user_id
      `.execute(db);
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
      seasons, history, recent_games: recentGames, h2h,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/standings/history/:user_id ───────────────────────────────────────
router.get('/history/:user_id', async (req, res) => {
  try {
    const db = getDb();
    const { season, type } = req.query;
    const userId = req.params.user_id;

    const { rows } = await sql`
      SELECT g.id as game_id, g.played_at, g.season, gp.is_winner
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE gp.user_id = ${userId} AND g.league_id = ${req.leagueId}
      ${type ? sql`AND g.game_type = ${type}` : sql``}
      ${season ? sql`AND g.season = ${parseInt(season)}` : sql``}
      ORDER BY g.played_at ASC
    `.execute(db);

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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
