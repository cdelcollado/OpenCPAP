import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { histogram, type NightSummary } from '@opencpap/core';
import { Histogram } from '../../components/Histogram';
import { formatNumber } from '../../format';

const USAGE_EDGES = [0, 2, 4, 5, 6, 7, 8, 9, 24];
const AHI_EDGES = [0, 0.5, 1, 2, 3, 5, 10, 15, 1000];

/** How the nights are spread over hours of use and AHI: shows the typical night and the tail at a glance. */
export function Distribution({ nights }: { nights: NightSummary[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const usage = useMemo(() => histogram(nights.map((n) => n.usageHours), USAGE_EDGES), [nights]);
  const ahi = useMemo(() => histogram(nights.map((n) => n.ahi), AHI_EDGES), [nights]);
  const labels = (edges: number[]) => edges.slice(0, -1).map((e, i) => (i === edges.length - 2 ? `${formatNumber(e, lang, e % 1 ? 1 : 0)}+` : `${formatNumber(e, lang, e % 1 ? 1 : 0)}–${formatNumber(edges[i + 1]!, lang, edges[i + 1]! % 1 ? 1 : 0)}`));
  return (
    <div className="two-col">
      <div className="card">
        <h3>{t('dashboard.usageHistogram')}</h3>
        <p className="caption muted">{t('dashboard.histNights', { count: usage.total })} · {t('metric.unitHours')}</p>
        <Histogram counts={usage.counts} labels={labels(USAGE_EDGES)} color="var(--m-usage)" label={t('dashboard.usageHistogram')} lang={lang} />
      </div>
      <div className="card">
        <h3>{t('dashboard.ahiHistogram')}</h3>
        <p className="caption muted">{t('dashboard.histNights', { count: ahi.total })} · {t('metric.unitPerHour')}</p>
        <Histogram counts={ahi.counts} labels={labels(AHI_EDGES)} color="var(--m-ahi)" label={t('dashboard.ahiHistogram')} lang={lang} />
      </div>
    </div>
  );
}
