import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { commentsApi } from '../api';

const MAX_CHARS = 500;

export default function CommentSection({ gameId, comments: initialComments }) {
  const { user } = useAuth();
  const [comments, setComments] = useState(initialComments || []);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const comment = await commentsApi.post(gameId, text.trim());
      setComments((c) => [...c, comment]);
      setText('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await commentsApi.delete(commentId);
      setComments((c) => c.filter((x) => x.id !== commentId));
    } catch (err) {
      alert('Could not delete comment');
    }
  };

  return (
    <div>
      <h3 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
        Comments ({comments.length})
      </h3>

      {/* Comment list */}
      <div className="flex flex-col gap-3 mb-4">
        {comments.length === 0 && (
          <div className="text-center py-6 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            No comments yet. Be the first to talk trash.
          </div>
        )}
        {comments.map((c) => (
          <div
            key={c.id}
            className="flex gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--color-border)' }}
          >
            <img
              src={c.avatar_url}
              alt={c.display_name}
              className="w-9 h-9 rounded-full border flex-shrink-0 object-cover"
              style={{ borderColor: 'var(--color-border)' }}
              onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.display_name}`; }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-ui font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {c.display_name}
                </span>
                {c.nickname && (
                  <span className="text-xs font-marker" style={{ color: 'var(--color-secondary)' }}>
                    "{c.nickname}"
                  </span>
                )}
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {new Date(c.created_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="mt-1 text-sm font-ui" style={{ color: 'var(--color-text-primary)' }}>{c.body}</p>
            </div>
            {(user?.id === c.user_id || !!user?.is_admin) && (
              <button
                onClick={() => handleDelete(c.id)}
                className="text-xs self-start mt-1 hover:text-red-500 transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
                title="Delete comment"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      {user ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Say something..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border font-ui text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              data-testid="comment-input"
            />
            <span
              className="absolute bottom-2 right-3 text-xs"
              style={{ color: text.length > MAX_CHARS * 0.9 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}
              data-testid="char-count"
            >
              {text.length}/{MAX_CHARS}
            </span>
          </div>
          {error && <div className="text-sm font-ui" style={{ color: 'var(--color-danger)' }}>{error}</div>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="btn btn-primary"
              data-testid="comment-submit"
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </form>
      ) : (
        <div
          className="text-center py-3 rounded-xl text-sm font-ui"
          style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--color-text-secondary)' }}
        >
          Sign in to leave a comment
        </div>
      )}
    </div>
  );
}
