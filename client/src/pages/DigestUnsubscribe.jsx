/**
 * DigestUnsubscribe — one-click unsubscribe landing page.
 *
 * URL: /unsubscribe?uid=<id>&token=<hmac>
 * Calls GET /api/digest/unsubscribe with the same params, then shows confirmation.
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function DigestUnsubscribe() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading | success | error

  useEffect(() => {
    const uid   = searchParams.get('uid');
    const token = searchParams.get('token');
    if (!uid || !token) { setStatus('error'); return; }

    fetch(`/api/digest/unsubscribe?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? setStatus('success') : setStatus('error')))
      .catch(() => setStatus('error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="font-ui" style={{ color: 'var(--color-text-secondary)' }}>Updating your preferences…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-md mx-auto mt-16 text-center flex flex-col gap-4">
        <div className="text-4xl">🤔</div>
        <h1 className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>
          Something went wrong
        </h1>
        <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          That unsubscribe link may be invalid or already used. If you keep receiving emails,{' '}
          <Link to="/help/contact" className="underline" style={{ color: 'var(--color-primary)' }}>
            contact us
          </Link>{' '}
          and we'll sort it out.
        </p>
        <Link to="/" className="btn btn-secondary text-sm self-center">← Back to Cornhole249</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16 text-center flex flex-col gap-4">
      <div className="text-4xl">✅</div>
      <h1 className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>
        You're unsubscribed
      </h1>
      <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        You won't receive any more weekly digest emails from Cornhole249.
        You can re-enable them any time from your league's Settings page.
      </p>
      <Link to="/" className="btn btn-primary text-sm self-center">Back to Cornhole249</Link>
    </div>
  );
}
