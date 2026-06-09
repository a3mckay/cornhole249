/**
 * Migration 013 — Venue plan on users
 *
 * Adds three columns to `users` to support account-level Venue subscriptions.
 * A Venue subscription covers ALL leagues owned by that user, at a single
 * flat yearly price — intended for bars, rec centres, and establishments that
 * run multiple league nights.
 *
 *   venue_plan                  — 'venue' when active, NULL otherwise
 *   venue_stripe_subscription_id — the Stripe Subscription ID
 *   venue_stripe_period_end     — current period end; used as belt-and-suspenders
 *                                  against missed webhooks (same pattern as leagues)
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS venue_plan TEXT`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS venue_stripe_subscription_id TEXT`.execute(db);
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS venue_stripe_period_end TIMESTAMPTZ`.execute(db);
}

module.exports = { up };
