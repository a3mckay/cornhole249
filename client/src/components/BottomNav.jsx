import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { leaguePath } from '../contexts/LeagueContext';
import { useAuth } from '../hooks/useAuth';
import { getSport } from '../sports';

const TAB_DEFS = [
  {
    key: 'games',
    label: 'Games',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="12" r="2.5" />
      </svg>
    ),
  },
  {
    key: 'standings',
    label: 'Standings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h4v4H3zM10 11h4v10h-4zM17 7h4v14h-4z" />
      </svg>
    ),
  },
  {
    key: 'stats',
    label: 'Stats',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'trash-talk',
    label: 'Trash 🍺',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const { leagues } = useAuth();

  // BottomNav renders globally — OUTSIDE the per-route LeagueProvider — so
  // useLeague() would always hand back the default cornhole249 context, sending
  // every tab back to cornhole regardless of which league you're in. Derive the
  // current league from the URL instead (same approach as Navbar): /l/:slug/*
  // is a non-cornhole league; anything else is cornhole249.
  const currentSlug = pathname.match(/^\/l\/([^/]+)/)?.[1] ?? 'cornhole249';
  const currentLeague = (leagues || []).find((l) => l.slug === currentSlug);
  const sport = currentLeague?.sport || 'cornhole';

  // The bottom nav is LEAGUE-scoped (Games/Standings/Stats/Trash all live inside
  // a league). The House hub sits above any league, so the nav makes no sense
  // there — hide it. House renders at /house* and, for multi-sport users, at "/"
  // (mirrors RootRoute's sportCount>=2 rule; single-sport users keep Home + nav).
  const sportCount = new Set((leagues || []).map((l) => l.sport || 'cornhole')).size;
  const onHouse = pathname.startsWith('/house') || (pathname === '/' && sportCount >= 2);
  if (onHouse) return null;
  // Per-sport icon overrides (registry). Today only the Games tab swaps — pool
  // shows 🎱 instead of the cornhole-board SVG. Falls back to the built-in icon.
  const sportIcons = getSport(sport).icons || {};
  const tabs = TAB_DEFS.map((t) => {
    const override = sportIcons[t.key];
    return {
      ...t,
      to: leaguePath(currentSlug, t.key),
      icon: override
        ? <span className="text-xl leading-none" aria-hidden="true">{override}</span>
        : t.icon,
    };
  });

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t"
      style={{
        backgroundColor: 'var(--color-navbar)',
        borderColor: 'rgba(255,255,255,0.1)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-ui font-semibold transition-colors ${
              isActive ? 'text-white' : 'text-amber-100/50 hover:text-amber-100/80'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span style={{ color: isActive ? 'var(--color-secondary)' : undefined }}>
                {tab.icon}
              </span>
              <span style={{ fontSize: '10px' }}>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
