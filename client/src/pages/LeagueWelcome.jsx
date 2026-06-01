import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { leaguePath } from '../contexts/LeagueContext';
import InviteKit from '../components/InviteKit';

export default function LeagueWelcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();

  const { league, joinCode } = location.state || {};
  const leagueName = league?.name ?? slug ?? 'Your League';

  const joinLink = joinCode
    ? `${window.location.origin}/join/${joinCode}`
    : null;

  const go = (subpath) => navigate(leaguePath(slug, subpath));

  return (
    <div className="max-w-lg mx-auto mt-8 flex flex-col gap-6">
      {/* Headline */}
      <div className="card p-8 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          {leagueName} is ready!
        </h1>
        <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Share the invite link below to get your crew in.
        </p>
      </div>

      {/* Invite kit */}
      {joinLink && (
        <div className="card p-6">
          <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            🔗 Invite your crew
          </h2>
          <InviteKit joinLink={joinLink} joinCode={joinCode} leagueName={leagueName} />
        </div>
      )}

      {/* What next */}
      <div className="card p-6">
        <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
          What next?
        </h2>
        <div className="flex flex-col gap-3">
          {[
            { icon: '🏆', label: 'Log a game', desc: 'Record your first win', sub: 'games/new' },
            { icon: '📊', label: 'Browse standings', desc: 'See the leaderboard', sub: 'standings' },
            { icon: '🏅', label: 'Set up a tournament', desc: 'Single or double elimination', sub: 'tournaments' },
          ].map(({ icon, label, desc, sub }) => (
            <button key={sub} onClick={() => go(sub)}
              className="flex items-center gap-4 p-4 rounded-xl border text-left transition-colors hover:bg-amber-50"
              style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-3xl">{icon}</span>
              <div>
                <div className="font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>{label}</div>
                <div className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>{desc}</div>
              </div>
              <span className="ml-auto text-lg opacity-40">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
