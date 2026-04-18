const K = 32;

/**
 * Calculate expected score for player A against player B
 */
function expectedScore(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

/**
 * Calculate win probability for team A vs team B
 * For 2v2, pass average Elo of each team
 */
function winProbability(eloA, eloB) {
  return expectedScore(eloA, eloB);
}

/**
 * Margin-of-victory multiplier.
 * Scales K between 1.0× (1-point win) and 1.5× (shutout).
 * Formula: 1 + (margin / 22) * 1.1  — capped at 1.5
 * Examples:
 *   11-0  → margin 11 → 1.50×
 *   11-3  → margin  8 → 1.40×
 *   11-6  → margin  5 → 1.25×
 *   11-9  → margin  2 → 1.10×
 */
function marginMultiplier(winnerScore, loserScore) {
  const margin = Math.max(0, (winnerScore || 0) - (loserScore || 0));
  return Math.min(1.5, 1 + (margin / 22) * 1.1);
}

/**
 * Update Elo ratings after a game
 * Returns { newEloA, newEloB }
 * scoreA: 1 if A won, 0 if A lost
 * winnerPoints / loserPoints: optional game scores for margin multiplier
 */
function updateElo(eloA, eloB, scoreA, winnerPoints, loserPoints) {
  const exp = expectedScore(eloA, eloB);
  const scoreB = 1 - scoreA;
  const expB = 1 - exp;
  const mult = (winnerPoints != null && loserPoints != null)
    ? marginMultiplier(winnerPoints, loserPoints)
    : 1;
  const k = K * mult;
  return {
    newEloA: Math.round(eloA + k * (scoreA - exp)),
    newEloB: Math.round(eloB + k * (scoreB - expB)),
  };
}

/**
 * Replay all game history to recalculate Elo ratings from scratch.
 * Returns a map of userId -> eloRating
 */
function recalculateAllElos(games, participants) {
  // Build map: gameId -> participants
  const gameMap = {};
  for (const p of participants) {
    if (!gameMap[p.game_id]) gameMap[p.game_id] = [];
    gameMap[p.game_id].push(p);
  }

  // Sort games chronologically
  const sortedGames = [...games].sort(
    (a, b) => new Date(a.played_at) - new Date(b.played_at)
  );

  // Initialize all player Elos
  const elos = {};
  for (const p of participants) {
    if (!(p.user_id in elos)) elos[p.user_id] = 1000;
  }

  for (const game of sortedGames) {
    const gp = gameMap[game.id];
    if (!gp || gp.length < 2) continue;

    const team1 = gp.filter((p) => p.team === 1);
    const team2 = gp.filter((p) => p.team === 2);
    if (!team1.length || !team2.length) continue;

    // Average Elo per team
    const avgElo1 =
      team1.reduce((s, p) => s + (elos[p.user_id] || 1000), 0) / team1.length;
    const avgElo2 =
      team2.reduce((s, p) => s + (elos[p.user_id] || 1000), 0) / team2.length;

    const team1Won = team1[0].is_winner === 1;
    const score1 = team1Won ? 1 : 0;
    const score2 = 1 - score1;

    const exp1 = expectedScore(avgElo1, avgElo2);
    const exp2 = 1 - exp1;

    // Margin multiplier using actual game scores
    const winnerScore = team1Won ? team1[0].score : team2[0].score;
    const loserScore  = team1Won ? team2[0].score : team1[0].score;
    const mult = marginMultiplier(winnerScore, loserScore);
    const k = K * mult;

    const delta1 = k * (score1 - exp1);
    const delta2 = k * (score2 - exp2);

    for (const p of team1) {
      elos[p.user_id] = Math.round((elos[p.user_id] || 1000) + delta1);
    }
    for (const p of team2) {
      elos[p.user_id] = Math.round((elos[p.user_id] || 1000) + delta2);
    }
  }

  return elos;
}

module.exports = { expectedScore, winProbability, updateElo, marginMultiplier, recalculateAllElos };
