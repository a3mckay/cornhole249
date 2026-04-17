import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Stats() {
  const [rivals, setRivals] = useState([]);
  const [performers, setPerformers] = useState(null);
  const [pointDiff, setPointDiff] = useState([]);
  const [clutch, setClutch] = useState([]);
  const [weatherStats, setWeatherStats] = useState([]);
  const [venueStats, setVenueStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const season = 2025;

  useEffect(() => {
    Promise.all([
      statsApi.rivals(),
      statsApi.performers({ season }),
      statsApi.pointDiff({ season }),
      statsApi.clutch({ season }),
      statsApi.weather({}),
      statsApi.venue({}),
    ]).then(([r, p, pd, c, ws, vs]) => {
      setRivals(r);
      setPerformers(p);
      setPointDiff(pd);
      setClutch(c);
      setWeatherStats(ws);
      setVenueStats(vs);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading stats...</div>;

  return (
    <div>
      <h1 className="font-display text-4xl mb-6" style={{ color: 'var(--color-text-primary)' }}>
        League Stats
      </h1>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top/Bottom Performers */}
        {performers && (
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              🏆 Top Performers
            </h2>
            <div className="flex flex-col gap-2 mb-4">
              {performers.top?.map((p, i) => (
                <Link key={p.user_id} to={`/players/${p.user_id}`} className="flex items-center gap-3 hover:opacity-80">
                  <span className="text-lg w-7 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <img src={p.avatar_url} alt={p.display_name} className="w-8 h-8 rounded-full border" style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }} />
                  <div className="flex-1">
                    <span className="font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.display_name}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>{p.gp} GP</span>
                  </div>
                  <span className="font-display text-xl" style={{ color: 'var(--color-primary)' }}>{p.win_pct}%</span>
                </Link>
              ))}
            </div>
            <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-danger)' }}>💀 Struggling</div>
              {performers.bottom?.map((p) => (
                <Link key={p.user_id} to={`/players/${p.user_id}`} className="flex items-center gap-3 hover:opacity-80 py-1">
                  <img src={p.avatar_url} alt={p.display_name} className="w-7 h-7 rounded-full border" style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }} />
                  <span className="flex-1 font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>{p.display_name}</span>
                  <span className="font-ui font-bold text-sm" style={{ color: 'var(--color-danger)' }}>{p.win_pct}%</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Rivals */}
        <div className="card">
          <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            ⚔️ Top Rivalries
          </h2>
          <div className="flex flex-col gap-4">
            {rivals.slice(0, 5).map((r, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-1">
                  <img src={r.player1.avatar_url} alt={r.player1.display_name} className="w-7 h-7 rounded-full border" style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.player1.display_name}`; }} />
                  <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{r.player1.display_name}</span>
                  <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>vs</span>
                  <img src={r.player2.avatar_url} alt={r.player2.display_name} className="w-7 h-7 rounded-full border" style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.player2.display_name}`; }} />
                  <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{r.player2.display_name}</span>
                  <span className="ml-auto text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{r.games_played} games</span>
                </div>
                {/* Win split bar */}
                <div className="flex h-4 rounded-full overflow-hidden">
                  <div style={{ width: `${Math.round((r.p1_wins / r.games_played) * 100)}%`, background: 'var(--color-primary)' }} />
                  <div style={{ flex: 1, background: 'var(--color-secondary)' }} />
                </div>
                <div className="flex justify-between text-xs font-ui mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{r.p1_wins}W</span>
                  <Link to={`/stats`} className="underline" style={{ color: 'var(--color-primary)' }}>H2H →</Link>
                  <span>{r.p2_wins}W</span>
                </div>
              </div>
            ))}
            {rivals.length === 0 && <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>Not enough games yet</div>}
          </div>
        </div>

        {/* Point Differential */}
        {pointDiff.length > 0 && (
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              📊 Avg Point Differential
            </h2>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={pointDiff} layout="vertical">
                  <XAxis type="number" tick={{ fontFamily: 'Nunito', fontSize: 11 }} />
                  <YAxis type="category" dataKey="display_name" tick={{ fontFamily: 'Nunito', fontSize: 11 }} width={70} />
                  <Tooltip contentStyle={{ fontFamily: 'Nunito', borderRadius: 12 }} />
                  <Bar dataKey="avg_diff" name="Avg +/-">
                    {pointDiff.map((entry) => (
                      <Cell key={entry.user_id} fill={entry.avg_diff >= 0 ? 'var(--color-primary)' : 'var(--color-danger)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Clutch Factor */}
        {clutch.length > 0 && (
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              🎯 Clutch Factor
            </h2>
            <div className="text-xs font-ui mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Win% in games decided by ≤3 points (min 2 close games)
            </div>
            <div className="flex flex-col gap-2">
              {clutch.map((c, i) => (
                <Link key={c.user_id} to={`/players/${c.user_id}`} className="flex items-center gap-2 hover:opacity-80">
                  <span className="font-display text-xl w-6 text-center" style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</span>
                  <img src={c.avatar_url} alt={c.display_name} className="w-7 h-7 rounded-full border" style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.display_name}`; }} />
                  <span className="flex-1 font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{c.display_name}</span>
                  <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{c.gp} close games</span>
                  <span className="font-display text-xl" style={{ color: 'var(--color-primary)' }}>{c.win_pct}%</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Weather Warriors */}
        {weatherStats.length > 0 && (
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              🌧️ League Weather Breakdown
            </h2>
            <div className="flex flex-col gap-2">
              {weatherStats.map((w) => (
                <div key={w.condition} className="flex items-center gap-3">
                  <span className="text-lg w-6 text-center">
                    {w.condition === 'Clear' ? '☀️' : w.condition.includes('Rain') ? '🌧️' : w.condition === 'Drizzle' ? '🌦️' : w.condition === 'Thunderstorm' ? '⛈️' : '☁️'}
                  </span>
                  <span className="flex-1 font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{w.condition}</span>
                  <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{w.gp} games</span>
                  <span className="font-ui font-bold text-sm" style={{ color: 'var(--color-primary)' }}>{w.win_pct}% win</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Venue Kings */}
        {venueStats.length > 0 && (
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              📍 Venue Kings
            </h2>
            <div className="flex flex-col gap-2">
              {venueStats.map((v) => (
                <div key={v.venue_id} className="flex items-center gap-3">
                  <span className="font-ui font-semibold text-sm flex-1" style={{ color: 'var(--color-text-primary)' }}>{v.venue_name}</span>
                  <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{v.gp} games</span>
                  <span className="font-ui font-bold text-sm" style={{ color: 'var(--color-secondary)' }}>{v.win_pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
