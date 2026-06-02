import { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, useParams, Link } from 'react-router-dom';
import { setCurrentLeague, leaguesApi } from '../api';

const LeagueContext = createContext({ slug: 'cornhole249', leagueId: 1, plan: 'free' });

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
  // Cornhole249 is always id=1; other leagues are fetched on first render.
  const [leagueId, setLeagueId] = useState(slug === 'cornhole249' ? 1 : null);
  const [plan, setPlan] = useState('free');
  const [expiresAt, setExpiresAt] = useState(null);

  useEffect(() => {
    setCurrentLeague(slug);
    if (slug === 'cornhole249') {
      setLeagueId(1);
      setPlan('pro'); // Cornhole249 is always Pro (per migration 004)
      setExpiresAt(null);
    } else {
      leaguesApi.get(slug)
        .then((league) => {
          setLeagueId(league?.id ?? null);
          setPlan(league?.plan_override || league?.plan || 'free');
          setExpiresAt(league?.expires_at ?? null);
        })
        .catch(() => { setLeagueId(null); setPlan('free'); setExpiresAt(null); });
    }
  }, [slug]);

  // Weekend pass expiry banner (shown when ≤ 3 days remaining)
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const msRemaining = expiresDate ? expiresDate - Date.now() : null;
  const daysRemaining = msRemaining !== null ? Math.ceil(msRemaining / (1000 * 60 * 60 * 24)) : null;
  const showBanner = plan === 'weekend_pass' && !bannerDismissed && daysRemaining !== null && daysRemaining <= 3;
  const passExpired = daysRemaining !== null && daysRemaining <= 0;

  return (
    <LeagueContext.Provider value={{ slug, leagueId, plan, expiresAt }}>
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
