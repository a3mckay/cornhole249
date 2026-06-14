/**
 * Migration 015: Add missing FK indexes.
 *
 * Several foreign key columns identified during audit lacked indexes,
 * causing full table scans on common join paths.
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`CREATE INDEX IF NOT EXISTS idx_games_submitted_by       ON games(submitted_by_user_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_games_venue_id           ON games(venue_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_tournament_matches_next  ON tournament_matches(next_match_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_comments_user_id         ON comments(user_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_join_codes_created_by    ON join_codes(created_by)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS idx_join_codes_used_by       ON join_codes(used_by)`.execute(db);
}

module.exports = { up };
