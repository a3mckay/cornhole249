/**
 * Migration 019: Add `sport` to leagues (multi-sport foundation).
 *
 * One sport per league (Andrew's locked decision). Defaults to 'cornhole' so
 * every existing league backfills with zero behavior change. The CHECK lists
 * the sports we plan to support; a league only becomes a non-cornhole sport
 * once that sport is actually built and wired into the sport-config registry.
 *
 * Mirrors the additive ALTER convention used by 015_league_controls.
 * See MULTISPORT_MERGE_PLAN.md, Phase 1.
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'cornhole'`.execute(db);

  // Known-sports CHECK. Idempotent: drop-if-exists then add, so re-running is safe.
  await sql`ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_sport_check`.execute(db);
  await sql`
    ALTER TABLE leagues
    ADD CONSTRAINT leagues_sport_check
    CHECK (sport IN ('cornhole','pool','pingpong','crokinole','cribbage','euchre'))
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS idx_leagues_sport ON leagues(sport)`.execute(db);
}

module.exports = { up };
