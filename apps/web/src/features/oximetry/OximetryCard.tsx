import { useTranslation } from 'react-i18next';
import type { OximetryStats } from '@opencpap/core';
import { InfoTip } from '../../components/InfoTip';
import { repository } from '../../db/repository';
import { formatNumber } from '../../format';
import { useData } from '../../state';

/** Statistics of the night's pulse-oximeter recording (the curves are in the night detail). */
export function OximetryCard({ date, stats, source }: { date: string; stats: OximetryStats; source: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { reload } = useData();
  const n = (v: number | undefined, d = 0) => formatNumber(v, lang, d);
  return (
    <section className="card stack" aria-labelledby="oxi-title" data-testid="oximetry">
      <h2 id="oxi-title" style={{ margin: 0 }}>{t('oximetry.title')}</h2>
      <div className="tiles four">
        <div className="tile"><span className="label">{t('oximetry.mean')} <InfoTip text={t('explain.spo2')} /></span><span className="value">{n(stats.spo2Mean, 1)}<span className="unit">%</span></span></div>
        <div className="tile"><span className="label">{t('oximetry.min')}</span><span className="value">{n(stats.spo2Min)}<span className="unit">%</span></span></div>
        <div className="tile"><span className="label">{t('oximetry.t90')} <InfoTip text={t('explain.t90')} /></span><span className="value">{n(stats.t90, 1)}<span className="unit">%</span></span></div>
        <div className="tile"><span className="label">{t('oximetry.odi3')} <InfoTip text={t('explain.odi')} /></span><span className="value">{n(stats.odi3, 1)}<span className="unit">{t('oximetry.perHour')}</span></span><span className="sub">{t('oximetry.odi4')}: {n(stats.odi4, 1)}{t('oximetry.perHour')}</span></div>
      </div>
      <p className="muted">{t('oximetry.pulseRange')}: <b className="num">{n(stats.pulseMin)}–{n(stats.pulseMax)}</b> {t('metric.unitPerMin')} (Ø <span className="num">{n(stats.pulseMean)}</span>) · {t('oximetry.hours', { hours: n(stats.seconds / 3600, 1) })} · {t('oximetry.source', { source })}</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('oximetry.note')}</p>
      <div><button className="btn danger" type="button" onClick={async () => { await repository.deleteOximetry(date); await reload(); }}>{t('oximetry.remove')}</button></div>
    </section>
  );
}
