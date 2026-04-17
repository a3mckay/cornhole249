import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useStandings } from '../hooks/useStandings';
import StandingsTable from '../components/StandingsTable';
import { standingsApi } from '../api';
import { useEffect } from 'react';

const SEASONS = [2024, 2025];
const PLAYER_COLORS = ['#3A6B35','#D48B2D','#B94040','#6366F1','#EC4899','#14B8A6','#F59E0B','#8B5CF6','#06B6D4','#84CC16'];

export default function Standings() {
  const [type, setType] = useState('1v1');
  const [season, setSeason] = useState(Math.max(...SEASONS));
  const { data, loading, error } = useStandings(type, season);
  const [historyData, setHistoryData] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // Load win% history for chart
  useEffect(() => {
    if (type !== '1v1') return;
    if (!data.length) return;
    setHistLoading(true);

    const userIds = data.slice(0, 8).map((r) => r.user_id);
    Promise.all(
      userIds.map((id) => standingsApi.history(id, { season }).then((h) => ({ id, history: h })))
    ).then((results) => {
      // Merge into chart data: [{ game_number, [display_name]: win_pct, ... }]
      const maxGames = Math.max(...results.map((r) => r.history.length), 0);
      const chartData = [];
      for (let i = 0; i < maxGames; i++) {
        const point = { game: i + 1 };
        for (const { id, history } of results) {
          const row = history[i];
          if (row) {
            const player = data.find((d) => d.user_id === id);
            if (player) point[player.display_name] = row.cumulative_win_pct;
          }
        }
        chartData.push(point);
      }
      setHistoryData(chartData);
    }).finally(() => setHistLoading(false));
  }, [data, type, season]);

  return (
    <div>
      <h1 className="font-display text-4xl mb-6" style={{ color: 'var(--color-text-primary)' }}>
        Standings
      </h1>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap mb-5 items-center">
        {/* Type toggle */}
        <div className="flex rounded-full overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
          {['1v1', '2v2'].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-5 py-1.5 font-ui font-semibold text-sm transition-colors ${
                type === t
                  ? 'text-white'
                  : ''
              }`}
              style={{
                background: type === t ? 'var(--color-primary)' : 'var(--color-surface)',
                color: type === t ? 'white' : 'var(--color-text-secondary)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Season selector */}
        <select
          value={season}
          onChange={(e) => setSeason(parseInt(e.target.value))}
          className="px-4 py-1.5 rounded-full border font-ui font-semibold text-sm"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        >
          {SEASONS.map((s) => (
            <option key={s} value={s}>Season {s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="chalkboard p-8 text-center font-ui opacity-60">Loading standings...</div>
      ) : error ? (
        <div className="card text-center py-8 font-ui" style={{ color: 'var(--color-danger)' }}>{error}</div>
      ) : (
        <StandingsTable data={data} type={type} />
      )}

      {/* Win% Over Time Chart */}
      {type === '1v1' && historyData.length > 1 && (
        <div className="card mt-8">
          <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Win% Over Time
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData}>
                <XAxis dataKey="game" label={{ value: 'Game #', position: 'insideBottom', offset: -3 }} tick={{ fontFamily: 'Nunito', fontSize: 11 }} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontFamily: 'Nunito', fontSize: 11 }}
                />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontFamily: 'Nunito', borderRadius: 12, border: '1px solid var(--color-border)' }} />
                <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 12 }} />
                {data.slice(0, 8).map((player, i) => (
                  <Line
                    key={player.user_id}
                    type="monotone"
                    dataKey={player.display_name}
                    stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
