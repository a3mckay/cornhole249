import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../hooks/useAuth';

export default function Register() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim() || !displayName.trim()) {
      setError('Both fields are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await authApi.register(code.trim(), displayName.trim());
      await refreshUser();
      navigate('/players');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="card">
        <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Join Cornhole249
        </h1>
        <p className="text-sm font-ui mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          You'll need a join code from an admin. Enter it below along with your name.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Join Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB3K7YPQ"
              maxLength={8}
              className="w-full px-3 py-2 rounded-xl border font-ui text-sm tracking-widest uppercase"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Your Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you'll appear on the leaderboard"
              maxLength={40}
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
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-xs font-ui mt-4 text-center" style={{ color: 'var(--color-text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/" className="underline" style={{ color: 'var(--color-primary)' }}>Sign in from the nav</Link>
        </p>
      </div>
    </div>
  );
}
