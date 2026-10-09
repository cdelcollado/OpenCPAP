import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { Dashboard } from './features/dashboard/Dashboard';
import { ImportPanel } from './features/import/ImportPanel';
import { NightView } from './features/night/NightView';
import { Settings } from './features/settings/Settings';
import { useRoute } from './router';
import { DataProvider, useData } from './state';

function Main() {
  const route = useRoute();
  const { loading } = useData();
  return (
    <main id="main" tabIndex={-1} aria-busy={loading}>
      {route.name === 'dashboard' && <Dashboard />}
      {route.name === 'import' && <ImportPanel />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'night' && <NightView date={route.date} />}
    </main>
  );
}

export function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const current = route.name === 'night' ? 'dashboard' : route.name;
  return (
    <DataProvider>
      <a className="skip" href="#main">{t('app.skip')}</a>
      <Header current={current} />
      <Main />
      <footer className="app-footer">
        <p>{t('footer.privacy')}</p>
        <p>{t('footer.disclaimer')}</p>
      </footer>
    </DataProvider>
  );
}
