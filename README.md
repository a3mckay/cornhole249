# Cornhole249

> Hamilton's Most Competitive Backyard Cornhole League

Cornhole249 is a full-stack web app for tracking 1v1 and 2v2 cornhole games among a group of friends. It features standings, player stats, tournaments, rivalries, a matchup odds calculator, achievements, weather tracking, and a trash talk feed — all wrapped in a sunny backyard aesthetic.

---

## Prerequisites

- Node.js 18+
- npm 9+

---

## Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd cornhole249

# 2. Install all dependencies (root + client)
npm install
cd client && npm install && cd ..

# 3. Copy environment config
cp .env.example .env
# (Edit .env if needed — defaults work out of the box)

# 4. Start the dev servers
npm run dev
```

The app runs at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001

---

## Seed Data

The database is seeded automatically on first start if empty. To re-seed manually:

```bash
npm run seed
```

This creates 10 players, 100+ games across two seasons, venues, comments, and achievements.

---

## Run Tests

```bash
npm test          # both server + client
npm run test:server   # Jest + Supertest (backend)
npm run test:client   # Vitest + React Testing Library (frontend)
```

---

## Build for Production

```bash
npm run build     # builds client/dist
```

Serve the Express server (it will also serve the built client from `client/dist`).

---

## Project Structure

```
cornhole249/
├── server/
│   ├── index.js           # Express app entry
│   ├── db.js              # SQLite setup + migrations
│   ├── seed.js            # Seed script
│   ├── routes/            # All API route handlers
│   ├── middleware/         # Auth middleware
│   └── lib/               # Elo, achievements, odds engines
├── client/
│   ├── src/
│   │   ├── pages/         # Route-level page components
│   │   ├── components/    # Shared UI components
│   │   ├── hooks/         # Custom React hooks
│   │   └── api.js         # API client
│   └── vite.config.js
└── package.json
```

---

## Hamilton Rules

Cornhole249 uses **Hamilton Rules**, not ACA rules:

- Players stand **behind** the board (not beside it)
- Bag **on the board**: 1 point
- Bag **overhanging the hole** (even slightly): 2 points
- Bag **in the hole**: 3 points
- Cancellation scoring applies (net points per round)

See the in-app [Rules page](/rules) for the full breakdown and a visual diagram.

---

## Seasons

Each season runs January 1 – December 31. Standings and stats can be filtered by season using the dropdown on the Standings and Stats pages. Historical seasons remain fully browsable.

---

## Authentication (PoC / Fake Auth)

This build uses **one-click fake authentication** — no credentials or Google OAuth required.

- A **"Sign in as..."** dropdown in the navbar lists all seeded players
- Selecting a player instantly sets them as the session user
- **Andrew** (`is_admin = true`) unlocks all admin features: edit/delete games, manage tournaments, admin panel
- A "Sign out" button clears the session

**Production upgrade path**: Replace the fake login dropdown with real Google OAuth (`passport-google-oauth20`), match on `google_id` + `email`, restore `.env` credential flow. All other app logic is unchanged.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite, React Router v6, Tailwind CSS, Recharts |
| Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` |
| Auth | Fake one-click (PoC); Google OAuth ready for production |
| QR Code | `qrcode.react` |
| Weather | Open Meteo API (free, no key) |
| Tests | Jest + Supertest (server), Vitest + RTL (client) |
