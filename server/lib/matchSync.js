/**
 * Match persistence helpers (ROADMAP WS-G) — DB-aware glue over the pure
 * `lib/matches.js` logic. Recomputes a match's running score from its games and
 * flips it to 'completed' (with winner_side + completed_at) once a side clinches.
 */

const { matchProgress } = require('./matches');

/** Fetch a match's games with their participants (is_winner) attached. */
async function matchGamesWithParticipants(db, matchId) {
  const games = await db.selectFrom('games').select(['id']).where('match_id', '=', matchId).execute();
  if (!games.length) return [];
  const ids = games.map((g) => g.id);
  const parts = await db
    .selectFrom('game_participants')
    .select(['game_id', 'user_id', 'is_winner'])
    .where('game_id', 'in', ids)
    .execute();
  return games.map((g) => ({ ...g, participants: parts.filter((p) => p.game_id === g.id) }));
}

/**
 * Recompute a match from its games and persist any status change. Returns the
 * progress object ({ side1_wins, side2_wins, games_played, status, winner_side }).
 */
async function recomputeMatch(db, matchId) {
  const match = await db.selectFrom('matches').selectAll().where('id', '=', matchId).executeTakeFirst();
  if (!match) return null;
  const games = await matchGamesWithParticipants(db, matchId);
  const prog = matchProgress(match, games);
  if (prog.status !== match.status || prog.winner_side !== match.winner_side) {
    await db
      .updateTable('matches')
      .set({
        status: prog.status,
        winner_side: prog.winner_side,
        completed_at: prog.status === 'completed' ? new Date().toISOString() : null,
      })
      .where('id', '=', matchId)
      .execute();
  }
  return prog;
}

module.exports = { recomputeMatch, matchGamesWithParticipants };
