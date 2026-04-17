import { useState, useEffect, createContext, useContext } from 'react';
import { authApi, usersApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([authApi.me(), usersApi.list()])
      .then(([me, users]) => {
        setUser(me);
        setAllUsers(users);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (userId) => {
    const u = await authApi.login(userId);
    setUser(u);
    return u;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    const [me, users] = await Promise.all([authApi.me(), usersApi.list()]);
    setUser(me);
    setAllUsers(users);
    return me;
  };

  return (
    <AuthContext.Provider value={{ user, allUsers, loading, login, logout, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
