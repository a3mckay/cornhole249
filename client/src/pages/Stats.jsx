import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CURRENT_YEAR = new Date().getFullYear();

const WEATHER_EMOJI = {
  'Clear': '☀️',
  'Partly Cloudy': '⛅',
  'Overcast': '☁️',
  'Rain': '🌧️',
  'Heavy Rain': '🌧️',
  'Drizzle': '🌦️',
  'Snow': '❄️',
  'Thunderstorm': '⛈️',
  'Fog': '🌫️',
};

function getWeatherEmoji(condition) {
  if (!condition) return '🌡️';
  if (WEATHER_EMOJI[condition]) return WEATHER_EMOJI[condition];
  if (condition.toLowerCase().includes('rain')) return '🌧️';
  if (condition.toLowerCase().includes('cloud')) return '⛅';
  return '🌡️';
}

export default function Stats() {
  const [seasonMode, setSeasonMode] = useState('current'); // 'current' | 'alltime'
  const [performers, setPerformers] = useState(null);
  const [streaks, setStreaks] = useState([]);
  const [pointDiff, setPointDiff] = useState([]);
  const [clutch, setClutch] = useState([]);
  const [venueKings, setVenueKings] = useState([]);
  const [eloLeaders, setEloLeaders] = useState([]);
  const [weatherPerformers, setWeatherPerformers] = useState([]);
  const [rivals, setRivals] = useState([]);
  const [loading, setLoading] = useState(true);

  const season = seasonMode === 'current' ? CURRENT_YEAR : undefined;
  const seasonParam = season ? { season } : {};

  useEffect(() => {
    setLoading(true);
    Promise.all([
      statsApi.performers(seasonParam),
      statsApi.streaks(seasonParam),
      statsApi.pointDiff(seasonParam),
      statsApi.clutch(seasonParam),
      statsApi.venueKings(seasonParam),
      statsApi.eloLeaders(),
      statsApi.weatherPerformers(),
      statsApi.rivals(),
    ]).then(([p, st, pd, c, vk, elo, wp, r]) => {
      setPerformers(p);
      setStreaks(st);
      setPointDiff(pd);
      setClutch(c);
      setVenueKings(vk);
      setEloLeaders(elo);
      setWeatherPerformers(wp);
      setRivals(r);
    }).finally(() => setLoading(false));
  }, [seasonMode]);

  // Sorted performers for ranking card
  const allPerformers = performers
    ? [...(performers.top || []), ...(performers.bottom || [])].reduce((acc, p) => {
        if (!acc.find((x) => x.user_id === p.user_id)) acc.push(p);
        return acc;
      }, []).sort((a, b) => b.win_pct - a.win_pct)
    : [];

  // Streak leaders
  const topWinStreak = streaks.length > 0
    ? streaks.reduce((best, s) => (!best || s.max_win_streak > best.max_win_streak ? s : best), null)
    : null;
  const activeStreaks = [...streaks].sort((a, b) => Math.abs(b.current_streak) - Math.abs(a.current_streak));

  return (
    <div>
      <h1 className="font-display text-4xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
        League Stats
      </h1>

      {/* Season toggle */}
      <div className="flex gap-2 mb-6">
        <div className="flex rounded-full overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
          {[
            { key: 'current', label: `${CURRENT_YEAR}` },
            { key: 'alltime', label: 'All Time' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSeasonMode(key)}
              className="px-5 py-1.5 font-ui font-semibold text-sm transition-colors"
              style={{
                background: seasonMode === key ? 'var(--color-primary)' : 'var(--color-surface)',
                color: seasonMode === key ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading stats...</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">

          {/* 1. Player Rankings */}
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              🏅 Player Rankings
            </h2>
            {allPerformers.length === 0 ? (
              <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>No data yet</div>
            ) : (
              <div className="flex flex-col gap-2">
                {allPerformers.map((p, i) => (
                  <Link key={p.user_id} to={`/players/${p.user_id}`} className="flex items-center gap-3 hover:opacity-80">
                    <span className="text-lg w-7 text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</span>}
                    </span>
                    <img
                      src={p.avatar_url}
                      alt={p.display_name}
                      className="w-8 h-8 rounded-full border"
                      style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{p.display_name}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {p.gp}GP · {p.wins}W · {p.losses}L
                      </span>
                    </div>
                    <span
                      className="font-display text-lg"
                      style={{ color: p.win_pct >= 50 ? 'var(--color-primary)' : 'var(--color-danger)' }}
                    >
                      {p.win_pct}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 2. Streaks */}
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              🔥 Streaks
            </h2>
            {streaks.length === 0 ? (
              <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>No data yet</div>
            ) : (
              <>
                {topWinStreak && (
                  <div className="mb-4">
                    <div className="text-xs font-ui font-semibold uppercase mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                      Longest Win Streak
                    </div>
                    <Link to={`/players/${topWinStreak.user_id}`} className="flex items-center gap-3 hover:opacity-80">
                      <img
                        src={topWinStreak.avatar_url}
                        alt={topWinStreak.display_name}
                        className="w-9 h-9 rounded-full border"
                        style={{ borderColor: 'var(--color-border)' }}
                        onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${topWinStreak.display_name}`; }}
                      />
                      <div className="flex-1">
                        <span className="font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>{topWinStreak.display_name}</span>
                      </div>
                      <span className="font-display text-2xl" style={{ color: 'var(--color-primary)' }}>
                        🔥 {topWinStreak.max_win_streak}
                      </span>
                    </Link>
                  </div>
                )}
                <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="text-xs font-ui font-semibold uppercase mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Active Streaks
                  </div>
                  <div className="flex flex-col gap-2">
                    {activeStreaks.filter(s => s.current_streak !== 0).map((s) => {
                      const isWin = s.current_streak > 0;
                      const count = Math.abs(s.current_streak);
                      return (
                        <Link key={s.user_id} to={`/players/${s.user_id}`} className="flex items-center gap-3 hover:opacity-80">
                          <img
                            src={s.avatar_url}
                            alt={s.display_name}
                            className="w-7 h-7 rounded-full border"
                            style={{ borderColor: 'var(--color-border)' }}
                            onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.display_name}`; }}
                          />
                          <span className="flex-1 font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>{s.display_name}</span>
                          <span
                            className="font-ui font-bold text-sm px-2 py-0.5 rounded-full"
                            style={{
                              background: isWin ? 'var(--color-primary)' : 'var(--color-danger)',
                              color: '#fff',
                            }}
                          >
                            {isWin ? 'W' : 'L'}{count}
                          </span>
                        </Link>
                      );
                    })}
                    {activeStreaks.filter(s => s.current_streak !== 0).length === 0 && (
                      <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>No active streaks</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 3. Avg Point Differential */}
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

          {/* 4. Clutch Factor */}
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
                    <img
                      src={c.avatar_url}
                      alt={c.display_name}
                      className="w-7 h-7 rounded-full border"
                      style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.display_name}`; }}
                    />
                    <span className="flex-1 font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{c.display_name}</span>
                    <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{c.gp} close games</span>
                    <span className="font-display text-xl" style={{ color: 'var(--color-primary)' }}>{c.win_pct}%</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 5. Venue Kings */}
          {venueKings.length > 0 && (
            <div className="card">
              <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
                👑 Venue Kings
              </h2>
              <div className="flex flex-col gap-3">
                {venueKings.map((v) => (
                  <div key={v.venue_id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {v.venue_name}
                      </span>
                      <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                        {v.total_games} games
                      </span>
                    </div>
                    {v.king && (
                      <Link to={`/players/${v.king.user_id}`} className="flex items-center gap-1.5 hover:opacity-80">
                        <img
                          src={v.king.avatar_url}
                          alt={v.king.display_name}
                          className="w-6 h-6 rounded-full border"
                          style={{ borderColor: 'var(--color-border)' }}
                          onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.king.display_name}`; }}
                        />
                        <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-secondary)' }}>
                          {v.king.display_name} 👑
                        </span>
                        <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                          ({v.king.wins} wins)
                        </span>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. Elo Rankings */}
          {eloLeaders.length > 0 && (
            <div className="card">
              <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
                📈 Elo Rankings
              </h2>
              <div className="flex flex-col gap-2">
                {eloLeaders.map((u, i) => (
                  <Link key={u.id} to={`/players/${u.id}`} className="flex items-center gap-3 hover:opacity-80">
                    <span className="font-ui text-sm w-5 text-center" style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</span>
                    <img
                      src={u.avatar_url}
                      alt={u.display_name}
                      className="w-8 h-8 rounded-full border"
                      style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.display_name}`; }}
                    />
                    <div className="flex-1">
                      <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{u.display_name}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>{u.gp} GP</span>
                    </div>
                    <span className="font-display text-xl" style={{ color: 'var(--color-primary)' }}>
                      {Math.round(u.elo_rating)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 7. Weather Performance */}
          {weatherPerformers.length > 0 && (
            <div className="card">
              <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
                🌤️ Weather Performance
              </h2>
              <div className="flex flex-col gap-4">
                {weatherPerformers.map((w) => (
                  <div key={w.condition}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-lg">{getWeatherEmoji(w.condition)}</span>
                      <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{w.condition}</span>
                    </div>
                    <div className="flex flex-col gap-1 pl-7">
                      {w.players.slice(0, 1).map((p) => (
                        <Link key={p.user_id} to={`/players/${p.user_id}`} className="flex items-center gap-2 hover:opacity-80">
                          <img
                            src={p.avatar_url}
                            alt={p.display_name}
                            className="w-6 h-6 rounded-full border"
                            style={{ borderColor: 'var(--color-border)' }}
                            onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }}
                          />
                          <span className="font-ui text-sm flex-1" style={{ color: 'var(--color-text-primary)' }}>{p.display_name}</span>
                          <span className="font-ui font-bold text-sm" style={{ color: 'var(--color-primary)' }}>{p.win_pct}%</span>
                          <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{p.gp} GP</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. Top Rivalries */}
          <div className="card">
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
              ⚔️ Top Rivalries
            </h2>
            <div className="flex flex-col gap-4">
              {rivals.slice(0, 5).map((r, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <img
                      src={r.player1.avatar_url}
                      alt={r.player1.display_name}
                      className="w-7 h-7 rounded-full border"
                      style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.player1.display_name}`; }}
                    />
                    <Link to={`/players/${r.player1.id}`} className="font-ui font-semibold text-sm hover:underline" style={{ color: 'var(--color-text-primary)' }}>
                      {r.player1.display_name}
                    </Link>
                    <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>vs</span>
                    <img
                      src={r.player2.avatar_url}
                      alt={r.player2.display_name}
                      className="w-7 h-7 rounded-full border"
                      style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.player2.display_name}`; }}
                    />
                    <Link to={`/players/${r.player2.id}`} className="font-ui font-semibold text-sm hover:underline" style={{ color: 'var(--color-text-primary)' }}>
                      {r.player2.display_name}
                    </Link>
                    <span className="ml-auto text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{r.games_played} games</span>
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div style={{ width: `${Math.round((r.p1_wins / r.games_played) * 100)}%`, background: 'var(--color-primary)' }} />
                    <div style={{ flex: 1, background: 'var(--color-secondary)' }} />
                  </div>
                  <div className="flex justify-between text-xs font-ui mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    <span>{r.p1_wins}W</span>
                    <Link to="/stats" className="underline" style={{ color: 'var(--color-primary)' }}>H2H →</Link>
                    <span>{r.p2_wins}W</span>
                  </div>
                </div>
              ))}
              {rivals.length === 0 && (
                <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>Not enough games yet</div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
