import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { aroundChange, isMajor, type ChangeEvent } from '@opencpap/core';
import { formatNightDate } from '../../format';
import { href } from '../../router';
import { settingLabel, settingValue } from './format';

/** Nights on which a therapy setting changed, newest first, each linking to a before/after comparison. */
export function ChangesPanel({ changes }: { changes: ChangeEvent[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [all, setAll] = useState(false);
  const sorted = [...changes].reverse();
  const shown = all ? sorted : sorted.slice(0, 5);
  return (
    <section className="card stack" aria-labelledby="changes-title">
      <h2 id="changes-title" className="sr-only">{t('changes.title')}</h2>
      <p className="muted">{t('changes.hint')}</p>
      {sorted.length === 0 ? <p>{t('changes.empty')}</p> : (
        <ul className="change-list">
          {shown.map((c) => {
            const { a, b } = aroundChange(c.date, 30);
            return (
              <li key={c.date}>
                <a href={href.night(c.date)}>{formatNightDate(c.date, lang)}</a>
                <span className="what">
                  {c.changes.map((x) => (
                    <span key={x.key} className={isMajor(x.key) ? 'major' : 'minor'}>
                      {settingLabel(x.key, t)}: {settingValue(x.key, x.from, t, lang)} → <b>{settingValue(x.key, x.to, t, lang)}</b>
                    </span>
                  ))}
                </span>
                <a className="btn secondary small" href={href.compare(a, b)}>{t('changes.compare')}</a>
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > 5 && <div><button className="btn secondary" type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? t('night.hideTable') : `${t('night.showTable')} (${sorted.length})`}</button></div>}
    </section>
  );
}
