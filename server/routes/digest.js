/**
 * Digest routes.
 *
 * GET /api/digest/unsubscribe?uid=<id>&token=<hmac>
 *   One-click unsubscribe from the weekly digest.
 *   Token is HMAC-SHA256(userId) signed with JWT_SECRET — no session required
 *   so it works directly from an email client.
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { getDb, sql } = require('../db');

/**
 * Generate a per-user unsubscribe token.
 * Deterministic: same user always gets the same token (no DB storage needed).
 */
function makeUnsubscribeToken(userId) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex');
}

// ── GET /api/digest/unsubscribe ───────────────────────────────────────────────
router.get('/unsubscribe', async (req, res) => {
  const { uid, token } = req.query;

  if (!uid || !token) {
    return res.status(400).json({ error: 'Missing uid or token' });
  }

  const userId = parseInt(uid, 10);
  if (!userId || isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const expected = makeUnsubscribeToken(userId);
  if (token !== expected) {
    return res.status(403).json({ error: 'Invalid unsubscribe token' });
  }

  const db = getDb();
  await sql`
    UPDATE users SET digest_unsubscribed_at = NOW() WHERE id = ${userId}
  `.execute(db);

  res.json({ success: true });
});

// ── GET /api/digest/resubscribe ───────────────────────────────────────────────
// Lets a user re-enable the digest from Settings (no token needed — must be logged in).
router.post('/resubscribe', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const db = getDb();
  await sql`
    UPDATE users SET digest_unsubscribed_at = NULL WHERE id = ${req.user.id}
  `.execute(db);
  res.json({ success: true });
});

module.exports = { router, makeUnsubscribeToken };
