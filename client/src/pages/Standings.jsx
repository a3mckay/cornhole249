import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useStandings } from '../hooks/useStandings';
import StandingsTable from '../components/StandingsTable';
import { standingsApi } from '../api';

const CURRENT_YEAR = new Date().getFullYear();
const SEASONS = Array.from({ length: CURRENT_YEAR - 2023 }, (_, i) => CURRENT_YEAR - i);
const PLAYER_COLORS = ['#3A6B35','#D48B2D','#B94040','#6366F1','#EC4899','#14B8A6','#F59E0B','#8B5CF6','#06B6D4','#84CC16'];

export default function Standings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [type, setTypeState] = useState(searchParams.get('type') || '1v1');
  const setType = (t) => {
    setTypeState(t);
    setSearchParams({ type: t });
  };
  const [season, setSeason] = useState(Math.max(...SEASONS));
  const { data, loading, error } = useStandings(type, season);
  const [historyData, setHistoryData] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // Clear chart data when type changes
  useEffect(() => {
    setHistoryData([]);
  }, [type]);

  // Load win% history for chart (both 1v1 and 2v2)
  useEffect(() => {
    if (!data.length) return;
    // Guard: wait for data matching the current type
    if (type === '1v1' && !data[0].user_id) return;
    if (type === '2v2' && !data[0].players) return;
    setHistLoading(true);

    if (type === '1v1') {
      const userIds = data.slice(0, 8).map((r) => r.user_id);
      Promise.all(
        userIds.map((id) => standingsApi.history(id, { season, type: '1v1' }).then((h) => ({ id, history: h })))
      ).then((results) => {
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
    } else {
      // 2v2: fetch history per pair
      const pairs = data.slice(0, 8);
      Promise.all(
        pairs.map((pair) =>
          standingsApi.team(pair.user_ids[0], pair.user_ids[1], { season })
            .then((t) => ({ pair, history: t.history }))
            .catch(() => ({ pair, history: [] }))
        )
      ).then((results) => {
        const maxGames = Math.max(...results.map((r) => r.history.length), 0);
        const chartData = [];
        for (let i = 0; i < maxGames; i++) {
          const point = { game: i + 1 };
          for (const { pair, history } of results) {
            const row = history[i];
            if (row) {
              const label = pair.players.map((p) => p.display_name).join(' & ');
              point[label] = row.cumulative_win_pct;
            }
          }
          chartData.push(point);
        }
        setHistoryData(chartData);
      }).finally(() => setHistLoading(false));
    }
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
      {historyData.length >= 1 && (
        <div className="card mt-8">
          <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            Win% Over Time
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData} margin={{ top: 5, right: 20, bottom: 30, left: 0 }}>
                <XAxis dataKey="game" label={{ value: 'Game #', position: 'insideBottom', offset: -12 }} tick={{ fontFamily: 'Nunito', fontSize: 11 }} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontFamily: 'Nunito', fontSize: 11 }}
                />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontFamily: 'Nunito', borderRadius: 12, border: '1px solid var(--color-border)' }} />
                <Legend wrapperStyle={{ fontFamily: 'Nunito', fontSize: 12, paddingTop: '12px' }} />
                {type === '1v1'
                  ? data.slice(0, 8).map((player, i) => (
                      <Line
                        key={player.user_id}
                        type="monotone"
                        dataKey={player.display_name}
                        stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))
                  : data.slice(0, 8).map((pair, i) => (
                      <Line
                        key={pair.key}
                        type="monotone"
                        dataKey={pair.players.map((p) => p.display_name).join(' & ')}
                        stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))
                }
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
