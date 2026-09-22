/**
 * Client mirror of the sport-config registry (server/lib/sports.js).
 *
 * Light theming only: each sport carries an `accent` that overrides the shared
 * `--color-primary` / `--color-secondary` CSS vars (defined once in index.css)
 * when viewing a league of that sport. Everything else (surface, text, borders)
 * stays shared. Keep identity/accent fields in sync with the server registry.
 *
 * See MULTISPORT_MERGE_PLAN.md §2.2 / §2.4.
 */

export const SPORTS = {
  cornhole: {
    key: 'cornhole',
    displayName: 'Cornhole',
    emoji: '🌽',
    accent: { primary: '#3A6B35', secondary: '#D48B2D' },
    scoreModel: 'points', // numeric points — always show the scoreboard number
    outdoor: true, // weather is relevant — show weather card/badge
    // Document-head / chrome theming (browser tab + navbar).
    chrome: {
      navbar: '#4A3728',     // wood-brown rail (shared default)
      themeColor: '#4A3728', // <meta name="theme-color">
      favicon: '/favicon.svg',
    },
    // Nav/tab icon overrides. Cornhole keeps the default board SVG (omitted →
    // BottomNav/Navbar render their built-in cornhole-board icon).
    icons: {},
  },
  pool: {
    key: 'pool',
    displayName: 'Pool',
    emoji: '🎱',
    accent: { primary: '#1f5c3d', secondary: '#caa45a' },
    scoreModel: 'racks', // numeric only in race-to-N leagues; else win/loss
    outdoor: false, // indoor — hide weather card/badge
    chrome: {
      navbar: '#14342a',     // dark felt-green rail
      themeColor: '#14342a',
      favicon: '/favicon-pool.svg',
    },
    // Pool's Games tab swaps the cornhole board for the 🎱 emoji.
    icons: { games: '🎱' },
  },
};

export const DEFAULT_SPORT = 'cornhole';

// Display metadata for pool variants (used by GameCard/GameDetail badges, etc).
export const POOL_VARIANT_LABELS = {
  eight_ball:    { label: '8-Ball',        emoji: '🎱' },
  nine_ball:     { label: '9-Ball',        emoji: '9️⃣' },
  cutthroat:     { label: 'Cutthroat',     emoji: '🔪' },
  straight_pool: { label: 'Straight Pool', emoji: '🎯' },
};

/** Short human label for a game variant, or null if none/unknown. */
export function variantLabel(variant) {
  if (!variant) return null;
  const v = POOL_VARIANT_LABELS[variant];
  return v ? `${v.emoji} ${v.label}` : null;
}

// 8-ball early losses: the LOSER ended the game with a foul on the 8 — sinking
// it with their own balls still up, or scratching on it once only the 8 was
// left. Stored as games.eight_ball_end_condition.
export const EIGHT_BALL_END_CONDITIONS = [
  { key: 'sunk',    label: 'Loser sank the 8 early' },
  { key: 'scratch', label: 'Loser scratched on the 8' },
];

/**
 * One-line note for an early-loss game, e.g. "🎱 Andrew sank the 8 early · 3
 * balls left", or null for a normal finish. `loserName` is the losing side's
 * display name(s); `balls` is the loser's balls left on the table.
 */
export function earlyLossNote(condition, loserName, balls) {
  if (condition === 'scratch') return `🎱 ${loserName} scratched on the 8`;
  if (condition === 'sunk') {
    const left = balls > 0 ? ` · ${balls} ball${balls === 1 ? '' : 's'} left` : '';
    return `🎱 ${loserName} sank the 8 early${left}`;
  }
  return null;
}

export function getSport(key) {
  return SPORTS[key] || SPORTS[DEFAULT_SPORT];
}

/**
 * Apply a sport's accent to a DOM element's inline style (scoped override of the
 * shared CSS vars). Pass a ref/element when entering a league view; pass null to
 * read the default theme. Returns the style object for React inline use too.
 *
 *   const style = sportAccentStyle(league.sport);
 *   <div style={style}> ...league UI... </div>
 */
export function sportAccentStyle(sportKey) {
  const { accent } = getSport(sportKey);
  return {
    '--color-primary': accent.primary,
    '--color-secondary': accent.secondary,
  };
}
