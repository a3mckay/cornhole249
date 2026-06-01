import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.forgotPassword(email.trim());
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-sm mx-auto mt-12">
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📬</div>
          <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Check your inbox
          </h1>
          <p className="text-sm font-ui mb-5" style={{ color: 'var(--color-text-secondary)' }}>
            If an account exists for <strong>{email}</strong>, we've sent a reset link. It expires in 1 hour.
          </p>
          <Link to="/login" className="btn btn-secondary text-sm">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="card p-8">
        <h1 className="font-display text-2xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Forgot your password?
        </h1>
        <p className="text-sm font-ui mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Enter your email and we'll send you a reset link.
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
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm font-ui p-2 rounded-lg" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
        </form>

        <p className="text-xs font-ui mt-4 text-center">
          <Link to="/login" className="underline" style={{ color: 'var(--color-primary)' }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
