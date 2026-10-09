import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n';
import { href } from '../router';
import { applyTheme, getThemePreference, type ThemePreference } from '../theme';
import { IconAuto, IconMoon, IconSun } from './icons';

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };

type Page = 'dashboard' | 'compare' | 'equipment' | 'report' | 'import' | 'settings';

export function Header({ current }: { current: Page | null }) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const label = t(theme === 'system' ? 'settings.themeSystem' : theme === 'light' ? 'settings.themeLight' : 'settings.themeDark');
  const Icon = theme === 'system' ? IconAuto : theme === 'light' ? IconSun : IconMoon;
  const TARGET: Record<Page, string> = { dashboard: href.dashboard, compare: href.compare(), equipment: href.equipment, report: href.report(), import: href.import, settings: href.settings };
  const link = (name: Page) => ({ href: TARGET[name], 'aria-current': current === name ? ('page' as const) : undefined });

  return (
    <header className="app-header">
      <div className="inner">
        <a className="brand" href={href.dashboard}><img src="/icon.svg" alt="" />{t('app.name')}</a>
        <nav aria-label={t('nav.label')}>
          <ul>
            <li><a {...link('dashboard')}>{t('nav.dashboard')}</a></li>
            <li><a {...link('compare')}>{t('nav.compare')}</a></li>
            <li><a {...link('equipment')}>{t('nav.equipment')}</a></li>
            <li><a {...link('report')}>{t('nav.report')}</a></li>
            <li><a {...link('import')}>{t('nav.import')}</a></li>
            <li><a {...link('settings')}>{t('nav.settings')}</a></li>
          </ul>
        </nav>
        <div className="header-tools">
          <label className="sr-only" htmlFor="hdr-lang">{t('settings.language')}</label>
          <select id="hdr-lang" value={i18n.language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button className="icon-btn" type="button" title={`${t('settings.theme')}: ${label}`} aria-label={`${t('settings.theme')}: ${label}`}
            onClick={() => { const n = NEXT[theme]; setTheme(n); applyTheme(n); }}>
            <Icon />
          </button>
        </div>
      </div>
    </header>
  );
}
