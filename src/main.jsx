import React from 'react';
import { createRoot } from 'react-dom/client';
import './lib/theme.css';   // Mushy default design system — auto-load
import { initAnalytics } from './lib/analytics.js'; // PostHog — auto-init, no-op nếu thiếu key
import App from './App.jsx';
import { DialogProvider } from './components/Dialog.jsx';

// Fire-and-forget — lazy load posthog-js + bắn app_opened. Không block render.
initAnalytics();

createRoot(document.getElementById('root')).render(
  <DialogProvider>
    <App />
  </DialogProvider>
);
