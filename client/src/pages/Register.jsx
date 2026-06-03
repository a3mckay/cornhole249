import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../hooks/useAuth';

/** Read the referral token from the 30-day cookie set by ReferralCapture. */
function readRefCookie() {
  const m = document.cookie.match(/(?:^|;\s*)ref=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/** Expire the referral cookie immediately after a successful register. */
function clearRefCookie() {
  document.cookie = 'ref=; max-age=0; path=/; SameSite=Lax';
}

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();

  const [code, setCode] = useState(searchParams.get('code') || '');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!displayName.trim() || !email.trim() || !password) {
      setError('All fields are required');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const refToken = readRefCookie();
      await authApi.register({
        email: email.trim(),
        password,
        display_name: displayName.trim(),
        ...(code.trim() ? { code: code.trim() } : {}),
        ...(refToken ? { ref_token: refToken } : {}),
      });
      clearRefCookie();
      await refreshUser();
      const returnTo = searchParams.get('returnTo');
      navigate(returnTo || '/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="card p-8">
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Create account
        </h1>
        <p className="text-sm font-ui mb-5" style={{ color: 'var(--color-text-secondary)' }}>
          {code
            ? "You've got an invite — fill in the details below to join."
            : 'Sign up to start or join a league.'}
        </p>

        {/* Google SSO */}
        <a
          href="/auth/google"
          className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border font-ui font-semibold text-sm mb-4 transition-colors hover:bg-gray-50"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)', textDecoration: 'none' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>or</span>
          <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Join code (optional, pre-filled from invite links) */}
          <div>
            <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Invite Code <span className="font-normal opacity-60">(optional)</span>
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB3K7YPQ"
              maxLength={8}
              className="w-full px-3 py-2 rounded-xl border font-ui text-sm tracking-widest uppercase"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you'll appear on the leaderboard"
              maxLength={40}
              className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              autoFocus
            />
          </div>

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
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Password
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

          <button type="submit" disabled={submitting} className="btn btn-primary w-full">
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-xs font-ui mt-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/login" className="underline" style={{ color: 'var(--color-primary)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
