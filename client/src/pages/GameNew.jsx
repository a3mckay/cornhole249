import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gamesApi, venuesApi, usersApi } from '../api';
import { useAuth } from '../hooks/useAuth';

function PlayerSelect({ players, value, onChange, exclude, label }) {
  // Convert all IDs to numbers for a type-safe comparison
  const excludeSet = new Set(exclude.map(Number).filter(Boolean));
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="px-3 py-2 rounded-xl border font-ui text-sm w-full"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
    >
      <option value="">{label}</option>
      {players
        .filter((p) => !excludeSet.has(Number(p.id)))
        .map((p) => (
          <option key={p.id} value={p.id}>{p.display_name} "{p.nickname}"</option>
        ))}
    </select>
  );
}

export default function GameNew({ onAchievement }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [gameType, setGameType] = useState('1v1');
  const [t1p1, setT1p1] = useState('');
  const [t1p2, setT1p2] = useState('');
  const [t2p1, setT2p1] = useState('');
  const [t2p2, setT2p2] = useState('');
  const [t1score, setT1score] = useState('');
  const [t2score, setT2score] = useState('');
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0,16));
  const [venueId, setVenueId] = useState('');
  const [newVenueName, setNewVenueName] = useState('');
  const [venues, setVenues] = useState([]);
  const [players, setPlayers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [newVenueLat, setNewVenueLat] = useState(null);
  const [newVenueLng, setNewVenueLng] = useState(null);

  useEffect(() => {
    Promise.all([venuesApi.list(), usersApi.list()]).then(([v, u]) => {
      setVenues(v);
      setPlayers(u);
      if (user) setT1p1(user.id);
    });
  }, [user]);

  const allSelected = () => {
    if (gameType === '1v1') return t1p1 && t2p1;
    return t1p1 && t1p2 && t2p1 && t2p2;
  };

  const selectedIds = [t1p1, t1p2, t2p1, t2p2].filter(Boolean);
  const hasDuplicates = new Set(selectedIds).size !== selectedIds.length;

  const getLocation = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewVenueLat(pos.coords.latitude);
        setNewVenueLng(pos.coords.longitude);
        setNewVenueName(`My Location (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
        setGeoLoading(false);
      },
      () => {
        alert('Geolocation unavailable. Enter venue name manually.');
        setGeoLoading(false);
      }
    );
  };

  const validate = () => {
    const errs = [];
    if (!allSelected()) errs.push('Select all players');
    if (hasDuplicates) errs.push('A player cannot be on both teams');
    const s1 = parseInt(t1score);
    const s2 = parseInt(t2score);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) errs.push('Scores must be non-negative integers');
    if (s1 > 99 || s2 > 99) errs.push('Score seems too high');
    if (s1 === s2) errs.push('Games cannot end in a tie');
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setSubmitting(true);

    try {
      let finalVenueId = venueId;

      // Create new venue if the "new" option is selected and a name was entered
      if (venueId === 'new') {
        if (!newVenueName.trim()) {
          setErrors(['Enter a venue name or select an existing venue']);
          setSubmitting(false);
          return;
        }
        const v = await venuesApi.create({ name: newVenueName.trim(), lat: newVenueLat, lng: newVenueLng });
        finalVenueId = v.id;
      }

      const s1 = parseInt(t1score);
      const s2 = parseInt(t2score);

      const team1 = gameType === '1v1'
        ? [{ user_id: t1p1, score: s1 }]
        : [{ user_id: t1p1, score: s1 }, { user_id: t1p2, score: s1 }];

      const team2 = gameType === '1v1'
        ? [{ user_id: t2p1, score: s2 }]
        : [{ user_id: t2p1, score: s2 }, { user_id: t2p2, score: s2 }];

      const game = await gamesApi.create({
        game_type: gameType,
        played_at: new Date(playedAt).toISOString(),
        season: new Date(playedAt).getFullYear(),
        venue_id: finalVenueId || null,
        team1,
        team2,
      });

      navigate(`/games/${game.id}`);
    } catch (err) {
      setErrors([err.response?.data?.error || 'Failed to submit game']);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="card text-center py-16 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
        <div className="text-3xl mb-3">🔒</div>
        Sign in to log a game
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-display text-4xl mb-6" style={{ color: 'var(--color-text-primary)' }}>
        Log a Game
      </h1>

      {/* Step indicators */}
      <div className="flex gap-2 mb-6">
        {[1,2,3].map((s) => (
          <div
            key={s}
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={() => s < step && setStep(s)}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-ui font-bold"
              style={{
                background: step >= s ? 'var(--color-primary)' : 'var(--color-border)',
                color: step >= s ? 'white' : 'var(--color-text-secondary)',
              }}
            >
              {step > s ? '✓' : s}
            </div>
            <span className="text-sm font-ui hidden sm:inline" style={{ color: step === s ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
              {s === 1 ? 'Game Type' : s === 2 ? 'Players & Score' : 'Details'}
            </span>
            {s < 3 && <span className="text-border ml-2">→</span>}
          </div>
        ))}
      </div>

      <div className="card">
        {/* Step 1: Game Type */}
        {step === 1 && (
          <div>
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Select Game Type</h2>
            <div className="grid grid-cols-2 gap-4">
              {['1v1', '2v2'].map((t) => (
                <button
                  key={t}
                  onClick={() => setGameType(t)}
                  className={`p-6 rounded-2xl border-2 text-center transition-all ${gameType === t ? 'border-primary' : 'border-border'}`}
                  style={{
                    background: gameType === t ? 'rgba(58,107,53,0.08)' : 'var(--color-surface)',
                    borderColor: gameType === t ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  <div className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>{t}</div>
                  <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                    {t === '1v1' ? 'One on one' : 'Two vs two'}
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(2)} className="btn btn-primary w-full mt-6">
              Next →
            </button>
          </div>
        )}

        {/* Step 2: Players & Scores */}
        {step === 2 && (
          <div>
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Players & Score</h2>

            {/* Team 1 */}
            <div className="mb-4">
              <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>Team 1</div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <PlayerSelect players={players} value={t1p1} onChange={setT1p1} exclude={[t1p2, t2p1, t2p2].filter(Boolean)} label="Player 1" />
                </div>
                {gameType === '2v2' && (
                  <div className="flex-1 min-w-[140px]">
                    <PlayerSelect players={players} value={t1p2} onChange={setT1p2} exclude={[t1p1, t2p1, t2p2].filter(Boolean)} label="Player 2" />
                  </div>
                )}
              </div>
              <input
                type="number"
                min="0"
                max="99"
                value={t1score}
                onChange={(e) => setT1score(e.target.value)}
                placeholder="Score"
                className="mt-2 w-full px-3 py-2 rounded-xl border font-ui text-center text-2xl font-bold"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
              />
            </div>

            <div className="text-center text-xl font-display mb-4" style={{ color: 'var(--color-text-secondary)' }}>vs</div>

            {/* Team 2 */}
            <div className="mb-4">
              <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>Team 2</div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <PlayerSelect players={players} value={t2p1} onChange={setT2p1} exclude={[t1p1, t1p2, t2p2].filter(Boolean)} label="Player 1" />
                </div>
                {gameType === '2v2' && (
                  <div className="flex-1 min-w-[140px]">
                    <PlayerSelect players={players} value={t2p2} onChange={setT2p2} exclude={[t1p1, t1p2, t2p1].filter(Boolean)} label="Player 2" />
                  </div>
                )}
              </div>
              <input
                type="number"
                min="0"
                max="99"
                value={t2score}
                onChange={(e) => setT2score(e.target.value)}
                placeholder="Score"
                className="mt-2 w-full px-3 py-2 rounded-xl border font-ui text-center text-2xl font-bold"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-secondary)' }}
              />
            </div>

            {hasDuplicates && (
              <div className="text-sm font-ui p-2 rounded-lg mb-3" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
                ⚠️ A player cannot be on both teams
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn btn-ghost flex-1">← Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!allSelected() || hasDuplicates || !t1score || !t2score}
                className="btn btn-primary flex-2 flex-1"
                style={{ opacity: (!allSelected() || !t1score || !t2score) ? 0.5 : 1 }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 3 && (
          <div>
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Game Details</h2>

            <div className="flex flex-col gap-4">
              {/* Date/Time */}
              <div>
                <label className="block text-sm font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Date & Time</label>
                <input
                  type="datetime-local"
                  value={playedAt}
                  onChange={(e) => setPlayedAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>

              {/* Venue */}
              <div>
                <label className="block text-sm font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Venue</label>
                <select
                  value={venueId}
                  onChange={(e) => { setVenueId(e.target.value); setErrors([]); }}
                  className="w-full px-3 py-2 rounded-xl border font-ui text-sm mb-2"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  <option value="">Select a venue...</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  <option value="new">+ Create new venue</option>
                </select>

                {venueId === 'new' && (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Venue name"
                      value={newVenueName}
                      onChange={(e) => setNewVenueName(e.target.value)}
                      className="px-3 py-2 rounded-xl border font-ui text-sm"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                    <button
                      type="button"
                      onClick={getLocation}
                      disabled={geoLoading}
                      className="btn btn-ghost text-sm"
                    >
                      {geoLoading ? 'Getting location...' : '📍 Use My Location'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {errors.length > 0 && (
              <div className="mt-4 p-3 rounded-xl" style={{ background: '#FEE2E2' }}>
                {errors.map((e) => (
                  <div key={e} className="text-sm font-ui" style={{ color: 'var(--color-danger)' }}>⚠️ {e}</div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-6">
              <button onClick={() => setStep(2)} className="btn btn-ghost flex-1">← Back</button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn btn-primary flex-1"
              >
                {submitting ? 'Saving...' : '🏆 Submit Game'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
