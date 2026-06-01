/**
 * Migration 005: Auth upgrade — email + password + Google SSO.
 *
 * Adds new columns to the users table to support:
 *   - Email + bcrypt-hashed password login
 *   - Email verification (token + timestamp)
 *   - Forgot-password / reset flow (token + expiry)
 *   - Google OAuth (google_id + google_email)
 *
 * The existing `pin` column is kept so legacy Cornhole249 users can
 * authenticate via the claim-account migration flow without being locked out.
 * The claim-account endpoint clears pin once email+password is set.
 */

const { sql } = require('kysely');

async function up(db) {
  // Login credentials
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`.execute(db);

  // Unique constraint on email (nulls are not considered duplicates in Postgres)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email) WHERE email IS NOT NULL
  `.execute(db);

  // Email verification
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMPTZ`.execute(db);

  // Password reset
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ`.execute(db);

  // Google SSO
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email TEXT`.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique ON users (google_id) WHERE google_id IS NOT NULL
  `.execute(db);
}

module.exports = { up };
