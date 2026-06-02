import { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
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

  useEffect(() => {
    setCurrentLeague(slug);
    if (slug === 'cornhole249') {
      setLeagueId(1);
      setPlan('pro'); // Cornhole249 is always Pro (per migration 004)
    } else {
      leaguesApi.get(slug)
        .then((league) => {
          setLeagueId(league?.id ?? null);
          setPlan(league?.plan_override || league?.plan || 'free');
        })
        .catch(() => { setLeagueId(null); setPlan('free'); });
    }
  }, [slug]);

  return (
    <LeagueContext.Provider value={{ slug, leagueId, plan }}>
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
