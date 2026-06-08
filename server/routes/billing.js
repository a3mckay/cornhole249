/**
 * Billing routes — Stripe Checkout, Customer Portal, Webhooks.
 *
 * GET  /api/billing/status          — returns current user's venue plan status (auth required)
 * POST /api/billing/checkout       — create a Checkout session (auth required)
 * POST /api/billing/portal         — create a Customer Portal session (auth required)
 * POST /api/billing/webhook        — Stripe webhook (raw body, signature-verified)
 *
 * Checkout body: { leagueId, plan: 'pro_monthly' | 'pro_yearly' | 'weekend_pass' | 'venue_yearly' }
 *   venue_yearly does not require leagueId — it is a user-level subscription.
 * Portal body:   { leagueId? }  — omit leagueId for venue-plan portal sessions
 */

const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getStripe, PRICES } = require('../lib/stripe');
const { effectivePlan, hasVenuePlan } = require('../lib/plan');
const { sendProWelcomeEmail, sendVenueWelcomeEmail, sendWeekendPassWelcomeEmail, sendGraceStartEmail } = require('../lib/email');
const { capture: analyticsCapture } = require('../lib/analytics');

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

// ── GET /api/billing/status ──────────────────────────────────────────────────
// Returns whether the authenticated user has an active Venue Plan.
router.get('/status', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['venue_plan', 'venue_stripe_subscription_id', 'venue_stripe_period_end'])
      .where('id', '=', req.session.userId)
      .executeTakeFirst();
    res.json({ venue: hasVenuePlan(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/billing/checkout ───────────────────────────────────────────────

router.post('/checkout', requireAuth, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Billing not configured' });
  }
  try {
    const { leagueId, plan } = req.body;
    if (!plan) return res.status(400).json({ error: 'plan required' });

    const priceId = PRICES[plan]?.();
    if (!priceId) return res.status(400).json({ error: `Unknown plan: ${plan}` });

    const db = getDb();

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'display_name', 'stripe_customer_id', 'venue_plan', 'venue_stripe_subscription_id'])
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

    // ── Venue plan: account-level subscription, no leagueId needed ──────────
    if (plan === 'venue_yearly') {
      if (user.venue_plan === 'venue' && user.venue_stripe_subscription_id) {
        return res.status(400).json({ error: 'Account is already on the Venue plan' });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_URL}/?venue=success`,
        cancel_url: `${APP_URL}/`,
        metadata: { user_id: String(user.id), plan: 'venue_yearly' },
        subscription_data: {
          metadata: { user_id: String(user.id), plan: 'venue_yearly' },
        },
        allow_promotion_codes: true,
      });
      return res.json({ url: session.url });
    }

    // ── League-level plans: require leagueId ─────────────────────────────────
    if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

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

    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['stripe_customer_id'])
      .where('id', '=', req.session.userId)
      .executeTakeFirst();

    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    let returnUrl = APP_URL;
    if (leagueId) {
      const league = await db
        .selectFrom('leagues')
        .select(['slug'])
        .where('id', '=', parseInt(leagueId))
        .executeTakeFirst();
      const slug = league?.slug || '';
      returnUrl = `${APP_URL}${slug === 'cornhole249' ? '' : `/l/${slug}`}/settings`;
    }

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
        const plan = session.metadata?.plan;
        if (!plan) break;

        // ── Venue plan: user-level subscription ───────────────────────────
        if (session.mode === 'subscription' && plan === 'venue_yearly') {
          const userId = parseInt(session.metadata?.user_id);
          if (!userId) break;

          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

          await db
            .updateTable('users')
            .set({
              venue_plan: 'venue',
              venue_stripe_subscription_id: session.subscription,
              venue_stripe_period_end: periodEnd,
            })
            .where('id', '=', userId)
            .execute();

          console.log(`[Billing] User ${userId} → Venue plan (sub ${session.subscription})`);
          analyticsCapture(String(userId), 'venue_subscription_created', { user_id: userId });

          // Send welcome email (non-fatal)
          ;(async () => {
            try {
              const emailUser = await db
                .selectFrom('users')
                .select(['email', 'display_name'])
                .where('id', '=', userId)
                .executeTakeFirst();
              if (emailUser?.email) {
                await sendVenueWelcomeEmail({ to: emailUser.email, userName: emailUser.display_name });
              }
            } catch (err) {
              console.error('[Billing] Venue welcome email failed:', err);
            }
          })();

          // Cancel any active per-league Pro subscriptions and credit unused time.
          // We do this AFTER activating the venue plan so that the subscription.deleted
          // webhooks for these leagues see the owner already has a venue plan and skip
          // any grace period logic.
          const { rows: proLeagues } = await sql`
            SELECT l.id, l.stripe_subscription_id
            FROM leagues l
            JOIN league_memberships lm ON lm.league_id = l.id
            WHERE lm.user_id = ${userId}
              AND lm.role = 'owner'
              AND l.stripe_subscription_id IS NOT NULL
              AND l.plan = 'pro'
          `.execute(db);

          for (const proLeague of proLeagues) {
            try {
              await stripe.subscriptions.cancel(proLeague.stripe_subscription_id, { prorate: true });
              await db
                .updateTable('leagues')
                .set({ plan: 'free', stripe_subscription_id: null, stripe_price_id: null, stripe_current_period_end: null })
                .where('id', '=', proLeague.id)
                .execute();
              console.log(`[Billing] Cancelled per-league Pro sub for league ${proLeague.id} (venue upgrade, prorated credit applied)`);
            } catch (err) {
              console.error(`[Billing] Failed to cancel league ${proLeague.id} sub during venue upgrade:`, err.message);
            }
          }

          break;
        }

        // ── League-level plans ────────────────────────────────────────────
        const leagueId = parseInt(session.metadata?.league_id);
        if (!leagueId) break;

        let activatedPlan = null;
        let weekendPassExpiresAt = null;

        if (session.mode === 'subscription') {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

          await db
            .updateTable('leagues')
            .set({
              plan: 'pro',
              stripe_subscription_id: session.subscription,
              stripe_price_id: sub.items.data[0]?.price.id || null,
              stripe_current_period_end: periodEnd,
            })
            .where('id', '=', leagueId)
            .execute();

          activatedPlan = 'pro';
          console.log(`[Billing] League ${leagueId} → Pro (sub ${session.subscription})`);
        } else if (session.mode === 'payment' && plan === 'weekend_pass') {
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

        // Analytics
        if (activatedPlan && session.metadata?.user_id) {
          const userId = session.metadata.user_id;
          if (activatedPlan === 'weekend_pass') {
            analyticsCapture(userId, 'weekend_pass_purchased', { league_id: leagueId });
          } else {
            analyticsCapture(userId, 'subscription_created', { plan, league_id: leagueId });
          }
        }

        // Welcome email — fire-and-forget
        if (activatedPlan && session.metadata?.user_id) {
          (async () => {
            try {
              const baseUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
              const [emailUser, league] = await Promise.all([
                db.selectFrom('users')
                  .select(['email', 'display_name'])
                  .where('id', '=', parseInt(session.metadata.user_id))
                  .executeTakeFirst(),
                db.selectFrom('leagues')
                  .select(['name', 'slug'])
                  .where('id', '=', leagueId)
                  .executeTakeFirst(),
              ]);
              if (!emailUser?.email || !league) return;
              const leagueUrl = `${baseUrl}${league.slug === 'cornhole249' ? '' : `/l/${league.slug}`}`;
              if (activatedPlan === 'weekend_pass') {
                await sendWeekendPassWelcomeEmail({
                  to: emailUser.email,
                  userName: emailUser.display_name,
                  leagueName: league.name,
                  leagueUrl,
                  expiresAt: weekendPassExpiresAt,
                });
              } else {
                await sendProWelcomeEmail({
                  to: emailUser.email,
                  userName: emailUser.display_name,
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
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        const isActive = ['active', 'trialing'].includes(sub.status);

        if (sub.metadata?.plan === 'venue_yearly') {
          const userId = parseInt(sub.metadata?.user_id);
          if (!userId) break;
          await db
            .updateTable('users')
            .set({
              venue_plan: isActive ? 'venue' : null,
              venue_stripe_period_end: periodEnd,
            })
            .where('id', '=', userId)
            .execute();
          console.log(`[Billing] User ${userId} venue subscription updated → ${isActive ? 'venue' : 'none'}`);
          break;
        }

        const leagueId = parseInt(sub.metadata?.league_id);
        if (!leagueId) break;

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

        // ── Venue subscription cancelled ──────────────────────────────────
        if (sub.metadata?.plan === 'venue_yearly') {
          const userId = parseInt(sub.metadata?.user_id);
          if (!userId) break;

          await db
            .updateTable('users')
            .set({ venue_plan: null, venue_stripe_subscription_id: null, venue_stripe_period_end: null })
            .where('id', '=', userId)
            .execute();

          console.log(`[Billing] User ${userId} venue subscription cancelled`);

          // Fetch the owner's contact info once for all grace period emails
          const venueOwner = await db
            .selectFrom('users')
            .select(['email', 'display_name'])
            .where('id', '=', userId)
            .executeTakeFirst();

          // Check every owned league — any with >8 members and no individual Pro
          // subscription now needs a grace period since the venue plan no longer covers them
          const { rows: ownedLeagues } = await sql`
            SELECT l.id, l.name, l.slug, l.stripe_subscription_id, l.plan, l.grace_period_ends_at
            FROM leagues l
            JOIN league_memberships lm ON lm.league_id = l.id
            WHERE lm.user_id = ${userId} AND lm.role = 'owner'
          `.execute(db);

          for (const ownedLeague of ownedLeagues) {
            // League has its own active Pro subscription — still covered
            if (ownedLeague.stripe_subscription_id && ownedLeague.plan === 'pro') continue;
            // Already in a grace period
            if (ownedLeague.grace_period_ends_at) continue;

            const { rows: mRows } = await sql`
              SELECT COUNT(*) AS n FROM league_memberships
              WHERE league_id = ${ownedLeague.id} AND frozen_at IS NULL
            `.execute(db);
            const memberCount = parseInt(mRows[0].n);

            if (memberCount <= 8) continue;

            const graceEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            await db
              .updateTable('leagues')
              .set({ grace_period_ends_at: graceEndsAt })
              .where('id', '=', ownedLeague.id)
              .execute();

            if (venueOwner?.email) {
              sendGraceStartEmail({
                to: venueOwner.email,
                userName: venueOwner.display_name,
                leagueName: ownedLeague.name,
                leagueUrl: `${APP_URL}/l/${ownedLeague.slug}`,
                graceEndsAt,
                memberCount,
              }).catch((e) => console.error('[Billing] Grace start email failed:', e.message));
            }

            console.log(`[Billing] League ${ownedLeague.id} → grace period (venue cancelled, ${memberCount} members)`);
          }

          break;
        }

        // ── Per-league subscription cancelled ─────────────────────────────
        const leagueId = parseInt(sub.metadata?.league_id);
        if (!leagueId) break;

        // Idempotency guard — check current state before acting
        const league = await db
          .selectFrom('leagues')
          .select(['grace_period_ends_at', 'slug', 'name'])
          .where('id', '=', leagueId)
          .executeTakeFirst();

        // Always clear Stripe fields and flip to free
        await db
          .updateTable('leagues')
          .set({ plan: 'free', stripe_subscription_id: null, stripe_price_id: null, stripe_current_period_end: null })
          .where('id', '=', leagueId)
          .execute();

        // If the league owner upgraded to Venue (which triggers cancellation of their
        // per-league subs), they still have coverage — no grace period needed
        const { rows: ownerVenueRows } = await sql`
          SELECT u.venue_plan, u.venue_stripe_subscription_id, u.venue_stripe_period_end
          FROM league_memberships lm
          JOIN users u ON u.id = lm.user_id
          WHERE lm.league_id = ${leagueId} AND lm.role = 'owner'
          LIMIT 1
        `.execute(db);

        if (hasVenuePlan(ownerVenueRows[0])) {
          console.log(`[Billing] League ${leagueId} sub cancelled — owner has venue plan, no grace period needed`);
          break;
        }

        // Count active (non-frozen) members
        const { rows: memberRows } = await sql`
          SELECT COUNT(*) AS n FROM league_memberships
          WHERE league_id = ${leagueId} AND frozen_at IS NULL
        `.execute(db);
        const memberCount = parseInt(memberRows[0].n);

        if (memberCount > 8 && !league?.grace_period_ends_at) {
          const graceEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          await db
            .updateTable('leagues')
            .set({ grace_period_ends_at: graceEndsAt })
            .where('id', '=', leagueId)
            .execute();

          const { rows: ownerRows } = await sql`
            SELECT u.email, u.display_name
            FROM league_memberships lm
            JOIN users u ON u.id = lm.user_id
            WHERE lm.league_id = ${leagueId} AND lm.role = 'owner' AND u.email IS NOT NULL
            LIMIT 1
          `.execute(db);

          if (ownerRows[0]) {
            await sendGraceStartEmail({
              to: ownerRows[0].email,
              userName: ownerRows[0].display_name,
              leagueName: league.name,
              leagueUrl: `${APP_URL}/l/${league.slug}`,
              graceEndsAt,
              memberCount,
            }).catch((e) => console.error('[Billing] Grace start email failed:', e.message));
          }

          console.log(`[Billing] League ${leagueId} subscription cancelled → grace period starts (${memberCount} members)`);
        } else {
          console.log(`[Billing] League ${leagueId} subscription cancelled → free (${memberCount} members, no grace needed)`);
        }
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
