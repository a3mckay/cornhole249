import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leaguesApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { SPORTS, DEFAULT_SPORT } from '../sports';

export default function CreateLeague() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [sport, setSport] = useState(DEFAULT_SPORT);
  const [rules, setRules] = useState('hamilton');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <p className="font-ui text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          You need to be signed in to create a league.
        </p>
        <button className="btn btn-primary mt-4" onClick={() => navigate('/register?returnTo=/leagues/new')}>
          Create an account →
        </button>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('League name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const { league, joinCode, inviteToken } = await leaguesApi.create({ name: name.trim(), tagline: tagline.trim() || undefined, is_public: isPublic, sport, rules });
      await refreshUser(); // update nav league list immediately
      navigate(`/l/${league.slug}/wizard`, { state: { league, joinCode, inviteToken } });
    } catch (err) {
      if (err.response?.data?.upgrade) {
        setUpgradeRequired(true);
      } else {
        setError(err.response?.data?.error || 'Failed to create league');
      }
    } finally {
      setLoading(false);
    }
  };

  if (upgradeRequired) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center card p-8">
        <div className="text-4xl mb-4">🚀</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Free plan limit reached
        </h1>
        <p className="font-ui mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Free accounts can own up to 2 leagues. Upgrade any of your leagues to Pro and you'll be
          able to create unlimited leagues.
        </p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8">
      <div className="card p-8">
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Create a League
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Set up your own {(SPORTS[sport] || SPORTS[DEFAULT_SPORT]).displayName.toLowerCase()} league and invite your crew.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* League name */}
          <div>
            <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              League Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bach Party, Backyard Legends…"
              maxLength={60}
              required
              className="w-full px-3 py-2.5 rounded-xl border font-ui"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {/* Tagline */}
          <div>
            <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              Tagline <span className="font-normal opacity-50">(optional)</span>
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. The Most Competitive Backyard League"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-xl border font-ui"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {/* Sport */}
          <div>
            <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Sport
            </label>
            <div className="grid grid-cols-2 gap-3">
              {Object.values(SPORTS).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSport(s.key)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: sport === s.key ? 'var(--color-primary)' : 'var(--color-border)',
                    background: sport === s.key ? 'rgba(58,107,53,0.07)' : 'var(--color-bg)',
                  }}
                >
                  <span className="text-xl">{s.emoji}</span>
                  <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{s.displayName}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Public / Private */}
          <div>
            <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Visibility
            </label>
            <div className="flex gap-3">
              {[
                { value: true,  label: '🌐 Public',  desc: 'Anyone can view standings & games' },
                { value: false, label: '🔒 Private', desc: 'Only members can see anything' },
              ].map(({ value, label, desc }) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setIsPublic(value)}
                  className={`flex-1 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${isPublic === value ? 'border-primary bg-green-50' : ''}`}
                  style={{
                    borderColor: isPublic === value ? 'var(--color-primary)' : 'var(--color-border)',
                    background: isPublic === value ? 'rgba(58,107,53,0.07)' : 'var(--color-bg)',
                  }}
                >
                  <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
                  <span className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rules — cornhole-specific (Hamilton/ACA). Other sports configure
              their scoring per-game (e.g. pool variants), so this is hidden. */}
          {sport === 'cornhole' && (
            <div>
              <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Scoring Rules
              </label>
              <div className="flex gap-3">
                {[
                  { value: 'hamilton', label: 'Hamilton', desc: 'Best-of, max 10 pts' },
                  { value: 'aca',      label: 'ACA',      desc: 'Standard 21 pts' },
                ].map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRules(value)}
                    className={`flex-1 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all`}
                    style={{
                      borderColor: rules === value ? 'var(--color-primary)' : 'var(--color-border)',
                      background: rules === value ? 'rgba(58,107,53,0.07)' : 'var(--color-bg)',
                    }}
                  >
                    <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
                    <span className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm font-ui text-center rounded-xl p-2" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading || !name.trim()} className="btn btn-primary py-3 text-base font-semibold disabled:opacity-50">
            {loading ? 'Creating…' : '🎉 Create League'}
          </button>
        </form>
      </div>
    </div>
  );
}
