import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api';
import { useAuth } from '../hooks/useAuth';

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteFrom, setDeleteFrom] = useState('');
  const [deleteTo, setDeleteTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  // Join codes
  const [joinCodes, setJoinCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!user?.is_admin) { navigate('/'); return; }
    Promise.all([adminApi.users(), adminApi.joinCodes()])
      .then(([u, c]) => { setUsers(u); setJoinCodes(c); })
      .finally(() => setLoading(false));
  }, [user]);

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    setNewCode(null);
    setCopiedCode(false);
    try {
      const result = await adminApi.generateCode();
      setNewCode(result.code);
      const codes = await adminApi.joinCodes();
      setJoinCodes(codes);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to generate code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleRevokeCode = async (code) => {
    if (!confirm(`Revoke code ${code}?`)) return;
    try {
      await adminApi.revokeCode(code);
      setJoinCodes((c) => c.filter((x) => x.code !== code));
      if (newCode === code) setNewCode(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to revoke');
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleAdmin = async (targetId, currentAdmin) => {
    if (targetId === user.id) {
      alert("You can't modify your own admin status!");
      return;
    }
    try {
      const updated = await adminApi.setAdmin(targetId, !currentAdmin);
      setUsers((u) => u.map((x) => x.id === targetId ? { ...x, is_admin: updated.is_admin } : x));
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update');
    }
  };

  const handleBulkDelete = async () => {
    if (!deleteFrom || !deleteTo) { alert('Specify date range'); return; }
    if (!confirm(`Delete all games between ${deleteFrom} and ${deleteTo}?`)) return;
    setDeleting(true);
    try {
      const result = await adminApi.bulkDeleteGames(deleteFrom, deleteTo);
      setDeleteResult(result.deleted);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setDeleting(false);
    }
  };

  if (!user?.is_admin) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="flex items-center gap-3 p-4 rounded-2xl mb-6"
        style={{ background: 'rgba(212,139,45,0.1)', border: '2px solid var(--color-secondary)' }}
      >
        <span className="text-3xl">⚙️</span>
        <div>
          <h1 className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>Admin Panel</h1>
          <p className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>You have admin access, {user.display_name}.</p>
        </div>
      </div>

      {/* User Management */}
      <div className="card mb-6">
        <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
          👥 User Management
        </h2>
        {loading ? (
          <div className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
                <img src={u.avatar_url} alt={u.display_name} className="w-9 h-9 rounded-full border"
                  style={{ borderColor: 'var(--color-border)' }}
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.display_name}`; }} />
                <div className="flex-1">
                  <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    {u.display_name}
                    {u.nickname && <span className="ml-1 opacity-60">"{u.nickname}"</span>}
                  </div>
                  <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                    Elo: {Math.round(u.elo_rating)} · ID: {u.id}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                  disabled={u.id === user.id}
                  className={`px-3 py-1 rounded-full text-xs font-ui font-bold transition-colors ${
                    u.is_admin ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={{ opacity: u.id === user.id ? 0.4 : 1 }}
                >
                  {u.is_admin ? '★ Admin' : 'Make Admin'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Delete Games */}
      <div className="card mb-6">
        <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
          🗑️ Bulk Delete Games
        </h2>
        <p className="text-sm font-ui mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Permanently delete all games played within a date range. This cannot be undone.
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>From</label>
            <input type="date" value={deleteFrom} onChange={(e) => setDeleteFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border font-ui text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
          </div>
          <div>
            <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>To</label>
            <input type="date" value={deleteTo} onChange={(e) => setDeleteTo(e.target.value)}
              className="px-3 py-2 rounded-xl border font-ui text-sm"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
          </div>
          <button onClick={handleBulkDelete} disabled={deleting} className="btn btn-danger">
            {deleting ? 'Deleting...' : '🗑️ Delete Games'}
          </button>
        </div>
        {deleteResult !== null && (
          <div className="mt-3 text-sm font-ui p-2 rounded-xl" style={{ background: '#D1FAE5', color: '#065F46' }}>
            ✓ Deleted {deleteResult} game{deleteResult !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Join Codes */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>
            🔑 Join Codes
          </h2>
          <button onClick={handleGenerateCode} disabled={generatingCode} className="btn btn-primary text-sm">
            {generatingCode ? 'Generating...' : '+ Generate Code'}
          </button>
        </div>
        <p className="text-sm font-ui mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Share a code with someone to let them create an account. Each code can only be used once.
        </p>

        {newCode && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{ background: '#D1FAE5', border: '1.5px solid #6EE7B7' }}>
            <div>
              <div className="text-xs font-ui font-semibold" style={{ color: '#065F46' }}>New code generated:</div>
              <div className="font-display text-2xl tracking-widest" style={{ color: '#047857' }}>{newCode}</div>
            </div>
            <button onClick={() => handleCopyCode(newCode)} className="ml-auto btn btn-ghost text-sm" style={{ color: '#047857' }}>
              {copiedCode ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>
        ) : joinCodes.length === 0 ? (
          <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>No codes generated yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {joinCodes.map((c) => (
              <div key={c.code} className="flex items-center gap-3 p-2 rounded-xl text-sm font-ui" style={{ background: 'rgba(0,0,0,0.03)' }}>
                <span className="font-display tracking-widest text-base" style={{ color: c.used_by_name ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>
                  {c.code}
                </span>
                <div className="flex-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {c.used_by_name ? (
                    <span className="text-green-700">Used by {c.used_by_name} · {new Date(c.used_at).toLocaleDateString()}</span>
                  ) : (
                    <span>Unused · Created {new Date(c.created_at).toLocaleDateString()}</span>
                  )}
                </div>
                {!c.used_by_name && (
                  <button onClick={() => handleCopyCode(c.code)} className="text-xs px-2 py-0.5 rounded-full hover:bg-gray-200 transition-colors"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    Copy
                  </button>
                )}
                {!c.used_by_name && (
                  <button onClick={() => handleRevokeCode(c.code)} className="text-xs px-2 py-0.5 rounded-full text-red-500 hover:bg-red-50 transition-colors">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
