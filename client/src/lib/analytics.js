/**
 * PostHog analytics wrapper.
 *
 * The project API key is intentionally hardcoded — it is a public identifier
 * (like a Stripe publishable key) and is visible in the browser bundle / network
 * traffic regardless. The env-var fallback allows overriding in different environments.
 *
 * Usage:
 *   import { capture, identify, reset } from '../lib/analytics';
 *   capture('game_logged', { game_type: '1v1' });
 */

import posthog from 'posthog-js';

// Public project API key — safe to hardcode.
const KEY  = import.meta.env.VITE_POSTHOG_KEY || 'phc_tBUiTgpbhdCsresDDpjvdgqqRCZLCiegKFvDuXWxA7SA';
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

posthog.init(KEY, {
  api_host: HOST,
  // Only create person profiles for identified users — avoids anonymous profile bloat
  person_profiles: 'identified_only',
  // We manually fire $pageview on route changes (see PostHogPageView in App.jsx)
  // so we disable the automatic capture to avoid double-counting the initial load.
  capture_pageview: false,
  capture_pageleave: false,
  // Disable click/input autocapture — we use explicit events only
  autocapture: false,
});

/** Fire a named event with optional properties. */
export function capture(event, props = {}) {
  posthog.capture(event, props);
}

/** Associate subsequent events with a known user. Call on login + initial auth load. */
export function identify(userId, traits = {}) {
  posthog.identify(String(userId), traits);
}

/** Dissociate the current user — call on logout. */
export function reset() {
  posthog.reset();
}

/** Fire a $pageview for the current URL. Called by PostHogPageView on every route change. */
export function pageview() {
  posthog.capture('$pageview');
}
