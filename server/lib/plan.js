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

/**
 * Returns true if the user has an active Venue plan subscription.
 * Pass a `users` row with: venue_plan, venue_stripe_subscription_id, venue_stripe_period_end
 */
function hasVenuePlan(user) {
  if (!user?.venue_plan || user.venue_plan !== 'venue') return false;
  if (!user.venue_stripe_subscription_id) return false;
  if (user.venue_stripe_period_end) {
    const end = new Date(user.venue_stripe_period_end);
    if (end < new Date()) return false;
  }
  return true;
}

// Free leagues max out at this many members.
const FREE_MEMBER_CAP = 8;

/**
 * Does this league get Pro-level access? True when any of:
 *   - its effective plan is Pro / Weekend Pass (plan_override comp, Stripe)
 *   - an owner holds an active Venue plan
 *   - an owner is a site-wide superadmin (users.is_admin) — every league
 *     Andrew owns is Pro, regardless of who is acting on it (e.g. a friend
 *     joining via invite link has no admin session to bypass with).
 */
async function leagueHasProAccess(db, leagueId) {
  const league = await db
    .selectFrom('leagues')
    .select(['plan', 'plan_override', 'stripe_subscription_id', 'stripe_current_period_end'])
    .where('id', '=', leagueId)
    .executeTakeFirst();
  if (!league) return false;
  if (isPro(league)) return true;

  const owners = await db
    .selectFrom('league_memberships')
    .innerJoin('users', 'users.id', 'league_memberships.user_id')
    .select(['users.is_admin', 'users.venue_plan', 'users.venue_stripe_subscription_id', 'users.venue_stripe_period_end'])
    .where('league_memberships.league_id', '=', leagueId)
    .where('league_memberships.role', '=', 'owner')
    .execute();
  return owners.some((o) => Number(o.is_admin) === 1 || hasVenuePlan(o));
}

/**
 * True if the league lacks Pro access and already has FREE_MEMBER_CAP members.
 * The single source of truth for the free-plan member cap — every join/add
 * path must use this rather than reading leagues.plan directly (which ignores
 * comps, Venue plans and superadmin ownership).
 */
async function isLeagueAtFreeCap(db, leagueId) {
  const { count } = await db
    .selectFrom('league_memberships')
    .select((eb) => eb.fn.countAll().as('count'))
    .where('league_id', '=', leagueId)
    .executeTakeFirstOrThrow();
  if (Number(count) < FREE_MEMBER_CAP) return false;
  return !(await leagueHasProAccess(db, leagueId));
}

module.exports = {
  effectivePlan, isPro, hasVenuePlan,
  FREE_MEMBER_CAP, leagueHasProAccess, isLeagueAtFreeCap,
};
