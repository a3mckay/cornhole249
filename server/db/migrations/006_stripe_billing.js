/**
 * Migration 006: Stripe billing + plan override fields.
 *
 * Adds:
 *  - users.stripe_customer_id — Stripe Customer object for the paying user
 *  - leagues.stripe_subscription_id — active Stripe Subscription for this league
 *  - leagues.stripe_price_id — which price the subscription is on
 *  - leagues.plan_override — superadmin-set plan that takes precedence over Stripe
 *  - leagues.plan_override_reason — audit note for why the override was set
 *  - plan_override_audit table — append-only log of every plan change (paid or comp)
 */

const { sql } = require('kysely');

async function up(db) {
  // Stripe customer on the user (the league owner pays)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`.execute(db);

  // Stripe subscription on the league
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS stripe_price_id TEXT`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMPTZ`.execute(db);

  // Superadmin plan override (takes precedence over Stripe-derived plan)
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS plan_override TEXT`.execute(db);
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS plan_override_reason TEXT`.execute(db);

  // Audit log — append-only, never updated
  await sql`
    CREATE TABLE IF NOT EXISTS plan_override_audit (
      id SERIAL PRIMARY KEY,
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      changed_by_user_id INTEGER REFERENCES users(id),
      from_plan TEXT,
      to_plan TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);
}

module.exports = { up };
