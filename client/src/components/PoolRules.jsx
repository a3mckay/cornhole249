import React, { useState } from 'react';
import { useLeague } from '../contexts/LeagueContext';

// Variant-aware pool rules. Mirrors the four variants the app supports
// (server/lib/sports.js → SPORTS.pool.variants) and explains how each maps to
// standings + ELO margin on this site.
const POOL_RULES = {
  eight_ball: {
    label: '🎱 8-Ball',
    subtitle: 'The classic — stripes vs. solids, then the 8',
    summary:
      'Each player is assigned a group (solids 1–7 or stripes 9–15) on the first ball legally pocketed. Pocket all of your group, then legally pocket the 8-ball in a called pocket to win.',
    sections: [
      { h: 'How to win', p: 'Sink all of your group, then call and sink the 8-ball. Pocketing the 8 early, sinking it in the wrong pocket, or scratching on the 8 is an automatic loss.' },
      { h: 'Logging it here', p: 'Record the winner and how the rack ended — “sunk the 8” (a clean win) or “opponent scratched / fouled on the 8.” You can also note how many of the loser’s balls were still on the table (0–7).' },
      { h: 'How it scores your rating', p: 'The loser’s balls left on the table act as the margin: a 7-ball blowout moves ELO more than a hill-hill 1-ball finish (capped at 1.5×).' },
    ],
  },
  nine_ball: {
    label: '9️⃣ 9-Ball',
    subtitle: 'Lowest ball first — pocket the 9 to win',
    summary:
      'Balls 1–9 only. You must always strike the lowest-numbered ball on the table first, but balls can be pocketed in any order. Whoever legally pockets the 9-ball wins the rack.',
    sections: [
      { h: 'How to win', p: 'Legally pocket the 9-ball. Because the 9 can be sunk on a combo at any time, a rack can end suddenly. Most play is a race — first to an agreed number of racks (see Race to N below).' },
      { h: 'Logging it here', p: 'Record racks won by each player. In a race, the winner’s racks is the target; the loser’s racks is how close they got.' },
      { h: 'How it scores your rating', p: 'The racks gap is the margin — sweeping a race moves ELO more than squeaking it out (capped at 1.5×).' },
    ],
  },
  cutthroat: {
    label: '🔪 Cutthroat',
    subtitle: 'Three players, every man for himself',
    summary:
      'A 3-player game. Each player “owns” a group of balls (1–5, 6–10, 11–15). You knock OUT your opponents by pocketing their balls. The last player with balls still on the table wins.',
    sections: [
      { h: 'How to win', p: 'Be the last player with at least one of your own balls remaining. There are no points — it’s pure elimination.' },
      { h: 'Logging it here', p: 'Pick the single winner and the two players who were knocked out. There are no scores to enter — it’s recorded as one winner vs. two losers.' },
      { h: 'How it scores your rating', p: 'Cutthroat is win/loss only, so every result moves ELO by the flat base amount (1.0× margin) — no blowout bonus.' },
    ],
  },
  straight_pool: {
    label: '🎯 Straight Pool',
    subtitle: '14.1 continuous — call every ball, race to a total',
    summary:
      'Also called 14.1 continuous. Any ball counts for 1 point as long as you call it. When 14 of the 15 balls are pocketed, they’re re-racked and play continues off the 15th ball — runs can go on for dozens of balls.',
    sections: [
      { h: 'How to win', p: 'First to an agreed point total wins (classic targets are 50, 100, or 150). Set a target with Race to N below.' },
      { h: 'Logging it here', p: 'Record each player’s point total for the match. The winner reaches the target.' },
      { h: 'How it scores your rating', p: 'The points gap is the margin — a 100–20 runaway moves ELO more than a 100–96 nail-biter (capped at 1.5×).' },
    ],
  },
};

const VARIANT_ORDER = ['eight_ball', 'nine_ball', 'cutthroat', 'straight_pool'];

export default function PoolRules() {
  const { raceToTarget } = useLeague();
  const [variant, setVariant] = useState('eight_ball');
  const r = POOL_RULES[variant];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Variant toggle */}
      <div className="flex justify-center mb-6">
        <div className="flex rounded-full overflow-hidden border p-0.5 gap-0.5 flex-wrap justify-center"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          {VARIANT_ORDER.map((key) => (
            <button
              key={key}
              onClick={() => setVariant(key)}
              className="px-4 py-2 rounded-full text-sm font-ui font-semibold transition-all"
              style={{
                background: variant === key ? 'var(--color-primary)' : 'transparent',
                color: variant === key ? 'white' : 'var(--color-text-secondary)',
              }}
            >
              {POOL_RULES[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Paper card */}
      <div
        className="card mb-8"
        style={{
          background: '#FDFAF5',
          border: '2px solid #C8B89A',
          boxShadow: '5px 5px 0px #C8B89A',
          transform: 'rotate(-0.3deg)',
        }}
      >
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎱</div>
          <h1 className="font-display text-5xl" style={{ color: 'var(--color-text-primary)' }}>
            Pool Rules
          </h1>
          <p className="font-ui mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            {r.subtitle}
          </p>
        </div>

        {/* Summary */}
        <div className="mb-6 p-4 rounded-xl font-ui" style={{ background: 'rgba(31,92,61,0.08)', borderLeft: '4px solid var(--color-primary)', color: 'var(--color-text-primary)' }}>
          {r.summary}
        </div>

        {/* Sections */}
        {r.sections.map((s) => (
          <div key={s.h} className="mb-6">
            <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--color-primary)' }}>{s.h}</h2>
            <p className="font-ui" style={{ color: 'var(--color-text-primary)' }}>{s.p}</p>
          </div>
        ))}

        {/* Race to N — reflects this league's admin setting */}
        <div className="mb-2">
          <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--color-primary)' }}>Race to N</h2>
          {raceToTarget != null ? (
            <p className="font-ui" style={{ color: 'var(--color-text-primary)' }}>
              This league plays <strong>first to {raceToTarget}</strong>. A match ends when one player
              reaches {raceToTarget} racks. (Admins can change this in League Settings.)
            </p>
          ) : (
            <p className="font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              Race-to-N is off for this league — games are logged as single results. An admin can turn on a
              target score in League Settings → Permissions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
