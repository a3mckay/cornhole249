import React, { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';

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

function PageWrapper({ children }) {
  return <div className="page-enter">{children}</div>;
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
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-6">
          <Routes>
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
            <Route path="/admin" element={<PageWrapper><Admin /></PageWrapper>} />
            <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
          </Routes>
        </main>

        {/* Bottom nav — mobile only */}
        <BottomNav />

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
