import { useTranslation } from 'react-i18next';
import { deviceFamily, leakReference, REFERENCE, type NightSummary } from '@opencpap/core';
import { Badge } from '../../components/Badge';
import { leakNote, RefBadge } from '../../components/RefBadge';
import { Delta } from '../../components/Delta';
import { InfoTip } from '../../components/InfoTip';
import { Sparkline } from '../../components/Sparkline';
import { formatHours, formatNightDate, formatNumber } from '../../format';
import { href } from '../../router';
import { ahiLevel, usageLevel, type Baseline } from './metrics';

/** One night at a glance (the latest by default): the AHI is the hero figure, the other measures are tiles with a change versus the recent average. */
export function Hero({ nights, last, base, heading }: { nights: NightSummary[]; last: NightSummary; base: Baseline; heading?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const recent = nights.slice(-30); // `nights` is the history up to and including `last`
  const events = (last.counts.obstructive ?? 0) + (last.counts.central ?? 0) + (last.counts.hypopnea ?? 0);
  const vs = t('hero.vsAvg', { n: base.nights });
  const pressure = last.pressure
    ? last.pressure.min === last.pressure.max ? formatNumber(last.pressure.max, lang) : `${formatNumber(last.pressure.min, lang)}–${formatNumber(last.pressure.max, lang)}`
    : '—';
  const family = deviceFamily(last.manufacturer);
  const leakRef = leakReference(last.leak?.p70, family);
  const ahiBadge = { good: t('status.ahiGood'), warn: t('status.ahiWarn'), bad: t('status.ahiBad'), neutral: '' }[ahiLevel(last.ahi)];

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="card hero-main">
        <div className="eyebrow">
          <h2 id="hero-title" style={{ margin: 0, fontSize: '1rem' }}>{heading ?? t('dashboard.lastNight')}</h2>
          {!heading && <a href={href.night(last.date)}>{formatNightDate(last.date, lang)}</a>}
        </div>
        <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>{t('metric.ahi')} <InfoTip text={t('explain.ahi')} /></div>
        <div className="hero-value" data-testid="hero-ahi">{formatNumber(last.ahi, lang)}<span className="unit">{t('metric.unitPerHour')}</span></div>
        <div className="row">
          {last.ahi !== undefined && <Badge level={ahiLevel(last.ahi)}>{ahiBadge}</Badge>}
          <Delta value={last.ahi} baseline={base.ahi} goodWhen="down" suffix={vs} lang={lang} />
        </div>
        <div className="sub">{t('reference.ahi', { normal: REFERENCE.ahi.normal })}</div>
        <Sparkline values={recent.map((n) => n.ahi)} color="var(--m-ahi)" label={t('hero.trendAhi')} />
      </div>

      <div className="card tiles">
        <div className="tile">
          <span className="label">{t('metric.usage')} <InfoTip text={t('explain.usage')} /></span>
          <span className="value">{formatHours(last.usageHours)}</span>
          <span className="row"><Badge level={usageLevel(last.usageHours)}>{last.usageHours >= 4 ? t('status.useGood') : t('status.useWarn')}</Badge></span>
          <Delta value={last.usageHours} baseline={base.usage} goodWhen="up" suffix={vs} lang={lang} />
          <span className="sub">{t('reference.usage', { hours: REFERENCE.usageHours })}</span>
          <Sparkline values={recent.map((n) => n.usageHours)} color="var(--m-usage)" label={t('hero.trendUsage')} />
        </div>
        <div className="tile">
          <span className="label">{t('metric.leakP95')} <InfoTip text={t('explain.leak')} /></span>
          <span className="value">{formatNumber(last.leak?.p95, lang)}<span className="unit">{t('metric.unitLeak')}</span></span>
          <span className="sub">{t('metric.leakMedian')}: {formatNumber(last.leak?.median, lang)}</span>
          <Delta value={last.leak?.p95} baseline={base.leak} suffix={vs} lang={lang} />
          {leakRef && <span className="row"><RefBadge state={leakRef} /></span>}
          <span className="sub">{t('reference.p70', { value: formatNumber(last.leak?.p70, lang) })}</span>
          <span className="sub">{leakNote(t, family)}</span>
          <Sparkline values={recent.map((n) => n.leak?.p95)} color="var(--m-leak)" label={t('hero.trendLeak')} />
        </div>
        <div className="tile">
          <span className="label">{t('metric.pressure')} <InfoTip text={t('explain.pressure')} /></span>
          <span className="value">{pressure}<span className="unit">{t('metric.unitPressure')}</span></span>
          {last.mode && <span className="sub">{t('metric.mode')}: {t(`mode.${last.mode}`, last.mode)}</span>}
        </div>
        <div className="tile">
          <span className="label">{t('metric.events')}</span>
          <span className="value">{events}</span>
          <span className="sub">{t('event.obstructive')}: {last.counts.obstructive ?? 0}</span>
          <span className="sub">{t('event.central')}: {last.counts.central ?? 0} · {t('event.hypopnea')}: {last.counts.hypopnea ?? 0}</span>
          <span className="sub">{t('event.rera')}: {last.counts.rera ?? 0} <InfoTip text={t('explain.rera')} /></span>
        </div>
      </div>
    </section>
  );
}
