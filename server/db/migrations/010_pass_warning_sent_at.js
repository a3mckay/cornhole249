const { sql } = require('kysely');

async function up(db) {
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS pass_warning_sent_at TIMESTAMPTZ`.execute(db);
}

module.exports = { up };
