import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App.jsx';
import './index.css';

// Sentry browser error tracking.
// Set VITE_SENTRY_DSN in your environment (or Railway variables) to enable.
if (import.meta.env.VITE_SENTRY_DSN) {
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
