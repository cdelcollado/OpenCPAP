import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { ComparePage } from './features/compare/ComparePage';
import { Dashboard } from './features/dashboard/Dashboard';
import { EquipmentPage } from './features/equipment/EquipmentPage';
import { ImportPanel } from './features/import/ImportPanel';
import { NightView } from './features/night/NightView';
import { ReportPage } from './features/report/ReportPage';
import { ShareView } from './features/share/ShareView';
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
      {route.name === 'compare' && <ComparePage />}
      {route.name === 'equipment' && <EquipmentPage />}
      {route.name === 'report' && <ReportPage />}
      {route.name === 'shared' && <ShareView payload={route.payload} />}
    </main>
  );
}

export function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const current = route.name === 'night' ? 'dashboard' : route.name === 'shared' ? null : route.name;
  return (
    <DataProvider>
      <a className="skip" href="#main">{t('app.skip')}</a>
      <Header current={current} />
      <Main />
      <footer className="app-footer">
        <p>{t('footer.privacy')}</p>
        <p>{t('footer.disclaimer')}</p>
        <p><a href="https://github.com/cdelcollado/OpenCPAP" target="_blank" rel="noopener noreferrer">{t('footer.source')}</a></p>
      </footer>
    </DataProvider>
  );
}
