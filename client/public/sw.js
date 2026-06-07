/**
 * Cornhole249 service worker — offline shell + static asset cache.
 *
 * Strategy:
 *   - Static assets (JS, CSS, fonts, images): Cache-First with network fallback.
 *   - Navigation requests (HTML): Network-First, serve cached shell on failure.
 *   - API requests (/api/, /auth/): Network-only — never cache auth or data.
 */

const CACHE_NAME = 'c249-shell-v1';

// Assets to pre-cache on install (the app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
];

// ── Install: pre-cache the shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API and auth: always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Static assets (hashed filenames) — Cache-First
  if (url.pathname.startsWith('/assets/') || url.pathname.match(/\.(png|svg|jpg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests — Network-First, cached shell on failure
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }
});
