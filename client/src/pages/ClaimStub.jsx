import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { identify } from '../lib/analytics';

export default function ClaimStub() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token');

  // 'claiming' | 'setup' | 'error' | 'already_signed_in'
  const [status, setStatus] = useState('claiming');
  const [error, setError] = useState('');
  const [leagueSlug, setLeagueSlug] = useState(null);
  const [displayName, setDisplayName] = useState('');

  // Credential setup form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setError('No token in link — ask the league admin for a new one.'); return; }

    authApi.claimStub(token)
      .then(async (data) => {
        await refreshUser();
        if (data.user?.id) identify(data.user.id);
        setLeagueSlug(data.league_slug);
        setDisplayName(data.user?.display_name || '');
        setStatus('setup');
      })
      .catch((e) => {
        if (e.response?.data?.error === 'already_signed_in') {
          setError(e.response.data.message);
          setStatus('already_signed_in');
        } else {
          setError(e.response?.data?.error || 'This link is invalid or has already been used.');
          setStatus('error');
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enterLeague = () => {
    if (leagueSlug) {
      navigate(leagueSlug === 'cornhole249' ? '/' : `/l/${leagueSlug}`, { state: { justJoined: true } });
    } else {
      navigate('/');
    }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setFormError('Email and password are required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      await authApi.setupCredentials(email.trim(), password);
      await refreshUser();
      enterLeague();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Could not save your login. Try a different email.');
      setSaving(false);
    }
  };

  if (status === 'claiming') {
    return (
      <div className="max-w-sm mx-auto mt-20 card text-center p-8">
        <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin mx-auto mb-4"
          style={{ color: 'var(--color-primary)' }} />
        <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>Signing you in…</p>
      </div>
    );
  }

  if (status === 'already_signed_in') {
    return (
      <div className="max-w-sm mx-auto mt-20 card text-center p-8">
        <div className="text-4xl mb-4">👋</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          You're already signed in
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
        <Link to="/" className="btn btn-secondary text-sm">Go home</Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-sm mx-auto mt-20 card text-center p-8">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Link expired
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
        <Link to="/login" className="btn btn-secondary text-sm">Go to sign in</Link>
      </div>
    );
  }

  // status === 'setup' — signed in; encourage them to set a real login
  return (
    <div className="max-w-sm mx-auto mt-16 card p-8">
      <div className="text-center mb-6">
        <div className="text-4xl mb-3">🎉</div>
        <h1 className="font-display text-2xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          You're in{displayName ? `, ${displayName}` : ''}!
        </h1>
        <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Set up an email + password so you can sign back in later from any device.
        </p>
      </div>

      <form onSubmit={handleSaveCredentials} className="flex flex-col gap-4">
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

        {formError && (
          <div className="text-sm font-ui p-2 rounded-lg" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
            ⚠️ {formError}
          </div>
        )}

        <button type="submit" disabled={saving} className="btn btn-primary w-full disabled:opacity-50">
          {saving ? 'Saving…' : 'Save login & continue →'}
        </button>
      </form>

      <button
        onClick={enterLeague}
        className="w-full mt-3 font-ui text-sm text-center"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Skip for now — just take me in
      </button>
    </div>
  );
}
