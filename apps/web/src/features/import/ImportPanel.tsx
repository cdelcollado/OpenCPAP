import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardSource } from '@opencpap/browser';
import { useData } from '../../state';
import { href } from '../../router';
import { OximetryImport } from '../oximetry/OximetryImport';
import { filesFromDrop, importCardToDb, loadDemoData, removeDemoData } from './importService';

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; detected?: string; done: number; total: number }
  | { kind: 'done'; count: number }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string; unsupported: boolean };

export function ImportPanel() {
  const { t } = useTranslation();
  const { reload, demoOnly, devices } = useData();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const hasDirectoryPicker = typeof window.showDirectoryPicker === 'function';
  const hasDemo = devices.some((d) => d.deviceId.startsWith('Demo:'));

  async function run(source: CardSource) {
    const ac = new AbortController();
    abort.current = ac;
    setStatus({ kind: 'working', done: 0, total: 0 });
    try {
      const count = await importCardToDb(source, {
        signal: ac.signal,
        onDetected: (d) => setStatus((s) => (s.kind === 'working' ? { ...s, detected: t('import.detected', d) } : s)),
        onProgress: (done, total) => setStatus((s) => (s.kind === 'working' ? { ...s, done, total } : s)),
      });
      await reload();
      setStatus(ac.signal.aborted ? { kind: 'cancelled' } : { kind: 'done', count });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setStatus({ kind: 'error', unsupported: err.name === 'UnsupportedCardError', message: err.message });
    } finally {
      abort.current = null;
    }
  }

  async function pickDirectory() {
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'read' });
      await run({ kind: 'directory', handle: handle as never });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setStatus({ kind: 'error', unsupported: false, message: String(e) });
    }
  }

  async function onDrop(ev: React.DragEvent) {
    ev.preventDefault();
    setOver(false);
    const source = await filesFromDrop(ev.dataTransfer);
    if (source) await run(source);
    else setStatus({ kind: 'error', unsupported: false, message: t('import.errorDnd') });
  }

  const working = status.kind === 'working';
  return (
    <div className="stack">
      <h1>{t('import.title')}</h1>
      <div className="card stack">
        <ol className="steps">
          <li><div><strong>{t('import.step1Title')}</strong><p className="muted">{t('import.step1')}</p></div></li>
          <li><div><strong>{t('import.step2Title')}</strong><p className="muted">{t('import.step2')}</p></div></li>
          <li><div><strong>{t('import.step3Title')}</strong><p className="muted">{t('import.step3')}</p></div></li>
        </ol>
        <p className="muted">{t('import.privacy')}</p>
        <div className="btn-row">
          {hasDirectoryPicker && (
            <button className="btn large" type="button" disabled={working} onClick={() => void pickDirectory()}>{t('import.chooseFolder')}</button>
          )}
          <button className={hasDirectoryPicker ? 'btn secondary' : 'btn large'} type="button" disabled={working} onClick={() => folderInput.current?.click()}>
            {hasDirectoryPicker ? t('import.chooseFolderFallback') : t('import.chooseFolder')}
          </button>
          <button className="btn secondary" type="button" disabled={working} onClick={() => zipInput.current?.click()}>{t('import.chooseZip')}</button>
          {/* hidden native inputs; folder selection is non-standard but supported by all major browsers */}
          <input
            ref={folderInput} type="file" hidden data-testid="folder-input"
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void run({ kind: 'files', files }); }}
          />
          <input
            ref={zipInput} type="file" accept=".zip,application/zip" hidden data-testid="zip-input"
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run({ kind: 'zip', file }); }}
          />
        </div>
        <p className="muted">{t('import.folderHint')}</p>
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => void onDrop(e)}
        >
          {t('import.drop')}
        </div>
      </div>

      <div aria-live="polite" role="status">
        {status.kind === 'working' && (
          <div className="card stack">
            {status.detected && <p>{status.detected}</p>}
            <label>
              <span>{t('import.progress', { done: status.done, total: status.total })}</span>
              <progress max={Math.max(status.total, 1)} value={status.done} />
            </label>
            <div><button className="btn secondary" type="button" onClick={() => abort.current?.abort()}>{t('import.cancelImport')}</button></div>
          </div>
        )}
        {status.kind === 'done' && (
          <div className="card stack"><p className="good">{t('import.imported', { count: status.count })}</p><a className="btn" href={href.dashboard}>{t('import.viewDashboard')}</a></div>
        )}
        {status.kind === 'cancelled' && <div className="banner warn">{t('import.cancelled')}</div>}
        {status.kind === 'error' && (
          <div className="banner warn" role="alert">{status.unsupported ? t('import.errorUnsupported') : t('import.errorGeneric', { message: status.message })}</div>
        )}
      </div>

      <OximetryImport />

      <div className="card stack">
        <h2 style={{ margin: 0 }}>{t('import.demoTitle')}</h2>
        <p>{t('import.demoBody')}</p>
        <div className="btn-row">
          <button className="btn secondary" type="button" disabled={working} onClick={async () => { await loadDemoData(); await reload(); setStatus({ kind: 'done', count: 0 }); window.location.hash = href.dashboard; }}>{t('import.demoButton')}</button>
          {hasDemo && <button className="btn danger" type="button" disabled={working} onClick={async () => { await removeDemoData(); await reload(); }}>{t('import.demoRemove')}</button>}
        </div>
        {demoOnly && <p className="muted">{t('import.demoLoaded')}</p>}
      </div>
    </div>
  );
}
