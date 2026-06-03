import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { joinApi, leaguesApi } from '../api';
import { useAuth } from '../hooks/useAuth';

function setRefCookie(token) {
  if (!token) return;
  document.cookie = `ref=${encodeURIComponent(token)}; max-age=${30 * 24 * 60 * 60}; path=/; SameSite=Lax`;
}

function Avatar({ name, avatarUrl, size = 10 }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const px = size * 4;
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
        width: px, height: px, borderRadius: '50%',
        background: 'var(--color-primary)', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: px * 0.38,
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

function LeaguePreview({ data }) {
  return (
    <>
      {/* Member avatars */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex" style={{ gap: -8 }}>
            {data.member_avatars.slice(0, 8).map((m, i) => (
              <div key={i} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: i }}>
                <Avatar name={m.display_name} avatarUrl={m.avatar_url} size={8} />
              </div>
            ))}
          </div>
          <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {data.member_limit
              ? `${data.member_count} / ${data.member_limit} players`
              : `${data.member_count} ${data.member_count === 1 ? 'player' : 'players'}`}
          </span>
          {data.is_full && (
            <span className="ml-1 text-xs font-ui font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
              Full
            </span>
          )}
        </div>
      </div>

      {/* Top 3 */}
      {data.top3?.length > 0 && (
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
      {data.recent_games?.length > 0 && (
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
    </>
  );
}

// ── Token-based join (private league) ───────────────────────────────────────

function TokenJoin({ token }) {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    joinApi.getToken(token)
      .then((d) => {
        setData(d);
        if (d.valid && d.inviter_ref_token) setRefCookie(d.inviter_ref_token);
      })
      .catch(() => setData({ valid: false, reason: 'not_found' }))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      const { slug } = await joinApi.joinWithToken(token);
      await refreshUser();
      setJoined(slug); // store slug so the confirmation card can navigate
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <Skeleton />;

  if (!data?.valid) {
    return (
      <div className="max-w-lg mx-auto mt-16 card text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          {data?.reason === 'expired' ? 'Invite link expired' : 'Invite link not found'}
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          {data?.reason === 'expired'
            ? 'This invite link has expired. Ask the league owner to reset it.'
            : "That invite link doesn't exist. Ask someone in the league for a fresh one."}
        </p>
        <Link to="/" className="btn btn-secondary text-sm">Back to home</Link>
      </div>
    );
  }

  if (joined) {
    // `joined` is the league slug — navigate with state so the home page can show a welcome toast
    return (
      <div className="max-w-lg mx-auto mt-16 card text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          You're in!
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Welcome to {data.league_name}. Let's get on the board!
        </p>
        <button
          onClick={() => navigate(`/l/${joined}`, { state: { justJoined: true, leagueName: data.league_name } })}
          className="btn btn-primary"
        >
          Go to {data.league_name} →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 mb-16">
      <div className="text-center mb-6">
        <div className="font-display text-2xl mb-1" style={{ color: 'var(--color-primary)' }}>
          {data.league_name}
        </div>
        {data.tagline && (
          <p className="font-ui text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {data.tagline}
          </p>
        )}
        <h1 className="font-display text-3xl mt-2" style={{ color: 'var(--color-text-primary)' }}>
          You've been invited
        </h1>
        <p className="font-ui text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Join the crew. Log games, track standings, talk trash.
        </p>
      </div>

      <LeaguePreview data={data} />

      {error && (
        <p className="text-sm font-ui text-center p-2 rounded-xl mb-3" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {data.already_member ? (
          <div className="card text-center py-5">
            <p className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
              You're already a member of {data.league_name}
            </p>
            <Link to={`/l/${data.league_slug}`} className="btn btn-primary mt-3 text-sm">
              Go to league →
            </Link>
          </div>
        ) : data.is_full ? (
          <div className="card text-center py-5">
            <p className="font-ui font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
              This league is full ({data.member_count}/{data.member_limit} players)
            </p>
            <p className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Ask an admin to upgrade the league to add more players.
            </p>
          </div>
        ) : user ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="btn btn-primary w-full text-base py-3 disabled:opacity-50"
          >
            {joining ? 'Joining…' : `Join ${data.league_name} →`}
          </button>
        ) : (
          <>
            <button
              onClick={() => navigate(`/register?returnTo=${encodeURIComponent(`/join?t=${token}`)}`)}
              className="btn btn-primary w-full text-base py-3"
            >
              Create account to join →
            </button>
            <button
              onClick={() => navigate(`/login?returnTo=${encodeURIComponent(`/join?t=${token}`)}`)}
              className="btn w-full text-base py-3"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              Sign in instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Public league join request ───────────────────────────────────────────────

function PublicJoin({ slug }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    leaguesApi.joinInfo(slug)
      .then(setData)
      .catch((e) => {
        if (e.response?.status === 403) setData({ private: true });
        else setData(null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleRequest = async () => {
    if (!user) {
      navigate(`/register?returnTo=${encodeURIComponent(`/l/${slug}/join`)}`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await leaguesApi.requestJoin(slug, { message });
      setSubmitted(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to send request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Skeleton />;

  if (!data || data.private) {
    return (
      <div className="max-w-lg mx-auto mt-16 card text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Private League
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          This league is private. You need an invite link to join.
        </p>
        <Link to="/" className="btn btn-secondary text-sm">Back to home</Link>
      </div>
    );
  }

  if (submitted || data.pending_request) {
    return (
      <div className="max-w-lg mx-auto mt-16 card text-center">
        <div className="text-4xl mb-4">📬</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Request sent!
        </h1>
        <p className="font-ui text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          The league admin will review your request. Check back soon.
        </p>
        <Link to="/" className="btn btn-secondary text-sm">Back to home</Link>
      </div>
    );
  }

  if (data.already_member) {
    return (
      <div className="max-w-lg mx-auto mt-16 card text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          You're already in!
        </h1>
        <Link to={`/l/${slug}`} className="btn btn-primary mt-2 text-sm">
          Go to {data.league_name} →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 mb-16">
      <div className="text-center mb-6">
        <div className="font-display text-2xl mb-1" style={{ color: 'var(--color-primary)' }}>
          {data.league_name}
        </div>
        {data.tagline && (
          <p className="font-ui text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {data.tagline}
          </p>
        )}
        <h1 className="font-display text-3xl mt-2" style={{ color: 'var(--color-text-primary)' }}>
          Request to Join
        </h1>
        <p className="font-ui text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          The league admin will approve your request.
        </p>
      </div>

      <LeaguePreview data={data} />

      <div className="card flex flex-col gap-4">
        <div>
          <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
            Message <span className="font-normal opacity-50">(optional)</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell the admin how you know the league…"
            maxLength={200}
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border font-ui text-sm resize-none"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
        </div>

        {error && (
          <p className="text-sm font-ui text-center p-2 rounded-xl" style={{ background: '#FEE2E2', color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        {data.is_full ? (
          <div className="text-center py-3">
            <p className="font-ui font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
              This league is full ({data.member_count}/{data.member_limit} players)
            </p>
            <p className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Ask an admin to upgrade the league to add more players.
            </p>
          </div>
        ) : (
          <button
            onClick={handleRequest}
            disabled={submitting}
            className="btn btn-primary w-full text-base py-3 disabled:opacity-50"
          >
            {submitting ? 'Sending…' : user ? 'Request to Join →' : 'Sign up to request →'}
          </button>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-lg mx-auto mt-16 card">
      <div className="h-6 rounded animate-pulse mb-3" style={{ background: 'var(--color-border)', width: '60%' }} />
      <div className="h-4 rounded animate-pulse mb-2" style={{ background: 'var(--color-border)', width: '80%' }} />
      <div className="h-4 rounded animate-pulse" style={{ background: 'var(--color-border)', width: '50%' }} />
    </div>
  );
}

// ── Router — picks the right flow based on URL ───────────────────────────────

export default function Join() {
  const { code } = useParams();            // /join/:code  — legacy
  const { slug } = useParams();            // /l/:slug/join — public league
  const [searchParams] = useSearchParams(); // /join?t=TOKEN — private invite

  const token = searchParams.get('t');

  // Token-based private invite
  if (token) return <TokenJoin token={token} />;

  // Legacy single-use code
  if (code) return <LegacyCodeJoin code={code} />;

  // Public league join request (slug comes from parent LeagueProvider route)
  if (slug) return <PublicJoin slug={slug} />;

  return null;
}

// ── Legacy single-use code (kept for existing links) ─────────────────────────

function LegacyCodeJoin({ code }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    joinApi.getInvite(code)
      .then((d) => {
        setData(d);
        if (d.valid && !d.used && d.inviter_ref_token) setRefCookie(d.inviter_ref_token);
      })
      .catch(() => setData({ valid: false }))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <Skeleton />;

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
      <div className="text-center mb-6">
        <div className="font-display text-2xl mb-1" style={{ color: 'var(--color-primary)' }}>
          {data.league_name || 'Cornhole249'}
        </div>
        <h1 className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>
          {inviterName} invited you
        </h1>
        <p className="font-ui text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Join the crew. Log games, track standings, talk trash.
        </p>
      </div>
      <LeaguePreview data={data} />
      <div className="flex flex-col gap-3">
        {data.is_full ? (
          <div className="card text-center py-6">
            <div className="text-3xl mb-2">🔒</div>
            <p className="font-ui font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
              This league is full ({data.member_count}/{data.member_limit} players)
            </p>
          </div>
        ) : (
          <button
            onClick={() => navigate(`/register?code=${code}`)}
            className="btn btn-primary w-full text-base py-3"
          >
            Join this league →
          </button>
        )}
        <Link to="/" className="font-ui text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
          Already a member? Sign in from the nav
        </Link>
      </div>
    </div>
  );
}
