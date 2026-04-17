import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV_LINKS = [
  { to: '/standings', label: 'Standings' },
  { to: '/games', label: 'Games' },
  { to: '/players', label: 'Players' },
  { to: '/teams', label: 'Teams' },
  { to: '/stats', label: 'Stats' },
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/odds', label: 'Odds' },
  { to: '/hall-of-fame', label: 'Hall of Fame' },
  { to: '/rules', label: 'Rules' },
  { to: '/trash-talk', label: 'Trash Talk 🍺' },
];

export default function Navbar() {
  const { user, allUsers, login, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogin = async (userId) => {
    await login(parseInt(userId));
    setDropdownOpen(false);
  };

  const handleRegister = () => {
    setDropdownOpen(false);
    navigate('/register');
  };

  return (
    <nav
      className="sticky top-0 z-50 shadow-md"
      style={{ backgroundColor: 'var(--color-navbar)' }}
    >
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <Link
          to="/"
          className="font-display text-2xl text-amber-100 tracking-wide hover:text-amber-200 transition-colors"
        >
          Cornhole249
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-ui font-600 transition-colors ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-amber-100/80 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          {!!user?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-ui font-600 transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-yellow-300/80 hover:text-yellow-300 hover:bg-white/10'
                }`
              }
            >
              ⚙️ Admin
            </NavLink>
          )}
        </div>

        {/* Auth section */}
        <div className="flex items-center gap-2">
          {/* Sign in dropdown — always visible */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-amber-100 text-sm font-ui font-semibold"
            >
              {user ? (
                <>
                  <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    className="w-6 h-6 rounded-full object-cover border border-amber-300/40"
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.display_name}`; }}
                  />
                  <span className="hidden sm:inline">{user.display_name}</span>
                  <span className="text-xs opacity-70">▾</span>
                </>
              ) : (
                <span>Sign in as... ▾</span>
              )}
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-card shadow-card border overflow-hidden z-50"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
              >
                <div className="p-2 border-b text-xs text-text-secondary font-ui font-semibold uppercase tracking-wider px-3"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  Sign in as
                </div>
                {allUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleLogin(u.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-ui hover:bg-amber-50 transition-colors text-left ${
                      user?.id === u.id ? 'bg-green-50 font-bold' : ''
                    }`}
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    <img
                      src={u.avatar_url}
                      alt={u.display_name}
                      className="w-7 h-7 rounded-full border"
                      style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.display_name}`; }}
                    />
                    <div>
                      <div>{u.display_name}</div>
                      <div className="text-xs opacity-60">"{u.nickname}"</div>
                    </div>
                    {u.is_admin ? <span className="ml-auto text-yellow-500 text-xs">★ Admin</span> : null}
                    {user?.id === u.id ? <span className="ml-auto text-green-600 text-xs">✓</span> : null}
                  </button>
                ))}
                <div className="border-t p-2" style={{ borderColor: 'var(--color-border)' }}>
                  {!user && (
                    <button
                      onClick={handleRegister}
                      className="w-full text-center text-sm font-ui font-semibold py-1.5 rounded-full transition-colors hover:bg-amber-50"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      + Join with code...
                    </button>
                  )}
                  {user && (
                    <button
                      onClick={() => { logout(); setDropdownOpen(false); }}
                      className="w-full text-center text-sm font-ui font-semibold text-red-600 hover:bg-red-50 py-1.5 rounded-full transition-colors"
                    >
                      Sign out
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Hamburger */}
          <button
            className="lg:hidden text-amber-100 hover:text-white p-1"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex flex-col pt-14"
          style={{ backgroundColor: 'var(--color-navbar)' }}
        >
          <div className="flex flex-col p-4 gap-1 overflow-y-auto">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-4 py-3 rounded-xl text-lg font-ui font-semibold transition-colors ${
                    isActive ? 'bg-white/20 text-white' : 'text-amber-100/80 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            {!!user?.is_admin && (
              <NavLink
                to="/admin"
                onClick={() => setMenuOpen(false)}
                className="px-4 py-3 rounded-xl text-lg font-ui font-semibold text-yellow-300 hover:bg-white/10"
              >
                ⚙️ Admin
              </NavLink>
            )}
          </div>
          <button
            className="absolute top-4 right-4 text-amber-100"
            onClick={() => setMenuOpen(false)}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Close dropdown on outside click */}
      {dropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
      )}
    </nav>
  );
}
