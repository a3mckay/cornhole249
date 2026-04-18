require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { runMigrations, getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Run migrations first
runMigrations();

// Recalculate all Elo ratings on startup to apply latest formula
{
  const { recalculateAllElos } = require('./lib/elo');
  const db = getDb();
  const games = db.prepare(`SELECT * FROM games ORDER BY played_at ASC`).all();
  const participants = db.prepare(`SELECT * FROM game_participants`).all();
  if (games.length > 0) {
    const newElos = recalculateAllElos(games, participants);
    const stmt = db.prepare(`UPDATE users SET elo_rating = ? WHERE id = ?`);
    const updateAll = db.transaction((elos) => {
      for (const [userId, elo] of Object.entries(elos)) {
        stmt.run(elo, parseInt(userId));
      }
    });
    updateAll(newElos);
    console.log(`[Elo] Recalculated ratings for ${Object.keys(newElos).length} players`);
  }
}

// Backfill venue coordinates and weather for games missing it
(async () => {
  try {
    const { fetchWeatherForGame } = require('./routes/weather');
    const db = getDb();

    // Set coordinates for 249 Park — always ensure correct coords
    const venue249 = db.prepare(`SELECT * FROM venues WHERE name = '249 Park'`).get();
    if (venue249) {
      const correctLat = 43.26553781771368;
      const correctLng = -79.86855315885511;
      const coordsWrong = !venue249.lat || Math.abs(venue249.lat - correctLat) > 0.001;
      if (coordsWrong) {
        db.prepare(`UPDATE venues SET lat = ?, lng = ? WHERE id = ?`)
          .run(correctLat, correctLng, venue249.id);
        console.log(`[Venue] Set/corrected coordinates for 249 Park (id=${venue249.id})`);
      }
      // Force-clear weather for all 249 Park games so they re-fetch with correct coordinates
      // (prior data may have been fetched with lat=0,lng=0 which points to Gulf of Guinea)
      const cleared = db.prepare(`
        UPDATE games SET weather_json = NULL
        WHERE venue_id = ? AND weather_json IS NOT NULL
      `).run(venue249.id);
      if (cleared.changes > 0) {
        console.log(`[Weather] Cleared stale weather data for ${cleared.changes} 249 Park games`);
      }
    }

    // Backfill weather for games at venues with coordinates but no weather_json
    const gamesNeedingWeather = db.prepare(`
      SELECT g.id, g.played_at, v.lat, v.lng
      FROM games g
      JOIN venues v ON g.venue_id = v.id
      WHERE g.weather_json IS NULL AND v.lat IS NOT NULL AND v.lat != 0
    `).all();

    for (const game of gamesNeedingWeather) {
      const weather = await fetchWeatherForGame(game.lat, game.lng, game.played_at);
      if (weather) {
        db.prepare(`UPDATE games SET weather_json = ? WHERE id = ?`)
          .run(JSON.stringify(weather), game.id);
        console.log(`[Weather] Backfilled game #${game.id}: ${weather.condition} ${weather.temp_c}°C`);
      }
    }
  } catch (e) {
    console.warn('[Startup] Venue/weather backfill failed:', e.message);
  }
})();

// Session store
const SqliteStore = require('better-sqlite3-session-store')(session);
const sessionDb = getDb();

app.set('trust proxy', 1);
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

app.use(session({
  store: new SqliteStore({ client: sessionDb }),
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

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/games', require('./routes/games'));
app.use('/api', require('./routes/comments'));
app.use('/api/standings', require('./routes/standings'));
app.use('/api/stats', require('./routes/stats'));
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

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
const { errorHandler } = require('./middleware/errors');
app.use(errorHandler);

// Auto-seed if empty
const { seedIfEmpty } = require('./seed');
seedIfEmpty();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Server] Cornhole249 running on http://localhost:${PORT}`);
  });
}

module.exports = app;
