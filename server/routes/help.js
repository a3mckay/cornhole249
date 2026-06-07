const express = require('express');
const router = express.Router();
const { sendContactEmail } = require('../lib/email');

// Simple in-memory rate limiter for contact form — max 3 submissions per IP per hour.
// Using a Map to avoid adding another dependency.
const contactAttempts = new Map();

function contactRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const max = 3;

  const record = contactAttempts.get(ip);
  if (record) {
    // Remove stale entries
    record.times = record.times.filter((t) => now - t < windowMs);
    if (record.times.length >= max) {
      return res.status(429).json({ error: 'Too many messages. Please wait an hour before trying again.' });
    }
    record.times.push(now);
  } else {
    contactAttempts.set(ip, { times: [now] });
  }

  // Prune the map periodically to avoid unbounded growth
  if (contactAttempts.size > 10000) {
    for (const [key, val] of contactAttempts.entries()) {
      if (val.times.every((t) => now - t >= windowMs)) contactAttempts.delete(key);
    }
  }

  next();
}

// POST /api/help/contact
router.post('/contact', contactRateLimit, async (req, res) => {
  const { subject, body, reply_to } = req.body;

  if (!subject?.trim() || !body?.trim() || !reply_to?.trim()) {
    return res.status(400).json({ error: 'subject, body, and reply_to are required' });
  }
  if (subject.length > 120 || body.length > 2000) {
    return res.status(400).json({ error: 'Message too long' });
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply_to)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    await sendContactEmail({
      replyTo: reply_to.trim(),
      subject: subject.trim(),
      body: body.trim(),
      userId: req.session?.userId || null,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Help] Contact email failed:', e.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;
