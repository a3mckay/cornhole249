const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requirePro } = require('../middleware/planAccess');
const { recalculateAllElosBySport } = require('../lib/elo');
const { persistSportRatings } = require('../lib/sportRatings');
const { DEFAULT_SPORT } = require('../lib/sports');
const { evaluateAchievements } = require('../lib/achievements');

// GET /api/tournaments
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { season } = req.query;
    const { rows } = await sql`
      SELECT * FROM tournaments
      WHERE league_id = ${req.leagueId}
      ${season ? sql`AND season = ${parseInt(season)}` : sql``}
      ORDER BY created_at DESC
    `.execute(db);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tournaments/:id
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const tournament = await db
      .selectFrom('tournaments')
      .selectAll()
      .where('id', '=', parseInt(req.params.id))
      .executeTakeFirst();
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const { rows: matches } = await sql`
      SELECT * FROM tournament_matches
      WHERE tournament_id = ${parseInt(req.params.id)}
      ORDER BY round, match_number
    `.execute(db);

    // Hydrate player info
    for (const match of matches) {
      const t1Ids = JSON.parse(match.team1_player_ids || '[]');
      const t2Ids = JSON.parse(match.team2_player_ids || '[]');

      match.team1_players = (await Promise.all(
        t1Ids.map((id) =>
          db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url']).where('id', '=', id).executeTakeFirst()
        )
      )).filter(Boolean);

      match.team2_players = (await Promise.all(
        t2Ids.map((id) =>
          db.selectFrom('users').select(['id', 'display_name', 'nickname', 'avatar_url']).where('id', '=', id).executeTakeFirst()
        )
      )).filter(Boolean);
    }

    res.json({ ...tournament, matches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tournaments
router.post('/', requireAuth, requirePro, async (req, res) => {
  try {
    const db = getDb();
    const { name, format, game_type, season, seeding, teams } = req.body;

    // Check tournament_create_policy
    const { rows: leagueRows } = await sql`
      SELECT tournament_create_policy, tournament_create_allowed_ids FROM leagues WHERE id = ${req.leagueId}
    `.execute(db);
    const tournamentPolicy = leagueRows[0]?.tournament_create_policy || 'admins_only';
    const isLeagueAdmin = ['owner', 'admin'].includes(req.leagueRole) || req.session?.isAdmin;
    if (tournamentPolicy === 'admins_only' && !isLeagueAdmin) {
      return res.status(403).json({ error: 'Only league admins can create tournaments in this league' });
    }
    if (tournamentPolicy === 'select_players' && !isLeagueAdmin) {
      let allowedIds = [];
      try { allowedIds = JSON.parse(leagueRows[0]?.tournament_create_allowed_ids || '[]'); } catch (_) {}
      if (!allowedIds.includes(req.session.userId)) {
        return res.status(403).json({ error: 'You are not authorised to create tournaments in this league' });
      }
    }

    if (!name || !format || !game_type || !season) {
      return res.status(400).json({ error: 'name, format, game_type, season required' });
    }
    if (!['single_elim', 'double_elim'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    if (!['1v1', '2v2'].includes(game_type)) {
      return res.status(400).json({ error: 'Invalid game_type' });
    }

    let seededTeams = teams || [];

    if (seeding === 'balanced' && seededTeams.length > 0) {
      const allPlayerIds = seededTeams.flat();
      const players = (await db
        .selectFrom('users')
        .select(['id', 'elo_rating'])
        .where('id', 'in', allPlayerIds)
        .execute()
      ).sort((a, b) => b.elo_rating - a.elo_rating);

      if (game_type === '2v2') {
        const pairs = [];
        for (let i = 0; i < Math.floor(players.length / 2); i++) {
          pairs.push([players[i].id, players[players.length - 1 - i].id]);
        }
        seededTeams = pairs;
      } else {
        seededTeams = players.map((p) => [p.id]);
      }
    } else if (seeding === 'random') {
      for (let i = seededTeams.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seededTeams[i], seededTeams[j]] = [seededTeams[j], seededTeams[i]];
      }
    }

    const tournament = await db
      .insertInto('tournaments')
      .values({ name, format, game_type, status: 'active', season: parseInt(season), league_id: req.leagueId })
      .returningAll()
      .executeTakeFirstOrThrow();

    await generateBracket(tournament.id, seededTeams, format, db);

    res.status(201).json(tournament);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/tournament-matches/:id (admin)
router.patch('/matches/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const matchId = parseInt(req.params.id);
    const match = await db
      .selectFrom('tournament_matches')
      .selectAll()
      .where('id', '=', matchId)
      .executeTakeFirst();
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const { winner_team, score_team1, score_team2 } = req.body;
    if (!winner_team || ![1, 2].includes(winner_team)) {
      return res.status(400).json({ error: 'winner_team (1 or 2) required' });
    }

    await db
      .updateTable('tournament_matches')
      .set({
        winner_team,
        score_team1: score_team1 || null,
        score_team2: score_team2 || null,
        played_at: new Date().toISOString(),
      })
      .where('id', '=', matchId)
      .execute();

    // Create a game record so this match appears in standings, Elo, achievements
    const matchT1Ids = JSON.parse(match.team1_player_ids || '[]');
    const matchT2Ids = JSON.parse(match.team2_player_ids || '[]');
    const tournamentRow = await db
      .selectFrom('tournaments')
      .selectAll()
      .where('id', '=', match.tournament_id)
      .executeTakeFirst();

    if (matchT1Ids.length && matchT2Ids.length && score_team1 != null && score_team2 != null) {
      const s1 = parseInt(score_team1);
      const s2 = parseInt(score_team2);

      const newGame = await db
        .insertInto('games')
        .values({
          game_type: tournamentRow.game_type,
          played_at: new Date().toISOString(),
          season: tournamentRow.season,
          submitted_by_user_id: req.session.userId,
          tournament_match_id: matchId,
          league_id: tournamentRow.league_id || req.leagueId,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      const gameId = newGame.id;

      for (const userId of matchT1Ids) {
        await db.insertInto('game_participants').values({
          game_id: gameId, user_id: userId, team: 1, score: s1, is_winner: winner_team === 1 ? 1 : 0,
        }).execute();
      }
      for (const userId of matchT2Ids) {
        await db.insertInto('game_participants').values({
          game_id: gameId, user_id: userId, team: 2, score: s2, is_winner: winner_team === 2 ? 1 : 0,
        }).execute();
      }

      // Link game back to match
      await db.updateTable('tournament_matches').set({ game_id: gameId }).where('id', '=', matchId).execute();

      // Update Elos — per-sport (WS-E), so a tournament result only moves the
      // rating for its own sport. persistSportRatings mirrors cornhole into
      // users.elo_rating.
      const { rows: allGames } = await sql`SELECT * FROM games ORDER BY played_at ASC`.execute(db);
      const { rows: allParts } = await sql`SELECT * FROM game_participants`.execute(db);
      const { rows: leagueRows } = await sql`SELECT id, sport FROM leagues`.execute(db);
      const sportByLeague = new Map(leagueRows.map((l) => [l.id, l.sport]));
      const resolveSport = (game) => sportByLeague.get(game.league_id) || DEFAULT_SPORT;
      const bySport = recalculateAllElosBySport(allGames, allParts, resolveSport);
      await persistSportRatings(db, bySport);

      // Evaluate achievements
      try { await evaluateAchievements(gameId); } catch (e) { console.warn('[Achievements]', e.message); }
    }

    // Auto-advance winner to next match
    if (match.next_match_id) {
      const nextMatch = await db
        .selectFrom('tournament_matches')
        .selectAll()
        .where('id', '=', match.next_match_id)
        .executeTakeFirst();
      if (nextMatch) {
        const winnerIds = winner_team === 1
          ? JSON.parse(match.team1_player_ids)
          : JSON.parse(match.team2_player_ids);

        const t1Ids = JSON.parse(nextMatch.team1_player_ids);
        if (!t1Ids.length) {
          await db.updateTable('tournament_matches')
            .set({ team1_player_ids: JSON.stringify(winnerIds) })
            .where('id', '=', nextMatch.id)
            .execute();
        } else {
          await db.updateTable('tournament_matches')
            .set({ team2_player_ids: JSON.stringify(winnerIds) })
            .where('id', '=', nextMatch.id)
            .execute();
        }
      }
    }

    // Check if tournament is complete
    const tournament = await db
      .selectFrom('tournaments')
      .selectAll()
      .where('id', '=', match.tournament_id)
      .executeTakeFirst();

    const { rows: pendingRows } = await sql`
      SELECT COUNT(*) as c FROM tournament_matches
      WHERE tournament_id = ${match.tournament_id}
        AND winner_team IS NULL
        AND team1_player_ids != '[]'
        AND team2_player_ids != '[]'
    `.execute(db);

    if (parseInt(pendingRows[0].c) === 0 && tournament.status !== 'complete') {
      await db.updateTable('tournaments')
        .set({ status: 'complete' })
        .where('id', '=', match.tournament_id)
        .execute();
    }

    const updated = await db
      .selectFrom('tournament_matches')
      .selectAll()
      .where('id', '=', matchId)
      .executeTakeFirstOrThrow();

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function generateBracket(tournamentId, teams, format, db) {
  const n = teams.length;
  if (n < 2) return;

  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const seeded = [...teams];
  while (seeded.length < bracketSize) seeded.push([]);

  const rounds = Math.log2(bracketSize);
  const allMatches = [];

  // First round
  for (let i = 0; i < bracketSize / 2; i++) {
    const t1 = seeded[i * 2] || [];
    const t2 = seeded[i * 2 + 1] || [];
    const match = await db
      .insertInto('tournament_matches')
      .values({
        tournament_id: tournamentId, round: 1, match_number: i + 1,
        team1_player_ids: JSON.stringify(t1), team2_player_ids: JSON.stringify(t2),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    allMatches.push({ id: match.id, round: 1, match_number: i + 1 });
  }

  // Subsequent rounds
  for (let round = 2; round <= rounds; round++) {
    const prevRoundMatches = allMatches.filter((m) => m.round === round - 1);
    const matchCount = prevRoundMatches.length / 2;
    for (let i = 0; i < matchCount; i++) {
      const match = await db
        .insertInto('tournament_matches')
        .values({
          tournament_id: tournamentId, round, match_number: i + 1,
          team1_player_ids: '[]', team2_player_ids: '[]',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();

      allMatches.push({ id: match.id, round, match_number: i + 1 });

      const src1 = prevRoundMatches[i * 2];
      const src2 = prevRoundMatches[i * 2 + 1];
      if (src1) await db.updateTable('tournament_matches').set({ next_match_id: match.id }).where('id', '=', src1.id).execute();
      if (src2) await db.updateTable('tournament_matches').set({ next_match_id: match.id }).where('id', '=', src2.id).execute();
    }
  }

  // Auto-advance byes in round 1
  for (let i = 0; i < bracketSize / 2; i++) {
    const t1 = seeded[i * 2] || [];
    const t2 = seeded[i * 2 + 1] || [];
    if (!t1.length || !t2.length) {
      const winner = t1.length ? 1 : 2;
      const matchRow = allMatches.find((m) => m.round === 1 && m.match_number === i + 1);
      if (matchRow) {
        await db.updateTable('tournament_matches')
          .set({ winner_team: winner })
          .where('id', '=', matchRow.id)
          .execute();
      }
    }
  }
}

module.exports = router;
