import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { initI18n } from './i18n';
import { App } from './App';
import './styles/base.css';

initI18n();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: registered in production builds only. An update never reloads the page on its
// own (ADR-3); the "new version available" prompt arrives with the tracker UI in M2.
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
