import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

/**
 * Universal share trigger. Click → modal with preview of the OG image and four
 * actions (native share on mobile, copy link, copy image, download PNG).
 *
 * Props:
 *   - shareUrl: the canonical page URL to share (without `?ref=`). Defaults to
 *     the current window URL.
 *   - imageUrl: the OG image route (e.g. `/og/game/123.png`). Required.
 *   - title:    short label shown in the modal heading + Web Share dialog.
 *   - text:     1-line description for Web Share (optional).
 *   - variant:  "icon" (small, default) or "primary" (full button)
 *   - className: extra classes appended to the trigger.
 */
export default function ShareButton({
  shareUrl,
  imageUrl,
  title = 'Cornhole249',
  text,
  variant = 'primary',
  className = '',
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Append ?ref=<ref_token> when a player is logged in so we can attribute
  // sign-ups to the sharer. Uses an opaque token (not the user ID) so internal
  // IDs aren't exposed in shared URLs.
  const buildShareUrl = () => {
    let base = shareUrl;
    if (!base && typeof window !== 'undefined') {
      base = window.location.origin + window.location.pathname;
    }
    if (!base) return '';
    if (!user?.ref_token) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}ref=${user.ref_token}`;
  };

  const triggerLabel = variant === 'primary' ? '🔗 Share' : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Share"
        aria-label="Share"
        className={
          variant === 'primary'
            ? `btn btn-secondary text-sm ${className}`
            : `inline-flex items-center justify-center w-9 h-9 rounded-full transition-transform hover:scale-110 ${className}`
        }
        style={
          variant === 'icon'
            ? { background: 'var(--color-surface)', border: '1px solid var(--color-border)' }
            : undefined
        }
        data-testid="share-button"
      >
        {triggerLabel || (
          /* Upload-arrow share icon — clear at small sizes */
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13M7 8l5-5 5 5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 16v3a2 2 0 002 2h10a2 2 0 002-2v-3" />
          </svg>
        )}
      </button>

      {open && (
        <ShareModal
          onClose={() => setOpen(false)}
          shareUrl={buildShareUrl()}
          imageUrl={imageUrl}
          title={title}
          text={text}
        />
      )}
    </>
  );
}

function ShareModal({ onClose, shareUrl, imageUrl, title, text }) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imageErr, setImageErr] = useState(false);

  // Web Share API works on iOS Safari, Android Chrome, and most mobile
  // browsers. Desktop browsers mostly don't expose it — fall back to copy.
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleNativeShare = async () => {
    try {
      await navigator.share({ url: shareUrl, title, text });
    } catch (e) {
      // user cancelled — silent
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      alert('Copy failed — please copy manually:\n' + shareUrl);
    }
  };

  // Copy the rendered PNG to the clipboard so the user can paste it directly
  // into iMessage/Slack/etc as an image. Falls back gracefully if the
  // browser's clipboard doesn't support the image MIME type.
  const handleCopyImage = async () => {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      if (typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard image not supported');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch (e) {
      alert('This browser can\'t copy images. Use Download instead.');
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cornhole249${imageUrl.replace(/[/.]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(44,36,22,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card shadow-card overflow-hidden"
        style={{ background: 'var(--color-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>
            Share
          </div>
          <button
            onClick={onClose}
            className="text-xl font-ui leading-none p-1"
            style={{ color: 'var(--color-text-secondary)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* OG preview */}
        <div className="p-5 pb-3">
          <div
            className="w-full rounded-xl overflow-hidden flex items-center justify-center"
            style={{
              aspectRatio: '1200 / 630',
              background: 'rgba(44,36,22,0.06)',
              border: '1px solid var(--color-border)',
            }}
          >
            {imageErr ? (
              <div className="font-ui text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Preview unavailable
              </div>
            ) : (
              <img
                src={imageUrl}
                alt="Share preview"
                className="w-full h-full object-cover"
                onError={() => setImageErr(true)}
              />
            )}
          </div>
        </div>

        {/* Link row */}
        <div className="px-5 pb-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-ui truncate"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
            title={shareUrl}
          >
            🔗 <span className="truncate flex-1">{shareUrl}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 grid grid-cols-2 gap-2">
          {canNativeShare && (
            <button
              onClick={handleNativeShare}
              className="btn btn-primary col-span-2"
            >
              📲 Share…
            </button>
          )}
          <button onClick={handleCopyLink} className="btn btn-secondary text-sm">
            {copiedLink ? '✓ Copied' : '🔗 Copy Link'}
          </button>
          <button onClick={handleCopyImage} className="btn btn-secondary text-sm">
            {copiedImage ? '✓ Copied' : '🖼️ Copy Image'}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn btn-ghost text-sm col-span-2"
          >
            {downloading ? 'Downloading…' : '⬇️ Download PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}
