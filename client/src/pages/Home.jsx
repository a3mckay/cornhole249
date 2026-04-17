import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesApi, statsApi, tournamentsApi } from '../api';
import GameCard from '../components/GameCard';
import QRShare from '../components/QRShare';

function StringLights() {
  const bulbs = Array.from({ length: 18 });
  return (
    <svg width="100%" height="40" viewBox="0 0 800 40" preserveAspectRatio="xMidYMid meet" className="absolute top-0 left-0 w-full">
      <path d="M0,15 Q100,25 200,15 Q300,5 400,15 Q500,25 600,15 Q700,5 800,15" fill="none" stroke="#D48B2D" strokeWidth="1.5" opacity="0.6" />
      {bulbs.map((_, i) => {
        const x = (i / (bulbs.length - 1)) * 800;
        const baseY = 15 + Math.sin((i / (bulbs.length - 1)) * Math.PI * 2) * 5;
        const delay = `${(i * 0.3) % 2}s`;
        return (
          <g key={i}>
            <line x1={x} y1={baseY - 2} x2={x} y2={baseY + 4} stroke="#D48B2D" strokeWidth="1" opacity="0.4" />
            <circle cx={x} cy={baseY + 8} r="5" fill="#FBBF24" opacity="0.9" style={{ animation: `twinkle 2s ease-in-out ${delay} infinite` }} />
            <circle cx={x} cy={baseY + 8} r="8" fill="#FBBF24" opacity="0.15" style={{ animation: `twinkle 2s ease-in-out ${delay} infinite` }} />
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [recentGames, setRecentGames] = useState([]);
  const [performers, setPerformers] = useState(null);
  const [recap, setRecap] = useState(null);
  const [activeTournaments, setActiveTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      gamesApi.list({ limit: 5 }),
      statsApi.performers({ season: 2025 }),
      statsApi.recap({ season: 2025 }).catch(() => null),
      tournamentsApi.list().catch(() => []),
    ]).then(([games, perf, recap, tournaments]) => {
      setRecentGames(games.games || []);
      setPerformers(perf);
      setRecap(recap);
      setActiveTournaments((tournaments || []).filter((t) => t.status === 'active' || t.status === 'pending'));
    }).finally(() => setLoading(false));
  }, []);

  const currentYear = 2025;

  return (
    <div>
      {/* Hero */}
      <div
        className="relative rounded-[20px] overflow-hidden mb-8 pt-12 pb-10 px-6 text-center"
        style={{
          background: 'linear-gradient(160deg, #D48B2D 0%, #E8A84A 30%, #87CEEB 100%)',
          boxShadow: '4px 4px 0px var(--color-border)',
        }}
      >
        <StringLights />
        <div className="relative z-10">
          <h1 className="font-display text-5xl md:text-7xl text-white drop-shadow-lg" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2)' }}>
            Cornhole249
          </h1>
          <p className="font-ui text-lg md:text-xl text-white/90 mt-2 font-semibold">
            Hamilton's Most Competitive Backyard League
          </p>
          <p className="font-ui text-white/70 mt-1 text-sm">
            Season {currentYear} · Est. 2024
          </p>
          <div className="flex gap-3 justify-center mt-6 flex-wrap">
            <Link to="/games/new" className="btn btn-primary">
              + Log a Game
            </Link>
            <Link to="/standings" className="btn" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '2px solid rgba(255,255,255,0.4)' }}>
              View Standings
            </Link>
          </div>
        </div>
      </div>

      {/* Weekly Recap */}
      {recap && recap.games_played > 0 && (
        <div className="card mb-6" style={{ borderLeft: '4px solid var(--color-secondary)' }}>
          <h2 className="font-display text-xl mb-3" style={{ color: 'var(--color-secondary)' }}>
            ☀️ This Week in Cornhole249
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>{recap.games_played}</div>
              <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>Games this week</div>
            </div>
            {recap.player_of_the_week && (
              <div>
                <div className="font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>{recap.player_of_the_week.display_name}</div>
                <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                  Player of the week · {recap.player_of_the_week.gp}GP {recap.player_of_the_week.wins}W
                </div>
              </div>
            )}
            {recap.top_commenter && (
              <div>
                <div className="font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>{recap.top_commenter.display_name}</div>
                <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                  Most Active · {recap.top_commenter.count} comments
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Games */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>
              Recent Games
            </h2>
            <Link to="/games" className="text-sm font-ui font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1,2,3].map((i) => <div key={i} className="card h-28 animate-pulse" style={{ background: 'var(--color-border)' }} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentGames.map((g) => <GameCard key={g.id} game={g} />)}
              {recentGames.length === 0 && (
                <div className="card text-center py-10 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                  No games yet! <Link to="/games/new" className="underline font-semibold" style={{ color: 'var(--color-primary)' }}>Log the first one.</Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-5">
          {/* Live Tournaments */}
          {activeTournaments.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--color-secondary)' }}>
              <h2 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
                🏆 Live Tournaments
              </h2>
              <div className="flex flex-col gap-2">
                {activeTournaments.map((t) => (
                  <Link
                    key={t.id}
                    to="/tournaments"
                    className="flex items-center justify-between p-2 rounded-xl hover:opacity-80 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.03)' }}
                  >
                    <div>
                      <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                        {t.name}
                      </div>
                      <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                        {t.game_type} · {t.format === 'single_elim' ? 'Single Elim' : 'Double Elim'}
                      </div>
                    </div>
                    <span className="text-xs font-ui font-bold px-2 py-0.5 rounded-full"
                      style={{ background: t.status === 'active' ? '#D1FAE5' : '#FEF3C7', color: t.status === 'active' ? '#065F46' : '#92400E' }}>
                      {t.status === 'active' ? 'Active' : 'Pending'}
                    </span>
                  </Link>
                ))}
              </div>
              <Link to="/tournaments" className="btn btn-primary w-full mt-3 text-sm">
                View Bracket →
              </Link>
            </div>
          )}

          {/* Top Performers */}
          {performers && (
            <div className="card">
              <h2 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
                🏆 Top Performers
              </h2>
              <div className="flex flex-col gap-2">
                {performers.top?.slice(0, 3).map((p, i) => (
                  <Link key={p.user_id} to={`/players/${p.user_id}`} className="flex items-center gap-2 hover:opacity-80">
                    <span className="font-display text-xl w-6 text-center" style={{ color: 'var(--color-secondary)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                    </span>
                    <img src={p.avatar_url} alt={p.display_name} className="w-7 h-7 rounded-full border" style={{ borderColor: 'var(--color-border)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }} />
                    <div className="flex-1">
                      <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{p.display_name}</div>
                    </div>
                    <div className="font-display text-lg" style={{ color: 'var(--color-primary)' }}>{p.win_pct}%</div>
                  </Link>
                ))}
              </div>
              <Link to="/standings" className="btn btn-primary w-full mt-3 text-sm">Full Standings</Link>
            </div>
          )}

          {/* QR Code */}
          <QRShare inline />
        </div>
      </div>
    </div>
  );
}
