/**
 * Migration 021: Add `race_to_target` to leagues (per-league race-to-N setting).
 *
 * Admin-configurable target score for race-to-N play (Andrew's directive):
 *  - NULL  = race-to-N is OFF (the default for every existing + new league).
 *  - 1..99 = first to this many racks/points wins; surfaced as guidance in the
 *    game-entry flow (pre-fills the winner's score).
 *
 * Sport-agnostic on purpose: pool uses it now (9-ball / straight pool races),
 * and future race-scored sports (ping-pong race-to-11, etc.) can reuse it.
 * Additive + idempotent, mirroring 019/020.
 * See MULTISPORT_MERGE_PLAN.md, Pool 1.2.
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS race_to_target INTEGER`.execute(db);

  // Sanity CHECK: NULL (off) or a sensible positive target. Idempotent.
  await sql`ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_race_to_target_check`.execute(db);
  await sql`
    ALTER TABLE leagues
    ADD CONSTRAINT leagues_race_to_target_check
    CHECK (race_to_target IS NULL OR (race_to_target >= 1 AND race_to_target <= 99))
  `.execute(db);
}

module.exports = { up };
