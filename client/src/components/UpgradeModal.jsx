/**
 * UpgradeModal — shown when a user tries to access a Pro-gated feature.
 *
 * Usage:
 *   const [showUpgrade, setShowUpgrade] = useState(false);
 *   const [upgradeFeature, setUpgradeFeature] = useState('');
 *
 *   // When a 403 { upgrade: true } comes back:
 *   setUpgradeFeature('Stats');
 *   setShowUpgrade(true);
 *
 *   <UpgradeModal
 *     open={showUpgrade}
 *     onClose={() => setShowUpgrade(false)}
 *     feature={upgradeFeature}
 *     leagueId={league.id}
 *   />
 *
 * Props:
 *   open        boolean
 *   onClose     () => void
 *   feature     string — what feature triggered the modal (e.g. 'Stats', 'Tournaments')
 *   leagueId    number — which league to upgrade
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { billingApi } from '../api';
import { capture } from '../lib/analytics';

const PRO_PERKS = [
  { icon: '📊', label: 'Stats & analytics' },
  { icon: '🏆', label: 'Tournaments & brackets' },
  { icon: '♾️', label: 'Unlimited players & leagues' },
  { icon: '📤', label: 'CSV export' },
];

export default function UpgradeModal({ open, onClose, feature, leagueId }) {
  const [loading, setLoading] = useState(null); // 'monthly' | 'yearly' | 'weekend'

  useEffect(() => {
    if (open) capture('upgrade_modal_viewed', { trigger: feature || 'generic' });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const handleCheckout = async (plan) => {
    if (!leagueId) return;
    setLoading(plan);
    try {
      const { url } = await billingApi.checkout(leagueId, plan);
      window.location.href = url;
    } catch (e) {
      console.error('[UpgradeModal] checkout error', e);
      setLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-xl"
        style={{ background: 'var(--color-surface)' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-xl opacity-40 hover:opacity-70"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="font-display text-2xl" style={{ color: 'var(--color-text-primary)' }}>
            {feature ? `${feature} is Pro` : 'Upgrade to Pro'}
          </h2>
          <p className="text-sm font-ui mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Unlock the full league experience.
          </p>
        </div>

        {/* Perks */}
        <ul className="flex flex-col gap-2 mb-6">
          {PRO_PERKS.map((p) => (
            <li key={p.label} className="flex items-center gap-3 text-sm font-ui" style={{ color: 'var(--color-text-primary)' }}>
              <span className="text-base w-6 text-center">{p.icon}</span>
              {p.label}
            </li>
          ))}
        </ul>

        {/* Pricing buttons */}
        <div className="flex flex-col gap-3">
          {/* Yearly — anchor */}
          <button
            onClick={() => handleCheckout('pro_yearly')}
            disabled={!!loading}
            className="relative btn btn-primary w-full py-3 disabled:opacity-60"
          >
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-ui font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--color-primary)', color: '#fff', whiteSpace: 'nowrap' }}>
              2 months free
            </span>
            {loading === 'pro_yearly' ? 'Redirecting…' : 'Pro Yearly — CAD $80/yr'}
          </button>

          {/* Monthly */}
          <button
            onClick={() => handleCheckout('pro_monthly')}
            disabled={!!loading}
            className="btn w-full py-2.5 disabled:opacity-60"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            {loading === 'pro_monthly' ? 'Redirecting…' : 'Pro Monthly — CAD $9/mo'}
          </button>

          {/* Weekend pass */}
          <button
            onClick={() => handleCheckout('weekend_pass')}
            disabled={!!loading}
            className="text-sm font-ui underline text-center disabled:opacity-60"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {loading === 'weekend_pass' ? 'Redirecting…' : 'Just need a weekend? CAD $12 one-time →'}
          </button>
        </div>

        <p className="text-xs font-ui text-center mt-4" style={{ color: 'var(--color-text-secondary)' }}>
          Prices in CAD. Cancel anytime. Taxes may apply.
        </p>
        <p className="text-xs font-ui text-center mt-2" style={{ color: 'var(--color-text-secondary)' }}>
          Running multiple leagues?{' '}
          <Link
            to="/#venue"
            onClick={onClose}
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
          >
            See the Venue Plan →
          </Link>
        </p>
      </div>
    </div>
  );
}
