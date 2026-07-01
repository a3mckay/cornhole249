import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gamesApi, venuesApi, usersApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLeague, useLeaguePath } from '../contexts/LeagueContext';
import { capture } from '../lib/analytics';
import { getSport } from '../sports';

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
          <option key={p.id} value={p.id} disabled={!!p.frozen_at}>
            {p.display_name}{p.nickname ? ` "${p.nickname}"` : ''}{p.frozen_at ? ' (access limited)' : ''}
          </option>
        ))}
    </select>
  );
}

// Pool variant metadata for the picker (sport === 'pool' only).
const POOL_VARIANTS = [
  { key: 'eight_ball',    label: '8-Ball',       emoji: '🎱', hint: 'Sink the 8 to win' },
  { key: 'nine_ball',     label: '9-Ball',       emoji: '9️⃣', hint: 'Lowest ball, sink the 9' },
  { key: 'straight_pool', label: 'Straight Pool', emoji: '🎯', hint: 'Race to a point total' },
  { key: 'cutthroat',     label: 'Cutthroat',    emoji: '🔪', hint: '1 winner vs 2 losers' },
];

export default function GameNew({ onAchievement }) {
  const { user } = useAuth();
  const { leagueRules, customRules, sport, raceToTarget } = useLeague();
  const isPool = sport === 'pool';
  // Indoor sports (pool, …) don't track weather, so we don't prompt for or
  // require a venue location. Cornhole (outdoor) keeps the existing flow.
  const isOutdoor = getSport(sport).outdoor !== false;
  const navigate = useNavigate();
  const lp = useLeaguePath();
  const [step, setStep] = useState(1);

  // Pool-only state. For pool, gameType is derived from variant + singles/doubles.
  const [gameVariant, setGameVariant] = useState('eight_ball');
  const [poolDoubles, setPoolDoubles] = useState(false); // singles is the default
  const [ballsRemaining, setBallsRemaining] = useState('');
  const [endCondition, setEndCondition] = useState(''); // '' | 'sunk' | 'scratch'
  const [poolWinner, setPoolWinner] = useState('team1'); // win/loss mode: which team won
  const [runnerUp, setRunnerUp] = useState('p1'); // cutthroat: which loser finished 2nd ('p1'|'p2')

  const [gameType, setGameType] = useState('1v1');
  const [t1p1, setT1p1] = useState('');
  const [t1p2, setT1p2] = useState('');
  const [t2p1, setT2p1] = useState('');
  const [t2p2, setT2p2] = useState('');
  const [t1score, setT1score] = useState('');
  const [t2score, setT2score] = useState('');
  const [playedAt, setPlayedAt] = useState(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  const [venueId, setVenueId] = useState('');
  const [newVenueName, setNewVenueName] = useState('');
  const [venues, setVenues] = useState([]);
  const [players, setPlayers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [newVenueLat, setNewVenueLat] = useState(null);
  const [newVenueLng, setNewVenueLng] = useState(null);
  const [existingVenueLat, setExistingVenueLat] = useState(null);
  const [existingVenueLng, setExistingVenueLng] = useState(null);
  const [updatingVenueLocation, setUpdatingVenueLocation] = useState(false);

  useEffect(() => {
    Promise.all([venuesApi.list(), usersApi.list()]).then(([v, u]) => {
      setVenues(v);
      setPlayers(u);
      if (user) setT1p1(user.id);
    });
  }, [user]);

  // For pool, the effective game_type is derived from the variant + singles/
  // doubles toggle. Cutthroat = 1 winner (team1) + 2 losers (team2).
  const isCutthroat = isPool && gameVariant === 'cutthroat';
  const effectiveType = isPool
    ? (isCutthroat ? 'cutthroat' : (poolDoubles ? '2v2' : '1v1'))
    : gameType;
  const scoreLabel = isPool ? 'Racks won' : 'Score';
  // Race-to-N is a racks-based target — only meaningful for rack/point variants
  // (not cutthroat, and not 8-ball which is scored single-rack via balls left).
  const raceActive =
    isPool && raceToTarget != null && !isCutthroat && gameVariant !== 'eight_ball';
  // Per-game (rack-level) win/loss entry: just pick the winner — no score boxes.
  // This is the pool default when Race-to-N is off; 8-ball is always here (it's
  // single-rack). Only race-on rack/point variants keep the numeric match score.
  const winLossMode = isPool && !isCutthroat && !raceActive;

  // Resolve a team's player names for the winner picker (falls back to a label).
  const teamName = (ids, fallback) =>
    ids.map((id) => players.find((p) => p.id === id)?.display_name).filter(Boolean).join(' & ') || fallback;

  const allSelected = () => {
    if (isCutthroat) return t1p1 && t2p1 && t2p2;
    if (effectiveType === '1v1') return t1p1 && t2p1;
    return t1p1 && t1p2 && t2p1 && t2p2;
  };

  const selectedIds = [t1p1, t1p2, t2p1, t2p2].filter(Boolean);
  const hasDuplicates = new Set(selectedIds).size !== selectedIds.length;

  const getLocationForNew = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setNewVenueLat(lat);
        setNewVenueLng(lng);
        setNewVenueName((n) => n || `My Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        setGeoLoading(false);
      },
      () => {
        alert('Could not get your location. Please allow location access and try again.');
        setGeoLoading(false);
      }
    );
  };

  const getLocationForExisting = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setGeoLoading(false);
        setUpdatingVenueLocation(true);
        try {
          await venuesApi.updateLocation(parseInt(venueId), lat, lng);
          setExistingVenueLat(lat);
          setExistingVenueLng(lng);
          setVenues((vs) => vs.map((v) => v.id === parseInt(venueId) ? { ...v, lat, lng } : v));
        } catch (e) {
          alert('Failed to update venue location');
        } finally {
          setUpdatingVenueLocation(false);
        }
      },
      () => {
        alert('Could not get your location. Please allow location access and try again.');
        setGeoLoading(false);
      }
    );
  };

  const selectedVenue = venues.find((v) => v.id === parseInt(venueId));
  const venueNeedsLocation = venueId && venueId !== 'new' && selectedVenue && !selectedVenue.lat;
  const newVenueNeedsLocation = isOutdoor && venueId === 'new' && (!newVenueLat || !newVenueLng);

  const validate = () => {
    const errs = [];
    if (!allSelected()) errs.push('Select all players');
    if (hasDuplicates) errs.push('A player cannot be on both teams');
    // Numeric scores only apply to cornhole and race-on pool. Cutthroat and
    // per-game win/loss pool derive the winner without a typed score.
    if (!isCutthroat && !winLossMode) {
      const s1 = parseInt(t1score);
      const s2 = parseInt(t2score);
      if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) errs.push(`${scoreLabel} must be non-negative integers`);
      if (s1 > 99 || s2 > 99) errs.push(`${scoreLabel} seems too high`);
      if (s1 === s2) errs.push('Games cannot end in a tie');
    }
    if (newVenueNeedsLocation) errs.push('Location is required to track weather for this game');
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

      // Win/loss mode encodes the result as 1–0 from the winner pick; numeric
      // modes (cornhole, race-on pool) read the typed scores.
      const s1 = winLossMode ? (poolWinner === 'team1' ? 1 : 0) : parseInt(t1score);
      const s2 = winLossMode ? (poolWinner === 'team1' ? 0 : 1) : parseInt(t2score);

      let team1, team2;
      if (isCutthroat) {
        // 1 winner (team1) vs 2 losers (team2); no scores. Placement records the
        // finish order so 2nd loses less Elo than 3rd: winner = 1, and the
        // runner-up pick decides which loser is 2 vs 3.
        team1 = [{ user_id: t1p1, placement: 1 }];
        team2 = [
          { user_id: t2p1, placement: runnerUp === 'p1' ? 2 : 3 },
          { user_id: t2p2, placement: runnerUp === 'p1' ? 3 : 2 },
        ];
      } else if (effectiveType === '1v1') {
        team1 = [{ user_id: t1p1, score: s1 }];
        team2 = [{ user_id: t2p1, score: s2 }];
      } else {
        team1 = [{ user_id: t1p1, score: s1 }, { user_id: t1p2, score: s1 }];
        team2 = [{ user_id: t2p1, score: s2 }, { user_id: t2p2, score: s2 }];
      }

      const payload = {
        game_type: effectiveType,
        played_at: new Date(playedAt).toISOString(),
        season: new Date(playedAt).getFullYear(),
        venue_id: finalVenueId || null,
        team1,
        team2,
      };
      if (isPool) {
        payload.game_variant = gameVariant;
        if (gameVariant === 'eight_ball') {
          payload.eight_ball_end_condition = endCondition || null;
          payload.balls_remaining = ballsRemaining !== '' ? parseInt(ballsRemaining) : null;
        }
      }

      const game = await gamesApi.create(payload);

      capture('game_logged', { game_type: effectiveType, sport, variant: isPool ? gameVariant : undefined });
      // pending = submitted to both_submit queue, no game id yet
      if (game.pending) {
        navigate(lp('games'), { state: { pendingSubmission: true } });
      } else {
        navigate(lp(`games/${game.id}`));
      }
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
        {/* First choice: a single game (this flow) or a best-of-N match. Picking
            match hands off to the match setup — keeps one "Log a Game" entry. */}
        {step === 1 && (
          <div className="flex gap-2 mb-5">
            <div className="flex-1 p-3 rounded-xl border-2 text-center" style={{ borderColor: 'var(--color-primary)', background: 'rgba(31,92,61,0.08)' }}>
              <div className="font-display text-base" style={{ color: 'var(--color-text-primary)' }}>🎯 Single game</div>
              <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>Log one result</div>
            </div>
            <button
              type="button"
              onClick={() => navigate(lp('matches/new'))}
              className="flex-1 p-3 rounded-xl border-2 text-center transition-all"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
            >
              <div className="font-display text-base">🏆 Best of # →</div>
              <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>Log a series</div>
            </button>
          </div>
        )}

        {/* Step 1: Game Type */}
        {step === 1 && !isPool && (
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

        {/* Step 1 (pool): Variant picker + singles/doubles */}
        {step === 1 && isPool && (
          <div>
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Select Variant</h2>
            <div className="grid grid-cols-2 gap-3">
              {POOL_VARIANTS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setGameVariant(v.key)}
                  className={`p-4 rounded-2xl border-2 text-center transition-all ${gameVariant === v.key ? 'border-primary' : 'border-border'}`}
                  style={{
                    background: gameVariant === v.key ? 'rgba(31,92,61,0.10)' : 'var(--color-surface)',
                    borderColor: gameVariant === v.key ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  <div className="text-3xl mb-1">{v.emoji}</div>
                  <div className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>{v.label}</div>
                  <div className="text-xs font-ui mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{v.hint}</div>
                </button>
              ))}
            </div>

            {/* Singles / doubles toggle (cutthroat is fixed 1 vs 2) */}
            {!isCutthroat && (
              <div className="mt-5">
                <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Format</div>
                <div className="grid grid-cols-2 gap-3">
                  {[{ k: false, label: 'Singles', hint: 'One on one' }, { k: true, label: 'Doubles', hint: 'Two vs two' }].map((f) => (
                    <button
                      key={String(f.k)}
                      onClick={() => setPoolDoubles(f.k)}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${poolDoubles === f.k ? 'border-primary' : 'border-border'}`}
                      style={{
                        background: poolDoubles === f.k ? 'rgba(31,92,61,0.10)' : 'var(--color-surface)',
                        borderColor: poolDoubles === f.k ? 'var(--color-primary)' : 'var(--color-border)',
                      }}
                    >
                      <div className="font-display text-lg" style={{ color: 'var(--color-text-primary)' }}>{f.label}</div>
                      <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{f.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isCutthroat && (
              <div className="mt-4 p-3 rounded-xl text-sm font-ui" style={{ background: 'rgba(31,92,61,0.07)', border: '1px solid rgba(31,92,61,0.2)', color: 'var(--color-text-secondary)' }}>
                🔪 Cutthroat: pick the <strong>winner</strong> first, then the two players who lost. No scores recorded.
              </div>
            )}

            <button onClick={() => setStep(2)} className="btn btn-primary w-full mt-6">
              Next →
            </button>
          </div>
        )}

        {/* Step 2: Players & Scores */}
        {step === 2 && (
          <div>
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>Players & Score</h2>

            {/* Race-to-N hint: this league plays first-to-N racks. */}
            {raceActive && (
              <div
                className="mb-4 px-3 py-2 rounded-xl text-sm font-ui flex items-center gap-2"
                style={{ background: 'rgba(31,92,61,0.08)', border: '1px solid rgba(31,92,61,0.2)', color: 'var(--color-primary)' }}
              >
                <span>🎱</span>
                <span>Race to <strong>{raceToTarget}</strong> — the winner should reach {raceToTarget} racks.</span>
                {t1score === '' && t2score === '' && (
                  <button
                    type="button"
                    onClick={() => setT1score(String(raceToTarget))}
                    className="ml-auto font-semibold underline"
                  >
                    Fill {raceToTarget}
                  </button>
                )}
              </div>
            )}

            {/* Team 1 (cutthroat: the lone winner) */}
            <div className="mb-4">
              <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>{isCutthroat ? 'Winner' : 'Team 1'}</div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <PlayerSelect players={players} value={t1p1} onChange={setT1p1} exclude={[t1p2, t2p1, t2p2].filter(Boolean)} label="Player 1" />
                </div>
                {effectiveType === '2v2' && (
                  <div className="flex-1 min-w-[140px]">
                    <PlayerSelect players={players} value={t1p2} onChange={setT1p2} exclude={[t1p1, t2p1, t2p2].filter(Boolean)} label="Player 2" />
                  </div>
                )}
              </div>
              {!isCutthroat && !winLossMode && (
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={t1score}
                  onChange={(e) => setT1score(e.target.value)}
                  placeholder={scoreLabel}
                  className="mt-2 w-full px-3 py-2 rounded-xl border font-ui text-center text-2xl font-bold"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
                />
              )}
            </div>

            <div className="text-center text-xl font-display mb-4" style={{ color: 'var(--color-text-secondary)' }}>vs</div>

            {/* Team 2 (cutthroat: the two losers) */}
            <div className="mb-4">
              <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>{isCutthroat ? 'Losers' : 'Team 2'}</div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <PlayerSelect players={players} value={t2p1} onChange={setT2p1} exclude={[t1p1, t1p2, t2p2].filter(Boolean)} label="Player 1" />
                </div>
                {(effectiveType === '2v2' || isCutthroat) && (
                  <div className="flex-1 min-w-[140px]">
                    <PlayerSelect players={players} value={t2p2} onChange={setT2p2} exclude={[t1p1, t1p2, t2p1].filter(Boolean)} label="Player 2" />
                  </div>
                )}
              </div>
              {!isCutthroat && !winLossMode && (
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={t2score}
                  onChange={(e) => setT2score(e.target.value)}
                  placeholder={scoreLabel}
                  className="mt-2 w-full px-3 py-2 rounded-xl border font-ui text-center text-2xl font-bold"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-secondary)' }}
                />
              )}
            </div>

            {/* Cutthroat: which loser finished 2nd (runner-up) vs 3rd (last).
                Only meaningful once both losers are picked. */}
            {isCutthroat && t2p1 && t2p2 && (
              <div className="mb-4">
                <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Who finished 2nd?</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'p1', label: teamName([t2p1], 'Player 1') },
                    { key: 'p2', label: teamName([t2p2], 'Player 2') },
                  ].map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRunnerUp(r.key)}
                      className="p-3 rounded-2xl border-2 text-center transition-all font-display text-lg"
                      style={{
                        background: runnerUp === r.key ? 'rgba(31,92,61,0.10)' : 'var(--color-surface)',
                        borderColor: runnerUp === r.key ? 'var(--color-primary)' : 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {runnerUp === r.key && <span className="mr-1">🥈</span>}{r.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs font-ui mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  The other player is recorded as 3rd (last). 2nd place loses slightly less rating than 3rd.
                </div>
              </div>
            )}

            {/* Win/loss pick — no rack score to type (per-game default). */}
            {winLossMode && (
              <div className="mb-4">
                <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Who won?</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'team1', label: teamName([t1p1, t1p2], 'Team 1') },
                    { key: 'team2', label: teamName([t2p1, t2p2], 'Team 2') },
                  ].map((w) => (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => setPoolWinner(w.key)}
                      className="p-4 rounded-2xl border-2 text-center transition-all font-display text-lg"
                      style={{
                        background: poolWinner === w.key ? 'rgba(31,92,61,0.10)' : 'var(--color-surface)',
                        borderColor: poolWinner === w.key ? 'var(--color-primary)' : 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {poolWinner === w.key && <span className="mr-1">🏆</span>}{w.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 8-ball extras: how it ended + loser's balls left on the table */}
            {isPool && gameVariant === 'eight_ball' && (
              <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(31,92,61,0.06)', border: '1px solid rgba(31,92,61,0.18)' }}>
                <div className="text-sm font-ui font-bold mb-2" style={{ color: 'var(--color-primary)' }}>🎱 8-Ball details (optional)</div>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>How did it end?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[{ k: 'sunk', label: 'Sank the 8' }, { k: 'scratch', label: 'Loser scratched' }].map((c) => (
                        <button
                          key={c.k}
                          type="button"
                          onClick={() => setEndCondition(endCondition === c.k ? '' : c.k)}
                          className="p-2 rounded-lg border-2 text-sm font-ui transition-all"
                          style={{
                            background: endCondition === c.k ? 'rgba(31,92,61,0.12)' : 'var(--color-surface)',
                            borderColor: endCondition === c.k ? 'var(--color-primary)' : 'var(--color-border)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Loser's balls left on table (0–7) — bigger margin = bigger ELO swing
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="7"
                      value={ballsRemaining}
                      onChange={(e) => setBallsRemaining(e.target.value)}
                      placeholder="e.g. 3"
                      className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Custom rules reminder */}
            {leagueRules === 'custom' && customRules && (
              <div
                className="mb-3 p-3 rounded-xl text-sm font-ui"
                style={{ background: 'rgba(58,107,53,0.07)', border: '1px solid rgba(58,107,53,0.2)', color: 'var(--color-text-secondary)' }}
              >
                <div className="font-semibold mb-1" style={{ color: 'var(--color-primary)' }}>📋 Custom Rules</div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  <span>🎯 Hole = {customRules.hole_points} pts</span>
                  <span>🟫 Board = {customRules.board_points} pts</span>
                  <span>🏁 Win at {customRules.target_score}{customRules.win_by > 1 ? ` (by ${customRules.win_by})` : ''}</span>
                  <span>{customRules.cancellation ? '↔ Cancellation on' : '➕ Count-all'}</span>
                  {customRules.first_throw !== 'random' && (
                    <span>🎲 First throw: {customRules.first_throw === 'last_winner' ? 'last winner' : 'home team'}</span>
                  )}
                </div>
              </div>
            )}

            {hasDuplicates && (
              <div className="text-sm font-ui p-2 rounded-lg mb-3" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
                ⚠️ A player cannot be on both teams
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn btn-ghost flex-1">← Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!allSelected() || hasDuplicates || (!isCutthroat && !winLossMode && (!t1score || !t2score))}
                className="btn btn-primary flex-2 flex-1"
                style={{ opacity: (!allSelected() || (!isCutthroat && !winLossMode && (!t1score || !t2score))) ? 0.5 : 1 }}
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
                  onChange={(e) => { setVenueId(e.target.value); setExistingVenueLat(null); setExistingVenueLng(null); setErrors([]); }}
                  className="w-full px-3 py-2 rounded-xl border font-ui text-sm mb-2"
                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  <option value="">Select a venue...</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}{!v.lat ? ' 📍?' : ''}</option>)}
                  <option value="new">+ Create new venue</option>
                </select>

                {/* New venue: name + required location */}
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
                    {isOutdoor && (
                      <>
                        <div className="p-3 rounded-xl text-sm font-ui" style={{ background: 'rgba(58,107,53,0.08)', border: '1px solid rgba(58,107,53,0.25)', color: 'var(--color-text-secondary)' }}>
                          📍 <strong>Location required</strong> — used to fetch weather data for this game.
                        </div>
                        {newVenueLat ? (
                          <div className="flex items-center gap-2 p-2 rounded-xl text-sm font-ui" style={{ background: '#D1FAE5', color: '#065F46' }}>
                            <span>✓ Location set ({newVenueLat.toFixed(4)}, {newVenueLng.toFixed(4)})</span>
                            <button type="button" onClick={getLocationForNew} className="ml-auto text-xs underline">Update</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={getLocationForNew}
                            disabled={geoLoading}
                            className="btn btn-primary text-sm"
                          >
                            {geoLoading ? 'Getting location...' : '📍 Set My Location'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Existing venue missing location */}
                {isOutdoor && venueNeedsLocation && (
                  <div className="flex flex-col gap-2 mt-1">
                    <div className="p-3 rounded-xl text-sm font-ui" style={{ background: 'rgba(212,139,45,0.1)', border: '1px solid rgba(212,139,45,0.4)', color: 'var(--color-text-secondary)' }}>
                      📍 <strong>No location saved for this venue.</strong> Pin it now so weather can be tracked for future games.
                    </div>
                    {existingVenueLat ? (
                      <div className="flex items-center gap-2 p-2 rounded-xl text-sm font-ui" style={{ background: '#D1FAE5', color: '#065F46' }}>
                        ✓ Location saved ({existingVenueLat.toFixed(4)}, {existingVenueLng.toFixed(4)})
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={getLocationForExisting}
                        disabled={geoLoading || updatingVenueLocation}
                        className="btn btn-ghost text-sm"
                        style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                      >
                        {(geoLoading || updatingVenueLocation) ? 'Saving...' : '📍 Pin This Venue'}
                      </button>
                    )}
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
