import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../hooks/useAuth';

export default function VerifyEmail() {
  const { token } = useParams();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setErrorMsg('Invalid verification link.'); return; }
    authApi.verifyEmail(token)
      .then(async () => {
        await refreshUser();
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'Verification failed. The link may have expired.');
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'verifying') {
    return (
      <div className="max-w-sm mx-auto mt-12 text-center">
        <p className="font-ui" style={{ color: 'var(--color-text-secondary)' }}>Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="max-w-sm mx-auto mt-12">
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Email verified!
          </h1>
          <p className="text-sm font-ui mb-5" style={{ color: 'var(--color-text-secondary)' }}>
            Your email address has been confirmed.
          </p>
          <Link to="/" className="btn btn-primary">
            Go to the league →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="card p-8 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Verification failed
        </h1>
        <p className="text-sm font-ui mb-5" style={{ color: 'var(--color-text-secondary)' }}>
          {errorMsg}
        </p>
        <div className="flex flex-col gap-2">
          <Link to="/" className="btn btn-secondary text-sm">
            Go home
          </Link>
          <Link to="/forgot-password" className="text-xs font-ui underline" style={{ color: 'var(--color-primary)' }}>
            Request a new verification email
          </Link>
        </div>
      </div>
    </div>
  );
}
