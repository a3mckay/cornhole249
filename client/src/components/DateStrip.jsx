import React, { useState, useEffect } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VISIBLE = 7;

function parseLocalDate(dateStr) {
  // Use noon to avoid any midnight / DST edge cases
  return new Date(dateStr + 'T12:00:00');
}

const todayStr = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// gameDates: string[] of YYYY-MM-DD, ascending (oldest → newest)
export default function DateStrip({ gameDates = [], selectedDate, onSelect }) {
  // Start showing the most recent dates (end of array)
  const [windowStart, setWindowStart] = useState(() => Math.max(0, gameDates.length - VISIBLE));

  // When dates load, jump to the most recent window
  useEffect(() => {
    setWindowStart(Math.max(0, gameDates.length - VISIBLE));
  }, [gameDates.length]);

  const visible = gameDates.slice(windowStart, windowStart + VISIBLE);
  const canPrev = windowStart > 0;
  const canNext = windowStart + VISIBLE < gameDates.length;

  if (gameDates.length === 0) {
    return (
      <div
        className="w-fit flex items-center gap-2 px-4 py-2 rounded-2xl font-ui text-sm mb-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        <button
          onClick={() => onSelect(null)}
          className="px-3 py-1 rounded-xl font-extrabold text-xs uppercase"
          style={{ background: 'var(--color-primary)', color: 'white' }}
        >
          All
        </button>
        <span>No games logged yet</span>
      </div>
    );
  }

  return (
    <div
      className="w-fit max-w-full flex items-stretch gap-0.5 p-1 rounded-2xl overflow-x-auto mb-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* ‹ older */}
      <button
        onClick={() => setWindowStart((i) => Math.max(0, i - VISIBLE))}
        disabled={!canPrev}
        aria-label="Older dates"
        className="flex-shrink-0 flex items-center justify-center w-7 rounded-xl text-xl font-bold transition-opacity"
        style={{ color: 'var(--color-text-secondary)', opacity: canPrev ? 1 : 0.25, cursor: canPrev ? 'pointer' : 'default' }}
      >
        ‹
      </button>

      {/* All */}
      <button
        onClick={() => onSelect(null)}
        className="flex-shrink-0 flex items-center justify-center px-3 rounded-xl min-w-[36px] font-ui font-extrabold text-xs uppercase tracking-wide transition-colors"
        style={
          !selectedDate
            ? { background: 'var(--color-primary)', color: 'white' }
            : { color: 'var(--color-text-secondary)' }
        }
      >
        All
      </button>

      {/* divider */}
      <div
        className="flex-shrink-0 w-px self-stretch mx-0.5"
        style={{ background: 'var(--color-border)' }}
      />

      {/* Game date buttons */}
      {visible.map((dateStr) => {
        const day = parseLocalDate(dateStr);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;

        let bg = 'transparent';
        let color = 'var(--color-text-secondary)';
        if (isSelected) { bg = 'var(--color-primary)'; color = 'white'; }
        else if (isToday) { bg = 'rgba(58,107,53,0.10)'; color = '#3A6B35'; }

        return (
          <button
            key={dateStr}
            onClick={() => onSelect(isSelected ? null : dateStr)}
            className="flex-shrink-0 flex flex-col items-center justify-center px-2.5 py-1.5 rounded-xl min-w-[52px] transition-colors hover:opacity-80"
            style={{ background: bg, color }}
          >
            <span className="text-[10px] font-ui font-bold uppercase leading-none mb-0.5 tracking-wide">
              {isToday ? 'Today' : DAYS[day.getDay()]}
            </span>
            <span className="text-[13px] font-ui font-bold leading-none">
              {MONTHS[day.getMonth()]} {day.getDate()}
            </span>
          </button>
        );
      })}

      {/* › newer */}
      <button
        onClick={() => setWindowStart((i) => Math.min(i + VISIBLE, Math.max(0, gameDates.length - VISIBLE)))}
        disabled={!canNext}
        aria-label="Newer dates"
        className="flex-shrink-0 flex items-center justify-center w-7 rounded-xl text-xl font-bold transition-opacity"
        style={{ color: 'var(--color-text-secondary)', opacity: canNext ? 1 : 0.25, cursor: canNext ? 'pointer' : 'default' }}
      >
        ›
      </button>
    </div>
  );
}
