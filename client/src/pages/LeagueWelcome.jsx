import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { leaguePath } from '../contexts/LeagueContext';
import InviteKit from '../components/InviteKit';

const WHAT_NEXT = {
  recurring: [
    { icon: '🏆', label: 'Log your first game', desc: 'Record a win and kick off the season', sub: 'games/new' },
    { icon: '📊', label: 'Browse standings', desc: 'See the leaderboard', sub: 'standings' },
    { icon: '📋', label: 'Set up rules', desc: 'Customise scoring for your crew', sub: 'settings' },
  ],
  tournament: [
    { icon: '🏅', label: 'Create a tournament', desc: 'Set up your bracket now', sub: 'tournaments' },
    { icon: '👥', label: 'View players', desc: 'Confirm who\'s competing', sub: 'players' },
    { icon: '📊', label: 'Browse standings', desc: 'See the leaderboard', sub: 'standings' },
  ],
  open_play: [
    { icon: '🏆', label: 'Log a game', desc: 'Record your first result', sub: 'games/new' },
    { icon: '📊', label: 'Browse standings', desc: 'See who\'s on top', sub: 'standings' },
    { icon: '👥', label: 'View players', desc: 'Check out the roster', sub: 'players' },
  ],
  default: [
    { icon: '🏆', label: 'Log a game', desc: 'Record your first win', sub: 'games/new' },
    { icon: '📊', label: 'Browse standings', desc: 'See the leaderboard', sub: 'standings' },
    { icon: '🏅', label: 'Set up a tournament', desc: 'Single or double elimination', sub: 'tournaments' },
  ],
};

export default function LeagueWelcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();

  const { league, joinCode, inviteToken, useCase } = location.state || {};
  const leagueName = league?.name ?? slug ?? 'Your League';
  const isPublic = league?.is_public ?? false;

  const inviteLink = inviteToken
    ? `${window.location.origin}/join?t=${encodeURIComponent(inviteToken)}`
    : isPublic
    ? `${window.location.origin}/l/${slug}/join`
    : joinCode
    ? `${window.location.origin}/join/${joinCode}`
    : null;

  const nextCards = WHAT_NEXT[useCase] || WHAT_NEXT.default;
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
          {isPublic
            ? 'Share your league link so players can request to join.'
            : 'Share the invite link below to get your crew in.'}
        </p>
      </div>

      {/* Invite kit */}
      {inviteLink && (
        <div className="card p-6">
          <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            🔗 Invite your crew
          </h2>
          <InviteKit
            joinLink={inviteLink}
            joinCode={null}
            leagueName={leagueName}
          />
          <p className="mt-4 text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            {isPublic
              ? 'Players who visit this link can request to join. You\'ll approve them in league settings.'
              : 'Anyone with this link auto-joins. Share it anytime from league settings.'}
          </p>
        </div>
      )}

      {/* What next */}
      <div className="card p-6">
        <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
          What next?
        </h2>
        <div className="flex flex-col gap-3">
          {nextCards.map(({ icon, label, desc, sub }) => (
            <button
              key={sub}
              onClick={() => go(sub)}
              className="flex items-center gap-4 p-4 rounded-xl border text-left transition-colors hover:bg-amber-50"
              style={{ borderColor: 'var(--color-border)' }}
            >
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
