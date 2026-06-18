const { winProbability } = require('./elo');
const { getDb, sql } = require('../db');
const { DEFAULT_SPORT } = require('./sports');
const { getSportRating } = require('./sportRatings');

/**
 * Calculate matchup odds between two teams.
 * team1Ids, team2Ids: arrays of user IDs
 * sport: optional league sport — non-cornhole uses per-sport ELO (WS-E); cornhole
 *        (default/omitted) keeps using users.elo_rating, so it's unchanged.
 * Returns { team1_pct, team2_pct, confidence, method, explanation }
 */
async function calculateOdds(team1Ids, team2Ids, sport = DEFAULT_SPORT) {
  const db = getDb();

  // Get current Elo for each player
  const team1Players = team1Ids.length > 0
    ? await db.selectFrom('users')
        .select(['id', 'display_name', 'nickname', 'elo_rating'])
        .where('id', 'in', team1Ids)
        .execute()
    : [];

  const team2Players = team2Ids.length > 0
    ? await db.selectFrom('users')
        .select(['id', 'display_name', 'nickname', 'elo_rating'])
        .where('id', 'in', team2Ids)
        .execute()
    : [];

  // Swap in per-sport ratings for non-cornhole leagues (cornhole's elo_rating
  // mirror is authoritative, so we skip the lookups and stay byte-identical).
  if (sport && sport !== DEFAULT_SPORT) {
    for (const p of [...team1Players, ...team2Players]) {
      const r = await getSportRating(db, p.id, sport);
      if (r != null) p.elo_rating = r;
    }
  }

  if (!team1Players.length || !team2Players.length) {
    return {
      team1_pct: 50, team2_pct: 50,
      confidence: 'Estimated', method: 'default',
      explanation: 'Insufficient player data. Defaulting to 50/50.',
    };
  }

  const avgElo1 = team1Players.reduce((s, p) => s + p.elo_rating, 0) / team1Players.length;
  const avgElo2 = team2Players.reduce((s, p) => s + p.elo_rating, 0) / team2Players.length;

  const h2hGames = await getH2HGames(team1Ids, team2Ids, db);

  // Game counts for confidence calculation
  const getCount = async (userId) => {
    const { rows } = await sql`SELECT COUNT(*) as c FROM game_participants WHERE user_id = ${userId}`.execute(db);
    return parseInt(rows[0].c);
  };

  const counts1 = await Promise.all(team1Players.map((p) => getCount(p.id)));
  const counts2 = await Promise.all(team2Players.map((p) => getCount(p.id)));
  const minGames1 = Math.min(...counts1);
  const minGames2 = Math.min(...counts2);

  let confidence;
  if (minGames1 >= 10 && minGames2 >= 10 && h2hGames >= 3) confidence = 'High';
  else if (minGames1 >= 5 && minGames2 >= 5) confidence = 'Medium';
  else if (minGames1 >= 2 && minGames2 >= 2) confidence = 'Low';
  else confidence = 'Estimated';

  const rawP1 = winProbability(avgElo1, avgElo2);
  const team1_pct = Math.round(rawP1 * 100);
  const team2_pct = 100 - team1_pct;

  const t1Name = team1Players.map((p) => p.display_name).join(' & ');
  const t2Name = team2Players.map((p) => p.display_name).join(' & ');

  let explanation;
  if (h2hGames >= 3) {
    const { team1Wins } = await getH2HRecord(team1Ids, team2Ids, db);
    explanation = `Based on ${h2hGames} head-to-head matchups, ${t1Name} holds a ${team1_pct}% edge (Elo: ${Math.round(avgElo1)} vs ${Math.round(avgElo2)}). ${t1Name} has won ${team1Wins} of those meetings.`;
  } else if (confidence === 'Estimated') {
    explanation = `Limited data available. Using Elo ratings as best estimate (${Math.round(avgElo1)} vs ${Math.round(avgElo2)}).`;
  } else {
    const stronger = team1_pct >= 50 ? t1Name : t2Name;
    const pct = Math.max(team1_pct, team2_pct);
    explanation = `${stronger} has a ${pct}% edge based on current Elo ratings (${Math.round(avgElo1)} vs ${Math.round(avgElo2)}).`;
  }

  return {
    team1_pct, team2_pct, confidence,
    method: 'elo', explanation,
    elo_team1: Math.round(avgElo1), elo_team2: Math.round(avgElo2),
    h2h_games: h2hGames,
  };
}

async function getH2HGames(team1Ids, team2Ids, db) {
  const allIds = [...new Set([...team1Ids, ...team2Ids])];
  if (allIds.length < 2) return 0;

  const { rows } = await sql`
    SELECT game_id
    FROM game_participants
    WHERE user_id IN (${sql.join(allIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY game_id
    HAVING COUNT(DISTINCT user_id) >= ${allIds.length}
  `.execute(db);

  return rows.length;
}

async function getH2HRecord(team1Ids, team2Ids, db) {
  const allIds = [...new Set([...team1Ids, ...team2Ids])];

  const { rows: games } = await sql`
    SELECT game_id
    FROM game_participants
    WHERE user_id IN (${sql.join(allIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY game_id
    HAVING COUNT(DISTINCT user_id) >= ${allIds.length}
  `.execute(db);

  let team1Wins = 0, team2Wins = 0;

  for (const g of games) {
    const winner = await db
      .selectFrom('game_participants')
      .select(['user_id'])
      .where('game_id', '=', g.game_id)
      .where('is_winner', '=', 1)
      .executeTakeFirst();
    if (!winner) continue;
    if (team1Ids.includes(winner.user_id)) team1Wins++;
    else if (team2Ids.includes(winner.user_id)) team2Wins++;
  }

  return { team1Wins, team2Wins, total: games.length };
}

module.exports = { calculateOdds };
