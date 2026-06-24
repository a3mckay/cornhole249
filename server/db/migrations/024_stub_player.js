const { sql } = require('kysely');

async function up(db) {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS claim_token TEXT`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS claim_token_expires_at TEXT`.execute(db);
}

module.exports = { up };
