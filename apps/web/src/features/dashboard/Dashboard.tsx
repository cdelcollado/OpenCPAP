import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { compliance, type NightSummary } from '@opencpap/core';
import { Chart, axisStyle, uPlot, utcDate, type ChartColors } from '../../components/Chart';
import { Stat } from '../../components/Stat';
import { InfoTip } from '../../components/InfoTip';
import { dayAxisValues } from '../../components/axes';
import { formatHours, formatNightDate, formatNumber } from '../../format';
import { href } from '../../router';
import { useData } from '../../state';

type RangeKey = '7' | '30' | '90' | 'all';
const RANGES: RangeKey[] = ['7', '30', '90', 'all'];
const AHI_REFERENCE = 5;

const dayStamp = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;

/** Calendar days with data for a bar chart: gaps stay empty so missing nights are visible. */
function series(nights: NightSummary[], pick: (n: NightSummary) => number | undefined) {
  return [Float64Array.from(nights, (n) => dayStamp(n.date)), nights.map((n) => pick(n) ?? null)] as const;
}

const bars = (c: ChartColors, lang: string, label: string, color: string, unit: string, extra: Partial<uPlot.Options> = {}): Omit<uPlot.Options, 'width' | 'height'> => ({
  scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(max * 1.15, 1)] } },
  tzDate: utcDate,
  legend: { show: false },
  axes: [{ ...axisStyle(c), values: dayAxisValues(lang) }, { ...axisStyle(c), size: 50 }],
  series: [{}, { label: `${label} (${unit})`, stroke: color, fill: `${color}99`, width: 1, paths: uPlot.paths.bars!({ size: [0.7, 40], align: 0 }) }],
  ...extra,
});

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { nights, loading, demoOnly } = useData();
  const [range, setRange] = useState<RangeKey>('30');

  const lastDate = nights.at(-1)?.date;
  const visible = useMemo(() => (range === 'all' ? nights : nights.slice(-Number(range))), [nights, range]);
  const comp = useMemo(() => (lastDate ? compliance(nights, lastDate, 30) : undefined), [nights, lastDate]);
  const avg = useMemo(() => {
    const ahis = visible.filter((n) => n.ahi !== undefined);
    const hours = visible.reduce((a, n) => a + n.usageHours, 0);
    return { usage: visible.length ? hours / visible.length : undefined, ahi: ahis.length ? ahis.reduce((a, n) => a + n.ahi!, 0) / ahis.length : undefined };
  }, [visible]);

  const usageOpts = useCallback((c: ChartColors) => bars(c, lang, t('metric.usage'), c.c1, 'h'), [t, lang]);
  const ahiOpts = useCallback((c: ChartColors) => ({
    ...bars(c, lang, t('metric.ahi'), c.c2, '/h'),
    series: [{}, { label: t('metric.ahi'), stroke: c.c2, fill: `${c.c2}99`, width: 1, paths: uPlot.paths.bars!({ size: [0.7, 40], align: 0 }) },
      { label: `${AHI_REFERENCE}`, stroke: c.text, width: 1, dash: [6, 4], points: { show: false } }],
  }), [t, lang]);
  const leakOpts = useCallback((c: ChartColors) => ({
    scales: { x: { time: true }, y: { range: (_u: uPlot, _min: number, max: number) => [0, Math.max(max * 1.15, 10)] as [number, number] } },
    tzDate: utcDate, legend: { show: false }, axes: [{ ...axisStyle(c), values: dayAxisValues(lang) }, { ...axisStyle(c), size: 50 }],
    series: [{}, { label: t('metric.leakP95'), stroke: c.c3, width: 2, points: { size: 4 } }],
  }) as Omit<uPlot.Options, 'width' | 'height'>, [t, lang]);

  const usageData = useMemo(() => { const [x, y] = series(visible, (n) => n.usageHours); return [x, y] as uPlot.AlignedData; }, [visible]);
  const ahiData = useMemo(() => { const [x, y] = series(visible, (n) => n.ahi); return [x, y, y.map(() => AHI_REFERENCE)] as uPlot.AlignedData; }, [visible]);
  const leakData = useMemo(() => { const [x, y] = series(visible, (n) => n.leak?.p95); return [x, y] as uPlot.AlignedData; }, [visible]);

  if (loading) return <p>{t('common.loading')}</p>;
  if (nights.length === 0) {
    return (
      <div className="card stack">
        <h1>{t('dashboard.emptyTitle')}</h1>
        <p>{t('dashboard.emptyBody')}</p>
        <div><a className="btn" href={href.import}>{t('dashboard.goImport')}</a></div>
      </div>
    );
  }

  const last = nights.at(-1)!;
  const ahiTone = last.ahi === undefined ? undefined : last.ahi < 5 ? 'good' : last.ahi < 15 ? 'warn' : 'bad';
  const useTone = last.usageHours >= 4 ? 'good' : 'warn';

  return (
    <div className="stack">
      <div className="page-head"><h1>{t('dashboard.title')}</h1></div>
      {demoOnly && <div className="banner" role="note">{t('dashboard.demoBanner')}</div>}

      <section aria-labelledby="last-night">
        <h2 id="last-night">{t('dashboard.lastNight')}: <a href={href.night(last.date)}>{formatNightDate(last.date, lang)}</a></h2>
        <div className="grid">
          <Stat label={t('metric.usage')} value={formatHours(last.usageHours)} tone={useTone} explain={t('explain.usage')} />
          <Stat label={t('metric.ahi')} value={formatNumber(last.ahi, lang)} unit={t('metric.unitPerHour')} tone={ahiTone} explain={t('explain.ahi')} />
          <Stat label={t('metric.leakP95')} value={formatNumber(last.leak?.p95, lang)} unit={t('metric.unitLeak')} explain={t('explain.leak')} />
          <Stat label={t('metric.pressure')} value={last.pressure ? (last.pressure.min === last.pressure.max ? formatNumber(last.pressure.max, lang) : `${formatNumber(last.pressure.min, lang)}–${formatNumber(last.pressure.max, lang)}`) : '—'} unit={t('metric.unitPressure')} explain={t('explain.pressure')} />
        </div>
      </section>

      <section aria-labelledby="comp">
        <h2 id="comp">{t('dashboard.compliance')} <InfoTip text={t('explain.compliance')} /></h2>
        <div className="grid">
          {comp && (
            <Stat
              label={t('dashboard.complianceShort')} value={`${Math.round(comp.ratio * 100)} %`}
              tone={comp.meetsCommonRule ? 'good' : 'warn'}
              sub={<>{t('dashboard.complianceDetail', { ok: comp.compliantNights, total: comp.nights })}<br />{comp.meetsCommonRule ? t('dashboard.meets') : t('dashboard.notMeets')}</>}
            />
          )}
          <Stat label={t('dashboard.avgUsage')} value={avg.usage === undefined ? '—' : formatHours(avg.usage)} />
          <Stat label={t('dashboard.avgAhi')} value={formatNumber(avg.ahi, lang)} unit={t('metric.unitPerHour')} />
        </div>
      </section>

      <section aria-labelledby="trends" className="stack">
        <div className="page-head">
          <h2 id="trends">{t('dashboard.trends')}</h2>
          <fieldset className="seg" style={{ border: undefined, padding: 0, margin: 0 }}>
            <legend className="sr-only">{t('dashboard.range')}</legend>
            {RANGES.map((r) => (
              <label key={r}><input type="radio" name="range" value={r} checked={range === r} onChange={() => setRange(r)} />{t(r === 'all' ? 'dashboard.rangeAll' : `dashboard.range${r}`)}</label>
            ))}
          </fieldset>
        </div>
        <div className="card"><h3>{t('dashboard.usageChart')}</h3><Chart options={usageOpts} data={usageData} height={180} ariaLabel={t('dashboard.usageChart')} syncKey="dash" /></div>
        <div className="card"><h3>{t('dashboard.ahiChart')} <InfoTip text={t('explain.ahi')} /></h3><Chart options={ahiOpts} data={ahiData} height={180} ariaLabel={t('dashboard.ahiChart')} syncKey="dash" /></div>
        <div className="card"><h3>{t('dashboard.leakChart')} <InfoTip text={t('explain.leak')} /></h3><Chart options={leakOpts} data={leakData} height={180} ariaLabel={t('dashboard.leakChart')} syncKey="dash" /></div>
      </section>

      <section aria-labelledby="nights-table">
        <h2 id="nights-table">{t('dashboard.nightsTable')}</h2>
        <p className="muted">{t('dashboard.tableHint')}</p>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('common.date')}</th>
                <th scope="col" className="num">{t('metric.usage')}</th>
                <th scope="col" className="num">{t('metric.ahi')}</th>
                <th scope="col" className="num">{t('metric.leakP95')}</th>
                <th scope="col" className="num">{t('metric.pressure')}</th>
              </tr>
            </thead>
            <tbody>
              {[...visible].reverse().map((n) => (
                <tr key={n.date}>
                  <th scope="row"><a href={href.night(n.date)} aria-label={t('dashboard.viewNight', { date: formatNightDate(n.date, lang) })}>{formatNightDate(n.date, lang)}</a></th>
                  <td className="num">{formatHours(n.usageHours)}</td>
                  <td className="num">{formatNumber(n.ahi, lang)}</td>
                  <td className="num">{formatNumber(n.leak?.p95, lang)}</td>
                  <td className="num">{n.pressure ? formatNumber(n.pressure.median, lang) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p>{t('dashboard.noNightsInRange')}</p>}
        </div>
      </section>
    </div>
  );
}
