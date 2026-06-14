/**
 * Migration runner.
 *
 * Tracks applied migrations in a `_migrations` table (auto-created).
 * Reads pending migrations in numeric order, calls up(db) for each,
 * and records the name on success.
 *
 * Also runnable as a CLI script:
 *   node server/db/migrate.js
 */

const path = require('path');
const { sql } = require('kysely');

const MIGRATIONS = [
  { name: '001_initial_schema',                 file: './migrations/001_initial_schema' },
  { name: '002_league_model',                   file: './migrations/002_league_model' },
  { name: '003_achievements_unique_constraint', file: './migrations/003_achievements_unique_constraint' },
  { name: '004_leagues_columns',                file: './migrations/004_leagues_columns' },
  { name: '005_auth_upgrade',                   file: './migrations/005_auth_upgrade' },
  { name: '006_stripe_billing',                 file: './migrations/006_stripe_billing' },
  { name: '007_league_tagline',                 file: './migrations/007_league_tagline' },
  { name: '008_invite_tokens',                  file: './migrations/008_invite_tokens' },
  { name: '009_league_id_indexes',              file: './migrations/009_league_id_indexes' },
  { name: '010_pass_warning_sent_at',           file: './migrations/010_pass_warning_sent_at' },
  { name: '011_downgrade_grace',               file: './migrations/011_downgrade_grace' },
  { name: '012_digest_unsubscribed',           file: './migrations/012_digest_unsubscribed' },
  { name: '013_venue_plan',                    file: './migrations/013_venue_plan' },
  { name: '014_anniversary_triggers',          file: './migrations/014_anniversary_triggers' },
  { name: '015_missing_fk_indexes',            file: './migrations/015_missing_fk_indexes' },
];

async function run(db) {
  // Ensure the tracking table exists
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Fetch already-applied migrations
  const { rows: applied } = await sql`SELECT name FROM _migrations`.execute(db);
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.name)) continue;

    console.log(`[DB] Applying migration: ${migration.name}`);
    const { up } = require(migration.file);
    await up(db);

    await sql`INSERT INTO _migrations (name) VALUES (${migration.name})`.execute(db);
    console.log(`[DB] Applied: ${migration.name}`);
  }
}

module.exports = { run };

// CLI entry point
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  const { getDb } = require('./index');
  run(getDb())
    .then(() => {
      console.log('[Migrate] Done');
      process.exit(0);
    })
    .catch((e) => {
      console.error('[Migrate] Failed:', e.message);
      process.exit(1);
    });
}
