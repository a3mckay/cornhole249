import { createContext, useContext, useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { setCurrentLeague } from '../api';

const LeagueContext = createContext({ slug: 'cornhole249' });

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
 */
export function LeagueProvider({ slug: slugProp }) {
  const params = useParams();
  const slug = slugProp ?? params.slug ?? 'cornhole249';

  useEffect(() => {
    setCurrentLeague(slug);
  }, [slug]);

  return (
    <LeagueContext.Provider value={{ slug }}>
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
