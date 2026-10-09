import { useTranslation } from 'react-i18next';
import { Dashboard } from './features/dashboard/Dashboard';
import { ImportPanel } from './features/import/ImportPanel';
import { NightView } from './features/night/NightView';
import { Settings } from './features/settings/Settings';
import { href, useRoute } from './router';
import { DataProvider } from './state';

export function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const current = route.name === 'night' ? 'dashboard' : route.name;
  const link = (name: 'dashboard' | 'import' | 'settings') => ({ href: href[name], 'aria-current': current === name ? ('page' as const) : undefined });

  return (
    <DataProvider>
      <a className="skip" href="#main">{t('app.skip')}</a>
      <header className="app-header">
        <div className="inner">
          <a className="brand" href={href.dashboard}><img src="/icon.svg" alt="" />{t('app.name')}</a>
          <nav aria-label={t('nav.label')}>
            <ul>
              <li><a {...link('dashboard')}>{t('nav.dashboard')}</a></li>
              <li><a {...link('import')}>{t('nav.import')}</a></li>
              <li><a {...link('settings')}>{t('nav.settings')}</a></li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {route.name === 'dashboard' && <Dashboard />}
        {route.name === 'import' && <ImportPanel />}
        {route.name === 'settings' && <Settings />}
        {route.name === 'night' && <NightView date={route.date} />}
      </main>
      <footer className="app-footer">
        <p>{t('footer.privacy')}</p>
        <p>{t('footer.disclaimer')}</p>
      </footer>
    </DataProvider>
  );
}
