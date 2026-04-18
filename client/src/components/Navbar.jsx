import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../api';
import { QRCodeSVG } from 'qrcode.react';

// Desktop nav order
const NAV_LINKS = [
  { to: '/games',       label: 'Games' },
  { to: '/standings',   label: 'Standings' },
  { to: '/stats',       label: 'Stats' },
  { to: '/trash-talk',  label: 'Trash Talk 🍺', short: 'Trash 🍺' },
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/players',     label: 'Players' },
  { to: '/teams',       label: 'Teams' },
  { to: '/hall-of-fame',label: 'Hall of Fame', short: 'HoF' },
  { to: '/odds',        label: 'Odds' },
  { to: '/rules',       label: 'Rules' },
];

// Mobile hamburger — secondary items (primary 4 are in BottomNav)
const HAMBURGER_LINKS = [
  { to: '/',            label: '🏠 Home' },
  { to: '/tournaments', label: 'Tournaments' },
  { to: '/players',     label: 'Players' },
  { to: '/teams',       label: 'Teams' },
  { to: '/hall-of-fame',label: 'Hall of Fame' },
  { to: '/odds',        label: 'Odds' },
  { to: '/rules',       label: 'Rules' },
];

export default function Navbar() {
  const { user, allUsers, login, logout, refreshUser, loading } = useAuth();
  const navigate = useNavigate();
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [shareOpen,     setShareOpen]     = useState(false);
  const [copied,        setCopied]        = useState(false);

  // PIN prompt
  const [pinPrompt,   setPinPrompt]   = useState(null);
  const [pinValue,    setPinValue]    = useState('');
  const [pinError,    setPinError]    = useState('');
  const [pinLoading,  setPinLoading]  = useState(false);

  // Set/change PIN
  const [showSetPin,     setShowSetPin]     = useState(false);
  const [newPin,         setNewPin]         = useState('');
  const [newPinConfirm,  setNewPinConfirm]  = useState('');
  const [pinChangeError, setPinChangeError] = useState('');
  const [setPinSuccess,  setSetPinSuccess]  = useState(false);

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(siteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogin = async (u) => {
    if (user?.id === u.id) { setDropdownOpen(false); return; }
    if (u.has_pin) {
      setPinPrompt({ userId: u.id, name: u.display_name });
      setPinValue(''); setPinError('');
      setDropdownOpen(false);
    } else {
      await login(u.id);
      setDropdownOpen(false);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinLoading(true); setPinError('');
    try {
      await login(pinPrompt.userId, pinValue);
      setPinPrompt(null);
    } catch (err) {
      const code = err.response?.data?.error;
      setPinError(code === 'pin_required' ? 'PIN required' : code || 'Incorrect PIN');
    } finally {
      setPinLoading(false);
    }
  };

  const handleSetPin = async (e) => {
    e.preventDefault();
    setPinChangeError('');
    if (!/^\d{4}$/.test(newPin)) { setPinChangeError('PIN must be exactly 4 digits'); return; }
    if (newPin !== newPinConfirm) { setPinChangeError('PINs do not match'); return; }
    try {
      await authApi.setPin(newPin);
      await refreshUser();
      setSetPinSuccess(true);
      setNewPin(''); setNewPinConfirm('');
      setTimeout(() => { setShowSetPin(false); setSetPinSuccess(false); }, 1500);
    } catch (err) {
      setPinChangeError(err.response?.data?.error || 'Failed to set PIN');
    }
  };

  const handleRegister = () => {
    setDropdownOpen(false);
    navigate('/register');
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
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-ui font-600 transition-colors flex-shrink-0 ${
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
            </NavLink>
          ))}
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

        {/* Auth dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-amber-100 text-sm font-ui font-semibold"
          >
            {user ? (
              <>
                <img src={user.avatar_url} alt={user.display_name}
                  className="w-6 h-6 rounded-full object-cover border border-amber-300/40"
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.display_name}`; }} />
                <span className="hidden sm:inline">{user.display_name}</span>
                <span className="text-xs opacity-70">▾</span>
              </>
            ) : (
              <span>Accounts ▾</span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-card shadow-card border overflow-hidden z-50"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="p-2 border-b text-xs font-ui font-semibold uppercase tracking-wider px-3"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                Sign in as
              </div>
              {allUsers.map((u) => (
                <button key={u.id} onClick={() => handleLogin(u)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-ui hover:bg-amber-50 transition-colors text-left ${user?.id === u.id ? 'bg-green-50 font-bold' : ''}`}
                  style={{ color: 'var(--color-text-primary)' }}>
                  <img src={u.avatar_url} alt={u.display_name} className="w-7 h-7 rounded-full border"
                    style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.display_name}`; }} />
                  <div>
                    <div>{u.display_name}</div>
                    <div className="text-xs opacity-60">"{u.nickname}"</div>
                  </div>
                  {u.has_pin  && <span className="ml-auto text-xs opacity-40">🔒</span>}
                  {u.is_admin && <span className="ml-auto text-yellow-500 text-xs">★ Admin</span>}
                  {user?.id === u.id && <span className="ml-auto text-green-600 text-xs">✓</span>}
                </button>
              ))}
              <div className="border-t p-2" style={{ borderColor: 'var(--color-border)' }}>
                {!user && (
                  <button onClick={handleRegister}
                    className="w-full text-center text-sm font-ui font-semibold py-1.5 rounded-full transition-colors hover:bg-amber-50"
                    style={{ color: 'var(--color-primary)' }}>
                    + Join with code...
                  </button>
                )}
                {user && (
                  <>
                    <button
                      onClick={() => { setShowSetPin(true); setDropdownOpen(false); setPinChangeError(''); setSetPinSuccess(false); setNewPin(''); setNewPinConfirm(''); }}
                      className="w-full text-center text-sm font-ui font-semibold py-1.5 rounded-full transition-colors hover:bg-amber-50"
                      style={{ color: 'var(--color-text-secondary)' }}>
                      🔒 {allUsers.find(u => u.id === user.id)?.has_pin ? 'Change PIN' : 'Set PIN'}
                    </button>
                    <button onClick={() => { logout(); setDropdownOpen(false); }}
                      className="w-full text-center text-sm font-ui font-semibold text-red-600 hover:bg-red-50 py-1.5 rounded-full transition-colors">
                      Sign out
                    </button>
                  </>
                )}
              </div>
            </div>
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

      {/* Mobile hamburger menu — secondary items */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col pt-14" style={{ backgroundColor: 'var(--color-navbar)' }}>
          <div className="flex flex-col p-4 gap-1 overflow-y-auto pb-24">
            {HAMBURGER_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `px-4 py-3 rounded-xl text-lg font-ui font-semibold transition-colors ${
                    isActive ? 'bg-white/20 text-white' : 'text-amber-100/80 hover:bg-white/10 hover:text-white'
                  }`
                }>
                {l.label}
              </NavLink>
            ))}
            {!!user?.is_admin && (
              <NavLink to="/admin" onClick={() => setMenuOpen(false)}
                className="px-4 py-3 rounded-xl text-lg font-ui font-semibold text-yellow-300 hover:bg-white/10">
                ⚙️ Admin
              </NavLink>
            )}
          </div>
          <button className="absolute top-4 right-4 text-amber-100" onClick={() => setMenuOpen(false)}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Close dropdown on outside click */}
      {dropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />}

      {/* PIN prompt modal */}
      {pinPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl shadow-xl p-6 w-72" style={{ background: 'var(--color-surface)' }}>
            <h2 className="font-display text-xl mb-1" style={{ color: 'var(--color-text-primary)' }}>Enter PIN</h2>
            <p className="text-sm font-ui mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              Signing in as <strong>{pinPrompt.name}</strong>
            </p>
            <form onSubmit={handlePinSubmit} className="flex flex-col gap-3">
              <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-full px-3 py-2 rounded-xl border font-ui text-center text-2xl tracking-widest"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                autoFocus />
              {pinError && <p className="text-xs font-ui text-center" style={{ color: 'var(--color-danger)' }}>{pinError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setPinPrompt(null)}
                  className="flex-1 py-2 rounded-xl font-ui text-sm border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
                <button type="submit" disabled={pinValue.length !== 4 || pinLoading}
                  className="flex-1 py-2 rounded-xl font-ui text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--color-primary)' }}>
                  {pinLoading ? '...' : 'Sign in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set/Change PIN modal */}
      {showSetPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl shadow-xl p-6 w-72" style={{ background: 'var(--color-surface)' }}>
            <h2 className="font-display text-xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
              {allUsers.find(u => u.id === user?.id)?.has_pin ? 'Change PIN' : 'Set PIN'}
            </h2>
            <p className="text-sm font-ui mb-4" style={{ color: 'var(--color-text-secondary)' }}>Choose a 4-digit PIN to secure your account.</p>
            {setPinSuccess ? (
              <p className="text-center font-ui font-semibold py-2" style={{ color: 'var(--color-primary)' }}>✓ PIN saved!</p>
            ) : (
              <form onSubmit={handleSetPin} className="flex flex-col gap-3">
                <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="New PIN"
                  className="w-full px-3 py-2 rounded-xl border font-ui text-center text-2xl tracking-widest"
                  style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  autoFocus />
                <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                  value={newPinConfirm}
                  onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Confirm PIN"
                  className="w-full px-3 py-2 rounded-xl border font-ui text-center text-2xl tracking-widest"
                  style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
                {pinChangeError && <p className="text-xs font-ui text-center" style={{ color: 'var(--color-danger)' }}>{pinChangeError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowSetPin(false)}
                    className="flex-1 py-2 rounded-xl font-ui text-sm border"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
                  <button type="submit" disabled={newPin.length !== 4 || newPinConfirm.length !== 4}
                    className="flex-1 py-2 rounded-xl font-ui text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--color-primary)' }}>Save PIN</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
