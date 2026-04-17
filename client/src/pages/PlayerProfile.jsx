import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usersApi, achievementsApi, statsApi, standingsApi, gamesApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import AchievementBadge from '../components/AchievementBadge';
import GameCard from '../components/GameCard';

const CONDITION_COLORS = { 'Clear': '#F59E0B', 'Partly Cloudy': '#6B7280', 'Rain': '#3B82F6', 'Overcast': '#9CA3AF', 'Drizzle': '#60A5FA', 'Heavy Rain': '#1D4ED8', 'Thunderstorm': '#7C3AED' };

export default function PlayerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [player, setPlayer] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [weatherStats, setWeatherStats] = useState([]);
  const [venueStats, setVenueStats] = useState([]);
  const [history, setHistory] = useState([]);
  const [h2h, setH2h] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const fileInputRef = useRef(null);

  const isOwn = currentUser?.id === parseInt(id);
  const isAdmin = !!currentUser?.is_admin;
  const canEdit = isOwn || isAdmin;
  const canDelete = isAdmin && !isOwn;

  useEffect(() => {
    Promise.all([
      usersApi.get(id),
      achievementsApi.forUser(id),
      statsApi.weather({ user_id: id }),
      statsApi.venue({ user_id: id }),
      standingsApi.history(id),
      gamesApi.list({ user_id: id, limit: 10 }),
      usersApi.list(),
    ]).then(([p, ach, ws, vs, hist, games, users]) => {
      setPlayer(p);
      setAchievements(ach);
      setWeatherStats(ws);
      setVenueStats(vs);
      setHistory(hist);
      setRecentGames(games.games || []);
      setAllUsers(users);
    }).finally(() => setLoading(false));
  }, [id]);

  // Load H2H vs all opponents
  useEffect(() => {
    if (!player || !allUsers.length) return;
    const opponents = allUsers.filter((u) => u.id !== parseInt(id));
    Promise.all(
      opponents.map((opp) =>
        statsApi.h2h({ player1: id, player2: opp.id })
          .then((h) => ({ ...h, opponent: opp }))
          .catch(() => null)
      )
    ).then((results) => {
      setH2h(results.filter((r) => r && r.total_games > 0));
    });
  }, [player, allUsers]);

  const openEdit = () => {
    setEditFields({
      display_name: player.display_name,
      nickname: player.nickname || '',
      handedness: player.handedness || 'right',
    });
    setAvatarPreview(null);
    setEditError('');
    setEditing(true);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      setEditError('Image must be under 1.5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleEditSave = async () => {
    if (!editFields.display_name?.trim()) {
      setEditError('Name cannot be empty');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const payload = {
        display_name: editFields.display_name.trim(),
        nickname: editFields.nickname.trim() || null,
        handedness: editFields.handedness,
      };
      if (avatarPreview) payload.avatar_url = avatarPreview;
      const updated = await usersApi.update(id, payload);
      setPlayer((p) => ({ ...p, ...updated }));
      setEditing(false);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${player.display_name}? This cannot be undone.`)) return;
    try {
      await usersApi.delete(id);
      navigate('/players');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete player');
    }
  };

  if (loading) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>;
  if (!player) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-danger)' }}>Player not found</div>;

  const career = player.career || {};
  const winPct = career.gp > 0 ? Math.round((career.wins / career.gp) * 100) : 0;
  const avatarSrc = avatarPreview || player.avatar_url;

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/players" className="text-sm font-ui hover:underline mb-4 block" style={{ color: 'var(--color-text-secondary)' }}>
        ← Players
      </Link>

      {/* Profile header */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
          {/* Avatar */}
          <div className="relative">
            <img
              src={avatarSrc}
              alt={player.display_name}
              className="w-24 h-24 rounded-full border-4 object-cover"
              style={{ borderColor: 'var(--color-secondary)' }}
              onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.display_name}`; }}
            />
            {!!player.is_admin && <span className="absolute -top-1 -right-1 text-xl">⭐</span>}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>
              {player.display_name}
            </h1>
            {player.nickname && (
              <div className="font-marker text-xl mt-0.5" style={{ color: 'var(--color-secondary)' }}>
                "{player.nickname}"
              </div>
            )}
            <div className="mt-2 font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {career.wins}W–{career.losses}L · {winPct}% Win Rate · Elo {Math.round(player.elo_rating)}
            </div>
            <div className="mt-1 font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Best streak: W{career.best_streak} · Worst: L{career.worst_streak} · +/-: {career.plus_minus > 0 ? '+' : ''}{career.plus_minus}
            </div>
            {player.handedness && (
              <div className="mt-1 font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {player.handedness === 'left' ? '🤚 Left-handed' : '✋ Right-handed'}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0">
            {canEdit && (
              <button onClick={openEdit} className="btn btn-ghost text-sm">✏️ Edit</button>
            )}
            {canDelete && (
              <button onClick={handleDelete} className="btn btn-danger text-sm">🗑️ Delete</button>
            )}
          </div>
        </div>

        {/* Edit panel */}
        {editing && (
          <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="font-display text-lg mb-4" style={{ color: 'var(--color-text-primary)' }}>Edit Profile</h3>
            <div className="flex flex-col gap-4">
              {/* Avatar upload */}
              <div className="flex items-center gap-4">
                <img
                  src={avatarPreview || player.avatar_url}
                  alt="preview"
                  className="w-16 h-16 rounded-full border-2 object-cover"
                  style={{ borderColor: 'var(--color-border)' }}
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.display_name}`; }}
                />
                <div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-ghost text-sm"
                  >
                    📷 Change Photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <div className="text-xs font-ui mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    JPG, PNG, GIF · max 1.5 MB
                  </div>
                </div>
              </div>

              {/* Display name */}
              <div>
                <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Display Name</label>
                <input
                  type="text"
                  value={editFields.display_name}
                  onChange={(e) => setEditFields((f) => ({ ...f, display_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>

              {/* Nickname */}
              <div>
                <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Nickname <span className="font-normal opacity-60">(optional)</span></label>
                <input
                  type="text"
                  value={editFields.nickname}
                  onChange={(e) => setEditFields((f) => ({ ...f, nickname: e.target.value }))}
                  placeholder='e.g. "The Corninator"'
                  className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>

              {/* Handedness */}
              <div>
                <label className="block text-xs font-ui font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>Throwing Hand</label>
                <div className="flex gap-3">
                  {['right', 'left'].map((h) => (
                    <label key={h} className="flex items-center gap-2 cursor-pointer font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      <input
                        type="radio"
                        name="handedness"
                        value={h}
                        checked={editFields.handedness === h}
                        onChange={() => setEditFields((f) => ({ ...f, handedness: h }))}
                      />
                      {h === 'right' ? '✋ Right' : '🤚 Left'}
                    </label>
                  ))}
                </div>
              </div>

              {editError && (
                <div className="text-sm font-ui p-2 rounded-lg" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
                  ⚠️ {editError}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="btn btn-ghost flex-1">Cancel</button>
                <button onClick={handleEditSave} disabled={editSaving} className="btn btn-primary flex-1">
                  {editSaving ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Season breakdown */}
        {player.seasons && player.seasons.length > 0 && (
          <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="font-display text-lg mb-3" style={{ color: 'var(--color-text-primary)' }}>Season Breakdown</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-sm font-ui">
              {player.seasons.map((s) => (
                <div key={s.season} className="p-2 rounded-xl text-center" style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <div className="font-bold">{s.season}</div>
                  <div>{s.wins}W {s.losses}L</div>
                  <div style={{ color: 'var(--color-text-secondary)' }}>{s.gp} GP</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Win% over time */}
      {history.length > 1 && (
        <div className="card mb-6">
          <h3 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>Win% Over Time</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={history}>
                <XAxis dataKey="game_number" tick={{ fontFamily: 'Nunito', fontSize: 11 }} />
                <YAxis domain={[0,100]} tickFormatter={(v) => `${v}%`} tick={{ fontFamily: 'Nunito', fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontFamily: 'Nunito', borderRadius: 12 }} />
                <Line type="monotone" dataKey="cumulative_win_pct" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Win%" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Achievements */}
      <div className="card mb-6">
        <h3 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Achievements ({achievements.filter((a) => a.earned).length}/{achievements.length})
        </h3>
        <div className="flex flex-wrap gap-3">
          {achievements.map((a) => <AchievementBadge key={a.key} achievement={a} />)}
        </div>
      </div>

      {/* H2H */}
      {h2h.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Head to Head
          </h3>
          <div className="flex flex-col gap-2">
            {h2h.sort((a,b) => b.total_games - a.total_games).map((r) => (
              <div key={r.opponent.id} className="flex items-center gap-3">
                <Link to={`/players/${r.opponent.id}`}>
                  <img src={r.opponent.avatar_url} alt={r.opponent.display_name} className="w-8 h-8 rounded-full border" style={{ borderColor: 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.opponent.display_name}`; }} />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{r.opponent.display_name}</div>
                </div>
                <div className="text-sm font-ui tabular-nums">
                  <span style={{ color: 'var(--color-primary)' }}>{r.p1_wins}W</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>–</span>
                  <span style={{ color: 'var(--color-danger)' }}>{r.p2_wins}L</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>({r.total_games} games)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weather & Venue stats */}
      <div className="grid sm:grid-cols-2 gap-5 mb-6">
        {weatherStats.length > 0 && (
          <div className="card">
            <h3 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>Weather Performance</h3>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={weatherStats} layout="vertical">
                  <XAxis type="number" domain={[0,100]} tickFormatter={(v) => `${v}%`} tick={{ fontFamily: 'Nunito', fontSize: 11 }} />
                  <YAxis type="category" dataKey="condition" tick={{ fontFamily: 'Nunito', fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontFamily: 'Nunito', borderRadius: 12 }} />
                  <Bar dataKey="win_pct" name="Win%">
                    {weatherStats.map((entry) => (
                      <Cell key={entry.condition} fill={CONDITION_COLORS[entry.condition] || '#6B7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {venueStats.length > 0 && (
          <div className="card">
            <h3 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>Venue Performance</h3>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={venueStats} layout="vertical">
                  <XAxis type="number" domain={[0,100]} tickFormatter={(v) => `${v}%`} tick={{ fontFamily: 'Nunito', fontSize: 11 }} />
                  <YAxis type="category" dataKey="venue_name" tick={{ fontFamily: 'Nunito', fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontFamily: 'Nunito', borderRadius: 12 }} />
                  <Bar dataKey="win_pct" name="Win%" fill="var(--color-primary)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Recent games */}
      <div>
        <h3 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>Recent Games</h3>
        <div className="flex flex-col gap-3">
          {recentGames.map((g) => <GameCard key={g.id} game={g} />)}
        </div>
      </div>
    </div>
  );
}
