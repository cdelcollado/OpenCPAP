import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../../i18n';
import { applyTheme, getThemePreference, type ThemePreference } from '../../theme';
import { formatBytes } from '../../format';
import { repository } from '../../db/repository';
import { db } from '../../db/db';
import { exportBackup, importBackup, type BackupCounts } from '../../db/backup';
import { useData } from '../../state';
import { LlmSettings } from '../llm/LlmSettings';

declare const __APP_VERSION__: string;
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function Settings() {
  const { t, i18n } = useTranslation();
  const { devices, reload } = useData();
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
  const [message, setMessage] = useState('');
  const sessions = devices.reduce((a, d) => a + d.sessions, 0);
  const [withFlow, setWithFlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [persistMsg, setPersistMsg] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { void navigator.storage?.persisted?.().then(setPersisted); }, []);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await exportBackup(db, { includeWaveforms: withFlow, app: version });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opencpap-backup-${new Date().toISOString().slice(0, 10)}.opencpap`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setBackupMsg(null);
    } catch (e) { setBackupMsg({ kind: 'error', text: t('settings.importError', { message: e instanceof Error ? e.message : String(e) }) }); }
    finally { setBusy(false); }
  };

  const restore = async (file: File) => {
    setBusy(true);
    try {
      const c: BackupCounts = await importBackup(db, file);
      await reload();
      setBackupMsg({ kind: 'ok', text: `${t('settings.importDone', { sessions: c.sessions, journal: c.journal, equipment: c.equipment })}${c.skipped ? ` ${t('settings.importSkipped', { count: c.skipped })}` : ''}` });
    } catch (e) { setBackupMsg({ kind: 'error', text: t('settings.importError', { message: e instanceof Error ? e.message : String(e) }) }); }
    finally { setBusy(false); }
  };

  const requestPersist = async () => {
    if (!navigator.storage?.persist) { setPersistMsg(t('settings.persistUnsupported')); return; }
    const ok = await navigator.storage.persist();
    setPersisted(ok);
    setPersistMsg(ok ? t('settings.persistYes') : t('settings.persistDenied'));
  };

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => e.usage !== undefined && e.quota !== undefined && setStorage({ used: e.usage, quota: e.quota }));
  }, [devices]);

  return (
    <div className="stack">
      <h1>{t('settings.title')}</h1>

      <section className="card stack settings-look" aria-labelledby="s-look">
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

      <section className="card stack" aria-labelledby="s-backup">
        <h2 id="s-backup">{t('settings.backup')}</h2>
        <p>{t('settings.backupBody')} <b>{t('settings.backupWarning')}</b></p>
        <label className="row"><input type="checkbox" checked={withFlow} onChange={(e) => setWithFlow(e.target.checked)} /> {t('settings.includeWaveforms')}</label>
        <div className="btn-row">
          <button className="btn" type="button" disabled={busy} onClick={() => void download()}>{busy ? t('settings.exporting') : t('settings.exportButton')}</button>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{t('settings.importButton')}</button>
          <input ref={fileInput} type="file" hidden accept=".opencpap,.gz,.ndjson,application/gzip,application/x-ndjson" data-testid="backup-input"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f); }} />
        </div>
        <div role="status" aria-live="polite">{backupMsg && <p className={backupMsg.kind === 'ok' ? 'good' : 'bad'}>{backupMsg.text}</p>}</div>
        <h3>{t('settings.persist')}</h3>
        <p className="muted">{t('settings.persistBody')} {persisted === null ? '' : persisted ? t('settings.persistYes') : t('settings.persistNo')}</p>
        <div><button className="btn secondary" type="button" disabled={persisted === true} onClick={() => void requestPersist()}>{t('settings.persistButton')}</button></div>
        <p role="status" className="muted">{persistMsg}</p>
      </section>

      <LlmSettings />

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
