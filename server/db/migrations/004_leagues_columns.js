/**
 * Migration 004: Add missing columns to the leagues table.
 *
 * Migration 002 created the leagues table with: id, slug, name, owner_user_id,
 * plan, is_public, created_at. These additional columns were specified in
 * the 2.2 data model but were not included in 002.
 *
 * Also updates the Cornhole249 league from plan='free' to plan='pro'
 * (Andrew's demo league should always have full Pro access per the spec).
 */

const { sql } = require('kysely');

async function up(db) {
  // Add scoring rules column (hamilton | aca | custom)
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS rules TEXT NOT NULL DEFAULT 'hamilton'`.execute(db);

  // Add Pro-tier columns (custom rules, custom theme/branding)
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS custom_rules_json JSONB`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS theme_json JSONB`.execute(db);

  // Weekend Pass expiry timestamp (NULL = no expiry)
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`.execute(db);

  // Use-case wizard selection: 'recurring' | 'tournament' | 'open_play' | 'exploring'
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS use_case TEXT`.execute(db);

  // Cornhole249 is the platform demo and Andrew's own league — always Pro
  await sql`UPDATE leagues SET plan = 'pro' WHERE slug = 'cornhole249'`.execute(db);
}

module.exports = { up };
