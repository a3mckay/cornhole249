const { getDb, sql } = require('../db');

const ACHIEVEMENT_DEFS = [
  { key: 'first_blood',    label: 'First Blood',    description: 'First game ever recorded in the league', icon: '🩸' },
  { key: 'win_streak_3',  label: 'On Fire',         description: 'Won 3 games in a row',                  icon: '🔥' },
  { key: 'win_streak_5',  label: 'Hot Hand',         description: 'Won 5 games in a row',                  icon: '🔥🔥' },
  { key: 'win_streak_10', label: 'Unstoppable',      description: 'Won 10 games in a row',                 icon: '👑' },
  { key: 'century',       label: 'Century',          description: 'Played 100 games',                      icon: '💯' },
  { key: 'giant_slayer',  label: 'Giant Slayer',     description: 'Beat a player with 70%+ win rate when you had under 40%', icon: '🗡️' },
  { key: 'shutout',       label: 'Shutout',          description: 'Won a game where the opponent scored 0', icon: '🦾' },
  { key: 'comeback_kid',  label: 'Comeback Kid',     description: 'Won a game after trailing by 10+ points', icon: '💪' },
  { key: 'rain_warrior',  label: 'Rain Warrior',     description: '3+ wins in rainy conditions',            icon: '🌧️' },
  { key: 'home_turf',     label: 'Home Turf',        description: '10+ wins at the same venue',             icon: '🏠' },
  { key: 'trash_talker',  label: 'Trash Talker',     description: 'Posted 25+ comments',                    icon: '💬' },
  { key: 'hype_machine',  label: 'Hype Machine',     description: 'Received 50+ comments on your games',   icon: '📣' },
];

/**
 * Award an achievement. Returns true if newly inserted, false if already had it.
 * leagueId defaults to 1 (Cornhole249) for backward compat.
 */
async function awardAchievement(userId, key, leagueId = 1) {
  const db = getDb();
  try {
    const result = await db
      .insertInto('achievements')
      .values({ user_id: userId, achievement_key: key, league_id: leagueId })
      .onConflict((oc) => oc.columns(['user_id', 'achievement_key', 'league_id']).doNothing())
      .returning(['id'])
      .executeTakeFirst();
    return result !== undefined;
  } catch (e) {
    return false;
  }
}

async function hasAchievement(userId, key) {
  const db = getDb();
  const row = await db
    .selectFrom('achievements')
    .select(['id'])
    .where('user_id', '=', userId)
    .where('achievement_key', '=', key)
    .executeTakeFirst();
  return !!row;
}

/**
 * Evaluate and award achievements after a game is submitted.
 * Returns array of newly awarded achievement keys.
 */
async function evaluateAchievements(gameId) {
  const db = getDb();
  const awarded = [];

  const game = await db.selectFrom('games').selectAll().where('id', '=', gameId).executeTakeFirst();
  if (!game) return awarded;

  const leagueId = game.league_id || 1;

  const { rows: participants } = await sql`
    SELECT gp.*, u.elo_rating FROM game_participants gp
    JOIN users u ON gp.user_id = u.id
    WHERE gp.game_id = ${gameId}
  `.execute(db);

  for (const p of participants) {
    const userId = p.user_id;

    // first_blood: first game ever recorded in the league
    const { rows: totalRows } = await sql`SELECT COUNT(*) as c FROM games WHERE league_id = ${leagueId}`.execute(db);
    const totalGames = parseInt(totalRows[0]?.c) || 0;
    if (totalGames === 1) {
      if (await awardAchievement(userId, 'first_blood', leagueId)) awarded.push({ userId, key: 'first_blood' });
    }

    // century: 100 games played in this league
    const { rows: gpRows } = await sql`
      SELECT COUNT(*) as c FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE gp.user_id = ${userId} AND g.league_id = ${leagueId}
    `.execute(db);
    const gp = parseInt(gpRows[0].c);
    if (gp >= 100) {
      if (await awardAchievement(userId, 'century', leagueId)) awarded.push({ userId, key: 'century' });
    }

    if (p.is_winner) {
      // Win streaks (within this league)
      const { rows: recentGames } = await sql`
        SELECT gp.is_winner FROM game_participants gp
        JOIN games g ON gp.game_id = g.id
        WHERE gp.user_id = ${userId} AND g.league_id = ${leagueId}
        ORDER BY g.played_at DESC
        LIMIT 10
      `.execute(db);

      let streak = 0;
      for (const rg of recentGames) {
        if (rg.is_winner) streak++;
        else break;
      }

      if (streak >= 10) { if (await awardAchievement(userId, 'win_streak_10', leagueId)) awarded.push({ userId, key: 'win_streak_10' }); }
      if (streak >= 5)  { if (await awardAchievement(userId, 'win_streak_5',  leagueId)) awarded.push({ userId, key: 'win_streak_5' }); }
      if (streak >= 3)  { if (await awardAchievement(userId, 'win_streak_3',  leagueId)) awarded.push({ userId, key: 'win_streak_3' }); }

      // shutout: opponent scored 0
      const opponentTeam = p.team === 1 ? 2 : 1;
      const { rows: oppRows } = await sql`
        SELECT SUM(score) as total FROM game_participants WHERE game_id = ${gameId} AND team = ${opponentTeam}
      `.execute(db);
      const oppTotal = parseInt(oppRows[0]?.total) || 0;
      if (oppTotal === 0) {
        if (await awardAchievement(userId, 'shutout', leagueId)) awarded.push({ userId, key: 'shutout' });
      }

      // comeback_kid: won a game where opponent scored 10+ (proxy — no intermediate score tracking)
      if (oppTotal >= 10) {
        if (await awardAchievement(userId, 'comeback_kid', leagueId)) awarded.push({ userId, key: 'comeback_kid' });
      }

      // giant_slayer: beat a 70%+ win-rate player when you're under 40%
      const myStats = await getUserWinRate(userId, leagueId, db);
      if (myStats.rate < 0.4 && myStats.gp >= 5) {
        const opponentParticipants = participants.filter((op) => op.team === opponentTeam);
        for (const opp of opponentParticipants) {
          const oppStats = await getUserWinRate(opp.user_id, leagueId, db);
          if (oppStats.rate > 0.7 && oppStats.gp >= 5) {
            if (await awardAchievement(userId, 'giant_slayer', leagueId)) awarded.push({ userId, key: 'giant_slayer' });
            break;
          }
        }
      }

      // rain_warrior: 3+ wins in rainy conditions (in this league)
      if (game.weather_json) {
        const weather = JSON.parse(game.weather_json);
        const condition = (weather.condition || '').toLowerCase();
        if (condition.includes('rain') || condition.includes('drizzle')) {
          const { rows: rainRows } = await sql`
            SELECT COUNT(*) as c FROM game_participants gp
            JOIN games g ON gp.game_id = g.id
            WHERE gp.user_id = ${userId} AND gp.is_winner = 1 AND g.league_id = ${leagueId}
            AND (g.weather_json LIKE '%"condition":"Rain%'
              OR g.weather_json LIKE '%"condition":"Drizzle%'
              OR g.weather_json LIKE '%"condition":"Heavy Rain%')
          `.execute(db);
          if ((parseInt(rainRows[0]?.c) || 0) >= 3) {
            if (await awardAchievement(userId, 'rain_warrior', leagueId)) awarded.push({ userId, key: 'rain_warrior' });
          }
        }
      }

      // home_turf: 10+ wins at same venue (in this league)
      if (game.venue_id) {
        const { rows: venueRows } = await sql`
          SELECT COUNT(*) as c FROM game_participants gp
          JOIN games g ON gp.game_id = g.id
          WHERE gp.user_id = ${userId} AND gp.is_winner = 1
          AND g.venue_id = ${game.venue_id} AND g.league_id = ${leagueId}
        `.execute(db);
        if (parseInt(venueRows[0].c) >= 10) {
          if (await awardAchievement(userId, 'home_turf', leagueId)) awarded.push({ userId, key: 'home_turf' });
        }
      }
    }

    // trash_talker: 25+ comments in this league
    const { rows: commentRows } = await sql`
      SELECT COUNT(*) as c FROM comments WHERE user_id = ${userId} AND league_id = ${leagueId}
    `.execute(db);
    if (parseInt(commentRows[0].c) >= 25) {
      if (await awardAchievement(userId, 'trash_talker', leagueId)) awarded.push({ userId, key: 'trash_talker' });
    }

    // hype_machine: received 50+ comments on own games in this league
    const { rows: hypeRows } = await sql`
      SELECT COUNT(*) as c FROM comments c
      JOIN game_participants gp ON c.game_id = gp.game_id
      WHERE gp.user_id = ${userId} AND c.league_id = ${leagueId}
    `.execute(db);
    if ((parseInt(hypeRows[0]?.c) || 0) >= 50) {
      if (await awardAchievement(userId, 'hype_machine', leagueId)) awarded.push({ userId, key: 'hype_machine' });
    }
  }

  return awarded;
}

async function getUserWinRate(userId, leagueId, db) {
  const { rows } = await sql`
    SELECT COUNT(*) as gp, SUM(gp.is_winner) as wins
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ${userId} AND g.league_id = ${leagueId}
  `.execute(db);
  const gp = parseInt(rows[0].gp) || 0;
  const wins = parseInt(rows[0].wins) || 0;
  return { gp, wins, rate: gp > 0 ? wins / gp : 0 };
}

module.exports = { ACHIEVEMENT_DEFS, evaluateAchievements, awardAchievement, hasAchievement };
