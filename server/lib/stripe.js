/**
 * Stripe client singleton.
 *
 * Import { getStripe } in any route that needs Stripe.
 * Throws if STRIPE_SECRET_KEY is not set — callers should guard with:
 *   if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Billing not configured' });
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY      — sk_live_... or sk_test_...
 *   STRIPE_PUBLISHABLE_KEY — pk_live_... or pk_test_... (sent to client)
 *   STRIPE_WEBHOOK_SECRET  — whsec_... (for signature verification)
 *   STRIPE_PRICE_PRO_MONTHLY    — price_...
 *   STRIPE_PRICE_PRO_YEARLY     — price_...
 *   STRIPE_PRICE_WEEKEND_PASS   — price_...
 *   STRIPE_PRICE_VENUE_YEARLY   — price_... (account-level, covers all leagues)
 */

const Stripe = require('stripe');

let _stripe = null;

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-04-10',
    });
  }
  return _stripe;
}

const PRICES = {
  pro_monthly:   () => process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly:    () => process.env.STRIPE_PRICE_PRO_YEARLY,
  weekend_pass:  () => process.env.STRIPE_PRICE_WEEKEND_PASS,
  venue_yearly:  () => process.env.STRIPE_PRICE_VENUE_YEARLY,
};

module.exports = { getStripe, PRICES };
