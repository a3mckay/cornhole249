const { sql } = require('kysely');

async function up(db) {
  // Weekend Pass: when the pass was purchased (never cleared on expiry).
  // Used by the 11-month re-engagement cron to find old pass holders.
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS weekend_pass_purchased_at TIMESTAMPTZ`.execute(db);

  // Prevents the anniversary email from being sent more than once per pass purchase.
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS pass_anniversary_sent_at TIMESTAMPTZ`.execute(db);

  // Pro subscriptions: when the subscription was first created (set once, never
  // updated on renewals) — used to identify yearly anniversary windows.
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS stripe_subscription_started_at TIMESTAMPTZ`.execute(db);

  // Tracks the calendar year we last sent a Pro annual recap so we don't
  // re-send if the cron fires twice in the same window.
  await sql`ALTER TABLE leagues ADD COLUMN IF NOT EXISTS pro_recap_sent_year INTEGER`.execute(db);
}

module.exports = { up };
