/**
 * Migration 003: Fix achievements unique constraint for multi-tenancy.
 *
 * The old UNIQUE(user_id, achievement_key) means a player can never earn
 * the same achievement in a second league. The new constraint scopes it per
 * league so each league tracks achievements independently.
 */

const { sql } = require('kysely');

async function up(db) {
  // Drop old auto-named constraint (created by Postgres from the original CREATE TABLE)
  await sql`ALTER TABLE achievements DROP CONSTRAINT IF EXISTS achievements_user_id_achievement_key_key`.execute(db);
  // New league-scoped unique constraint
  await sql`
    ALTER TABLE achievements
    ADD CONSTRAINT achievements_user_league_key_unique
    UNIQUE (user_id, achievement_key, league_id)
  `.execute(db);
}

module.exports = { up };
