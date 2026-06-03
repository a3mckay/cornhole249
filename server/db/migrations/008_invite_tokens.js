const { sql } = require('../index');

async function up(db) {
  // Stable per-league invite token for private leagues
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS invite_token TEXT`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ`.execute(db);

  // Approval queue for public leagues
  await sql`
    CREATE TABLE IF NOT EXISTS join_requests (
      id          SERIAL PRIMARY KEY,
      league_id   INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status      TEXT NOT NULL DEFAULT 'pending',
      message     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by INTEGER REFERENCES users(id),
      UNIQUE (league_id, user_id)
    )
  `.execute(db);
}

async function down(db) {
  await sql`DROP TABLE IF EXISTS join_requests`.execute(db);
  await sql`ALTER TABLE leagues DROP COLUMN IF EXISTS invite_token`.execute(db);
  await sql`ALTER TABLE leagues DROP COLUMN IF EXISTS invite_token_expires_at`.execute(db);
}

module.exports = { up, down };
