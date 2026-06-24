import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../hooks/useAuth';

/**
 * SetupLogin — lets an already-signed-in user who has no email/password
 * (stub players, or PIN users logged in via PIN) establish a real login.
 * Uses POST /auth/setup-credentials (no PIN required — identity is the session).
 */
export default function SetupLogin() {
  const navigate = useNavigate();
  const { user, loading, refreshUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (loading) {
    return (
      <div className="max-w-sm mx-auto mt-20 text-center">
        <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-sm mx-auto mt-20 card text-center p-8">
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>Sign in first</h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          You need to be signed in to set up a login.
        </p>
        <Link to="/login" className="btn btn-primary text-sm">Go to sign in</Link>
      </div>
    );
  }

  if (!user.needs_migration) {
    return (
      <div className="max-w-sm mx-auto mt-20 card text-center p-8">
        <div className="text-4xl mb-3">✅</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          You're all set
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          This account already has a login method.
        </p>
        <Link to="/" className="btn btn-secondary text-sm">Go home</Link>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setSaving(true);
    setError('');
    try {
      await authApi.setupCredentials(email.trim(), password);
      await refreshUser();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your login. Try a different email.');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-16 card p-8">
      <h1 className="font-display text-2xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
        Set up your login
      </h1>
      <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        Add an email + password to {user.display_name} so you can sign back in from any device.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Password <span className="font-normal opacity-60">(8+ chars, 1 number, 1 special)</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
        </div>

        {error && (
          <div className="text-sm font-ui p-2 rounded-lg" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
            ⚠️ {error}
          </div>
        )}

        <button type="submit" disabled={saving} className="btn btn-primary w-full disabled:opacity-50">
          {saving ? 'Saving…' : 'Save login'}
        </button>
      </form>
    </div>
  );
}
