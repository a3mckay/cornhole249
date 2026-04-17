import React from 'react';
import { Link } from 'react-router-dom';

export default function PlayerCard({ player, stats }) {
  const gp = stats?.gp || 0;
  const wins = stats?.wins || 0;
  const losses = stats?.losses || 0;
  const winPct = gp > 0 ? Math.round((wins / gp) * 100) : 0;

  return (
    <Link to={`/players/${player.id}`}>
      <div className="card card-hover text-center cursor-pointer">
        {/* Avatar with cornhole-hole frame */}
        <div className="relative mx-auto w-20 h-20 mb-3">
          <div
            className="absolute inset-0 rounded-full border-4"
            style={{ borderColor: 'var(--color-border)', boxShadow: '0 3px 8px rgba(0,0,0,0.15)' }}
          />
          <img
            src={player.avatar_url}
            alt={player.display_name}
            className="w-full h-full rounded-full object-cover"
            onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.display_name}`; }}
          />
          {!!player.is_admin && (
            <span className="absolute -top-1 -right-1 text-sm">⭐</span>
          )}
        </div>

        {/* Name */}
        <div className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>
          {player.display_name}
        </div>
        {player.nickname && (
          <div className="font-marker text-sm mt-0.5" style={{ color: 'var(--color-secondary)' }}>
            "{player.nickname}"
          </div>
        )}

        {/* Stats */}
        {gp > 0 && (
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
              <div className="font-display text-lg" style={{ color: 'var(--color-secondary)' }}>{winPct}%</div>
              <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>Win%</div>
            </div>
          </div>
        )}
        {gp === 0 && (
          <div className="mt-3 text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>No games yet</div>
        )}

        {/* Elo */}
        <div className="mt-2 text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
          Elo: {Math.round(player.elo_rating || 1000)}
        </div>
      </div>
    </Link>
  );
}
