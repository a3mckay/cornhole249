const { getSport, pointMarginMultiplier, DEFAULT_SPORT } = require('./sports');

const K = 32;

// Cutthroat (3-player free-for-all) rating tuning. Each finish earns a fixed
// share of the game; winning dominates while 2nd is a small penalty and 3rd a
// large one. Shares must sum to 1 so ratings stay conserved. K_c is larger than
// the 1v1 K because the winner beat two opponents at once.
const CUTTHROAT_K = 48;
const CUTTHROAT_SCORE = { 1: 0.80, 2: 0.20, 3: 0.00 };

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
  // Backward-compat alias. The canonical points-margin math now lives in
  // sports.js (cornhole's marginFn). Kept identical so existing imports and
  // cornhole ratings are byte-for-byte unchanged.
  return pointMarginMultiplier(winnerScore, loserScore);
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
 *
 * `resolveSport(game) -> sportKey` is optional. It lets multi-sport callers
 * pick the per-game margin model (each league carries a `sport`). When omitted
 * every game resolves to cornhole, so existing two-arg callers are byte-for-byte
 * unchanged. The resolved sport's `marginFn(winnerRow, loserRow, game)` supplies
 * the K multiplier.
 */
function recalculateAllElos(games, participants, resolveSport) {
  const getSportKey =
    typeof resolveSport === 'function' ? resolveSport : () => DEFAULT_SPORT;
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

    // Cutthroat with a recorded finish order (placement 1/2/3) uses a single
    // finish-share update rather than pairwise games. Each place earns a fixed
    // share of the game (winner 0.80, 2nd 0.20, 3rd 0.00) measured against the
    // player's EXPECTED share (mean pairwise win-prob vs the field, normalised
    // to sum to 1). Δ = K_c·(share − expectedShare); deltas sum to zero.
    //
    // Why not pairwise: pairwise treated "beating the 3rd-place player" as a real
    // win, so repeated 2nd-place finishes could out-earn actually winning. Here
    // the 1st→2nd gap (0.60) dwarfs the 2nd→3rd gap (0.20), so winning dominates
    // while 2nd is only a small penalty and 3rd a large one.
    // Legacy cutthroat games with no placement fall through to the flat model.
    if (game.game_type === 'cutthroat') {
      const ranked = [...team1, ...team2]
        .filter((p) => [1, 2, 3].includes(p.placement))
        .sort((a, b) => a.placement - b.placement);
      const ordered = ranked.length === 3
        && ranked[0].placement === 1
        && ranked[1].placement === 2
        && ranked[2].placement === 3;
      if (ordered) {
        // Expected share = mean pairwise win-prob vs the field, normalised so the
        // three expected shares sum to 1 (matching the score shares' total).
        const expRaw = {};
        for (const a of ranked) {
          let s = 0;
          for (const b of ranked) {
            if (b === a) continue;
            s += expectedScore(elos[a.user_id] || 1000, elos[b.user_id] || 1000);
          }
          expRaw[a.user_id] = s;
        }
        const expTotal = ranked.reduce((s, p) => s + expRaw[p.user_id], 0) || 1;
        for (const p of ranked) {
          const share = CUTTHROAT_SCORE[p.placement];
          const expShare = expRaw[p.user_id] / expTotal;
          const delta = CUTTHROAT_K * (share - expShare);
          elos[p.user_id] = Math.round((elos[p.user_id] || 1000) + delta);
        }
        continue;
      }
    }

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

    // Per-sport margin multiplier. Cornhole = point margin off the winner/loser
    // participant rows; other sports read their own fields (e.g. pool's
    // balls_remaining) via the registry marginFn.
    const winnerRow = team1Won ? team1[0] : team2[0];
    const loserRow  = team1Won ? team2[0] : team1[0];
    const sport = getSport(getSportKey(game));
    const mult = sport.marginFn(winnerRow, loserRow, game);
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

/**
 * Per-sport ELO recalc (ROADMAP WS-E). Partitions games by sport (via
 * `resolveSport(game) -> sportKey`) and replays each sport's history in
 * isolation, returning `{ sportKey: { userId: rating } }`.
 *
 * Replaying cornhole's games alone yields exactly the numbers the original
 * single-sport algorithm always produced — so cornhole ratings are byte-for-byte
 * unchanged by the split. A pool result only moves pool ratings, never cornhole.
 */
function recalculateAllElosBySport(games, participants, resolveSport) {
  const getSportKey =
    typeof resolveSport === 'function' ? resolveSport : () => DEFAULT_SPORT;

  const gamesBySport = {};
  for (const g of games) {
    const key = getSportKey(g);
    (gamesBySport[key] ||= []).push(g);
  }

  const result = {};
  for (const [sport, sportGames] of Object.entries(gamesBySport)) {
    const ids = new Set(sportGames.map((g) => g.id));
    const sportParts = participants.filter((p) => ids.has(p.game_id));
    // Constant sport key → the replay uses just this sport's margin model and
    // only returns players who actually played it.
    result[sport] = recalculateAllElos(sportGames, sportParts, () => sport);
  }
  return result;
}

module.exports = { expectedScore, winProbability, updateElo, marginMultiplier, recalculateAllElos, recalculateAllElosBySport };
