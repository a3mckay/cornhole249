const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');
const { requireAdmin } = require('../middleware/auth');

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

// POST /api/admin/migrate-from-sqlite — one-time import of real data from the Railway volume
// Pass { dry_run: true } to preview what's in the SQLite without touching Postgres.
// Pass { dry_run: false, confirm: true } to execute the migration.
// Auth: either a logged-in admin session OR the x-migration-secret header matching MIGRATION_SECRET env var.
router.post('/migrate-from-sqlite', async (req, res) => {
  const secret = process.env.MIGRATION_SECRET;
  const providedSecret = req.headers['x-migration-secret'];
  const isAdminSession = req.session?.userId && req.session?.isAdmin;
  const isSecretAuth = secret && providedSecret === secret;

  if (!isAdminSession && !isSecretAuth) {
    return res.status(401).json({ error: 'Unauthorized: admin session or x-migration-secret header required' });
  }
  const SQLITE_PATH = process.env.DATABASE_PATH;
  if (!SQLITE_PATH) return res.status(400).json({ error: 'DATABASE_PATH env var not set' });

  let sqlite;
  try {
    const Database = require('better-sqlite3');
    sqlite = new Database(SQLITE_PATH, { readonly: true });
  } catch (e) {
    return res.status(500).json({ error: `Cannot open SQLite at ${SQLITE_PATH}: ${e.message}` });
  }

  try {
    // ── Read everything from SQLite ──────────────────────────────────────────
    const users        = sqlite.prepare('SELECT * FROM users ORDER BY id').all();
    const venues       = sqlite.prepare('SELECT * FROM venues ORDER BY id').all();
    const games        = sqlite.prepare('SELECT * FROM games ORDER BY id').all();
    const participants = sqlite.prepare('SELECT * FROM game_participants ORDER BY id').all();

    let achievements = [], comments = [], trashTalk = [], tournaments = [], tournamentMatches = [], kvStore = [];
    const tryRead = (sql) => { try { return sqlite.prepare(sql).all(); } catch (_) { return []; } };
    achievements     = tryRead('SELECT * FROM achievements ORDER BY id');
    comments         = tryRead('SELECT * FROM comments ORDER BY id');
    trashTalk        = tryRead('SELECT * FROM trash_talk ORDER BY id');
    tournaments      = tryRead('SELECT * FROM tournaments ORDER BY id');
    tournamentMatches= tryRead('SELECT * FROM tournament_matches ORDER BY id');
    kvStore          = tryRead('SELECT * FROM kv_store');

    const summary = {
      users:           users.map(u => ({ id: u.id, display_name: u.display_name, nickname: u.nickname, is_admin: u.is_admin, pin: u.pin ? '(set)' : null })),
      venues:          venues.map(v => ({ id: v.id, name: v.name, lat: v.lat, lng: v.lng })),
      game_count:      games.length,
      participant_count: participants.length,
      achievement_count: achievements.length,
      comment_count:   comments.length,
      trash_talk_count: trashTalk.length,
      tournament_count: tournaments.length,
      kv_keys:         kvStore.map(k => k.key),
    };

    if (req.body.dry_run !== false) {
      sqlite.close();
      return res.json({ dry_run: true, sqlite_path: SQLITE_PATH, summary });
    }

    if (!req.body.confirm) {
      sqlite.close();
      return res.status(400).json({ error: 'Pass confirm:true to execute the migration (cannot be undone)' });
    }

    // ── Execute migration ────────────────────────────────────────────────────
    const db = getDb();

    // Wipe all seed/fake data. TRUNCATE CASCADE handles circular FKs automatically.
    await sql`TRUNCATE TABLE
      achievements, comments, trash_talk,
      game_participants, games,
      tournament_matches, tournaments,
      league_memberships, join_codes,
      users, venues, kv_store
      CASCADE`.execute(db);

    // Import users
    for (const u of users) {
      await db.insertInto('users').values({
        id: u.id,
        display_name: u.display_name,
        nickname: u.nickname || null,
        avatar_url: u.avatar_url || null,
        is_admin: u.is_admin ? 1 : 0,
        elo_rating: u.elo_rating || 1000,
        created_at: u.created_at,
        pin: u.pin || null,
        handedness: u.handedness || 'right',
        // email/google_id/password_hash left NULL — users will claim via /claim-account
      }).execute();

      await db.insertInto('league_memberships').values({
        league_id: 1,
        user_id: u.id,
        role: u.is_admin ? 'owner' : 'player',
      }).onConflict(oc => oc.columns(['league_id', 'user_id']).doNothing()).execute();
    }
    await sql`SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1))`.execute(db);

    // Import venues
    for (const v of venues) {
      await db.insertInto('venues').values({
        id: v.id,
        name: v.name,
        lat: v.lat || null,
        lng: v.lng || null,
        created_at: v.created_at,
        league_id: 1,
      }).execute();
    }
    await sql`SELECT setval('venues_id_seq', GREATEST((SELECT MAX(id) FROM venues), 1))`.execute(db);

    // Import tournaments first (games reference them)
    for (const t of tournaments) {
      await db.insertInto('tournaments').values({
        id: t.id,
        name: t.name,
        format: t.format || 'single_elim',
        game_type: t.game_type || '1v1',
        status: t.status || 'pending',
        season: t.season || new Date(t.created_at || Date.now()).getFullYear(),
        created_at: t.created_at,
        league_id: 1,
      }).execute();
    }
    if (tournaments.length) await sql`SELECT setval('tournaments_id_seq', GREATEST((SELECT MAX(id) FROM tournaments), 1))`.execute(db);

    for (const m of tournamentMatches) {
      await db.insertInto('tournament_matches').values({
        id: m.id,
        tournament_id: m.tournament_id,
        round: m.round,
        match_number: m.match_number || 0,
        player1_id: m.player1_id || null,
        player2_id: m.player2_id || null,
        winner_id: m.winner_id || null,
        game_id: m.game_id || null,
      }).execute();
    }
    if (tournamentMatches.length) await sql`SELECT setval('tournament_matches_id_seq', GREATEST((SELECT MAX(id) FROM tournament_matches), 1))`.execute(db);

    // Import games
    for (const g of games) {
      await db.insertInto('games').values({
        id: g.id,
        game_type: g.game_type,
        played_at: g.played_at,
        season: g.season,
        venue_id: g.venue_id || null,
        weather_json: g.weather_json || null,
        submitted_by_user_id: g.submitted_by_user_id || null,
        created_at: g.created_at,
        tournament_match_id: g.tournament_match_id || null,
        league_id: 1,
      }).execute();
    }
    await sql`SELECT setval('games_id_seq', GREATEST((SELECT MAX(id) FROM games), 1))`.execute(db);

    // Import game_participants
    for (const p of participants) {
      await db.insertInto('game_participants').values({
        id: p.id,
        game_id: p.game_id,
        user_id: p.user_id,
        team: p.team,
        score: p.score,
        is_winner: p.is_winner,
      }).execute();
    }
    await sql`SELECT setval('game_participants_id_seq', GREATEST((SELECT MAX(id) FROM game_participants), 1))`.execute(db);

    // Import achievements
    for (const a of achievements) {
      await db.insertInto('achievements').values({
        id: a.id,
        user_id: a.user_id,
        achievement_key: a.achievement_key,
        earned_at: a.earned_at,
        league_id: 1,
      }).onConflict(oc => oc.columns(['user_id', 'achievement_key', 'league_id']).doNothing()).execute();
    }
    if (achievements.length) await sql`SELECT setval('achievements_id_seq', GREATEST((SELECT MAX(id) FROM achievements), 1))`.execute(db);

    // Import comments
    for (const c of comments) {
      await db.insertInto('comments').values({
        id: c.id,
        game_id: c.game_id,
        user_id: c.user_id,
        body: c.body,
        created_at: c.created_at,
        league_id: 1,
      }).execute();
    }
    if (comments.length) await sql`SELECT setval('comments_id_seq', GREATEST((SELECT MAX(id) FROM comments), 1))`.execute(db);

    // Import trash talk
    for (const t of trashTalk) {
      await db.insertInto('trash_talk').values({
        id: t.id,
        user_id: t.user_id,
        body: t.body,
        created_at: t.created_at,
        league_id: 1,
      }).execute();
    }
    if (trashTalk.length) await sql`SELECT setval('trash_talk_id_seq', GREATEST((SELECT MAX(id) FROM trash_talk), 1))`.execute(db);

    // Restore kv_store (startup fixes won't re-run on already-fixed data)
    for (const kv of kvStore) {
      await db.insertInto('kv_store').values({ key: kv.key, value: kv.value })
        .onConflict(oc => oc.column('key').doNothing()).execute();
    }

    // Point league to the admin user
    const adminUser = users.find(u => u.is_admin);
    if (adminUser) {
      await db.updateTable('leagues').set({ owner_user_id: adminUser.id }).where('id', '=', 1).execute();
    }

    sqlite.close();
    return res.json({ ok: true, summary });
  } catch (e) {
    try { sqlite.close(); } catch (_) {}
    return res.status(500).json({ error: e.message, stack: e.stack?.split('\n').slice(0,5) });
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
