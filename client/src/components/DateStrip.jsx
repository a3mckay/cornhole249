import React, { useState, useCallback } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const todayStr = toLocalDateStr(new Date());

export default function DateStrip({ selectedDate, onSelect }) {
  // Keep the 7-day window centered on today initially; shift by 7 on arrow click
  const [windowStart, setWindowStart] = useState(() => addDays(startOfToday(), -3));

  const days = Array.from({ length: 7 }, (_, i) => addDays(windowStart, i));

  const prev = useCallback(() => setWindowStart((d) => addDays(d, -7)), []);
  const next = useCallback(() => setWindowStart((d) => addDays(d, 7)), []);

  const handleAll = () => {
    onSelect(null);
    setWindowStart(addDays(startOfToday(), -3)); // snap back to today
  };

  return (
    <div
      className="flex items-stretch gap-0.5 p-1 rounded-2xl overflow-x-auto"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* ‹ prev week */}
      <button
        onClick={prev}
        aria-label="Previous week"
        className="flex-shrink-0 flex items-center justify-center w-8 rounded-xl text-2xl font-bold transition-opacity hover:opacity-40"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        ‹
      </button>

      {/* All pill */}
      <button
        onClick={handleAll}
        className="flex-shrink-0 flex items-center justify-center px-3 rounded-xl min-w-[40px] font-ui font-extrabold text-xs uppercase tracking-wide transition-colors"
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
        className="flex-shrink-0 w-px self-stretch mx-0.5 rounded-full"
        style={{ background: 'var(--color-border)' }}
      />

      {/* Day buttons */}
      {days.map((day) => {
        const dateStr = toLocalDateStr(day);
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
            className="flex-shrink-0 flex flex-col items-center justify-center px-2 py-1.5 rounded-xl min-w-[52px] transition-colors hover:opacity-80"
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

      {/* › next week */}
      <button
        onClick={next}
        aria-label="Next week"
        className="flex-shrink-0 flex items-center justify-center w-8 rounded-xl text-2xl font-bold transition-opacity hover:opacity-40"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        ›
      </button>
    </div>
  );
}
