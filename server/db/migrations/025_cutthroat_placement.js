/**
 * Migration 025: Cutthroat finish placement.
 *
 * Adds game_participants.placement INTEGER — the finish order of a cutthroat
 * game: 1 = winner, 2 = runner-up, 3 = last place. NULL for every non-cutthroat
 * participant (1v1/2v2 cornhole and pool), and NULL for legacy cutthroat games
 * recorded before this migration (where 2nd vs 3rd was never captured — those
 * keep today's flat win/loss ELO until backfilled).
 *
 * Why a new column instead of reusing team/is_winner: cutthroat still stores the
 * winner as team=1 and both losers as team=2 (migration 020), so team can't tell
 * 2nd from 3rd. placement carries the ordering the ELO replay and standings need.
 *
 * Additive only — nullable, no default, no existing column touched.
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`
    ALTER TABLE game_participants
    ADD COLUMN IF NOT EXISTS placement INTEGER
  `.execute(db);

  // Guard the domain: NULL (non-cutthroat / legacy) or a 1..3 finish position.
  await sql`ALTER TABLE game_participants DROP CONSTRAINT IF EXISTS game_participants_placement_check`.execute(db);
  await sql`
    ALTER TABLE game_participants
    ADD CONSTRAINT game_participants_placement_check
    CHECK (placement IS NULL OR placement IN (1, 2, 3))
  `.execute(db);
}

module.exports = { up };
