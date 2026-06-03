import React from 'react';
import { Link } from 'react-router-dom';

export default function Refunds() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link to="/" className="text-sm font-ui underline mb-6 block" style={{ color: 'var(--color-primary)' }}>
        ← Back to home
      </Link>
      <h1 className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Refund Policy
      </h1>
      <p className="font-ui text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
        Last updated: June 2025
      </p>

      <div className="flex flex-col gap-6 font-ui">
        <Section title="Pro Monthly and Pro Yearly">
          We offer a <strong>7-day full refund</strong> on new Pro Monthly and Pro Yearly subscriptions. If you're not satisfied within 7 days of your first payment, contact us and we'll issue a full refund, no questions asked.
          <br /><br />
          After 7 days, refunds are not available for the current billing period. Your subscription remains active until the end of the period, and you can cancel at any time to prevent renewal.
        </Section>

        <Section title="Weekend Pass">
          The Weekend Pass is a <strong>non-refundable</strong> one-time purchase. Because it grants immediate access to Pro features for a fixed 7-day window, refunds are not available once the pass has been activated.
          <br /><br />
          If you have a genuine technical issue that prevented you from using the pass, contact us and we'll review it on a case-by-case basis.
        </Section>

        <Section title="How to request a refund">
          To request a refund, contact us within the applicable window with your email address and a brief note. We'll process it within 5 business days.
          <br /><br />
          Contact: [Contact email — add before publishing]
        </Section>

        <Section title="Chargebacks">
          We ask that you contact us before initiating a chargeback with your bank. Chargebacks can result in account suspension. We're happy to make things right directly.
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
      <Link to="/terms" className="hover:underline">Terms</Link>
      <Link to="/privacy" className="hover:underline">Privacy</Link>
      <Link to="/refunds" className="hover:underline" style={{ color: 'var(--color-primary)' }}>Refunds</Link>
      <Link to="/cookies" className="hover:underline">Cookies</Link>
    </div>
  );
}
