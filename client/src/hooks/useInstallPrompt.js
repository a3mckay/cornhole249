/**
 * useInstallPrompt — manages PWA install state.
 *
 * Returns:
 *   canInstall   — true when the browser's beforeinstallprompt event has fired
 *                  (Chrome/Edge/Android). Always false on iOS — use isIos instead.
 *   isIos        — true on iOS Safari (needs manual Add to Home Screen flow)
 *   isStandalone — true if already running as an installed PWA
 *   showBanner   — true when banner should be visible (2nd+ session, not dismissed)
 *   promptInstall — call to trigger the native install dialog (Chrome/Android)
 *   dismiss      — call to permanently hide the banner (stored in localStorage)
 */

import { useState, useEffect } from 'react';

const VISITS_KEY    = 'pwa_visits';
const DISMISSED_KEY = 'pwa_dismissed';
const MIN_VISITS    = 2;

// Module-level guard: visit counter should increment exactly once per full page
// load, even if the hook is mounted by multiple components simultaneously.
let _visitCounted = false;

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalonePWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall]         = useState(false);
  const [dismissed, setDismissed]           = useState(
    () => !!localStorage.getItem(DISMISSED_KEY)
  );

  const isIos        = isIosBrowser();
  const isStandalone = isStandalonePWA();

  // Increment visit counter exactly once per full page load
  useEffect(() => {
    if (!_visitCounted) {
      _visitCounted = true;
      const visits = parseInt(localStorage.getItem(VISITS_KEY) || '0') + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
    }
  }, []);

  // Listen for the browser's install prompt (Chrome / Edge / Android)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Also detect if user installs via another path
    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setCanInstall(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const visits    = parseInt(localStorage.getItem(VISITS_KEY) || '0');
  const metVisitThreshold = visits >= MIN_VISITS;

  // Show the banner when:
  // - not already installed as standalone
  // - not dismissed
  // - met the visit threshold
  // - either canInstall (Chrome/Android) OR isIos (manual flow)
  const showBanner =
    !isStandalone &&
    !dismissed &&
    metVisitThreshold &&
    (canInstall || isIos);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanInstall(false);
    return outcome === 'accepted';
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return { canInstall, isIos, isStandalone, showBanner, promptInstall, dismiss };
}
