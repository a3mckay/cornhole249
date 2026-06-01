import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { joinApi } from '../api';

/** Set the 30-day referral cookie from the invite page's inviter token. */
function setRefCookie(token) {
  if (!token) return;
  document.cookie = `ref=${encodeURIComponent(token)}; max-age=${30 * 24 * 60 * 60}; path=/; SameSite=Lax`;
}

function Avatar({ name, avatarUrl, size = 10 }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const px = size * 4; // Tailwind size → px
  const [err, setErr] = useState(false);

  if (avatarUrl && !err) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setErr(true)}
        style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        background: 'var(--color-primary)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Nunito, sans-serif',
        fontWeight: 700,
        fontSize: px * 0.38,
      }}
    >
      {initials}
    </div>
  );
}

function GameRow({ game }) {
  const team1Names = game.team1.map((p) => p.display_name).join(' & ');
  const team2Names = game.team2.map((p) => p.display_name).join(' & ');
  const isTeam1Winner = game.winner_team === 1;
  const isTeam2Winner = game.winner_team === 2;
  const date = new Date(game.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div
      className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-ui"
      style={{ background: 'var(--color-bg)' }}
    >
      <span style={{ color: isTeam1Winner ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: isTeam1Winner ? 700 : 400 }}>
        {team1Names}
      </span>
      <span className="mx-2 font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
        {game.score1} – {game.score2}
      </span>
      <span style={{ color: isTeam2Winner ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: isTeam2Winner ? 700 : 400 }}>
        {team2Names}
      </span>
      <span className="ml-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{date}</span>
    </div>
  );
}

export default function Join() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    joinApi.getInvite(code)
      .then((d) => {
        setData(d);
        // If the invite is valid and unused, plant the referral cookie so that
        // the registration flow attributes the new user to the inviter — even if
        // they navigate away and come back later.
        if (d.valid && !d.used && d.inviter_ref_token) {
          setRefCookie(d.inviter_ref_token);
        }
      })
      .catch(() => setData({ valid: false }))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto mt-16 card">
        <div className="h-6 rounded animate-pulse mb-3" style={{ background: 'var(--color-border)', width: '60%' }} />
        <div className="h-4 rounded animate-pulse mb-2" style={{ background: 'var(--color-border)', width: '80%' }} />
        <div className="h-4 rounded animate-pulse" style={{ background: 'var(--color-border)', width: '50%' }} />
      </div>
    );
  }

  // Invalid code
  if (!data?.valid) {
    return (
      <div className="max-w-lg mx-auto mt-16 card text-center">
        <div className="text-4xl mb-4">🤷</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Invite not found
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          That invite link doesn't exist. Ask someone in the league for a fresh one.
        </p>
        <Link to="/" className="btn btn-secondary text-sm">Back to home</Link>
      </div>
    );
  }

  // Code already used
  if (data.used) {
    return (
      <div className="max-w-lg mx-auto mt-16 card text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Invite already used
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          This invite code has already been claimed. Ask an admin to generate a new one for you.
        </p>
        <Link to="/" className="btn btn-secondary text-sm">Back to home</Link>
      </div>
    );
  }

  const inviterName = data.inviter?.display_name || 'Someone';

  return (
    <div className="max-w-lg mx-auto mt-8 mb-16">

      {/* Header */}
      <div className="text-center mb-6">
        <div className="font-display text-2xl mb-1" style={{ color: 'var(--color-primary)' }}>
          Cornhole249
        </div>
        <h1 className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>
          {inviterName} invited you
        </h1>
        <p className="font-ui text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Join the crew. Log games, track standings, talk trash.
        </p>
      </div>

      {/* Member avatars */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-2">
          {/* Overlapping avatar stack */}
          <div className="flex" style={{ gap: -8 }}>
            {data.member_avatars.slice(0, 8).map((m, i) => (
              <div key={i} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: i }}>
                <Avatar name={m.display_name} avatarUrl={m.avatar_url} size={8} />
              </div>
            ))}
          </div>
          <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {data.member_count} {data.member_count === 1 ? 'player' : 'players'} in the league
          </span>
        </div>
      </div>

      {/* Top 3 */}
      {data.top3.length > 0 && (
        <div className="card mb-4">
          <h2 className="font-display text-lg mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Currently leading
          </h2>
          <div className="flex flex-col gap-2">
            {data.top3.map((player) => (
              <div key={player.rank} className="flex items-center gap-3">
                <span className="font-ui font-bold text-sm w-5 text-right" style={{ color: 'var(--color-text-secondary)' }}>
                  #{player.rank}
                </span>
                <Avatar name={player.display_name} avatarUrl={player.avatar_url} size={8} />
                <div className="flex-1 min-w-0">
                  <div className="font-ui font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {player.display_name}
                  </div>
                  <div className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {player.wins}–{player.losses} · {player.win_pct}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent games */}
      {data.recent_games.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-display text-lg mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Recent games
          </h2>
          <div className="flex flex-col gap-2">
            {data.recent_games.map((game) => (
              <GameRow key={game.id} game={game} />
            ))}
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => navigate(`/register?code=${code}`)}
          className="btn btn-primary w-full text-base py-3"
        >
          Join this league →
        </button>
        <Link
          to="/"
          className="font-ui text-sm text-center"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Already a member? Sign in from the nav
        </Link>
      </div>
    </div>
  );
}
