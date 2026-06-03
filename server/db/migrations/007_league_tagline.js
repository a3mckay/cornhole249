const { sql } = require('../index');

async function up(db) {
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS tagline TEXT`.execute(db);
  await sql`
    UPDATE leagues
    SET tagline = 'Hamilton''s Most Competitive Backyard League'
    WHERE slug = 'cornhole249' AND tagline IS NULL
  `.execute(db);
}

async function down(db) {
  await sql`ALTER TABLE leagues DROP COLUMN IF EXISTS tagline`.execute(db);
}

module.exports = { up, down };
