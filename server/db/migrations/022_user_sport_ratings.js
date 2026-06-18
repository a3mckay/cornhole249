/**
 * Migration 022: Per-sport ELO ratings (ROADMAP WS-E).
 *
 * ELO is not comparable across sports, and a single global `users.elo_rating`
 * meant a pool result moved a player's cornhole rating (feedback #8). This adds
 * a per-(user, sport) ratings table so each sport tracks its own ELO.
 *
 * Design (locked): `users.elo_rating` is KEPT as the cornhole-facing mirror —
 * the recalc writes each player's cornhole rating to both this table (the
 * `cornhole` row) and `users.elo_rating`, so every existing cornhole read stays
 * byte-identical and untouched. Non-cornhole leagues read their rating here.
 *
 * Additive + idempotent (new table only; no column dropped/renamed), mirroring
 * 019/020/021. The table is backfilled by the per-sport recalc that runs on the
 * next game submit and on server startup — no data migration needed here.
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`
    CREATE TABLE IF NOT EXISTS user_sport_ratings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sport   TEXT    NOT NULL,
      rating  REAL    NOT NULL DEFAULT 1000,
      PRIMARY KEY (user_id, sport)
    )
  `.execute(db);

  // Leaderboards order by rating within a sport.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_sport_ratings_sport_rating
    ON user_sport_ratings (sport, rating DESC)
  `.execute(db);
}

module.exports = { up };
