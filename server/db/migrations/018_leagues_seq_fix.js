/**
 * Migration 018: Make the leagues id sequence collision-safe.
 *
 * Migration 002 pinned leagues_id_seq to a literal 1 (setval(..., 1, TRUE)).
 * If any leagues were ever inserted with explicit IDs (data import / seed),
 * the sequence can lag behind MAX(id), causing a duplicate-PK error on the
 * next auto-generated insert. Re-set the sequence to GREATEST(1, MAX(id)) so
 * the next value is always past every existing row. Idempotent and harmless
 * to re-run.
 *
 * (Re-landed from earlier league-model WIP after reconciling with origin/main;
 *  the unsafe literal setval in 002 stays as-is since 002 is already applied.)
 */

const { sql } = require('kysely');

async function up(db) {
  await sql`SELECT setval('leagues_id_seq', GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM leagues)), TRUE)`.execute(db);
}

module.exports = { up };
