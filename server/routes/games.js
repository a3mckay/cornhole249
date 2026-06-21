const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { evaluateAchievements } = require('../lib/achievements');
const { recalculateAllElosBySport } = require('../lib/elo');
const { persistSportRatings } = require('../lib/sportRatings');
const { DEFAULT_SPORT, getSport } = require('../lib/sports');
const { gameFitsMatch, parseIds } = require('../lib/matches');
const { recomputeMatch } = require('../lib/matchSync');
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

// GET /api/games/pending — pending games awaiting approval by the current user's opposing team
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.userId;

    const { rows: games } = await sql`
      SELECT g.*, v.name as venue_name
      FROM games g LEFT JOIN venues v ON g.venue_id = v.id
      WHERE g.league_id = ${req.leagueId}
        AND g.status IN ('pending_approval', 'disputed')
      ORDER BY g.played_at DESC
    `.execute(db);

    await Promise.all(games.map(async (game) => {
      const { rows: parts } = await sql`
        SELECT gp.*, u.display_name, u.nickname, u.avatar_url
        FROM game_participants gp JOIN users u ON gp.user_id = u.id
        WHERE gp.game_id = ${game.id}
        ORDER BY gp.team, gp.id
      `.execute(db);
      game.participants = parts;
    }));

    for (const game of games) {
      const submittedByMe = game.submitted_by_user_id === userId;
      const isParticipant = game.participants.some((p) => p.user_id === userId);
      const myTeam = game.participants.find((p) => p.user_id === userId)?.team;
      const submitterTeam = game.participants.find((p) => p.user_id === game.submitted_by_user_id)?.team;
      game.can_approve = !submittedByMe && isParticipant && myTeam !== submitterTeam && game.status === 'pending_approval';
      game.submitted_by_me = submittedByMe;
    }

    res.json(games);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/submissions — pending both_submit submissions for current user's league
router.get('/submissions', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: subs } = await sql`
      SELECT pgs.*, u.display_name as submitter_name
      FROM pending_game_submissions pgs
      JOIN users u ON u.id = pgs.submitter_user_id
      WHERE pgs.league_id = ${req.leagueId}
      ORDER BY pgs.created_at DESC
    `.execute(db);

    for (const sub of subs) {
      const t1Ids = JSON.parse(sub.team1_player_ids || '[]');
      const t2Ids = JSON.parse(sub.team2_player_ids || '[]');
      const allIds = [...t1Ids, ...t2Ids];
      if (allIds.length) {
        const players = await db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url']).where('id', 'in', allIds).execute();
        const byId = Object.fromEntries(players.map((p) => [p.id, p]));
        sub.team1_players = t1Ids.map((id) => byId[id]).filter(Boolean);
        sub.team2_players = t2Ids.map((id) => byId[id]).filter(Boolean);
      } else {
        sub.team1_players = [];
        sub.team2_players = [];
      }
      sub.submitted_by_me = sub.submitter_user_id === req.session.userId;
    }

    res.json(subs);
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
    const {
      game_type, played_at, season, venue_id, team1, team2,
      // Pool variant fields (ignored for cornhole leagues).
      game_variant = null,
      eight_ball_end_condition = null,
      balls_remaining = null,
      // Optional match/series this game belongs to (ROADMAP WS-G).
      match_id = null,
    } = req.body;

    // Resolve the league's sport up-front. Pool leagues unlock the 'cutthroat'
    // game_type and variant fields; cornhole leagues keep the original
    // 1v1/2v2-only behavior with no variant data.
    const { rows: sportRows } = await sql`SELECT sport FROM leagues WHERE id = ${req.leagueId}`.execute(db);
    const leagueSport = sportRows[0]?.sport || DEFAULT_SPORT;
    const isPool = leagueSport === 'pool';
    // Indoor sports (pool, …) skip weather entirely. Treat an undefined flag as
    // outdoor so existing/unknown sports keep fetching weather (cornhole = true).
    const isOutdoor = getSport(leagueSport).outdoor !== false;

    const allowedTypes = isPool ? ['1v1', '2v2', 'cutthroat'] : ['1v1', '2v2'];
    if (!game_type || !allowedTypes.includes(game_type)) {
      return res.status(400).json({ error: 'Invalid game_type' });
    }
    if (isPool && game_variant && !['eight_ball', 'nine_ball', 'cutthroat', 'straight_pool'].includes(game_variant)) {
      return res.status(400).json({ error: 'Invalid game_variant' });
    }
    if (!team1 || !team2 || !Array.isArray(team1) || !Array.isArray(team2)) {
      return res.status(400).json({ error: 'team1 and team2 required as arrays' });
    }

    const t1Ids = team1.map((p) => p.user_id);
    const t2Ids = team2.map((p) => p.user_id);
    if (t1Ids.filter((id) => t2Ids.includes(id)).length > 0) {
      return res.status(400).json({ error: 'A player cannot be on both teams' });
    }

    // Match attachment (WS-G): the game must belong to an open match in this
    // league whose two sides are exactly these two teams (in either orientation).
    let matchId = null;
    if (match_id != null) {
      const match = await db.selectFrom('matches').selectAll()
        .where('id', '=', parseInt(match_id)).where('league_id', '=', req.leagueId).executeTakeFirst();
      if (!match) return res.status(400).json({ error: 'Match not found' });
      if (match.status !== 'open') return res.status(400).json({ error: 'This match is already complete' });
      if (!gameFitsMatch(t1Ids, t2Ids, parseIds(match.side1_player_ids), parseIds(match.side2_player_ids))) {
        return res.status(400).json({ error: "Game players don't match this match's sides" });
      }
      matchId = match.id;
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

    // Cutthroat (pool): 1 winner (team1) + 2 losers (team2), no numeric scores.
    const isCutthroat = game_type === 'cutthroat';
    let t1Score = 0;
    let t2Score = 0;

    if (isCutthroat) {
      if (team1.length !== 1 || team2.length !== 2) {
        return res.status(400).json({ error: 'Cutthroat requires exactly 1 winner (team1) and 2 losers (team2)' });
      }
    } else {
      t1Score = team1[0]?.score ?? 0;
      t2Score = team2[0]?.score ?? 0;

      if (team1.some((p) => (p.score || 0) < 0) || team2.some((p) => (p.score || 0) < 0)) {
        return res.status(400).json({ error: 'Scores must be non-negative' });
      }
      if (team1.some((p) => (p.score || 0) > 99) || team2.some((p) => (p.score || 0) > 99)) {
        return res.status(400).json({ error: 'Score seems too high' });
      }
      if (t1Score === t2Score) {
        return res.status(400).json({ error: 'Games cannot end in a tie' });
      }
    }

    // team1 always holds the winner for cutthroat; otherwise higher score wins.
    const isTeam1Winner = isCutthroat ? true : (t1Score > t2Score);

    // Pool 8-ball extras. Only meaningful for pool eight_ball games; null else.
    const validatedBallsRemaining =
      balls_remaining !== null && balls_remaining !== undefined && !isNaN(parseInt(balls_remaining))
        ? Math.min(7, Math.max(0, parseInt(balls_remaining)))
        : null;
    const endCondition =
      isPool && game_variant === 'eight_ball' && ['sunk', 'scratch'].includes(eight_ball_end_condition)
        ? eight_ball_end_condition
        : null;
    // Persisted variant + per-loser balls_remaining helpers.
    const persistVariant = isPool ? (game_variant || null) : null;
    const loserBalls = (isPool && game_variant === 'eight_ball') ? validatedBallsRemaining : null;

    // ── Fetch league settings (rules + policies) ─────────────────────────────
    const { rows: leagueRows } = await sql`
      SELECT rules, custom_rules_json, score_submit_policy, score_submit_allowed_ids, score_verify_mode
      FROM leagues WHERE id = ${req.leagueId}
    `.execute(db);
    const league = leagueRows[0] || {};

    // ── Submit policy check ──────────────────────────────────────────────────
    const submitPolicy = league.score_submit_policy || 'all_members';
    const isLeagueAdmin = ['owner', 'admin'].includes(req.leagueRole);
    if (submitPolicy === 'admins_only' && !isLeagueAdmin) {
      return res.status(403).json({ error: 'Only league admins can submit scores in this league' });
    }
    if (submitPolicy === 'select_players' && !isLeagueAdmin) {
      let allowedIds = [];
      try { allowedIds = JSON.parse(league.score_submit_allowed_ids || '[]'); } catch (_) {}
      if (!allowedIds.includes(req.session.userId)) {
        return res.status(403).json({ error: 'You are not authorised to submit scores in this league' });
      }
    }

    // ── Custom rules validation ──────────────────────────────────────────────
    const leagueRules = league.rules;
    const customRules = league.custom_rules_json;
    if (!isCutthroat && leagueRules === 'custom' && customRules) {
      const target = customRules.target_score;
      const winBy  = customRules.win_by ?? 1;
      const winner = Math.max(t1Score, t2Score);
      const loser  = Math.min(t1Score, t2Score);
      if (target && winner < target) {
        return res.status(400).json({ error: `Winning score must be at least ${target} (custom rules)` });
      }
      if (winBy > 1 && (winner - loser) < winBy) {
        return res.status(400).json({ error: `Win by ${winBy} required (custom rules)` });
      }
    }

    const gameDate = played_at ? new Date(played_at) : new Date();
    const gameSeason = season || gameDate.getFullYear();
    const verifyMode = league.score_verify_mode || 'immediate';

    // ── both_submit mode: store submission and try to match ──────────────────
    if (verifyMode === 'both_submit') {
      const submitterTeam = t1Ids.includes(req.session.userId) ? 1 : 2;

      const newSub = await db
        .insertInto('pending_game_submissions')
        .values({
          league_id: req.leagueId,
          submitter_user_id: req.session.userId,
          submitter_team: submitterTeam,
          game_type,
          played_at: gameDate.toISOString(),
          season: gameSeason,
          venue_id: venue_id || null,
          team1_player_ids: JSON.stringify(t1Ids),
          team2_player_ids: JSON.stringify(t2Ids),
          team1_score: t1Score,
          team2_score: t2Score,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Look for a matching submission from the opposing team (within 48h)
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { rows: existing } = await sql`
        SELECT * FROM pending_game_submissions
        WHERE league_id = ${req.leagueId}
          AND id != ${newSub.id}
          AND created_at > ${cutoff}
      `.execute(db);

      const normalizeIds = (arr) => [...arr].sort((a, b) => a - b).join(',');
      const newT1 = normalizeIds(t1Ids);
      const newT2 = normalizeIds(t2Ids);

      let match = null;
      for (const sub of existing) {
        const subT1 = normalizeIds(JSON.parse(sub.team1_player_ids || '[]'));
        const subT2 = normalizeIds(JSON.parse(sub.team2_player_ids || '[]'));
        if (subT1 === newT1 && subT2 === newT2) {
          match = { sub, flipped: false };
          break;
        }
        if (subT1 === newT2 && subT2 === newT1) {
          match = { sub, flipped: true };
          break;
        }
      }

      if (!match) {
        return res.status(202).json({ pending: true, submission_id: newSub.id, message: 'Submission recorded. Waiting for the other team to submit.' });
      }

      // Check if scores agree
      const { sub, flipped } = match;
      const scoresMatch = flipped
        ? (t1Score === sub.team2_score && t2Score === sub.team1_score)
        : (t1Score === sub.team1_score && t2Score === sub.team2_score);

      const gameStatus = scoresMatch ? 'official' : 'disputed';

      const newGame = await db
        .insertInto('games')
        .values({
          game_type,
          game_variant: persistVariant,
          eight_ball_end_condition: endCondition,
          played_at: gameDate.toISOString(),
          season: gameSeason,
          venue_id: venue_id || null,
          submitted_by_user_id: req.session.userId,
          league_id: req.leagueId,
          status: gameStatus,
          match_id: matchId,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const gameId = newGame.id;
      for (const p of team1) {
        await db.insertInto('game_participants').values({ game_id: gameId, user_id: p.user_id, team: 1, score: isCutthroat ? 1 : (p.score || 0), is_winner: isTeam1Winner ? 1 : 0, balls_remaining: isTeam1Winner ? null : loserBalls }).execute();
      }
      for (const p of team2) {
        await db.insertInto('game_participants').values({ game_id: gameId, user_id: p.user_id, team: 2, score: isCutthroat ? 0 : (p.score || 0), is_winner: isTeam1Winner ? 0 : 1, balls_remaining: isTeam1Winner ? loserBalls : null }).execute();
      }

      // Remove both matched submissions
      await db.deleteFrom('pending_game_submissions').where('id', 'in', [newSub.id, sub.id]).execute();

      if (gameStatus === 'official') {
        await updateElosAfterGame(gameId, db);
        evaluateAchievements(gameId).catch((e) => console.warn('[Achievements]', e.message));
      }
      if (matchId) await recomputeMatch(db, matchId);

      if (venue_id && isOutdoor) {
        const venue = await db.selectFrom('venues').select(['lat', 'lng']).where('id', '=', venue_id).executeTakeFirst();
        if (venue?.lat && venue?.lng) {
          fetchWeatherForGame(venue.lat, venue.lng, gameDate.toISOString()).then(async (weather) => {
            if (weather) await db.updateTable('games').set({ weather_json: JSON.stringify(weather) }).where('id', '=', gameId).execute();
          }).catch(() => {});
        }
      }

      const { rows: gameRows } = await sql`SELECT * FROM games WHERE id = ${gameId}`.execute(db);
      return res.status(201).json({ ...gameRows[0], scores_matched: scoresMatch });
    }

    // ── opponent_approve or immediate ────────────────────────────────────────
    const gameStatus = verifyMode === 'opponent_approve' ? 'pending_approval' : 'official';

    const newGame = await db
      .insertInto('games')
      .values({
        game_type,
        game_variant: persistVariant,
        eight_ball_end_condition: endCondition,
        played_at: gameDate.toISOString(),
        season: gameSeason,
        venue_id: venue_id || null,
        submitted_by_user_id: req.session.userId,
        league_id: req.leagueId,
        status: gameStatus,
        match_id: matchId,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const gameId = newGame.id;

    for (const p of team1) {
      await db.insertInto('game_participants').values({ game_id: gameId, user_id: p.user_id, team: 1, score: isCutthroat ? 1 : (p.score || 0), is_winner: isTeam1Winner ? 1 : 0, balls_remaining: isTeam1Winner ? null : loserBalls }).execute();
    }
    for (const p of team2) {
      await db.insertInto('game_participants').values({ game_id: gameId, user_id: p.user_id, team: 2, score: isCutthroat ? 0 : (p.score || 0), is_winner: isTeam1Winner ? 0 : 1, balls_remaining: isTeam1Winner ? loserBalls : null }).execute();
    }

    if (gameStatus === 'official') {
      await updateElosAfterGame(gameId, db);
      evaluateAchievements(gameId).catch((e) => console.warn('[Achievements]', e.message));
    }
    // Update the parent match's running score / completion (WS-G).
    if (matchId) await recomputeMatch(db, matchId);

    if (venue_id && isOutdoor) {
      const venue = await db.selectFrom('venues').select(['lat', 'lng']).where('id', '=', venue_id).executeTakeFirst();
      if (venue?.lat && venue?.lng) {
        fetchWeatherForGame(venue.lat, venue.lng, gameDate.toISOString()).then(async (weather) => {
          if (weather) await db.updateTable('games').set({ weather_json: JSON.stringify(weather) }).where('id', '=', gameId).execute();
        }).catch(() => {});
      }
    }

    const { rows: gameRows } = await sql`SELECT * FROM games WHERE id = ${gameId}`.execute(db);
    res.status(201).json(gameRows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/approve — approve a pending_approval game (opposing team player)
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const gameId = parseInt(req.params.id);
    const userId = req.session.userId;

    const game = await db.selectFrom('games').selectAll().where('id', '=', gameId).where('league_id', '=', req.leagueId).executeTakeFirst();
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'pending_approval') return res.status(409).json({ error: 'Game is not pending approval' });

    const { rows: parts } = await sql`SELECT * FROM game_participants WHERE game_id = ${gameId}`.execute(db);
    const myPart = parts.find((p) => p.user_id === userId);
    if (!myPart) return res.status(403).json({ error: 'You are not a participant in this game' });

    const submitterPart = parts.find((p) => p.user_id === game.submitted_by_user_id);
    if (submitterPart && myPart.team === submitterPart.team) {
      return res.status(403).json({ error: 'Only a player from the opposing team can approve this game' });
    }

    await db.updateTable('games').set({ status: 'official' }).where('id', '=', gameId).execute();
    await updateElosAfterGame(gameId, db);
    evaluateAchievements(gameId).catch((e) => console.warn('[Achievements]', e.message));

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/dispute — dispute a pending_approval game (opposing team player)
router.post('/:id/dispute', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const gameId = parseInt(req.params.id);
    const userId = req.session.userId;

    const game = await db.selectFrom('games').selectAll().where('id', '=', gameId).where('league_id', '=', req.leagueId).executeTakeFirst();
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'pending_approval') return res.status(409).json({ error: 'Game is not pending approval' });

    const { rows: parts } = await sql`SELECT * FROM game_participants WHERE game_id = ${gameId}`.execute(db);
    const myPart = parts.find((p) => p.user_id === userId);
    if (!myPart) return res.status(403).json({ error: 'You are not a participant in this game' });

    const submitterPart = parts.find((p) => p.user_id === game.submitted_by_user_id);
    if (submitterPart && myPart.team === submitterPart.team) {
      return res.status(403).json({ error: 'Only a player from the opposing team can dispute this game' });
    }

    await db.updateTable('games').set({ status: 'disputed' }).where('id', '=', gameId).execute();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/games/submissions/:id — retract a pending submission (submitter only)
router.delete('/submissions/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const sub = await db.selectFrom('pending_game_submissions').selectAll().where('id', '=', parseInt(req.params.id)).executeTakeFirst();
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (sub.submitter_user_id !== req.session.userId) return res.status(403).json({ error: 'You can only retract your own submissions' });
    await db.deleteFrom('pending_game_submissions').where('id', '=', sub.id).execute();
    res.json({ ok: true });
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

    const { played_at, venue_id, game_type, t1_score, t2_score, balls_remaining } = req.body;
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

      // If this edit flips the winner, any recorded loser balls_remaining (pool
      // 8-ball) described the OLD loser's table and no longer applies — and the
      // edit form gives no way to re-enter it. Clear it so the UI shows "—" and
      // the Elo margin falls back to flat rather than asserting a wrong count.
      // No-op for cornhole (balls_remaining is always null there).
      const priorT1 = await db.selectFrom('game_participants')
        .select(['is_winner']).where('game_id', '=', gameId).where('team', '=', 1)
        .executeTakeFirst();
      const winnerFlipped = priorT1 != null && (priorT1.is_winner === 1) !== t1Won;
      const ballsPatch = winnerFlipped ? { balls_remaining: null } : {};

      await db.updateTable('game_participants')
        .set({ score: s1, is_winner: t1Won ? 1 : 0, ...ballsPatch })
        .where('game_id', '=', gameId)
        .where('team', '=', 1)
        .execute();
      await db.updateTable('game_participants')
        .set({ score: s2, is_winner: t1Won ? 0 : 1, ...ballsPatch })
        .where('game_id', '=', gameId)
        .where('team', '=', 2)
        .execute();

      await updateElosAfterGame(gameId, db);
    }

    // Correct the ball margin (pool 8-ball): balls live on the LOSING row(s); the
    // winner stays null. The margin feeds Elo, so recompute after.
    if (balls_remaining !== undefined && game.game_variant === 'eight_ball') {
      const clamped = (balls_remaining === null || balls_remaining === '' || isNaN(parseInt(balls_remaining)))
        ? null
        : Math.min(7, Math.max(0, parseInt(balls_remaining)));
      await db.updateTable('game_participants').set({ balls_remaining: null }).where('game_id', '=', gameId).where('is_winner', '=', 1).execute();
      await db.updateTable('game_participants').set({ balls_remaining: clamped }).where('game_id', '=', gameId).where('is_winner', '=', 0).execute();
      await updateElosAfterGame(gameId, db);
    }

    const updated = await db.selectFrom('games').selectAll().where('id', '=', gameId).executeTakeFirstOrThrow();

    // Indoor sports skip weather (see create path). Resolve from the game's league.
    const { rows: editSportRows } = await sql`SELECT sport FROM leagues WHERE id = ${game.league_id}`.execute(db);
    const editIsOutdoor = getSport(editSportRows[0]?.sport || DEFAULT_SPORT).outdoor !== false;

    const venueChanged = venue_id !== undefined && (venue_id || null) !== (game.venue_id || null);
    const dateChanged = played_at !== undefined && played_at !== game.played_at;
    if ((venueChanged || dateChanged) && editIsOutdoor) {
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
  const { rows: games } = await sql`SELECT * FROM games WHERE status = 'official' OR status IS NULL ORDER BY played_at ASC`.execute(db);
  const officialIds = new Set(games.map((g) => g.id));
  const { rows: allParticipants } = await sql`SELECT * FROM game_participants`.execute(db);
  const participants = allParticipants.filter((p) => officialIds.has(p.game_id));

  // Resolve each game's sport from its league so the per-sport ELO marginFn is
  // used (pool reads balls_remaining; cornhole reads point margin). Default to
  // cornhole for any game whose league sport can't be resolved — keeps existing
  // cornhole ratings byte-identical.
  const { rows: leagueRows } = await sql`SELECT id, sport FROM leagues`.execute(db);
  const sportByLeague = new Map(leagueRows.map((l) => [l.id, l.sport]));
  const resolveSport = (game) => sportByLeague.get(game.league_id) || DEFAULT_SPORT;

  // Per-sport ratings (WS-E): each sport's history replays in isolation so a
  // pool result never moves a cornhole rating. persistSportRatings writes the
  // table and mirrors cornhole into users.elo_rating.
  const bySport = recalculateAllElosBySport(games, participants, resolveSport);
  await persistSportRatings(db, bySport);
}

module.exports = router;
