import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { encodeSnapshot, makeSnapshot, SAFE_LINK_CHARS, shareUrl } from '../../share';
import type { ReportInput } from '../report/ReportDocument';

/** Creates a snapshot link for the report period currently shown (see docs/sharing.md). */
export function SharePanel({ input }: { input: ReportInput }) {
  const { t } = useTranslation();
  const [pass, setPass] = useState('');
  const [link, setLink] = useState('');
  const [encrypted, setEncrypted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setCopied(false);
    try {
      setLink(shareUrl(await encodeSnapshot(makeSnapshot(input), pass)));
      setEncrypted(pass.length > 0);
    } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* clipboard blocked: the field stays selectable */ }
  };

  return (
    <section className="card stack" aria-labelledby="share-title">
      <h2 id="share-title">{t('share.title')}</h2>
      <p className="muted">{t('share.intro')}</p>
      <label className="field" style={{ maxWidth: '24rem' }}>
        <span>{t('share.passphrase')}</span>
        <input type="password" value={pass} autoComplete="new-password" onChange={(e) => { setPass(e.target.value); setLink(''); }} />
        <small className="muted">{t('share.passphraseHint')}</small>
      </label>
      <div className="btn-row"><button className="btn secondary" type="button" disabled={busy} onClick={() => void create()}>{busy ? t('share.creating') : t('share.create')}</button></div>
      {link && (
        <div className="stack" aria-live="polite">
          <label className="field">
            <span>{t('share.link')}</span>
            <input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} data-testid="share-link" />
          </label>
          <div className="btn-row">
            <button className="btn secondary" type="button" onClick={() => void copy()}>{copied ? t('share.copied') : t('share.copy')}</button>
          </div>
          <p className={encrypted ? 'muted' : 'banner warn'}>{encrypted ? t('share.warnEncrypted') : t('share.warnPlain')}</p>
          {link.length > SAFE_LINK_CHARS && <p className="banner warn" role="alert">{t('share.tooLong', { chars: link.length })}</p>}
        </div>
      )}
      <p className="muted">{t('share.contents')}{input.patient ? ` ${t('share.includesName')}` : ''}</p>
    </section>
  );
}
