import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { tournamentsApi } from '../api';

function MatchCard({ match, onResult, isAdmin }) {
  const [editing, setEditing] = useState(false);
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isBye = !match.team1_player_ids?.length || !match.team2_player_ids?.length;
  const isPlayed = match.winner_team !== null;
  // Round 1 empty slots are real byes; later rounds are just waiting for winners
  const isRoundOne = match.round === 1;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onResult(match.id, {
        winner_team: parseInt(s1) > parseInt(s2) ? 1 : 2,
        score_team1: parseInt(s1),
        score_team2: parseInt(s2),
      });
      setEditing(false);
    } catch (e) {
      alert('Failed to submit result');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTeam = (players, score, isWinner, teamNum) => {
    if (!players || !players.length) return (
      <div className="px-3 py-2 text-xs font-ui opacity-40 italic">
        {isRoundOne ? 'BYE' : 'TBD'}
      </div>
    );
    return (
      <div
        className={`flex items-center justify-between px-3 py-2 ${isWinner ? 'bg-green-50' : ''}`}
        style={{ borderRadius: isWinner ? '6px' : undefined }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {players.slice(0, 2).map((p) => (
            <img
              key={p.id}
              src={p.avatar_url}
              alt={p.display_name}
              className="w-5 h-5 rounded-full border border-gray-200"
              onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }}
            />
          ))}
          <span className="text-sm font-ui font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {players.map((p) => p.display_name).join(' & ')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {score !== null && score !== undefined && (
            <span className={`text-sm font-display font-bold ${isWinner ? 'text-green-700' : ''}`} style={{ color: isWinner ? undefined : 'var(--color-text-secondary)' }}>
              {score}
            </span>
          )}
          {isWinner && <span className="text-green-600 text-xs">✓</span>}
        </div>
      </div>
    );
  };

  return (
    <div
      className="w-52 rounded-xl border overflow-hidden shadow-sm"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="text-xs font-ui px-3 py-1 border-b" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', background: 'rgba(0,0,0,0.03)' }}>
        R{match.round} · M{match.match_number}
      </div>

      {renderTeam(match.team1_players, match.score_team1, match.winner_team === 1, 1)}
      <div className="h-px" style={{ background: 'var(--color-border)' }} />
      {renderTeam(match.team2_players, match.score_team2, match.winner_team === 2, 2)}

      {/* Admin result entry */}
      {isAdmin && !isPlayed && !isBye && (
        <div className="border-t p-2" style={{ borderColor: 'var(--color-border)' }}>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="w-full text-xs font-ui font-semibold text-center py-1 rounded-full hover:bg-green-50 transition-colors"
              style={{ color: 'var(--color-primary)' }}
            >
              Enter Result
            </button>
          ) : (
            <div className="flex gap-1 items-center">
              <input type="number" min="0" value={s1} onChange={(e) => setS1(e.target.value)} placeholder="T1" className="w-10 border rounded px-1 py-0.5 text-xs text-center" style={{ borderColor: 'var(--color-border)' }} />
              <span className="text-xs opacity-50">-</span>
              <input type="number" min="0" value={s2} onChange={(e) => setS2(e.target.value)} placeholder="T2" className="w-10 border rounded px-1 py-0.5 text-xs text-center" style={{ borderColor: 'var(--color-border)' }} />
              <button onClick={handleSubmit} disabled={submitting || !s1 || !s2} className="text-xs btn btn-primary py-0.5 px-2 rounded-full">✓</button>
              <button onClick={() => setEditing(false)} className="text-xs text-red-400">✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BracketView({ tournament, onRefresh }) {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const matches = tournament.matches || [];
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  const handleResult = async (matchId, data) => {
    await tournamentsApi.updateMatch(matchId, data);
    onRefresh?.();
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 items-start min-w-max">
        {rounds.map((round) => {
          const roundMatches = matches.filter((m) => m.round === round);
          return (
            <div key={round} className="flex flex-col gap-4">
              <div className="text-center font-display text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                {round === Math.max(...rounds) ? 'Final' : `Round ${round}`}
              </div>
              <div className="flex flex-col gap-6">
                {roundMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onResult={handleResult}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
