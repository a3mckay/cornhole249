const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');

const FREE_LEAGUE_OWNER_CAP = 2;

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

// GET /api/leagues/mine — leagues where the current user is a member
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT l.*, lm.role
      FROM leagues l
      JOIN league_memberships lm ON lm.league_id = l.id AND lm.user_id = ${req.session.userId}
      ORDER BY l.name
    `.execute(db);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leagues/:slug — public league info
router.get('/:slug', async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`
      SELECT l.*,
        (SELECT COUNT(*) FROM league_memberships WHERE league_id = l.id) as member_count
      FROM leagues l
      WHERE l.slug = ${req.params.slug}
    `.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Fetch an active join code if the requester is an owner/admin
    let joinCode = null;
    if (req.session?.userId) {
      const { rows: memberRows } = await sql`
        SELECT role FROM league_memberships
        WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
      `.execute(db);
      if (memberRows[0] && ['owner', 'admin'].includes(memberRows[0].role)) {
        const { rows: codeRows } = await sql`
          SELECT code FROM join_codes
          WHERE league_id = ${league.id} AND used_by IS NULL
          LIMIT 1
        `.execute(db);
        joinCode = codeRows[0]?.code || null;
      }
    }

    res.json({ ...league, member_count: parseInt(league.member_count), join_code: joinCode });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leagues — create a new league
router.post('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.userId;

    // Enforce free-tier cap: user may own at most FREE_LEAGUE_OWNER_CAP leagues
    const { rows: ownedRows } = await sql`
      SELECT COUNT(*) as c FROM league_memberships
      WHERE user_id = ${userId} AND role = 'owner'
    `.execute(db);
    if (parseInt(ownedRows[0].c) >= FREE_LEAGUE_OWNER_CAP) {
      return res.status(403).json({
        error: `Free plan allows up to ${FREE_LEAGUE_OWNER_CAP} leagues. Upgrade to create more.`,
        upgrade: true,
      });
    }

    const { name, is_public = true, rules = 'hamilton' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'League name required' });

    // Build a unique slug
    let base = slugify(name.trim()) || 'league';
    let slug = base;
    const { rows: existing } = await sql`SELECT id FROM leagues WHERE slug = ${slug}`.execute(db);
    if (existing.length) {
      slug = `${base}-${randomSuffix()}`;
      // Retry once more on the unlikely collision
      const { rows: existing2 } = await sql`SELECT id FROM leagues WHERE slug = ${slug}`.execute(db);
      if (existing2.length) slug = `${base}-${randomSuffix()}`;
    }

    const league = await db
      .insertInto('leagues')
      .values({ name: name.trim(), slug, is_public: is_public ? 1 : 0, rules })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Make creator the owner
    await db
      .insertInto('league_memberships')
      .values({ league_id: league.id, user_id: userId, role: 'owner' })
      .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
      .execute();

    // Generate a join code
    const code = generateJoinCode();
    await db
      .insertInto('join_codes')
      .values({ code, league_id: league.id, created_by: userId })
      .execute();

    res.status(201).json({ league, joinCode: code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/leagues/:slug — update league settings (owner/admin only)
router.patch('/:slug', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT * FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Check requester is owner or admin
    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const { name, is_public, rules, use_case } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      updates.name = name.trim();
    }
    if (is_public !== undefined) updates.is_public = is_public ? 1 : 0;
    if (rules !== undefined) updates.rules = rules;
    if (use_case !== undefined) updates.use_case = use_case;

    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });

    const updated = await db
      .updateTable('leagues')
      .set(updates)
      .where('id', '=', league.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Member management ────────────────────────────────────────────────────────

// GET /api/leagues/:slug/members — list members with user info (owner/admin only)
router.get('/:slug/members', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Must be owner or admin
    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const { rows } = await sql`
      SELECT u.id, u.display_name, u.nickname, u.avatar_url, u.email, lm.role, lm.joined_at
      FROM league_memberships lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.league_id = ${league.id}
      ORDER BY CASE lm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.display_name
    `.execute(db);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/leagues/:slug/members/:userId — remove a member
router.delete('/:slug/members/:userId', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Requester must be owner or admin
    const { rows: requesterRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!requesterRows[0] || !['owner', 'admin'].includes(requesterRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const targetId = parseInt(req.params.userId);

    // Cannot remove the owner
    const { rows: targetRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${targetId}
    `.execute(db);
    if (!targetRows[0]) return res.status(404).json({ error: 'Member not found' });
    if (targetRows[0].role === 'owner') return res.status(403).json({ error: 'Cannot remove the league owner' });

    await db
      .deleteFrom('league_memberships')
      .where('league_id', '=', league.id)
      .where('user_id', '=', targetId)
      .execute();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leagues/:slug/join-codes — generate a fresh join code
router.post('/:slug/join-codes', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Must be owner or admin
    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const code = generateJoinCode();
    await db
      .insertInto('join_codes')
      .values({ code, league_id: league.id, created_by: req.session.userId })
      .execute();

    res.status(201).json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = router;
