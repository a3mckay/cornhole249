const { sql } = require('kysely');

// Chars chosen to avoid visual confusion: no 0/O, 1/I/L
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function up(db) {
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE`.execute(db);

  // Backfill existing leagues that have no short_code yet
  const { rows: leagues } = await sql`SELECT id FROM leagues WHERE short_code IS NULL`.execute(db);
  for (const league of leagues) {
    let code;
    let attempts = 0;
    do {
      code = randomCode();
      const { rows } = await sql`SELECT id FROM leagues WHERE short_code = ${code}`.execute(db);
      if (!rows.length) break;
    } while (++attempts < 20);

    await sql`UPDATE leagues SET short_code = ${code} WHERE id = ${league.id}`.execute(db);
  }
}

module.exports = { up };
