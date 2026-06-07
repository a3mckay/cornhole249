/**
 * InstallBanner — slim dismissible banner below the navbar promoting PWA install.
 *
 * Shown after the user's 2nd session (tracked via localStorage).
 * Chrome / Android: offers the native install dialog via beforeinstallprompt.
 * iOS Safari:       shows manual "Add to Home Screen" instructions.
 * Already installed or dismissed: renders nothing.
 */

import React from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export default function InstallBanner() {
  const { showBanner, canInstall, isIos, promptInstall, dismiss } = useInstallPrompt();

  if (!showBanner) return null;

  return (
    <div
      className="px-4 py-2.5 text-sm font-ui flex items-center justify-between gap-4"
      style={{
        background: '#F0FDF4',
        borderBottom: '1px solid #86EFAC',
        color: '#166534',
      }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="flex-shrink-0">📱</span>
        {canInstall ? (
          <span>
            Install Cornhole249 for quick access from your home screen.{' '}
            <button
              onClick={async () => {
                const accepted = await promptInstall();
                if (accepted) dismiss(); // banner no longer needed once installed
              }}
              className="underline font-semibold whitespace-nowrap"
            >
              Install now
            </button>
          </span>
        ) : isIos ? (
          <span>
            Add to your home screen: tap <strong>Share</strong> ⬆️ then{' '}
            <strong>Add to Home Screen</strong>.
          </span>
        ) : null}
      </span>
      <button
        onClick={dismiss}
        className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0 leading-none"
        aria-label="Dismiss install banner"
      >
        ✕
      </button>
    </div>
  );
}
