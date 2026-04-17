import React from 'react';
import { Link } from 'react-router-dom';
import WeatherBadge from './WeatherBadge';

function TeamDisplay({ players, score, isWinner }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isWinner ? 'bg-green-50 border border-green-200' : ''}`}>
      <div className="flex -space-x-2">
        {players.map((p) => (
          <img
            key={p.user_id}
            src={p.avatar_url}
            alt={p.display_name}
            className="w-8 h-8 rounded-full border-2 border-white object-cover"
            onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }}
          />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-ui font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
          {players.map((p) => p.display_name).join(' & ')}
        </div>
        {players.some((p) => p.nickname) && (
          <div className="text-xs opacity-60 truncate" style={{ color: 'var(--color-text-secondary)' }}>
            {players.map((p) => p.nickname && `"${p.nickname}"`).filter(Boolean).join(', ')}
          </div>
        )}
      </div>
      <div className={`text-2xl font-display tabular-nums ${isWinner ? 'text-green-700' : ''}`} style={{ color: isWinner ? undefined : 'var(--color-text-secondary)' }}>
        {score}
      </div>
      {isWinner && <span className="text-green-600 text-sm">🏆</span>}
    </div>
  );
}

export default function GameCard({ game }) {
  const team1 = game.participants?.filter((p) => p.team === 1) || [];
  const team2 = game.participants?.filter((p) => p.team === 2) || [];
  // Use the first player's score — in 2v2 all teammates share the same team score
  const t1Score = team1[0]?.score ?? 0;
  const t2Score = team2[0]?.score ?? 0;
  const t1Won = team1[0]?.is_winner === 1;

  const weather = game.weather || (game.weather_json ? JSON.parse(game.weather_json) : null);

  return (
    <Link to={`/games/${game.id}`} className="block">
      <div
        className="card card-hover"
        style={{ background: 'var(--color-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-ui font-bold"
              style={{
                background: game.game_type === '1v1' ? '#DBEAFE' : '#F3E8FF',
                color: game.game_type === '1v1' ? '#1E40AF' : '#7E22CE',
              }}
            >
              {game.game_type.toUpperCase()}
            </span>
            <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              {new Date(game.played_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {weather && <WeatherBadge weather={weather} size="sm" />}
            {game.venue_name && (
              <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                📍 {game.venue_name}
              </span>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="flex flex-col gap-1.5">
          <TeamDisplay players={team1} score={t1Score} isWinner={t1Won} />
          <div className="text-center text-xs font-ui font-bold" style={{ color: 'var(--color-text-secondary)' }}>
            vs
          </div>
          <TeamDisplay players={team2} score={t2Score} isWinner={!t1Won} />
        </div>

        {/* Latest comment */}
        {game.latest_comment && (
          <div
            className="mt-3 pt-3 border-t text-xs font-ui italic truncate"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            💬 {game.latest_comment.display_name}: "{game.latest_comment.body}"
          </div>
        )}
      </div>
    </Link>
  );
}
