import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { capture } from '../lib/analytics';

// ── Canvas helpers for the downloadable join poster ──────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Word-wrap `text` to at most `maxLines` lines that fit `maxWidth` (ellipsis on overflow).
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

// Shrink the font (from basePx) until `text` fits `maxWidth`.
function fitFont(ctx, text, maxWidth, basePx, weight, family) {
  let px = basePx;
  const set = () => { ctx.font = `${weight ? weight + ' ' : ''}${px}px ${family}`; };
  set();
  while (px > 11 && ctx.measureText(text).width > maxWidth) { px -= 1; set(); }
}

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
      capture('invite_sent', { channel: 'link' });
      onShare?.();
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Join ${leagueName} on Cornhole249`,
        url: joinLink,
      }).catch(() => {});
      capture('invite_sent', { channel: 'native_share' });
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
    const qrCanvas = qrRef.current?.querySelector('canvas');
    if (!qrCanvas) return;

    // Compose a printable poster around the bare QR: league name, "Scan to join",
    // the QR in a white card, the typeable code, the URL, and a tagline.
    const S = 2;                       // hi-dpi export
    const W = 720, H = 900;
    const cv = document.createElement('canvas');
    cv.width = W * S; cv.height = H * S;
    const ctx = cv.getContext('2d');
    ctx.scale(S, S);
    ctx.textAlign = 'center';

    const CREAM = '#FBF7EC', INK = '#2C2416', GREEN = '#3A6B35', GOLD = '#C9881F', MUTED = '#9a8f78';
    const SERIF = 'Georgia, "Times New Roman", serif';
    const SANS = 'Helvetica, Arial, sans-serif';

    // Background + poster frame
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(44,36,22,0.18)'; ctx.lineWidth = 2;
    roundRect(ctx, 22, 22, W - 44, H - 44, 26); ctx.stroke();

    let y = 112;

    // League name (1–2 lines)
    ctx.fillStyle = INK;
    ctx.font = `bold 50px ${SERIF}`;
    for (const line of wrapText(ctx, leagueName, W - 140, 2)) { ctx.fillText(line, W / 2, y); y += 58; }

    // "SCAN TO JOIN"
    y += 4;
    ctx.fillStyle = GREEN;
    ctx.font = `bold 30px ${SANS}`;
    ctx.fillText('SCAN TO JOIN', W / 2, y);
    // underline accent
    const uw = ctx.measureText('SCAN TO JOIN').width;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo((W - uw) / 2, y + 10); ctx.lineTo((W + uw) / 2, y + 10); ctx.stroke();
    y += 34;

    ctx.fillStyle = MUTED; ctx.font = `19px ${SANS}`;
    ctx.fillText('Point your phone camera at the code', W / 2, y);
    y += 28;

    // QR card
    const qr = 340, pad = 22, panel = qr + pad * 2;
    const px = (W - panel) / 2, py = y;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(44,36,22,0.20)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    roundRect(ctx, px, py, panel, panel, 18); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.imageSmoothingEnabled = false; // crisp integer upscale of the QR modules
    ctx.drawImage(qrCanvas, px + pad, py + pad, qr, qr);
    ctx.imageSmoothingEnabled = true;
    y = py + panel + 48;

    // Typeable code (when provided)
    if (joinCode) {
      ctx.fillStyle = MUTED; ctx.font = `bold 17px ${SANS}`;
      ctx.fillText('OR ENTER CODE AT FIND A LEAGUE', W / 2, y); y += 38;
      ctx.fillStyle = INK; ctx.font = `bold 40px "Courier New", monospace`;
      ctx.fillText(String(joinCode).toUpperCase(), W / 2, y); y += 6;
    }

    // URL + tagline pinned near the bottom
    const shownUrl = (joinLink || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    ctx.fillStyle = GOLD;
    fitFont(ctx, shownUrl, W - 120, 21, 'bold', SANS);
    ctx.fillText(shownUrl, W / 2, H - 58);

    ctx.fillStyle = MUTED; ctx.font = `16px ${SANS}`;
    ctx.fillText('Track standings, games & trash talk', W / 2, H - 32);

    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `${(leagueName || 'league').replace(/\s+/g, '-').toLowerCase()}-join-qr.png`;
    a.click();
    capture('invite_sent', { channel: 'qr' });
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
          onClick={() => { capture('invite_sent', { channel: 'sms' }); onShare?.(); }}
          className="btn btn-secondary flex-1 text-center"
          style={{ textDecoration: 'none' }}
        >
          💬 Text
        </a>
        <a
          href={emailHref}
          onClick={() => { capture('invite_sent', { channel: 'email' }); onShare?.(); }}
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
            size={340}
            bgColor="#FFFFFF"
            fgColor="#2C2416"
            style={{ width: 140, height: 140 }}
          />
        </div>
        <button
          onClick={handleDownloadQR}
          className="btn btn-secondary text-sm"
        >
          ⬇️ Download QR
        </button>
        {joinCode && (
          <p className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            Join code: <span className="font-mono font-bold tracking-widest">{joinCode}</span>
          </p>
        )}
      </div>
    </div>
  );
}
