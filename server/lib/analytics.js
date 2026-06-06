/**
 * PostHog server-side analytics wrapper.
 *
 * Lazy-initialises the PostHog Node client on first use.
 * Disabled when POSTHOG_KEY is unset (local dev / test).
 *
 * Usage:
 *   const { capture } = require('./analytics');
 *   capture(userId, 'subscription_created', { plan: 'pro_monthly' });
 */

const { PostHog } = require('posthog-node');

let _client = null;

function getClient() {
  if (_client) return _client;
  const key = process.env.POSTHOG_KEY;
  if (!key || process.env.NODE_ENV === 'test') return null;
  _client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 20,
    flushInterval: 10000,
  });
  return _client;
}

/**
 * Fire a server-side PostHog event.
 *
 * @param {number|string} distinctId — our user_id (string-coerced for PostHog)
 * @param {string}        event      — event name, e.g. 'subscription_created'
 * @param {object}        properties — optional extra properties
 */
function capture(distinctId, event, properties = {}) {
  const client = getClient();
  if (!client) return;
  try {
    client.capture({ distinctId: String(distinctId), event, properties });
  } catch (_) {
    // Non-fatal — analytics must never break the request path
  }
}

module.exports = { capture };
