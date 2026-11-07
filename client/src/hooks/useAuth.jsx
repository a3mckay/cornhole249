import { useState, useEffect, createContext, useContext } from 'react';
import { authApi, leaguesApi, clearRosterCache, setRosterOwner } from '../api';
import { identify, reset } from '../lib/analytics';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // authApi.me() + leaguesApi.mine() run in parallel — both needed for initial render.
    // (League rosters are NOT fetched here: pages load the roster for the league
    // they're actually showing, via the cached usersApi.list().)
    Promise.all([
      authApi.me().catch(() => null),
      leaguesApi.mine().catch(() => []),
    ]).then(([me, myLeagues]) => {
      setUser(me);
      // Only on a confirmed account: a failed /me (flaky network) must not wipe the cache.
      if (me) setRosterOwner(me.id);
      setLeagues(me ? myLeagues : []);
      if (me) identify(me.id);
    }).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const u = await authApi.login(email, password);
    setRosterOwner(u.id); // never show a previous account's cached rosters
    setUser(u);
    identify(u.id);
    leaguesApi.mine().catch(() => []).then(setLeagues);
    return u;
  };

  const logout = async () => {
    await authApi.logout();
    clearRosterCache();
    reset();
    setUser(null);
    setLeagues([]);
  };

  const refreshUser = async () => {
    const [me, myLeagues] = await Promise.all([
      authApi.me().catch(() => null),
      leaguesApi.mine().catch(() => []),
    ]);
    setUser(me);
    setLeagues(me ? myLeagues : []);
    return me;
  };

  // Re-pull just the league list (e.g. someone else added you to a league since
  // the app loaded). A failed request keeps the current list.
  const refreshLeagues = async () => {
    const myLeagues = await leaguesApi.mine();
    setLeagues(myLeagues);
    return myLeagues;
  };

  return (
    <AuthContext.Provider value={{ user, leagues, loading, login, logout, setUser, refreshUser, refreshLeagues }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
