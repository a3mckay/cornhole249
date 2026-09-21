/**
 * Plan access middleware.
 *
 * requirePro() — must be used AFTER leagueMiddleware (which sets req.leagueId).
 *
 * Checks leagueHasProAccess() (comp / Stripe / owner Venue plan / superadmin owner).
 * On free plan: 403 with { error, upgrade: true } so the client can show
 * the upgrade modal instead of a generic error.
 *
 * Site-wide admins (req.session.isAdmin) bypass the check — Andrew's god mode.
 */

const { getDb } = require('../db');
const { leagueHasProAccess } = require('../lib/plan');

async function requirePro(req, res, next) {
  // Site-wide superadmin always passes
  if (req.session?.isAdmin) return next();

  const leagueId = req.leagueId;
  if (!leagueId) {
    return res.status(500).json({ error: 'leagueId not set — mount leagueMiddleware first' });
  }

  try {
    const db = getDb();
    const league = await db
      .selectFrom('leagues')
      .select(['plan', 'expires_at'])
      .where('id', '=', leagueId)
      .executeTakeFirst();

    // Expired weekend pass → downgrade to free in DB. Other grants (comp,
    // owner Venue plan, superadmin owner) can still carry the league below.
    let passExpired = false;
    if (league?.plan === 'weekend_pass' && league.expires_at && new Date(league.expires_at) < new Date()) {
      await db
        .updateTable('leagues')
        .set({ plan: 'free', stripe_subscription_id: null })
        .where('id', '=', leagueId)
        .execute();
      passExpired = true;
    }

    // Comps, Stripe, owner Venue plan, superadmin-owned league
    if (!(await leagueHasProAccess(db, leagueId))) {
      return res.status(403).json(passExpired
        ? { error: 'Your Weekend Pass has expired.', upgrade: true, code: 'weekend_pass_expired' }
        : { error: 'This feature requires a Pro plan.', upgrade: true, code: 'pro_required' });
    }

    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { requirePro };
