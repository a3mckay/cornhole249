import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRShare({ inline = false }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (inline) {
    return (
      <div className="card text-center" data-testid="qr-share-card">
        <div className="font-display text-xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Scan to Join
        </div>
        <div className="flex justify-center mb-3">
          <div className="p-3 rounded-xl bg-white inline-block">
            <QRCodeSVG
              value={url}
              size={140}
              bgColor="#FFFFFF"
              fgColor="#2C2416"
              data-testid="qr-code"
            />
          </div>
        </div>
        <div className="text-sm font-ui mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          {url}
        </div>
        <button onClick={handleCopy} className="btn btn-secondary" data-testid="copy-link-btn">
          {copied ? '✓ Copied!' : '📋 Copy Link'}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-card flex items-center justify-center text-white transition-transform hover:scale-110"
        style={{ background: 'var(--color-primary)' }}
        title="Share Cornhole249"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 4.5c0 0-7.5 5.5-7.5 9a7.5 7.5 0 0015 0c0-3.5-7.5-9-7.5-9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8.5 8.5A7.5 7.5 0 0112 4.5" />
          <rect x="9" y="12" width="6" height="6" rx="1" strokeWidth={2} />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed bottom-20 right-6 z-50 card w-56 text-center"
            style={{ background: 'var(--color-surface)' }}
          >
            <div className="font-display text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
              Share Cornhole249
            </div>
            <div className="flex justify-center mb-2">
              <div className="p-2 bg-white rounded-lg inline-block">
                <QRCodeSVG value={url} size={100} bgColor="#FFFFFF" fgColor="#2C2416" />
              </div>
            </div>
            <button onClick={handleCopy} className="btn btn-secondary text-sm w-full">
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
