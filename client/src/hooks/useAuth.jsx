import { useState, useEffect, createContext, useContext } from 'react';
import { authApi, usersApi, leaguesApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // authApi.me() + leaguesApi.mine() run in parallel — both needed for initial render.
    // usersApi.list() is large and only needed by specific pages; load it in the
    // background so it never delays setLoading(false).
    Promise.all([
      authApi.me().catch(() => null),
      leaguesApi.mine().catch(() => []),
    ]).then(([me, myLeagues]) => {
      setUser(me);
      setLeagues(me ? myLeagues : []);
    }).finally(() => setLoading(false));

    usersApi.list().catch(() => []).then(setAllUsers);
  }, []);

  const login = async (email, password) => {
    const u = await authApi.login(email, password);
    setUser(u);
    leaguesApi.mine().catch(() => []).then(setLeagues);
    usersApi.list().catch(() => []).then(setAllUsers);
    return u;
  };

  const logout = async () => {
    await authApi.logout();
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
    usersApi.list().catch(() => []).then(setAllUsers);
    return me;
  };

  return (
    <AuthContext.Provider value={{ user, allUsers, leagues, loading, login, logout, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
