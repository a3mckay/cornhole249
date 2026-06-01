/**
 * One-time data migration: SQLite → Postgres.
 *
 * Run once after migrations are applied:
 *   SQLITE_PATH=./cornhole249.db node server/db/migrate-data.js
 *
 * The script reads every table from SQLite and bulk-inserts into Postgres,
 * respecting FK ordering. After each table it resets the Postgres sequence
 * so that auto-generated IDs don't collide with migrated data.
 *
 * Safe to re-run: uses ON CONFLICT DO NOTHING for all inserts.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const BetterSqlite3 = require('better-sqlite3');
const { Pool } = require('pg');
const { randomBytes } = require('crypto');

const SQLITE_PATH = process.env.SQLITE_PATH || './cornhole249.db';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sqlite = new BetterSqlite3(SQLITE_PATH, { readonly: true });
const pg = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const client = await pg.connect();
  try {
    // Disable FK checks during bulk insert
    await client.query('SET session_replication_role = replica');

    // ── users ───────────────────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM users').all();
      console.log(`[migrate-data] users: ${rows.length} rows`);
      for (const r of rows) {
        // Generate ref_token if missing
        const refToken = r.ref_token || randomBytes(4).toString('hex');
        await client.query(
          `INSERT INTO users (id, display_name, nickname, avatar_url, is_admin, elo_rating, created_at, handedness, pin, referred_by_user_id, ref_token)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO NOTHING`,
          [r.id, r.display_name, r.nickname || null, r.avatar_url || null, r.is_admin, r.elo_rating,
           r.created_at || new Date().toISOString(),
           r.handedness || 'right', r.pin || null, r.referred_by_user_id || null, refToken]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('users_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── venues ──────────────────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM venues').all();
      console.log(`[migrate-data] venues: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO venues (id, name, lat, lng, created_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.name, r.lat || null, r.lng || null, r.created_at || new Date().toISOString()]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('venues_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── games (tournament_match_id = NULL first; updated after tournament_matches) ──
    {
      const rows = sqlite.prepare('SELECT * FROM games').all();
      console.log(`[migrate-data] games: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO games (id, game_type, played_at, season, venue_id, weather_json, submitted_by_user_id, created_at, league_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.game_type, r.played_at, r.season, r.venue_id || null,
           r.weather_json || null, r.submitted_by_user_id || null,
           r.created_at || new Date().toISOString()]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('games_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── game_participants ───────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM game_participants').all();
      console.log(`[migrate-data] game_participants: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO game_participants (id, game_id, user_id, team, score, is_winner)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.game_id, r.user_id, r.team, r.score, r.is_winner]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('game_participants_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── comments ────────────────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM comments').all();
      console.log(`[migrate-data] comments: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO comments (id, game_id, user_id, body, created_at, league_id)
           VALUES ($1,$2,$3,$4,$5,1) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.game_id || null, r.user_id, r.body, r.created_at || new Date().toISOString()]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('comments_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── trash_talk ──────────────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM trash_talk').all();
      console.log(`[migrate-data] trash_talk: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO trash_talk (id, user_id, body, created_at, league_id)
           VALUES ($1,$2,$3,$4,1) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.user_id, r.body, r.created_at || new Date().toISOString()]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('trash_talk_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── achievements ────────────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM achievements').all();
      console.log(`[migrate-data] achievements: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO achievements (id, user_id, achievement_key, earned_at, league_id)
           VALUES ($1,$2,$3,$4,1) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.user_id, r.achievement_key, r.earned_at || new Date().toISOString()]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('achievements_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── tournaments ─────────────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM tournaments').all();
      console.log(`[migrate-data] tournaments: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO tournaments (id, name, format, game_type, status, season, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.name, r.format, r.game_type, r.status, r.season, r.created_at || new Date().toISOString()]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('tournaments_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── tournament_matches (next_match_id = NULL first; updated in second pass) ──
    {
      const rows = sqlite.prepare('SELECT * FROM tournament_matches').all();
      console.log(`[migrate-data] tournament_matches: ${rows.length} rows`);
      // First pass: insert without next_match_id and game_id (circular FKs)
      for (const r of rows) {
        await client.query(
          `INSERT INTO tournament_matches (id, tournament_id, round, match_number, team1_player_ids, team2_player_ids, winner_team, score_team1, score_team2, played_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
          [r.id, r.tournament_id, r.round, r.match_number,
           r.team1_player_ids || '[]', r.team2_player_ids || '[]',
           r.winner_team || null, r.score_team1 || null, r.score_team2 || null,
           r.played_at || null]
        );
      }
      // Second pass: update next_match_id and game_id
      for (const r of rows) {
        if (r.next_match_id || r.game_id) {
          await client.query(
            `UPDATE tournament_matches SET next_match_id = $1, game_id = $2 WHERE id = $3`,
            [r.next_match_id || null, r.game_id || null, r.id]
          );
        }
      }
      // Also update games.tournament_match_id
      const gamesWithTmId = sqlite.prepare(
        'SELECT id, tournament_match_id FROM games WHERE tournament_match_id IS NOT NULL'
      ).all();
      for (const g of gamesWithTmId) {
        await client.query(
          `UPDATE games SET tournament_match_id = $1 WHERE id = $2`,
          [g.tournament_match_id, g.id]
        );
      }
      if (rows.length > 0) {
        const maxId = Math.max(...rows.map(r => r.id));
        await client.query(`SELECT setval('tournament_matches_id_seq', $1, TRUE)`, [maxId]);
      }
    }

    // ── join_codes ──────────────────────────────────────────────────────────
    {
      const rows = sqlite.prepare('SELECT * FROM join_codes').all();
      console.log(`[migrate-data] join_codes: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO join_codes (code, created_by, used_by, used_at, created_at, league_id)
           VALUES ($1,$2,$3,$4,$5,1) ON CONFLICT (code) DO NOTHING`,
          [r.code, r.created_by || null, r.used_by || null,
           r.used_at || null, r.created_at || new Date().toISOString()]
        );
      }
    }

    // ── kv_store ────────────────────────────────────────────────────────────
    {
      let rows = [];
      try { rows = sqlite.prepare('SELECT * FROM kv_store').all(); } catch (e) { /* table may not exist */ }
      console.log(`[migrate-data] kv_store: ${rows.length} rows`);
      for (const r of rows) {
        await client.query(
          `INSERT INTO kv_store (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
          [r.key, r.value]
        );
      }
    }

    // ── league_memberships — one row per user ───────────────────────────────
    {
      const { rows: pgUsers } = await client.query('SELECT id FROM users');
      console.log(`[migrate-data] league_memberships: seeding ${pgUsers.length} memberships`);
      for (const u of pgUsers) {
        await client.query(
          `INSERT INTO league_memberships (league_id, user_id, role)
           VALUES (1, $1, 'player') ON CONFLICT (league_id, user_id) DO NOTHING`,
          [u.id]
        );
      }
    }

    // Re-enable FK checks
    await client.query('SET session_replication_role = DEFAULT');
    console.log('[migrate-data] ✅ Migration complete');
  } catch (e) {
    console.error('[migrate-data] Error:', e.message);
    await client.query('SET session_replication_role = DEFAULT');
    throw e;
  } finally {
    client.release();
    await pg.end();
    sqlite.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
