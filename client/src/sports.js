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
  },
  pool: {
    key: 'pool',
    displayName: 'Pool',
    emoji: '🎱',
    accent: { primary: '#1f5c3d', secondary: '#caa45a' },
  },
};

export const DEFAULT_SPORT = 'cornhole';

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
