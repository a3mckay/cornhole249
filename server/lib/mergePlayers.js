/**
 * Merge a duplicate placeholder player into a real account.
 *
 * "Add a player manually" creates a placeholder account (no email, Google
 * login or password). When that person later signs up themselves, they end up
 * with two accounts: the placeholder holds their games, the real one holds
 * their login — so their House, stats and league list never line up.
 *
 * mergePlayers() moves everything the placeholder owns onto the real account,
 * then deletes the placeholder. Callers are responsible for authorization
 * (see POST /api/leagues/:slug/members/merge) and for replaying ratings
 * afterwards (recomputeOfficialRatings), since Elo depends on game history.
 */
const { sql } = require('kysely');
const { recalculateAllElosBySport } = require('./elo');
const { persistSportRatings } = require('./sportRatings');
const { DEFAULT_SPORT } = require('./sports');

const ROLE_RANK = { owner: 3, admin: 2, player: 1 };

/** True when the account has no way to sign in except a claim link / legacy PIN. */
function isPlaceholder(user) {
  return !user.email && !user.google_id && !user.password_hash;
}

/** Replace `fromId` with `intoId` in a JSON id-array string. Returns null if unchanged. */
function swapIdInJsonArray(text, fromId, intoId) {
  let arr;
  try { arr = JSON.parse(text || '[]'); } catch (_) { return null; }
  if (!Array.isArray(arr)) return null;
  let changed = false;
  const out = arr.map((v) => {
    if (Number(v) === fromId) { changed = true; return typeof v === 'string' ? String(intoId) : intoId; }
    return v;
  });
  if (!changed) return null;
  // De-dupe in case both accounts were somehow listed (e.g. allowed_ids).
  return JSON.stringify([...new Set(out.map((v) => (typeof v === 'string' ? v : Number(v))))]);
}

/** Rewrite id-array columns in `table` (only rows whose text mentions the id). */
async function swapJsonColumns(trx, table, columns, fromId, intoId) {
  let updated = 0;
  const like = `%${fromId}%`;
  const where = sql.join(columns.map((c) => sql`${sql.ref(c)} LIKE ${like}`), sql` OR `);
  const { rows } = await sql`SELECT id, ${sql.join(columns.map((c) => sql.ref(c)))} FROM ${sql.table(table)} WHERE ${where}`.execute(trx);
  for (const row of rows) {
    const sets = [];
    for (const c of columns) {
      const next = swapIdInJsonArray(row[c], fromId, intoId);
      if (next != null) sets.push(sql`${sql.ref(c)} = ${next}`);
    }
    if (sets.length) {
      await sql`UPDATE ${sql.table(table)} SET ${sql.join(sets)} WHERE id = ${row.id}`.execute(trx);
      updated++;
    }
  }
  return updated;
}

/**
 * Leagues a user has any footprint in: memberships plus leagues of games they
 * played. Used to make sure an admin only merges history they manage.
 */
async function leagueFootprint(db, userId) {
  const { rows } = await sql`
    SELECT league_id FROM league_memberships WHERE user_id = ${userId}
    UNION
    SELECT g.league_id FROM game_participants gp JOIN games g ON g.id = gp.game_id
    WHERE gp.user_id = ${userId} AND g.league_id IS NOT NULL
  `.execute(db);
  return [...new Set(rows.map((r) => r.league_id))];
}

/** Games both accounts played in — merging would put one person on both sides. */
async function sharedGameIds(db, fromId, intoId) {
  const { rows } = await sql`
    SELECT a.game_id FROM game_participants a
    JOIN game_participants b ON b.game_id = a.game_id
    WHERE a.user_id = ${fromId} AND b.user_id = ${intoId}
  `.execute(db);
  return [...new Set(rows.map((r) => r.game_id))];
}

/**
 * Move everything owned by `fromId` onto `intoId` and delete `fromId`, in one
 * transaction. Returns counts of what moved. Throws on a shared game.
 */
async function mergePlayers(db, { fromId, intoId }) {
  if (fromId === intoId) throw new Error('Cannot merge a player into themselves');

  return db.transaction().execute(async (trx) => {
    const from = await trx.selectFrom('users').selectAll().where('id', '=', fromId).executeTakeFirst();
    const into = await trx.selectFrom('users').selectAll().where('id', '=', intoId).executeTakeFirst();
    if (!from || !into) throw new Error('Player not found');

    const shared = await sharedGameIds(trx, fromId, intoId);
    if (shared.length) {
      const err = new Error(`These two accounts played against or with each other in ${shared.length} game(s), so they can't be the same person.`);
      err.status = 409;
      throw err;
    }

    const moved = {};

    // Memberships: keep one row per league, with the stronger of the two roles.
    const { rows: fromMs } = await sql`SELECT league_id, role FROM league_memberships WHERE user_id = ${fromId}`.execute(trx);
    const { rows: intoMs } = await sql`SELECT league_id, role FROM league_memberships WHERE user_id = ${intoId}`.execute(trx);
    const intoRole = new Map(intoMs.map((m) => [m.league_id, m.role]));
    moved.memberships = 0;
    for (const m of fromMs) {
      if (intoRole.has(m.league_id)) {
        if ((ROLE_RANK[m.role] || 0) > (ROLE_RANK[intoRole.get(m.league_id)] || 0)) {
          await sql`UPDATE league_memberships SET role = ${m.role} WHERE league_id = ${m.league_id} AND user_id = ${intoId}`.execute(trx);
        }
        await sql`DELETE FROM league_memberships WHERE league_id = ${m.league_id} AND user_id = ${fromId}`.execute(trx);
      } else {
        await sql`UPDATE league_memberships SET user_id = ${intoId} WHERE league_id = ${m.league_id} AND user_id = ${fromId}`.execute(trx);
        moved.memberships++;
      }
    }

    // Game history.
    const gp = await sql`UPDATE game_participants SET user_id = ${intoId} WHERE user_id = ${fromId}`.execute(trx);
    moved.games = Number(gp.numAffectedRows ?? 0);

    // Achievements are unique per (user, key, league): drop the placeholder's
    // copies of ones the real account already has, move the rest.
    const { rows: fromAch } = await sql`SELECT id, achievement_key, league_id FROM achievements WHERE user_id = ${fromId}`.execute(trx);
    const { rows: intoAch } = await sql`SELECT achievement_key, league_id FROM achievements WHERE user_id = ${intoId}`.execute(trx);
    const have = new Set(intoAch.map((a) => `${a.achievement_key}|${a.league_id}`));
    moved.achievements = 0;
    for (const a of fromAch) {
      if (have.has(`${a.achievement_key}|${a.league_id}`)) {
        await sql`DELETE FROM achievements WHERE id = ${a.id}`.execute(trx);
      } else {
        await sql`UPDATE achievements SET user_id = ${intoId} WHERE id = ${a.id}`.execute(trx);
        moved.achievements++;
      }
    }

    // Simple user references.
    const simple = [
      ['comments', 'user_id'],
      ['trash_talk', 'user_id'],
      ['games', 'submitted_by_user_id'],
      ['pending_game_submissions', 'submitter_user_id'],
      ['matches', 'created_by_user_id'],
      ['leagues', 'owner_user_id'],
      ['join_codes', 'created_by'],
      ['join_codes', 'used_by'],
      ['join_requests', 'reviewed_by'],
      ['plan_override_audit', 'changed_by_user_id'],
      ['users', 'referred_by_user_id'],
    ];
    for (const [table, col] of simple) {
      await sql`UPDATE ${sql.table(table)} SET ${sql.ref(col)} = ${intoId} WHERE ${sql.ref(col)} = ${fromId}`.execute(trx);
    }
    // The placeholder never asked to join anything worth keeping; (league, user) is unique.
    await sql`DELETE FROM join_requests WHERE user_id = ${fromId}`.execute(trx);

    // Player ids stored as JSON arrays.
    moved.brackets = await swapJsonColumns(trx, 'tournament_matches', ['team1_player_ids', 'team2_player_ids'], fromId, intoId);
    await swapJsonColumns(trx, 'pending_game_submissions', ['team1_player_ids', 'team2_player_ids'], fromId, intoId);
    await swapJsonColumns(trx, 'matches', ['side1_player_ids', 'side2_player_ids'], fromId, intoId);
    await swapJsonColumns(trx, 'leagues', ['score_submit_allowed_ids', 'tournament_create_allowed_ids'], fromId, intoId);

    // Ratings are replayed from game history afterwards; the placeholder's go.
    await sql`DELETE FROM user_sport_ratings WHERE user_id = ${fromId}`.execute(trx);

    // Keep the league nickname (e.g. "The Bayfront Bagger") if the real account has none.
    if (!into.nickname && from.nickname) {
      await sql`UPDATE users SET nickname = ${from.nickname} WHERE id = ${intoId}`.execute(trx);
    }

    await sql`DELETE FROM users WHERE id = ${fromId}`.execute(trx);
    return moved;
  });
}

/**
 * Replay Elo for every sport from official games (same rules as a game being
 * logged — see updateElosAfterGame in routes/games.js).
 */
async function recomputeOfficialRatings(db) {
  const { rows: games } = await sql`SELECT * FROM games WHERE status = 'official' OR status IS NULL ORDER BY played_at ASC`.execute(db);
  const officialIds = new Set(games.map((g) => g.id));
  const { rows: allParticipants } = await sql`SELECT * FROM game_participants`.execute(db);
  const participants = allParticipants.filter((p) => officialIds.has(p.game_id));
  const { rows: leagueRows } = await sql`SELECT id, sport FROM leagues`.execute(db);
  const sportByLeague = new Map(leagueRows.map((l) => [l.id, l.sport]));
  const resolveSport = (game) => sportByLeague.get(game.league_id) || DEFAULT_SPORT;
  const bySport = recalculateAllElosBySport(games, participants, resolveSport);
  await persistSportRatings(db, bySport);
}

module.exports = {
  mergePlayers, recomputeOfficialRatings, isPlaceholder, leagueFootprint, sharedGameIds, swapIdInJsonArray,
};
