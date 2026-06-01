/**
 * Migration 002: League data model.
 *
 * Adds:
 *   - leagues table (id, slug, name, owner_user_id, plan, is_public)
 *   - league_memberships table (league_id, user_id, role)
 *   - league_id column on 7 existing tables (games, venues, tournaments,
 *     comments, trash_talk, achievements, join_codes)
 *
 * Seeds the Cornhole249 league with id=1 and backfills all existing rows.
 * league_memberships backfill (one row per user) is done in migrate-data.js
 * so it can run after the data migration.
 */

const { sql } = require('kysely');

async function up(db) {
  // leagues
  await sql`
    CREATE TABLE IF NOT EXISTS leagues (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      owner_user_id INTEGER REFERENCES users(id),
      plan TEXT NOT NULL DEFAULT 'free',
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // league_memberships
  await sql`
    CREATE TABLE IF NOT EXISTS league_memberships (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'player',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(league_id, user_id)
    )
  `.execute(db);

  // Add league_id to existing tables
  const tables = ['games', 'venues', 'tournaments', 'comments', 'trash_talk', 'achievements', 'join_codes'];
  for (const table of tables) {
    await sql`
      ALTER TABLE ${sql.table(table)}
      ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id)
    `.execute(db);
  }

  // Seed the Cornhole249 league with explicit id=1
  await sql`
    INSERT INTO leagues (id, slug, name, plan, is_public)
    VALUES (1, 'cornhole249', 'Cornhole249', 'free', TRUE)
    ON CONFLICT (slug) DO NOTHING
  `.execute(db);

  // Ensure the sequence starts above 1 so the next auto-generated id won't collide
  await sql`SELECT setval('leagues_id_seq', 1, TRUE)`.execute(db);

  // Backfill league_id = 1 on all existing rows
  for (const table of tables) {
    await sql`
      UPDATE ${sql.table(table)} SET league_id = 1 WHERE league_id IS NULL
    `.execute(db);
  }
}

module.exports = { up };
