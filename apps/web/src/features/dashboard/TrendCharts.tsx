import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { rollingMean, type ChangeEvent, type NightSummary } from '@opencpap/core';
import { Chart, axisStyle, uPlot, utcDate, type ChartColors } from '../../components/Chart';
import { dayAxisValues } from '../../components/axes';
import { InfoTip } from '../../components/InfoTip';
import { markersPlugin } from '../../components/annotations';
import { describeChanges } from '../changes/format';
import { tooltipPlugin } from '../../components/chartTooltip';
import { formatHours, formatNightDate, formatNumber } from '../../format';
import { href } from '../../router';

const AHI_REFERENCE = 5;
const dayStamp = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;
const dateOf = (x: number) => new Date(x * 1000).toISOString().slice(0, 10);

type Kind = 'usage' | 'ahi' | 'leak';

/** Three single-measure charts. Each measure keeps its own colour everywhere in the app. */
export function TrendCharts({ nights, changes = [], all = nights, rolling = false }: { nights: NightSummary[]; changes?: ChangeEvent[]; /** every night, so the rolling mean is warmed up before the visible range */ all?: NightSummary[]; rolling?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const inView = useMemo(() => {
    const first = nights[0]?.date, last = nights.at(-1)?.date;
    return first && last ? changes.filter((c) => c.date >= first && c.date <= last) : [];
  }, [nights, changes]);
  const byDate = useMemo(() => new Map(inView.map((c) => [c.date, c])), [inView]);

  const xs = useMemo(() => Float64Array.from(nights, (n) => dayStamp(n.date)), [nights]);
  const roll = useMemo(() => {
    const byDate = new Map(all.map((n, i) => [n.date, i]));
    const u = rollingMean(all.map((n) => n.usageHours), 7), a = rollingMean(all.map((n) => n.ahi), 7);
    return { usage: nights.map((n) => u[byDate.get(n.date)!] ?? null), ahi: nights.map((n) => a[byDate.get(n.date)!] ?? null) };
  }, [all, nights]);
  const data = useMemo(() => ({
    usage: [xs, nights.map((n) => n.usageHours), ...(rolling ? [roll.usage] : [])] as uPlot.AlignedData,
    ahi: [xs, nights.map((n) => n.ahi ?? null), nights.map(() => AHI_REFERENCE), ...(rolling ? [roll.ahi] : [])] as uPlot.AlignedData,
    leak: [xs, nights.map((n) => n.leak?.p95 ?? null)] as uPlot.AlignedData,
  }), [xs, nights, roll, rolling]);

  const build = useCallback((kind: Kind) => (c: ChartColors): Omit<uPlot.Options, 'width' | 'height'> => {
    const color = kind === 'usage' ? c.usage : kind === 'ahi' ? c.ahi : c.leak;
    const unit = kind === 'usage' ? t('metric.unitHours') : kind === 'ahi' ? t('metric.unitPerHour') : t('metric.unitLeak');
    const label = kind === 'usage' ? t('metric.usage') : kind === 'ahi' ? t('metric.ahi') : t('metric.leakP95');
    const fmt = (v: number) => (kind === 'usage' ? formatHours(v) : `${formatNumber(v, lang)} ${unit}`);
    const bars = uPlot.paths.bars!({ size: [0.6, 24], radius: 0.25 });
    return {
      tzDate: utcDate,
      legend: { show: false },
      padding: [8, 12, 0, 0],
      scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, kind === 'leak' ? Math.max(max * 1.15, 10) : Math.max(max * 1.15, kind === 'ahi' ? AHI_REFERENCE * 1.3 : 10)] } },
      axes: [{ ...axisStyle(c), values: dayAxisValues(lang) }, { ...axisStyle(c), size: 46 }],
      series: [
        {},
        kind === 'leak'
          ? { label, stroke: color, width: 2, spanGaps: false, points: { show: true, size: 8, fill: color, stroke: c.surface, width: 2 } }
          : { label, stroke: color, fill: color, width: 0, paths: bars, points: { show: false } },
        ...(kind === 'ahi' ? [{ label: String(AHI_REFERENCE), stroke: c.muted, width: 1, dash: [5, 4], points: { show: false } }] : []),
        ...(rolling && kind !== 'leak' ? [{ label: t('dashboard.rollingLabel'), stroke: c.text, width: 2, spanGaps: false, points: { show: false } }] : []),
      ],
      plugins: [
        tooltipPlugin({
          title: (u, i) => formatNightDate(dateOf(u.data[0][i]!), lang),
          rows: (u, i) => {
            const v = u.data[1]?.[i];
            const change = byDate.get(dateOf(u.data[0][i]!));
            return [
              ...(v == null ? [] : [{ label, value: fmt(v), color }]),
              ...(rolling && kind !== 'leak' && u.data[kind === 'ahi' ? 3 : 2]?.[i] != null ? [{ label: t('dashboard.rollingLabel'), value: fmt(u.data[kind === 'ahi' ? 3 : 2]![i]!), color: c.text }] : []),
              ...(change ? [{ label: describeChanges(change, t, lang), value: t('changes.marker'), color: c.muted }] : []),
            ];
          },
        }),
        markersPlugin(inView.map((c) => dayStamp(c.date) - 43200), c.muted),
      ],
    };
  }, [t, lang, byDate, inView, rolling]);

  const usageOpts = useMemo(() => build('usage'), [build]);
  const ahiOpts = useMemo(() => build('ahi'), [build]);
  const leakOpts = useMemo(() => build('leak'), [build]);
  const open = (i: number) => { const n = nights[i]; if (n) window.location.hash = href.night(n.date); };

  return (
    <div className="stack">
      <div className="card chart-card">
        <h3>{t('dashboard.usageChart')}</h3>
        <p className="caption">{t('dashboard.chartHint')}{inView.length > 0 && ` ${t('dashboard.markersHint')}`}</p>
        <Chart options={usageOpts} data={data.usage} height={190} ariaLabel={t('dashboard.usageChart')} zoom={false} onPointClick={open} />
      </div>
      <div className="card chart-card">
        <h3>{t('dashboard.ahiChart')} <InfoTip text={t('explain.ahi')} /></h3>
        <p className="caption">{t('dashboard.ahiRef', { value: AHI_REFERENCE })}</p>
        <Chart options={ahiOpts} data={data.ahi} height={190} ariaLabel={t('dashboard.ahiChart')} zoom={false} onPointClick={open} />
      </div>
      <div className="card chart-card">
        <h3>{t('dashboard.leakChart')} <InfoTip text={t('explain.leak')} /></h3>
        <Chart options={leakOpts} data={data.leak} height={190} ariaLabel={t('dashboard.leakChart')} zoom={false} onPointClick={open} />
      </div>
    </div>
  );
}
