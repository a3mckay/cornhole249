import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function Last5Dots({ last5 }) {
  return (
    <div className="flex gap-1" data-testid="last5-dots">
      {last5.slice(0, 5).map((result, i) => (
        <div
          key={i}
          className="w-3 h-3 rounded-full"
          style={{ background: result === 'W' ? '#16a34a' : '#dc2626' }}
          title={result}
        />
      ))}
      {Array.from({ length: Math.max(0, 5 - last5.length) }).map((_, i) => (
        <div key={`empty-${i}`} className="w-3 h-3 rounded-full bg-white/20" />
      ))}
    </div>
  );
}

const COLS = [
  { key: 'rank', label: '#', width: '2rem' },
  { key: 'name', label: 'Player', width: 'auto' },
  { key: 'gp', label: 'GP' },
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'L' },
  { key: 'pts', label: 'Pts' },
  { key: 'win_pct', label: 'Win%' },
  { key: 'plus_minus', label: '+/-' },
  { key: 'streak', label: 'Streak' },
  { key: 'last5', label: 'Last 5' },
];

export default function StandingsTable({ data, type = '1v1' }) {
  const [sortKey, setSortKey] = useState('pts');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...data].sort((a, b) => {
    if (sortKey === 'name') {
      const aName = type === '2v2' ? (a.players?.map((p) => p.display_name).join(' & ')) : a.display_name;
      const bName = type === '2v2' ? (b.players?.map((p) => p.display_name).join(' & ')) : b.display_name;
      return sortDir === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
    }
    if (sortKey === 'streak') {
      const aVal = parseStreak(a.streak);
      const bVal = parseStreak(b.streak);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  return (
    <div className="chalkboard table-scroll-wrapper">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr>
            {COLS.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left cursor-pointer select-none hover:opacity-80"
                style={{ width: col.width }}
                onClick={() => col.key !== 'last5' && handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isTopThree = i < 3;
            return (
              <tr
                key={row.user_id || row.key}
                className="border-t border-white/10 transition-colors"
                style={isTopThree ? { background: 'rgba(212,176,23,0.08)' } : undefined}
              >
                <td className="px-3 py-2 font-display text-lg opacity-70">{i + 1}</td>
                <td className="px-3 py-2">
                  {type === '1v1' ? (
                    <Link
                      to={`/players/${row.user_id}`}
                      className="flex items-center gap-2 hover:opacity-80"
                    >
                      <img
                        src={row.avatar_url}
                        alt={row.display_name}
                        className="w-7 h-7 rounded-full border border-white/30 object-cover"
                        onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.display_name}`; }}
                      />
                      <div>
                        <span className="font-semibold">{row.display_name}</span>
                        {row.nickname && (
                          <span className="ml-1 text-xs opacity-60">"{row.nickname}"</span>
                        )}
                      </div>
                      {isTopThree && i === 0 && <span>👑</span>}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-1">
                      {row.players?.map((p) => (
                        <Link key={p.user_id} to={`/players/${p.user_id}`} className="flex items-center gap-1 hover:opacity-80">
                          <img
                            src={p.avatar_url}
                            alt={p.display_name}
                            className="w-6 h-6 rounded-full border border-white/30"
                            onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }}
                          />
                          <span className="text-sm font-semibold">{p.display_name}</span>
                        </Link>
                      ))}
                      {row.players?.length > 1 && <span className="opacity-50 text-xs mx-1">&</span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{row.gp}</td>
                <td className="px-3 py-2 tabular-nums text-green-300 font-semibold">{row.wins}</td>
                <td className="px-3 py-2 tabular-nums text-red-300">{row.losses}</td>
                <td className="px-3 py-2 tabular-nums font-bold text-amber-300">{row.pts}</td>
                <td className="px-3 py-2 tabular-nums">{row.win_pct}%</td>
                <td
                  className="px-3 py-2 tabular-nums font-semibold"
                  style={{ color: row.plus_minus > 0 ? '#86efac' : row.plus_minus < 0 ? '#fca5a5' : undefined }}
                >
                  {row.plus_minus > 0 ? '+' : ''}{row.plus_minus}
                </td>
                <td className="px-3 py-2">
                  <StreakBadge streak={row.streak} />
                </td>
                <td className="px-3 py-2">
                  <Last5Dots last5={row.last5 || []} />
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="text-center py-8 opacity-50 font-ui">
                No standings data yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StreakBadge({ streak }) {
  if (!streak) return null;
  const isWin = streak.startsWith('W');
  const count = parseInt(streak.slice(1)) || 0;
  const isPulsing = isWin && count >= 3;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-ui font-bold ${isPulsing ? 'streak-pulse' : ''}`}
      style={{ background: isWin ? '#16a34a' : '#dc2626', color: 'white' }}
    >
      {streak}
    </span>
  );
}

function parseStreak(streak) {
  if (!streak) return 0;
  const isWin = streak.startsWith('W');
  const count = parseInt(streak.slice(1)) || 0;
  return isWin ? count : -count;
}
