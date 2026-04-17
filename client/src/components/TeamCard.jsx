import React from 'react';
import { Link } from 'react-router-dom';

export default function TeamCard({ team }) {
  const { players, gp, wins, losses, win_pct } = team;
  const [p1, p2] = [...(players || [])].sort((a, b) => a.user_id - b.user_id);
  const teamPath = p1 && p2 ? `/teams/${p1.user_id}/${p2.user_id}` : '#';

  return (
    <Link to={teamPath}>
      <div className="card card-hover cursor-pointer">
        {/* Overlapping avatars */}
        <div className="flex justify-center mb-3">
          <div className="relative w-16 h-10">
            {p1 && (
              <img
                src={p1.avatar_url}
                alt={p1.display_name}
                className="w-10 h-10 rounded-full border-2 absolute left-0 top-0 object-cover"
                style={{ borderColor: 'var(--color-surface)', zIndex: 2 }}
                onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p1.display_name}`; }}
              />
            )}
            {p2 && (
              <img
                src={p2.avatar_url}
                alt={p2.display_name}
                className="w-10 h-10 rounded-full border-2 absolute left-6 top-0 object-cover"
                style={{ borderColor: 'var(--color-surface)', zIndex: 1 }}
                onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p2.display_name}`; }}
              />
            )}
          </div>
        </div>

        {/* Names */}
        <div className="text-center">
          <div className="font-display text-lg leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {players?.map((p) => p.display_name).join(' & ')}
          </div>
          {players?.some((p) => p.nickname) && (
            <div className="font-marker text-sm mt-0.5" style={{ color: 'var(--color-secondary)' }}>
              {players.filter((p) => p.nickname).map((p) => `"${p.nickname}"`).join(' & ')}
            </div>
          )}
        </div>

        {/* Stats */}
        {gp > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="font-display text-lg" style={{ color: 'var(--color-primary)' }}>{wins}</div>
              <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>W</div>
            </div>
            <div>
              <div className="font-display text-lg" style={{ color: 'var(--color-danger)' }}>{losses}</div>
              <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>L</div>
            </div>
            <div>
              <div className="font-display text-lg" style={{ color: 'var(--color-secondary)' }}>{win_pct}%</div>
              <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>Win%</div>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm font-ui text-center" style={{ color: 'var(--color-text-secondary)' }}>No games yet</div>
        )}

        <div className="mt-2 text-xs font-ui text-center" style={{ color: 'var(--color-text-secondary)' }}>
          {gp} game{gp !== 1 ? 's' : ''} together
        </div>
      </div>
    </Link>
  );
}
