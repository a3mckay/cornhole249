/**
 * PostHog analytics wrapper.
 *
 * The project API key is intentionally hardcoded — it is a public identifier
 * (like a Stripe publishable key) and is visible in the browser bundle / network
 * traffic regardless. The env-var fallback allows overriding in different environments.
 *
 * posthog-js is ~190 KB of JavaScript, so it is NOT part of the startup bundle:
 * it is downloaded once the browser is idle after first paint. Calls made
 * before it arrives are queued and replayed in order, so callers never notice.
 *
 * Usage:
 *   import { capture, identify, reset } from '../lib/analytics';
 *   capture('game_logged', { game_type: '1v1' });
 */

// Public project API key — safe to hardcode.
const KEY  = import.meta.env.VITE_POSTHOG_KEY || 'phc_tBUiTgpbhdCsresDDpjvdgqqRCZLCiegKFvDuXWxA7SA';
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let posthog = null;     // set once the library has loaded + initialised
let loading = false;
const queue = [];       // [method, args] calls made before posthog was ready

function load() {
  if (loading || typeof window === 'undefined') return;
  loading = true;
  import('posthog-js')
    .then(({ default: ph }) => {
      ph.init(KEY, {
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
      posthog = ph;
      for (const [method, args] of queue.splice(0)) posthog[method](...args);
    })
    .catch(() => { queue.length = 0; }); // analytics must never break the app
}

// Start loading once the page has painted and the main thread is free.
if (typeof window !== 'undefined') {
  const start = () => (window.requestIdleCallback
    ? window.requestIdleCallback(load, { timeout: 4000 })
    : setTimeout(load, 1500));
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

function call(method, ...args) {
  if (posthog) posthog[method](...args);
  else queue.push([method, args]);
}

/** Fire a named event with optional properties. */
export function capture(event, props = {}) {
  call('capture', event, props);
}

/** Associate subsequent events with a known user. Call on login + initial auth load. */
export function identify(userId, traits = {}) {
  call('identify', String(userId), traits);
}

/** Dissociate the current user — call on logout. */
export function reset() {
  call('reset');
}

/**
 * Fire a $pageview for the current URL. Called by PostHogPageView on every route change.
 * The URL is captured now (not when a queued call is replayed) so early pageviews
 * are attributed to the right page.
 */
export function pageview() {
  call('capture', '$pageview', { $current_url: window.location.href });
}
