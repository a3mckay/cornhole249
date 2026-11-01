import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// Sentry browser error tracking.
// Set VITE_SENTRY_DSN in your environment (or Railway variables) to enable.
// The SDK is ~160 KB gzipped — bigger than the app itself — so it's loaded as
// its own chunk once the page has finished loading, instead of competing with
// the app for bandwidth on first open.
if (import.meta.env.VITE_SENTRY_DSN) {
  const initSentry = () => import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [Sentry.browserTracingIntegration()],
      // Capture 10% of requests for performance traces (free tier friendly)
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // Strip PII from Sentry user context
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.ip_address;
        }
        return event;
      },
    });
  }).catch(() => {});
  if (document.readyState === 'complete') initSentry();
  else window.addEventListener('load', initSentry, { once: true });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Remove the pre-load overlay once React has rendered
const preLoad = document.getElementById('pre-load');
if (preLoad) preLoad.remove();
