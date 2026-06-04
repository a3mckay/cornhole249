import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * InviteKit — reusable invite-link component.
 *
 * Props:
 *   joinLink  {string}  The full invite URL to share (e.g. https://cornhole249.com/join/ABC12345)
 *   joinCode  {string}  The 8-char join code (displayed as text below the QR)
 *   leagueName {string} League name, used to personalise SMS/email prefills
 */
export default function InviteKit({ joinLink, joinCode, leagueName = 'our league', onShare }) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);

  if (!joinLink) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShare?.();
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Join ${leagueName} on Cornhole249`,
        url: joinLink,
      }).catch(() => {});
    } else {
      handleCopy();
    }
    onShare?.();
  };

  const smsBody = encodeURIComponent(
    `Hey! Come join ${leagueName} on Cornhole249 — track standings, games, and call out trash talk. Here's your invite link: ${joinLink}`
  );
  const smsHref = `sms:?&body=${smsBody}`;

  const emailSubject = encodeURIComponent(`You're invited to ${leagueName} on Cornhole249`);
  const emailBody = encodeURIComponent(
    `Hey!\n\nYou've been invited to join ${leagueName} on Cornhole249.\n\nUse this link to register: ${joinLink}\n\nSee you on the boards.`
  );
  const emailHref = `mailto:?subject=${emailSubject}&body=${emailBody}`;

  const handleDownloadQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${leagueName.replace(/\s+/g, '-').toLowerCase()}-invite-qr.png`;
    a.click();
    onShare?.();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Link display + copy */}
      <div>
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-2"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
        >
          <span
            className="flex-1 font-ui text-sm truncate"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {joinLink}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="btn btn-secondary flex-1">
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
          <button onClick={handleShare} className="btn btn-primary flex-1">
            📤 Share
          </button>
        </div>
      </div>

      {/* SMS + Email */}
      <div className="flex gap-2">
        <a
          href={smsHref}
          onClick={() => onShare?.()}
          className="btn btn-secondary flex-1 text-center"
          style={{ textDecoration: 'none' }}
        >
          💬 Text
        </a>
        <a
          href={emailHref}
          onClick={() => onShare?.()}
          className="btn btn-secondary flex-1 text-center"
          style={{ textDecoration: 'none' }}
        >
          ✉️ Email
        </a>
      </div>

      {/* QR code */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <div ref={qrRef} className="p-3 rounded-xl bg-white inline-block">
          <QRCodeCanvas
            value={joinLink}
            size={140}
            bgColor="#FFFFFF"
            fgColor="#2C2416"
          />
        </div>
        <button
          onClick={handleDownloadQR}
          className="btn btn-secondary text-sm"
        >
          ⬇️ Download QR
        </button>
        <p className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
          Join code: <span className="font-mono font-bold tracking-widest">{joinCode}</span>
        </p>
      </div>
    </div>
  );
}
