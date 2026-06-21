import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi, matchesApi } from '../api';
import { useLeague, useLeaguePath } from '../contexts/LeagueContext';
import { capture } from '../lib/analytics';

// Start a match/series (ROADMAP WS-G): a best-of-# series between two FIXED
// sides — first to a target number of game wins. Sport-agnostic.

const POOL_VARIANTS = [
  { key: 'eight_ball', label: '8-Ball', emoji: '🎱' },
  { key: 'nine_ball', label: '9-Ball', emoji: '9️⃣' },
  { key: 'straight_pool', label: 'Straight', emoji: '🎯' },
];

// Presets map a friendly label to the number of game wins needed to clinch.
const PRESETS = [
  { label: 'Best of 3', wins: 2 },
  { label: 'Best of 5', wins: 3 },
  { label: 'Best of 7', wins: 4 },
  { label: 'Best of 9', wins: 5 },
];

function PlayerPicker({ players, value, onChange, exclude, label }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : '')}
      className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
    >
      <option value="">{label}</option>
      {players.filter((p) => !exclude.includes(p.id)).map((p) => (
        <option key={p.id} value={p.id}>{p.display_name}{p.nickname ? ` "${p.nickname}"` : ''}</option>
      ))}
    </select>
  );
}

export default function MatchNew() {
  const { sport } = useLeague();
  const lp = useLeaguePath();
  const navigate = useNavigate();
  const isPool = sport === 'pool';

  const [players, setPlayers] = useState([]);
  const [doubles, setDoubles] = useState(false);
  const [variant, setVariant] = useState('eight_ball');
  const [s1p1, setS1p1] = useState('');
  const [s1p2, setS1p2] = useState('');
  const [s2p1, setS2p1] = useState('');
  const [s2p2, setS2p2] = useState('');
  const [preset, setPreset] = useState('Best of 3');
  const [customWins, setCustomWins] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { usersApi.list().then(setPlayers).catch(() => {}); }, []);

  const gameType = doubles ? '2v2' : '1v1';
  const side1 = doubles ? [s1p1, s1p2] : [s1p1];
  const side2 = doubles ? [s2p1, s2p2] : [s2p1];
  const chosen = [...side1, ...side2].filter(Boolean);
  const allChosen = chosen.length === (doubles ? 4 : 2);
  const noDupes = new Set(chosen).size === chosen.length;
  const targetWins = preset === 'custom' ? parseInt(customWins) || 1 : PRESETS.find((p) => p.label === preset).wins;
  const formatLabel = preset === 'custom' ? `First to ${targetWins}` : preset;

  const handleCreate = async () => {
    if (!allChosen || !noDupes) { setError('Pick all players (no repeats).'); return; }
    setSubmitting(true);
    setError('');
    try {
      const match = await matchesApi.create({
        game_type: gameType,
        game_variant: isPool ? variant : null,
        side1, side2,
        target_wins: targetWins,
        format_label: formatLabel,
      });
      capture('match_started', { game_type: gameType, sport, target_wins: targetWins });
      navigate(lp(`matches/${match.id}`));
    } catch (e) {
      setError(e.response?.data?.error || 'Could not start the match.');
      setSubmitting(false);
    }
  };

  const Tile = ({ active, onClick, children }) => (
    <button type="button" onClick={onClick}
      className="flex-1 min-w-[80px] p-3 rounded-2xl border-2 text-center transition-all"
      style={{
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        background: active ? 'rgba(31,92,61,0.10)' : 'var(--color-surface)',
        color: 'var(--color-text-primary)',
      }}>
      {children}
    </button>
  );

  return (
    <div className="max-w-xl mx-auto">
      <button onClick={() => navigate(lp('games'))} className="text-sm font-ui hover:underline mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
        ← Games
      </button>
      <h1 className="font-display text-3xl mb-5" style={{ color: 'var(--color-text-primary)' }}>Start a Match</h1>

      <div className="card mb-4">
        {/* Format */}
        <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Format</div>
        <div className="flex gap-2 mb-5">
          <Tile active={!doubles} onClick={() => setDoubles(false)}><div className="font-display text-lg">Singles</div><div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>1 v 1</div></Tile>
          <Tile active={doubles} onClick={() => setDoubles(true)}><div className="font-display text-lg">Doubles</div><div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>2 v 2</div></Tile>
        </div>

        {/* Pool variant */}
        {isPool && (
          <>
            <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Game</div>
            <div className="flex gap-2 mb-5">
              {POOL_VARIANTS.map((v) => (
                <Tile key={v.key} active={variant === v.key} onClick={() => setVariant(v.key)}>
                  <div className="text-2xl">{v.emoji}</div><div className="text-sm font-display">{v.label}</div>
                </Tile>
              ))}
            </div>
          </>
        )}

        {/* Sides */}
        <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>Side 1</div>
        <div className="flex gap-2 mb-4">
          <div className="flex-1"><PlayerPicker players={players} value={s1p1} onChange={setS1p1} exclude={[s1p2, s2p1, s2p2].filter(Boolean)} label="Player 1" /></div>
          {doubles && <div className="flex-1"><PlayerPicker players={players} value={s1p2} onChange={setS1p2} exclude={[s1p1, s2p1, s2p2].filter(Boolean)} label="Player 2" /></div>}
        </div>
        <div className="text-center text-lg font-display mb-3" style={{ color: 'var(--color-text-secondary)' }}>vs</div>
        <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>Side 2</div>
        <div className="flex gap-2 mb-5">
          <div className="flex-1"><PlayerPicker players={players} value={s2p1} onChange={setS2p1} exclude={[s1p1, s1p2, s2p2].filter(Boolean)} label="Player 1" /></div>
          {doubles && <div className="flex-1"><PlayerPicker players={players} value={s2p2} onChange={setS2p2} exclude={[s1p1, s1p2, s2p1].filter(Boolean)} label="Player 2" /></div>}
        </div>

        {/* Length */}
        <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Length</div>
        <div className="flex gap-2 flex-wrap mb-3">
          {PRESETS.map((p) => (
            <Tile key={p.label} active={preset === p.label} onClick={() => setPreset(p.label)}>
              <div className="text-sm font-display">{p.label}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>first to {p.wins}</div>
            </Tile>
          ))}
          <Tile active={preset === 'custom'} onClick={() => setPreset('custom')}>
            <div className="text-sm font-display">Custom</div>
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>set wins</div>
          </Tile>
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 mb-1">
            <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>First to</span>
            <input type="number" min="1" max="99" value={customWins}
              onChange={(e) => setCustomWins(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-20 px-3 py-1.5 rounded-lg border font-ui text-sm text-center"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
            <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>game wins</span>
          </div>
        )}
      </div>

      {error && <p className="text-sm font-ui p-2 rounded-xl text-center mb-3" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>{error}</p>}

      <button onClick={handleCreate} disabled={submitting || !allChosen || !noDupes}
        className="btn btn-primary w-full disabled:opacity-50"
        style={{ opacity: (!allChosen || !noDupes) ? 0.5 : 1 }}>
        {submitting ? 'Starting…' : `Start ${formatLabel}`}
      </button>
    </div>
  );
}
