/**
 * Migration 023: Matches — best-of-N / race-to-N series between two fixed sides
 * (ROADMAP WS-G). Sport-agnostic: cornhole "best of 3", pool "race to 5", etc.
 *
 * A *match* groups several individual games into one series with a running
 * score, and clinches when a side reaches `target_wins`. Games belong to a match
 * via the new (nullable) `games.match_id`; a match's games need NOT be played
 * back-to-back — another match can be logged in between (one table / one set of
 * boards). The two sides are fixed for the life of the match and stored as JSON
 * player-id arrays, mirroring the existing tournament_matches pattern.
 *
 * Additive + idempotent (new table + one nullable column; nothing dropped or
 * renamed), so existing cornhole/pool games are untouched (match_id NULL).
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      venue_id INTEGER,
      game_type TEXT NOT NULL,
      game_variant TEXT,
      side1_player_ids TEXT NOT NULL DEFAULT '[]',
      side2_player_ids TEXT NOT NULL DEFAULT '[]',
      target_wins INTEGER NOT NULL,
      format_label TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      winner_side INTEGER,
      created_by_user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `.execute(db);

  // Open matches for a league are listed/looked up frequently.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_matches_league_status
    ON matches (league_id, status)
  `.execute(db);

  // Each game may belong to a match (NULL = standalone game, the default).
  await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS match_id INTEGER`.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_games_match_id
    ON games (match_id)
  `.execute(db);
}

module.exports = { up };
