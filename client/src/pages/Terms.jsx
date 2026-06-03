import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link to="/" className="text-sm font-ui underline mb-6 block" style={{ color: 'var(--color-primary)' }}>
        ← Back to home
      </Link>
      <h1 className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Terms of Service
      </h1>
      <p className="font-ui text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
        Last updated: June 2025
      </p>

      <div className="flex flex-col gap-6 font-ui" style={{ color: 'var(--color-text-primary)' }}>
        <Section title="1. Acceptance of Terms">
          By creating an account or using Cornhole249 ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
        </Section>

        <Section title="2. Description of Service">
          Cornhole249 is a web-based platform for tracking cornhole leagues, games, standings, and tournaments. The Service is operated by its owner ("we", "us", or "our") and is intended for recreational use.
        </Section>

        <Section title="3. Account Registration">
          You must provide accurate information when registering. You are responsible for keeping your password confidential and for all activity under your account. You must be at least 13 years old to use the Service.
        </Section>

        <Section title="4. Acceptable Use">
          You agree not to: (a) use the Service for any unlawful purpose; (b) post content that is abusive, defamatory, or infringes third-party rights; (c) attempt to gain unauthorised access to any portion of the Service; or (d) interfere with the operation of the Service.
        </Section>

        <Section title="5. User Content">
          You retain ownership of content you post (game scores, comments, league names). By posting, you grant us a non-exclusive licence to display and distribute that content as part of operating the Service. We reserve the right to remove content that violates these Terms.
        </Section>

        <Section title="6. Subscriptions and Payments">
          Paid plans (Pro Monthly, Pro Yearly, Weekend Pass) are billed through Stripe. By subscribing, you authorise us to charge your payment method on the applicable billing cycle. Prices are in Canadian dollars (CAD) unless stated otherwise.
          <br /><br />
          Pro Monthly and Pro Yearly subscriptions renew automatically until cancelled. The Weekend Pass is a one-time charge with no recurring billing.
        </Section>

        <Section title="7. Refunds">
          Our refund policy is described at{' '}
          <Link to="/refunds" className="underline" style={{ color: 'var(--color-primary)' }}>cornhole249.com/refunds</Link>.
        </Section>

        <Section title="8. Termination">
          We may suspend or terminate your account for violation of these Terms. You may close your account at any time from account settings.
        </Section>

        <Section title="9. Disclaimers">
          The Service is provided "as is" without warranty of any kind. We do not guarantee uninterrupted or error-free operation. Use the Service at your own risk.
        </Section>

        <Section title="10. Limitation of Liability">
          To the maximum extent permitted by applicable law, we shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.
        </Section>

        <Section title="11. Changes to Terms">
          We may update these Terms at any time. Continued use of the Service after changes are posted constitutes acceptance of the updated Terms.
        </Section>

        <Section title="12. Governing Law">
          These Terms are governed by the laws of the Province of Ontario, Canada. Disputes shall be resolved in the courts of Ontario.
        </Section>

        <Section title="13. Contact">
          Questions about these Terms? Contact us at the address in our{' '}
          <Link to="/privacy" className="underline" style={{ color: 'var(--color-primary)' }}>Privacy Policy</Link>.
        </Section>
      </div>

      <LegalFooter />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="font-ui font-bold text-base mb-2" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
      <p className="font-ui text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{children}</p>
    </div>
  );
}

function LegalFooter() {
  return (
    <div className="mt-12 pt-6 border-t flex flex-wrap gap-4 text-sm font-ui" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
      <Link to="/terms" className="hover:underline" style={{ color: 'var(--color-primary)' }}>Terms</Link>
      <Link to="/privacy" className="hover:underline">Privacy</Link>
      <Link to="/refunds" className="hover:underline">Refunds</Link>
      <Link to="/cookies" className="hover:underline">Cookies</Link>
    </div>
  );
}
