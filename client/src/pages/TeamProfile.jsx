import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { standingsApi } from '../api';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import GameCard from '../components/GameCard';

export default function TeamProfile() {
  const { p1, p2 } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Canonical sorted IDs
  const [id1, id2] = [parseInt(p1), parseInt(p2)].sort((a, b) => a - b);

  useEffect(() => {
    standingsApi.team(id1, id2)
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || 'Team not found'))
      .finally(() => setLoading(false));
  }, [id1, id2]);

  if (loading) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>;
  if (error) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-danger)' }}>{error}</div>;
  if (!data) return null;

  const { players, overall, seasons, history, recent_games, h2h } = data;
  const [pl1, pl2] = players;

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/teams" className="text-sm font-ui hover:underline mb-4 block" style={{ color: 'var(--color-text-secondary)' }}>
        ← Teams
      </Link>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
          {/* Overlapping avatars */}
          <div className="relative flex-shrink-0" style={{ width: 80, height: 64 }}>
            <img
              src={pl1.avatar_url}
              alt={pl1.display_name}
              className="w-16 h-16 rounded-full border-4 object-cover absolute left-0 top-0"
              style={{ borderColor: 'var(--color-secondary)', zIndex: 2 }}
              onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${pl1.display_name}`; }}
            />
            <img
              src={pl2.avatar_url}
              alt={pl2.display_name}
              className="w-16 h-16 rounded-full border-4 object-cover absolute left-8 top-0"
              style={{ borderColor: 'var(--color-primary)', zIndex: 1 }}
              onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${pl2.display_name}`; }}
            />
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="font-display text-3xl leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              {pl1.display_name} <span style={{ color: 'var(--color-text-secondary)' }}>&</span> {pl2.display_name}
            </h1>
            {(pl1.nickname || pl2.nickname) && (
              <div className="font-marker text-lg mt-0.5" style={{ color: 'var(--color-secondary)' }}>
                {[pl1, pl2].filter((p) => p.nickname).map((p) => `"${p.nickname}"`).join(' & ')}
              </div>
            )}
            <div className="mt-2 font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {overall.wins}W–{overall.losses}L · {overall.win_pct}% Win Rate · {overall.gp} games together
            </div>
            <div className="mt-1 font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Best streak: W{overall.best_streak} · Worst: L{overall.worst_streak} · +/-: {overall.plus_minus > 0 ? '+' : ''}{overall.plus_minus}
            </div>
            <div className="mt-2 flex gap-2 flex-wrap justify-center sm:justify-start">
              <Link to={`/players/${pl1.id}`} className="text-xs font-ui px-3 py-1 rounded-full hover:opacity-80"
                style={{ background: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {pl1.display_name}'s profile →
              </Link>
              <Link to={`/players/${pl2.id}`} className="text-xs font-ui px-3 py-1 rounded-full hover:opacity-80"
                style={{ background: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {pl2.display_name}'s profile →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Win% History */}
        {history.length > 1 && (
          <div className="card">
            <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Win% Over Time</h2>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={history} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="game_number" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => [`${v}%`, 'Win%']} labelFormatter={(n) => `Game ${n}`} />
                <Line
                  type="monotone"
                  dataKey="cumulative_win_pct"
                  stroke="#3A6B35"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Season Breakdown */}
        {seasons.length > 0 && (
          <div className="card">
            <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>By Season</h2>
            <table className="w-full text-sm font-ui">
              <thead>
                <tr style={{ color: 'var(--color-text-secondary)' }}>
                  <th className="text-left pb-2">Season</th>
                  <th className="text-center pb-2">GP</th>
                  <th className="text-center pb-2">W</th>
                  <th className="text-center pb-2">L</th>
                  <th className="text-right pb-2">Win%</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => {
                  const pct = s.gp > 0 ? Math.round((s.wins / s.gp) * 100) : 0;
                  return (
                    <tr key={s.season} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="py-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {s.season}
                      </td>
                      <td className="text-center py-2" style={{ color: 'var(--color-text-secondary)' }}>{s.gp}</td>
                      <td className="text-center py-2" style={{ color: 'var(--color-primary)' }}>{s.wins}</td>
                      <td className="text-center py-2" style={{ color: 'var(--color-danger)' }}>{s.losses}</td>
                      <td className="text-right py-2" style={{ color: 'var(--color-secondary)' }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Head-to-Head vs other teams */}
      {h2h.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Head-to-Head</h2>
          <div className="flex flex-col gap-2">
            {h2h.map((matchup, i) => {
              const pct = matchup.gp > 0 ? Math.round((matchup.wins / matchup.gp) * 100) : 0;
              const oppIds = matchup.opponents.map((o) => o.user_id).sort((a, b) => a - b);
              const oppPath = `/teams/${oppIds[0]}/${oppIds[1]}`;
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--color-border)' }}>
                  <Link to={oppPath} className="flex items-center gap-2 flex-1 hover:opacity-80">
                    <div className="flex -space-x-2">
                      {matchup.opponents.map((o) => (
                        <img key={o.user_id} src={o.avatar_url} alt={o.display_name}
                          className="w-8 h-8 rounded-full border-2 object-cover"
                          style={{ borderColor: 'var(--color-surface)' }}
                          onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${o.display_name}`; }} />
                      ))}
                    </div>
                    <span className="font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {matchup.opponents.map((o) => o.display_name).join(' & ')}
                    </span>
                  </Link>
                  <div className="flex items-center gap-3 text-sm font-ui">
                    <span style={{ color: 'var(--color-primary)' }}>{matchup.wins}W</span>
                    <span style={{ color: 'var(--color-danger)' }}>{matchup.losses}L</span>
                    <span className="font-semibold" style={{ color: 'var(--color-secondary)' }}>{pct}%</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>({matchup.gp}G)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Games */}
      {recent_games.length > 0 && (
        <div>
          <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Recent Games</h2>
          <div className="flex flex-col gap-3">
            {recent_games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
