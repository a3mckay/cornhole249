const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { isEmailConfigured, sendTestEmail } = require('../lib/email');

// GET /api/admin/email-status — is outbound email configured?
router.get('/email-status', requireAdmin, (req, res) => {
  res.json({ configured: isEmailConfigured() });
});

// POST /api/admin/test-email — send a live test email to the admin's own address.
// Surfaces real failures (missing creds AND expired refresh token).
router.post('/test-email', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const me = await db
      .selectFrom('users')
      .select(['email'])
      .where('id', '=', req.session.userId)
      .executeTakeFirst();
    if (!me?.email) {
      return res.status(400).json({ error: 'Your admin account has no email on file to send a test to.' });
    }
    await sendTestEmail(me.email);
    res.json({ ok: true, sent_to: me.email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const users = await db
      .selectFrom('users')
      .select(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'created_at'])
      .orderBy('display_name')
      .execute();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/users/:id/admin
router.patch('/users/:id/admin', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id);

    if (targetId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot modify your own admin status' });
    }

    const { is_admin } = req.body;
    const updated = await db
      .updateTable('users')
      .set({ is_admin: is_admin ? 1 : 0 })
      .where('id', '=', targetId)
      .returning(['id', 'display_name', 'is_admin'])
      .executeTakeFirstOrThrow();

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/join-codes
router.get('/join-codes', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT jc.code, jc.created_at, jc.used_at,
        cb.display_name as created_by_name,
        ub.display_name as used_by_name
      FROM join_codes jc
      LEFT JOIN users cb ON cb.id = jc.created_by
      LEFT JOIN users ub ON ub.id = jc.used_by
      ORDER BY jc.created_at DESC
    `.execute(db);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/join-codes — generate a new code
router.post('/join-codes', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

    let code;
    // Ensure uniqueness
    do {
      code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const existing = await db
        .selectFrom('join_codes')
        .select(['code'])
        .where('code', '=', code)
        .executeTakeFirst();
      if (!existing) break;
    } while (true); // eslint-disable-line no-constant-condition

    await db
      .insertInto('join_codes')
      .values({ code, created_by: req.session.userId })
      .execute();

    res.status(201).json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/join-codes/:code — revoke an unused code
router.delete('/join-codes/:code', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const row = await db
      .selectFrom('join_codes')
      .selectAll()
      .where('code', '=', req.params.code)
      .executeTakeFirst();

    if (!row) return res.status(404).json({ error: 'Code not found' });
    if (row.used_by) return res.status(400).json({ error: 'Cannot revoke an already-used code' });

    await db.deleteFrom('join_codes').where('code', '=', req.params.code).execute();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/referrals — who referred whom
router.get('/referrals', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT
        u.id          AS referrer_id,
        u.display_name AS referrer_name,
        u.avatar_url   AS referrer_avatar,
        r.id          AS referee_id,
        r.display_name AS referee_name,
        r.avatar_url   AS referee_avatar,
        r.created_at   AS referee_joined_at
      FROM users u
      JOIN users r ON r.referred_by_user_id = u.id
      ORDER BY u.display_name ASC, r.created_at ASC
    `.execute(db);

    // Group into referrer → referees
    const byReferrer = {};
    for (const row of rows) {
      if (!byReferrer[row.referrer_id]) {
        byReferrer[row.referrer_id] = {
          referrer_id: row.referrer_id,
          referrer_name: row.referrer_name,
          referrer_avatar: row.referrer_avatar,
          referral_count: 0,
          referees: [],
        };
      }
      byReferrer[row.referrer_id].referees.push({
        id: row.referee_id,
        display_name: row.referee_name,
        avatar_url: row.referee_avatar,
        joined_at: row.referee_joined_at,
      });
      byReferrer[row.referrer_id].referral_count++;
    }

    const referrers = Object.values(byReferrer).sort((a, b) => b.referral_count - a.referral_count);
    res.json({ total_referrals: rows.length, referrers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/migration-status — users still on PIN-only login (no email or Google)
router.get('/migration-status', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT id, display_name, nickname, created_at
      FROM users
      WHERE email IS NULL AND google_id IS NULL
      ORDER BY display_name
    `.execute(db);
    res.json({ count: rows.length, users: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// GET /api/admin/leagues — all leagues with plan status
router.get('/leagues', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT
        l.id, l.slug, l.name, l.plan, l.plan_override, l.plan_override_reason,
        l.stripe_subscription_id, l.stripe_current_period_end, l.expires_at,
        l.created_at,
        u.display_name AS owner_name,
        (SELECT COUNT(*) FROM league_memberships lm WHERE lm.league_id = l.id) AS member_count,
        (SELECT COUNT(*) FROM games g WHERE g.league_id = l.id) AS game_count
      FROM leagues l
      LEFT JOIN users u ON u.id = l.owner_user_id
      ORDER BY l.created_at DESC
    `.execute(db);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/leagues/:id/plan — grant or revoke a Pro override
router.patch('/leagues/:id/plan', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const leagueId = parseInt(req.params.id);
    const { plan_override, reason } = req.body;

    const allowed = [null, 'free', 'pro'];
    if (!allowed.includes(plan_override)) {
      return res.status(400).json({ error: 'plan_override must be null, "free", or "pro"' });
    }
    if (!reason?.trim()) return res.status(400).json({ error: 'reason is required for audit trail' });

    // Get current plan for the audit log
    const current = await db
      .selectFrom('leagues')
      .select(['plan', 'plan_override'])
      .where('id', '=', leagueId)
      .executeTakeFirst();

    if (!current) return res.status(404).json({ error: 'League not found' });

    const fromPlan = current.plan_override || current.plan;

    await db
      .updateTable('leagues')
      .set({ plan_override: plan_override || null, plan_override_reason: reason.trim() })
      .where('id', '=', leagueId)
      .execute();

    // Append to audit log
    await db
      .insertInto('plan_override_audit')
      .values({
        league_id: leagueId,
        changed_by_user_id: req.session.userId,
        from_plan: fromPlan,
        to_plan: plan_override || current.plan,
        reason: reason.trim(),
      })
      .execute();

    const updated = await db
      .selectFrom('leagues')
      .select(['id', 'slug', 'name', 'plan', 'plan_override', 'plan_override_reason'])
      .where('id', '=', leagueId)
      .executeTakeFirstOrThrow();

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/games — bulk delete by date range
router.delete('/games', requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

    const result = await db
      .deleteFrom('games')
      .where('played_at', '>=', from)
      .where('played_at', '<=', to)
      .executeTakeFirst();

    res.json({ deleted: Number(result?.numAffectedRows ?? 0) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
