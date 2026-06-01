/**
 * Postgres DB singleton via Kysely.
 *
 * Exports:
 *   getDb()         — synchronous singleton getter; returns Kysely instance
 *   runMigrations() — async; runs all pending migrations
 *   sql             — re-exported Kysely sql template tag for raw queries
 *
 * Usage in routes:
 *   const { getDb, sql } = require('../db');
 *   const db = getDb();
 *   const { rows } = await sql`SELECT * FROM users`.execute(db);
 *   const row = await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
 */

const { Kysely, PostgresDialect, sql } = require('kysely');
const { Pool } = require('pg');

let db;

function getDb() {
  if (!db) {
    const isProduction = process.env.NODE_ENV === 'production';
    db = new Kysely({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: isProduction ? { rejectUnauthorized: false } : false,
        }),
      }),
    });
  }
  return db;
}

async function runMigrations() {
  const { run } = require('./migrate');
  await run(getDb());
}

module.exports = { getDb, runMigrations, sql };
