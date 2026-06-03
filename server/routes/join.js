const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { leaguePreview } = require('../lib/leaguePreview');

// ── Token-based invite (private leagues) ────────────────────────────────────

// GET /api/join?t=TOKEN — validate token, return league preview
router.get('/', async (req, res) => {
  const token = req.query.t;
  if (!token) return res.status(400).json({ error: 'Missing invite token' });

  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT id, invite_token_expires_at
      FROM leagues
      WHERE invite_token = ${token}
    `.execute(db);

    if (!rows[0]) return res.json({ valid: false, reason: 'not_found' });

    const expires = rows[0].invite_token_expires_at
      ? new Date(rows[0].invite_token_expires_at)
      : null;
    if (expires && expires < new Date()) {
      return res.json({ valid: false, reason: 'expired' });
    }

    const preview = await leaguePreview(db, rows[0].id);
    if (!preview) return res.json({ valid: false, reason: 'not_found' });

    let alreadyMember = false;
    if (req.session?.userId) {
      const { rows: memRows } = await sql`
        SELECT 1 FROM league_memberships
        WHERE league_id = ${rows[0].id} AND user_id = ${req.session.userId}
      `.execute(db);
      alreadyMember = memRows.length > 0;
    }

    res.json({ valid: true, token_type: 'invite', already_member: alreadyMember, ...preview });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/join?t=TOKEN — auto-join private league (requires auth)
router.post('/', requireAuth, async (req, res) => {
  const token = req.query.t;
  if (!token) return res.status(400).json({ error: 'Missing invite token' });

  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT id, name, slug, plan, invite_token_expires_at
      FROM leagues
      WHERE invite_token = ${token}
    `.execute(db);

    if (!rows[0]) return res.status(404).json({ error: 'Invite link not found' });

    const league = rows[0];
    const expires = league.invite_token_expires_at
      ? new Date(league.invite_token_expires_at)
      : null;
    if (expires && expires < new Date()) {
      return res.status(410).json({
        error: 'This invite link has expired. Ask the league owner to reset it.',
      });
    }

    // Free plan member cap
    if (league.plan === 'free') {
      const { rows: countRows } = await sql`
        SELECT COUNT(*) as n FROM league_memberships WHERE league_id = ${league.id}
      `.execute(db);
      if (parseInt(countRows[0].n) >= 8) {
        return res.status(403).json({
          error: 'This league is full. Ask an admin to upgrade the plan.',
        });
      }
    }

    await db
      .insertInto('league_memberships')
      .values({ league_id: league.id, user_id: req.session.userId, role: 'player' })
      .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
      .execute();

    res.json({ ok: true, slug: league.slug });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Legacy single-use code route (backward compat) ───────────────────────────

// GET /api/join/:code — old invite codes still work for existing links
router.get('/:code', async (req, res) => {
  try {
    const db = getDb();
    const code = req.params.code.trim().toUpperCase();

    const joinCode = await db
      .selectFrom('join_codes')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();

    if (!joinCode) return res.json({ valid: false });
    if (joinCode.used_by) return res.json({ valid: true, used: true });

    let inviter = null;
    let inviterRefToken = null;
    if (joinCode.created_by) {
      const u = await db
        .selectFrom('users')
        .select(['display_name', 'avatar_url', 'ref_token'])
        .where('id', '=', joinCode.created_by)
        .executeTakeFirst();
      if (u) {
        inviter = { display_name: u.display_name, avatar_url: u.avatar_url };
        inviterRefToken = u.ref_token || null;
      }
    }

    const leagueId = joinCode.league_id || 1;
    const preview = await leaguePreview(db, leagueId);

    res.json({
      valid: true,
      used: false,
      code,
      inviter,
      inviter_ref_token: inviterRefToken,
      ...(preview || {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
