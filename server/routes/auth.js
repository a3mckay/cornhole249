const express = require('express');
const router = express.Router();
const { randomBytes } = require('crypto');
const bcrypt = require('bcrypt');
const { getDb, sql } = require('../db');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/email');

const BCRYPT_ROUNDS = 12;
const SALT = '$2b$12$'; // marker — actual salt generated at runtime

// Password must be 8+ chars with at least 1 number and 1 special character
function validatePassword(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/\d/.test(pw)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character';
  return null;
}

function validateEmail(email) {
  if (!email || !email.includes('@') || email.length > 255) return 'Valid email address required';
  return null;
}

async function generateUniqueToken(db, column) {
  let token;
  do {
    token = randomBytes(32).toString('hex');
    const { rows } = await sql`
      SELECT id FROM users WHERE ${sql.ref(column)} = ${token} LIMIT 1
    `.execute(db);
    if (!rows.length) break;
  } while (true); // eslint-disable-line no-constant-condition
  return token;
}

// ── GET /auth/me ─────────────────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) return res.json(null);
    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select([
        'id', 'display_name', 'nickname', 'avatar_url', 'is_admin',
        'elo_rating', 'ref_token', 'email', 'email_verified_at',
        'google_id',
      ])
      .where('id', '=', req.session.userId)
      .executeTakeFirst();
    if (!user) return res.json(null);
    // Indicate whether the user still needs to set up a real login method
    const needsMigration = !user.email && !user.google_id;
    res.json({ ...user, needs_migration: needsMigration });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/login ─────────────────────────────────────────────────────────
//
// Accepts EITHER:
//   { email, password }            → new-style email + password login
//   { user_id, pin }               → legacy PIN login (returns needs_migration: true)
//
// The legacy path keeps existing Cornhole249 users functional until they
// complete the claim-account migration.

router.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const { email, password, user_id, pin } = req.body;

    // ── Legacy PIN login ──────────────────────────────────────────────────────
    if (user_id) {
      if (!user_id) return res.status(400).json({ error: 'user_id required' });
      const user = await db
        .selectFrom('users')
        .select(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'pin', 'email', 'google_id'])
        .where('id', '=', parseInt(user_id))
        .executeTakeFirst();
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.pin) {
        if (!pin) return res.status(401).json({ error: 'pin_required' });
        if (pin !== user.pin) return res.status(401).json({ error: 'Incorrect PIN' });
      }
      req.session.userId = user.id;
      req.session.isAdmin = user.is_admin === 1;
      const { pin: _pin, ...safeUser } = user;
      const needsMigration = !safeUser.email && !safeUser.google_id;
      return res.json({ ...safeUser, needs_migration: needsMigration });
    }

    // ── Email + password login ────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const user = await db
      .selectFrom('users')
      .select([
        'id', 'display_name', 'nickname', 'avatar_url', 'is_admin',
        'elo_rating', 'ref_token', 'email', 'email_verified_at', 'google_id', 'password_hash',
      ])
      .where('email', '=', email.toLowerCase().trim())
      .executeTakeFirst();

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;
    const { password_hash: _pw, ...safeUser } = user;
    return res.json({ ...safeUser, needs_migration: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/register ──────────────────────────────────────────────────────
// Body: { email, password, display_name, code?, ref_token? }

router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name, code, ref_token: incomingRefToken } = req.body;

    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    if (!display_name?.trim()) return res.status(400).json({ error: 'Display name required' });

    const db = getDb();
    const normalEmail = email.toLowerCase().trim();

    // Check email uniqueness
    const existing = await db
      .selectFrom('users')
      .select(['id'])
      .where('email', '=', normalEmail)
      .executeTakeFirst();
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

    // Validate join code if provided
    let joinCode = null;
    if (code) {
      joinCode = await db
        .selectFrom('join_codes')
        .selectAll()
        .where('code', '=', code.trim().toUpperCase())
        .executeTakeFirst();
      if (!joinCode) return res.status(400).json({ error: 'Invalid join code' });
      if (joinCode.used_by) return res.status(400).json({ error: 'Join code already used' });

      // Enforce player cap on free leagues
      if (joinCode.league_id) {
        const { rows: leagueRows } = await sql`
          SELECT plan,
                 (SELECT COUNT(*) FROM league_memberships WHERE league_id = ${joinCode.league_id}) AS member_count
          FROM leagues WHERE id = ${joinCode.league_id}
        `.execute(db);
        const league = leagueRows[0];
        if (league && league.plan === 'free' && parseInt(league.member_count) >= 8) {
          return res.status(403).json({
            error: 'This league has reached the free plan limit of 8 players.',
            upgrade: true,
          });
        }
      }
    }

    // Resolve referral
    let referrerId = null;
    if (incomingRefToken) {
      const referrer = await db
        .selectFrom('users')
        .select(['id'])
        .where('ref_token', '=', incomingRefToken)
        .executeTakeFirst();
      if (referrer) referrerId = referrer.id;
    }

    // Generate ref_token for new user
    let newRefToken;
    do {
      newRefToken = randomBytes(4).toString('hex');
      const ex = await db.selectFrom('users').select(['id']).where('ref_token', '=', newRefToken).executeTakeFirst();
      if (!ex) break;
    } while (true); // eslint-disable-line no-constant-condition

    const name = display_name.trim();
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate email verification token
    const verifyToken = await generateUniqueToken(db, 'email_verify_token');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const newUser = await db
      .insertInto('users')
      .values({
        display_name: name,
        avatar_url: avatarUrl,
        is_admin: 0,
        elo_rating: 1000,
        email: normalEmail,
        password_hash: passwordHash,
        email_verify_token: verifyToken,
        email_verify_token_expires_at: verifyExpires,
        referred_by_user_id: referrerId,
        ref_token: newRefToken,
      })
      .returning(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'ref_token', 'email', 'email_verified_at'])
      .executeTakeFirstOrThrow();

    // Mark code used + add to league
    if (joinCode) {
      await db
        .updateTable('join_codes')
        .set({ used_by: newUser.id, used_at: new Date().toISOString() })
        .where('code', '=', joinCode.code)
        .execute();

      if (joinCode.league_id) {
        await db
          .insertInto('league_memberships')
          .values({ league_id: joinCode.league_id, user_id: newUser.id, role: 'player' })
          .onConflict((oc) => oc.columns(['league_id', 'user_id']).doNothing())
          .execute();
      }
    }

    // Send verification email (async — don't block response)
    sendVerificationEmail(normalEmail, verifyToken).catch((e) =>
      console.error('[Auth] Verification email failed:', e.message)
    );

    req.session.userId = newUser.id;
    req.session.isAdmin = false;
    res.status(201).json({ ...newUser, needs_migration: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/claim-account ─────────────────────────────────────────────────
// Migration path: existing PIN users set email + password.
// Body: { user_id, pin, email, password }

router.post('/claim-account', async (req, res) => {
  try {
    const { user_id, pin, email, password } = req.body;
    if (!user_id || !pin) return res.status(400).json({ error: 'user_id and pin required' });

    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });

    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'ref_token', 'pin', 'email'])
      .where('id', '=', parseInt(user_id))
      .executeTakeFirst();

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.pin || user.pin !== pin) return res.status(401).json({ error: 'Incorrect PIN' });
    if (user.email) return res.status(409).json({ error: 'This account already has an email address' });

    const normalEmail = email.toLowerCase().trim();
    const existing = await db
      .selectFrom('users')
      .select(['id'])
      .where('email', '=', normalEmail)
      .executeTakeFirst();
    if (existing) return res.status(409).json({ error: 'That email is already in use' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate email verification token
    const verifyToken = await generateUniqueToken(db, 'email_verify_token');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const updated = await db
      .updateTable('users')
      .set({
        email: normalEmail,
        password_hash: passwordHash,
        pin: null,
        email_verify_token: verifyToken,
        email_verify_token_expires_at: verifyExpires,
      })
      .where('id', '=', user.id)
      .returning(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'ref_token', 'email', 'email_verified_at'])
      .executeTakeFirstOrThrow();

    // Send verification email (async)
    sendVerificationEmail(normalEmail, verifyToken).catch((e) =>
      console.error('[Auth] Verification email failed:', e.message)
    );

    req.session.userId = updated.id;
    req.session.isAdmin = updated.is_admin === 1;
    res.json({ ...updated, needs_migration: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /auth/verify-email/:token ────────────────────────────────────────────

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['id', 'email_verify_token_expires_at'])
      .where('email_verify_token', '=', token)
      .executeTakeFirst();

    if (!user) return res.status(400).json({ error: 'Invalid or expired verification link' });

    const expires = new Date(user.email_verify_token_expires_at);
    if (expires < new Date()) {
      return res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
    }

    await db
      .updateTable('users')
      .set({
        email_verified_at: new Date().toISOString(),
        email_verify_token: null,
        email_verify_token_expires_at: null,
      })
      .where('id', '=', user.id)
      .execute();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/resend-verification ───────────────────────────────────────────

router.post('/resend-verification', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'email_verified_at', 'email_verify_token_expires_at'])
      .where('id', '=', req.session.userId)
      .executeTakeFirst();

    if (!user || !user.email) return res.status(400).json({ error: 'No email address on account' });
    if (user.email_verified_at) return res.status(400).json({ error: 'Email already verified' });

    // Rate limit: can only resend if last token is older than 2 minutes
    if (user.email_verify_token_expires_at) {
      const lastSentApprox = new Date(user.email_verify_token_expires_at).getTime() - 24 * 60 * 60 * 1000;
      if (Date.now() - lastSentApprox < 2 * 60 * 1000) {
        return res.status(429).json({ error: 'Please wait 2 minutes before requesting another email' });
      }
    }

    const verifyToken = await generateUniqueToken(db, 'email_verify_token');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await db
      .updateTable('users')
      .set({ email_verify_token: verifyToken, email_verify_token_expires_at: verifyExpires })
      .where('id', '=', user.id)
      .execute();

    sendVerificationEmail(user.email, verifyToken).catch((e) =>
      console.error('[Auth] Resend verification failed:', e.message)
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/forgot-password ───────────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['id', 'email'])
      .where('email', '=', email.toLowerCase().trim())
      .executeTakeFirst();

    // Always return 200 — don't reveal whether the email exists
    if (!user) return res.json({ ok: true });

    const resetToken = await generateUniqueToken(db, 'password_reset_token');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await db
      .updateTable('users')
      .set({ password_reset_token: resetToken, password_reset_expires_at: resetExpires })
      .where('id', '=', user.id)
      .execute();

    sendPasswordResetEmail(user.email, resetToken).catch((e) =>
      console.error('[Auth] Reset email failed:', e.message)
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/reset-password ────────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) return res.status(400).json({ error: 'Reset token required' });

    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['id', 'password_reset_expires_at'])
      .where('password_reset_token', '=', token)
      .executeTakeFirst();

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const expires = new Date(user.password_reset_expires_at);
    if (expires < new Date()) {
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db
      .updateTable('users')
      .set({
        password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires_at: null,
      })
      .where('id', '=', user.id)
      .execute();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/claim-verify-pin ──────────────────────────────────────────────
// Verifies a PIN-only user's PIN and stores a short-lived session flag so the
// next Google OAuth flow links Google to that user instead of creating a new one.
// Body: { user_id, pin }

router.post('/claim-verify-pin', async (req, res) => {
  try {
    const { user_id, pin } = req.body;
    if (!user_id || !pin) return res.status(400).json({ error: 'user_id and pin required' });

    const db = getDb();
    const user = await db
      .selectFrom('users')
      .select(['id', 'pin', 'email', 'google_id'])
      .where('id', '=', parseInt(user_id))
      .executeTakeFirst();

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.pin || user.pin !== pin) return res.status(401).json({ error: 'Incorrect PIN' });
    if (user.email || user.google_id) return res.status(409).json({ error: 'Account already claimed' });

    // Store a short-lived claim in the session (5-minute window)
    req.session.pendingClaim = { userId: user.id, expiresAt: Date.now() + 5 * 60 * 1000 };

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /auth/set-pin ───────────────────────────────────────────────────────
// DEPRECATED — kept for any code still calling it; always returns 410 Gone.

router.post('/set-pin', (req, res) => {
  res.status(410).json({ error: 'PIN login has been replaced by email + password.' });
});

// ── POST /auth/logout ────────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
