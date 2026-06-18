/**
 * Per-sport ELO persistence + reads (ROADMAP WS-E).
 *
 * ELO lives per (user, sport) in `user_sport_ratings`. `users.elo_rating` is
 * kept as the cornhole-facing mirror (locked decision): the recalc writes each
 * player's cornhole rating to both the table and that column, so every existing
 * cornhole read stays byte-identical. Non-cornhole leagues read the table.
 */

const { sql } = require('../db');
const { DEFAULT_SPORT } = require('./sports');

/**
 * Upsert a single (user, sport) rating. Uses ON CONFLICT, which is supported by
 * both Postgres (prod) and SQLite (tests). `trx` may be a db or a transaction.
 */
async function upsertSportRating(trx, userId, sport, rating) {
  await sql`
    INSERT INTO user_sport_ratings (user_id, sport, rating)
    VALUES (${userId}, ${sport}, ${rating})
    ON CONFLICT (user_id, sport) DO UPDATE SET rating = EXCLUDED.rating
  `.execute(trx);
}

/**
 * Persist a full per-sport rating map `{ sport: { userId: rating } }` produced
 * by recalculateAllElosBySport, and mirror the cornhole ratings into
 * `users.elo_rating`. A player with no cornhole games has no cornhole rating, so
 * their mirror falls back to the 1000 default — keeping the column an honest
 * "cornhole rating" rather than a stale blended value.
 */
async function persistSportRatings(db, bySport) {
  await db.transaction().execute(async (trx) => {
    const allUserIds = new Set();
    for (const [sport, elos] of Object.entries(bySport)) {
      for (const [userId, rating] of Object.entries(elos)) {
        allUserIds.add(userId);
        await upsertSportRating(trx, parseInt(userId), sport, rating);
      }
    }
    const cornholeElos = bySport[DEFAULT_SPORT] || {};
    for (const userId of allUserIds) {
      const elo = cornholeElos[userId] != null ? cornholeElos[userId] : 1000;
      await trx.updateTable('users').set({ elo_rating: elo }).where('id', '=', parseInt(userId)).execute();
    }
  });
}

/**
 * Read a user's rating for a sport, or null if none recorded yet. Cornhole
 * callers should NOT use this — `users.elo_rating` is the authoritative,
 * byte-identical cornhole mirror, so cornhole reads stay on the existing column.
 */
async function getSportRating(db, userId, sport) {
  const { rows } = await sql`
    SELECT rating FROM user_sport_ratings WHERE user_id = ${userId} AND sport = ${sport}
  `.execute(db);
  return rows[0]?.rating ?? null;
}

// ── SQL builder helpers for sport-aware leaderboard reads ────────────────────
// For non-cornhole leagues, join user_sport_ratings and COALESCE the rating;
// for cornhole, emit the exact original `u.elo_rating` snippets so cornhole
// queries are byte-identical (no join, no COALESCE, same GROUP BY). Each query
// must alias the users table `u` and (when non-cornhole) the ratings table `usr`.
const eloExpr = (leagueSport) =>
  leagueSport === DEFAULT_SPORT ? sql`u.elo_rating` : sql`COALESCE(usr.rating, u.elo_rating)`;
const eloJoin = (leagueSport) =>
  leagueSport === DEFAULT_SPORT
    ? sql``
    : sql`LEFT JOIN user_sport_ratings usr ON usr.user_id = u.id AND usr.sport = ${leagueSport}`;
const eloGroup = (leagueSport) =>
  leagueSport === DEFAULT_SPORT ? sql`` : sql`, usr.rating`;

/**
 * Override each fetched user's `elo_rating` with their per-sport rating for
 * non-cornhole leagues. No-op for cornhole (the mirror is authoritative), so
 * cornhole responses are byte-identical and skip the extra lookups. `req` is the
 * Express request (uses `req.league?.sport`).
 */
async function applySportElo(db, req, users) {
  const leagueSport = req.league?.sport || DEFAULT_SPORT;
  if (leagueSport === DEFAULT_SPORT) return;
  for (const u of users) {
    if (!u) continue;
    const r = await getSportRating(db, u.id, leagueSport);
    if (r != null) u.elo_rating = r;
  }
}

module.exports = {
  upsertSportRating, persistSportRatings, getSportRating,
  eloExpr, eloJoin, eloGroup, applySportElo,
};
