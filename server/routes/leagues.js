const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { randomBytes } = require('crypto');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isPro } = require('../lib/plan');
const { leaguePreview } = require('../lib/leaguePreview');
const { sendJoinRequestEmail, sendJoinApprovedEmail, sendJoinDeniedEmail } = require('../lib/email');
const { isLiveSport, DEFAULT_SPORT } = require('../lib/sports');
const { recomputeAllSportRatings } = require('../lib/sportRatings');

// ── Logo upload (multer) ─────────────────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/uploads';
const LOGOS_DIR = path.join(UPLOADS_DIR, 'logos');

// Ensure logos directory exists at startup
try { fs.mkdirSync(LOGOS_DIR, { recursive: true }); } catch (_) {}

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    cb(null, `${req.params.slug}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const FREE_LEAGUE_OWNER_CAP = 2;
const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

async function generateUniqueShortCode(db) {
  let code, attempts = 0;
  do {
    code = Array.from({ length: 6 }, () => SHORT_CODE_CHARS[Math.floor(Math.random() * SHORT_CODE_CHARS.length)]).join('');
    const { rows } = await sql`SELECT id FROM leagues WHERE short_code = ${code}`.execute(db);
    if (!rows.length) return code;
  } while (++attempts < 20);
  return code; // last attempt, collision extremely unlikely
}

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

// GET /api/leagues — browse public leagues (search/discover)
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { q = '', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const search = `%${q.trim().toLowerCase()}%`;

    const { rows } = await sql`
      SELECT l.id, l.slug, l.name, l.tagline, l.is_public, l.plan, l.theme_json,
        (SELECT COUNT(*) FROM league_memberships WHERE league_id = l.id) AS member_count
      FROM leagues l
      WHERE l.is_public = TRUE
        AND (${q.trim() === ''} OR LOWER(l.name) LIKE ${search} OR LOWER(COALESCE(l.tagline, '')) LIKE ${search})
      ORDER BY member_count DESC, l.name
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `.execute(db);

    const { rows: countRows } = await sql`
      SELECT COUNT(*) as c FROM leagues
      WHERE is_public = TRUE
        AND (${q.trim() === ''} OR LOWER(name) LIKE ${search} OR LOWER(COALESCE(tagline, '')) LIKE ${search})
    `.execute(db);

    res.json({
      leagues: rows.map((r) => ({ ...r, member_count: parseInt(r.member_count) || 0 })),
      total: parseInt(countRows[0].c) || 0,
      page: parseInt(page),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leagues/mine — leagues where the current user is a member
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT l.*, lm.role, lm.frozen_at,
        CASE WHEN lm.role IN ('owner', 'admin') THEN
          (SELECT COUNT(*) FROM join_requests jr WHERE jr.league_id = l.id AND jr.status = 'pending')
        ELSE 0 END AS pending_requests_count
      FROM leagues l
      JOIN league_memberships lm ON lm.league_id = l.id AND lm.user_id = ${req.session.userId}
      ORDER BY l.name
    `.execute(db);
    res.json(rows.map(r => ({ ...r, pending_requests_count: parseInt(r.pending_requests_count) || 0 })));
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

    // Check if the logged-in user has a pending join request
    let userPendingRequest = false;
    if (req.session?.userId) {
      const { rows: reqRows } = await sql`
        SELECT 1 FROM join_requests
        WHERE league_id = ${league.id} AND user_id = ${req.session.userId} AND status = 'pending'
      `.execute(db);
      userPendingRequest = reqRows.length > 0;
    }

    res.json({ ...league, member_count: parseInt(league.member_count), join_code: joinCode, user_pending_request: userPendingRequest });
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

    const { name, is_public = true, rules = 'hamilton', tagline, sport = DEFAULT_SPORT } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'League name required' });

    // Validate sport against the LIVE registry (not the broader DB CHECK list),
    // so a league can't be created for a sport that has no game support yet.
    if (!isLiveSport(sport)) {
      return res.status(400).json({ error: 'Unsupported sport' });
    }

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

    const shortCode = await generateUniqueShortCode(db);

    const league = await db
      .insertInto('leagues')
      .values({ name: name.trim(), slug, is_public: is_public ? 1 : 0, rules, tagline: tagline?.trim() || null, short_code: shortCode, sport })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Make creator the owner
    await db
      .insertInto('league_memberships')
      .values({ league_id: league.id, user_id: userId, role: 'owner' })
      .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
      .execute();

    // Generate a join code (legacy backward compat)
    const code = generateJoinCode();
    await db
      .insertInto('join_codes')
      .values({ code, league_id: league.id, created_by: userId })
      .execute();

    // For private leagues, also generate a stable invite token
    let inviteToken = null;
    if (!is_public) {
      inviteToken = generateInviteToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .updateTable('leagues')
        .set({ invite_token: inviteToken, invite_token_expires_at: expiresAt })
        .where('id', '=', league.id)
        .execute();
    }

    res.status(201).json({ league, joinCode: code, inviteToken });
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

    const {
      name, is_public, rules, use_case, tagline, custom_rules_json, theme_json,
      score_submit_policy, tournament_create_policy,
      score_submit_allowed_ids, tournament_create_allowed_ids,
      score_verify_mode, race_to_target,
    } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      updates.name = name.trim();
    }
    if (is_public !== undefined) updates.is_public = is_public ? 1 : 0;
    if (rules !== undefined) {
      if (rules === 'custom' && !isPro(league)) {
        return res.status(403).json({ error: 'Custom rules require a Pro plan', upgrade: true });
      }
      updates.rules = rules;
    }
    if (use_case !== undefined) updates.use_case = use_case;
    if (tagline !== undefined) updates.tagline = tagline?.trim() || null;
    if (custom_rules_json !== undefined) {
      if (!isPro(league)) {
        return res.status(403).json({ error: 'Custom rules require a Pro plan', upgrade: true });
      }
      updates.custom_rules_json = custom_rules_json ? JSON.stringify(custom_rules_json) : null;
    }
    if (theme_json !== undefined) {
      if (!isPro(league)) {
        return res.status(403).json({ error: 'Custom theme requires a Pro plan', upgrade: true });
      }
      updates.theme_json = theme_json ? JSON.stringify(theme_json) : null;
    }
    const validSubmitPolicies = ['all_members', 'admins_only', 'select_players'];
    if (score_submit_policy !== undefined) {
      if (!validSubmitPolicies.includes(score_submit_policy)) return res.status(400).json({ error: 'Invalid score_submit_policy' });
      updates.score_submit_policy = score_submit_policy;
    }
    const validTournamentPolicies = ['admins_only', 'all_members', 'select_players'];
    if (tournament_create_policy !== undefined) {
      if (!validTournamentPolicies.includes(tournament_create_policy)) return res.status(400).json({ error: 'Invalid tournament_create_policy' });
      updates.tournament_create_policy = tournament_create_policy;
    }
    if (score_submit_allowed_ids !== undefined) {
      if (!Array.isArray(score_submit_allowed_ids)) return res.status(400).json({ error: 'score_submit_allowed_ids must be an array' });
      updates.score_submit_allowed_ids = JSON.stringify(score_submit_allowed_ids);
    }
    if (tournament_create_allowed_ids !== undefined) {
      if (!Array.isArray(tournament_create_allowed_ids)) return res.status(400).json({ error: 'tournament_create_allowed_ids must be an array' });
      updates.tournament_create_allowed_ids = JSON.stringify(tournament_create_allowed_ids);
    }
    const validVerifyModes = ['immediate', 'opponent_approve', 'both_submit'];
    if (score_verify_mode !== undefined) {
      if (!validVerifyModes.includes(score_verify_mode)) return res.status(400).json({ error: 'Invalid score_verify_mode' });
      updates.score_verify_mode = score_verify_mode;
    }
    // Race-to-N target: null/empty = off; otherwise an integer 1..99.
    if (race_to_target !== undefined) {
      if (race_to_target === null || race_to_target === '') {
        updates.race_to_target = null;
      } else {
        const n = parseInt(race_to_target, 10);
        if (!Number.isInteger(n) || n < 1 || n > 99) {
          return res.status(400).json({ error: 'race_to_target must be an integer between 1 and 99, or null' });
        }
        updates.race_to_target = n;
      }
    }

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

// ── Logo upload ──────────────────────────────────────────────────────────────

// POST /api/leagues/:slug/logo — upload league logo (Pro only, owner/admin)
router.post('/:slug/logo', requireAuth, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT * FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }
    if (!isPro(league)) {
      return res.status(403).json({ error: 'Custom theme requires a Pro plan', upgrade: true });
    }

    // Update theme_json with the logo_path, preserving other theme fields
    const existing = league.theme_json || {};
    const logoPath = `/logos/${path.basename(req.file.filename)}`;
    const updated = await db
      .updateTable('leagues')
      .set({ theme_json: JSON.stringify({ ...existing, logo_path: logoPath }) })
      .where('id', '=', league.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    res.json({ logo_path: logoPath, league: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/leagues/:slug/logo — remove league logo (Pro only, owner/admin)
router.delete('/:slug/logo', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT * FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    // Remove logo file if it exists
    const existing = league.theme_json || {};
    if (existing.logo_path) {
      const filePath = path.join(UPLOADS_DIR, existing.logo_path);
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    const { logo_path: _removed, ...rest } = existing;
    const updated = await db
      .updateTable('leagues')
      .set({ theme_json: Object.keys(rest).length ? JSON.stringify(rest) : null })
      .where('id', '=', league.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    res.json({ ok: true, league: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Public join page ─────────────────────────────────────────────────────────

// GET /api/leagues/:slug/join-info — rich preview for the public join request page
router.get('/:slug/join-info', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`SELECT id, is_public FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    if (!rows[0]) return res.status(404).json({ error: 'League not found' });
    if (!rows[0].is_public) return res.status(403).json({ error: 'This league is private' });

    const preview = await leaguePreview(db, rows[0].id);

    // If requester is logged in, check membership and any pending request
    let alreadyMember = false;
    let pendingRequest = false;
    if (req.session?.userId) {
      const { rows: memRows } = await sql`
        SELECT 1 FROM league_memberships
        WHERE league_id = ${rows[0].id} AND user_id = ${req.session.userId}
      `.execute(db);
      alreadyMember = memRows.length > 0;

      if (!alreadyMember) {
        const { rows: reqRows } = await sql`
          SELECT status FROM join_requests
          WHERE league_id = ${rows[0].id} AND user_id = ${req.session.userId}
        `.execute(db);
        pendingRequest = reqRows[0]?.status === 'pending';
      }
    }

    res.json({ ...preview, already_member: alreadyMember, pending_request: pendingRequest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leagues/:slug/join-requests — submit a request to join a public league
router.post('/:slug/join-requests', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT id, is_public, plan, name, slug FROM leagues WHERE slug = ${req.params.slug}
    `.execute(db);
    const league = rows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!league.is_public) return res.status(403).json({ error: 'This league is private — you need an invite link to join' });

    // Already a member?
    const { rows: memRows } = await sql`
      SELECT 1 FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (memRows.length > 0) return res.status(409).json({ error: 'You are already a member of this league' });

    const { message } = req.body;

    await db
      .insertInto('join_requests')
      .values({
        league_id: league.id,
        user_id: req.session.userId,
        status: 'pending',
        message: message?.trim() || null,
      })
      .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
      .execute();

    // Notify league owners/admins — fire-and-forget, don't block the response
    (async () => {
      try {
        const [{ rows: admins }, { rows: requesterRows }] = await Promise.all([
          sql`
            SELECT u.email, u.display_name
            FROM league_memberships lm
            JOIN users u ON u.id = lm.user_id
            WHERE lm.league_id = ${league.id}
              AND lm.role IN ('owner', 'admin')
              AND u.email IS NOT NULL
          `.execute(db),
          sql`SELECT display_name FROM users WHERE id = ${req.session.userId}`.execute(db),
        ]);
        const joinerName = requesterRows[0]?.display_name || 'Someone';
        const reviewUrl = `${(process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')}/l/${league.slug}/settings`;
        await Promise.all(
          admins.map((admin) =>
            sendJoinRequestEmail({
              to: admin.email,
              adminName: admin.display_name,
              leagueName: league.name,
              joinerName,
              reviewUrl,
            })
          )
        );
      } catch (err) {
        console.error('[Email] join request notification failed:', err);
      }
    })();

    res.status(201).json({ ok: true });
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
      SELECT u.id, u.display_name, u.nickname, u.avatar_url, u.email, lm.role, lm.joined_at, lm.frozen_at
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

// PATCH /api/leagues/:slug/members/:userId — change member role (owner only)
router.patch('/:slug/members/:userId', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: requesterRows } = await sql`
      SELECT role FROM league_memberships WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!requesterRows[0] || requesterRows[0].role !== 'owner') {
      return res.status(403).json({ error: 'Only the league owner can change member roles' });
    }

    const targetId = parseInt(req.params.userId);
    const { role } = req.body;
    if (!['admin', 'player'].includes(role)) return res.status(400).json({ error: 'Role must be admin or player' });

    const { rows: targetRows } = await sql`
      SELECT role FROM league_memberships WHERE league_id = ${league.id} AND user_id = ${targetId}
    `.execute(db);
    if (!targetRows[0]) return res.status(404).json({ error: 'Member not found' });
    if (targetRows[0].role === 'owner') return res.status(403).json({ error: 'Cannot change the owner role' });

    await db.updateTable('league_memberships')
      .set({ role })
      .where('league_id', '=', league.id)
      .where('user_id', '=', targetId)
      .execute();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leagues/:slug/members/stub — admin creates a placeholder player (no auth) and gets a claim link
router.post('/:slug/members/stub', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id, slug, name FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const { display_name } = req.body;
    if (!display_name?.trim()) return res.status(400).json({ error: 'display_name required' });
    const name = display_name.trim();

    const claimToken = randomBytes(24).toString('base64url');
    const claimExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;

    const result = await db
      .insertInto('users')
      .values({
        display_name: name,
        avatar_url: avatarUrl,
        is_admin: 0,
        elo_rating: 1000,
        claim_token: claimToken,
        claim_token_expires_at: claimExpires,
      })
      .executeTakeFirst();

    const newUserId = Number(result.insertId);

    await db
      .insertInto('league_memberships')
      .values({ league_id: league.id, user_id: newUserId, role: 'player' })
      .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
      .execute();

    const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
    const claimLink = `${appUrl}/claim?token=${claimToken}`;

    res.status(201).json({ user_id: newUserId, display_name: name, claim_link: claimLink });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leagues/:slug/grace-resolve — admin manually chooses which 8 members keep access
router.post('/:slug/grace-resolve', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`
      SELECT id, grace_period_ends_at FROM leagues WHERE slug = ${req.params.slug}
    `.execute(db);
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

    // Grace period must still be active — 409 if cron already ran
    if (!league.grace_period_ends_at || new Date(league.grace_period_ends_at) < new Date()) {
      return res.status(409).json({ error: 'The grace period has already ended — player access has been set automatically.' });
    }

    const { keepUserIds } = req.body;
    if (!Array.isArray(keepUserIds) || keepUserIds.length > 8) {
      return res.status(400).json({ error: 'keepUserIds must be an array of up to 8 user IDs.' });
    }

    const keepSet = new Set(keepUserIds.map(Number));

    // Freeze every active member NOT in keepUserIds
    const { rows: activeMembers } = await sql`
      SELECT user_id FROM league_memberships
      WHERE league_id = ${league.id} AND frozen_at IS NULL
    `.execute(db);

    for (const m of activeMembers) {
      if (!keepSet.has(m.user_id)) {
        await sql`
          UPDATE league_memberships SET frozen_at = NOW()
          WHERE league_id = ${league.id} AND user_id = ${m.user_id}
        `.execute(db);
        console.log(`[GraceResolve] Froze user_id=${m.user_id} in league ${league.id}`);
      }
    }

    // Clear grace period marker
    await sql`UPDATE leagues SET grace_period_ends_at = NULL WHERE id = ${league.id}`.execute(db);

    console.log(`[GraceResolve] League ${league.id} resolved: kept ${keepSet.size}, frozen ${activeMembers.length - keepSet.size}`);
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

// POST /api/leagues/:slug/invite-token — generate/reset the 30-day invite token
router.post('/:slug/invite-token', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .updateTable('leagues')
      .set({ invite_token: token, invite_token_expires_at: expiresAt })
      .where('id', '=', league.id)
      .execute();

    res.json({ token, expires_at: expiresAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/leagues/:slug/invite-token/touch — extend expiry 30 days (no new token)
router.post('/:slug/invite-token/touch', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await sql`UPDATE leagues SET invite_token_expires_at = ${expiresAt} WHERE id = ${league.id}`.execute(db);

    res.json({ expires_at: expiresAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leagues/:slug/join-requests — list pending requests (owner/admin)
router.get('/:slug/join-requests', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const { rows } = await sql`
      SELECT jr.id, jr.status, jr.created_at, jr.message,
             u.id as user_id, u.display_name, u.avatar_url, u.email
      FROM join_requests jr
      JOIN users u ON u.id = jr.user_id
      WHERE jr.league_id = ${league.id} AND jr.status = 'pending'
      ORDER BY jr.created_at ASC
    `.execute(db);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/leagues/:slug/join-requests/:id — approve or deny
router.patch('/:slug/join-requests/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id, name, slug FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships
      WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const { action } = req.body; // 'approve' | 'deny'
    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve or deny' });
    }

    const requestId = parseInt(req.params.id);
    const { rows: reqRows } = await sql`
      SELECT * FROM join_requests WHERE id = ${requestId} AND league_id = ${league.id}
    `.execute(db);
    if (!reqRows[0]) return res.status(404).json({ error: 'Request not found' });

    const status = action === 'approve' ? 'approved' : 'denied';
    await sql`
      UPDATE join_requests
      SET status = ${status}, reviewed_at = NOW(), reviewed_by = ${req.session.userId}
      WHERE id = ${requestId}
    `.execute(db);

    if (action === 'approve') {
      await db
        .insertInto('league_memberships')
        .values({ league_id: league.id, user_id: reqRows[0].user_id, role: 'player' })
        .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
        .execute();
    }

    // Notify the applicant — fire-and-forget
    (async () => {
      try {
        const { rows: applicantRows } = await sql`
          SELECT display_name, email FROM users WHERE id = ${reqRows[0].user_id}
        `.execute(db);
        const applicant = applicantRows[0];
        if (!applicant?.email) return;

        const baseUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
        if (action === 'approve') {
          const leagueUrl = `${baseUrl}/l/${league.slug}`;
          await sendJoinApprovedEmail({
            to: applicant.email,
            applicantName: applicant.display_name,
            leagueName: league.name,
            leagueUrl,
          });
        } else {
          await sendJoinDeniedEmail({
            to: applicant.email,
            applicantName: applicant.display_name,
            leagueName: league.name,
          });
        }
      } catch (err) {
        console.error('[Email] join review notification failed:', err);
      }
    })();

    res.json({ ok: true, status });
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

function generateInviteToken() {
  const { randomBytes } = require('crypto');
  return randomBytes(18).toString('base64url');
}

// POST /api/leagues/:slug/short-code — regenerate the league's short code (owner/admin)
router.post('/:slug/short-code', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { rows: leagueRows } = await sql`SELECT id FROM leagues WHERE slug = ${req.params.slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    const { rows: memberRows } = await sql`
      SELECT role FROM league_memberships WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    if (!memberRows[0] || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: 'Owner or admin role required' });
    }

    const shortCode = await generateUniqueShortCode(db);
    await db.updateTable('leagues').set({ short_code: shortCode }).where('id', '=', league.id).execute();

    res.json({ short_code: shortCode });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/leagues/:slug — permanently delete a league and ALL of its data.
//
// SAFETY (Andrew's hard requirement): this is scoped STRICTLY to one league. It
// removes only rows tied to this league_id (plus its games' participants and its
// tournaments' matches), then the league row — all in a single transaction so a
// failure rolls back cleanly. It NEVER touches:
//   • users (players)               • user_sport_ratings (global per user/sport)
//   • any OTHER league's rows        • kv_store / sessions
// The flagship `cornhole249` league is hard-protected and cannot be deleted.
// Authorization: league OWNER (or site superadmin) only, with a typed-name
// confirmation as defense-in-depth against accidental/automated calls.
router.delete('/:slug', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const slug = req.params.slug;

    if (slug === 'cornhole249') {
      return res.status(403).json({ error: 'The Cornhole249 league is protected and cannot be deleted.' });
    }

    const { rows: leagueRows } = await sql`SELECT id, name FROM leagues WHERE slug = ${slug}`.execute(db);
    const league = leagueRows[0];
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Owner of THIS league, or a site superadmin.
    const { rows: roleRows } = await sql`
      SELECT role FROM league_memberships WHERE league_id = ${league.id} AND user_id = ${req.session.userId}
    `.execute(db);
    const isOwner = roleRows[0]?.role === 'owner';
    if (!isOwner && !req.session.isAdmin) {
      return res.status(403).json({ error: 'Only the league owner can delete a league.' });
    }

    // Typed confirmation must match the league name.
    const confirm = (req.body?.confirm || '').trim();
    if (confirm.toLowerCase() !== String(league.name).trim().toLowerCase()) {
      return res.status(400).json({ error: 'Type the league name exactly to confirm deletion.' });
    }

    const id = league.id;
    await db.transaction().execute(async (trx) => {
      // Grandchildren first (rows keyed off this league's games / tournaments).
      await sql`DELETE FROM game_participants WHERE game_id IN (SELECT id FROM games WHERE league_id = ${id})`.execute(trx);
      await sql`DELETE FROM tournament_matches WHERE tournament_id IN (SELECT id FROM tournaments WHERE league_id = ${id})`.execute(trx);
      // Every league-scoped table (explicit + ordered; never relies on cascades).
      await sql`DELETE FROM comments WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM games WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM tournaments WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM matches WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM trash_talk WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM achievements WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM venues WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM join_codes WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM join_requests WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM pending_game_submissions WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM plan_override_audit WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM league_memberships WHERE league_id = ${id}`.execute(trx);
      await sql`DELETE FROM leagues WHERE id = ${id}`.execute(trx);
    });

    // The league's games are gone, so the GLOBAL per-sport ratings are now stale
    // — replay the remaining games to correct them. Non-fatal: the delete already
    // committed, so a recompute hiccup must not fail the request.
    try {
      await recomputeAllSportRatings(db);
    } catch (e) {
      console.warn('[LeagueDelete] rating recompute failed (delete still succeeded):', e.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
