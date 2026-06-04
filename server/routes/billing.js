/**
 * Billing routes — Stripe Checkout, Customer Portal, Webhooks.
 *
 * POST /api/billing/checkout       — create a Checkout session (auth required)
 * POST /api/billing/portal         — create a Customer Portal session (auth required)
 * POST /api/billing/webhook        — Stripe webhook (raw body, signature-verified)
 *
 * Checkout body: { leagueId, plan: 'pro_monthly' | 'pro_yearly' | 'weekend_pass' }
 * Portal body:   { leagueId }
 */

const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getStripe, PRICES } = require('../lib/stripe');
const { effectivePlan } = require('../lib/plan');
const { sendProWelcomeEmail, sendWeekendPassWelcomeEmail } = require('../lib/email');

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

// ── POST /api/billing/checkout ───────────────────────────────────────────────

router.post('/checkout', requireAuth, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Billing not configured' });
  }
  try {
    const { leagueId, plan } = req.body;
    if (!leagueId || !plan) return res.status(400).json({ error: 'leagueId and plan required' });

    const priceId = PRICES[plan]?.();
    if (!priceId) return res.status(400).json({ error: `Unknown plan: ${plan}` });

    const db = getDb();

    // Verify the requesting user is the league owner or admin
    const membership = await db
      .selectFrom('league_memberships')
      .select(['role'])
      .where('league_id', '=', parseInt(leagueId))
      .where('user_id', '=', req.session.userId)
      .executeTakeFirst();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Only league owners/admins can manage billing' });
    }

    const league = await db
      .selectFrom('leagues')
      .select(['id', 'slug', 'name', 'stripe_subscription_id', 'plan', 'plan_override', 'stripe_current_period_end'])
      .where('id', '=', parseInt(leagueId))
      .executeTakeFirst();

    if (!league) return res.status(404).json({ error: 'League not found' });

    // Don't let them checkout if already Pro (unless it's a Weekend Pass upgrade)
    if (plan !== 'weekend_pass' && effectivePlan(league) === 'pro') {
      return res.status(400).json({ error: 'League is already on Pro' });
    }

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'display_name', 'stripe_customer_id'])
      .where('id', '=', req.session.userId)
      .executeTakeFirst();

    const stripe = getStripe();

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.display_name,
        metadata: { user_id: String(user.id) },
      });
      customerId = customer.id;
      await db
        .updateTable('users')
        .set({ stripe_customer_id: customerId })
        .where('id', '=', user.id)
        .execute();
    }

    const isSubscription = plan !== 'weekend_pass';
    const leagueSlug = league.slug;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}${leagueSlug === 'cornhole249' ? '' : `/l/${leagueSlug}`}/settings?billing=success`,
      cancel_url: `${APP_URL}${leagueSlug === 'cornhole249' ? '' : `/l/${leagueSlug}`}/settings?billing=cancelled`,
      metadata: {
        league_id: String(league.id),
        user_id: String(user.id),
        plan,
      },
      subscription_data: isSubscription ? {
        metadata: { league_id: String(league.id) },
      } : undefined,
      payment_intent_data: !isSubscription ? {
        metadata: { league_id: String(league.id), plan: 'weekend_pass' },
      } : undefined,
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[Billing] Checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/billing/portal ─────────────────────────────────────────────────

router.post('/portal', requireAuth, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Billing not configured' });
  }
  try {
    const { leagueId } = req.body;
    if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['stripe_customer_id'])
      .where('id', '=', req.session.userId)
      .executeTakeFirst();

    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const league = await db
      .selectFrom('leagues')
      .select(['slug'])
      .where('id', '=', parseInt(leagueId))
      .executeTakeFirst();

    const slug = league?.slug || '';
    const returnUrl = `${APP_URL}${slug === 'cornhole249' ? '' : `/l/${slug}`}/settings`;

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl,
    });

    res.json({ url: portalSession.url });
  } catch (e) {
    console.error('[Billing] Portal error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/billing/webhook ────────────────────────────────────────────────
// Raw body required — mounted with express.raw() in index.js BEFORE express.json()

router.post('/webhook', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).send('Billing not configured');
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body, // raw Buffer
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error('[Billing] Webhook signature failed:', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  const db = getDb();

  try {
    switch (event.type) {
      // ── Checkout completed (subscription or one-time) ─────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const leagueId = parseInt(session.metadata?.league_id);
        const plan = session.metadata?.plan;
        if (!leagueId || !plan) break;

        let activatedPlan = null;
        let weekendPassExpiresAt = null;

        if (session.mode === 'subscription') {
          // subscription_id is on the session for subscriptions
          const subscriptionId = session.subscription;
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

          await db
            .updateTable('leagues')
            .set({
              plan: 'pro',
              stripe_subscription_id: subscriptionId,
              stripe_price_id: sub.items.data[0]?.price.id || null,
              stripe_current_period_end: periodEnd,
            })
            .where('id', '=', leagueId)
            .execute();

          activatedPlan = 'pro';
          console.log(`[Billing] League ${leagueId} → Pro (sub ${subscriptionId})`);
        } else if (session.mode === 'payment' && plan === 'weekend_pass') {
          // Weekend pass: set plan + expires_at = now + 7 days
          weekendPassExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          await db
            .updateTable('leagues')
            .set({
              plan: 'weekend_pass',
              expires_at: weekendPassExpiresAt,
            })
            .where('id', '=', leagueId)
            .execute();

          activatedPlan = 'weekend_pass';
          console.log(`[Billing] League ${leagueId} → Weekend Pass (expires ${weekendPassExpiresAt})`);
        }

        // Send welcome email — fire-and-forget, don't block the webhook response
        if (activatedPlan && session.metadata?.user_id) {
          (async () => {
            try {
              const baseUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
              const [user, league] = await Promise.all([
                db.selectFrom('users')
                  .select(['email', 'display_name'])
                  .where('id', '=', parseInt(session.metadata.user_id))
                  .executeTakeFirst(),
                db.selectFrom('leagues')
                  .select(['name', 'slug'])
                  .where('id', '=', leagueId)
                  .executeTakeFirst(),
              ]);
              if (!user?.email || !league) return;
              const leagueUrl = `${baseUrl}${league.slug === 'cornhole249' ? '' : `/l/${league.slug}`}`;
              if (activatedPlan === 'weekend_pass') {
                await sendWeekendPassWelcomeEmail({
                  to: user.email,
                  userName: user.display_name,
                  leagueName: league.name,
                  leagueUrl,
                  expiresAt: weekendPassExpiresAt,
                });
              } else {
                await sendProWelcomeEmail({
                  to: user.email,
                  userName: user.display_name,
                  leagueName: league.name,
                  leagueUrl,
                });
              }
            } catch (err) {
              console.error('[Billing] Welcome email failed:', err);
            }
          })();
        }

        break;
      }

      // ── Subscription updated (plan change, renewal) ───────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const leagueId = parseInt(sub.metadata?.league_id);
        if (!leagueId) break;

        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        const isActive = ['active', 'trialing'].includes(sub.status);

        await db
          .updateTable('leagues')
          .set({
            plan: isActive ? 'pro' : 'free',
            stripe_price_id: sub.items.data[0]?.price.id || null,
            stripe_current_period_end: periodEnd,
          })
          .where('id', '=', leagueId)
          .execute();

        console.log(`[Billing] League ${leagueId} subscription updated → ${isActive ? 'pro' : 'free'}`);
        break;
      }

      // ── Subscription cancelled ────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const leagueId = parseInt(sub.metadata?.league_id);
        if (!leagueId) break;

        await db
          .updateTable('leagues')
          .set({
            plan: 'free',
            stripe_subscription_id: null,
            stripe_price_id: null,
            stripe_current_period_end: null,
          })
          .where('id', '=', leagueId)
          .execute();

        console.log(`[Billing] League ${leagueId} subscription cancelled → free`);
        break;
      }

      // ── Invoice payment failed ────────────────────────────────────────────
      case 'invoice.payment_failed': {
        // Stripe will retry; we don't immediately downgrade.
        // Log for visibility — if it keeps failing, subscription.deleted fires.
        const invoice = event.data.object;
        console.warn(`[Billing] Invoice payment failed for customer ${invoice.customer}`);
        break;
      }

      default:
        // Unhandled event type — not an error, just ignore
        break;
    }

    res.json({ received: true });
  } catch (e) {
    console.error('[Billing] Webhook handler error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
