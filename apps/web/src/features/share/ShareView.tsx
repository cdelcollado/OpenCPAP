import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { href } from '../../router';
import { decodeSnapshot, isEncrypted, ShareError, snapshotToReport, type Snapshot } from '../../share';
import { ReportDocument } from '../report/ReportDocument';

/** Read-only view of a snapshot link (`#/shared/<payload>`). Nothing is read from or written to local storage. */
export function ShareView({ payload }: { payload: string }) {
  const { t, i18n } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState<string>();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const needsPass = useMemo(() => isEncrypted(payload), [payload]);

  const open = async (passphrase: string) => {
    setBusy(true);
    setError(undefined);
    try { setSnapshot(await decodeSnapshot(payload, passphrase)); }
    catch (e) { setError(e instanceof ShareError ? `shared.err_${e.code}` : 'shared.err_bad-link'); }
    finally { setBusy(false); }
  };

  useEffect(() => { setSnapshot(undefined); setPass(''); setError(undefined); if (!needsPass) void open(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [payload]);

  if (!snapshot) {
    return (
      <div className="stack">
        <div className="page-head"><div><h1>{t('shared.title')}</h1><p className="sub">{t('shared.intro')}</p></div></div>
        {needsPass && (
          <form className="card stack" onSubmit={(e) => { e.preventDefault(); void open(pass); }}>
            <label className="field" style={{ maxWidth: '24rem' }}>
              <span>{t('shared.passphrase')}</span>
              <input type="password" value={pass} autoComplete="off" onChange={(e) => setPass(e.target.value)} aria-describedby={error ? 'shared-err' : undefined} />
            </label>
            <div className="btn-row"><button className="btn" type="submit" disabled={busy || !pass}>{t('shared.open')}</button></div>
          </form>
        )}
        {busy && !needsPass && <p className="muted" role="status">{t('common.loading')}</p>}
        {error && <div className="banner warn" role="alert" id="shared-err">{t(error)}</div>}
        <p><a href={href.dashboard}>{t('shared.openApp')}</a></p>
      </div>
    );
  }

  const created = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(`${snapshot.created}T12:00:00`));
  return (
    <div className="stack">
      <div className="no-print stack">
        <div className="banner" role="note">{t('shared.banner', { date: created })}</div>
        <div className="btn-row">
          <button className="btn" type="button" onClick={() => window.print()}>{t('report.print')}</button>
          <a className="btn secondary" href={href.dashboard}>{t('shared.openApp')}</a>
        </div>
      </div>
      <ReportDocument r={snapshotToReport(snapshot, created)} />
    </div>
  );
}
