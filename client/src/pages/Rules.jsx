import React from 'react';

function BoardDiagram() {
  return (
    <svg viewBox="0 0 320 200" className="w-full max-w-sm mx-auto" style={{ fontFamily: 'Nunito, sans-serif' }}>
      {/* Board surface */}
      <rect x="30" y="30" width="260" height="155" rx="10" fill="#8B4513" stroke="#5C2E00" strokeWidth="3" />
      <rect x="40" y="40" width="240" height="135" rx="6" fill="#A0522D" stroke="#5C2E00" strokeWidth="1.5" />

      {/* Board texture lines */}
      {[60, 80, 100, 120, 140, 160].map((y) => (
        <line key={y} x1="42" y1={y} x2="278" y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      ))}

      {/* Hole */}
      <circle cx="160" cy="107" r="25" fill="#2C1A0E" stroke="#1A0A00" strokeWidth="2" />
      <circle cx="160" cy="107" r="25" fill="rgba(0,0,0,0.7)" />

      {/* Hole shadow/depth */}
      <circle cx="163" cy="110" r="23" fill="rgba(0,0,0,0.5)" />

      {/* Scoring zone labels */}
      {/* On board = 1pt */}
      <rect x="50" y="155" width="70" height="24" rx="5" fill="rgba(58,107,53,0.15)" />
      <text x="85" y="171" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#3A6B35">On board: 1pt</text>

      {/* Overhang = 2pt */}
      <circle cx="160" cy="107" r="35" fill="none" stroke="#D48B2D" strokeWidth="1.5" strokeDasharray="4,3" />
      <rect x="125" y="55" width="70" height="22" rx="5" fill="rgba(212,139,45,0.15)" />
      <text x="160" y="70" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#D48B2D">Overhang: 2pts</text>

      {/* In hole = 3pt */}
      <text x="160" y="107" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#EEE8D5" dy="4">3pts</text>

      {/* Standing position arrows */}
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#B94040" />
        </marker>
      </defs>
      <line x1="10" y1="107" x2="26" y2="107" stroke="#B94040" strokeWidth="2" markerEnd="url(#arrow)" />
      <text x="5" y="100" fontSize="8" fill="#B94040" fontWeight="bold">THROW</text>
      <text x="5" y="110" fontSize="8" fill="#B94040" fontWeight="bold">FROM</text>
      <text x="5" y="120" fontSize="8" fill="#B94040" fontWeight="bold">BEHIND</text>
    </svg>
  );
}

export default function Rules() {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Paper pinned to fence aesthetic */}
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
            Official Cornhole249 — Hamilton Rules
          </p>
        </div>

        {/* Board diagram */}
        <div className="mb-6">
          <BoardDiagram />
        </div>

        {/* Scoring */}
        <div className="mb-6">
          <h2 className="font-display text-3xl mb-4" style={{ color: 'var(--color-primary)' }}>Scoring</h2>
          <div className="flex flex-col gap-3">
            {[
              { pts: 3, label: 'Bag in the Hole', icon: '🕳️', desc: 'Bag goes cleanly through the hole (or ricochets in)' },
              { pts: 2, label: 'Bag Overhanging', icon: '🎯', desc: 'Bag is on the board AND hanging over the hole, even slightly' },
              { pts: 1, label: 'Bag on the Board', icon: '📦', desc: 'Bag lands and stays flat on the board surface' },
              { pts: 0, label: 'Off the Board', icon: '❌', desc: 'Bag misses the board or slides off before scoring is called' },
            ].map((s) => (
              <div key={s.pts} className="flex items-start gap-4 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <div className="text-2xl">{s.icon}</div>
                <div className="flex-1">
                  <div className="font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>{s.label}</div>
                  <div className="text-sm font-ui mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{s.desc}</div>
                </div>
                <div className="font-display text-3xl" style={{ color: 'var(--color-primary)' }}>
                  {s.pts}
                  <span className="text-base">pt{s.pts !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Player positioning */}
        <div className="mb-6">
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-primary)' }}>Positioning</h2>
          <div className="p-3 rounded-xl font-ui" style={{ background: 'rgba(212,139,45,0.1)', borderLeft: '4px solid var(--color-secondary)' }}>
            <strong>Hamilton Rule:</strong> Players must stand <strong>behind the board</strong> when throwing — not beside it. Both feet must be behind the rear edge of the board surface.
          </div>
          <div className="mt-3 text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            ACA rules allow players to stand beside the board. We don't. It's more fun this way.
          </div>
        </div>

        {/* Cancellation scoring */}
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
          <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-primary)' }}>Winning</h2>
          <p className="font-ui" style={{ color: 'var(--color-text-primary)' }}>
            First player/team to reach <strong>21 points wins</strong>. You must win by at least 2 points. If both players reach 21+ in the same round, the higher score wins (no extra rounds required).
          </p>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="font-display text-3xl mb-4" style={{ color: 'var(--color-primary)' }}>FAQ</h2>
          <div className="flex flex-col gap-3">
            {[
              {
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
                q: 'Do you have to win by exactly 21?',
                a: 'You need to reach 21 to start. In the same round, if both reach 21, the higher score wins. You don\'t need to hit exactly 21 — any score ≥21 that\'s higher wins.',
              },
              {
                q: 'Hamilton Rules vs ACA: key differences?',
                a: 'Hamilton: stand BEHIND the board. ACA: stand beside. Hamilton is harder, more physical, and honestly more impressive. Embrace it.',
              },
            ].map((faq) => (
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
