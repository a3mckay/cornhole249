import React, { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { leaguesApi } from '../api';
import { leaguePath } from '../contexts/LeagueContext';
import { capture } from '../lib/analytics';

const USE_CASES = [
  {
    key: 'recurring',
    icon: '🏠',
    label: 'Recurring backyard league',
    desc: 'Weekly or regular play with a regular crew. Track standings, streaks, rivalries.',
  },
  {
    key: 'tournament',
    icon: '🏆',
    label: 'Tournament or one-day event',
    desc: 'Bachelor party, festival, charity event. Brackets, seedings, a champion.',
  },
  {
    key: 'open_play',
    icon: '🎯',
    label: 'Open / casual play',
    desc: "Drop-in sessions, no commitments. Just keep score and see who’s on top.",
  },
  {
    key: 'exploring',
    icon: '🔍',
    label: 'Just exploring',
    desc: 'Not sure yet. Poke around and see what Cornhole249 can do.',
  },
];

export default function UseCase() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();

  const { league, joinCode, inviteToken } = location.state || {};
  const leagueName = league?.name ?? slug ?? 'Your League';

  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!selected || !slug) return;
    setLoading(true);
    try {
      await leaguesApi.update(slug, { use_case: selected });
      capture('league_created', { use_case: selected, slug });
    } catch (_) {
      // Non-fatal — proceed regardless
    } finally {
      setLoading(false);
    }

    if (selected === 'exploring') {
      // Send them to the live Cornhole249 demo league so they can browse a real league
      navigate('/', { replace: true });
      return;
    }

    // For all other paths, land on the welcome page (invite kit + what-next cards)
    navigate(leaguePath(slug, 'welcome'), { state: { league, joinCode, inviteToken, useCase: selected } });
  };

  return (
    <div className="max-w-lg mx-auto mt-8 flex flex-col gap-6">
      <div className="card p-8 text-center">
        <div className="text-5xl mb-3">🎯</div>
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          What brings you to {leagueName}?
        </h1>
        <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Pick the one that fits best — we'll tailor the experience.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {USE_CASES.map(({ key, icon, label, desc }) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className="card p-5 text-left flex items-start gap-4 transition-all"
              style={{
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                background: isSelected ? 'rgba(58,107,53,0.07)' : 'var(--color-surface)',
              }}
            >
              <span className="text-3xl flex-shrink-0">{icon}</span>
              <div>
                <div className="font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {label}
                </div>
                <div className="font-ui text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {desc}
                </div>
              </div>
              {isSelected && (
                <span className="ml-auto text-lg" style={{ color: 'var(--color-primary)' }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleContinue}
        disabled={!selected || loading}
        className="btn btn-primary py-3 text-base font-semibold disabled:opacity-40"
      >
        {loading ? 'Saving…' : 'Continue →'}
      </button>
    </div>
  );
}
