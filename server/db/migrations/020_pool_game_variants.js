/**
 * Migration 020: Pool game variants (multi-sport Phase 2).
 *
 * Ported from pool249's 016_pool_game_variants, adapted for the one-DB
 * multi-sport model where cornhole and pool games coexist:
 *
 *   - games.game_variant TEXT, NULLABLE, NO default.
 *       Cornhole games leave this NULL; pool games set it. (The pool249 fork
 *       defaulted to 'eight_ball' because every game there was pool — that
 *       default would wrongly tag cornhole games here, so it is dropped.)
 *       CHECK allows NULL or one of the four pool variants.
 *   - games.eight_ball_end_condition TEXT ('sunk' | 'scratch') — 8-ball only.
 *   - games.game_type CHECK extended to include 'cutthroat'.
 *   - game_participants.balls_remaining INTEGER — balls left on the table for
 *       the loser (pool ELO margin proxy); NULL for cornhole and winners.
 *
 * Cutthroat modelling: winner → team=1 (1 player), both losers → team=2
 * (2 players). No team=3; the existing CHECK(team IN (1,2)) is unchanged.
 *
 * Additive only — no existing cornhole column/route is dropped or renamed.
 * See MULTISPORT_MERGE_PLAN.md §1 (the port) and the Phase 2 roadmap item.
 */

const { sql } = require('kysely');

async function up(db) {
  // 1. game_variant: nullable, no default. Cornhole stays NULL; pool sets it.
  await sql`
    ALTER TABLE games
    ADD COLUMN IF NOT EXISTS game_variant TEXT
  `.execute(db);

  // CHECK: NULL (non-pool) or one of the four pool variants. Idempotent.
  await sql`ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_variant_check`.execute(db);
  await sql`
    ALTER TABLE games
    ADD CONSTRAINT games_game_variant_check
    CHECK (game_variant IS NULL OR game_variant IN ('eight_ball','nine_ball','cutthroat','straight_pool'))
  `.execute(db);

  // 2. eight_ball_end_condition (8-ball only; NULL otherwise).
  await sql`
    ALTER TABLE games
    ADD COLUMN IF NOT EXISTS eight_ball_end_condition TEXT
  `.execute(db);
  await sql`ALTER TABLE games DROP CONSTRAINT IF EXISTS games_eight_ball_end_condition_check`.execute(db);
  await sql`
    ALTER TABLE games
    ADD CONSTRAINT games_eight_ball_end_condition_check
    CHECK (eight_ball_end_condition IS NULL OR eight_ball_end_condition IN ('sunk', 'scratch'))
  `.execute(db);

  // 3. Extend games.game_type CHECK to include 'cutthroat'. The inline CHECK
  //    from 001 is named by Postgres as games_game_type_check by default; find
  //    and drop it by name pattern, then re-add the widened constraint.
  await sql`
    DO $$
    DECLARE
      con_name text;
    BEGIN
      SELECT conname INTO con_name
      FROM pg_constraint
      WHERE conrelid = 'games'::regclass
        AND contype = 'c'
        AND conname LIKE '%game_type%';
      IF con_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE games DROP CONSTRAINT ' || quote_ident(con_name);
      END IF;
    END $$
  `.execute(db);
  await sql`
    ALTER TABLE games
    ADD CONSTRAINT games_game_type_check
    CHECK (game_type IN ('1v1', '2v2', 'cutthroat'))
  `.execute(db);

  // 4. balls_remaining on game_participants (loser's row only; else NULL).
  await sql`
    ALTER TABLE game_participants
    ADD COLUMN IF NOT EXISTS balls_remaining INTEGER
  `.execute(db);

  // 5. Index game_variant for per-variant standings queries.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_games_game_variant ON games(game_variant)
  `.execute(db);
}

module.exports = { up };
