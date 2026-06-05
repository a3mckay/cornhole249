/**
 * Migration 011 — Downgrade grace period & frozen membership
 *
 * Adds two columns to support Phase 5.5:
 *
 *   leagues.grace_period_ends_at  — set when a Pro league cancels with >8 members;
 *                                   null once the grace period is resolved or expires.
 *
 *   league_memberships.frozen_at  — timestamp when a member was frozen (i.e. lost
 *                                   active access after a downgrade); null = active.
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`
    ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ
  `.execute(db);

  await sql`
    ALTER TABLE league_memberships
    ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ
  `.execute(db);
}

module.exports = { up };
