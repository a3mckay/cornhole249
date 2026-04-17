import React, { useState } from 'react';

export default function AchievementBadge({ achievement }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const { key, label, description, icon, earned, earned_at } = achievement;

  return (
    <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <div
        className={`achievement-badge cursor-help ${!earned ? 'locked' : ''}`}
        style={{
          background: earned ? 'linear-gradient(135deg, #FEF3C7, #FCD34D)' : '#E5E7EB',
          borderColor: earned ? '#D4A017' : '#9CA3AF',
        }}
        title={label}
      >
        <span>{icon}</span>
      </div>

      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 rounded-card p-2 text-xs text-center z-50 shadow-card"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        >
          <div className="font-bold font-ui mb-0.5">{label}</div>
          <div className="opacity-70 font-ui">{description}</div>
          {earned && earned_at && (
            <div className="mt-1 opacity-50 text-[10px]">
              Earned {new Date(earned_at).toLocaleDateString()}
            </div>
          )}
          {!earned && <div className="mt-1 opacity-50 font-ui">🔒 Not yet earned</div>}
        </div>
      )}
    </div>
  );
}
