// OG image HTTP routes. Each route loads the underlying entity, shapes it into
// the template's prop format, renders to PNG via satori+resvg, and serves the
// result with a disk cache keyed by a content hash so unchanged data is served
// straight from disk.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getDb } = require('../db');
const { render } = require('./render');
const {
  gameCard,
  playerCard,
  standingsCard,
  tournamentOverviewCard,
  tournamentMatchCard,
  fallbackCard,
} = require('./templates');

const router = express.Router();

// DiceBear serves SVG by default; satori renders SVGs poorly as <img> sources.
// Swap the format segment so satori gets a PNG it can decode.
function normalizeAvatarUrl(url) {
  if (!url) return null;
  // data URLs (uploaded photos) — pass through as-is
  if (url.startsWith('data:')) return url;
  // DiceBear SVG → PNG
  return url.replace('/svg?', '/png?');
}

// Disk cache. In production this lives on the Railway Volume so PNGs survive
// restarts. Files are written as `{type}-{id}-{contentHash}.png`; a data
// change produces a new hash and the old file becomes orphaned (a sweeper
// can clean those up later — they're ~50KB each).
const cacheDir = path.join(__dirname, 'cache');
fs.mkdirSync(cacheDir, { recursive: true });

function hashData(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 12);
}

// Serve a PNG: hash the data, check the disk cache, render+write on miss.
// Always sets Cache-Control + Content-Type headers.
async function serveCard(res, type, id, data, buildNode) {
  try {
    const hash = hashData(data);
    const file = path.join(cacheDir, `${type}-${id}-${hash}.png`);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    if (fs.existsSync(file)) {
      return fs.createReadStream(file).pipe(res);
    }
    const png = await render(buildNode(data));
    fs.writeFileSync(file, png);
    return res.end(png);
  } catch (err) {
    console.error(`[OG] render failed for ${type}/${id}:`, err);
    return serveFallback(res);
  }
}

async function serveFallback(res) {
  try {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const png = await render(fallbackCard());
    return res.end(png);
  } catch (err) {
    console.error('[OG] fallback render failed:', err);
    return res.status(500).end();
  }
}

// ── /og/game/:id.png ────────────────────────────────────────────────────────
router.get('/game/:id.png', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  if (!id) return serveFallback(res);

  const game = db
    .prepare(
      `SELECT g.*, v.name as venue_name
       FROM games g
       LEFT JOIN venues v ON g.venue_id = v.id
       WHERE g.id = ?`
    )
    .get(id);
  if (!game) return serveFallback(res);

  const participants = db
    .prepare(
      `SELECT gp.*, u.display_name, u.avatar_url
       FROM game_participants gp
       JOIN users u ON gp.user_id = u.id
       WHERE gp.game_id = ?
       ORDER BY gp.team, gp.id`
    )
    .all(id);

  const team1 = participants.filter((p) => p.team === 1);
  const team2 = participants.filter((p) => p.team === 2);
  if (!team1.length || !team2.length) return serveFallback(res);

  let weather = null;
  if (game.weather_json) {
    try {
      weather = JSON.parse(game.weather_json);
    } catch (e) {
      /* ignore */
    }
  }

  const data = {
    game_type: game.game_type,
    league_name: 'Cornhole249',
    played_at: game.played_at,
    team1: team1.map((p) => ({ name: p.display_name, avatarUrl: normalizeAvatarUrl(p.avatar_url) })),
    team2: team2.map((p) => ({ name: p.display_name, avatarUrl: normalizeAvatarUrl(p.avatar_url) })),
    t1Score: team1[0].score,
    t2Score: team2[0].score,
    venue: game.venue_name || null,
    weather: weather
      ? { emoji: weather.emoji, temp_c: weather.temp_c, condition: weather.condition }
      : null,
  };

  return serveCard(res, 'game', id, data, gameCard);
});

// ── /og/player/:id.png ──────────────────────────────────────────────────────
router.get('/player/:id.png', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  if (!id) return serveFallback(res);

  const user = db
    .prepare(
      `SELECT id, display_name, nickname, avatar_url FROM users WHERE id = ?`
    )
    .get(id);
  if (!user) return serveFallback(res);

  // Career stats (uses MAX(score) on opponent team — handles the 2v2 doubled-
  // score issue, same as /api/users/:id).
  const stats = db
    .prepare(
      `SELECT COUNT(*) as gp, SUM(is_winner) as wins, COUNT(*) - SUM(is_winner) as losses
       FROM game_participants WHERE user_id = ?`
    )
    .get(id);

  const diff = db
    .prepare(
      `SELECT SUM(gp.score - opp.total_score) as plus_minus
       FROM game_participants gp
       JOIN (
         SELECT game_id, team, MAX(score) as total_score
         FROM game_participants GROUP BY game_id, team
       ) opp ON opp.game_id = gp.game_id AND opp.team != gp.team
       WHERE gp.user_id = ?`
    )
    .get(id);

  // Current streak — walk recent games, count consecutive same-result.
  const recent = db
    .prepare(
      `SELECT gp.is_winner
       FROM game_participants gp
       JOIN games g ON gp.game_id = g.id
       WHERE gp.user_id = ?
       ORDER BY g.played_at DESC
       LIMIT 30`
    )
    .all(id);
  let streak = '';
  if (recent.length) {
    const first = recent[0].is_winner;
    let n = 0;
    for (const r of recent) {
      if (r.is_winner === first) n++;
      else break;
    }
    streak = (first ? 'W' : 'L') + n;
  }

  const rank_1v1 = computeRank1v1(db, id);
  const rank_2v2 = computeBestRank2v2(db, id);

  const gp = stats.gp || 0;
  const wins = stats.wins || 0;
  const losses = stats.losses || 0;

  const data = {
    display_name: user.display_name,
    nickname: user.nickname || null,
    avatar_url: normalizeAvatarUrl(user.avatar_url),
    gp,
    wins,
    losses,
    win_pct: gp > 0 ? Math.round((wins / gp) * 1000) / 10 : 0,
    plus_minus: diff.plus_minus || 0,
    streak,
    rank_1v1,
    rank_2v2,
  };

  return serveCard(res, 'player', id, data, playerCard);
});

// ── /og/standings.png ───────────────────────────────────────────────────────
// Query string: ?type=1v1|2v2  (default 1v1), ?season=YYYY
router.get('/standings.png', async (req, res) => {
  const db = getDb();
  const type = req.query.type === '2v2' ? '2v2' : '1v1';
  const season = req.query.season ? parseInt(req.query.season) : null;

  const rows =
    type === '2v2'
      ? buildStandings2v2(db, season)
      : buildStandings1v1(db, season);

  const period_label = season
    ? `Standings · ${type.toUpperCase()} · ${season}`
    : `Standings · ${type.toUpperCase()} · All Time`;

  const data = {
    league_name: 'Cornhole249',
    period_label,
    rows: rows.slice(0, 5),
  };

  const id = `${type}-${season || 'all'}`;
  return serveCard(res, 'standings', id, data, standingsCard);
});

// ── /og/tournament/:id.png ──────────────────────────────────────────────────
router.get('/tournament/:id.png', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  if (!id) return serveFallback(res);

  const t = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(id);
  if (!t) return serveFallback(res);

  const matches = db
    .prepare(
      `SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, match_number`
    )
    .all(id);

  // Group matches by round and hydrate team display
  const byRound = {};
  for (const m of matches) {
    if (!byRound[m.round]) byRound[m.round] = [];
    byRound[m.round].push(m);
  }
  const roundNumbers = Object.keys(byRound)
    .map(Number)
    .sort((a, b) => a - b);

  const rounds = roundNumbers.map((r) =>
    byRound[r].map((m) => hydrateMatchForOverview(db, m))
  );

  const data = {
    name: t.name,
    game_type: t.game_type,
    format: t.format,
    status: t.status,
    teams_count: rounds[0] ? rounds[0].length * 2 : null,
    rounds,
  };

  return serveCard(res, 'tournament', id, data, tournamentOverviewCard);
});

// ── /og/tournament/:id/match/:matchId.png ───────────────────────────────────
router.get('/tournament/:id/match/:matchId.png', async (req, res) => {
  const db = getDb();
  const matchId = parseInt(req.params.matchId);
  if (!matchId) return serveFallback(res);

  const match = db.prepare(`SELECT * FROM tournament_matches WHERE id = ?`).get(matchId);
  if (!match) return serveFallback(res);

  const t = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(match.tournament_id);
  if (!t) return serveFallback(res);

  const t1Ids = JSON.parse(match.team1_player_ids || '[]');
  const t2Ids = JSON.parse(match.team2_player_ids || '[]');
  const t1Players = t1Ids.map((uid) => playerObj(db, uid)).filter(Boolean);
  const t2Players = t2Ids.map((uid) => playerObj(db, uid)).filter(Boolean);
  if (!t1Players.length || !t2Players.length) return serveFallback(res);

  const totalRounds = db
    .prepare(`SELECT MAX(round) as r FROM tournament_matches WHERE tournament_id = ?`)
    .get(match.tournament_id).r;

  const data = {
    tournament_name: t.name,
    round_label: roundLabel(totalRounds, match.round),
    game_type: t.game_type,
    team1: t1Players,
    team2: t2Players,
    t1Score: match.score_team1 ?? 0,
    t2Score: match.score_team2 ?? 0,
  };

  return serveCard(res, 'tournament-match', matchId, data, tournamentMatchCard);
});

// ── /og/fallback.png ────────────────────────────────────────────────────────
router.get('/fallback.png', async (req, res) => {
  return serveFallback(res);
});

// ── helpers ─────────────────────────────────────────────────────────────────

function playerName(db, userId) {
  const u = db.prepare(`SELECT display_name FROM users WHERE id = ?`).get(userId);
  return u ? u.display_name : null;
}

function playerObj(db, userId) {
  const u = db.prepare(`SELECT display_name, avatar_url FROM users WHERE id = ?`).get(userId);
  if (!u) return null;
  return { name: u.display_name, avatarUrl: normalizeAvatarUrl(u.avatar_url) };
}

function roundLabel(totalRounds, round) {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quarterfinal';
  return `Round ${round}`;
}

function hydrateMatchForOverview(db, m) {
  const t1Ids = JSON.parse(m.team1_player_ids || '[]');
  const t2Ids = JSON.parse(m.team2_player_ids || '[]');
  // Empty placeholder — render as TBD slot
  if (!t1Ids.length && !t2Ids.length) return null;
  const name = (ids) =>
    ids.map((uid) => playerName(db, uid)).filter(Boolean).join(' & ') || 'TBD';
  return {
    team1: {
      name: name(t1Ids),
      score: m.score_team1 ?? null,
      won: m.winner_team === 1,
    },
    team2: {
      name: name(t2Ids),
      score: m.score_team2 ?? null,
      won: m.winner_team === 2,
    },
  };
}

// 1v1 rank: standings sorted by pts (wins*2) desc, win% desc — find this user.
function computeRank1v1(db, userId) {
  const rows = db
    .prepare(
      `SELECT gp.user_id, COUNT(*) as gp_count, SUM(gp.is_winner) as wins
       FROM game_participants gp
       JOIN games g ON gp.game_id = g.id AND g.game_type = '1v1'
       GROUP BY gp.user_id
       ORDER BY (SUM(gp.is_winner) * 2) DESC, (SUM(gp.is_winner) * 1.0 / COUNT(*)) DESC`
    )
    .all();
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx >= 0 ? idx + 1 : null;
}

// 2v2 rank: best rank across all pairs this user is part of.
function computeBestRank2v2(db, userId) {
  const rows = buildStandings2v2(db, null);
  let best = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].user_ids && rows[i].user_ids.includes(userId)) {
      const rank = i + 1;
      if (best === null || rank < best) best = rank;
    }
  }
  return best;
}

// Replicates /api/standings/1v1 row shape (minus computed streak/last5 for the
// non-target rows — standings card only uses what's listed below).
function buildStandings1v1(db, season) {
  const params = ['1v1'];
  let seasonFilter = '';
  if (season) {
    seasonFilter = 'AND g.season = ?';
    params.push(season);
  }
  const rows = db
    .prepare(
      `SELECT
         gp.user_id,
         u.display_name,
         u.avatar_url,
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
    )
    .all(...params);

  return rows.map((r) => ({
    display_name: r.display_name,
    avatar_url: normalizeAvatarUrl(r.avatar_url),
    gp: r.gp,
    wins: r.wins,
    losses: r.losses,
    pts: r.wins * 2,
    win_pct: r.gp > 0 ? Math.round((r.wins / r.gp) * 1000) / 10 : 0,
    plus_minus: (r.total_scored || 0) - (r.total_against || 0),
    streak: streakFor(db, r.user_id, '1v1', season),
  }));
}

// 2v2 standings — pair-based. Mirrors /api/standings/2v2 logic in standings.js
// but inlined to avoid coupling. Returns rows with display_name set to the
// pair label "A & B" so the standings card can render them.
function buildStandings2v2(db, season) {
  const params = ['2v2'];
  let seasonFilter = '';
  if (season) {
    seasonFilter = 'AND g.season = ?';
    params.push(season);
  }

  const seasonFilterNoAlias = seasonFilter.replace('g.season', 'season');
  const games = db
    .prepare(
      `SELECT id as game_id FROM games WHERE game_type = ? ${seasonFilterNoAlias} ORDER BY played_at ASC`
    )
    .all(...params);

  const pairStats = {};
  for (const game of games) {
    const participants = db
      .prepare(
        `SELECT gp.*, u.display_name, u.avatar_url
         FROM game_participants gp
         JOIN users u ON gp.user_id = u.id
         WHERE gp.game_id = ?
         ORDER BY gp.team`
      )
      .all(game.game_id);

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
          display_name: team.map((p) => p.display_name).join(' & '),
          // Use the first player's avatar for the pair row in the standings card
          avatar_url: normalizeAvatarUrl(team[0].avatar_url),
          gp: 0,
          wins: 0,
          losses: 0,
          total_scored: 0,
          total_against: 0,
        };
      }
      const won = team[0].is_winner === 1;
      pairStats[key].gp++;
      if (won) pairStats[key].wins++;
      else pairStats[key].losses++;
      pairStats[key].total_scored += team[0].score || 0;
      pairStats[key].total_against += opponent[0].score || 0;
    };

    processTeam(team1, team2);
    processTeam(team2, team1);
  }

  return Object.values(pairStats)
    .sort(
      (a, b) =>
        b.wins * 2 - a.wins * 2 ||
        b.wins / b.gp - a.wins / a.gp
    )
    .map((pair) => ({
      display_name: pair.display_name,
      avatar_url: pair.avatar_url,
      user_ids: pair.user_ids,
      gp: pair.gp,
      wins: pair.wins,
      losses: pair.losses,
      pts: pair.wins * 2,
      win_pct: pair.gp > 0 ? Math.round((pair.wins / pair.gp) * 1000) / 10 : 0,
      plus_minus: pair.total_scored - pair.total_against,
      streak: pairStreak(db, pair.user_ids, season),
    }));
}

function streakFor(db, userId, type, season) {
  const params = [userId, type];
  let q = `SELECT gp.is_winner FROM game_participants gp
           JOIN games g ON gp.game_id = g.id
           WHERE gp.user_id = ? AND g.game_type = ?`;
  if (season) {
    q += ` AND g.season = ?`;
    params.push(season);
  }
  q += ` ORDER BY g.played_at DESC LIMIT 20`;
  const rows = db.prepare(q).all(...params);
  if (!rows.length) return '';
  const first = rows[0].is_winner;
  let n = 0;
  for (const r of rows) {
    if (r.is_winner === first) n++;
    else break;
  }
  return (first ? 'W' : 'L') + n;
}

function pairStreak(db, ids, season) {
  const params = [ids[0], ids[1]];
  let q = `SELECT gp1.is_winner FROM games g
           JOIN game_participants gp1 ON gp1.game_id = g.id AND gp1.user_id = ?
           JOIN game_participants gp2 ON gp2.game_id = g.id AND gp2.user_id = ? AND gp2.team = gp1.team
           WHERE g.game_type = '2v2'`;
  if (season) {
    q += ` AND g.season = ?`;
    params.push(season);
  }
  q += ` ORDER BY g.played_at DESC LIMIT 20`;
  const rows = db.prepare(q).all(...params);
  if (!rows.length) return '';
  const first = rows[0].is_winner;
  let n = 0;
  for (const r of rows) {
    if (r.is_winner === first) n++;
    else break;
  }
  return (first ? 'W' : 'L') + n;
}

module.exports = router;
