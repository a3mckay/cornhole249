import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { gamesApi, venuesApi, usersApi } from '../api';
import GameCard from '../components/GameCard';
import DateStrip from '../components/DateStrip';
import { useAuth } from '../hooks/useAuth';

const CURRENT_YEAR = new Date().getFullYear();
const SEASONS = Array.from({ length: CURRENT_YEAR - 2023 }, (_, i) => CURRENT_YEAR - i);

export default function Games() {
  const { user } = useAuth();
  const [games, setGames] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState([]);
  const [players, setPlayers] = useState([]);

  const [filters, setFilters] = useState({ type: '', season: '', venue_id: '', user_id: '' });
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    Promise.all([venuesApi.list(), usersApi.list()])
      .then(([v, u]) => { setVenues(v); setPlayers(u); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {
      page,
      limit: 12,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      ...(selectedDate ? { date: selectedDate } : {}),
    };
    gamesApi.list(params)
      .then((d) => { setGames(d.games); setTotal(d.total); })
      .finally(() => setLoading(false));
  }, [page, filters, selectedDate]);

  const handleFilter = (key, val) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setPage(1);
  };

  const totalPages = Math.ceil(total / 12);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>
          Game History
        </h1>
        {user && (
          <Link to="/games/new" className="btn btn-primary">
            + Log a Game
          </Link>
        )}
      </div>

      {/* Date strip */}
      <DateStrip selectedDate={selectedDate} onSelect={handleDateSelect} />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap mb-5">
        <select value={filters.type} onChange={(e) => handleFilter('type', e.target.value)}
          className="px-3 py-1.5 rounded-full border text-sm font-ui"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
          <option value="">All Types</option>
          <option value="1v1">1v1</option>
          <option value="2v2">2v2</option>
        </select>
        <select value={filters.season} onChange={(e) => handleFilter('season', e.target.value)}
          className="px-3 py-1.5 rounded-full border text-sm font-ui"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
          <option value="">All Seasons</option>
          {SEASONS.map((s) => <option key={s} value={s}>Season {s}</option>)}
        </select>
        <select value={filters.venue_id} onChange={(e) => handleFilter('venue_id', e.target.value)}
          className="px-3 py-1.5 rounded-full border text-sm font-ui"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
          <option value="">All Venues</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select value={filters.user_id} onChange={(e) => handleFilter('user_id', e.target.value)}
          className="px-3 py-1.5 rounded-full border text-sm font-ui"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
          <option value="">All Players</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        {(filters.type || filters.season || filters.venue_id || filters.user_id) && (
          <button
            onClick={() => { setFilters({ type: '', season: '', venue_id: '', user_id: '' }); setPage(1); }}
            className="px-3 py-1.5 rounded-full border text-sm font-ui font-semibold transition-colors hover:bg-red-50"
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
          >
            ✕ Clear
          </button>
        )}
        {selectedDate && (
          <div
            className="px-3 py-1.5 rounded-full border text-sm font-ui font-semibold"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'rgba(58,107,53,0.07)' }}
          >
            📅 {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      {/* Total */}
      <div className="text-sm font-ui mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        {total} games found
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="card h-36 animate-pulse" style={{ background: 'var(--color-border)' }} />)}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((g) => <GameCard key={g.id} game={g} />)}
          {games.length === 0 && (
            <div className="col-span-full card text-center py-12 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              No games match your filters.
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn btn-ghost" style={{ opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
          <span className="flex items-center font-ui font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            {page} / {totalPages}
          </span>
          <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="btn btn-ghost" style={{ opacity: page === totalPages ? 0.4 : 1 }}>Next →</button>
        </div>
      )}
    </div>
  );
}
