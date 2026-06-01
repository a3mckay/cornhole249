/**
 * League access middleware for multi-tenant routing.
 *
 * leagueMiddleware   — resolves :slug → req.league + req.leagueId
 * requireLeagueAccess(mode) — 'read' or 'write' access check
 * requireLeagueRole(...roles) — role-level gate (owner/admin)
 */

const { getDb, sql } = require('../db');

/**
 * Resolves req.params.slug into req.league and req.leagueId.
 * Must be placed in the route chain BEFORE any requireLeagueAccess call.
 */
async function leagueMiddleware(req, res, next) {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(400).json({ error: 'League slug required' });

    const db = getDb();
    const { rows } = await sql`SELECT * FROM leagues WHERE slug = ${slug}`.execute(db);
    const league = rows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    req.league = league;
    req.leagueId = league.id;
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * Returns middleware that checks whether the current user can access the league.
 *
 * mode = 'read'  → public leagues open to everyone; private leagues require membership
 * mode = 'write' → membership always required
 *
 * Site admins (req.session.isAdmin) bypass the check for reads.
 * On pass, sets req.leagueRole if the user is a member.
 */
function requireLeagueAccess(mode = 'read') {
  return async (req, res, next) => {
    try {
      const league = req.league;
      if (!league) return res.status(500).json({ error: 'League not resolved — call leagueMiddleware first' });

      const userId = req.session?.userId;
      const isAdmin = req.session?.isAdmin;

      // Site-wide admin bypasses read checks
      if (isAdmin && mode === 'read') return next();

      // Check league membership if user is logged in
      if (userId) {
        const db = getDb();
        const { rows } = await sql`
          SELECT role FROM league_memberships
          WHERE league_id = ${league.id} AND user_id = ${userId}
        `.execute(db);
        if (rows[0]) {
          req.leagueRole = rows[0].role;
          return next();
        }
      }

      // No membership found — allow reads for public leagues
      if (mode === 'read' && league.is_public) return next();

      // Deny
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      return res.status(403).json({ error: 'Not a member of this league' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

/**
 * Returns middleware that requires req.leagueRole to be one of the given values.
 * Must come AFTER requireLeagueAccess (which populates req.leagueRole).
 */
function requireLeagueRole(...roles) {
  return (req, res, next) => {
    if (!req.leagueRole) {
      return res.status(403).json({ error: 'Not a member of this league' });
    }
    if (!roles.includes(req.leagueRole)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { leagueMiddleware, requireLeagueAccess, requireLeagueRole };
