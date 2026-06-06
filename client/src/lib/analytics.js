/**
 * PostHog analytics wrapper.
 *
 * Initialises posthog-js once at module load time.
 * All exports are no-ops when VITE_POSTHOG_KEY is unset (local dev without analytics).
 *
 * Usage:
 *   import { capture, identify, reset } from '../lib/analytics';
 *   capture('game_logged', { game_type: '1v1' });
 */

import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

if (KEY) {
  posthog.init(KEY, {
    api_host: HOST,
    // Only create person profiles for identified users — avoids anonymous profile bloat
    person_profiles: 'identified_only',
    // PostHog auto-tracks pageviews via History API; we don't need explicit calls
    capture_pageview: true,
    capture_pageleave: false,
    // Disable click/input autocapture — we use explicit events only
    autocapture: false,
  });
}

/** Fire a named event with optional properties. */
export function capture(event, props = {}) {
  if (KEY) posthog.capture(event, props);
}

/** Associate subsequent events with a known user. Call on login + initial auth load. */
export function identify(userId, traits = {}) {
  if (KEY) posthog.identify(String(userId), traits);
}

/** Dissociate the current user — call on logout. */
export function reset() {
  if (KEY) posthog.reset();
}
