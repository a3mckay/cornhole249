import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { gamesApi, oddsApi, venuesApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import WeatherBadge from '../components/WeatherBadge';
import CommentSection from '../components/CommentSection';
import OddsBar from '../components/OddsBar';

export default function GameDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [odds, setOdds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editVenues, setEditVenues] = useState([]);
  const [editFields, setEditFields] = useState({});

  useEffect(() => {
    gamesApi.get(id).then((g) => {
      setGame(g);
      // Fetch retroactive odds
      const team1 = g.participants.filter((p) => p.team === 1).map((p) => p.user_id);
      const team2 = g.participants.filter((p) => p.team === 2).map((p) => p.user_id);
      oddsApi.calculate({ type: g.game_type, team1, team2 })
        .then(setOdds)
        .catch(() => {});
    }).catch(() => navigate('/games')).finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Delete this game? This cannot be undone.')) return;
    setDeleting(true);
    await gamesApi.delete(id);
    navigate('/games');
  };

  const openEdit = () => {
    const t1 = game.participants.filter((p) => p.team === 1);
    const t2 = game.participants.filter((p) => p.team === 2);
    setEditFields({
      played_at: game.played_at ? game.played_at.slice(0, 16) : '',
      venue_id: game.venue_id || '',
      t1_score: t1[0]?.score ?? '',
      t2_score: t2[0]?.score ?? '',
    });
    venuesApi.list().then(setEditVenues).catch(() => {});
    setEditError('');
    setEditing(true);
  };

  const handleEditSave = async () => {
    const t1s = parseInt(editFields.t1_score);
    const t2s = parseInt(editFields.t2_score);
    if (isNaN(t1s) || isNaN(t2s) || t1s < 0 || t2s < 0) {
      setEditError('Scores must be non-negative integers');
      return;
    }
    if (t1s > 10 || t2s > 10) {
      setEditError('Maximum score is 10');
      return;
    }
    if (t1s === t2s) {
      setEditError('Games cannot end in a tie');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await gamesApi.update(id, {
        played_at: editFields.played_at ? new Date(editFields.played_at).toISOString() : undefined,
        venue_id: editFields.venue_id || null,
        t1_score: t1s,
        t2_score: t2s,
      });
      setGame({ ...game, ...updated });
      // Reload the full game to get fresh participants
      const full = await gamesApi.get(id);
      setGame(full);
      setEditing(false);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>;
  if (!game) return null;

  const team1 = game.participants.filter((p) => p.team === 1);
  const team2 = game.participants.filter((p) => p.team === 2);
  // Use first player's score — in 2v2, all teammates share the same team score
  const t1Score = team1[0]?.score ?? 0;
  const t2Score = team2[0]?.score ?? 0;
  const t1Won = team1[0]?.is_winner === 1;
  const weather = game.weather || (game.weather_json ? JSON.parse(game.weather_json) : null);

  const teamLabel = (players) => players.map((p) => p.display_name).join(' & ');

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/games" className="text-sm font-ui hover:underline mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
            ← Games
          </Link>
          <h1 className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>
            Game #{game.id}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 rounded-full text-xs font-ui font-bold"
              style={{ background: game.game_type === '1v1' ? '#DBEAFE' : '#F3E8FF', color: game.game_type === '1v1' ? '#1E40AF' : '#7E22CE' }}>
              {game.game_type}
            </span>
            <span className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              {new Date(game.played_at).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>
        {!!user?.is_admin && (
          <div className="flex gap-2">
            <button onClick={openEdit} className="btn btn-ghost text-sm">✏️ Edit</button>
            <button onClick={handleDelete} disabled={deleting} className="btn btn-danger text-sm">
              {deleting ? 'Deleting...' : '🗑️ Delete'}
            </button>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <div className="card mb-5">
        <div className="grid grid-cols-3 text-center items-center gap-2">
          {/* Team 1 */}
          <div className={`p-4 rounded-xl ${t1Won ? 'bg-green-50' : ''}`}>
            <div className="flex justify-center gap-1 mb-2">
              {team1.map((p) => (
                <Link key={p.user_id} to={`/players/${p.user_id}`}>
                  <img src={p.avatar_url} alt={p.display_name} className="w-10 h-10 rounded-full border-2"
                    style={{ borderColor: t1Won ? '#16a34a' : 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }} />
                </Link>
              ))}
            </div>
            <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {team1.map((p) => p.display_name).join(' & ')}
            </div>
            <div className="font-display text-5xl mt-2" style={{ color: t1Won ? '#16a34a' : 'var(--color-text-secondary)' }}>
              {t1Score}
            </div>
            {t1Won && <div className="text-2xl mt-1">🏆</div>}
          </div>

          {/* VS */}
          <div>
            <div className="font-display text-3xl" style={{ color: 'var(--color-text-secondary)' }}>vs</div>
            <div className="text-xs font-ui mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Season {game.season}
            </div>
          </div>

          {/* Team 2 */}
          <div className={`p-4 rounded-xl ${!t1Won ? 'bg-green-50' : ''}`}>
            <div className="flex justify-center gap-1 mb-2">
              {team2.map((p) => (
                <Link key={p.user_id} to={`/players/${p.user_id}`}>
                  <img src={p.avatar_url} alt={p.display_name} className="w-10 h-10 rounded-full border-2"
                    style={{ borderColor: !t1Won ? '#16a34a' : 'var(--color-border)' }}
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }} />
                </Link>
              ))}
            </div>
            <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {team2.map((p) => p.display_name).join(' & ')}
            </div>
            <div className="font-display text-5xl mt-2" style={{ color: !t1Won ? '#16a34a' : 'var(--color-text-secondary)' }}>
              {t2Score}
            </div>
            {!t1Won && <div className="text-2xl mt-1">🏆</div>}
          </div>
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        {/* Weather */}
        {weather ? (
          <div>
            <h3 className="font-display text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>Weather</h3>
            <WeatherBadge weather={weather} size="lg" />
          </div>
        ) : (
          <div className="card text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            🌡️ Weather unavailable
          </div>
        )}

        {/* Venue */}
        {game.venue_name && (
          <div className="card">
            <h3 className="font-display text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>Venue</h3>
            <div className="font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>📍 {game.venue_name}</div>
          </div>
        )}
      </div>

      {/* Retroactive Odds */}
      {odds && (
        <div className="mb-5">
          <h3 className="font-display text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
            Pre-Game Odds
          </h3>
          <OddsBar odds={odds} team1Label={teamLabel(team1)} team2Label={teamLabel(team2)} />
        </div>
      )}

      {/* Admin Edit Panel */}
      {editing && (
        <div className="card mb-5" style={{ borderColor: 'var(--color-secondary)', borderWidth: 2 }}>
          <h3 className="font-display text-lg mb-4" style={{ color: 'var(--color-text-primary)' }}>✏️ Edit Game</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Date & Time</label>
              <input
                type="datetime-local"
                value={editFields.played_at}
                onChange={(e) => setEditFields((f) => ({ ...f, played_at: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Venue</label>
              <select
                value={editFields.venue_id}
                onChange={(e) => setEditFields((f) => ({ ...f, venue_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                <option value="">No venue</option>
                {editVenues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>
                  {teamLabel(team1)} Score
                </label>
                <input
                  type="number" min="0" max="10"
                  value={editFields.t1_score}
                  onChange={(e) => setEditFields((f) => ({ ...f, t1_score: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border font-ui text-center text-xl font-bold"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-secondary)' }}>
                  {teamLabel(team2)} Score
                </label>
                <input
                  type="number" min="0" max="10"
                  value={editFields.t2_score}
                  onChange={(e) => setEditFields((f) => ({ ...f, t2_score: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border font-ui text-center text-xl font-bold"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-secondary)' }}
                />
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

      {/* Comments */}
      <div className="card">
        <CommentSection gameId={game.id} comments={game.comments || []} />
      </div>
    </div>
  );
}
