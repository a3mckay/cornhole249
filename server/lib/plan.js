/**
 * Plan resolution helpers.
 *
 * Effective plan for a league is determined by:
 *   1. plan_override (superadmin comp) — highest precedence
 *   2. Stripe subscription (active = 'pro' or 'weekend_pass')
 *   3. leagues.plan column (baseline — 'free' or 'pro' set by migration/default)
 *
 * Note: we don't query Stripe on every request. Stripe webhooks update
 * leagues.plan + leagues.stripe_current_period_end whenever the subscription
 * changes. We trust the DB as the source of truth between webhook events.
 * If stripe_current_period_end is in the past and plan is still 'pro', we
 * treat the league as having an expired subscription and fall back to 'free'
 * (belt-and-suspenders against missed webhooks).
 */

/**
 * Compute the effective plan from a `leagues` row.
 * Pass in a DB row with: plan, plan_override, stripe_subscription_id, stripe_current_period_end
 *
 * Returns: 'free' | 'pro' | 'weekend_pass'
 */
function effectivePlan(league) {
  if (!league) return 'free';

  // Superadmin override wins outright
  if (league.plan_override) return league.plan_override;

  // If the league has a Stripe subscription, check it hasn't lapsed
  if (league.stripe_subscription_id && league.plan !== 'free') {
    const periodEnd = league.stripe_current_period_end
      ? new Date(league.stripe_current_period_end)
      : null;
    // If period_end is missing or in the future, trust the stored plan
    if (!periodEnd || periodEnd > new Date()) {
      return league.plan;
    }
    // Period has lapsed (missed webhook?) — treat as free until Stripe reconciles
    return 'free';
  }

  return league.plan || 'free';
}

/**
 * Returns true if the effective plan grants Pro-level access.
 */
function isPro(league) {
  const plan = effectivePlan(league);
  return plan === 'pro' || plan === 'weekend_pass';
}

module.exports = { effectivePlan, isPro };
