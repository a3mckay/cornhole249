import React, { useState, useEffect } from 'react';
import { usersApi, oddsApi } from '../api';
import OddsBar from '../components/OddsBar';

export default function Odds() {
  const [players, setPlayers] = useState([]);
  const [gameType, setGameType] = useState('1v1');
  const [t1p1, setT1p1] = useState('');
  const [t1p2, setT1p2] = useState('');
  const [t2p1, setT2p1] = useState('');
  const [t2p2, setT2p2] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { usersApi.list().then(setPlayers); }, []);

  // All selected IDs except the one currently held by this slot
  const takenExcept = (ownValue) =>
    new Set([t1p1, t1p2, t2p1, t2p2].filter((v) => v && v !== ownValue).map(Number));

  // When a slot changes, clear any other slot that had the same player
  const setAndDedup = (setter, newVal) => {
    if (!newVal) { setter(''); setResult(null); return; }
    if (t1p1 === newVal && setter !== setT1p1) setT1p1('');
    if (t1p2 === newVal && setter !== setT1p2) setT1p2('');
    if (t2p1 === newVal && setter !== setT2p1) setT2p1('');
    if (t2p2 === newVal && setter !== setT2p2) setT2p2('');
    setter(newVal);
    setResult(null);
  };

  const handleCalculate = async () => {
    const team1 = gameType === '1v1' ? [parseInt(t1p1)] : [parseInt(t1p1), parseInt(t1p2)];
    const team2 = gameType === '1v1' ? [parseInt(t2p1)] : [parseInt(t2p1), parseInt(t2p2)];

    if (team1.some(isNaN) || team2.some(isNaN)) {
      setError('Select all players');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await oddsApi.calculate({ type: gameType, team1, team2 });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const getTeamLabel = (ids) => {
    return ids.map((id) => players.find((p) => p.id === parseInt(id))?.display_name).filter(Boolean).join(' & ');
  };

  const PlayerSelect = ({ value, setter, label }) => {
    const taken = takenExcept(value);
    return (
      <select
        value={value}
        onChange={(e) => setAndDedup(setter, e.target.value)}
        className="px-3 py-2 rounded-xl border font-ui text-sm flex-1"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
      >
        <option value="">{label}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id} disabled={taken.has(p.id)}>
            {p.display_name} (Elo {Math.round(p.elo_rating)})
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Matchup Odds
      </h1>
      <p className="font-ui mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        Calculate predicted win probability for any matchup based on Elo ratings and head-to-head history.
      </p>

      <div className="card">
        {/* Type toggle */}
        <div className="flex rounded-full overflow-hidden border mb-5 w-fit" style={{ borderColor: 'var(--color-border)' }}>
          {['1v1', '2v2'].map((t) => (
            <button key={t} onClick={() => { setGameType(t); setResult(null); }}
              className="px-6 py-1.5 font-ui font-semibold text-sm transition-colors"
              style={{ background: gameType === t ? 'var(--color-primary)' : 'var(--color-surface)', color: gameType === t ? 'white' : 'var(--color-text-secondary)' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Team 1 */}
        <div className="mb-4">
          <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>Team 1</div>
          <div className="flex gap-2 flex-wrap">
            <PlayerSelect value={t1p1} setter={setT1p1} label="Player 1" />
            {gameType === '2v2' && <PlayerSelect value={t1p2} setter={setT1p2} label="Player 2" />}
          </div>
        </div>

        <div className="text-center font-display text-2xl mb-4" style={{ color: 'var(--color-text-secondary)' }}>vs</div>

        {/* Team 2 */}
        <div className="mb-5">
          <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>Team 2</div>
          <div className="flex gap-2 flex-wrap">
            <PlayerSelect value={t2p1} setter={setT2p1} label="Player 1" />
            {gameType === '2v2' && <PlayerSelect value={t2p2} setter={setT2p2} label="Player 2" />}
          </div>
        </div>

        {error && <div className="text-sm font-ui mb-3 p-2 rounded-xl" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>{error}</div>}

        <button
          onClick={handleCalculate}
          disabled={loading}
          className="btn btn-primary w-full"
        >
          {loading ? 'Calculating...' : '🎲 Calculate Odds'}
        </button>
      </div>

      {result && (
        <div className="mt-5">
          <OddsBar
            odds={result}
            team1Label={getTeamLabel([t1p1, t1p2])}
            team2Label={getTeamLabel([t2p1, t2p2])}
          />
        </div>
      )}
    </div>
  );
}
