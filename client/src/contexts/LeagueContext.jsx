import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Outlet, useParams, Link } from 'react-router-dom';
import { setCurrentLeague, leaguesApi } from '../api';
import { useAuth } from '../hooks/useAuth';

// Default custom rules (Hamilton-equivalent)
export const DEFAULT_CUSTOM_RULES = {
  target_score: 21,
  win_by: 1,
  cancellation: true,
  hole_points: 3,
  board_points: 1,
  first_throw: 'random',
  bag_color: 'captains_pick',
  tiebreaker: 'tie_stands',
};

const LeagueContext = createContext({ slug: 'cornhole249', leagueId: 1, plan: 'free', userPendingRequest: false, leagueRules: 'hamilton', customRules: null, theme: null });

/**
 * React Router v6 layout route component.
 *
 * Usage 1 (Cornhole249 root — slug is a prop):
 *   <Route element={<LeagueProvider slug="cornhole249" />}>
 *     ...child routes...
 *   </Route>
 *
 * Usage 2 (other leagues — slug comes from :slug URL param):
 *   <Route path="/l/:slug" element={<LeagueProvider />}>
 *     ...child routes...
 *   </Route>
 *
 * Exposes: { slug, leagueId, plan } via useLeague()
 */
export function LeagueProvider({ slug: slugProp }) {
  const params = useParams();
  const slug = slugProp ?? params.slug ?? 'cornhole249';
  const { leagues } = useAuth();

  // Set synchronously so child components use the correct slug on their first render.
  // useEffect runs after children mount, so any API calls in children would use a stale slug.
  setCurrentLeague(slug);

  // Cornhole249 is always id=1; other leagues are fetched on first render.
  const [leagueId, setLeagueId] = useState(slug === 'cornhole249' ? 1 : null);
  const [plan, setPlan] = useState(slug === 'cornhole249' ? 'pro' : 'free');
  const [expiresAt, setExpiresAt] = useState(null);
  const [graceEndsAt, setGraceEndsAt] = useState(null);
  const [leagueName, setLeagueName] = useState(slug === 'cornhole249' ? 'Cornhole249' : null);
  const [tagline, setTagline] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const [userPendingRequest, setUserPendingRequest] = useState(false);
  const [leagueRules, setLeagueRules] = useState('hamilton');
  const [customRules, setCustomRules] = useState(null);
  const [theme, setTheme] = useState(null);

  // Track which CSS variable overrides we've applied so we can clean them up on unmount / slug change
  const appliedThemeRef = useRef(null);

  useEffect(() => {
    leaguesApi.get(slug)
      .then((league) => {
        setLeagueName(league?.name ?? slug);
        setTagline(league?.tagline ?? null);
        setCreatedAt(league?.created_at ?? null);
        setUserPendingRequest(league?.user_pending_request ?? false);
        setLeagueRules(league?.rules || 'hamilton');
        setCustomRules(league?.custom_rules_json || null);
        setTheme(league?.theme_json || null);
        if (slug !== 'cornhole249') {
          setLeagueId(league?.id ?? null);
          setPlan(league?.plan_override || league?.plan || 'free');
          setExpiresAt(league?.expires_at ?? null);
          setGraceEndsAt(league?.grace_period_ends_at ?? null);
        }
      })
      .catch(() => {
        if (slug !== 'cornhole249') {
          setLeagueId(null); setPlan('free'); setExpiresAt(null); setGraceEndsAt(null);
        }
        setLeagueRules('hamilton');
        setCustomRules(null);
        setTheme(null);
      });
  }, [slug]);

  // Apply / remove CSS variable overrides from theme_json
  useEffect(() => {
    const root = document.documentElement;

    // Clear any previously applied overrides
    if (appliedThemeRef.current) {
      for (const prop of appliedThemeRef.current) {
        root.style.removeProperty(prop);
      }
      appliedThemeRef.current = null;
    }

    if (!theme) return;

    const applied = [];
    if (theme.primary_color) {
      root.style.setProperty('--color-primary', theme.primary_color);
      applied.push('--color-primary');
    }
    if (theme.accent_color) {
      root.style.setProperty('--color-secondary', theme.accent_color);
      applied.push('--color-secondary');
    }
    appliedThemeRef.current = applied.length ? applied : null;

    // Cleanup on unmount or theme/slug change
    return () => {
      for (const prop of applied) {
        root.style.removeProperty(prop);
      }
      appliedThemeRef.current = null;
    };
  }, [theme]);

  // Current user's frozen status in this league (from useAuth's /leagues/mine data)
  const myMembership = leagues?.find((l) => l.slug === slug);
  const isFrozen = !!myMembership?.frozen_at;

  // Weekend pass expiry banner (shown when ≤ 3 days remaining)
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const msRemaining = expiresDate ? expiresDate - Date.now() : null;
  const daysRemaining = msRemaining !== null ? Math.ceil(msRemaining / (1000 * 60 * 60 * 24)) : null;
  const showBanner = plan === 'weekend_pass' && !bannerDismissed && daysRemaining !== null && daysRemaining <= 3;
  const passExpired = daysRemaining !== null && daysRemaining <= 0;

  return (
    <LeagueContext.Provider value={{ slug, leagueId, plan, expiresAt, graceEndsAt, leagueName, tagline, createdAt, userPendingRequest, leagueRules, customRules, theme }}>
      {isFrozen && (
        <div
          className="px-4 py-2.5 text-sm font-ui flex items-center gap-3"
          style={{ background: '#FEE2E2', borderBottom: '1px solid #FECACA', color: '#991B1B' }}
        >
          <span>🔒</span>
          <span>
            Your access to <strong>{leagueName}</strong> is limited. Ask the league owner to re-upgrade to Pro to restore full access.
          </span>
        </div>
      )}
      {showBanner && (
        <div
          className="px-4 py-2.5 text-sm font-ui flex items-center justify-between gap-4"
          style={{
            background: passExpired ? '#FEE2E2' : '#FEF3C7',
            borderBottom: `1px solid ${passExpired ? '#FECACA' : '#FDE68A'}`,
            color: passExpired ? '#991B1B' : '#92400E',
          }}
        >
          <span>
            ⏳{' '}
            {passExpired
              ? 'Your Weekend Pass has expired — Pro features are locked.'
              : daysRemaining === 1
              ? 'Your Weekend Pass expires tomorrow.'
              : `Your Weekend Pass expires in ${daysRemaining} days.`}
            {' '}
            <Link to={leaguePath(slug, 'settings')} className="underline font-semibold">
              {passExpired ? 'Renew now →' : 'Renew or upgrade →'}
            </Link>
          </span>
          <button onClick={() => setBannerDismissed(true)} className="opacity-60 hover:opacity-100 flex-shrink-0">✕</button>
        </div>
      )}
      <Outlet />
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}

/**
 * Returns a path relative to the correct league root.
 * Cornhole249 uses root-level paths; other leagues are under /l/:slug/.
 *
 * leaguePath('cornhole249', 'standings') → '/standings'
 * leaguePath('bachparty',   'standings') → '/l/bachparty/standings'
 */
export function leaguePath(slug, subpath = 'standings') {
  const sub = subpath.startsWith('/') ? subpath.slice(1) : subpath;
  return slug === 'cornhole249' ? `/${sub}` : `/l/${slug}/${sub}`;
}
