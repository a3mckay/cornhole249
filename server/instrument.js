/**
 * Sentry instrumentation — must be required FIRST in server/index.js
 * before any other imports so Sentry can patch Node.js internals.
 *
 * Required env var:
 *   SENTRY_DSN — from your Sentry project settings → Client Keys
 *                Leave unset to disable Sentry (safe for local dev).
 */
require('dotenv').config();
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Capture 10% of requests for performance traces (free tier friendly)
    tracesSampleRate: 0.1,
    // Don't send errors in test runs
    enabled: process.env.NODE_ENV !== 'test',
    beforeSend(event) {
      // Strip request body — may contain email, password, or other PII
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      // Strip PII from Sentry user context
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}
