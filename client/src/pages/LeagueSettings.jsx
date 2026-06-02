import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { leaguesApi, billingApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLeague, leaguePath } from '../contexts/LeagueContext';
import InviteKit from '../components/InviteKit';
import UpgradeModal from '../components/UpgradeModal';

const ROLE_BADGE = {
  owner: { label: 'Owner', bg: '#FEF3C7', color: '#92400E' },
  admin: { label: 'Admin', bg: '#EFF6FF', color: '#1E40AF' },
  player: { label: 'Player', bg: 'var(--color-bg)', color: 'var(--color-text-secondary)' },
};

export default function LeagueSettings() {
  const { slug } = useLeague();
  const navigate = useNavigate();
  const { user, leagues, refreshUser } = useAuth();

  // Determine the current user's role in this league
  const myMembership = leagues?.find((l) => l.slug === slug);
  const myRole = myMembership?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  // League info
  const [league, setLeague] = useState(null);
  const [joinCode, setJoinCode] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit form state
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [rules, setRules] = useState('hamilton');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Code generation
  const [generatingCode, setGeneratingCode] = useState(false);

  // Member removal
  const [removingId, setRemovingId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Billing
  const { leagueId, plan } = useLeague();
  const [portalLoading, setPortalLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await billingApi.portal(leagueId);
      window.location.href = url;
    } catch {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (leagues && !canManage) {
      // Player trying to access settings — redirect to standings
      navigate(leaguePath(slug, 'standings'), { replace: true });
      return;
    }
    load();
  }, [slug, user, leagues]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const [leagueData, membersData] = await Promise.all([
        leaguesApi.get(slug),
        leaguesApi.members(slug),
      ]);
      setLeague(leagueData);
      setJoinCode(leagueData.join_code);
      setMembers(membersData);
      setName(leagueData.name);
      setIsPublic(!!leagueData.is_public);
      setRules(leagueData.rules || 'hamilton');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load league settings');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setSaveError('League name is required'); return; }
    setSaving(true); setSaveError(''); setSaveSuccess(false);
    try {
      const updated = await leaguesApi.update(slug, { name: name.trim(), is_public: isPublic, rules });
      setLeague(updated);
      setName(updated.name);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      await refreshUser(); // refresh leagues list in case name changed
    } catch (e) {
      setSaveError(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const { code } = await leaguesApi.generateCode(slug);
      setJoinCode(code);
    } catch (e) {
      // Silent fail — show the existing code
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleRemove = async (memberId) => {
    setRemovingId(memberId);
    try {
      await leaguesApi.removeMember(slug, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e) {
      // Silent fail — member stays in list
    } finally {
      setRemovingId(null);
      setConfirmRemove(null);
    }
  };

  const joinLink = joinCode ? `${window.location.origin}/join/${joinCode}` : null;

  if (loading) {
    return (
      <div className="max-w-lg mx-auto mt-8 text-center">
        <p className="font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading settings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-8 text-center">
        <p className="font-ui" style={{ color: 'var(--color-danger)' }}>{error}</p>
        <Link to={leaguePath(slug, 'standings')} className="btn btn-secondary mt-4 text-sm">← Back</Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to={leaguePath(slug, 'standings')}
          className="text-2xl opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: 'var(--color-text-primary)' }}
        >
          ←
        </Link>
        <div>
          <h1 className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>
            League Settings
          </h1>
          <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {league?.name}
          </p>
        </div>
      </div>

      {/* Billing */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>
              {plan === 'free' ? '⭐ Plan' : '🌟 Plan'}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="text-xs font-ui font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={plan === 'free'
                  ? { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }
                  : { background: 'rgba(58,107,53,0.12)', border: '1px solid rgba(58,107,53,0.3)', color: 'var(--color-primary)' }
                }
              >
                {plan === 'free' ? 'Free' : 'Pro'}
              </span>
              {plan !== 'free' && league?.stripe_subscription_id && (
                <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>Active subscription</span>
              )}
            </div>
          </div>
          <div>
            {plan === 'free' ? (
              <button
                onClick={() => setShowUpgrade(true)}
                className="btn btn-primary text-sm px-4 py-2"
              >
                Upgrade to Pro
              </button>
            ) : league?.stripe_subscription_id ? (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="btn text-sm px-4 py-2 disabled:opacity-50"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                {portalLoading ? 'Redirecting…' : 'Manage subscription'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* League info */}
      <div className="card p-6">
        <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
          🏷 League Info
        </h2>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              League Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-xl border font-ui"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Visibility
            </label>
            <div className="flex gap-3">
              {[
                { value: true, label: '🌐 Public', desc: 'Anyone can view standings & games' },
                { value: false, label: '🔒 Private', desc: 'Only members can see anything' },
              ].map(({ value, label, desc }) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setIsPublic(value)}
                  className="flex-1 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: isPublic === value ? 'var(--color-primary)' : 'var(--color-border)',
                    background: isPublic === value ? 'rgba(58,107,53,0.07)' : 'var(--color-bg)',
                  }}
                >
                  <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
                  <span className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Scoring Rules
            </label>
            <div className="flex gap-3">
              {[
                { value: 'hamilton', label: 'Hamilton', desc: 'Best-of, max 10 pts' },
                { value: 'aca', label: 'ACA', desc: 'Standard 21 pts' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRules(value)}
                  className="flex-1 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: rules === value ? 'var(--color-primary)' : 'var(--color-border)',
                    background: rules === value ? 'rgba(58,107,53,0.07)' : 'var(--color-bg)',
                  }}
                >
                  <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
                  <span className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {saveError && (
            <p className="text-sm font-ui p-2 rounded-xl text-center" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
              {saveError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary py-2.5 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveSuccess ? '✓ Saved!' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Invite kit */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>
            🔗 Invite Link
          </h2>
          <button
            onClick={handleGenerateCode}
            disabled={generatingCode}
            className="text-xs font-ui underline disabled:opacity-50"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {generatingCode ? 'Generating…' : 'Generate new code'}
          </button>
        </div>
        {joinLink ? (
          <InviteKit joinLink={joinLink} joinCode={joinCode} leagueName={league?.name} />
        ) : (
          <p className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            No active join code.{' '}
            <button onClick={handleGenerateCode} className="underline" style={{ color: 'var(--color-primary)' }}>
              Generate one
            </button>
          </p>
        )}
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Pro features"
        leagueId={leagueId}
      />

      {/* Members */}
      <div className="card p-6">
        <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
          👥 Members <span className="font-ui text-base font-normal opacity-60">({members.length})</span>
        </h2>
        <div className="flex flex-col gap-2">
          {members.map((m) => {
            const badge = ROLE_BADGE[m.role] || ROLE_BADGE.player;
            const isMe = m.id === user?.id;
            const canRemove = canManage && m.role !== 'owner' && !isMe;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 py-2.5 border-b last:border-0"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <img
                  src={m.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.display_name}`}
                  alt={m.display_name}
                  className="w-8 h-8 rounded-full flex-shrink-0"
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.display_name}`; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-ui font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {m.display_name} {isMe && <span className="opacity-50">(you)</span>}
                  </div>
                  {m.email && (
                    <div className="font-ui text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {m.email}
                    </div>
                  )}
                </div>
                <span
                  className="text-xs font-ui font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {badge.label}
                </span>
                {canRemove && (
                  confirmRemove === m.id ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={removingId === m.id}
                        className="text-xs font-ui font-semibold px-2 py-1 rounded-lg text-white"
                        style={{ background: 'var(--color-danger)' }}
                      >
                        {removingId === m.id ? '…' : 'Remove'}
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="text-xs font-ui px-2 py-1 rounded-lg border"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(m.id)}
                      className="text-xs font-ui opacity-40 hover:opacity-100 flex-shrink-0 transition-opacity"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      Remove
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
