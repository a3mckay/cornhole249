import React, { useState } from 'react';

const RULESETS = {
  hamilton: {
    label: '🏠 Hamilton Rules',
    subtitle: 'Official Cornhole249 — Hamilton Rules',
    winScore: 10,
    winRule: 'First player/team to reach 10 points wins. If both players reach 10+ in the same round, the higher score wins (no extra rounds required). You don\'t need to hit exactly 10 — any score ≥10 that\'s higher wins.',
    winFaq: 'You need to reach 10 to start. In the same round, if both reach 10, the higher score wins. You don\'t need to hit exactly 10 — any score ≥10 that\'s higher wins.',
    winFaqQ: 'Do you have to win by exactly 10?',
    positionRule: 'Players must stand behind the board when throwing — not beside it. Both feet must be behind the rear edge of the board surface.',
    positionNote: 'ACA rules allow players to stand beside the board. We don\'t. It\'s more fun this way.',
    positionHighlight: 'Hamilton Rule:',
    diffFaq: 'Scoring: Hamilton awards 3pts (hole), 2pts (overhang), 1pt (board). ACA only has 3pts (hole) and 1pt (board) — no overhang bonus. Positioning: Hamilton requires standing BEHIND the board; ACA allows standing beside it in the pitcher\'s box. Win condition: Hamilton first to 10, ACA first to 21.',
    scoring: [
      { pts: 3, label: 'Bag in the Hole',  icon: '🕳️', desc: 'Bag goes cleanly through the hole (or ricochets in)' },
      { pts: 2, label: 'Bag Overhanging',  icon: '🎯', desc: 'Bag is on the board AND hanging over the hole, even slightly' },
      { pts: 1, label: 'Bag on the Board', icon: '📦', desc: 'Bag lands and stays flat on the board surface' },
      { pts: 0, label: 'Off the Board',    icon: '❌', desc: 'Bag misses the board or slides off before scoring is called' },
    ],
  },
  aca: {
    label: '📜 ACA Rules',
    subtitle: 'American Cornhole Association — Official Rules',
    winScore: 21,
    winRule: 'First player/team to reach 21 points wins. If both players reach 21+ in the same round, the higher score wins. There is no "win by 2" requirement in standard ACA play — first to 21 (or highest if tied round) wins.',
    winFaq: 'You need to reach 21 to start. In the same round, if both reach 21, the higher score wins. You don\'t need to hit exactly 21 — any score ≥21 that\'s higher wins.',
    winFaqQ: 'Do you have to win by exactly 21?',
    positionRule: 'Players throw from the pitcher\'s box alongside the board. You may stand beside the board, with both feet inside the pitcher\'s box (a 4\'×3\' area to the side of the board).',
    positionNote: 'The Cornhole249 Hamilton Rule requires players to stand BEHIND the board instead — a harder and more impressive throw.',
    positionHighlight: 'ACA Official:',
    diffFaq: 'Scoring: ACA only awards 3pts (hole) and 1pt (board) — there is no overhang bonus. Hamilton adds a 2pt overhang score. Positioning: ACA allows standing beside the board in the pitcher\'s box; Hamilton requires standing BEHIND it. Win condition: ACA first to 21, Hamilton first to 10.',
    scoring: [
      { pts: 3, label: 'Bag in the Hole',  icon: '🕳️', desc: 'Bag goes cleanly through the hole (or ricochets in)' },
      { pts: 1, label: 'Bag on the Board', icon: '📦', desc: 'Bag lands and stays on the board surface (anywhere — flat or near the hole)' },
      { pts: 0, label: 'Off the Board',    icon: '❌', desc: 'Bag misses the board or slides off before scoring is called' },
    ],
  },
};

export default function Rules() {
  const [ruleset, setRuleset] = useState('hamilton');
  const r = RULESETS[ruleset];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Ruleset toggle */}
      <div className="flex justify-center mb-6">
        <div className="flex rounded-full overflow-hidden border p-0.5 gap-0.5"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
          {Object.entries(RULESETS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setRuleset(key)}
              className="px-5 py-2 rounded-full text-sm font-ui font-semibold transition-all"
              style={{
                background: ruleset === key ? 'var(--color-primary)' : 'transparent',
                color: ruleset === key ? 'white' : 'var(--color-text-secondary)',
              }}
            >
              {val.label}
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
          <div className="text-4xl mb-2">📋</div>
          <h1 className="font-display text-5xl" style={{ color: 'var(--color-text-primary)' }}>
            The Rules
          </h1>
          <p className="font-ui mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            {r.subtitle}
          </p>
        </div>

        {/* Scoring */}
        <div className="mb-6">
          <h2 className="font-display text-3xl mb-4" style={{ color: 'var(--color-primary)' }}>Scoring</h2>
          <div className="flex flex-col gap-3">
            {r.scoring.map((s) => (
              <div key={s.pts} className="flex items-start gap-4 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <div className="text-2xl">{s.icon}</div>
                <div className="flex-1">
                  <div className="font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>{s.label}</div>
                  <div className="text-sm font-ui mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{s.desc}</div>
                </div>
                <div className="font-display text-3xl" style={{ color: 'var(--color-primary)' }}>
                  {s.pts}<span className="text-base">pt{s.pts !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Positioning */}
        <div className="mb-6">
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-primary)' }}>Positioning</h2>
          <div className="p-3 rounded-xl font-ui" style={{ background: 'rgba(212,139,45,0.1)', borderLeft: '4px solid var(--color-secondary)' }}>
            <strong>{r.positionHighlight}</strong> {r.positionRule}
          </div>
          <div className="mt-3 text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            {r.positionNote}
          </div>
        </div>

        {/* Cancellation scoring — same for both */}
        <div className="mb-6">
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-primary)' }}>Cancellation Scoring</h2>
          <p className="font-ui mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Points cancel out each round. Only the player with more points scores.
          </p>
          <div className="p-3 rounded-xl font-mono text-sm" style={{ background: 'rgba(0,0,0,0.05)' }}>
            <div style={{ color: 'var(--color-text-primary)' }}>Round example:</div>
            <div className="mt-1">Player A throws: <span style={{ color: 'var(--color-primary)' }}>3pt + 1pt + 0pt = 4pts</span></div>
            <div>Player B throws: <span style={{ color: 'var(--color-secondary)' }}>3pt + 0pt + 0pt = 3pts</span></div>
            <div className="mt-1 font-bold" style={{ color: 'var(--color-text-primary)' }}>A scores: 4 - 3 = <span style={{ color: 'var(--color-primary)' }}>1 net point</span></div>
          </div>
        </div>

        {/* Winning */}
        <div className="mb-6">
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-primary)' }}>
            Winning — First to {r.winScore}
          </h2>
          <p className="font-ui" style={{ color: 'var(--color-text-primary)' }}>
            {r.winRule}
          </p>
        </div>

        {/* Starting a Game — same for both */}
        <div className="mb-6">
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-primary)' }}>Starting a Game</h2>
          <p className="font-ui mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Play rock-paper-scissors to decide. The winner chooses one of:
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <div className="p-3 rounded-xl font-ui" style={{ background: 'rgba(58,107,53,0.08)', borderLeft: '4px solid var(--color-primary)' }}>
              <strong>Throw first</strong> — you open the round
            </div>
            <div className="p-3 rounded-xl font-ui" style={{ background: 'rgba(212,139,45,0.08)', borderLeft: '4px solid var(--color-secondary)' }}>
              <strong>Bag colour</strong> — you pick which set of bags you use
            </div>
          </div>
          <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            For Game 2, the loser of Game 1 throws first (no RPS needed). For Game 3, play RPS again — bag colour is not re-chosen.
          </p>
        </div>

        {/* Dust is a Must — Hamilton only */}
        {ruleset === 'hamilton' && (
          <div className="mb-6">
            <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-primary)' }}>🌽 Dust is a Must</h2>
            <p className="font-ui" style={{ color: 'var(--color-text-primary)' }}>
              Real cornhole bags are filled with whole-kernel corn — not synthetic pellets or plastic fill. Over time, the corn breaks down and produces a fine dust that coats the board surface, letting bags glide smoothly and predictably. Synthetic bags don't do this. If you're playing with corn bags, embrace the dust. It's not a mess — it's seasoning.
            </p>
          </div>
        )}

        {/* FAQ */}
        <div>
          <h2 className="font-display text-3xl mb-4" style={{ color: 'var(--color-primary)' }}>FAQ</h2>
          <div className="flex flex-col gap-3">
            {[
              ruleset === 'hamilton' && {
                q: 'What counts as "overhanging"?',
                a: 'Any portion of the bag extends over the hole opening. It does not need to be touching the hole — just over the void. If you can see board through the hole with the bag blocking some of it, it counts.',
              },
              {
                q: 'What if the bag slides off after landing?',
                a: 'The bag must stay on the board when it comes to rest. If it slides off or is knocked off by a subsequent throw, it scores 0.',
              },
              {
                q: 'Can a bag ricochet into the hole?',
                a: 'Yes! If the bag bounces off the board surface and into the hole, it scores 3 points. Off the ground and in counts as 0 unless it goes in directly.',
              },
              {
                q: r.winFaqQ,
                a: r.winFaq,
              },
              {
                q: 'Hamilton Rules vs ACA: key differences?',
                a: r.diffFaq,
              },
            ].filter(Boolean).map((faq) => (
              <div key={faq.q} className="border-b pb-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="font-ui font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Q: {faq.q}</div>
                <div className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>A: {faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
