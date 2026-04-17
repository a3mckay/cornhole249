const { winProbability } = require('./elo');
const { getDb } = require('../db');

/**
 * Calculate matchup odds between two teams.
 * team1Ids, team2Ids: arrays of user IDs
 * Returns { team1_pct, team2_pct, confidence, method, explanation }
 */
function calculateOdds(team1Ids, team2Ids) {
  const db = getDb();

  // Get current Elo for each player
  const placeholders1 = team1Ids.map(() => '?').join(',');
  const placeholders2 = team2Ids.map(() => '?').join(',');

  const team1Players = db.prepare(
    `SELECT id, display_name, nickname, elo_rating FROM users WHERE id IN (${placeholders1})`
  ).all(...team1Ids);

  const team2Players = db.prepare(
    `SELECT id, display_name, nickname, elo_rating FROM users WHERE id IN (${placeholders2})`
  ).all(...team2Ids);

  if (!team1Players.length || !team2Players.length) {
    return {
      team1_pct: 50,
      team2_pct: 50,
      confidence: 'Estimated',
      method: 'default',
      explanation: 'Insufficient player data. Defaulting to 50/50.',
    };
  }

  const avgElo1 =
    team1Players.reduce((s, p) => s + p.elo_rating, 0) / team1Players.length;
  const avgElo2 =
    team2Players.reduce((s, p) => s + p.elo_rating, 0) / team2Players.length;

  // Head-to-head games
  const allIds = [...team1Ids, ...team2Ids];
  const h2hGames = getH2HGames(team1Ids, team2Ids, db);

  // Game counts for each player
  const minGames1 = Math.min(
    ...team1Players.map((p) => {
      return db.prepare(`SELECT COUNT(*) as c FROM game_participants WHERE user_id = ?`).get(p.id).c;
    })
  );
  const minGames2 = Math.min(
    ...team2Players.map((p) => {
      return db.prepare(`SELECT COUNT(*) as c FROM game_participants WHERE user_id = ?`).get(p.id).c;
    })
  );

  // Confidence
  let confidence;
  if (minGames1 >= 10 && minGames2 >= 10 && h2hGames >= 3) {
    confidence = 'High';
  } else if (minGames1 >= 5 && minGames2 >= 5) {
    confidence = 'Medium';
  } else if (minGames1 >= 2 && minGames2 >= 2) {
    confidence = 'Low';
  } else {
    confidence = 'Estimated';
  }

  const rawP1 = winProbability(avgElo1, avgElo2);
  const team1_pct = Math.round(rawP1 * 100);
  const team2_pct = 100 - team1_pct;

  // Plain-English explanation
  const t1Name = team1Players.map((p) => p.display_name).join(' & ');
  const t2Name = team2Players.map((p) => p.display_name).join(' & ');

  let explanation;
  if (h2hGames >= 3) {
    const { team1Wins } = getH2HRecord(team1Ids, team2Ids, db);
    explanation = `Based on ${h2hGames} head-to-head matchups, ${t1Name} holds a ${team1_pct}% edge (Elo: ${Math.round(avgElo1)} vs ${Math.round(avgElo2)}). ${t1Name} has won ${team1Wins} of those meetings.`;
  } else if (confidence === 'Estimated') {
    explanation = `Limited data available. Using Elo ratings as best estimate (${Math.round(avgElo1)} vs ${Math.round(avgElo2)}).`;
  } else {
    const stronger = team1_pct >= 50 ? t1Name : t2Name;
    const pct = Math.max(team1_pct, team2_pct);
    explanation = `${stronger} has a ${pct}% edge based on current Elo ratings (${Math.round(avgElo1)} vs ${Math.round(avgElo2)}).`;
  }

  return {
    team1_pct,
    team2_pct,
    confidence,
    method: 'elo',
    explanation,
    elo_team1: Math.round(avgElo1),
    elo_team2: Math.round(avgElo2),
    h2h_games: h2hGames,
  };
}

function getH2HGames(team1Ids, team2Ids, db) {
  // Find games where team1Ids all appear on one side and team2Ids all on the other
  // Simplified: find games containing all players
  const allIds = [...new Set([...team1Ids, ...team2Ids])];
  if (allIds.length < 2) return 0;

  // Get all game_ids where these players participated
  const placeholders = allIds.map(() => '?').join(',');
  const gameIds = db.prepare(
    `SELECT game_id, GROUP_CONCAT(user_id) as uids
     FROM game_participants
     WHERE user_id IN (${placeholders})
     GROUP BY game_id
     HAVING COUNT(DISTINCT user_id) >= ?`
  ).all(...allIds, allIds.length);

  return gameIds.length;
}

function getH2HRecord(team1Ids, team2Ids, db) {
  const allIds = [...new Set([...team1Ids, ...team2Ids])];
  const placeholders = allIds.map(() => '?').join(',');

  const games = db.prepare(
    `SELECT game_id, GROUP_CONCAT(user_id) as uids
     FROM game_participants
     WHERE user_id IN (${placeholders})
     GROUP BY game_id
     HAVING COUNT(DISTINCT user_id) >= ?`
  ).all(...allIds, allIds.length);

  let team1Wins = 0;
  let team2Wins = 0;

  for (const g of games) {
    const winnerRow = db.prepare(
      `SELECT user_id FROM game_participants WHERE game_id = ? AND is_winner = 1 LIMIT 1`
    ).get(g.game_id);
    if (!winnerRow) continue;
    if (team1Ids.includes(winnerRow.user_id)) team1Wins++;
    else if (team2Ids.includes(winnerRow.user_id)) team2Wins++;
  }

  return { team1Wins, team2Wins, total: games.length };
}

module.exports = { calculateOdds };
