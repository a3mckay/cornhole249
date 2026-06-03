/**
 * Migration 009: Add league_id indexes.
 *
 * Migration 002 added league_id to 7 tables but created no indexes on those
 * columns. Every query that filters by league_id (which is nearly every query
 * after the multi-league re-route) was doing a full table scan. This migration
 * adds the missing indexes.
 */

const { sql } = require('kysely');

async function up(db) {
  // Core data tables — each filtered on league_id on almost every request
  await sql`CREATE INDEX IF NOT EXISTS idx_games_league_id           ON games(league_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_comments_league_id        ON comments(league_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_trash_talk_league_id      ON trash_talk(league_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_achievements_league_id    ON achievements(league_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_venues_league_id          ON venues(league_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_tournaments_league_id     ON tournaments(league_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_join_codes_league_id      ON join_codes(league_id)`.execute(db);

  // league_memberships — queried heavily by leagueAccess middleware
  await sql`CREATE INDEX IF NOT EXISTS idx_memberships_league_id ON league_memberships(league_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_memberships_user_id   ON league_memberships(user_id)`.execute(db);

  // Composite index for the common "is this user a member of this league?" check
  await sql`CREATE INDEX IF NOT EXISTS idx_memberships_league_user ON league_memberships(league_id, user_id)`.execute(db);
}

module.exports = { up };
