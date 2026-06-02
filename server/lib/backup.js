/**
 * Daily Postgres backup — dumps all tables to a gzipped JSON file on the
 * Railway persistent volume at /data/backups/ (or BACKUP_DIR env var).
 *
 * Uses the pg Pool directly (not Kysely) so it can open/close its own
 * connection without interfering with the app pool.
 *
 * Schedule: registered in server/index.js via node-cron (production only).
 * Rotation: keeps the most recent MAX_BACKUPS files, deletes older ones.
 *
 * Restore:
 *   const raw = gunzipSync(fs.readFileSync('cornhole249_2026-06-01T03-00.json.gz'));
 *   const { tables } = JSON.parse(raw);
 *   // then INSERT INTO each table from tables[tableName]
 */

const { Pool } = require('pg');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

const BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups';
const MAX_BACKUPS = 7;

// Tables in dependency order (parents before children) so a restore can INSERT in order.
const TABLES = [
  'leagues',
  'users',
  'league_memberships',
  'venues',
  'join_codes',
  'tournaments',
  'tournament_matches',
  'games',
  'game_participants',
  'comments',
  'trash_talk',
  'achievements',
];

async function runBackup() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set — cannot back up');
  }

  const start = Date.now();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const dump = {
      version: 1,
      timestamp: new Date().toISOString(),
      tables: {},
    };

    for (const table of TABLES) {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
        dump.tables[table] = rows;
      } catch (e) {
        // Table may not exist in a migration-in-progress state — skip and note it.
        console.warn(`[Backup] Skipping table "${table}": ${e.message}`);
        dump.tables[table] = [];
      }
    }

    // Ensure backup directory exists
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // Filename: cornhole249_2026-06-01T03-00-00.json.gz
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
    const filename = `cornhole249_${ts}.json.gz`;
    const filepath = path.join(BACKUP_DIR, filename);

    const compressed = await gzip(JSON.stringify(dump));
    fs.writeFileSync(filepath, compressed);

    // Rotate: keep only MAX_BACKUPS most-recent files
    const existing = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('cornhole249_') && f.endsWith('.json.gz'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of existing.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, old.name));
      console.log(`[Backup] Rotated out: ${old.name}`);
    }

    const totalRows = Object.values(dump.tables).reduce((n, rows) => n + rows.length, 0);
    const sizeKb = Math.round(compressed.length / 1024);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[Backup] ✓ ${filename} — ${totalRows} rows, ${sizeKb} KB, ${elapsed}s`);

    return { ok: true, filename, rows: totalRows, sizeKb };
  } finally {
    await pool.end();
  }
}

module.exports = { runBackup, BACKUP_DIR };
