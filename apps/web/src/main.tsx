import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initI18n } from './i18n';
import { applyTheme, getThemePreference } from './theme';
import { markUpdateReady } from './update';
import './styles.css';

initI18n();
applyTheme(getThemePreference());
// Checks for a new version every hour and when the tab becomes visible again; the banner lets the user apply it.
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const updateApp = registerSW({
  immediate: true,
  onNeedRefresh() { markUpdateReady(updateApp); },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void registration.update(); });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
