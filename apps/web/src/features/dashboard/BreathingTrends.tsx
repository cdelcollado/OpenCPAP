import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NightSummary } from '@opencpap/core';
import { Chart, axisStyle, uPlot, utcDate, type ChartColors } from '../../components/Chart';
import { dayAxisValues } from '../../components/axes';
import { InfoTip } from '../../components/InfoTip';
import { tooltipPlugin } from '../../components/chartTooltip';
import { formatNightDate, formatNumber } from '../../format';
import { href } from '../../router';

const dayStamp = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;
const dateOf = (x: number) => new Date(x * 1000).toISOString().slice(0, 10);

/** Per-night trends of the experimental breath analysis, for nights that have detailed flow data. */
export function BreathingTrends({ nights }: { nights: NightSummary[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const withB = useMemo(() => nights.filter((n) => n.breathing), [nights]);
  const xs = useMemo(() => Float64Array.from(withB, (n) => dayStamp(n.date)), [withB]);
  const flat = useMemo(() => [xs, withB.map((n) => (n.breathing!.flatShare ?? 0) * 100)] as uPlot.AlignedData, [xs, withB]);
  const rate = useMemo(() => [xs, withB.map((n) => n.breathing!.rate ?? null)] as uPlot.AlignedData, [xs, withB]);

  const build = useCallback((kind: 'flat' | 'rate') => (c: ChartColors): Omit<uPlot.Options, 'width' | 'height'> => {
    const color = kind === 'flat' ? c.flat : c.rate;
    const label = kind === 'flat' ? t('breathing.flat') : t('breathing.rate');
    const unit = kind === 'flat' ? '%' : t('metric.unitPerMin');
    return {
      tzDate: utcDate, legend: { show: false }, padding: [8, 12, 0, 0],
      scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, kind === 'flat' ? Math.max(max * 1.2, 20) : Math.max(max * 1.2, 25)] } },
      axes: [{ ...axisStyle(c), values: dayAxisValues(lang) }, { ...axisStyle(c), size: 46 }],
      series: [{}, { label, stroke: color, width: 2, spanGaps: false, points: { show: true, size: 7, fill: color, stroke: c.surface, width: 2 } }],
      plugins: [tooltipPlugin({
        title: (u, i) => formatNightDate(dateOf(u.data[0][i]!), lang),
        rows: (u, i) => (u.data[1]?.[i] == null ? [] : [{ label, value: `${formatNumber(u.data[1][i]!, lang, kind === 'flat' ? 0 : 1)} ${unit}`, color }]),
      })],
    };
  }, [t, lang]);
  const flatOpts = useMemo(() => build('flat'), [build]);
  const rateOpts = useMemo(() => build('rate'), [build]);
  const open = (i: number) => { const n = withB[i]; if (n) window.location.hash = href.night(n.date); };

  if (withB.length < 2) return <div className="card muted">{t('dashboard.breathingNone')}</div>;
  return (
    <div className="stack">
      <p className="muted">{t('dashboard.breathingNote')}</p>
      <div className="two-col">
        <div className="card chart-card">
          <h3>{t('dashboard.flatChart')} <InfoTip text={t('explain.flat')} /></h3>
          <Chart options={flatOpts} data={flat} height={170} ariaLabel={t('dashboard.flatChart')} zoom={false} onPointClick={open} />
        </div>
        <div className="card chart-card">
          <h3>{t('dashboard.rateChart')} <InfoTip text={t('explain.rate')} /></h3>
          <Chart options={rateOpts} data={rate} height={170} ariaLabel={t('dashboard.rateChart')} zoom={false} onPointClick={open} />
        </div>
      </div>
    </div>
  );
}
