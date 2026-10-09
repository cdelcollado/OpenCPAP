import { useTranslation } from 'react-i18next';
import type { NightSummary } from '@opencpap/core';
import { IconWarn } from '../../components/icons';
import { formatHours, formatNightDate, formatNumber } from '../../format';
import { href } from '../../router';

/** The table twin of the charts: every plotted value, one row per night. */
export function NightsTable({ nights }: { nights: NightSummary[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (nights.length === 0) return <p>{t('dashboard.noNightsInRange')}</p>;
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{t('dashboard.nightsTable')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('common.date')}</th>
            <th scope="col" className="num">{t('metric.usage')}</th>
            <th scope="col" className="num">{t('metric.ahi')}</th>
            <th scope="col" className="num"><abbr title={`${t('event.obstructive')} · ${t('event.central')} · ${t('event.hypopnea')}`}>OA·CA·H</abbr></th>
            <th scope="col" className="num">{t('metric.leakP95')}</th>
            <th scope="col" className="num">{t('metric.pressure')}</th>
          </tr>
        </thead>
        <tbody>
          {[...nights].reverse().map((n) => (
            <tr key={n.date}>
              <th scope="row"><a href={href.night(n.date)} aria-label={t('dashboard.viewNight', { date: formatNightDate(n.date, lang) })}>{formatNightDate(n.date, lang)}</a></th>
              <td className="num">
                <span className="bar-cell">
                  {n.usageHours < 4 && <span className="badge badge-warn" style={{ padding: '0 0.3rem' }}><IconWarn /><span className="sr-only">{t('status.useWarn')}</span></span>}
                  <span className="mini-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (n.usageHours / 10) * 100)}%` }} /></span>
                  {formatHours(n.usageHours)}
                </span>
              </td>
              <td className="num">
                <span className="bar-cell">
                  {n.ahi !== undefined && n.ahi >= 5 && <span className="badge badge-warn" style={{ padding: '0 0.3rem' }}><IconWarn /><span className="sr-only">{t('status.ahiWarn')}</span></span>}
                  {formatNumber(n.ahi, lang)}
                </span>
              </td>
              <td className="num">{n.counts.obstructive ?? 0}·{n.counts.central ?? 0}·{n.counts.hypopnea ?? 0}</td>
              <td className="num">{formatNumber(n.leak?.p95, lang)}</td>
              <td className="num">{n.pressure ? (n.pressure.min === n.pressure.max ? formatNumber(n.pressure.max, lang) : `${formatNumber(n.pressure.min, lang, 0)}–${formatNumber(n.pressure.max, lang, 0)}`) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
