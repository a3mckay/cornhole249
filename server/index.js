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

// Session store
const SqliteStore = require('better-sqlite3-session-store')(session);
const sessionDb = getDb();

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
