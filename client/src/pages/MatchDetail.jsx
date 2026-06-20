import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { matchesApi, gamesApi } from '../api';
import { useLeaguePath } from '../contexts/LeagueContext';
import { variantLabel } from '../sports';

// Match detail (ROADMAP WS-G): running score + rack-by-rack log of a best-of-N
// series between two fixed sides. Log each rack inline — pick the winner (and,
// for 8-ball, the loser's balls) — and the score/completion update live.

const sideName = (sidePlayers) => (sidePlayers || []).map((p) => p.display_name).join(' & ') || 'Side';

export default function MatchDetail() {
  const { id } = useParams();
  const lp = useLeaguePath();
  const navigate = useNavigate();

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [winnerSide, setWinnerSide] = useState(null); // 1 | 2 while logging a rack
  const [balls, setBalls] = useState('');
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');

  const load = () => matchesApi.get(id).then(setMatch).catch(() => setMatch(null)).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading…</div>;
  if (!match) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Match not found.</div>;

  const prog = match.progress || { side1_wins: 0, side2_wins: 0, status: 'open', winner_side: null };
  const isOpen = prog.status === 'open';
  const isEightBall = match.game_variant === 'eight_ball';
  const side1Ids = (match.side1_players || []).map((p) => p.id);

  // Map a logged game to the side that won it (for the rack list).
  const gameWinnerSide = (g) => {
    const w = (g.participants || []).find((p) => p.is_winner);
    if (!w) return null;
    return side1Ids.includes(Number(w.user_id)) ? 1 : 2;
  };
  const loserBallsOf = (g) => {
    const l = (g.participants || []).find((p) => !p.is_winner && p.balls_remaining != null);
    return l ? l.balls_remaining : null;
  };

  const logRack = async () => {
    if (!winnerSide) { setError('Pick who won the rack.'); return; }
    setLogging(true);
    setError('');
    try {
      const s1won = winnerSide === 1;
      const team1 = (match.side1_players || []).map((p) => ({ user_id: p.id, score: s1won ? 1 : 0 }));
      const team2 = (match.side2_players || []).map((p) => ({ user_id: p.id, score: s1won ? 0 : 1 }));
      await gamesApi.create({
        game_type: match.game_type,
        game_variant: match.game_variant || null,
        match_id: match.id,
        team1, team2,
        ...(isEightBall && balls !== '' ? { balls_remaining: parseInt(balls) } : {}),
      });
      setWinnerSide(null); setBalls('');
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not log the rack.');
    } finally {
      setLogging(false);
    }
  };

  const SideScore = ({ players, wins, isWinner, accent }) => (
    <div className="flex-1 text-center p-3 rounded-xl" style={{ background: isWinner ? 'var(--color-bg)' : 'transparent', border: isWinner ? '2px solid #16a34a' : '2px solid transparent' }}>
      <div className="font-ui font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>{sideName(players)}</div>
      <div className="font-display text-5xl" style={{ color: accent }}>{wins}</div>
      {isWinner && <div className="text-xs font-ui font-bold mt-1" style={{ color: '#16a34a' }}>WINNER 🏆</div>}
    </div>
  );

  return (
    <div className="max-w-xl mx-auto">
      <button onClick={() => navigate(lp('games'))} className="text-sm font-ui hover:underline mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>← Games</button>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>{match.format_label || `First to ${match.target_wins}`}</h1>
        {variantLabel(match.game_variant) && (
          <span className="px-2 py-0.5 rounded-full text-xs font-ui font-bold" style={{ background: 'rgba(31,92,61,0.12)', color: 'var(--color-primary)' }}>{variantLabel(match.game_variant)}</span>
        )}
        <span className="px-2 py-0.5 rounded-full text-xs font-ui font-bold" style={{ background: isOpen ? '#FEF3C7' : '#DCFCE7', color: isOpen ? '#92400E' : '#166534' }}>
          {isOpen ? 'In progress' : 'Complete'}
        </span>
      </div>

      {/* Scoreboard */}
      <div className="card mb-4">
        <div className="flex items-stretch gap-2">
          <SideScore players={match.side1_players} wins={prog.side1_wins} isWinner={prog.winner_side === 1} accent="var(--color-primary)" />
          <div className="self-center font-display text-2xl" style={{ color: 'var(--color-text-secondary)' }}>–</div>
          <SideScore players={match.side2_players} wins={prog.side2_wins} isWinner={prog.winner_side === 2} accent="var(--color-secondary)" />
        </div>
        <div className="text-center text-xs font-ui mt-2" style={{ color: 'var(--color-text-secondary)' }}>
          First to {match.target_wins} · {prog.games_played} game{prog.games_played === 1 ? '' : 's'} played
        </div>
      </div>

      {/* Log a rack (open matches only) */}
      {isOpen && (
        <div className="card mb-4">
          <div className="text-sm font-ui font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Log a rack — who won?</div>
          <div className="flex gap-2 mb-3">
            {[{ s: 1, players: match.side1_players, accent: 'var(--color-primary)' }, { s: 2, players: match.side2_players, accent: 'var(--color-secondary)' }].map(({ s, players }) => (
              <button key={s} type="button" onClick={() => setWinnerSide(s)}
                className="flex-1 p-3 rounded-2xl border-2 text-center transition-all font-display"
                style={{ borderColor: winnerSide === s ? 'var(--color-primary)' : 'var(--color-border)', background: winnerSide === s ? 'rgba(31,92,61,0.10)' : 'var(--color-surface)', color: 'var(--color-text-primary)' }}>
                {winnerSide === s && <span className="mr-1">🏆</span>}{sideName(players)}
              </button>
            ))}
          </div>
          {isEightBall && (
            <div className="mb-3">
              <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Loser's balls left on table (optional, 0–7)</label>
              <input type="number" min="0" max="7" value={balls} onChange={(e) => setBalls(e.target.value)} placeholder="e.g. 3"
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
            </div>
          )}
          {error && <p className="text-sm font-ui p-2 rounded-lg mb-2" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>{error}</p>}
          <button onClick={logRack} disabled={logging || !winnerSide} className="btn btn-primary w-full disabled:opacity-50" style={{ opacity: winnerSide ? 1 : 0.5 }}>
            {logging ? 'Logging…' : 'Log rack'}
          </button>
        </div>
      )}

      {/* Rack-by-rack */}
      <div className="card">
        <div className="text-sm font-ui font-bold mb-3 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Racks</div>
        {(!match.games || match.games.length === 0) ? (
          <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>No racks logged yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {match.games.map((g, i) => {
              const ws = gameWinnerSide(g);
              const winnerPlayers = ws === 1 ? match.side1_players : match.side2_players;
              const bills = loserBallsOf(g);
              return (
                <li key={g.id} className="flex items-center justify-between py-2 px-3 rounded-lg font-ui" style={{ background: 'var(--color-surface)' }}>
                  <span className="flex items-center gap-2">
                    <span className="font-display text-sm w-6 text-center" style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</span>
                    <span style={{ color: 'var(--color-text-primary)' }}>🏆 {sideName(winnerPlayers)}</span>
                  </span>
                  {bills != null && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>by {bills} ball{bills === 1 ? '' : 's'}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
