const { sql } = require('kysely');

async function up(db) {
  // Feature 1: Who can submit scores / start tournaments
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS score_submit_policy TEXT NOT NULL DEFAULT 'all_members'`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS tournament_create_policy TEXT NOT NULL DEFAULT 'admins_only'`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS score_submit_allowed_ids TEXT NOT NULL DEFAULT '[]'`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS tournament_create_allowed_ids TEXT NOT NULL DEFAULT '[]'`.execute(db);

  // Feature 2: Score verification mode
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS score_verify_mode TEXT NOT NULL DEFAULT 'immediate'`.execute(db);
  await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'official'`.execute(db);

  // Pending submissions for both_submit and opponent_approve modes
  await sql`
    CREATE TABLE IF NOT EXISTS pending_game_submissions (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      submitter_user_id INTEGER NOT NULL REFERENCES users(id),
      submitter_team INTEGER NOT NULL,
      game_type TEXT NOT NULL,
      played_at TIMESTAMPTZ NOT NULL,
      season INTEGER NOT NULL,
      venue_id INTEGER,
      team1_player_ids TEXT NOT NULL DEFAULT '[]',
      team2_player_ids TEXT NOT NULL DEFAULT '[]',
      team1_score INTEGER NOT NULL,
      team2_score INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Feature 3: League discovery
  // is_discoverable lets admins opt-in to appearing in the browse listing
  // even if already is_public. Public leagues are browseable by default.
  // (No schema change needed — we'll use is_public as the browse gate.)
}

module.exports = { up };
