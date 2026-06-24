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

  const [status, setStatus] = useState('claiming'); // 'claiming' | 'success' | 'error'
  const [error, setError] = useState('');
  const [leagueSlug, setLeagueSlug] = useState(null);

  useEffect(() => {
    if (!token) { setStatus('error'); setError('No token in link — ask the league admin for a new one.'); return; }

    authApi.claimStub(token)
      .then(async (data) => {
        await refreshUser();
        if (data.user?.id) identify(data.user.id);
        setLeagueSlug(data.league_slug);
        setStatus('success');
      })
      .catch((e) => {
        setError(e.response?.data?.error || 'This link is invalid or has already been used.');
        setStatus('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'claiming') {
    return (
      <div className="max-w-sm mx-auto mt-20 card text-center p-8">
        <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin mx-auto mb-4"
          style={{ color: 'var(--color-primary)' }} />
        <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Signing you in…
        </p>
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
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          {error}
        </p>
        <Link to="/login" className="btn btn-secondary text-sm">Go to sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-20 card text-center p-8">
      <div className="text-4xl mb-4">🎉</div>
      <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        You're in!
      </h1>
      <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        You've been signed in. Set up your name and email so you can log back in later.
      </p>
      <div className="flex flex-col gap-3">
        {leagueSlug && (
          <button
            onClick={() => navigate(leagueSlug === 'cornhole249' ? '/' : `/l/${leagueSlug}`, { state: { justJoined: true } })}
            className="btn btn-primary w-full"
          >
            Go to league →
          </button>
        )}
        <Link to="/profile" className="btn btn-secondary w-full text-sm">
          Set up my profile
        </Link>
      </div>
    </div>
  );
}
