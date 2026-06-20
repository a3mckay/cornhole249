/**
 * Match/series logic (ROADMAP WS-G) — pure, DB-free, sport-agnostic.
 *
 * A match is a race between two FIXED sides to `target_wins` game wins (best of 3
 * = first to 2, race to 5 = first to 5). Its games may be interleaved with other
 * games, so progress is always derived by replaying the match's own games rather
 * than kept as a running counter. Each game's winner is mapped back to side 1 or
 * side 2 by which side the winning participant(s) belong to.
 */

function parseIds(json) {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.map(Number) : [];
  } catch (_) {
    return [];
  }
}

/** Which side (1 or 2) won this game, or null if it can't be mapped. */
function winningSide(game, side1Ids, side2Ids) {
  const winners = (game.participants || []).filter((p) => p.is_winner);
  if (!winners.length) return null;
  const w = Number(winners[0].user_id);
  if (side1Ids.includes(w)) return 1;
  if (side2Ids.includes(w)) return 2;
  return null;
}

/**
 * Replay a match's games into a running score + completion state.
 * `games` are the match's games, each with a `participants` array (is_winner).
 * Returns { side1_wins, side2_wins, games_played, status, winner_side }.
 */
function matchProgress(match, games) {
  const s1 = parseIds(match.side1_player_ids);
  const s2 = parseIds(match.side2_player_ids);
  let side1Wins = 0;
  let side2Wins = 0;
  for (const g of games) {
    const side = winningSide(g, s1, s2);
    if (side === 1) side1Wins += 1;
    else if (side === 2) side2Wins += 1;
  }
  const target = Number(match.target_wins);
  let status = 'open';
  let winnerSide = null;
  if (side1Wins >= target) { status = 'completed'; winnerSide = 1; }
  else if (side2Wins >= target) { status = 'completed'; winnerSide = 2; }
  return {
    side1_wins: side1Wins,
    side2_wins: side2Wins,
    games_played: side1Wins + side2Wins,
    status,
    winner_side: winnerSide,
  };
}

/** Same set of players on each side, regardless of which team maps to which. */
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sb = new Set(b.map(Number));
  return a.every((x) => sb.has(Number(x)));
}

/**
 * Does a submitted game (team1Ids vs team2Ids) belong to this match? True when
 * the two teams are exactly the match's two sides, in either orientation.
 */
function gameFitsMatch(team1Ids, team2Ids, side1Ids, side2Ids) {
  const s1 = side1Ids.map(Number);
  const s2 = side2Ids.map(Number);
  return (
    (sameSet(team1Ids, s1) && sameSet(team2Ids, s2)) ||
    (sameSet(team1Ids, s2) && sameSet(team2Ids, s1))
  );
}

module.exports = { matchProgress, gameFitsMatch, parseIds, winningSide };
