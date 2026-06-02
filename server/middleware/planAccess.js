/**
 * Plan access middleware.
 *
 * requirePro() — must be used AFTER leagueMiddleware (which sets req.leagueId).
 *
 * Fetches the league row and checks effectivePlan().
 * On free plan: 403 with { error, upgrade: true } so the client can show
 * the upgrade modal instead of a generic error.
 *
 * Site-wide admins (req.session.isAdmin) bypass the check — Andrew's god mode.
 */

const { getDb } = require('../db');
const { effectivePlan, isPro } = require('../lib/plan');

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
      .select(['plan', 'plan_override', 'stripe_subscription_id', 'stripe_current_period_end', 'expires_at'])
      .where('id', '=', leagueId)
      .executeTakeFirst();

    // Check weekend pass expiry
    if (league?.plan === 'weekend_pass' && league.expires_at) {
      const expiry = new Date(league.expires_at);
      if (expiry < new Date()) {
        // Expired weekend pass → downgrade to free in DB, then block
        await db
          .updateTable('leagues')
          .set({ plan: 'free', stripe_subscription_id: null })
          .where('id', '=', leagueId)
          .execute();
        return res.status(403).json({
          error: 'Your Weekend Pass has expired.',
          upgrade: true,
          code: 'weekend_pass_expired',
        });
      }
    }

    if (!isPro(league)) {
      return res.status(403).json({
        error: 'This feature requires a Pro plan.',
        upgrade: true,
        code: 'pro_required',
      });
    }

    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { requirePro };
