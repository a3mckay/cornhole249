import React from 'react';
import { Link } from 'react-router-dom';

export default function Cookies() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link to="/" className="text-sm font-ui underline mb-6 block" style={{ color: 'var(--color-primary)' }}>
        ← Back to home
      </Link>
      <h1 className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Cookie Notice
      </h1>
      <p className="font-ui text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
        Last updated: June 2025
      </p>

      <div className="flex flex-col gap-6 font-ui">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Cornhole249 uses a small number of cookies to make the Service work. We don't use advertising cookies or tracking cookies that follow you across other websites.
        </p>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th className="text-left py-2 pr-4 font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>Cookie</th>
              <th className="text-left py-2 pr-4 font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>Purpose</th>
              <th className="text-left py-2 font-ui font-bold" style={{ color: 'var(--color-text-primary)' }}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'connect.sid', purpose: 'Session cookie — keeps you logged in.', duration: 'Session (browser close)' },
              { name: 'ref', purpose: 'Referral tracking — records which invite link brought you here, so the person who referred you gets credit.', duration: '30 days' },
            ].map(({ name, purpose, duration }) => (
              <tr key={name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td className="py-3 pr-4 font-mono text-xs align-top" style={{ color: 'var(--color-primary)' }}>{name}</td>
                <td className="py-3 pr-4 align-top" style={{ color: 'var(--color-text-secondary)' }}>{purpose}</td>
                <td className="py-3 align-top" style={{ color: 'var(--color-text-secondary)' }}>{duration}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Section title="Essential cookies only">
          All cookies listed above are essential to the operation of the Service. We don't use optional analytics cookies, advertising cookies, or social media tracking pixels.
          <br /><br />
          Because we only use essential cookies, we don't require a cookie consent banner under most jurisdictions. If you have questions, contact us (see{' '}
          <Link to="/privacy" className="underline" style={{ color: 'var(--color-primary)' }}>Privacy Policy</Link>).
        </Section>

        <Section title="Disabling cookies">
          You can disable cookies in your browser settings, but doing so will prevent you from staying logged in to the Service.
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
      <Link to="/refunds" className="hover:underline">Refunds</Link>
      <Link to="/cookies" className="hover:underline" style={{ color: 'var(--color-primary)' }}>Cookies</Link>
    </div>
  );
}
