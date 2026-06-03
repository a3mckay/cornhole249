import React from 'react';
import { Link } from 'react-router-dom';

const CONTACT_EMAIL = 'hello@cornhole249.com';
const EFFECTIVE_DATE = 'June 3, 2026';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-xl mb-3" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
      <div className="font-ui text-sm leading-relaxed space-y-3" style={{ color: 'var(--color-text-secondary)' }}>
        {children}
      </div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto mt-8 mb-16">
      <div className="card p-8">
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--color-text-primary)' }}>Privacy Policy</h1>
        <p className="text-xs font-ui mb-8" style={{ color: 'var(--color-text-secondary)' }}>
          Effective {EFFECTIVE_DATE}
        </p>

        <Section title="What we collect">
          <p>When you create an account we collect:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Email address</strong> — to send account verification and password-reset emails.</li>
            <li><strong>Display name</strong> — shown on leaderboards and game history.</li>
            <li><strong>Google account identifier</strong> — if you sign in with Google.</li>
            <li><strong>Game scores and statistics</strong> — the core purpose of the app.</li>
          </ul>
          <p>
            We do <strong>not</strong> collect phone numbers, physical addresses, payment card numbers,
            or government IDs. Payment processing is handled by Stripe — we never see your card details.
          </p>
        </Section>

        <Section title="Why we collect it">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Email</strong> — account verification and password recovery only. We do not send marketing email.</li>
            <li><strong>Display name</strong> — to identify you on scoreboards within your league.</li>
            <li><strong>Scores &amp; history</strong> — the core function of the service.</li>
          </ul>
        </Section>

        <Section title="How long we keep it">
          <p>
            Your data is retained for as long as your account exists. When you delete your account
            (see below), all personal information is removed immediately. Anonymised game history
            (scores, wins, losses without any name or contact info) may be retained to preserve
            league standings integrity.
          </p>
          <p>
            Daily backups are kept for 7 days, after which they are automatically deleted.
            Backups are encrypted at rest.
          </p>
        </Section>

        <Section title="Third parties">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Stripe</strong> — processes payments if you upgrade a league. Your email and
              display name are shared with Stripe to create a billing customer.{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>
                Stripe Privacy Policy
              </a>
            </li>
            <li>
              <strong>Google</strong> — if you use "Sign in with Google," Google shares your name
              and email with us under{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>
                Google's Privacy Policy
              </a>.
            </li>
            <li>
              <strong>Open-Meteo</strong> — venue coordinates are sent to this public weather API
              to display game-day conditions. No personal data is included.
            </li>
          </ul>
          <p>We do not sell your data to any third party.</p>
        </Section>

        <Section title="Your rights">
          <p>
            Under Canadian privacy law (PIPEDA) and applicable US state laws, you have the right to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and all associated personal data</li>
            <li>Withdraw consent at any time by deleting your account</li>
          </ul>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can permanently delete your account and all personal information from your account
            settings page. This is immediate and irreversible. Your game scores will be retained
            anonymously to preserve league history; comments and trash talk are deleted outright.
          </p>
          <p>
            If you have an active league subscription through Stripe, please cancel it before
            deleting your account to avoid further charges. Stripe retains billing records
            independently — contact{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: 'var(--color-primary)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            if you need assistance removing Stripe data.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or data requests:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline" style={{ color: 'var(--color-primary)' }}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <p className="text-xs font-ui mt-8" style={{ color: 'var(--color-text-secondary)' }}>
          <Link to="/" className="underline" style={{ color: 'var(--color-primary)' }}>← Back to app</Link>
        </p>
      </div>
    </div>
  );
}
