import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { leaguesApi, billingApi, digestApi } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useLeague, leaguePath } from '../contexts/LeagueContext';
import UpgradeModal from '../components/UpgradeModal';
import InviteKit from '../components/InviteKit';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

const ROLE_BADGE = {
  owner: { label: 'Owner', bg: '#FEF3C7', color: '#92400E' },
  admin: { label: 'Admin', bg: '#EFF6FF', color: '#1E40AF' },
  player: { label: 'Player', bg: 'var(--color-bg)', color: 'var(--color-text-secondary)' },
};

// Suggested race-to-N target when an admin first enables it. Real-world pool
// guidance: casual 8-ball races to ~5, 9-ball league play to 7–9; 7 is a
// sensible league-standard default. Admin can change it freely.
const RACE_TO_SUGGESTED = 7;

export default function LeagueSettings() {
  const { slug, sport } = useLeague();
  const isPool = sport === 'pool';
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

  // Custom rules form state
  const DEFAULT_CUSTOM_RULES = {
    target_score: 21,
    win_by: 1,
    cancellation: true,
    hole_points: 3,
    board_points: 1,
    first_throw: 'random',
    bag_color: 'captains_pick',
    tiebreaker: 'tie_stands',
  };
  const [customRules, setCustomRules] = useState(DEFAULT_CUSTOM_RULES);

  // Custom theme state
  const [themeColor, setThemeColor] = useState('#3A6B35');
  const [themeAccent, setThemeAccent] = useState('#D48B2D');
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaveSuccess, setThemeSaveSuccess] = useState(false);

  // Invite token (private leagues)
  const [inviteToken, setInviteToken] = useState(null);
  const [inviteTokenExpiresAt, setInviteTokenExpiresAt] = useState(null); // eslint-disable-line no-unused-vars

  // Short code
  const [shortCode, setShortCode] = useState(null);
  const [shortCodeCopied, setShortCodeCopied] = useState(false);
  const [shortCodeRegenerating, setShortCodeRegenerating] = useState(false);

  // Member removal / role change
  const [removingId, setRemovingId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [changingRoleId, setChangingRoleId] = useState(null);

  // Score & tournament controls
  const [scoreSubmitPolicy, setScoreSubmitPolicy] = useState('all_members');
  const [tournamentCreatePolicy, setTournamentCreatePolicy] = useState('admins_only');
  const [scoreSubmitAllowedIds, setScoreSubmitAllowedIds] = useState([]);
  const [tournamentCreateAllowedIds, setTournamentCreateAllowedIds] = useState([]);
  const [scoreVerifyMode, setScoreVerifyMode] = useState('immediate');
  // Race-to-N (pool): null = off. When toggled on we seed the suggested target.
  const [raceToTarget, setRaceToTarget] = useState(null);
  const [controlsSaving, setControlsSaving] = useState(false);
  const [controlsSuccess, setControlsSuccess] = useState(false);
  const [controlsError, setControlsError] = useState('');

  // PWA install prompt
  const { canInstall, isIos, isStandalone, promptInstall } = useInstallPrompt();

  // Digest resubscribe
  const [resubscribing, setResubscribing] = useState(false);

  // Billing
  const { leagueId, plan } = useLeague();
  const [portalLoading, setPortalLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [exportLoading, setExportLoading] = useState(null);
  const [venueActive, setVenueActive] = useState(false);

  // Grace period — manage player access
  const [graceKeep, setGraceKeep] = useState(null); // Set of user IDs to keep; null = not yet initialised
  const [graceSaving, setGraceSaving] = useState(false);
  const [graceError, setGraceError] = useState('');

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

  const handleVenuePortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await billingApi.portal(null); // account-level, no leagueId
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

  const handleExport = (type) => {
    // Pro-gated. Gate in-page (same rule as custom rules) so free leagues get the
    // upgrade modal instead of a silent failure.
    if (plan === 'free' && !venueActive) { setShowUpgrade(true); return; }
    // Download by navigating straight to the endpoint: its
    // `Content-Disposition: attachment` makes the browser download natively and
    // stay on the page. The old approach (fetch → blob → programmatic <a>.click())
    // runs after an await, so it loses user-activation and is silently blocked on
    // mobile / installed-PWA browsers — which is why "nothing happened" on phone.
    setExportLoading(type);
    window.location.href = `/api/l/${slug}/export/${type}`;
    setTimeout(() => setExportLoading(null), 1500);
  };

  // Initialise grace keep-set when members load and grace period is active
  const graceEndsAtRaw = league?.grace_period_ends_at;
  const isGraceActive = graceEndsAtRaw && new Date(graceEndsAtRaw) > new Date();
  const activeMembers = members.filter((m) => !m.frozen_at);
  const showGracePanel = isGraceActive && activeMembers.length > 8;

  useEffect(() => {
    if (showGracePanel && graceKeep === null) {
      // Pre-select the oldest 8 by joined_at (matches what the cron would do automatically)
      const sorted = [...activeMembers].sort((a, b) => {
        if (!a.joined_at) return 1;
        if (!b.joined_at) return -1;
        return new Date(a.joined_at) - new Date(b.joined_at);
      });
      setGraceKeep(new Set(sorted.slice(0, 8).map((m) => m.id)));
    }
  }, [showGracePanel, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGraceResolve = async () => {
    if (!graceKeep) return;
    setGraceSaving(true);
    setGraceError('');
    try {
      await leaguesApi.graceResolve(slug, { keepUserIds: [...graceKeep] });
      await load();
      setGraceKeep(null);
    } catch (e) {
      if (e.response?.status === 409) {
        setGraceError('The grace period has already ended — player access was set automatically.');
        await load();
      } else {
        setGraceError(e.response?.data?.error || 'Failed to save. Please try again.');
      }
    } finally {
      setGraceSaving(false);
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
      billingApi.status().then((s) => setVenueActive(!!s.venue)).catch(() => {});
      setLeague(leagueData);
      setMembers(membersData);
      setName(leagueData.name);
      setTagline(leagueData.tagline || '');
      setIsPublic(!!leagueData.is_public);
      setRules(leagueData.rules || 'hamilton');
      setScoreSubmitPolicy(leagueData.score_submit_policy || 'all_members');
      setTournamentCreatePolicy(leagueData.tournament_create_policy || 'admins_only');
      try { setScoreSubmitAllowedIds(JSON.parse(leagueData.score_submit_allowed_ids || '[]')); } catch (_) {}
      try { setTournamentCreateAllowedIds(JSON.parse(leagueData.tournament_create_allowed_ids || '[]')); } catch (_) {}
      setScoreVerifyMode(leagueData.score_verify_mode || 'immediate');
      setRaceToTarget(
        leagueData.race_to_target != null ? Number(leagueData.race_to_target) : null
      );
      setShortCode(leagueData.short_code || null);
      // Custom rules
      if (leagueData.custom_rules_json) {
        setCustomRules({ ...DEFAULT_CUSTOM_RULES, ...leagueData.custom_rules_json });
      }
      // Custom theme
      if (leagueData.theme_json) {
        setThemeColor(leagueData.theme_json.primary_color || '#3A6B35');
        setThemeAccent(leagueData.theme_json.accent_color || '#D48B2D');
        setLogoUrl(leagueData.theme_json.logo_path ? `/uploads${leagueData.theme_json.logo_path}` : null);
      }

      // Private league: load or generate stable invite token
      if (!leagueData.is_public) {
        if (leagueData.invite_token) {
          setInviteToken(leagueData.invite_token);
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
      const payload = { name: name.trim(), tagline: tagline.trim(), is_public: isPublic, rules };
      if (rules === 'custom') payload.custom_rules_json = customRules;
      const updated = await leaguesApi.update(slug, payload);
      setLeague(updated);
      setName(updated.name);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      await refreshUser(); // refresh leagues list in case name changed
    } catch (e) {
      if (e.response?.data?.upgrade) setShowUpgrade(true);
      setSaveError(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleThemeSave = async () => {
    setThemeSaving(true);
    setThemeSaveSuccess(false);
    try {
      const theme_json = { primary_color: themeColor, accent_color: themeAccent };
      if (logoUrl && !logoUrl.startsWith('/uploads')) {
        // logo_path already saved separately by upload handler — preserve existing
      }
      await leaguesApi.update(slug, { theme_json });
      setThemeSaveSuccess(true);
      setTimeout(() => setThemeSaveSuccess(false), 2500);
    } catch (e) {
      if (e.response?.data?.upgrade) setShowUpgrade(true);
    } finally {
      setThemeSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoError('');
    try {
      const result = await leaguesApi.uploadLogo(slug, file);
      setLogoUrl(`/uploads${result.logo_path}?t=${Date.now()}`);
    } catch (err) {
      setLogoError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoDelete = async () => {
    try {
      await leaguesApi.deleteLogo(slug);
      setLogoUrl(null);
    } catch {
      // Silent fail
    }
  };

  const handleInviteShared = () => {
    // Fire-and-forget: extend invite token expiry 30 days from now
    leaguesApi.touchInviteToken(slug).catch(() => {});
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

  const handleRoleChange = async (memberId, newRole) => {
    setChangingRoleId(memberId);
    try {
      await leaguesApi.changeMemberRole(slug, memberId, newRole);
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
    } catch (_) {
      // Silent fail
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleControlsSave = async () => {
    setControlsSaving(true);
    setControlsError('');
    setControlsSuccess(false);
    try {
      await leaguesApi.update(slug, {
        score_submit_policy: scoreSubmitPolicy,
        tournament_create_policy: tournamentCreatePolicy,
        score_submit_allowed_ids: scoreSubmitAllowedIds,
        tournament_create_allowed_ids: tournamentCreateAllowedIds,
        score_verify_mode: scoreVerifyMode,
        ...(isPool ? { race_to_target: raceToTarget } : {}),
      });
      setControlsSuccess(true);
      setTimeout(() => setControlsSuccess(false), 2500);
    } catch (e) {
      setControlsError(e.response?.data?.error || 'Failed to save');
    } finally {
      setControlsSaving(false);
    }
  };

  const handleShortCodeCopy = () => {
    if (!shortCode) return;
    const url = `${window.location.origin}/find-league?code=${shortCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setShortCodeCopied(true);
      setTimeout(() => setShortCodeCopied(false), 2000);
    });
  };

  const handleShortCodeRegenerate = async () => {
    if (!window.confirm('Generate a new code? The old code will stop working immediately.')) return;
    setShortCodeRegenerating(true);
    try {
      const { short_code } = await leaguesApi.regenerateShortCode(slug);
      setShortCode(short_code);
    } catch (_) {}
    finally { setShortCodeRegenerating(false); }
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
          {plan === 'free' && !venueActive ? '⭐ Plan' : '🌟 Plan'}
        </h2>

        {venueActive ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-ui font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{ background: 'rgba(58,107,53,0.12)', border: '1px solid rgba(58,107,53,0.3)', color: 'var(--color-primary)' }}
              >
                Venue Plan
              </span>
              <span className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                All your leagues are covered
              </span>
            </div>
            <button
              onClick={handleVenuePortal}
              disabled={portalLoading}
              className="btn text-sm px-4 py-2 disabled:opacity-50"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              {portalLoading ? 'Redirecting…' : 'Manage Venue subscription'}
            </button>
          </div>
        ) : plan === 'weekend_pass' ? (
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

      {/* Grace period — manage player access */}
      {showGracePanel && (
        <div className="card p-6" style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div>
              <h2 className="font-display text-xl" style={{ color: '#92400E' }}>
                Manage Player Access
              </h2>
              <p className="font-ui text-sm mt-1" style={{ color: '#92400E' }}>
                Your league downgraded to Free, which has an 8-player cap.{' '}
                Choose who keeps access — you have until{' '}
                <strong>
                  {new Date(graceEndsAtRaw).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
                </strong>
                . Unselected players will be frozen and unable to participate.
              </p>
            </div>
          </div>

          <p className="font-ui text-xs mb-3 font-semibold" style={{ color: '#78350F' }}>
            Select up to 8 players to keep ({graceKeep?.size ?? 0} / 8 selected)
          </p>

          <div className="flex flex-col gap-2 mb-4">
            {activeMembers.map((m) => {
              const checked = graceKeep?.has(m.id) ?? false;
              const atLimit = (graceKeep?.size ?? 0) >= 8;
              const isDisabled = !checked && atLimit;
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-colors"
                  style={{
                    borderColor: checked ? 'var(--color-primary)' : 'var(--color-border)',
                    background: checked ? 'rgba(58,107,53,0.06)' : 'var(--color-bg)',
                    opacity: isDisabled ? 0.4 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isDisabled}
                    onChange={(e) => {
                      setGraceKeep((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        return next;
                      });
                    }}
                    className="w-4 h-4 flex-shrink-0"
                  />
                  <img
                    src={m.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.display_name}`}
                    alt={m.display_name}
                    className="w-7 h-7 rounded-full flex-shrink-0"
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.display_name}`; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      {m.display_name} {m.id === user?.id && <span className="opacity-50">(you)</span>}
                    </div>
                    {m.email && (
                      <div className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>{m.email}</div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {graceError && (
            <p className="text-sm font-ui p-2.5 rounded-xl mb-3 text-center" style={{ background: '#FEE2E2', color: '#991B1B' }}>
              {graceError}
            </p>
          )}

          <button
            onClick={handleGraceResolve}
            disabled={graceSaving || !graceKeep || graceKeep.size === 0}
            className="btn btn-primary w-full py-2.5 font-semibold disabled:opacity-50"
          >
            {graceSaving
              ? 'Saving…'
              : `Confirm — keep ${graceKeep?.size ?? 0} player${graceKeep?.size === 1 ? '' : 's'}`}
          </button>
          <p className="font-ui text-xs mt-3 text-center" style={{ color: '#78350F' }}>
            If you don't choose by the deadline, the {Math.min(8, activeMembers.length)} oldest members keep access automatically.
          </p>
        </div>
      )}

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

          {/* Scoring Rules are cornhole-specific (Hamilton/ACA/Custom point
              rules) — hidden for pool and other sports. */}
          {!isPool && (
          <div>
            <label className="block text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Scoring Rules
            </label>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'hamilton', label: 'Hamilton', desc: 'Best-of, max 10 pts' },
                { value: 'aca', label: 'ACA', desc: 'Standard 21 pts' },
                { value: 'custom', label: 'Custom ⭐', desc: 'Your own rules', pro: true },
              ].map(({ value, label, desc, pro }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    if (pro && plan === 'free' && !venueActive) { setShowUpgrade(true); return; }
                    setRules(value);
                  }}
                  className="flex-1 min-w-[90px] flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: rules === value ? 'var(--color-primary)' : 'var(--color-border)',
                    background: rules === value ? 'rgba(58,107,53,0.07)' : 'var(--color-bg)',
                    opacity: pro && plan === 'free' && !venueActive ? 0.6 : 1,
                  }}
                >
                  <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
                  <span className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
                </button>
              ))}
            </div>

            {/* Custom rules form — shown when Custom is selected and league is Pro */}
            {rules === 'custom' && plan !== 'free' && (
              <div className="mt-4 p-4 rounded-xl flex flex-col gap-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <p className="text-xs font-ui font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                  Custom Rule Details
                </p>

                {/* Target score + win by */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Target Score
                    </label>
                    <input
                      type="number" min="1" max="99"
                      value={customRules.target_score}
                      onChange={(e) => setCustomRules((r) => ({ ...r, target_score: parseInt(e.target.value) || 21 }))}
                      className="w-full px-2 py-1.5 rounded-lg border font-ui text-sm text-center"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Win By
                    </label>
                    <input
                      type="number" min="1" max="10"
                      value={customRules.win_by}
                      onChange={(e) => setCustomRules((r) => ({ ...r, win_by: parseInt(e.target.value) || 1 }))}
                      className="w-full px-2 py-1.5 rounded-lg border font-ui text-sm text-center"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>

                {/* Point values */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Hole Points (🎯)
                    </label>
                    <input
                      type="number" min="1" max="10"
                      value={customRules.hole_points}
                      onChange={(e) => setCustomRules((r) => ({ ...r, hole_points: parseInt(e.target.value) || 3 }))}
                      className="w-full px-2 py-1.5 rounded-lg border font-ui text-sm text-center"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Board Points (🟫)
                    </label>
                    <input
                      type="number" min="0" max="10"
                      value={customRules.board_points}
                      onChange={(e) => setCustomRules((r) => ({ ...r, board_points: parseInt(e.target.value) || 1 }))}
                      className="w-full px-2 py-1.5 rounded-lg border font-ui text-sm text-center"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>

                {/* Cancellation toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>Cancellation Scoring</div>
                    <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>Points cancel between teams each round</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomRules((r) => ({ ...r, cancellation: !r.cancellation }))}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                    style={{ background: customRules.cancellation ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    <span
                      className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
                      style={{ transform: customRules.cancellation ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>

                {/* Ceremonial rules */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Who Throws First
                    </label>
                    <select
                      value={customRules.first_throw}
                      onChange={(e) => setCustomRules((r) => ({ ...r, first_throw: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded-lg border font-ui text-sm"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="random">Random / Coin flip</option>
                      <option value="last_winner">Last game winner</option>
                      <option value="home_team">Home team</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Bag Colour Choice
                    </label>
                    <select
                      value={customRules.bag_color}
                      onChange={(e) => setCustomRules((r) => ({ ...r, bag_color: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded-lg border font-ui text-sm"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="captains_pick">Captains choose</option>
                      <option value="coin_flip">Coin flip</option>
                      <option value="home_team">Home team picks</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-ui font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                      Tiebreaker
                    </label>
                    <select
                      value={customRules.tiebreaker}
                      onChange={(e) => setCustomRules((r) => ({ ...r, tiebreaker: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded-lg border font-ui text-sm"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="tie_stands">Tie stands (no tiebreaker)</option>
                      <option value="extra_round">Extra round (sudden death)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

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

      {/* ── Custom Theme ─────────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>
            🎨 Custom Theme
          </h2>
          {plan === 'free' && !venueActive && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="text-xs font-ui font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(58,107,53,0.1)', color: 'var(--color-primary)', border: '1px solid rgba(58,107,53,0.25)' }}
            >
              ⭐ Pro
            </button>
          )}
        </div>

        {plan === 'free' && !venueActive ? (
          <div className="text-center py-6">
            <p className="font-ui text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Set your league colours and logo with Pro.
            </p>
            <button onClick={() => setShowUpgrade(true)} className="btn btn-primary text-sm px-4 py-2">
              Upgrade to Pro →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Colour pickers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-ui font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Primary Colour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                    style={{ borderColor: 'var(--color-border)', padding: '2px' }}
                  />
                  <span className="font-ui text-sm font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {themeColor.toUpperCase()}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-ui font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  Accent Colour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themeAccent}
                    onChange={(e) => setThemeAccent(e.target.value)}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                    style={{ borderColor: 'var(--color-border)', padding: '2px' }}
                  />
                  <span className="font-ui text-sm font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                    {themeAccent.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Logo upload */}
            <div>
              <label className="block text-xs font-ui font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                League Logo <span className="font-normal opacity-60">(PNG, JPG, SVG — max 2 MB)</span>
              </label>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="League logo"
                    className="w-16 h-16 rounded-xl object-contain flex-shrink-0"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl"
                    style={{ border: '2px dashed var(--color-border)', background: 'var(--color-bg)' }}
                  >
                    🏆
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="btn btn-ghost text-sm px-3 py-1.5 cursor-pointer font-semibold" style={{ borderColor: 'var(--color-border)' }}>
                    {logoUploading ? 'Uploading…' : 'Upload Logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={logoUploading}
                      onChange={handleLogoUpload}
                    />
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={handleLogoDelete}
                      className="text-xs font-ui text-center"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
              {logoError && (
                <p className="mt-1 text-xs font-ui" style={{ color: 'var(--color-danger)' }}>{logoError}</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleThemeSave}
              disabled={themeSaving}
              className="btn btn-primary py-2.5 font-semibold disabled:opacity-50"
            >
              {themeSaving ? 'Saving…' : themeSaveSuccess ? '✓ Saved!' : 'Save Theme'}
            </button>
          </div>
        )}
      </div>

      {/* Invite — private league: stable token link */}
      {!isPublic && (
        <div id="invite-section" className="card p-6">
          <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            🔗 Invite Link
          </h2>
          {inviteToken ? (
            <InviteKit
              joinLink={`${window.location.origin}/join?t=${inviteToken}`}
              joinCode={null}
              leagueName={league?.name}
              onShare={handleInviteShared}
            />
          ) : (
            <p className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>Setting up invite link…</p>
          )}
          <p className="text-xs font-ui mt-4" style={{ color: 'var(--color-text-secondary)' }}>
            Anyone with this link auto-joins {league?.name}.
          </p>

          {shortCode && (
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Printable join code
              </p>
              <p className="text-xs font-ui mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                Post this at events — anyone can type it into Find a League to join instantly.
              </p>
              <div className="flex items-center gap-3">
                <span
                  className="font-mono text-2xl font-bold tracking-widest px-4 py-2 rounded-xl select-all"
                  style={{ background: 'var(--color-bg)', border: '2px solid var(--color-border)', color: 'var(--color-text-primary)', letterSpacing: '0.2em' }}
                >
                  {shortCode}
                </span>
                <button
                  onClick={handleShortCodeCopy}
                  className="btn text-sm px-3 py-2"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  {shortCodeCopied ? '✓ Copied' : 'Copy link'}
                </button>
                <button
                  onClick={handleShortCodeRegenerate}
                  disabled={shortCodeRegenerating}
                  className="btn text-sm px-3 py-2 disabled:opacity-50"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {shortCodeRegenerating ? '…' : 'New code'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite — public league: shareable join page */}
      {isPublic && (
        <div id="invite-section" className="card p-6">
          <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            🔗 Join Page
          </h2>
          <InviteKit
            joinLink={`${window.location.origin}/l/${slug}/join`}
            joinCode={null}
            leagueName={league?.name}
          />
          <p className="text-xs font-ui mt-4" style={{ color: 'var(--color-text-secondary)' }}>
            Anyone can find your league here and request to join. You approve each request.
          </p>

          {shortCode && (
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p className="text-sm font-ui font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Printable join code
              </p>
              <p className="text-xs font-ui mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                Post this at events — anyone can type it into Find a League to join instantly.
              </p>
              <div className="flex items-center gap-3">
                <span
                  className="font-mono text-2xl font-bold tracking-widest px-4 py-2 rounded-xl select-all"
                  style={{ background: 'var(--color-bg)', border: '2px solid var(--color-border)', color: 'var(--color-text-primary)', letterSpacing: '0.2em' }}
                >
                  {shortCode}
                </span>
                <button
                  onClick={handleShortCodeCopy}
                  className="btn text-sm px-3 py-2"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                >
                  {shortCodeCopied ? '✓ Copied' : 'Copy link'}
                </button>
                <button
                  onClick={handleShortCodeRegenerate}
                  disabled={shortCodeRegenerating}
                  className="btn text-sm px-3 py-2 disabled:opacity-50"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {shortCodeRegenerating ? '…' : 'New code'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending join requests — public leagues only */}
      {isPublic && joinRequests.length > 0 && (
        <div className="card p-6">
          <h2 className="font-display text-xl mb-4" style={{ color: 'var(--color-text-primary)' }}>
            📬 Pending Requests ({joinRequests.length})
          </h2>
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

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature={null}
        leagueId={leagueId}
      />

      {/* Score & Tournament Controls */}
      {canManage && (
        <div className="card p-6">
          <h2 className="font-display text-xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
            🔒 Permissions
          </h2>
          <p className="font-ui text-sm mb-5" style={{ color: 'var(--color-text-secondary)' }}>
            Control who can submit scores, start tournaments, and how scores are verified.
          </p>

          <div className="flex flex-col gap-5">
            {/* Score submission policy */}
            <div>
              <label className="block font-ui font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Who can submit scores?
              </label>
              <select
                value={scoreSubmitPolicy}
                onChange={(e) => setScoreSubmitPolicy(e.target.value)}
                className="w-full rounded-xl px-3 py-2 font-ui text-sm border"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                <option value="all_members">All members</option>
                <option value="admins_only">Admins only</option>
                <option value="select_players">Select players</option>
              </select>
              {scoreSubmitPolicy === 'select_players' && (
                <div className="mt-2 flex flex-col gap-1">
                  <p className="font-ui text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Choose which players (in addition to admins) can submit scores:
                  </p>
                  {members.filter((m) => m.role === 'player').map((m) => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scoreSubmitAllowedIds.includes(m.id)}
                        onChange={(e) => {
                          setScoreSubmitAllowedIds((prev) =>
                            e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                          );
                        }}
                        className="rounded"
                      />
                      <span className="font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>{m.display_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Tournament creation policy */}
            <div>
              <label className="block font-ui font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Who can start tournaments?
              </label>
              <select
                value={tournamentCreatePolicy}
                onChange={(e) => setTournamentCreatePolicy(e.target.value)}
                className="w-full rounded-xl px-3 py-2 font-ui text-sm border"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                <option value="admins_only">Admins only</option>
                <option value="all_members">All members</option>
                <option value="select_players">Select players</option>
              </select>
              {tournamentCreatePolicy === 'select_players' && (
                <div className="mt-2 flex flex-col gap-1">
                  <p className="font-ui text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Choose which players (in addition to admins) can start tournaments:
                  </p>
                  {members.filter((m) => m.role === 'player').map((m) => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tournamentCreateAllowedIds.includes(m.id)}
                        onChange={(e) => {
                          setTournamentCreateAllowedIds((prev) =>
                            e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                          );
                        }}
                        className="rounded"
                      />
                      <span className="font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>{m.display_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Score verification mode */}
            <div>
              <label className="block font-ui font-semibold text-sm mb-1" style={{ color: 'var(--color-text-primary)' }}>
                Score verification
              </label>
              <select
                value={scoreVerifyMode}
                onChange={(e) => setScoreVerifyMode(e.target.value)}
                className="w-full rounded-xl px-3 py-2 font-ui text-sm border"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                <option value="immediate">Immediate — scores count right away</option>
                <option value="opponent_approve">Opponent approval — opposing team must approve</option>
                <option value="both_submit">Both teams submit — scores must match to count</option>
              </select>
              {scoreVerifyMode === 'opponent_approve' && (
                <p className="font-ui text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  One player submits the score. Any player from the opposing team can approve or dispute it.
                </p>
              )}
              {scoreVerifyMode === 'both_submit' && (
                <p className="font-ui text-xs mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Both teams independently submit the game. When the scores match, the game becomes official. Mismatches are flagged as disputed.
                </p>
              )}
            </div>

            {/* Race to Rack # — pool only. Off by default; admins opt in and tune the target. */}
            {isPool && (
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                      🎱 Race to Rack #
                    </label>
                    <p className="font-ui text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      Set a target number of racks to win a match. Off by default.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRaceToTarget((v) => (v == null ? RACE_TO_SUGGESTED : null))}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
                    style={{ background: raceToTarget != null ? 'var(--color-primary)' : 'var(--color-border)' }}
                    aria-pressed={raceToTarget != null}
                  >
                    <span
                      className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
                      style={{ transform: raceToTarget != null ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>
                {raceToTarget != null && (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>First to</span>
                    <input
                      type="number" min="1" max="99"
                      value={raceToTarget}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setRaceToTarget(Number.isNaN(n) ? '' : Math.min(99, Math.max(1, n)));
                      }}
                      onBlur={() => { if (raceToTarget === '' || raceToTarget == null) setRaceToTarget(RACE_TO_SUGGESTED); }}
                      className="w-20 px-3 py-1.5 rounded-lg border font-ui text-sm text-center"
                      style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                    <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>racks wins</span>
                    <span className="font-ui text-xs opacity-60" style={{ color: 'var(--color-text-secondary)' }}>
                      (suggested {RACE_TO_SUGGESTED})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleControlsSave}
              disabled={controlsSaving}
              className="btn btn-primary text-sm px-5 py-2 disabled:opacity-50"
            >
              {controlsSaving ? 'Saving…' : 'Save permissions'}
            </button>
            {controlsSuccess && <span className="font-ui text-sm" style={{ color: 'var(--color-primary)' }}>Saved!</span>}
            {controlsError && <span className="font-ui text-sm" style={{ color: 'var(--color-danger)' }}>{controlsError}</span>}
          </div>
        </div>
      )}

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
            const canChangeRole = myRole === 'owner' && m.role !== 'owner' && !isMe;
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
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {canChangeRole ? (
                    <select
                      value={m.role}
                      disabled={changingRoleId === m.id}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="text-xs font-ui font-semibold px-2 py-0.5 rounded-full border cursor-pointer disabled:opacity-50"
                      style={{ background: badge.bg, color: badge.color, borderColor: badge.color + '44' }}
                    >
                      <option value="admin">Admin</option>
                      <option value="player">Player</option>
                    </select>
                  ) : (
                    <span
                      className="text-xs font-ui font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  )}
                  {canRemove && (
                    confirmRemove === m.id ? (
                      <div className="flex items-center gap-1">
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
                        className="text-xs font-ui opacity-40 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        Remove
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data Export — admin only, Pro-gated */}
      {canManage && (
        <div className="card p-6">
          <h2 className="font-display text-xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
            📥 Data Export
          </h2>
          <p className="font-ui text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Download league data as CSV. Available on Pro plans.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { type: 'standings', label: '🏆 Standings', desc: 'Rank, W/L, Win%' },
              { type: 'games',     label: '📋 Games',     desc: 'Full game log' },
              { type: 'players',   label: '👥 Players',   desc: 'Roster + contact' },
              { type: 'stats',     label: '📊 Stats',     desc: 'Per-player summary' },
            ].map(({ type, label, desc }) => (
              <button
                key={type}
                onClick={() => handleExport(type)}
                disabled={exportLoading === type}
                className="flex flex-col items-start p-4 rounded-xl border text-left transition-colors hover:bg-amber-50 disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                  {exportLoading === type ? 'Exporting…' : label}
                </span>
                <span className="font-ui text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Email Preferences ─────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="font-display text-xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          📧 Email Preferences
        </h2>
        <p className="font-ui text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Weekly digest emails recap the week's games, standings, and highlights. Sent every Monday morning.
        </p>
        {user?.digest_unsubscribed_at ? (
          <div className="flex items-center gap-4">
            <span className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              You've unsubscribed from weekly digest emails.
            </span>
            <button
              onClick={async () => {
                setResubscribing(true);
                try {
                  await digestApi.resubscribe();
                  await refreshUser();
                } catch {
                  // silent fail — not critical
                } finally {
                  setResubscribing(false);
                }
              }}
              disabled={resubscribing}
              className="btn btn-primary text-sm px-4 py-2 disabled:opacity-50 flex-shrink-0"
            >
              {resubscribing ? 'Saving…' : 'Re-subscribe'}
            </button>
          </div>
        ) : (
          <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            ✅ You're subscribed. Use the unsubscribe link in any digest email to opt out.
          </p>
        )}
      </div>

      {/* ── Install App ────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="font-display text-xl mb-1" style={{ color: 'var(--color-text-primary)' }}>
          📱 Install App
        </h2>
        {isStandalone ? (
          <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            ✅ You're already using the installed app — you're all set.
          </p>
        ) : canInstall ? (
          <>
            <p className="font-ui text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              Install Cornhole249 on this device for quick access from your home screen. Works offline too.
            </p>
            <button
              onClick={promptInstall}
              className="btn btn-primary text-sm px-4 py-2"
            >
              Install App
            </button>
          </>
        ) : isIos ? (
          <>
            <p className="font-ui text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Add Cornhole249 to your home screen for quick access:
            </p>
            <ol className="font-ui text-sm list-decimal list-inside space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <li>Tap the <strong>Share</strong> button ⬆️ in Safari's toolbar</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> to confirm</li>
            </ol>
          </>
        ) : (
          <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Open Cornhole249 in Chrome or Edge on Android or desktop to install it as an app.
          </p>
        )}
      </div>
    </div>
  );
}
