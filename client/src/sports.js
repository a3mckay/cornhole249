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
    // Document-head / chrome theming (browser tab + navbar).
    chrome: {
      navbar: '#4A3728',     // wood-brown rail (shared default)
      themeColor: '#4A3728', // <meta name="theme-color">
      favicon: '/favicon.svg',
    },
  },
  pool: {
    key: 'pool',
    displayName: 'Pool',
    emoji: '🎱',
    accent: { primary: '#1f5c3d', secondary: '#caa45a' },
    chrome: {
      navbar: '#14342a',     // dark felt-green rail
      themeColor: '#14342a',
      favicon: '/favicon-pool.svg',
    },
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
