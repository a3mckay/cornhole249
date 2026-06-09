import React, { useState, useEffect } from 'react';
import { tournamentsApi, usersApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLeague } from '../contexts/LeagueContext';
import { capture } from '../lib/analytics';
import BracketView from '../components/BracketView';
import ShareButton from '../components/ShareButton';
import UpgradeModal from '../components/UpgradeModal';

/**
 * Derive the champion team and runner-up from a completed tournament's matches.
 * The final match is whichever completed match has the highest round number.
 */
function extractFinalResult(tournament) {
  const completedMatches = (tournament.matches || []).filter((m) => m.winner_team != null);
  if (!completedMatches.length) return null;
  const finalMatch = completedMatches.reduce((best, m) => (m.round > best.round ? m : best));
  const champion = finalMatch.winner_team === 1 ? finalMatch.team1_players : finalMatch.team2_players;
  const runnerUp = finalMatch.winner_team === 1 ? finalMatch.team2_players : finalMatch.team1_players;
  // Scores: champion's score first
  const champScore = finalMatch.winner_team === 1 ? finalMatch.score_team1 : finalMatch.score_team2;
  const runnerScore = finalMatch.winner_team === 1 ? finalMatch.score_team2 : finalMatch.score_team1;
  return { champion, runnerUp, champScore, runnerScore };
}

function PlayerAvatars({ players, size = 14 }) {
  const px = size * 4;
  return (
    <div className="flex justify-center" style={{ gap: 4 }}>
      {players.map((p) => {
        const initials = p.display_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
        return (
          <div key={p.id} style={{ width: px, height: px, borderRadius: '50%', overflow: 'hidden', border: '3px solid #D48B2D', flexShrink: 0 }}>
            <img
              src={p.avatar_url}
              alt={p.display_name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentNode.style.background = 'var(--color-primary)';
                e.target.parentNode.style.display = 'flex';
                e.target.parentNode.style.alignItems = 'center';
                e.target.parentNode.style.justifyContent = 'center';
                e.target.parentNode.style.color = 'white';
                e.target.parentNode.style.fontWeight = '700';
                e.target.parentNode.style.fontSize = `${px * 0.35}px`;
                e.target.parentNode.textContent = initials;
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function TournamentChampionModal({ tournament, onClose }) {
  const result = extractFinalResult(tournament);
  if (!result) return null;

  const { champion, runnerUp, champScore, runnerScore } = result;
  const championNames = champion.map((p) => p.display_name).join(' & ');
  const runnerUpNames = runnerUp.map((p) => p.display_name).join(' & ');
  const hasScore = champScore != null && runnerScore != null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(44,36,22,0.75)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-card shadow-card overflow-hidden"
        style={{ background: 'var(--color-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold header */}
        <div
          className="text-center px-6 pt-8 pb-6"
          style={{ background: 'linear-gradient(135deg, #C9952A 0%, #8B6914 100%)' }}
        >
          <div style={{ fontSize: 64, lineHeight: 1 }}>🏆</div>
          <div className="font-display text-white text-xl mt-3 leading-tight">{tournament.name}</div>
          <div className="font-ui text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {tournament.game_type} · {tournament.format === 'single_elim' ? 'Single Elimination' : 'Double Elimination'}
          </div>
        </div>

        {/* Champion */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div
            className="text-xs font-ui font-bold uppercase tracking-widest mb-4"
            style={{ color: '#C9952A', letterSpacing: '0.15em' }}
          >
            Champion
          </div>

          <PlayerAvatars players={champion} size={14} />

          <div className="font-display text-3xl mt-3 leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {championNames}
          </div>

          {hasScore && (
            <div className="font-ui font-bold text-lg mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {champScore} – {runnerScore}
            </div>
          )}

          {runnerUpNames && (
            <div className="font-ui text-sm mt-3" style={{ color: 'var(--color-text-secondary)' }}>
              Runner-up: <span style={{ color: 'var(--color-text-primary)' }}>{runnerUpNames}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2 mt-2">
          <ShareButton
            imageUrl={`/og/tournament/${tournament.id}.png`}
            shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/tournaments?id=${tournament.id}` : ''}
            title={`${championNames} wins ${tournament.name}!`}
            text={`${tournament.game_type} tournament champion — Cornhole249`}
            entityType="tournament_champion"
          />
          <button onClick={onClose} className="btn btn-ghost text-sm">
            View Bracket
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_COLORS = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  active: { bg: '#D1FAE5', text: '#065F46', label: 'Active' },
  complete: { bg: '#DBEAFE', text: '#1E40AF', label: 'Complete' },
};

export default function Tournaments() {
  const { user } = useAuth();
  const { plan, leagueId } = useLeague();
  const [tournaments, setTournaments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  // Create form state
  const [form, setForm] = useState({
    name: '', format: 'single_elim', game_type: '1v1',
    season: 2025, seeding: 'balanced',
    selectedPlayers: [],
    manualOrder: [], // ordered list of player ids for manual seeding
  });
  const [creating, setCreating] = useState(false);
  const [showChampionModal, setShowChampionModal] = useState(false);

  useEffect(() => {
    Promise.all([tournamentsApi.list(), usersApi.list()])
      .then(([t, u]) => { setTournaments(t); setAllUsers(u); })
      .finally(() => setLoading(false));
  }, []);

  const loadTournament = async (id) => {
    const t = await tournamentsApi.get(id);
    setSelected(t);
    // Open the champion modal automatically when a completed tournament is viewed.
    // This is the highest-shareability moment — celebrate the winner.
    if (t.status === 'complete') setShowChampionModal(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { alert('Enter a tournament name'); return; }
    if (form.selectedPlayers.length < 2) { alert('Select at least 2 players'); return; }

    setCreating(true);
    try {
      const orderedPlayers = form.seeding === 'manual' ? form.manualOrder : form.selectedPlayers;
      const teams = form.game_type === '2v2'
        ? chunk(orderedPlayers, 2)
        : orderedPlayers.map((id) => [id]);

      const created = await tournamentsApi.create({
        name: form.name.trim(),
        format: form.format,
        game_type: form.game_type,
        season: form.season,
        seeding: form.seeding,
        teams,
      });

      capture('tournament_created', { format: created.format, game_type: created.game_type });
      const t = await tournamentsApi.list();
      setTournaments(t);
      setShowCreate(false);
      // Auto-open the new tournament
      loadTournament(created.id);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  };

  const chunk = (arr, n) => {
    const result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
  };

  const togglePlayer = (id) => {
    setForm((f) => {
      const isSelected = f.selectedPlayers.includes(id);
      return {
        ...f,
        selectedPlayers: isSelected
          ? f.selectedPlayers.filter((x) => x !== id)
          : [...f.selectedPlayers, id],
        manualOrder: isSelected
          ? f.manualOrder.filter((x) => x !== id)
          : [...f.manualOrder, id],
      };
    });
  };

  const moveManualPlayer = (index, direction) => {
    setForm((f) => {
      const arr = [...f.manualOrder];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return f;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return { ...f, manualOrder: arr };
    });
  };

  if (loading) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>Tournaments</h1>
        {!!user?.is_admin && (
          <button
            onClick={() => plan === 'free' ? setShowUpgrade(true) : setShowCreate((s) => !s)}
            className="btn btn-primary self-start sm:self-auto"
          >
            + Create Tournament
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && !!user?.is_admin && (
        <div className="card mb-6">
          <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>New Tournament</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                placeholder="Summer 2025 Invitational" />
            </div>
            <div>
              <label className="block text-sm font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Format</label>
              <select value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
                <option value="single_elim">Single Elimination</option>
                <option value="double_elim">Double Elimination</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Game Type</label>
              <select value={form.game_type} onChange={(e) => setForm((f) => ({ ...f, game_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
                <option value="1v1">1v1</option>
                <option value="2v2">2v2</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>Seeding</label>
              <select value={form.seeding} onChange={(e) => setForm((f) => ({ ...f, seeding: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border font-ui text-sm"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
                <option value="balanced">Balanced (Elo Snake Draft)</option>
                <option value="random">Random</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Participants ({form.selectedPlayers.length} selected)
            </label>
            <div className="flex flex-wrap gap-2">
              {allUsers.map((u) => (
                <button key={u.id} onClick={() => togglePlayer(u.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-ui transition-all"
                  style={{
                    background: form.selectedPlayers.includes(u.id) ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: form.selectedPlayers.includes(u.id) ? 'white' : 'var(--color-text-primary)',
                    borderColor: 'var(--color-border)',
                  }}>
                  <img src={u.avatar_url} alt={u.display_name} className="w-5 h-5 rounded-full"
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.display_name}`; }} />
                  {u.display_name}
                </button>
              ))}
            </div>
          </div>

          {/* Manual seed ordering */}
          {form.seeding === 'manual' && form.manualOrder.length > 0 && (
            <div>
              <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Bracket Order <span className="font-normal opacity-60">(drag to reorder — #1 plays last seed)</span>
              </label>
              <div className="flex flex-col gap-1">
                {form.manualOrder.map((playerId, idx) => {
                  const u = allUsers.find((x) => x.id === playerId);
                  if (!u) return null;
                  return (
                    <div key={playerId} className="flex items-center gap-2 px-3 py-2 rounded-xl border font-ui text-sm"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                      <span className="w-5 text-center font-bold" style={{ color: 'var(--color-text-secondary)' }}>{idx + 1}</span>
                      <img src={u.avatar_url} alt={u.display_name} className="w-6 h-6 rounded-full"
                        onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.display_name}`; }} />
                      <span className="flex-1" style={{ color: 'var(--color-text-primary)' }}>{u.display_name}</span>
                      <button onClick={() => moveManualPlayer(idx, -1)} disabled={idx === 0}
                        className="px-1.5 py-0.5 rounded text-xs disabled:opacity-30"
                        style={{ color: 'var(--color-text-secondary)' }}>▲</button>
                      <button onClick={() => moveManualPlayer(idx, 1)} disabled={idx === form.manualOrder.length - 1}
                        className="px-1.5 py-0.5 rounded text-xs disabled:opacity-30"
                        style={{ color: 'var(--color-text-secondary)' }}>▼</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
            <button onClick={handleCreate} disabled={creating || !form.name || form.selectedPlayers.length < 2} className="btn btn-primary">
              {creating ? 'Creating...' : 'Create Tournament'}
            </button>
          </div>
        </div>
      )}

      {/* Tournament list */}
      {!selected && (
        <div className="grid sm:grid-cols-2 gap-4">
          {tournaments.map((t) => {
            const sc = STATUS_COLORS[t.status] || STATUS_COLORS.pending;
            return (
              <div key={t.id} className="card card-hover cursor-pointer" onClick={() => loadTournament(t.id)}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>{t.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-ui font-bold" style={{ background: sc.bg, color: sc.text }}>
                    {sc.label}
                  </span>
                </div>
                <div className="flex gap-3 text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{t.game_type}</span>
                  <span>·</span>
                  <span>{t.format === 'single_elim' ? 'Single Elim' : 'Double Elim'}</span>
                  <span>·</span>
                  <span>Season {t.season}</span>
                </div>
              </div>
            );
          })}
          {tournaments.length === 0 && (
            <div className="col-span-full card text-center py-12 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              No tournaments yet.
              {!!user?.is_admin && ' Create one above!'}
            </div>
          )}
        </div>
      )}

      {/* Bracket view */}
      {selected && (
        <div>
          <button onClick={() => setSelected(null)} className="text-sm font-ui hover:underline mb-4 block" style={{ color: 'var(--color-text-secondary)' }}>
            ← All Tournaments
          </button>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>{selected.name}</h2>
              <div className="text-sm font-ui mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {selected.game_type} · {selected.format === 'single_elim' ? 'Single Elimination' : 'Double Elimination'} · Season {selected.season}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const sc = STATUS_COLORS[selected.status] || STATUS_COLORS.pending;
                return (
                  <span className="px-3 py-1 rounded-full text-sm font-ui font-bold" style={{ background: sc.bg, color: sc.text }}>
                    {sc.label}
                  </span>
                );
              })()}
              <ShareButton
                imageUrl={`/og/tournament/${selected.id}.png`}
                shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/tournaments?id=${selected.id}` : ''}
                title={`${selected.name} — Cornhole249`}
                text={`${selected.game_type} tournament`}
                entityType="tournament"
              />
            </div>
          </div>
          <div className="card">
            <BracketView tournament={selected} onRefresh={() => loadTournament(selected.id)} />
          </div>
        </div>
      )}

      {/* Champion modal — shown automatically when a complete tournament is opened */}
      {selected && showChampionModal && (
        <TournamentChampionModal
          tournament={selected}
          onClose={() => setShowChampionModal(false)}
        />
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Tournaments"
        leagueId={leagueId}
      />
    </div>
  );
}
