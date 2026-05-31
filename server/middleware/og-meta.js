// Server-side OG meta tag injection. Crawlers (iMessage, Discord, Twitter,
// Slack, etc.) fetch the HTML page and read <meta property="og:image"> from
// <head>. They don't run JavaScript — so without this middleware they'd see
// the same generic site-wide meta on every URL and every share preview would
// look identical.
//
// This middleware:
//   1. Reads index.html once at startup, caches the contents.
//   2. On matching routes (/games/:id, /players/:id, etc.), loads minimal
//      data, builds a <title> + og:image + og:description, and inlines them
//      into <head> before sending the modified HTML.
//   3. On all other routes, sends index.html unmodified.

const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');

let indexHtmlCache = null;

function loadIndexHtml(clientDist) {
  if (indexHtmlCache) return indexHtmlCache;
  indexHtmlCache = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  return indexHtmlCache;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function originFor(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN;
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// Build the <meta> tag block. og:image must be absolute for most crawlers.
function metaTags({ title, description, imagePath, url }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(imagePath);
  const u = escapeHtml(url);
  return `
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Cornhole249" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${u}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
  `;
}

// Inject our meta block into <head> by replacing the static <title>. The
// existing index.html has exactly one <title> tag with the default text, so
// we swap it out — that preserves the surrounding fonts/styles links.
function injectMeta(html, tagBlock) {
  return html.replace(
    /<title>[^<]*<\/title>/,
    tagBlock.trim()
  );
}

// ── route resolvers ─────────────────────────────────────────────────────────
// Each resolver inspects the URL, loads minimal data, returns { title,
// description, imagePath } if matched, or null if it's a route we don't have
// custom meta for.

function resolveMeta(url, db) {
  // /games/:id
  let m = url.match(/^\/games\/(\d+)\/?$/);
  if (m) {
    const id = parseInt(m[1]);
    const game = db
      .prepare(
        `SELECT g.*, v.name as venue_name
         FROM games g LEFT JOIN venues v ON g.venue_id = v.id WHERE g.id = ?`
      )
      .get(id);
    if (!game) return null;
    const participants = db
      .prepare(
        `SELECT gp.team, gp.score, gp.is_winner, u.display_name
         FROM game_participants gp JOIN users u ON gp.user_id = u.id
         WHERE gp.game_id = ? ORDER BY gp.team, gp.id`
      )
      .all(id);
    const t1 = participants.filter((p) => p.team === 1);
    const t2 = participants.filter((p) => p.team === 2);
    if (!t1.length || !t2.length) return null;
    const winners = t1[0].is_winner ? t1 : t2;
    const losers = t1[0].is_winner ? t2 : t1;
    const wNames = winners.map((p) => p.display_name).join(' & ');
    const lNames = losers.map((p) => p.display_name).join(' & ');
    const wScore = winners[0].score;
    const lScore = losers[0].score;
    return {
      title: `${wNames} beat ${lNames} ${wScore}-${lScore} — Cornhole249`,
      description: `${game.game_type} game${game.venue_name ? ` at ${game.venue_name}` : ''} · Cornhole249`,
      imagePath: `/og/game/${id}.png`,
    };
  }

  // /players/:id
  m = url.match(/^\/players\/(\d+)\/?$/);
  if (m) {
    const id = parseInt(m[1]);
    const user = db.prepare(`SELECT display_name, nickname FROM users WHERE id = ?`).get(id);
    if (!user) return null;
    const stats = db
      .prepare(
        `SELECT COUNT(*) as gp, SUM(is_winner) as wins
         FROM game_participants WHERE user_id = ?`
      )
      .get(id);
    const wins = stats.wins || 0;
    const losses = (stats.gp || 0) - wins;
    const name = user.nickname ? `${user.display_name} "${user.nickname}"` : user.display_name;
    return {
      title: `${name} — Cornhole249`,
      description: `${wins}–${losses} all-time · Cornhole249 player profile`,
      imagePath: `/og/player/${id}.png`,
    };
  }

  // /standings
  m = url.match(/^\/standings\/?$/);
  if (m) {
    return {
      title: 'Standings — Cornhole249',
      description: 'Live 1v1 and 2v2 standings, win streaks, and head-to-head records',
      imagePath: `/og/standings.png`,
    };
  }

  // /tournaments — list page or with hash for specific tournament
  // (the tournaments page uses query params, not path params, so just match
  // the bare /tournaments path)
  m = url.match(/^\/tournaments\/?$/);
  if (m) {
    return {
      title: 'Tournaments — Cornhole249',
      description: 'Bracket-based tournaments at Cornhole249',
      imagePath: `/og/fallback.png`,
    };
  }

  // /teams/:p1/:p2 — 2v2 pair profile
  m = url.match(/^\/teams\/(\d+)\/(\d+)\/?$/);
  if (m) {
    const p1 = parseInt(m[1]);
    const p2 = parseInt(m[2]);
    const u1 = db.prepare(`SELECT display_name FROM users WHERE id = ?`).get(p1);
    const u2 = db.prepare(`SELECT display_name FROM users WHERE id = ?`).get(p2);
    if (!u1 || !u2) return null;
    return {
      title: `${u1.display_name} & ${u2.display_name} — Cornhole249`,
      description: `2v2 team profile · Cornhole249`,
      imagePath: `/og/fallback.png`,
    };
  }

  return null;
}

// ── middleware factory ──────────────────────────────────────────────────────
function ogMetaMiddleware(clientDist) {
  return function (req, res, next) {
    // Only intercept GETs that look like HTML page loads.
    if (req.method !== 'GET') return next();
    // Skip explicit asset requests — /assets/, files with extensions, /og/, /api/.
    if (req.path.startsWith('/api/') || req.path.startsWith('/og/') || req.path.startsWith('/auth/')) {
      return next();
    }
    if (/\.[a-z0-9]+$/i.test(req.path)) return next();

    let meta;
    try {
      meta = resolveMeta(req.path, getDb());
    } catch (e) {
      console.warn('[OG-Meta] resolver error:', e.message);
      return next();
    }
    if (!meta) return next();

    let html;
    try {
      html = loadIndexHtml(clientDist);
    } catch (e) {
      console.warn('[OG-Meta] index.html read failed:', e.message);
      return next();
    }

    const origin = originFor(req);
    const tagBlock = metaTags({
      title: meta.title,
      description: meta.description,
      imagePath: origin + meta.imagePath,
      url: origin + req.originalUrl,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(injectMeta(html, tagBlock));
  };
}

module.exports = { ogMetaMiddleware };
