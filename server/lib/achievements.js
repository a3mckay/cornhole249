const { getDb } = require('../db');

const ACHIEVEMENT_DEFS = [
  {
    key: 'first_blood',
    label: 'First Blood',
    description: 'First game ever recorded in the league',
    icon: '🩸',
  },
  {
    key: 'win_streak_3',
    label: 'On Fire',
    description: 'Won 3 games in a row',
    icon: '🔥',
  },
  {
    key: 'win_streak_5',
    label: 'Hot Hand',
    description: 'Won 5 games in a row',
    icon: '🔥🔥',
  },
  {
    key: 'win_streak_10',
    label: 'Unstoppable',
    description: 'Won 10 games in a row',
    icon: '👑',
  },
  {
    key: 'century',
    label: 'Century',
    description: 'Played 100 games',
    icon: '💯',
  },
  {
    key: 'giant_slayer',
    label: 'Giant Slayer',
    description: 'Beat a player with 70%+ win rate when you had under 40%',
    icon: '🗡️',
  },
  {
    key: 'shutout',
    label: 'Shutout',
    description: 'Won a game where the opponent scored 0',
    icon: '🦾',
  },
  {
    key: 'comeback_kid',
    label: 'Comeback Kid',
    description: 'Won a game after trailing by 10+ points',
    icon: '💪',
  },
  {
    key: 'rain_warrior',
    label: 'Rain Warrior',
    description: '3+ wins in rainy conditions',
    icon: '🌧️',
  },
  {
    key: 'home_turf',
    label: 'Home Turf',
    description: '10+ wins at the same venue',
    icon: '🏠',
  },
  {
    key: 'trash_talker',
    label: 'Trash Talker',
    description: 'Posted 25+ comments',
    icon: '💬',
  },
  {
    key: 'hype_machine',
    label: 'Hype Machine',
    description: 'Received 50+ comments on your games',
    icon: '📣',
  },
];

function awardAchievement(userId, key) {
  const db = getDb();
  try {
    db.prepare(
      `INSERT OR IGNORE INTO achievements (user_id, achievement_key, earned_at)
       VALUES (?, ?, datetime('now'))`
    ).run(userId, key);
    // Return true if newly inserted
    return db.prepare(
      `SELECT changes() as c`
    ).get().c > 0;
  } catch (e) {
    return false;
  }
}

function hasAchievement(userId, key) {
  const db = getDb();
  return !!db.prepare(
    `SELECT 1 FROM achievements WHERE user_id = ? AND achievement_key = ?`
  ).get(userId, key);
}

/**
 * Evaluate and award achievements after a game is submitted.
 * gameId: the newly submitted game
 * Returns array of newly awarded achievement keys
 */
function evaluateAchievements(gameId) {
  const db = getDb();
  const awarded = [];

  const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId);
  if (!game) return awarded;

  const participants = db.prepare(
    `SELECT gp.*, u.elo_rating FROM game_participants gp
     JOIN users u ON gp.user_id = u.id
     WHERE gp.game_id = ?`
  ).all(gameId);

  for (const p of participants) {
    const userId = p.user_id;

    // first_blood: first game ever recorded
    const totalGames = db.prepare(
      `SELECT COUNT(*) as c FROM games`
    ).get().c;
    if (totalGames === 1) {
      if (awardAchievement(userId, 'first_blood')) awarded.push({ userId, key: 'first_blood' });
    }

    // century: 100 games played
    const gp = db.prepare(
      `SELECT COUNT(*) as c FROM game_participants WHERE user_id = ?`
    ).get(userId).c;
    if (gp >= 100) {
      if (awardAchievement(userId, 'century')) awarded.push({ userId, key: 'century' });
    }

    if (p.is_winner) {
      // Win streaks
      const recentGames = db.prepare(
        `SELECT gp.is_winner FROM game_participants gp
         JOIN games g ON gp.game_id = g.id
         WHERE gp.user_id = ?
         ORDER BY g.played_at DESC
         LIMIT 10`
      ).all(userId);

      let streak = 0;
      for (const rg of recentGames) {
        if (rg.is_winner) streak++;
        else break;
      }

      if (streak >= 10) {
        if (awardAchievement(userId, 'win_streak_10')) awarded.push({ userId, key: 'win_streak_10' });
      }
      if (streak >= 5) {
        if (awardAchievement(userId, 'win_streak_5')) awarded.push({ userId, key: 'win_streak_5' });
      }
      if (streak >= 3) {
        if (awardAchievement(userId, 'win_streak_3')) awarded.push({ userId, key: 'win_streak_3' });
      }

      // shutout: opponent scored 0
      const opponentTeam = p.team === 1 ? 2 : 1;
      const opponentScore = db.prepare(
        `SELECT SUM(score) as total FROM game_participants WHERE game_id = ? AND team = ?`
      ).get(gameId, opponentTeam);
      if (opponentScore && opponentScore.total === 0) {
        if (awardAchievement(userId, 'shutout')) awarded.push({ userId, key: 'shutout' });
      }

      // giant_slayer: beat a 70%+ win-rate player when you're under 40%
      const myStats = getUserWinRate(userId, db);
      if (myStats.rate < 0.4 && myStats.gp >= 5) {
        const opponentParticipants = participants.filter(
          (op) => op.team === opponentTeam
        );
        for (const opp of opponentParticipants) {
          const oppStats = getUserWinRate(opp.user_id, db);
          if (oppStats.rate > 0.7 && oppStats.gp >= 5) {
            if (awardAchievement(userId, 'giant_slayer')) awarded.push({ userId, key: 'giant_slayer' });
            break;
          }
        }
      }

      // rain_warrior: 3+ wins in rainy conditions
      if (game.weather_json) {
        const weather = JSON.parse(game.weather_json);
        const condition = (weather.condition || '').toLowerCase();
        if (condition.includes('rain') || condition.includes('drizzle')) {
          const rainWins = db.prepare(
            `SELECT COUNT(*) as c FROM game_participants gp
             JOIN games g ON gp.game_id = g.id
             WHERE gp.user_id = ? AND gp.is_winner = 1
             AND (g.weather_json LIKE '%"condition":"Rain%' OR g.weather_json LIKE '%"condition":"Drizzle%' OR g.weather_json LIKE '%"condition":"Heavy Rain%')`
          ).get(userId).c;
          if (rainWins >= 3) {
            if (awardAchievement(userId, 'rain_warrior')) awarded.push({ userId, key: 'rain_warrior' });
          }
        }
      }

      // home_turf: 10+ wins at same venue
      if (game.venue_id) {
        const venueWins = db.prepare(
          `SELECT COUNT(*) as c FROM game_participants gp
           JOIN games g ON gp.game_id = g.id
           WHERE gp.user_id = ? AND gp.is_winner = 1 AND g.venue_id = ?`
        ).get(userId, game.venue_id).c;
        if (venueWins >= 10) {
          if (awardAchievement(userId, 'home_turf')) awarded.push({ userId, key: 'home_turf' });
        }
      }
    }

    // comeback_kid: won after trailing by 10+
    // (This would require round-by-round data; we approximate by checking final scores)
    // For seed data we'll just manually evaluate this. Skip for real-time eval.

    // trash_talker: 25+ comments
    const commentCount = db.prepare(
      `SELECT COUNT(*) as c FROM comments WHERE user_id = ?`
    ).get(userId).c;
    if (commentCount >= 25) {
      if (awardAchievement(userId, 'trash_talker')) awarded.push({ userId, key: 'trash_talker' });
    }

    // hype_machine: received 50+ comments on own games
    const hypeCount = db.prepare(
      `SELECT COUNT(*) as c FROM comments c
       JOIN game_participants gp ON c.game_id = gp.game_id
       WHERE gp.user_id = ?`
    ).get(userId).c;
    if (hypeCount >= 50) {
      if (awardAchievement(userId, 'hype_machine')) awarded.push({ userId, key: 'hype_machine' });
    }
  }

  return awarded;
}

function getUserWinRate(userId, db) {
  const row = db.prepare(
    `SELECT
       COUNT(*) as gp,
       SUM(is_winner) as wins
     FROM game_participants WHERE user_id = ?`
  ).get(userId);
  const gp = row.gp || 0;
  const wins = row.wins || 0;
  return { gp, wins, rate: gp > 0 ? wins / gp : 0 };
}

module.exports = { ACHIEVEMENT_DEFS, evaluateAchievements, awardAchievement, hasAchievement };
