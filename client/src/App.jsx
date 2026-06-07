import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LeagueProvider } from './contexts/LeagueContext';
import { authApi } from './api';
import { pageview } from './lib/analytics';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import QRShare from './components/QRShare';
import InstallBanner from './components/InstallBanner';

/** Fires a PostHog $pageview on every route change. Must be rendered inside <BrowserRouter>. */
function PostHogPageView() {
  const location = useLocation();
  useEffect(() => { pageview(); }, [location.pathname]);
  return null;
}

// ── Eagerly loaded — shown on every visit or the very first navigation ────────
import Home      from './pages/Home';
import Standings from './pages/Standings';
import Games     from './pages/Games';
import GameNew   from './pages/GameNew';
import GameDetail from './pages/GameDetail';
import Register  from './pages/Register';
import Login     from './pages/Login';
import Landing   from './pages/Landing';

// ── Lazy loaded — split into separate chunks, fetched on first visit ──────────
const Players       = lazy(() => import('./pages/Players'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const Teams         = lazy(() => import('./pages/Teams'));
const TeamProfile   = lazy(() => import('./pages/TeamProfile'));
const Stats         = lazy(() => import('./pages/Stats'));
const Tournaments   = lazy(() => import('./pages/Tournaments'));
const Odds          = lazy(() => import('./pages/Odds'));
const HallOfFame    = lazy(() => import('./pages/HallOfFame'));
const Rules         = lazy(() => import('./pages/Rules'));
const TrashTalk     = lazy(() => import('./pages/TrashTalk'));
const Admin         = lazy(() => import('./pages/Admin'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword  = lazy(() => import('./pages/ResetPassword'));
const ClaimAccount   = lazy(() => import('./pages/ClaimAccount'));
const VerifyEmail    = lazy(() => import('./pages/VerifyEmail'));
const Join           = lazy(() => import('./pages/Join'));
const CreateLeague   = lazy(() => import('./pages/CreateLeague'));
const LeagueWelcome  = lazy(() => import('./pages/LeagueWelcome'));
const UseCase        = lazy(() => import('./pages/UseCase'));
const LeagueSettings = lazy(() => import('./pages/LeagueSettings'));
const Terms   = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Refunds = lazy(() => import('./pages/Refunds'));
const Cookies = lazy(() => import('./pages/Cookies'));
const Help        = lazy(() => import('./pages/Help'));
const HelpArticle = lazy(() => import('./pages/HelpArticle'));
const HelpContact = lazy(() => import('./pages/HelpContact'));

// Fallback shown while a lazy chunk is downloading
function PageSkeleton() {
  return (
    <div className="flex items-center justify-center py-24">
      <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }}>
        Loading…
      </span>
    </div>
  );
}

function PageWrapper({ children }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <div className="page-enter">{children}</div>
    </Suspense>
  );
}

function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Landing />;
  return <Home />;
}

/**
 * Captures ?ref=<token> on any page load and writes it to a 30-day first-party
 * cookie so the referral survives across tabs and browser restarts.
 */
function ReferralCapture() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref) return;
    document.cookie = `ref=${encodeURIComponent(ref)}; max-age=${30 * 24 * 60 * 60}; path=/; SameSite=Lax`;
    const url = new URL(window.location.href);
    url.searchParams.delete('ref');
    window.history.replaceState(null, '', url.toString());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Email verification banner.
 * Shown to any logged-in user who hasn't verified their email yet.
 * Allows resending the verification email.
 */
function EmailVerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [resent, setResent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!user || user.email_verified_at || !user.email || dismissed) return null;

  const handleResend = async () => {
    try {
      await authApi.resendVerification();
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch {
      // Ignore rate-limit errors silently
    }
  };

  return (
    <div
      className="px-4 py-2.5 text-sm font-ui flex items-center justify-between gap-4"
      style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', color: '#92400E' }}
    >
      <span>
        📧 Please verify your email address.{' '}
        {resent ? (
          <strong>Verification email sent!</strong>
        ) : (
          <button onClick={handleResend} className="underline font-semibold">
            Resend email
          </button>
        )}
      </span>
      <button onClick={() => setDismissed(true)} className="opacity-60 hover:opacity-100 flex-shrink-0">
        ✕
      </button>
    </div>
  );
}

/**
 * Migration banner for existing PIN-only users.
 * Shown until they claim their account with email + password.
 */
function MigrationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!user || !user.needs_migration || dismissed) return null;

  return (
    <div
      className="px-4 py-2.5 text-sm font-ui flex items-center justify-between gap-4"
      style={{ background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', color: '#1E40AF' }}
    >
      <span>
        🔑 PIN login is being phased out.{' '}
        <a href="/claim-account" className="underline font-semibold">
          Set up email + password →
        </a>
      </span>
      <button onClick={() => setDismissed(true)} className="opacity-60 hover:opacity-100 flex-shrink-0">
        ✕
      </button>
    </div>
  );
}

export default function App() {
  const [toasts, setToasts] = useState([]);

  const addToast = (msg) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  return (
    <AuthProvider>
      <PostHogPageView />
      <ReferralCapture />
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <EmailVerificationBanner />
        <MigrationBanner />
        <Navbar />
        <InstallBanner />
        <main className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-6">
          <Routes>
            {/* ── Cornhole249 root (unchanged URLs) ────────────────────── */}
            <Route element={<LeagueProvider slug="cornhole249" />}>
              <Route path="/" element={<PageWrapper><RootRoute /></PageWrapper>} />
              <Route path="/standings" element={<PageWrapper><Standings /></PageWrapper>} />
              <Route path="/games" element={<PageWrapper><Games /></PageWrapper>} />
              <Route path="/games/new" element={<PageWrapper><GameNew onAchievement={addToast} /></PageWrapper>} />
              <Route path="/games/:id" element={<PageWrapper><GameDetail /></PageWrapper>} />
              <Route path="/players" element={<PageWrapper><Players /></PageWrapper>} />
              <Route path="/players/:id" element={<PageWrapper><PlayerProfile /></PageWrapper>} />
              <Route path="/teams" element={<PageWrapper><Teams /></PageWrapper>} />
              <Route path="/teams/:p1/:p2" element={<PageWrapper><TeamProfile /></PageWrapper>} />
              <Route path="/stats" element={<PageWrapper><Stats /></PageWrapper>} />
              <Route path="/tournaments" element={<PageWrapper><Tournaments /></PageWrapper>} />
              <Route path="/odds" element={<PageWrapper><Odds /></PageWrapper>} />
              <Route path="/hall-of-fame" element={<PageWrapper><HallOfFame /></PageWrapper>} />
              <Route path="/rules" element={<PageWrapper><Rules /></PageWrapper>} />
              <Route path="/trash-talk" element={<PageWrapper><TrashTalk /></PageWrapper>} />
              <Route path="/settings" element={<PageWrapper><LeagueSettings /></PageWrapper>} />
            </Route>

            {/* ── Other leagues under /l/:slug/ ─────────────────────────── */}
            <Route path="/l/:slug" element={<LeagueProvider />}>
              <Route index element={<PageWrapper><Home /></PageWrapper>} />
              <Route path="standings" element={<PageWrapper><Standings /></PageWrapper>} />
              <Route path="games" element={<PageWrapper><Games /></PageWrapper>} />
              <Route path="games/new" element={<PageWrapper><GameNew onAchievement={addToast} /></PageWrapper>} />
              <Route path="games/:id" element={<PageWrapper><GameDetail /></PageWrapper>} />
              <Route path="players" element={<PageWrapper><Players /></PageWrapper>} />
              <Route path="players/:id" element={<PageWrapper><PlayerProfile /></PageWrapper>} />
              <Route path="teams" element={<PageWrapper><Teams /></PageWrapper>} />
              <Route path="teams/:p1/:p2" element={<PageWrapper><TeamProfile /></PageWrapper>} />
              <Route path="stats" element={<PageWrapper><Stats /></PageWrapper>} />
              <Route path="tournaments" element={<PageWrapper><Tournaments /></PageWrapper>} />
              <Route path="odds" element={<PageWrapper><Odds /></PageWrapper>} />
              <Route path="hall-of-fame" element={<PageWrapper><HallOfFame /></PageWrapper>} />
              <Route path="rules" element={<PageWrapper><Rules /></PageWrapper>} />
              <Route path="trash-talk" element={<PageWrapper><TrashTalk /></PageWrapper>} />
              <Route path="welcome" element={<PageWrapper><LeagueWelcome /></PageWrapper>} />
              <Route path="wizard" element={<PageWrapper><UseCase /></PageWrapper>} />
              <Route path="settings" element={<PageWrapper><LeagueSettings /></PageWrapper>} />
              <Route path="join" element={<PageWrapper><Join /></PageWrapper>} />
            </Route>

            {/* ── Non-league routes ─────────────────────────────────────── */}
            <Route path="/admin" element={<PageWrapper><Admin /></PageWrapper>} />
            <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
            <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
            <Route path="/forgot-password" element={<PageWrapper><ForgotPassword /></PageWrapper>} />
            <Route path="/reset-password" element={<PageWrapper><ResetPassword /></PageWrapper>} />
            <Route path="/claim-account" element={<PageWrapper><ClaimAccount /></PageWrapper>} />
            <Route path="/verify-email/:token" element={<PageWrapper><VerifyEmail /></PageWrapper>} />
            <Route path="/join" element={<PageWrapper><Join /></PageWrapper>} />
            <Route path="/join/:code" element={<PageWrapper><Join /></PageWrapper>} />
            <Route path="/leagues/new" element={<PageWrapper><CreateLeague /></PageWrapper>} />
            <Route path="/terms" element={<PageWrapper><Terms /></PageWrapper>} />
            <Route path="/privacy" element={<PageWrapper><Privacy /></PageWrapper>} />
            <Route path="/refunds" element={<PageWrapper><Refunds /></PageWrapper>} />
            <Route path="/cookies" element={<PageWrapper><Cookies /></PageWrapper>} />
            <Route path="/help" element={<PageWrapper><Help /></PageWrapper>} />
            <Route path="/help/contact" element={<PageWrapper><HelpContact /></PageWrapper>} />
            <Route path="/help/:slug" element={<PageWrapper><HelpArticle /></PageWrapper>} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="text-center py-4 pb-24 lg:pb-4 flex items-center justify-center gap-4">
          <Link to="/help" className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
            Help
          </Link>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }}>·</span>
          <Link to="/privacy" className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
            Privacy Policy
          </Link>
        </footer>

        {/* Bottom nav — mobile only */}
        <BottomNav />

        {/* QR Share floating button — desktop only */}
        <div className="hidden lg:block">
          <QRShare />
        </div>

        {/* Achievement toasts — above bottom nav on mobile */}
        <div className="fixed bottom-20 lg:bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="toast-enter bg-primary text-white px-4 py-3 rounded-card shadow-card flex items-center gap-2 font-ui font-bold"
            >
              <span>🏆</span>
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </AuthProvider>
  );
}
