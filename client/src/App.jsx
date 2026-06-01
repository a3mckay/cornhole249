import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { LeagueProvider } from './contexts/LeagueContext';
import { authApi } from './api';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import QRShare from './components/QRShare';

import Home from './pages/Home';
import Standings from './pages/Standings';
import Games from './pages/Games';
import GameNew from './pages/GameNew';
import GameDetail from './pages/GameDetail';
import Players from './pages/Players';
import PlayerProfile from './pages/PlayerProfile';
import Teams from './pages/Teams';
import TeamProfile from './pages/TeamProfile';
import Stats from './pages/Stats';
import Tournaments from './pages/Tournaments';
import Odds from './pages/Odds';
import HallOfFame from './pages/HallOfFame';
import Rules from './pages/Rules';
import TrashTalk from './pages/TrashTalk';
import Admin from './pages/Admin';
import Register from './pages/Register';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ClaimAccount from './pages/ClaimAccount';
import VerifyEmail from './pages/VerifyEmail';
import Join from './pages/Join';
import CreateLeague from './pages/CreateLeague';
import LeagueWelcome from './pages/LeagueWelcome';
import UseCase from './pages/UseCase';
import LeagueSettings from './pages/LeagueSettings';

function PageWrapper({ children }) {
  return <div className="page-enter">{children}</div>;
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
      <ReferralCapture />
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <EmailVerificationBanner />
        <MigrationBanner />
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-6">
          <Routes>
            {/* ── Cornhole249 root (unchanged URLs) ────────────────────── */}
            <Route element={<LeagueProvider slug="cornhole249" />}>
              <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
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
              <Route index element={<Navigate to="standings" replace />} />
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
            </Route>

            {/* ── Non-league routes ─────────────────────────────────────── */}
            <Route path="/admin" element={<PageWrapper><Admin /></PageWrapper>} />
            <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
            <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
            <Route path="/forgot-password" element={<PageWrapper><ForgotPassword /></PageWrapper>} />
            <Route path="/reset-password" element={<PageWrapper><ResetPassword /></PageWrapper>} />
            <Route path="/claim-account" element={<PageWrapper><ClaimAccount /></PageWrapper>} />
            <Route path="/verify-email/:token" element={<PageWrapper><VerifyEmail /></PageWrapper>} />
            <Route path="/join/:code" element={<PageWrapper><Join /></PageWrapper>} />
            <Route path="/leagues/new" element={<PageWrapper><CreateLeague /></PageWrapper>} />
          </Routes>
        </main>

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
