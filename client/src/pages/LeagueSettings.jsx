import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { leaguesApi, billingApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLeague, leaguePath } from '../contexts/LeagueContext';
import UpgradeModal from '../components/UpgradeModal';

const ROLE_BADGE = {
  owner: { label: 'Owner', bg: '#FEF3C7', color: '#92400E' },
  admin: { label: 'Admin', bg: '#EFF6FF', color: '#1E40AF' },
  player: { label: 'Player', bg: 'var(--color-bg)', color: 'var(--color-text-secondary)' },
};

export default function LeagueSettings() {
  const { slug } = useLeague();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, leagues, refreshUser } = useAuth();

  // Determine the current user's role in this league
  const myMembership = leagues?.find((l) => l.slug === slug);
  const myRole = myMembership?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  // League info
  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit form state
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [rules, setRules] = useState('hamilton');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Invite token (private leagues)
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteTokenExpiresAt, setInviteTokenExpiresAt] = useState(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Member removal
  const [removingId, setRemovingId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Billing
  const { leagueId, plan } = useLeague();
  const [portalLoading, setPortalLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Billing redirect banner state.
  // Persisted via sessionStorage so it survives the page reload that happens
  // once the webhook has confirmed the plan change.
  const [billingBanner, setBillingBanner] = useState(() => {
    const stored = sessionStorage.getItem('billing_banner');
    if (stored) {
      sessionStorage.removeItem('billing_banner');
      try { return JSON.parse(stored); } catch { return null; }
    }
    return null;
  });

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await billingApi.portal(leagueId);
      window.location.href = url;
    } catch {
      setPortalLoading(false);
    }
  };

  const handleRenewPass = async () => {
    setRenewLoading(true);
    try {
      const { url } = await billingApi.checkout(leagueId, 'weekend_pass');
      window.location.href = url;
    } catch {
      setRenewLoading(false);
    }
  };

  // Weekend pass countdown helpers
  const expiresAtDate = league?.expires_at ? new Date(league.expires_at) : null;
  const msRemaining = expiresAtDate ? expiresAtDate - Date.now() : null;
  const daysRemaining = msRemaining !== null ? Math.ceil(msRemaining / (1000 * 60 * 60 * 24)) : null;
  const passExpired = daysRemaining !== null && daysRemaining <= 0;
  const passUrgent = daysRemaining !== null && daysRemaining <= 2 && !passExpired;

  // Handle ?plan= from email CTAs (weekend pass warning/expiry emails) —
  // auto-open the upgrade modal so the user sees all options immediately.
  // Handle ?billing=success / ?billing=cancelled from Stripe redirect
  useEffect(() => {
    const planParam = searchParams.get('plan');
    if (planParam && ['pro_monthly', 'pro_yearly', 'weekend_pass'].includes(planParam)) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('plan');
      window.history.replaceState(null, '', cleanUrl.toString());
      setShowUpgrade(true);
    }

    const bStatus = searchParams.get('billing');
    if (!bStatus) return;

    // Scrub the query param from the URL immediately
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('billing');
    window.history.replaceState(null, '', cleanUrl.toString());

    if (bStatus === 'cancelled') {
      setBillingBanner({ type: 'cancelled' });
      return;
    }

    if (bStatus === 'success') {
      setBillingBanner({ type: 'activating' });

      // Poll until the webhook has updated the league plan in the DB (usually < 5s).
      // On confirmation, store the success state in sessionStorage and reload the
      // page so LeagueContext re-fetches with the new plan — billing card shows correctly.
      let attempts = 0;
      const MAX_ATTEMPTS = 8; // 16 seconds total
      const intervalId = setInterval(async () => {
        attempts++;
        try {
          const updated = await leaguesApi.get(slug);
          const updatedPlan = updated?.plan_override || updated?.plan || 'free';
          if (updatedPlan !== 'free') {
            clearInterval(intervalId);
            sessionStorage.setItem('billing_banner', JSON.stringify({ type: 'success', plan: updatedPlan }));
            window.location.href = window.location.pathname; // reload clean — context will re-fetch
          } else if (attempts >= MAX_ATTEMPTS) {
            clearInterval(intervalId);
            setBillingBanner({ type: 'success_pending' });
          }
        } catch {
          if (attempts >= MAX_ATTEMPTS) {
            clearInterval(intervalId);
            setBillingBanner({ type: 'success_pending' });
          }
        }
      }, 2000);

      return () => clearInterval(intervalId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      setMembers(membersData);
      setName(leagueData.name);
      setTagline(leagueData.tagline || '');
      setIsPublic(!!leagueData.is_public);
      setRules(leagueData.rules || 'hamilton');

      // Private league: load or generate stable invite token
      if (!leagueData.is_public) {
        if (leagueData.invite_token) {
          setInviteToken(leagueData.invite_token);
          setInviteTokenExpiresAt(leagueData.invite_token_expires_at);
        } else {
          try {
            const { token, expires_at } = await leaguesApi.resetInviteToken(slug);
            setInviteToken(token);
            setInviteTokenExpiresAt(expires_at);
          } catch (_) { /* non-fatal */ }
        }
      }

      // Public league: load pending join requests
      if (leagueData.is_public) {
        try {
          const requests = await leaguesApi.getJoinRequests(slug);
          setJoinRequests(requests);
        } catch (_) { /* non-fatal */ }
      }
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
      const updated = await leaguesApi.update(slug, { name: name.trim(), tagline: tagline.trim(), is_public: isPublic, rules });
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

  const handleResetToken = async () => {
    setGeneratingToken(true);
    try {
      const { token, expires_at } = await leaguesApi.resetInviteToken(slug);
      setInviteToken(token);
      setInviteTokenExpiresAt(expires_at);
    } catch (_) {
      // Silent fail
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleCopyInviteLink = () => {
    const link = `${window.location.origin}/join?t=${inviteToken}`;
    navigator.clipboard.writeText(link).then(() => {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    });
  };

  const handleReviewRequest = async (id, action) => {
    try {
      await leaguesApi.reviewJoinRequest(slug, id, action);
      setJoinRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (_) {
      // Silent fail
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

      {/* ── Billing redirect banners ────────────────────────────────────────── */}

      {billingBanner?.type === 'activating' && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF' }}
        >
          <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0" />
          <span className="font-ui font-semibold text-sm">Payment confirmed! Activating your plan…</span>
        </div>
      )}

      {billingBanner?.type === 'success' && (
        <div
          className="rounded-2xl px-6 py-5"
          style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, #2D5A27 100%)' }}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-3xl mb-2">🎉</div>
              <h2 className="font-display text-xl text-white mb-1">
                {billingBanner.plan === 'weekend_pass' ? 'Weekend Pass activated!' : 'Welcome to Pro!'}
              </h2>
              <p className="font-ui text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {billingBanner.plan === 'weekend_pass'
                  ? 'You have 7 days of full Pro access — tournaments, stats, and no player cap.'
                  : `${league?.name || 'Your league'} is now on Pro — tournaments, stats, and no 8-player cap.`}
              </p>
            </div>
            <button
              onClick={() => setBillingBanner(null)}
              className="text-xl flex-shrink-0"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              to={leaguePath(slug, 'stats')}
              className="btn text-sm px-4 py-1.5 font-semibold"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.35)' }}
            >
              📊 Explore Stats
            </Link>
            <Link
              to={leaguePath(slug, 'tournaments')}
              className="btn text-sm px-4 py-1.5 font-semibold"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.35)' }}
            >
              🏆 Run a Tournament
            </Link>
            <a
              href="#invite-section"
              className="btn text-sm px-4 py-1.5 font-semibold"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.35)' }}
            >
              👥 Invite More Players
            </a>
          </div>
        </div>
      )}

      {billingBanner?.type === 'success_pending' && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46' }}
        >
          <span className="font-ui font-semibold text-sm">
            ✓ Payment received! Your plan will activate in a moment — refresh if needed.
          </span>
          <button onClick={() => setBillingBanner(null)} className="opacity-60 hover:opacity-100 flex-shrink-0">✕</button>
        </div>
      )}

      {billingBanner?.type === 'cancelled' && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          <span className="font-ui text-sm">
            No worries — you can upgrade any time from the Plan section below.
          </span>
          <button onClick={() => setBillingBanner(null)} className="opacity-60 hover:opacity-100 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Billing */}
      <div className="card p-6">
        <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
          {plan === 'free' ? '⭐ Plan' : '🌟 Plan'}
        </h2>

        {plan === 'weekend_pass' ? (
          <div className="flex flex-col gap-4">
            {/* Status row */}
            <div className="flex items-center gap-3">
              <span
                className="text-xs font-ui font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{ background: 'rgba(58,107,53,0.12)', border: '1px solid rgba(58,107,53,0.3)', color: 'var(--color-primary)' }}
              >
                Weekend Pass
              </span>
              {expiresAtDate && (
                <span
                  className="text-sm font-ui font-semibold"
                  style={{ color: passExpired ? 'var(--color-danger)' : passUrgent ? '#B45309' : 'var(--color-text-secondary)' }}
                >
                  {passExpired
                    ? '⚠️ Expired'
                    : daysRemaining === 1
                    ? '⚠️ Expires tomorrow'
                    : `Expires in ${daysRemaining} days`}
                </span>
              )}
            </div>

            {/* Expiry bar */}
            {expiresAtDate && !passExpired && (
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(100, (msRemaining / (7 * 24 * 60 * 60 * 1000)) * 100))}%`,
                    background: passUrgent ? '#D97706' : 'var(--color-primary)',
                  }}
                />
              </div>
            )}

            {/* CTA */}
            <div className="flex flex-col gap-2">
              {(passExpired || passUrgent) && (
                <p className="text-sm font-ui" style={{ color: passExpired ? 'var(--color-danger)' : '#92400E' }}>
                  {passExpired
                    ? 'Your pass has expired — Pro features are now locked.'
                    : 'Running low — renew or upgrade before access is lost.'}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleRenewPass}
                  disabled={renewLoading}
                  className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50"
                >
                  {renewLoading ? 'Redirecting…' : '🔄 Renew pass — CAD $12'}
                </button>
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="btn text-sm px-4 py-2"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  Upgrade to Pro subscription
                </button>
              </div>
            </div>
          </div>
        ) : plan === 'free' ? (
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-ui font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Free
            </span>
            <button onClick={() => setShowUpgrade(true)} className="btn btn-primary text-sm px-4 py-2">
              Upgrade to Pro
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-ui font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{ background: 'rgba(58,107,53,0.12)', border: '1px solid rgba(58,107,53,0.3)', color: 'var(--color-primary)' }}
              >
                Pro
              </span>
              {league?.stripe_subscription_id && (
                <span className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>Active subscription</span>
              )}
            </div>
            {league?.stripe_subscription_id && (
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="btn text-sm px-4 py-2 disabled:opacity-50"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                {portalLoading ? 'Redirecting…' : 'Manage subscription'}
              </button>
            )}
          </div>
        )}
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
            <label className="block text-sm font-ui font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              Tagline <span className="font-normal opacity-50">(optional)</span>
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={80}
              placeholder="e.g. Hamilton's Most Competitive Backyard League"
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

      {/* Invite — private league: stable token link */}
      {!isPublic && (
        <div id="invite-section" className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>
              🔗 Invite Link
            </h2>
            <button
              onClick={handleResetToken}
              disabled={generatingToken}
              className="text-xs font-ui underline disabled:opacity-50"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {generatingToken ? 'Resetting…' : '↺ Reset link'}
            </button>
          </div>
          {inviteToken ? (
            <div className="flex flex-col gap-3">
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border font-ui text-sm break-all"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <span className="flex-1 truncate">{window.location.origin}/join?t={inviteToken}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyInviteLink}
                  className="btn btn-primary flex-1 text-sm py-2"
                >
                  {tokenCopied ? '✓ Copied!' : '📋 Copy link'}
                </button>
                {navigator.share && (
                  <button
                    onClick={() => navigator.share({ url: `${window.location.origin}/join?t=${inviteToken}`, title: `Join ${league?.name}` })}
                    className="btn text-sm py-2 px-4"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  >
                    Share
                  </button>
                )}
              </div>
              {inviteTokenExpiresAt && (
                <p className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                  Expires {new Date(inviteTokenExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}Anyone with this link auto-joins. Reset it to revoke.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>Setting up invite link…</p>
          )}
        </div>
      )}

      {/* Invite — public league: shareable join page + pending requests */}
      {isPublic && (
        <div id="invite-section" className="card p-6">
          <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            🔗 Join Page
          </h2>
          <div className="flex flex-col gap-3">
            <div
              className="px-3 py-2.5 rounded-xl border font-ui text-sm truncate"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {window.location.origin}/l/{slug}/join
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/l/${slug}/join`);
                setTokenCopied(true);
                setTimeout(() => setTokenCopied(false), 2000);
              }}
              className="btn btn-primary text-sm py-2"
            >
              {tokenCopied ? '✓ Copied!' : '📋 Copy link'}
            </button>
            <p className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              Anyone can find your league here and request to join. You approve each request.
            </p>
          </div>

          {joinRequests.length > 0 && (
            <div className="mt-5">
              <h3 className="font-ui font-semibold text-sm mb-3" style={{ color: 'var(--color-text-primary)' }}>
                Pending Requests ({joinRequests.length})
              </h3>
              <div className="flex flex-col gap-2">
                {joinRequests.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
                    <img
                      src={r.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.display_name}`}
                      alt={r.display_name}
                      className="w-8 h-8 rounded-full flex-shrink-0"
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.display_name}`; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-ui font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {r.display_name}
                      </div>
                      {r.message && (
                        <div className="font-ui text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                          "{r.message}"
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleReviewRequest(r.id, 'approve')}
                        className="text-xs font-ui font-semibold px-2.5 py-1 rounded-lg text-white"
                        style={{ background: 'var(--color-primary)' }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReviewRequest(r.id, 'deny')}
                        className="text-xs font-ui px-2.5 py-1 rounded-lg border"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature={null}
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
