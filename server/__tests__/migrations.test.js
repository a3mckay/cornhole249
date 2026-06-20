// Guardrail: every migration FILE on disk must be registered in migrate.js's
// MIGRATIONS list. The runner uses that explicit list (not a directory scan), so
// a file that isn't listed silently never runs in prod — which is exactly how
// 022 (user_sport_ratings) and 023 (matches) shipped without their tables,
// 500-ing pool standings and the match feature.

const fs = require('fs');
const path = require('path');
const { MIGRATIONS } = require('../db/migrate');

describe('migration registration', () => {
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.js$/.test(f)).map((f) => f.replace(/\.js$/, '')).sort();
  const registered = MIGRATIONS.map((m) => m.name).sort();

  test('every migration file is registered in MIGRATIONS', () => {
    const missing = files.filter((f) => !registered.includes(f));
    expect(missing).toEqual([]);
  });

  test('every registered migration has a file on disk', () => {
    const orphan = registered.filter((r) => !files.includes(r));
    expect(orphan).toEqual([]);
  });

  test('MIGRATIONS are in ascending numeric order', () => {
    const nums = MIGRATIONS.map((m) => parseInt(m.name.slice(0, 3), 10));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });
});
