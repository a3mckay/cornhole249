import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { trashTalkApi } from '../api';

const STORAGE_KEY = 'dismissedTrashTalkId';

export default function TrashTalkBanner() {
  const [post, setPost] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    trashTalkApi.list({ limit: 1 }).then((data) => {
      const posts = Array.isArray(data) ? data : data?.posts || [];
      if (!posts.length) return;
      const latest = posts[0];
      // Only show if posted within the last 7 days
      const ageMs = Date.now() - new Date(latest.created_at).getTime();
      if (ageMs > 7 * 24 * 60 * 60 * 1000) return;
      const dismissedId = parseInt(localStorage.getItem(STORAGE_KEY) || '0');
      if (latest.id > dismissedId) setPost(latest);
    }).catch(() => {});
  }, []);

  const handleDismiss = () => {
    if (post) localStorage.setItem(STORAGE_KEY, String(post.id));
    setDismissed(true);
  };

  if (!post || dismissed) return null;

  return (
    <div
      className="relative mb-6 rounded-2xl flex items-center overflow-hidden"
      style={{
        background: 'rgba(212,139,45,0.10)',
        border: '1.5px solid rgba(212,139,45,0.35)',
        minHeight: '44px',
      }}
    >
      {/* Label */}
      <Link
        to="/trash-talk"
        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-ui font-bold border-r"
        style={{ borderColor: 'rgba(212,139,45,0.35)', color: 'var(--color-secondary)' }}
      >
        🍺 Trash Talk
      </Link>

      {/* Scrolling text */}
      <div className="flex-1 overflow-hidden py-2.5 relative">
        <div className="marquee-track text-sm font-ui" style={{ color: 'var(--color-text-primary)' }}>
          <span className="font-semibold" style={{ color: 'var(--color-secondary)' }}>
            {post.display_name}
          </span>
          <span className="mx-2 opacity-40">·</span>
          <span>"{post.body}"</span>
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 px-3 py-2.5 text-xl leading-none opacity-30 hover:opacity-60 transition-opacity"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
