// Force IPv4 DNS resolution — Railway containers lack IPv6 routing, which
// causes Nodemailer SMTP connections (smtp.gmail.com) to fail with ENETUNREACH.
require('dns').setDefaultResultOrder('ipv4first');

// ── Global error safety net ───────────────────────────────────────────────────
// In Node 22, unhandled promise rejections crash the process (exit 1) by
// default. Log them visibly so Railway logs capture the root cause before exit.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  // Re-throw so Railway sees a non-zero exit code and Sentry captures it.
  throw reason;
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

// Sentry must be initialised before any other require so it can instrument Node internals.
// instrument.js also calls dotenv.config() so we don't need to repeat it here.
require('./instrument');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const bcrypt = require('bcrypt');
const { runMigrations, getDb, sql } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(compression());

// ── Uploaded assets (logos, etc.) ────────────────────────────────────────────
// Served at /uploads/* — backed by a Railway persistent volume mounted at /uploads.
// Falls back to /tmp/uploads in development (files not preserved across restarts).
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/uploads';
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', immutable: false }));

// In production: redirect bare domain → www, and HTTP → HTTPS
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    // cornhole249.com (no www) → www
    if (host === 'cornhole249.com') {
      return res.redirect(301, 'https://www.cornhole249.com' + req.url);
    }
    // HTTP → HTTPS
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + host + req.url);
    }
    next();
  });
}

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
// Stripe webhooks require the raw body for signature verification.
// Mount the raw parser for /api/billing/webhook BEFORE express.json() parses it.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

// Session store: Postgres when DATABASE_URL is set, in-memory MemoryStore otherwise
// (MemoryStore is fine for local dev and tests — it's the express-session default).
let sessionStore;
if (process.env.DATABASE_URL) {
  const pgSession = require('connect-pg-simple')(session);
  sessionStore = new pgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
}

app.use(session({
  store: sessionStore, // undefined → express-session MemoryStore (tests / local without Postgres)
  secret: process.env.SESSION_SECRET || 'cornhole249-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// ── Google OAuth (Passport) ───────────────────────────────────────────────────
// Using passport.initialize() only — NOT passport.session().
// After Google auth, we set req.session.userId manually, just like email/password login.
if (process.env.GOOGLE_CLIENT_ID) {
  const _googleStrategy = new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
      scope: ['profile', 'email'],
      passReqToCallback: true,
      // Required when running behind Railway's reverse proxy: ensures the
      // callback URL is resolved using X-Forwarded-Proto/Host so it always
      // matches the HTTPS public URL sent to Google in the auth request.
      proxy: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
        try {
          const db = getDb();
          const googleId = profile.id;
          const googleEmail = profile.emails?.[0]?.value?.toLowerCase() || null;
          const displayName = profile.displayName || 'Player';
          const avatarUrl = profile.photos?.[0]?.value || null;

          // ── Claim-account flow: link Google to an existing PIN-only user ──────
          const pending = req.session?.pendingClaim;
          if (pending && pending.expiresAt > Date.now()) {
            try {
              const claimed = await db
                .updateTable('users')
                .set({
                  google_id: googleId,
                  google_email: googleEmail,
                  pin: null,
                  email_verified_at: googleEmail ? new Date().toISOString() : null,
                  ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
                })
                .where('id', '=', pending.userId)
                .returning(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'ref_token', 'email', 'email_verified_at', 'google_id'])
                .executeTakeFirstOrThrow();
              delete req.session.pendingClaim;
              return done(null, claimed);
            } catch (e) {
              return done(e);
            }
          }

          // ── Normal Google login / registration ────────────────────────────────

          // 1. Look up by google_id
          let user = await db
            .selectFrom('users')
            .select(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'ref_token', 'email', 'email_verified_at', 'google_id'])
            .where('google_id', '=', googleId)
            .executeTakeFirst();

          if (!user && googleEmail) {
            // 2. Look up by email — link the Google account to an existing user
            user = await db
              .selectFrom('users')
              .select(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'ref_token', 'email', 'email_verified_at', 'google_id'])
              .where('email', '=', googleEmail)
              .executeTakeFirst();
            if (user) {
              // Link Google ID to existing account
              await db
                .updateTable('users')
                .set({ google_id: googleId, google_email: googleEmail, email_verified_at: user.email_verified_at || new Date().toISOString() })
                .where('id', '=', user.id)
                .execute();
              user = { ...user, google_id: googleId, email_verified_at: user.email_verified_at || new Date().toISOString() };
            }
          }

          if (!user) {
            // 3. Create new user
            const { randomBytes } = require('crypto');
            let refToken;
            do {
              refToken = randomBytes(4).toString('hex');
              const ex = await db.selectFrom('users').select(['id']).where('ref_token', '=', refToken).executeTakeFirst();
              if (!ex) break;
            } while (true); // eslint-disable-line no-constant-condition

            const newAvatarUrl = avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`;
            user = await db
              .insertInto('users')
              .values({
                display_name: displayName,
                avatar_url: newAvatarUrl,
                is_admin: 0,
                elo_rating: 1000,
                email: googleEmail,
                email_verified_at: googleEmail ? new Date().toISOString() : null,
                google_id: googleId,
                google_email: googleEmail,
                ref_token: refToken,
              })
              .returning(['id', 'display_name', 'nickname', 'avatar_url', 'is_admin', 'elo_rating', 'ref_token', 'email', 'email_verified_at', 'google_id'])
              .executeTakeFirstOrThrow();
            // Flag so the OAuth callback can redirect new users to league creation
            user = { ...user, _isNewAccount: true };
          }

          done(null, user);
        } catch (e) {
          done(e);
        }
      }
    );

  // Intercept token exchange to log exact params sent to Google — remove once invalid_grant is resolved.
  const _origGetToken = _googleStrategy._oauth2.getOAuthAccessToken.bind(_googleStrategy._oauth2);
  _googleStrategy._oauth2.getOAuthAccessToken = function (code, params, callback) {
    console.log('[Google OAuth Debug] Token exchange params:', JSON.stringify({
      redirect_uri: params.redirect_uri,
      grant_type: params.grant_type,
      client_id_prefix: this._clientId?.slice(0, 20),
      code_prefix: code?.slice(0, 12),
    }));
    return _origGetToken(code, params, callback);
  };

  passport.use(_googleStrategy);
}

app.use(passport.initialize()); // Note: no passport.session() — we use express-session directly

// Google OAuth routes
app.get('/auth/google', (req, res, next) => {
  if (req.query.returnTo) req.session.authRedirect = req.query.returnTo;
  next();
}, passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

app.get('/auth/google/callback', (req, res, next) => {
  // Use the custom-callback form so that errors thrown by passport-oauth2
  // (e.g. TokenError from a failed code exchange) are caught here and result
  // in a clean redirect rather than falling through to the JSON error handler.
  // The standard failureRedirect option only handles self.fail(), not self.error().
  passport.authenticate('google', { session: false }, (err, user) => {
    if (err || !user) {
      console.error('[Google OAuth] Authentication error:', err || 'no user returned');
      return res.redirect('/login?error=google_failed');
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;

    // New Google users go to league creation unless a specific returnTo was set.
    const dest = req.session.authRedirect || (user._isNewAccount ? '/leagues/new' : '/');
    delete req.session.authRedirect;
    return res.redirect(dest);
  })(req, res, next);
});

// ── League context: set req.leagueId = 1 (Cornhole249) for all requests.
// League-scoped /api/l/:slug/... routes will override it via leagueMiddleware.
app.use((req, res, next) => { req.leagueId = 1; next(); });

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/games', require('./routes/games'));
app.use('/api', require('./routes/comments'));
app.use('/api/standings', require('./routes/standings'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/house', require('./routes/house'));
app.use('/api/odds', require('./routes/odds'));
app.use('/api/venues', require('./routes/venues'));
app.use('/api/weather', require('./routes/weather'));
const tournamentsRouter = require('./routes/tournaments');
app.use('/api/tournaments', tournamentsRouter);
// PATCH /api/tournament-matches/:id is handled directly via the tournaments router's /matches/:id
// Alias it here so the client can use either path
app.patch('/api/tournament-matches/:id', require('./middleware/auth').requireAdmin, (req, res, next) => {
  req.url = '/matches/' + req.params.id;
  tournamentsRouter(req, res, next);
});
app.use('/api/achievements', require('./routes/achievements'));
app.use('/api/trash-talk', require('./routes/trashtalk'));

// Admin routes
app.use('/api/admin', require('./routes/admin'));

// Billing (Stripe Checkout, Customer Portal, Webhooks)
app.use('/api/billing', require('./routes/billing'));

// Join/invite route — public, no auth
app.use('/api/join', require('./routes/join'));

// League CRUD (no slug — operates on the collection)
app.use('/api/leagues', require('./routes/leagues'));
app.use('/api/help',   require('./routes/help'));
app.use('/api/digest', require('./routes/digest').router);

// ── League-scoped routes: /api/l/:slug/... ──────────────────────────────────
const { leagueMiddleware, requireLeagueAccess } = require('./middleware/leagueAccess');
const { requireAuth: requireAuthMw } = require('./middleware/auth');

// Reads are open to public-league non-members; writes always require membership.
function requireLeagueAccessForMethod(req, res, next) {
  const mode = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? 'write' : 'read';
  return requireLeagueAccess(mode)(req, res, next);
}

function mountLeague(path, router) {
  app.use(
    `/api/l/:slug/${path}`,
    leagueMiddleware,
    requireLeagueAccessForMethod,
    router
  );
}

const { requirePro } = require('./middleware/planAccess');

const gamesRouter      = require('./routes/games');
const standingsRouter  = require('./routes/standings');
const statsRouter      = require('./routes/stats');
const oddsRouter       = require('./routes/odds');
const venuesRouter     = require('./routes/venues');
const usersRouter      = require('./routes/users');
const achievementsRouter = require('./routes/achievements');
const trashTalkRouter  = require('./routes/trashtalk');
const tournamentsRouterL = require('./routes/tournaments');
const commentsRouter   = require('./routes/comments');
const joinRouterL      = require('./routes/join');
const exportRouter     = require('./routes/export');

// Like mountLeague but also requires a Pro plan (used for Stats, which is Pro-only).
function mountLeaguePro(path, router) {
  app.use(
    `/api/l/:slug/${path}`,
    leagueMiddleware,
    requireLeagueAccessForMethod,
    requirePro,
    router
  );
}

mountLeague('games',        gamesRouter);
mountLeague('standings',    standingsRouter);
mountLeaguePro('stats',     statsRouter);     // Pro-gated — Stats page
mountLeaguePro('odds',      oddsRouter);
mountLeaguePro('export',    exportRouter);
mountLeague('venues',       venuesRouter);
mountLeague('users',        usersRouter);
mountLeague('achievements', achievementsRouter);
mountLeague('trash-talk',   trashTalkRouter);
mountLeague('tournaments',  tournamentsRouterL); // POST (create) gated inside the router

// Comments are mounted at /api/l/:slug/games/:id/comments
app.use('/api/l/:slug', leagueMiddleware, requireLeagueAccessForMethod, commentsRouter);

// Join is public (no requireLeagueAccess) — the join code itself gates access
app.use('/api/l/:slug/join', leagueMiddleware, joinRouterL);

// Tournament match updates under league scope
app.patch(
  '/api/l/:slug/tournament-matches/:id',
  leagueMiddleware,
  requireLeagueAccess('write'),
  require('./middleware/auth').requireAdmin,
  (req, res, next) => {
    req.url = '/matches/' + req.params.id;
    tournamentsRouterL(req, res, next);
  }
);

// OG image routes — must come BEFORE the static-client catch-all so /og/*.png
// is served by Express rather than handed off to index.html.
app.use('/og', require('./og/routes'));

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  // Hashed assets (JS/CSS) — safe to cache long-term since content hash changes on every build
  app.use(express.static(clientDist, { maxAge: '1y', index: false }));
  // Crawler-friendly OG meta tag injection for matching routes (/games/:id,
  // /players/:id, etc.). Non-matching routes pass through to the catch-all
  // below, which serves the raw index.html.
  const { ogMetaMiddleware } = require('./middleware/og-meta');
  app.use(ogMetaMiddleware(clientDist));
  // index.html — never cache so browsers always get the latest asset hashes after a deploy
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Sentry error handler — must come BEFORE the custom error handler so Sentry
// captures the full error object before we send a JSON response.
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.setupExpressErrorHandler(app);
}

// Error handler
const { errorHandler } = require('./middleware/errors');
app.use(errorHandler);

// ── Async startup: migrations (blocking) → listen → background work ──────────
//
// IMPORTANT: app.listen() is called immediately after migrations so Railway's
// healthcheck (GET /api/standings, 30s timeout) can succeed before the slow
// Elo recalculation and weather backfill finish. Those run in the background
// after the server is already accepting requests.
(async () => {
  try {
    // Migrations MUST complete before we serve any requests — schema must exist.
    await runMigrations();

    // Start listening as soon as the schema is ready so the healthcheck passes.
    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`[Server] Cornhole249 running on http://localhost:${PORT}`);
      });
    }
  } catch (e) {
    console.error('[Startup] Migration failed — cannot start server:', e);
    process.exit(1);
  }

  // Background work — runs after listen(); errors are logged but never crash the process.
  (async () => {
    try {
      const { recalculateAllElos } = require('./lib/elo');
      const db = getDb();

      // Recalculate all Elo ratings on startup to apply the latest formula
      const { rows: games } = await sql`SELECT * FROM games ORDER BY played_at ASC`.execute(db);
      const { rows: participants } = await sql`SELECT * FROM game_participants`.execute(db);
      if (games.length > 0) {
        const newElos = recalculateAllElos(games, participants);
        await db.transaction().execute(async (trx) => {
          for (const [userId, elo] of Object.entries(newElos)) {
            await trx.updateTable('users').set({ elo_rating: elo }).where('id', '=', parseInt(userId)).execute();
          }
        });
        console.log(`[Elo] Recalculated ratings for ${Object.keys(newElos).length} players`);
      }

      // One-time venue/weather fixes and weather backfill
      // Each fix is guarded by a kv_store key so it only runs once per deploy.
      try {
        const { fetchWeatherForGame } = require('./routes/weather');

        // One-time fix: game timestamps were stored with UTC offset instead of local time.
        // The datetime-local input was initialised with toISOString() (UTC), so games entered
        // in Eastern time (EDT = UTC-4) were stored 4 hours ahead of the actual local time.
        // Correct by subtracting 4 hours for all 249 Park games in 2026.
        {
          const alreadyFixed = await db
            .selectFrom('kv_store')
            .select(['value'])
            .where('key', '=', 'fix_249park_tz_2026')
            .executeTakeFirst();
          if (!alreadyFixed) {
            const venue249Fix = await db
              .selectFrom('venues')
              .select(['id'])
              .where('name', '=', '249 Park')
              .executeTakeFirst();
            if (venue249Fix) {
              const { rows: affected } = await sql`
                SELECT id, played_at FROM games WHERE venue_id = ${venue249Fix.id} AND season = 2026
              `.execute(db);
              let fixedCount = 0;
              for (const game of affected) {
                const d = new Date(game.played_at);
                if (isNaN(d.getTime())) continue;
                const corrected = new Date(d.getTime() - 4 * 60 * 60 * 1000);
                await db.updateTable('games')
                  .set({ played_at: corrected.toISOString() })
                  .where('id', '=', game.id)
                  .execute();
                fixedCount++;
              }
              console.log(`[DateFix] Corrected ${fixedCount} 249 Park 2026 game timestamps (EDT -4h)`);
            }
            await db.insertInto('kv_store')
              .values({ key: 'fix_249park_tz_2026', value: '1' })
              .onConflict((oc) => oc.column('key').doNothing())
              .execute();
          }
        }

        // Set coordinates for 249 Park — always ensure correct coords
        const venue249 = await db
          .selectFrom('venues')
          .selectAll()
          .where('name', '=', '249 Park')
          .executeTakeFirst();
        if (venue249) {
          const correctLat = 43.26553781771368;
          const correctLng = -79.86855315885511;
          const coordsWrong = !venue249.lat || Math.abs(venue249.lat - correctLat) > 0.001;
          if (coordsWrong) {
            await db.updateTable('venues')
              .set({ lat: correctLat, lng: correctLng })
              .where('id', '=', venue249.id)
              .execute();
            console.log(`[Venue] Set/corrected coordinates for 249 Park (id=${venue249.id})`);
          }
        }

        // One-shot: clear all weather_json after switching from daily aggregates
        // to hourly weather lookup at game time.
        {
          const alreadyDone = await db
            .selectFrom('kv_store')
            .select(['value'])
            .where('key', '=', 'weather_hourly_v3')
            .executeTakeFirst();
          if (!alreadyDone) {
            const { rows: cleared } = await sql`
              UPDATE games SET weather_json = NULL WHERE weather_json IS NOT NULL RETURNING id
            `.execute(db);
            console.log(`[Weather] Cleared ${cleared.length} weather entries — refetching with hourly data`);
            await db.insertInto('kv_store')
              .values({ key: 'weather_hourly_v3', value: '1' })
              .onConflict((oc) => oc.column('key').doNothing())
              .execute();
          }
        }

        // One-shot: correct game #25's played_at, which was shifted +4 hours by
        // the edit-form datetime-local bug when a venue was added after the fact.
        {
          const alreadyDone = await db
            .selectFrom('kv_store')
            .select(['value'])
            .where('key', '=', 'fix_game25_tz_shift')
            .executeTakeFirst();
          if (!alreadyDone) {
            const g25 = await db
              .selectFrom('games')
              .select(['id', 'played_at'])
              .where('id', '=', 25)
              .executeTakeFirst();
            if (g25 && g25.played_at) {
              const d = new Date(g25.played_at);
              if (!isNaN(d.getTime())) {
                const corrected = new Date(d.getTime() - 4 * 60 * 60 * 1000).toISOString();
                await db.updateTable('games')
                  .set({ played_at: corrected, weather_json: null })
                  .where('id', '=', 25)
                  .execute();
                console.log(`[Fix] Game #25 played_at ${g25.played_at} → ${corrected}; weather cleared for refetch`);
              }
            }
            await db.insertInto('kv_store')
              .values({ key: 'fix_game25_tz_shift', value: '1' })
              .onConflict((oc) => oc.column('key').doNothing())
              .execute();
          }
        }

        // Backfill weather for games at venues with coordinates but no weather_json
        const { rows: gamesNeedingWeather } = await sql`
          SELECT g.id, g.played_at, v.lat, v.lng
          FROM games g
          JOIN venues v ON g.venue_id = v.id
          WHERE g.weather_json IS NULL AND v.lat IS NOT NULL AND v.lat != 0
        `.execute(db);

        for (const game of gamesNeedingWeather) {
          const weather = await fetchWeatherForGame(game.lat, game.lng, game.played_at);
          if (weather) {
            await db.updateTable('games')
              .set({ weather_json: JSON.stringify(weather) })
              .where('id', '=', game.id)
              .execute();
            console.log(`[Weather] Backfilled game #${game.id}: ${weather.condition} ${weather.temp_c}°C`);
          }
        }
      } catch (e) {
        console.warn('[Startup] Venue/weather backfill failed:', e.message);
      }

      // Auto-seed if empty (no-op in Postgres mode — see seed.js)
      const { seedIfEmpty } = require('./seed');
      seedIfEmpty();

      // ── Daily Postgres backup (production only) ──────────────────────────────
      // Dumps all tables to a gzipped JSON file on the Railway volume.
      // Keeps the 7 most recent backups; older ones are rotated out.
      if (process.env.NODE_ENV === 'production') {
        const cron = require('node-cron');
        const { runBackup, BACKUP_DIR } = require('./lib/backup');
        const { getDb, sql } = require('./db');
        const { sendWeekendPassWarningEmail, sendWeekendPassExpiredEmail, sendGraceWarningEmail, sendWeekendPassAnniversaryEmail, sendProAnnualRecapEmail } = require('./lib/email');

        // 03:00 UTC every day
        cron.schedule('0 3 * * *', async () => {
          runBackup().catch((e) => console.error('[Backup] Cron error:', e.message));

          const db = getDb();
          const baseUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

          // ── Weekend pass: day-before warning ──────────────────────────────────
          try {
            const { rows: expiringSoon } = await sql`
              SELECT l.id, l.name, l.slug, l.expires_at,
                     u.email, u.display_name
              FROM leagues l
              JOIN league_memberships lm ON lm.league_id = l.id AND lm.role = 'owner'
              JOIN users u ON u.id = lm.user_id
              WHERE l.plan = 'weekend_pass'
                AND l.expires_at > NOW()
                AND l.expires_at <= NOW() + INTERVAL '48 hours'
                AND l.pass_warning_sent_at IS NULL
                AND u.email IS NOT NULL
            `.execute(db);

            for (const row of expiringSoon) {
              try {
                const leagueUrl = `${baseUrl}${row.slug === 'cornhole249' ? '' : `/l/${row.slug}`}`;
                await sendWeekendPassWarningEmail({
                  to: row.email,
                  userName: row.display_name,
                  leagueName: row.name,
                  leagueUrl,
                  expiresAt: row.expires_at,
                });
                await sql`UPDATE leagues SET pass_warning_sent_at = NOW() WHERE id = ${row.id}`.execute(db);
                console.log(`[Cron] Weekend pass warning sent → league ${row.id}`);
              } catch (err) {
                console.error(`[Cron] Warning email failed for league ${row.id}:`, err.message);
              }
            }
          } catch (e) {
            console.error('[Cron] Weekend pass warning query failed:', e.message);
          }

          // ── Weekend pass: expiry — flip to free + notify ───────────────────
          try {
            const { rows: expired } = await sql`
              SELECT l.id, l.name, l.slug,
                     u.email, u.display_name
              FROM leagues l
              JOIN league_memberships lm ON lm.league_id = l.id AND lm.role = 'owner'
              JOIN users u ON u.id = lm.user_id
              WHERE l.plan = 'weekend_pass'
                AND l.expires_at < NOW()
                AND u.email IS NOT NULL
            `.execute(db);

            for (const row of expired) {
              try {
                await sql`
                  UPDATE leagues
                  SET plan = 'free', expires_at = NULL, pass_warning_sent_at = NULL
                  WHERE id = ${row.id}
                `.execute(db);
                const leagueUrl = `${baseUrl}${row.slug === 'cornhole249' ? '' : `/l/${row.slug}`}`;
                await sendWeekendPassExpiredEmail({
                  to: row.email,
                  userName: row.display_name,
                  leagueName: row.name,
                  leagueUrl,
                });
                console.log(`[Cron] Weekend pass expired → league ${row.id} → free`);
              } catch (err) {
                console.error(`[Cron] Expiry handling failed for league ${row.id}:`, err.message);
              }
            }
          } catch (e) {
            console.error('[Cron] Weekend pass expiry query failed:', e.message);
          }

          // ── Downgrade grace: freeze excess members after grace expires ─────────
          try {
            const { rows: graceExpired } = await sql`
              SELECT l.id, l.slug, l.name
              FROM leagues l
              WHERE l.grace_period_ends_at IS NOT NULL
                AND l.grace_period_ends_at < NOW()
                AND l.plan = 'free'
            `.execute(db);

            for (const league of graceExpired) {
              try {
                // Oldest 8 by joined_at are kept; NULLS LAST so unknown join dates freeze first
                const { rows: activeMembers } = await sql`
                  SELECT user_id, joined_at
                  FROM league_memberships
                  WHERE league_id = ${league.id} AND frozen_at IS NULL
                  ORDER BY joined_at ASC NULLS LAST
                `.execute(db);

                const toFreeze = activeMembers.slice(8);
                for (const member of toFreeze) {
                  await sql`
                    UPDATE league_memberships
                    SET frozen_at = NOW()
                    WHERE league_id = ${league.id} AND user_id = ${member.user_id}
                  `.execute(db);
                  console.log(`[Cron] Froze user_id=${member.user_id} in league ${league.id} (joined_at=${member.joined_at})`);
                }

                // Clear grace period marker
                await sql`
                  UPDATE leagues SET grace_period_ends_at = NULL WHERE id = ${league.id}
                `.execute(db);

                console.log(`[Cron] Grace period resolved for league ${league.id}: ${Math.min(activeMembers.length, 8)} active, ${toFreeze.length} frozen`);
              } catch (err) {
                console.error(`[Cron] Grace freeze failed for league ${league.id}:`, err.message);
              }
            }
          } catch (e) {
            console.error('[Cron] Grace freeze query failed:', e.message);
          }

          // ── Downgrade grace: day-before warning (if unresolved) ───────────────
          try {
            const { rows: warningSoon } = await sql`
              SELECT l.id, l.slug, l.name, l.grace_period_ends_at,
                     u.email, u.display_name
              FROM leagues l
              JOIN league_memberships lm ON lm.league_id = l.id AND lm.role = 'owner'
              JOIN users u ON u.id = lm.user_id
              WHERE l.grace_period_ends_at IS NOT NULL
                AND l.grace_period_ends_at > NOW()
                AND l.grace_period_ends_at <= NOW() + INTERVAL '24 hours'
                AND u.email IS NOT NULL
                AND (
                  SELECT COUNT(*) FROM league_memberships
                  WHERE league_id = l.id AND frozen_at IS NULL
                ) > 8
            `.execute(db);

            for (const row of warningSoon) {
              try {
                const leagueUrl = `${baseUrl}/l/${row.slug}`;
                await sendGraceWarningEmail({
                  to: row.email,
                  userName: row.display_name,
                  leagueName: row.name,
                  leagueUrl,
                  graceEndsAt: row.grace_period_ends_at,
                });
                console.log(`[Cron] Grace warning email sent → league ${row.id}`);
              } catch (err) {
                console.error(`[Cron] Grace warning email failed for league ${row.id}:`, err.message);
              }
            }
          } catch (e) {
            console.error('[Cron] Grace warning query failed:', e.message);
          }

          // ── Weekend pass: 11-month anniversary re-engagement ──────────────────
          // Fires ~11 months after purchase. "Run it back?" CTA to buy another pass.
          // Skipped if the league has since upgraded to Pro (they don't need it).
          try {
            const { rows: anniversary } = await sql`
              SELECT l.id, l.name, l.slug, l.weekend_pass_purchased_at,
                     u.email, u.display_name
              FROM leagues l
              JOIN league_memberships lm ON lm.league_id = l.id AND lm.role = 'owner'
              JOIN users u ON u.id = lm.user_id
              WHERE l.weekend_pass_purchased_at IS NOT NULL
                AND l.weekend_pass_purchased_at <= NOW() - INTERVAL '330 days'
                AND l.weekend_pass_purchased_at >= NOW() - INTERVAL '340 days'
                AND l.pass_anniversary_sent_at IS NULL
                AND l.plan != 'pro'
                AND u.email IS NOT NULL
            `.execute(db);

            for (const row of anniversary) {
              try {
                // Find the most recent tournament name to personalise the email
                const { rows: [tournament] } = await sql`
                  SELECT name FROM tournaments
                  WHERE league_id = ${row.id}
                  ORDER BY created_at DESC LIMIT 1
                `.execute(db);

                const leagueUrl = `${baseUrl}${row.slug === 'cornhole249' ? '' : `/l/${row.slug}`}`;
                await sendWeekendPassAnniversaryEmail({
                  to: row.email,
                  userName: row.display_name,
                  leagueName: row.name,
                  leagueUrl,
                  tournamentName: tournament?.name || null,
                });
                await sql`
                  UPDATE leagues SET pass_anniversary_sent_at = NOW() WHERE id = ${row.id}
                `.execute(db);
                console.log(`[Cron] Weekend pass anniversary email sent → league ${row.id}`);
              } catch (err) {
                console.error(`[Cron] Anniversary email failed for league ${row.id}:`, err.message);
              }
            }
          } catch (e) {
            console.error('[Cron] Weekend pass anniversary query failed:', e.message);
          }

          // ── Pro annual recap ─────────────────────────────────────────────────
          // Fires once per year on the subscription start anniversary (± 1 day).
          // pro_recap_sent_year prevents duplicate sends within the same year.
          try {
            const thisYear = new Date().getFullYear();
            const { rows: recapLeagues } = await sql`
              SELECT l.id, l.name, l.slug, l.stripe_subscription_started_at,
                     u.email, u.display_name
              FROM leagues l
              JOIN league_memberships lm ON lm.league_id = l.id AND lm.role = 'owner'
              JOIN users u ON u.id = lm.user_id
              WHERE l.plan = 'pro'
                AND l.stripe_subscription_started_at IS NOT NULL
                AND (l.pro_recap_sent_year IS NULL OR l.pro_recap_sent_year < ${thisYear})
                AND TO_CHAR(l.stripe_subscription_started_at, 'MM-DD')
                    BETWEEN TO_CHAR(NOW() - INTERVAL '1 day', 'MM-DD')
                         AND TO_CHAR(NOW() + INTERVAL '1 day', 'MM-DD')
                AND u.email IS NOT NULL
            `.execute(db);

            for (const row of recapLeagues) {
              try {
                // Gather simple year-in-review stats
                const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
                const { rows: [gameCount] } = await sql`
                  SELECT COUNT(*) AS total FROM games
                  WHERE league_id = ${row.id} AND played_at >= ${oneYearAgo}
                `.execute(db);

                const { rows: playerStats } = await sql`
                  SELECT u2.display_name AS name,
                         SUM(CASE WHEN gp.is_winner THEN 1 ELSE 0 END) AS wins,
                         SUM(CASE WHEN NOT gp.is_winner THEN 1 ELSE 0 END) AS losses
                  FROM game_participants gp
                  JOIN games g ON g.id = gp.game_id
                  JOIN users u2 ON u2.id = gp.user_id
                  WHERE g.league_id = ${row.id} AND g.played_at >= ${oneYearAgo}
                  GROUP BY gp.user_id, u2.display_name
                  HAVING COUNT(*) >= 3
                  ORDER BY wins DESC LIMIT 1
                `.execute(db);

                const { rows: activePlayers } = await sql`
                  SELECT COUNT(DISTINCT gp.user_id) AS cnt
                  FROM game_participants gp
                  JOIN games g ON g.id = gp.game_id
                  WHERE g.league_id = ${row.id} AND g.played_at >= ${oneYearAgo}
                `.execute(db);

                const leagueUrl = `${baseUrl}${row.slug === 'cornhole249' ? '' : `/l/${row.slug}`}`;
                await sendProAnnualRecapEmail({
                  to: row.email,
                  userName: row.display_name,
                  leagueName: row.name,
                  leagueUrl,
                  stats: {
                    totalGames: Number(gameCount?.total || 0),
                    totalPlayers: Number(activePlayers[0]?.cnt || 0),
                    topPlayer: playerStats[0] ? {
                      name: playerStats[0].name,
                      wins: Number(playerStats[0].wins),
                      losses: Number(playerStats[0].losses),
                    } : null,
                  },
                });
                await sql`
                  UPDATE leagues SET pro_recap_sent_year = ${thisYear} WHERE id = ${row.id}
                `.execute(db);
                console.log(`[Cron] Pro annual recap sent → league ${row.id}`);
              } catch (err) {
                console.error(`[Cron] Pro recap failed for league ${row.id}:`, err.message);
              }
            }
          } catch (e) {
            console.error('[Cron] Pro annual recap query failed:', e.message);
          }
        });

        console.log(`[Backup] Daily backup scheduled at 03:00 UTC → ${BACKUP_DIR}`);
        console.log('[Cron] Weekend pass warning + expiry + grace period + anniversary scheduled at 03:00 UTC');
      }
    } catch (e) {
      // Background startup tasks failed — log but do NOT crash the server.
      console.error('[Startup] Background init error (non-fatal):', e);
    }
  })().catch((e) => console.error('[Startup] Background IIFE rejected (non-fatal):', e));
})();

module.exports = app;
