import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { searchArticles } from '../help/articles';
import { useAuth } from '../hooks/useAuth';

export default function HelpContact() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Real-time article suggestions based on the subject field
  const suggestions = useMemo(() => {
    if (!subject.trim() || subject.trim().length < 4) return [];
    return searchArticles(subject).slice(0, 3);
  }, [subject]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/help/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), reply_to: replyTo.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send');
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <div className="text-5xl mb-4">✉️</div>
        <h1 className="font-display text-3xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Message sent!
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          We'll get back to you{replyTo ? ` at ${replyTo}` : ''} within a day.
        </p>
        <Link to="/help" className="btn btn-primary px-6 py-2.5">
          ← Back to Help
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <Link to="/help" className="hover:opacity-75 transition-opacity">Help</Link>
        <span>›</span>
        <span style={{ color: 'var(--color-text-primary)' }}>Contact</span>
      </div>

      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Contact us
      </h1>
      <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        We usually respond within a day. For billing issues, please include your league name.
      </p>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
        {/* Reply-to email */}
        <div>
          <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
            Your email {!user?.email && <span className="font-normal opacity-50">(so we can reply)</span>}
          </label>
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-3 py-2.5 rounded-xl border font-ui text-sm"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What do you need help with?"
            required
            maxLength={120}
            className="w-full px-3 py-2.5 rounded-xl border font-ui text-sm"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
        </div>

        {/* Article suggestions — keyword match on subject */}
        {suggestions.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(58,107,53,0.07)', border: '1px solid rgba(58,107,53,0.2)' }}>
            <p className="font-ui text-xs font-semibold mb-2" style={{ color: 'var(--color-primary)' }}>
              📖 These articles might help:
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((a) => (
                <Link
                  key={a.slug}
                  to={`/help/${a.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="font-ui text-sm font-semibold underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {a.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div>
          <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe your issue or question in detail…"
            required
            rows={6}
            maxLength={2000}
            className="w-full px-3 py-2.5 rounded-xl border font-ui text-sm resize-none"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
          <div className="text-right font-ui text-xs mt-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
            {body.length} / 2000
          </div>
        </div>

        {error && (
          <p className="text-sm font-ui p-2.5 rounded-xl text-center" style={{ background: '#FEE2E2', color: '#991B1B' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !subject.trim() || !body.trim() || !replyTo.trim()}
          className="btn btn-primary py-2.5 font-semibold disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send message'}
        </button>
      </form>
    </div>
  );
}
