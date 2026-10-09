import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../../i18n';
import { applyTheme, getThemePreference, type ThemePreference } from '../../theme';
import { formatBytes } from '../../format';
import { repository } from '../../db/repository';
import { useData } from '../../state';

declare const __APP_VERSION__: string;
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function Settings() {
  const { t, i18n } = useTranslation();
  const { devices, reload } = useData();
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
  const [message, setMessage] = useState('');
  const sessions = devices.reduce((a, d) => a + d.sessions, 0);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => e.usage !== undefined && e.quota !== undefined && setStorage({ used: e.usage, quota: e.quota }));
  }, [devices]);

  return (
    <div className="stack">
      <h1>{t('settings.title')}</h1>

      <section className="card stack" aria-labelledby="s-look">
        <h2 id="s-look">{t('settings.language')} / {t('settings.theme')}</h2>
        <label>{t('settings.language')}{' '}
          <select value={i18n.language} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label>{t('settings.theme')}{' '}
          <select value={theme} onChange={(e) => { const v = e.target.value as ThemePreference; setTheme(v); applyTheme(v); }}>
            <option value="system">{t('settings.themeSystem')}</option>
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
          </select>
        </label>
      </section>

      <section className="card stack" aria-labelledby="s-data">
        <h2 id="s-data">{t('settings.data')}</h2>
        <p>{t('settings.storedSessions', { sessions })}</p>
        {storage && <p className="muted">{t('settings.storage', { used: formatBytes(storage.used, i18n.language), quota: formatBytes(storage.quota, i18n.language) })}</p>}
        {devices.length > 0 && (
          <div>
            <h3>{t('settings.devices')}</h3>
            <ul>
              {devices.map((d) => (
                <li key={d.deviceId}>
                  {d.manufacturer} {d.model} — {d.sessions}{' '}
                  <button className="btn danger" type="button" onClick={async () => {
                    if (!window.confirm(t('settings.deleteAllConfirm'))) return;
                    await repository.deleteDevice(d.deviceId); await reload(); setMessage(t('settings.deleted'));
                  }}>{t('settings.deleteDevice', { name: d.model })}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <button className="btn danger" type="button" disabled={sessions === 0} onClick={async () => {
            if (!window.confirm(t('settings.deleteAllConfirm'))) return;
            await repository.clearAll(); await reload(); setMessage(t('settings.deleted'));
          }}>{t('settings.deleteAll')}</button>
        </div>
        <p role="status">{message}</p>
      </section>

      <section className="card stack" aria-labelledby="s-about">
        <h2 id="s-about">{t('settings.privacyTitle')}</h2>
        <p>{t('settings.privacyBody')}</p>
        <h2 id="s-about2">{t('settings.about')}</h2>
        <p>{t('settings.version', { version })} · {t('settings.license')}</p>
        <p className="muted">{t('footer.disclaimer')}</p>
      </section>
    </div>
  );
}
