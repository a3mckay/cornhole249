import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi, usersApi } from '../api';
import { useAuth } from '../hooks/useAuth';

/**
 * ClaimAccount — migration path for existing Cornhole249 players who have
 * a PIN but no email/password yet.
 *
 * Flow:
 *  1. Pick display name from the list of PIN-only users
 *  2. Enter current PIN to confirm identity
 *  3. Set new email + password
 */
export default function ClaimAccount() {
  const navigate = useNavigate();
  const { refreshUser, allUsers } = useAuth();

  // Filter to only users without email (legacy PIN-only users)
  // allUsers is the full list fetched by useAuth
  const legacyUsers = (allUsers || []).filter((u) => !u.email && !u.google_id);

  const [step, setStep] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePickUser = (user) => {
    setSelectedUser(user);
    setStep(2);
    setError('');
  };

  const handleGoogleClaim = async () => {
    if (!selectedUser) return;
    if (!pin) { setError('Enter your PIN first'); return; }

    setGoogleLoading(true);
    setError('');
    try {
      await authApi.claimVerifyPin(selectedUser.id, pin);
      // PIN verified — hand off to Google OAuth, which will link on callback
      window.location.href = '/auth/google';
    } catch (err) {
      setError(err.response?.data?.error || 'PIN verification failed');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!pin) { setError('PIN is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (!password) { setError('Password is required'); return; }
    if (password !== passwordConfirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    setError('');
    try {
      await authApi.claimAccount(selectedUser.id, pin, email.trim(), password);
      await refreshUser();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to claim account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="card p-8">
        <h1 className="font-display text-2xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Claim your account
        </h1>
        <p className="text-sm font-ui mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Existing Cornhole249 players: confirm your identity with your PIN, then link Google or set up email + password.
        </p>

        {step === 1 && (
          <>
            {legacyUsers.length === 0 ? (
              <p className="text-sm font-ui text-center" style={{ color: 'var(--color-text-secondary)' }}>
                All players have already upgraded their login.{' '}
                <Link to="/login" className="underline" style={{ color: 'var(--color-primary)' }}>Sign in →</Link>
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Select your name:
                </p>
                {legacyUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handlePickUser(u)}
                    className="flex items-center gap-3 p-3 rounded-xl border text-left transition-colors hover:bg-amber-50"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {u.avatar_url && (
                      <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                    )}
                    <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {u.display_name}
                    </span>
                    <span className="ml-auto text-lg opacity-40">→</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 2 && selectedUser && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(58,107,53,0.07)' }}>
              {selectedUser.avatar_url && (
                <img src={selectedUser.avatar_url} alt="" className="w-8 h-8 rounded-full" />
              )}
              <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {selectedUser.display_name}
              </span>
              <button
                type="button"
                onClick={() => { setStep(1); setError(''); setPin(''); }}
                className="ml-auto text-xs underline"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Change
              </button>
            </div>

            <div>
              <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Current PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit PIN"
                maxLength={4}
                autoFocus
                className="w-full px-3 py-2 rounded-xl border font-ui text-center text-xl tracking-widest"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>

            {/* Google option */}
            <button
              type="button"
              onClick={handleGoogleClaim}
              disabled={googleLoading || pin.length !== 4}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl border font-ui text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              {googleLoading ? (
                <span>Redirecting…</span>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
              <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>or set up email + password</span>
              <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            </div>

            <div>
              <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                New Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                New Password
                <span className="ml-1 font-normal opacity-60">(8+ chars, 1 number, 1 special)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>

            {error && (
              <div className="text-sm font-ui p-2 rounded-lg" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Saving…' : 'Claim Account'}
            </button>
          </form>
        )}

        <p className="text-xs font-ui mt-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
          <Link to="/login" className="underline" style={{ color: 'var(--color-primary)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
