import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { houseApi } from '../api';
import { useAuth } from '../hooks/useAuth';

// Cross-sport "house" landing. A house = all leagues a single user owns,
// aggregated across every sport. Rankings are built on each player's
// PERCENTILE within a sport (ELO isn't comparable across sports), then
// averaged — so a future ping-pong/crokinole league flows in automatically.
//
// Sport-agnostic by design: this page renders whatever sports the API reports
// in `data.sports`; adding a sport needs zero changes here.

const SPORT_EMOJI = { cornhole: '🌽', pool: '🎱', pingpong: '🏓', crokinole: '🪙', cribbage: '🃏', euchre: '♠️' };
function sportLabel(s) {
  return `${SPORT_EMOJI[s] || '🎯'} ${s.charAt(0).toUpperCase() + s.slice(1)}`;
}

function playerName(p) {
  return p?.nickname || p?.display_name || `Player ${p?.user_id}`;
}

function Board({ title, blurb, children }) {
  return (
    <div className="card mb-6">
      <h2 className="font-display text-2xl mb-1" style={{ color: 'var(--color-primary)' }}>{title}</h2>
      {blurb && <p className="font-ui text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>{blurb}</p>}
      {children}
    </div>
  );
}

export default function House() {
  const { ownerId: ownerIdParam } = useParams();
  const { user } = useAuth();
  const ownerId = ownerIdParam || user?.id;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    houseApi.overview(ownerId)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.error || 'Could not load house stats'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ownerId]);

  if (!ownerId) {
    return <div className="max-w-3xl mx-auto card text-center font-ui">Sign in to see your house standings.</div>;
  }
  if (loading) {
    return <div className="max-w-3xl mx-auto card text-center font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading house…</div>;
  }
  if (error) {
    return <div className="max-w-3xl mx-auto card text-center font-ui" style={{ color: 'var(--color-text-secondary)' }}>{error}</div>;
  }

  const { owner, sports = [], rankings = [], best_at_everything = [], jack_of_all_trades = [], sport_affinity = [] } = data;

  if (!sports.length) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>🏠 {playerName(owner)}'s House</h1>
        <div className="card text-center font-ui" style={{ color: 'var(--color-text-secondary)' }}>
          No games logged across this house's leagues yet. Cross-sport boards appear once games are played.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-display text-4xl mb-1" style={{ color: 'var(--color-text-primary)' }}>🏠 {playerName(owner)}'s House</h1>
      <p className="font-ui mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        Combined standings across {sports.length} sport{sports.length === 1 ? '' : 's'}:{' '}
        {sports.map(sportLabel).join(' · ')}. Ranked by average percentile within each sport — so being
        top of a small sport counts the same as topping a big one.
      </p>

      {/* House rankings */}
      <Board title="House Rankings" blurb="Average percentile across every sport a player has been ranked in.">
        <div className="space-y-1">
          {rankings.map((r) => (
            <div key={r.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg font-ui"
              style={{ background: 'var(--color-surface)' }}>
              <div className="flex items-center gap-3">
                <span className="font-display text-lg w-6 text-center" style={{ color: 'var(--color-primary)' }}>{r.rank}</span>
                <span style={{ color: 'var(--color-text-primary)' }}>{playerName(r)}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {Object.entries(r.per_sport || {}).map(([s, p]) => `${SPORT_EMOJI[s] || '🎯'} ${p}`).join('  ')}
                </span>
              </div>
              <span className="font-display text-lg" style={{ color: 'var(--color-text-primary)' }}>{r.avg_percentile}</span>
            </div>
          ))}
        </div>
      </Board>

      {/* Best at everything */}
      {best_at_everything.length > 0 && (
        <Board title="🏆 Best at Everything" blurb="Highest floor — ranked by worst sport (min percentile) across ≥2 sports.">
          <ol className="space-y-1 font-ui">
            {best_at_everything.map((r, i) => (
              <li key={r.user_id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: 'var(--color-surface)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>{i + 1}. {playerName(r)}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>floor {r.min_percentile} · {r.sports_played} sports</span>
              </li>
            ))}
          </ol>
        </Board>
      )}

      {/* Jack of all trades */}
      {jack_of_all_trades.length > 0 && (
        <Board title="🃏 Jack of All Trades" blurb="Most sports played at or above the 50th percentile.">
          <ol className="space-y-1 font-ui">
            {jack_of_all_trades.map((r, i) => (
              <li key={r.user_id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: 'var(--color-surface)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>{i + 1}. {playerName(r)}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{r.sports_at_baseline} of {r.sports_played} sports</span>
              </li>
            ))}
          </ol>
        </Board>
      )}

      {/* Sport affinity */}
      {sport_affinity.length > 0 && (
        <Board title="🎯 Sport Affinity" blurb="The sport each player over-performs in, relative to their own average.">
          <ol className="space-y-1 font-ui">
            {sport_affinity.map((r) => (
              <li key={r.user_id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: 'var(--color-surface)' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>{playerName(r)}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{sportLabel(r.sport)} · +{r.over_performance}</span>
              </li>
            ))}
          </ol>
        </Board>
      )}

      <p className="text-center font-ui text-xs mt-4" style={{ color: 'var(--color-text-secondary)' }}>
        <Link to="/" style={{ color: 'var(--color-primary)' }}>← Back</Link>
      </p>
    </div>
  );
}
