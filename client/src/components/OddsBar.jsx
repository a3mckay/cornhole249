import React from 'react';

const CONFIDENCE_COLORS = {
  High: { bg: '#D1FAE5', text: '#065F46', label: 'High Confidence' },
  Medium: { bg: '#FEF3C7', text: '#92400E', label: 'Medium Confidence' },
  Low: { bg: '#FEE2E2', text: '#991B1B', label: 'Low Confidence' },
  Estimated: { bg: '#F3F4F6', text: '#374151', label: 'Estimated' },
};

export default function OddsBar({ odds, team1Label, team2Label }) {
  if (!odds) return null;

  const { team1_pct, team2_pct, confidence, explanation } = odds;
  const conf = CONFIDENCE_COLORS[confidence] || CONFIDENCE_COLORS['Estimated'];

  return (
    <div className="card" data-testid="odds-bar">
      {/* Labels */}
      <div className="flex justify-between text-sm font-ui font-semibold mb-2">
        <span style={{ color: 'var(--color-primary)' }}>{team1Label || 'Team 1'}</span>
        <span style={{ color: 'var(--color-secondary)' }}>{team2Label || 'Team 2'}</span>
      </div>

      {/* Bar */}
      <div className="flex h-8 rounded-full overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
        <div
          className="flex items-center justify-center text-white text-sm font-ui font-bold transition-all duration-500"
          style={{ width: `${team1_pct}%`, background: 'var(--color-primary)' }}
          data-testid="team1-pct"
        >
          {team1_pct >= 20 && `${team1_pct}%`}
        </div>
        <div
          className="flex items-center justify-center text-white text-sm font-ui font-bold transition-all duration-500"
          style={{ width: `${team2_pct}%`, background: 'var(--color-secondary)' }}
          data-testid="team2-pct"
        >
          {team2_pct >= 20 && `${team2_pct}%`}
        </div>
      </div>

      {/* Percentages below */}
      <div className="flex justify-between text-xs font-ui mt-1" style={{ color: 'var(--color-text-secondary)' }}>
        <span>{team1_pct}%</span>
        <span>{team2_pct}%</span>
      </div>

      {/* Confidence badge */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span
          className="px-2 py-0.5 rounded-full text-xs font-ui font-bold"
          style={{ background: conf.bg, color: conf.text }}
          data-testid="confidence-label"
        >
          {conf.label}
        </span>
        {odds.h2h_games > 0 && (
          <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            {odds.h2h_games} H2H games
          </span>
        )}
        {odds.elo_team1 && (
          <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            Elo: {odds.elo_team1} vs {odds.elo_team2}
          </span>
        )}
      </div>

      {/* Explanation */}
      {explanation && (
        <p className="mt-2 text-sm font-ui italic" style={{ color: 'var(--color-text-secondary)' }}>
          {explanation}
        </p>
      )}
    </div>
  );
}
