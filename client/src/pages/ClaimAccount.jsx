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
  const [error, setError] = useState('');

  const handlePickUser = (user) => {
    setSelectedUser(user);
    setStep(2);
    setError('');
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
          Existing Cornhole249 players: confirm your identity with your PIN, then set up email + password.
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
