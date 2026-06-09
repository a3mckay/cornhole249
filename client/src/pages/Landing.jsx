import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { capture } from '../lib/analytics';
import { useAuth } from '../hooks/useAuth';
import { billingApi } from '../api';

function PricingCard({ badge, name, price, period, note, features, cta, ctaTo, highlight }) {
  return (
    <div
      className="card flex flex-col"
      style={{
        border: highlight ? '2px solid var(--color-primary)' : undefined,
        background: highlight ? 'rgba(58,107,53,0.05)' : undefined,
      }}
    >
      {badge && (
        <div
          className="text-xs font-ui font-bold px-3 py-1 rounded-full self-start mb-3"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          {badge}
        </div>
      )}
      <h3 className="font-display text-xl mb-1" style={{ color: 'var(--color-text-primary)' }}>{name}</h3>
      <div className="mb-1">
        <span className="font-display text-3xl" style={{ color: 'var(--color-text-primary)' }}>{price}</span>
        {period && <span className="font-ui text-sm ml-1" style={{ color: 'var(--color-text-secondary)' }}>{period}</span>}
      </div>
      {note && <p className="font-ui text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>{note}</p>}
      <ul className="flex flex-col gap-1.5 mb-5 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>
            <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <Link to={ctaTo} className={`btn ${highlight ? 'btn-primary' : 'btn-ghost'} w-full text-center`}>
        {cta}
      </Link>
    </div>
  );
}

const FAQS = [
  {
    q: 'What is Cornhole249?',
    a: 'Cornhole249 is a web app for tracking cornhole leagues. Log games, track standings and stats, run tournaments, and trash talk your crew — all in one place.',
  },
  {
    q: 'Is it really free?',
    a: 'Yes. The free plan lets you run one league with up to 8 players, log unlimited games, and see standings. No credit card required. Paid plans unlock tournaments, stats, and more.',
  },
  {
    q: 'Can I try it before signing up?',
    a: 'Yes — the Cornhole249 league (our own backyard league in Hamilton, ON) is publicly visible. Browse standings, games, and stats without an account.',
  },
  {
    q: 'How does the Weekend Pass work?',
    a: "It's a one-time CAD $12 payment for 7 days of full Pro access. No recurring charge, no surprise rebill. Perfect for bachelor parties, festivals, and one-off events.",
  },
  {
    q: 'What scoring rules are supported?',
    a: 'Hamilton Rules (best-of, max 10 pts) and ACA Standard (first to 21). Pick one when you create your league.',
  },
  {
    q: 'Who can see my league?',
    a: "You choose. Public leagues are browsable by anyone on the internet. Private leagues are invite-only — only members with your invite link can see anything.",
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Cancel any time from your league settings. Your Pro access stays active until the end of the billing period. No questions, no friction.',
  },
  {
    q: 'What is the Venue plan?',
    a: "The Venue plan is a single CAD $199/yr subscription that covers every league on your account — no per-league fees. It's designed for bars, rec centres, and organizers who run multiple league nights and don't want to pay separately for each one.",
  },
];

function FAQ() {
  const [open, setOpen] = useState(null);
  return (
    <div className="flex flex-col gap-2">
      {FAQS.map((item, i) => (
        <div
          key={i}
          className="card cursor-pointer"
          onClick={() => setOpen(open === i ? null : i)}
          style={{ padding: '1rem 1.25rem' }}
        >
          <div className="flex items-center justify-between gap-4">
            <span className="font-ui font-semibold" style={{ color: 'var(--color-text-primary)' }}>{item.q}</span>
            <span className="flex-shrink-0 text-lg opacity-50" style={{ transform: open === i ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }}>›</span>
          </div>
          {open === i && (
            <p className="font-ui text-sm mt-3" style={{ color: 'var(--color-text-secondary)' }}>{item.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueBanner, setVenueBanner] = useState(null);

  useEffect(() => { capture('landing_page_viewed'); }, []);

  // POST to Stripe Checkout for the venue_yearly plan
  const triggerVenueCheckout = async () => {
    setVenueLoading(true);
    try {
      const { url } = await billingApi.checkout(null, 'venue_yearly');
      window.location.href = url;
    } catch (e) {
      console.error('[Venue] checkout error', e);
      setVenueLoading(false);
    }
  };

  // Button handler — sends unauthenticated users to login first
  const handleVenueCheckout = () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent('/?venue=checkout')}`);
      return;
    }
    triggerVenueCheckout();
  };

  // Handle ?venue=success (Stripe return) and ?venue=checkout (post-login auto-trigger)
  useEffect(() => {
    const venueParam = searchParams.get('venue');
    if (venueParam === 'success') {
      setVenueBanner('success');
      navigate('/', { replace: true });
    } else if (venueParam === 'checkout' && !authLoading && user) {
      triggerVenueCheckout();
    }
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Venue Plan success banner ─────────────────────────── */}
      {venueBanner === 'success' && (
        <div
          className="mx-4 mt-6 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
          style={{ background: 'rgba(58,107,53,0.1)', border: '1px solid rgba(58,107,53,0.3)' }}
        >
          <p className="font-ui text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
            🎉 You're all set! Your Venue Plan is now active. All the leagues you own are covered.
          </p>
          <button
            onClick={() => setVenueBanner(null)}
            className="opacity-50 hover:opacity-80 flex-shrink-0 text-lg"
            aria-label="Dismiss"
          >✕</button>
        </div>
      )}
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="text-center py-16 px-4">
        <div
          className="inline-block px-3 py-1 rounded-full text-xs font-ui font-bold mb-4"
          style={{ background: 'rgba(58,107,53,0.1)', color: 'var(--color-primary)' }}
        >
          🏡 Free to start
        </div>
        <h1 className="font-display text-5xl md:text-6xl mb-4 leading-tight" style={{ color: 'var(--color-text-primary)' }}>
          Your crew.<br />Your rules.<br />Your league.
        </h1>
        <p className="font-ui text-lg mb-8 max-w-xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
          Track standings, run tournaments, and settle backyard debates — the cornhole platform your crew deserves.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/leagues/new" className="btn btn-primary px-8 py-3 text-base">
            Create your free league →
          </Link>
          <Link
            to="/standings"
            className="btn btn-ghost px-8 py-3 text-base"
            style={{ borderColor: 'var(--color-border)' }}
          >
            See it live
          </Link>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────── */}
      <section
        className="grid grid-cols-3 gap-1 sm:gap-4 mb-16 px-4 py-6 rounded-[20px]"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '4px 4px 0 var(--color-border)' }}
      >
        {[
          { n: '2 min', label: 'to set up a league' },
          { n: '$0', label: 'to get started' },
          { n: 'Unlimited', label: 'games to log' },
        ].map(({ n, label }) => (
          <div key={label} className="text-center">
            <div className="font-display text-xl sm:text-3xl md:text-4xl" style={{ color: 'var(--color-primary)' }}>{n}</div>
            <div className="font-ui text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </section>

      {/* ── Use cases ────────────────────────────────────────────── */}
      <section className="mb-16 px-4">
        <h2 className="font-display text-3xl text-center mb-8" style={{ color: 'var(--color-text-primary)' }}>
          Built for every kind of game
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: '🏡',
              title: 'Recurring league',
              desc: 'Track all-summer standings, win/loss records, and rivalries. Every game counts.',
              detail: 'Standings · Streaks · Head-to-head · Season stats',
            },
            {
              icon: '🏆',
              title: 'Tournament day',
              desc: 'Single or double elimination brackets. Seedings, results, and a champion — all tracked.',
              detail: 'Bracket builder · Live results · Champion board',
            },
            {
              icon: '🎉',
              title: 'Weekend event',
              desc: 'Bachelor party, beer festival, one-off competition. Full setup in under 2 minutes.',
              detail: 'Weekend Pass from CAD $12 · No subscription required',
            },
          ].map(({ icon, title, desc, detail }) => (
            <div key={title} className="card flex flex-col gap-3">
              <span className="text-4xl">{icon}</span>
              <h3 className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
              <p className="font-ui text-sm flex-1" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
              <p className="font-ui text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="mb-16 px-4">
        <h2 className="font-display text-3xl text-center mb-8" style={{ color: 'var(--color-text-primary)' }}>
          Up and running in minutes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { step: '1', icon: '🎯', title: 'Create your league', desc: 'Name it, pick your rules, and set it public or private.' },
            { step: '2', icon: '📨', title: 'Invite your crew', desc: 'Share a link. Players join from any device — no app install needed.' },
            { step: '3', icon: '🏆', title: 'Start tracking', desc: 'Log games after each match. Standings update instantly.' },
          ].map(({ step, icon, title, desc }) => (
            <div key={step} className="text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-display text-xl mx-auto mb-3"
                style={{ background: 'var(--color-secondary)', color: '#fff' }}
              >
                {step}
              </div>
              <div className="text-3xl mb-2">{icon}</div>
              <h3 className="font-ui font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
              <p className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <section className="mb-10 px-4" id="pricing">
        <h2 className="font-display text-3xl text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Simple, honest pricing
        </h2>
        <p className="font-ui text-center text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
          All prices in CAD. No hidden fees.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PricingCard
            name="Free"
            price="$0"
            features={[
              '1 league',
              'Up to 8 players',
              'Unlimited games',
              'Standings & streaks',
              'Comments & trash talk',
              'Basic player profiles',
            ]}
            cta="Get started free"
            ctaTo="/leagues/new"
          />
          <PricingCard
            badge="Most popular"
            highlight
            name="Pro Yearly"
            price="CAD $80"
            period="/ year"
            note="Save ~26% vs monthly"
            features={[
              'Unlimited leagues',
              'Unlimited players',
              'Tournaments',
              'Full stats page',
              'Matchup Odds',
              'Custom rules',
              'CSV export',
              'Weekly digest email',
            ]}
            cta="Go Pro yearly"
            ctaTo="/leagues/new"
          />
          <PricingCard
            name="Pro Monthly"
            price="CAD $9"
            period="/ month"
            features={[
              'Unlimited leagues',
              'Unlimited players',
              'Tournaments',
              'Full stats page',
              'Matchup Odds',
              'Custom rules',
              'CSV export',
              'Weekly digest email',
            ]}
            cta="Go Pro monthly"
            ctaTo="/leagues/new"
          />
          <PricingCard
            name="Weekend Pass"
            price="CAD $12"
            period="one-time"
            note="7 days of full Pro access. No recurring charge."
            features={[
              'All Pro features',
              '7-day access',
              'Perfect for events',
              'Bachelor parties',
              'Festivals & tourneys',
              'No subscription',
            ]}
            cta="Buy a pass"
            ctaTo="/leagues/new"
          />
        </div>
      </section>

      {/* ── Venue pricing ────────────────────────────────────────── */}
      <section className="mb-16 px-4" id="venue">
        <div
          className="rounded-[20px] p-8"
          style={{ background: 'var(--color-surface)', border: '2px solid var(--color-border)', boxShadow: '4px 4px 0 var(--color-border)' }}
        >
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Left: copy */}
            <div className="flex-1">
              <div
                className="inline-block px-3 py-1 rounded-full text-xs font-ui font-bold mb-4"
                style={{ background: 'rgba(58,107,53,0.1)', color: 'var(--color-primary)' }}
              >
                For establishments
              </div>
              <h2 className="font-display text-3xl mb-3" style={{ color: 'var(--color-text-primary)' }}>
                Running league nights at your venue?
              </h2>
              <p className="font-ui mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                One flat yearly subscription covers every league you run — no per-league fees, no surprises.
                Perfect for bars, recreation centres, and community organizations that host multiple league nights.
              </p>
              <ul className="flex flex-col gap-2 mb-6">
                {[
                  { icon: '🍺', text: 'Bars & pubs running weekly cornhole nights' },
                  { icon: '🏢', text: 'Recreation centres with multiple groups' },
                  { icon: '🌐', text: 'Community orgs managing several leagues at once' },
                ].map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-3 font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    <span>{icon}</span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: plan card */}
            <div
              className="w-full md:w-72 flex-shrink-0 rounded-[16px] p-6 flex flex-col"
              style={{ background: 'var(--color-bg)', border: '2px solid var(--color-primary)' }}
            >
              <div
                className="text-xs font-ui font-bold px-3 py-1 rounded-full self-start mb-3"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                Venue
              </div>
              <div className="mb-1">
                <span className="font-display text-4xl" style={{ color: 'var(--color-text-primary)' }}>CAD $199</span>
                <span className="font-ui text-sm ml-1" style={{ color: 'var(--color-text-secondary)' }}>/ year</span>
              </div>
              <p className="font-ui text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                One account, unlimited leagues
              </p>
              <ul className="flex flex-col gap-2 mb-6 flex-1">
                {[
                  'Unlimited leagues',
                  'Unlimited players per league',
                  'Everything in Pro',
                  'Tournaments & brackets',
                  'Full stats & CSV export',
                  'Single subscription for all leagues',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 font-ui text-sm" style={{ color: 'var(--color-text-primary)' }}>
                    <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-primary)' }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={handleVenueCheckout}
                disabled={venueLoading}
                className="btn btn-primary w-full text-center disabled:opacity-60"
              >
                {venueLoading ? 'Redirecting…' : 'Get Venue Plan →'}
              </button>
              <p className="text-xs font-ui text-center mt-3" style={{ color: 'var(--color-text-secondary)' }}>
                CAD. Cancel anytime. Taxes may apply.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Founder ──────────────────────────────────────────────── */}
      <section className="mb-16 px-4">
        <div
          className="rounded-[20px] px-8 py-10 flex flex-col sm:flex-row items-center gap-8"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '4px 4px 0 var(--color-border)' }}
        >
          <img
            src="/founder.jpg"
            alt="Andrew McKay, founder"
            className="flex-shrink-0 rounded-full object-cover object-top border-4"
            style={{ width: 120, height: 120, borderColor: 'var(--color-secondary)' }}
          />
          <div>
            <blockquote
              className="font-ui text-base italic mb-4 leading-relaxed"
              style={{ color: 'var(--color-text-primary)' }}
            >
              "I created this site after a friend of mine contested who the best cornhole player was. I needed empirical evidence to shove in his face, and now I have it. This site is for everyone who needs to record the data behind their favourite backyard activity. I hope you enjoy shoving it in your friends' faces as much as I do. Cheers."
            </blockquote>
            <div className="flex items-center gap-2">
              <span className="font-ui font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Andrew McKay</span>
              <span className="font-ui text-xs" style={{ color: 'var(--color-text-secondary)' }}>· Founder, Cornhole249</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="mb-16 px-4">
        <h2 className="font-display text-3xl text-center mb-8" style={{ color: 'var(--color-text-primary)' }}>
          Questions?
        </h2>
        <div className="max-w-2xl mx-auto">
          <FAQ />
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────── */}
      <section
        className="mb-16 px-8 py-12 rounded-[20px] text-center"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, #2D5A27 100%)',
          boxShadow: '4px 4px 0 var(--color-border)',
        }}
      >
        <h2 className="font-display text-3xl mb-3" style={{ color: '#fff' }}>
          Ready to settle it on the board?
        </h2>
        <p className="font-ui mb-6" style={{ color: 'rgba(255,255,255,0.8)' }}>
          Set up your league in under 2 minutes. Free forever.
        </p>
        <Link to="/leagues/new" className="btn px-8 py-3 text-base font-bold" style={{ background: 'var(--color-secondary)', color: '#fff' }}>
          Create your league →
        </Link>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer
        className="border-t py-8 px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm font-ui"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        <div className="font-display text-lg" style={{ color: 'var(--color-text-primary)' }}>
          Cornhole249
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/terms" className="hover:underline">Terms</Link>
          <Link to="/privacy" className="hover:underline">Privacy</Link>
          <Link to="/refunds" className="hover:underline">Refunds</Link>
          <Link to="/cookies" className="hover:underline">Cookies</Link>
        </div>
        <div style={{ color: 'var(--color-text-secondary)' }}>© {new Date().getFullYear()} Cornhole249</div>
      </footer>
    </div>
  );
}
