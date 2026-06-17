/**
 * Sport-config registry — the multi-sport keystone.
 *
 * Single source of truth for per-sport identity, theming, score model, allowed
 * formats/variants, and ELO margin math. Mirrored on the client as
 * `client/src/sports.js` (light theming reads `accent`); keep the two in sync.
 *
 * Design rules:
 *  - This module has NO internal deps (elo.js imports sports.js, never the
 *    reverse) — avoids a require cycle.
 *  - Adding a sport = one entry here + (when that sport is built) a
 *    game-extension migration. Cornhole is the only behaviorally-live sport in
 *    Phase 1; pool's entry is staged for Phase 2 wiring.
 *
 * See MULTISPORT_MERGE_PLAN.md §2.2.
 */

// --- Margin multipliers (pure functions, shared by registry entries) ---------

/**
 * Cornhole/points margin multiplier.
 * Scales K between 1.0× (1-point win) and 1.5× (shutout).
 * Identical to the legacy elo.js `marginMultiplier` — cornhole stays
 * byte-identical. Tolerates undefined scores (margin → 0 → 1.0×).
 */
function pointMarginMultiplier(winnerScore, loserScore) {
  const margin = Math.max(0, (winnerScore || 0) - (loserScore || 0));
  return Math.min(1.5, 1 + (margin / 22) * 1.1);
}

/**
 * Pool balls-remaining margin proxy (loser's balls still on the table).
 * poolMarginMultiplier(balls) = min(1.5, 1 + max(0, balls)/10).
 * Used by 8-ball/9-ball/straight; cutthroat is flat 1× (no margin).
 */
function ballsRemainingMultiplier(ballsRemaining) {
  const balls = Math.max(0, ballsRemaining || 0);
  return Math.min(1.5, 1 + balls / 10);
}

// --- Registry ----------------------------------------------------------------

const SPORTS = {
  cornhole: {
    key: 'cornhole',
    displayName: 'Cornhole',
    emoji: '🌽',
    accent: { primary: '#3A6B35', secondary: '#D48B2D' },
    scoreModel: 'points', // race to 21 (rules-dependent)
    formats: ['1v1', '2v2'],
    variants: null,
    /**
     * marginFn(winnerRow, loserRow, game) -> multiplier.
     * Cornhole = point margin off the participant scores. Identical to the
     * legacy hardcoded path.
     */
    marginFn(winnerRow, loserRow /* , game */) {
      return pointMarginMultiplier(
        winnerRow ? winnerRow.score : 0,
        loserRow ? loserRow.score : 0
      );
    },
  },

  // Phase 2 (staged — not yet wired into routes/migrations). The marginFn here
  // is the intended behavior; cutthroat resolves to 1× once `game_variant`
  // lands. Pool reads the LOSER's balls_remaining as the margin proxy.
  pool: {
    key: 'pool',
    displayName: 'Pool',
    emoji: '🎱',
    accent: { primary: '#1f5c3d', secondary: '#caa45a' },
    scoreModel: 'racks',
    formats: ['1v1', '2v2'],
    variants: ['eight_ball', 'nine_ball', 'cutthroat', 'straight_pool'],
    marginFn(winnerRow, loserRow, game) {
      if (game && game.game_variant === 'cutthroat') return 1;
      return ballsRemainingMultiplier(loserRow ? loserRow.balls_remaining : 0);
    },
  },
};

const DEFAULT_SPORT = 'cornhole';

/** Resolve a sport entry by key, falling back to cornhole for unknown/missing. */
function getSport(key) {
  return SPORTS[key] || SPORTS[DEFAULT_SPORT];
}

module.exports = {
  SPORTS,
  DEFAULT_SPORT,
  getSport,
  pointMarginMultiplier,
  ballsRemainingMultiplier,
};
