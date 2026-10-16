import '@fontsource-variable/atkinson-hyperlegible-next';
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initI18n } from './i18n';
import { applyTheme, getLanguagePref, getThemePref } from './lib/preferences';
import { announceUpdate } from './state/update';

applyTheme(getThemePref());
initI18n(getLanguagePref());

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (production builds). A new version never reloads the page by itself: the app
// shows a banner and the knitter decides when (ADR-3).
if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      announceUpdate(() => void updateSW(true));
    },
  });
}
