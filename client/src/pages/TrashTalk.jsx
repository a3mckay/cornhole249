import React, { useState, useEffect } from 'react';
import { trashTalkApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';

const MAX_CHARS = 280;

export default function TrashTalk() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [hotGames, setHotGames] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    trashTalkApi.list()
      .then((d) => { setPosts(d.posts); setTotal(d.total); setHotGames(d.hot_games || []); })
      .finally(() => setLoading(false));
  }, []);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const post = await trashTalkApi.post(text.trim());
      setPosts((p) => [post, ...p]);
      setText('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await trashTalkApi.delete(id);
      setPosts((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      alert('Could not delete post');
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        className="relative rounded-[20px] mb-6 py-8 px-6 text-center overflow-hidden"
        style={{ background: '#FDF0E8', border: '3px solid #C8B89A', boxShadow: '4px 4px 0px #C8B89A' }}
      >
        <div className="text-5xl mb-2">🍺</div>
        <h1 className="font-display text-5xl" style={{ color: 'var(--color-text-primary)' }}>
          Trash Talk
        </h1>
        <p className="font-ui mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Say what you gotta say.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Post form */}
          {user ? (
            <div className="card mb-5">
              <form onSubmit={handlePost}>
                <div className="flex gap-3 items-start mb-3">
                  <img src={user.avatar_url} alt={user.display_name} className="w-9 h-9 rounded-full border flex-shrink-0"
                    style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.display_name}`; }} />
                  <div className="flex-1">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                      placeholder="Light 'em up... 🔥"
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border font-marker text-base resize-none focus:outline-none focus:ring-2"
                      style={{
                        background: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                        fontSize: '1.1rem',
                        lineHeight: '1.6',
                      }}
                    />
                    <div className="flex justify-between items-center mt-1.5">
                      <span className="text-xs font-ui" style={{ color: text.length > MAX_CHARS * 0.85 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                        {text.length}/{MAX_CHARS}
                      </span>
                      <button type="submit" disabled={!text.trim() || submitting} className="btn btn-danger text-sm">
                        {submitting ? 'Posting...' : '🔥 Fire Away'}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <div className="card text-center py-5 mb-5 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              Sign in to talk trash
            </div>
          )}

          {/* Posts feed */}
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1,2,3].map((i) => <div key={i} className="card h-24 animate-pulse" style={{ background: 'var(--color-border)' }} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="trash-card card relative"
                  style={{ background: '#FDF8EE', borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-start gap-3">
                    <img src={post.avatar_url} alt={post.display_name} className="w-10 h-10 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.display_name}`; }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap mb-1">
                        <span className="font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>{post.display_name}</span>
                        {post.nickname && (
                          <span className="font-marker text-sm" style={{ color: 'var(--color-secondary)' }}>"{post.nickname}"</span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {new Date(post.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="font-marker text-lg leading-snug" style={{ color: 'var(--color-text-primary)', fontSize: '1.05rem' }}>
                        {post.body}
                      </p>
                    </div>
                    {(user?.id === post.user_id || !!user?.is_admin) && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-xs hover:text-red-500 transition-colors flex-shrink-0 mt-1"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {posts.length === 0 && (
                <div className="card text-center py-12 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                  Dead quiet in here. Be the first to stir the pot. 🥄
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: Hot games */}
        <div>
          <div className="card sticky top-20">
            <h3 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
              🔥 Hottest Games This Week
            </h3>
            {hotGames.length > 0 ? (
              <div className="flex flex-col gap-2">
                {hotGames.map((g) => (
                  <Link key={g.game_id} to={`/games/${g.game_id}`} className="flex items-center gap-2 hover:opacity-80">
                    <span className="text-lg">💬</span>
                    <div className="flex-1">
                      <div className="text-sm font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Game #{g.game_id}
                      </div>
                      <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                        {g.comment_count} comments
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>Quiet week so far...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
