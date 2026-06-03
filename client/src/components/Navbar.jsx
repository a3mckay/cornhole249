import React, { useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../api';
import { leaguePath } from '../contexts/LeagueContext';
import { QRCodeSVG } from 'qrcode.react';

function ProLock() {
  return <span title="Pro feature" style={{ fontSize: '0.65em', opacity: 0.7 }}>🔒</span>;
}

function makeNavLinks(slug) {
  const p = (sub) => leaguePath(slug, sub);
  return [
    { to: p('games'),        label: 'Games',              key: 'games' },
    { to: p('standings'),    label: 'Standings',           key: 'standings' },
    { to: p('stats'),        label: 'Stats',               key: 'stats' },
    { to: p('trash-talk'),   label: 'Trash Talk 🍺',       key: 'trash-talk', short: 'Trash 🍺' },
    { to: p('tournaments'),  label: 'Tournaments',         key: 'tournaments' },
    { to: p('players'),      label: 'Players',             key: 'players' },
    { to: p('teams'),        label: 'Teams',               key: 'teams' },
    { to: p('hall-of-fame'), label: 'Hall of Fame',        key: 'hall-of-fame', short: 'HoF' },
    { to: p('odds'),         label: 'Odds',                key: 'odds' },
    { to: p('rules'),        label: 'Rules',               key: 'rules' },
  ];
}

function makeHamburgerLinks(slug) {
  const home = slug === 'cornhole249' ? '/' : `/l/${slug}`;
  const p = (sub) => leaguePath(slug, sub);
  return [
    { to: home,              label: '🏠 Home',             key: 'home' },
    { to: p('tournaments'),  label: 'Tournaments',         key: 'tournaments' },
    { to: p('players'),      label: 'Players',             key: 'players' },
    { to: p('teams'),        label: 'Teams',               key: 'teams' },
    { to: p('hall-of-fame'), label: 'Hall of Fame',        key: 'hall-of-fame' },
    { to: p('odds'),         label: 'Odds',                key: 'odds' },
    { to: p('rules'),        label: 'Rules',               key: 'rules' },
  ];
}

export default function Navbar() {
  const { user, leagues, logout, loading } = useAuth();
  const location = useLocation();
  // Derive current slug from the URL — more reliable than LeagueContext since
  // Navbar renders outside the LeagueProvider layout route.
  const currentSlug = location.pathname.match(/^\/l\/([^/]+)/)?.[1] ?? 'cornhole249';
  // Derive the effective plan from the server-fetched leagues list (plan_override takes precedence).
  const currentLeague = leagues?.find((l) => l.slug === currentSlug);
  const effectivePlan = currentLeague?.plan_override || currentLeague?.plan || 'free';
  const isFree = effectivePlan === 'free';
  const myLeagueRole = currentLeague?.role;
  const canManageCurrentLeague = myLeagueRole === 'owner' || myLeagueRole === 'admin';
  const navigate = useNavigate();
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [shareOpen,    setShareOpen]    = useState(false);
  const [copied,       setCopied]       = useState(false);

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const NAV_LINKS = makeNavLinks(currentSlug);
  const HAMBURGER_LINKS = makeHamburgerLinks(currentSlug);
  const leagueHome = (slug) => slug === 'cornhole249' ? '/' : `/l/${slug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(siteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogout = async () => {
    await logout();
    setDropdownOpen(false);
    navigate('/login');
  };

  return (
    <nav className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: 'var(--color-navbar)' }}>
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-3">

        {/* Logo */}
        <Link to="/" className="font-display text-2xl text-amber-100 tracking-wide hover:text-amber-200 transition-colors flex-shrink-0">
          Cornhole249
        </Link>

        {/* Share button — next to logo, mobile only */}
        <div className="relative flex-shrink-0 lg:hidden">
          <button
            onClick={() => { setShareOpen((o) => !o); setCopied(false); }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-ui font-semibold transition-colors"
            style={{ background: 'rgba(58,107,53,0.55)', color: 'white', border: '1px solid rgba(58,107,53,0.9)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span className="hidden sm:inline">Share</span>
          </button>

          {shareOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />
              <div className="absolute left-0 top-10 z-50 rounded-2xl shadow-xl p-4 w-52 text-center"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="font-display text-base mb-2" style={{ color: 'var(--color-text-primary)' }}>Share Cornhole249</div>
                <div className="flex justify-center mb-3">
                  <div className="p-2 bg-white rounded-xl inline-block">
                    <QRCodeSVG value={siteUrl} size={110} bgColor="#FFFFFF" fgColor="#2C2416" />
                  </div>
                </div>
                <div className="text-xs font-ui mb-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>{siteUrl}</div>
                <button onClick={handleCopyLink} className="btn btn-secondary text-sm w-full">
                  {copied ? '✓ Copied!' : '📋 Copy Link'}
                </button>
              </div>
            </>
          )}
        </div>


        {/* Desktop nav links */}
        <div className="hidden lg:flex items-center gap-1 flex-1 overflow-hidden">
          {NAV_LINKS.map((l) => {
            const gated = isFree && (l.key === 'stats' || l.key === 'tournaments');
            return (
              <NavLink
                key={l.key}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full text-sm font-ui font-600 transition-colors flex-shrink-0 flex items-center gap-1 ${
                    isActive ? 'bg-white/20 text-white' : 'text-amber-100/80 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                {l.short ? (
                  <>
                    <span className="hidden xl:inline">{l.label}</span>
                    <span className="xl:hidden">{l.short}</span>
                  </>
                ) : l.label}
                {gated && <ProLock />}
              </NavLink>
            );
          })}
          {!!user?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-ui font-600 transition-colors flex-shrink-0 ${
                  isActive ? 'bg-white/20 text-white' : 'text-yellow-300/80 hover:text-yellow-300 hover:bg-white/10'
                }`
              }
            >
              <span className="hidden xl:inline">⚙️ Admin</span>
              <span className="xl:hidden">⚙️</span>
            </NavLink>
          )}
        </div>

        {/* Spacer on mobile */}
        <div className="flex-1 lg:hidden" />

        {/* Auth area */}
        <div className="relative flex-shrink-0">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          ) : user ? (
            <>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-amber-100 text-sm font-ui font-semibold"
              >
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="w-6 h-6 rounded-full object-cover border border-amber-300/40"
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.display_name}`; }}
                />
                <span className="hidden sm:inline">{user.display_name}</span>
                <span className="text-xs opacity-70">▾</span>
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 rounded-card shadow-card border overflow-hidden z-50"
                    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                    {/* User info header */}
                    <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {user.display_name}
                      </div>
                      {user.email && (
                        <div className="text-xs font-ui truncate" style={{ color: 'var(--color-text-secondary)' }}>
                          {user.email}
                          {!user.email_verified_at && (
                            <span className="ml-1 text-amber-600">(unverified)</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="py-1">
                      {canManageCurrentLeague && (
                        <button
                          onClick={() => { navigate(leaguePath(currentSlug, 'settings')); setDropdownOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm font-ui hover:bg-amber-50 transition-colors"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          ⚙️ League Settings
                        </button>
                      )}
                      <button
                        onClick={() => { navigate('/leagues/new'); setDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm font-ui hover:bg-amber-50 transition-colors"
                        style={{ color: 'var(--color-text-primary)' }}
                      >
                        🏟 Create a league
                      </button>
                      {user.needs_migration && (
                        <button
                          onClick={() => { navigate('/claim-account'); setDropdownOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm font-ui hover:bg-blue-50 transition-colors"
                          style={{ color: '#1E40AF' }}
                        >
                          🔑 Upgrade your login
                        </button>
                      )}
                    </div>

                    <div className="border-t py-1" style={{ borderColor: 'var(--color-border)' }}>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 text-sm font-ui text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-full text-sm font-ui font-semibold text-amber-100 hover:text-white hover:bg-white/10 transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>

        {/* Hamburger — mobile only */}
        <button className="lg:hidden text-amber-100 hover:text-white p-1 flex-shrink-0" onClick={() => setMenuOpen((o) => !o)}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile hamburger menu */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col pt-14" style={{ backgroundColor: 'var(--color-navbar)' }}>
          <div className="flex flex-col p-4 gap-1 overflow-y-auto pb-24">
            {HAMBURGER_LINKS.map((l) => {
              const gated = isFree && (l.key === 'tournaments');
              return (
                <NavLink key={l.key} to={l.to} onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `px-4 py-3 rounded-xl text-lg font-ui font-semibold transition-colors flex items-center gap-2 ${
                      isActive ? 'bg-white/20 text-white' : 'text-amber-100/80 hover:bg-white/10 hover:text-white'
                    }`
                  }>
                  {l.label}
                  {gated && <ProLock />}
                </NavLink>
              );
            })}
            {!!user?.is_admin && (
              <NavLink to="/admin" onClick={() => setMenuOpen(false)}
                className="px-4 py-3 rounded-xl text-lg font-ui font-semibold text-yellow-300 hover:bg-white/10">
                ⚙️ Admin
              </NavLink>
            )}

            {/* League switcher — mobile (only shown when user has multiple leagues) */}
            {user && leagues.length > 1 && (
              <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <div className="px-4 py-1 text-xs font-ui font-semibold uppercase tracking-wider text-amber-200/60">My Leagues</div>
                {leagues.map((l) => (
                  <button key={l.id}
                    onClick={() => { navigate(leagueHome(l.slug)); setMenuOpen(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-ui text-left transition-colors ${l.slug === currentSlug ? 'bg-white/20 text-white font-bold' : 'text-amber-100/80 hover:bg-white/10 hover:text-white'}`}>
                    <span className="flex-1">{l.name}</span>
                    <span className="text-xs opacity-50 capitalize">{l.role}</span>
                  </button>
                ))}
                {canManageCurrentLeague && (
                  <button
                    onClick={() => { navigate(leaguePath(currentSlug, 'settings')); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-ui text-amber-100/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    ⚙️ League Settings
                  </button>
                )}
                <button onClick={() => { navigate('/leagues/new'); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-ui text-amber-300 hover:bg-white/10 transition-colors">
                  + Create new league
                </button>
              </div>
            )}

            {/* Auth in hamburger */}
            <div className="border-t mt-2 pt-2" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              {user ? (
                <button onClick={() => { handleLogout(); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 rounded-xl text-base font-ui font-semibold text-red-300 hover:bg-white/10 transition-colors">
                  Sign out
                </button>
              ) : (
                <>
                  <NavLink to="/login" onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 rounded-xl text-base font-ui font-semibold text-amber-100/80 hover:text-white hover:bg-white/10 transition-colors">
                    Sign In
                  </NavLink>
                  <NavLink to="/register" onClick={() => setMenuOpen(false)}
                    className="block px-4 py-3 rounded-xl text-base font-ui font-semibold text-amber-300 hover:bg-white/10 transition-colors">
                    Create account
                  </NavLink>
                </>
              )}
            </div>
          </div>
          <button className="absolute top-4 right-4 text-amber-100" onClick={() => setMenuOpen(false)}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </nav>
  );
}
