const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { recalculateAllElos } = require('../lib/elo');
const { evaluateAchievements } = require('../lib/achievements');

// GET /api/tournaments
router.get('/', (req, res) => {
  const db = getDb();
  const { season } = req.query;
  let query = `SELECT * FROM tournaments`;
  const params = [];
  if (season) { query += ` WHERE season = ?`; params.push(parseInt(season)); }
  query += ` ORDER BY created_at DESC`;

  const tournaments = db.prepare(query).all(...params);
  res.json(tournaments);
});

// GET /api/tournaments/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const tournament = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  const matches = db.prepare(
    `SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, match_number`
  ).all(req.params.id);

  // Hydrate player info
  for (const match of matches) {
    const t1Ids = JSON.parse(match.team1_player_ids || '[]');
    const t2Ids = JSON.parse(match.team2_player_ids || '[]');
    match.team1_players = t1Ids.map((id) =>
      db.prepare(`SELECT id, display_name, nickname, avatar_url FROM users WHERE id = ?`).get(id)
    ).filter(Boolean);
    match.team2_players = t2Ids.map((id) =>
      db.prepare(`SELECT id, display_name, nickname, avatar_url FROM users WHERE id = ?`).get(id)
    ).filter(Boolean);
  }

  res.json({ ...tournament, matches });
});

// POST /api/tournaments (admin)
router.post('/', requireAdmin, (req, res) => {
  const db = getDb();
  const { name, format, game_type, season, seeding, teams } = req.body;

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
    // For 1v1, rank players by Elo; for 2v2, snake-draft
    const allPlayerIds = seededTeams.flat();
    const players = allPlayerIds.map((id) =>
      db.prepare(`SELECT id, elo_rating FROM users WHERE id = ?`).get(id)
    ).filter(Boolean).sort((a, b) => b.elo_rating - a.elo_rating);

    if (game_type === '2v2') {
      // Snake draft into pairs
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

  const result = db.prepare(
    `INSERT INTO tournaments (name, format, game_type, status, season) VALUES (?, ?, ?, 'active', ?)`
  ).run(name, format, game_type, parseInt(season));

  const tournamentId = result.lastInsertRowid;

  // Generate bracket
  generateBracket(tournamentId, seededTeams, format, db);

  const tournament = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(tournamentId);
  res.status(201).json(tournament);
});

// PATCH /api/tournament-matches/:id (admin)
router.patch('/matches/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const match = db.prepare(`SELECT * FROM tournament_matches WHERE id = ?`).get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { winner_team, score_team1, score_team2 } = req.body;
  if (!winner_team || ![1, 2].includes(winner_team)) {
    return res.status(400).json({ error: 'winner_team (1 or 2) required' });
  }

  db.prepare(
    `UPDATE tournament_matches SET winner_team = ?, score_team1 = ?, score_team2 = ?, played_at = datetime('now') WHERE id = ?`
  ).run(winner_team, score_team1 || null, score_team2 || null, req.params.id);

  // Create a game record so this match appears in Recent Games, stats, Elo, etc.
  const matchT1Ids = JSON.parse(match.team1_player_ids || '[]');
  const matchT2Ids = JSON.parse(match.team2_player_ids || '[]');
  const tournamentRow = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(match.tournament_id);
  if (matchT1Ids.length && matchT2Ids.length && score_team1 != null && score_team2 != null) {
    const s1 = parseInt(score_team1);
    const s2 = parseInt(score_team2);
    const gameInsert = db.prepare(
      `INSERT INTO games (game_type, played_at, season, submitted_by_user_id, tournament_match_id)
       VALUES (?, datetime('now'), ?, ?, ?)`
    ).run(tournamentRow.game_type, tournamentRow.season, req.session.userId, match.id);
    const gameId = gameInsert.lastInsertRowid;

    const insertParticipant = db.prepare(
      `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, ?, ?)`
    );
    for (const userId of matchT1Ids) {
      insertParticipant.run(gameId, userId, 1, s1, winner_team === 1 ? 1 : 0);
    }
    for (const userId of matchT2Ids) {
      insertParticipant.run(gameId, userId, 2, s2, winner_team === 2 ? 1 : 0);
    }

    // Link game back to this match
    db.prepare(`UPDATE tournament_matches SET game_id = ? WHERE id = ?`).run(gameId, match.id);

    // Update Elos
    const allGames = db.prepare(`SELECT * FROM games ORDER BY played_at ASC`).all();
    const allParticipants = db.prepare(`SELECT * FROM game_participants`).all();
    const newElos = recalculateAllElos(allGames, allParticipants);
    const updateElo = db.prepare(`UPDATE users SET elo_rating = ? WHERE id = ?`);
    db.transaction((elos) => {
      for (const [uid, elo] of Object.entries(elos)) updateElo.run(elo, parseInt(uid));
    })(newElos);

    // Evaluate achievements
    try { evaluateAchievements(gameId); } catch (e) { console.warn('[Achievements]', e.message); }
  }

  // Auto-advance winner to next match
  if (match.next_match_id) {
    const nextMatch = db.prepare(`SELECT * FROM tournament_matches WHERE id = ?`).get(match.next_match_id);
    if (nextMatch) {
      const winnerIds = winner_team === 1
        ? JSON.parse(match.team1_player_ids)
        : JSON.parse(match.team2_player_ids);

      // Fill team1 first, then team2
      const t1Ids = JSON.parse(nextMatch.team1_player_ids);
      if (!t1Ids.length) {
        db.prepare(`UPDATE tournament_matches SET team1_player_ids = ? WHERE id = ?`)
          .run(JSON.stringify(winnerIds), nextMatch.id);
      } else {
        db.prepare(`UPDATE tournament_matches SET team2_player_ids = ? WHERE id = ?`)
          .run(JSON.stringify(winnerIds), nextMatch.id);
      }
    }
  }

  // Check if tournament is complete
  const tournament = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(match.tournament_id);
  const pendingMatches = db.prepare(
    `SELECT COUNT(*) as c FROM tournament_matches WHERE tournament_id = ? AND winner_team IS NULL AND team1_player_ids != '[]' AND team2_player_ids != '[]'`
  ).get(match.tournament_id);

  if (pendingMatches.c === 0 && tournament.status !== 'complete') {
    db.prepare(`UPDATE tournaments SET status = 'complete' WHERE id = ?`).run(match.tournament_id);
  }

  const updated = db.prepare(`SELECT * FROM tournament_matches WHERE id = ?`).get(req.params.id);
  res.json(updated);
});

function generateBracket(tournamentId, teams, format, db) {
  const n = teams.length;
  if (n < 2) return;

  // Round up to next power of 2
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));

  // Pad with byes
  const seeded = [...teams];
  while (seeded.length < bracketSize) seeded.push([]);

  // Single elimination: create all matches
  const rounds = Math.log2(bracketSize);
  const allMatches = [];

  // First round
  for (let i = 0; i < bracketSize / 2; i++) {
    const t1 = seeded[i * 2] || [];
    const t2 = seeded[i * 2 + 1] || [];
    const match = db.prepare(
      `INSERT INTO tournament_matches (tournament_id, round, match_number, team1_player_ids, team2_player_ids) VALUES (?, ?, ?, ?, ?)`
    ).run(tournamentId, 1, i + 1, JSON.stringify(t1), JSON.stringify(t2));
    allMatches.push({ id: match.lastInsertRowid, round: 1, match_number: i + 1 });
  }

  // Subsequent rounds — create empty placeholder matches and link them
  for (let round = 2; round <= rounds; round++) {
    const prevRoundMatches = allMatches.filter((m) => m.round === round - 1);
    const matchCount = prevRoundMatches.length / 2;
    for (let i = 0; i < matchCount; i++) {
      const match = db.prepare(
        `INSERT INTO tournament_matches (tournament_id, round, match_number, team1_player_ids, team2_player_ids) VALUES (?, ?, ?, '[]', '[]')`
      ).run(tournamentId, round, i + 1);

      allMatches.push({ id: match.lastInsertRowid, round, match_number: i + 1 });

      // Link previous round's matches to this one
      const src1 = prevRoundMatches[i * 2];
      const src2 = prevRoundMatches[i * 2 + 1];
      if (src1) db.prepare(`UPDATE tournament_matches SET next_match_id = ? WHERE id = ?`).run(match.lastInsertRowid, src1.id);
      if (src2) db.prepare(`UPDATE tournament_matches SET next_match_id = ? WHERE id = ?`).run(match.lastInsertRowid, src2.id);
    }
  }

  // Auto-advance byes in round 1
  for (let i = 0; i < bracketSize / 2; i++) {
    const t1 = seeded[i * 2] || [];
    const t2 = seeded[i * 2 + 1] || [];
    if (!t1.length || !t2.length) {
      // Bye: advance the present team
      const winner = t1.length ? 1 : 2;
      const matchRow = allMatches.find((m) => m.round === 1 && m.match_number === i + 1);
      if (matchRow) {
        db.prepare(
          `UPDATE tournament_matches SET winner_team = ? WHERE id = ?`
        ).run(winner, matchRow.id);
      }
    }
  }
}

module.exports = router;
