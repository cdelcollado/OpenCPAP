import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventType, SessionLite, Waveform } from '@opencpap/core';
import { Chart, axisStyle, uPlot, utcDate, type ChartColors, type XRange } from '../../components/Chart';
import { InfoTip } from '../../components/InfoTip';
import { Stat } from '../../components/Stat';
import { clockAxisValues } from '../../components/axes';
import { repository } from '../../db/repository';
import { formatClock, formatHours, formatNightDate, formatNumber } from '../../format';
import { href } from '../../router';
import { useData } from '../../state';
import { buildNightData, type NightChartData } from './nightData';
import { Timeline } from './Timeline';

const SYNC = 'night';

function useNightData(date: string) {
  const [state, setState] = useState<{ loading: boolean; sessions: SessionLite[]; waveforms: Waveform[] }>({ loading: true, sessions: [], waveforms: [] });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void repository.night(date).then((r) => { if (!cancelled) setState({ loading: false, sessions: r.sessions, waveforms: r.waveforms }); });
    return () => { cancelled = true; };
  }, [date]);
  const chart = useMemo(() => buildNightData(state.sessions, state.waveforms), [state.sessions, state.waveforms]);
  return { ...state, chart };
}

function lineOptions(c: ChartColors, o: { lang: string; color: string; label: string; maskOff: [number, number][]; step?: boolean; bars?: boolean; yMin?: number }): Omit<uPlot.Options, 'width' | 'height'> {
  return {
    tzDate: utcDate,
    legend: { show: false },
    scales: { x: { time: true }, y: { range: (_u, min, max) => [o.yMin ?? Math.min(min, 0), Math.max(max * 1.1, (o.yMin ?? 0) + 1)] } },
    axes: [{ ...axisStyle(c), values: clockAxisValues(o.lang) }, { ...axisStyle(c), size: 52 }],
    series: [{}, {
      label: o.label, stroke: o.color, width: o.bars ? 1 : 1.5, fill: o.bars ? `${o.color}99` : undefined, spanGaps: false, points: { show: false },
      paths: o.step ? uPlot.paths.stepped!({ align: 1 }) : o.bars ? uPlot.paths.bars!({ size: [0.9, 6] }) : undefined,
    }],
    hooks: {
      // shade the periods when the mask was off
      drawClear: [(u) => {
        const { ctx, bbox } = u;
        ctx.save();
        ctx.fillStyle = c.band;
        for (const [a, b] of o.maskOff) {
          const x0 = u.valToPos(a, 'x', true), x1 = u.valToPos(b, 'x', true);
          ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height);
        }
        ctx.restore();
      }],
    },
  };
}

export function NightView({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { nights } = useData();
  const summary = nights.find((n) => n.date === date);
  const { loading, chart, sessions } = useNightData(date);
  const [range, setRange] = useState<XRange | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => setRange(null), [date]);

  const dates = useMemo(() => nights.map((n) => n.date), [nights]);
  const idx = dates.indexOf(date);
  const prev = idx > 0 ? dates[idx - 1] : undefined;
  const next = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : undefined;

  const mo = chart?.maskOff ?? [];
  const flowOpts = useCallback((c: ChartColors) => lineOptions(c, { lang, color: c.c1, label: t('night.flowChart'), maskOff: mo, yMin: undefined }), [t, lang, mo]);
  const leakOpts = useCallback((c: ChartColors) => lineOptions(c, { lang, color: c.c3, label: t('night.leakChart'), maskOff: mo, step: true, yMin: 0 }), [t, lang, mo]);
  const pressureOpts = useCallback((c: ChartColors) => lineOptions(c, { lang, color: c.c4, label: t('night.pressureChart'), maskOff: mo, step: true, yMin: 0 }), [t, lang, mo]);
  const snoreOpts = useCallback((c: ChartColors) => lineOptions(c, { lang, color: c.c2, label: t('night.snoreChart'), maskOff: mo, bars: true, yMin: 0 }), [t, lang, mo]);

  if (loading && !chart) return <p>{t('common.loading')}</p>;
  if (!chart || !summary) {
    return (
      <div className="stack">
        <a href={href.dashboard}>← {t('common.back')}</a>
        <div className="banner warn">{t('night.notFound')}</div>
      </div>
    );
  }

  const counts = (Object.entries(summary.counts) as [EventType, number][]).sort((a, b) => b[1] - a[1]);
  const hasAlt = sessions.some((s) => s.events.some((e) => e.detail === 'alt-hypopnea'));
  const ahiTone = summary.ahi === undefined ? undefined : summary.ahi < 5 ? 'good' : summary.ahi < 15 ? 'warn' : 'bad';

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{t('night.title', { date: formatNightDate(date, lang) })}</h1>
        <div className="btn-row">
          {prev ? <a className="btn secondary" href={href.night(prev)} rel="prev">← {t('night.prev')}</a> : <span />}
          {next ? <a className="btn secondary" href={href.night(next)} rel="next">{t('night.next')} →</a> : <span />}
        </div>
      </div>

      <section aria-label={t('night.summary')}>
        <div className="grid">
          <Stat label={t('metric.usage')} value={formatHours(summary.usageHours)} sub={`${formatClock(summary.start, lang)} – ${formatClock(summary.end, lang)} · ${t('night.sessionsCount', { count: summary.sessionIds.length })}`} explain={t('explain.usage')} />
          <Stat label={t('metric.ahi')} value={formatNumber(summary.ahi, lang)} unit={t('metric.unitPerHour')} tone={ahiTone} explain={t('explain.ahi')} />
          <Stat label={t('metric.leakP95')} value={formatNumber(summary.leak?.p95, lang)} unit={t('metric.unitLeak')} sub={`${t('metric.leakMedian')}: ${formatNumber(summary.leak?.median, lang)}`} explain={t('explain.leak')} />
          <Stat label={t('metric.pressure')} value={summary.pressure ? (summary.pressure.min === summary.pressure.max ? formatNumber(summary.pressure.max, lang) : `${formatNumber(summary.pressure.min, lang)}–${formatNumber(summary.pressure.max, lang)}`) : '—'} unit={t('metric.unitPressure')} sub={summary.mode ? `${t('metric.mode')}: ${t(`mode.${summary.mode}`, summary.mode)}` : undefined} explain={t('explain.pressure')} />
          <Stat label={t('metric.rera')} value={formatNumber(summary.reraIndex, lang)} unit={t('metric.unitPerHour')} explain={t('explain.rera')} />
          <Stat label={t('metric.snore')} value={formatNumber(summary.snoreIndex, lang)} unit={t('metric.unitPerHour')} explain={t('explain.snore')} />
        </div>
      </section>

      <section className="card stack" aria-labelledby="tl">
        <div className="page-head">
          <h2 id="tl">{t('night.timeline')}</h2>
          <button className="btn secondary" type="button" disabled={!range} onClick={() => setRange(null)}>{t('night.resetZoom')}</button>
        </div>
        <p className="muted">{t('night.zoomHint')}</p>
        {chart.events.length ? <Timeline events={chart.events} gaps={chart.maskOff} extent={chart.extent} range={range} /> : <p className="muted">{t('chart.empty')}</p>}
      </section>

      <ChartCard title={t('night.flowChart')} explain={t('explain.flow')} chart={chart} kind="flow" options={flowOpts} range={range} onRange={setRange} empty={t('night.noWaveform')} />
      <ChartCard title={t('night.leakChart')} explain={t('explain.leak')} chart={chart} kind="leak" options={leakOpts} range={range} onRange={setRange} />
      <ChartCard title={t('night.pressureChart')} explain={t('explain.pressure')} chart={chart} kind="pressure" options={pressureOpts} range={range} onRange={setRange} />
      <ChartCard title={t('night.snoreChart')} chart={chart} kind="snore" options={snoreOpts} range={range} onRange={setRange} />

      <section className="card stack" aria-labelledby="ec">
        <h2 id="ec">{t('night.eventCounts')}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">{t('metric.events')}</th><th scope="col" className="num">{t('night.count')}</th></tr></thead>
            <tbody>{counts.map(([type, n]) => <tr key={type}><th scope="row">{t(`event.${type}`)}</th><td className="num">{n}</td></tr>)}</tbody>
          </table>
        </div>
        {hasAlt && <p className="muted">{t('night.altHypopnea')}</p>}
        <button className="btn secondary" type="button" aria-expanded={table} onClick={() => setTable((v) => !v)}>{table ? t('night.hideTable') : t('night.showTable')}</button>
        {table && (
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">{t('metric.start')}</th><th scope="col">{t('metric.events')}</th><th scope="col" className="num">s</th></tr></thead>
              <tbody>
                {chart.events.slice(0, 1000).map((e, i) => (
                  <tr key={i}><td>{formatClock(e.start * 1000, lang)}</td><td>{t(`event.${e.type}`)}</td><td className="num">{Math.round(e.duration)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ChartCard({ title, explain, chart, kind, options, range, onRange, empty }: {
  title: string; explain?: string; chart: NightChartData; kind: 'flow' | 'leak' | 'pressure' | 'snore';
  options: (c: ChartColors) => Omit<uPlot.Options, 'width' | 'height'>; range: XRange | null; onRange: (r: XRange | null) => void; empty?: string;
}) {
  const s = chart[kind];
  const data = useMemo(() => (s ? ([s.x, s.y] as unknown as uPlot.AlignedData) : null), [s]);
  if (!data) return empty ? <section className="card"><h2>{title}</h2><p className="muted">{empty}</p></section> : null;
  return (
    <section className="card" aria-label={title}>
      <h2>{title}{explain && <> <InfoTip text={explain} /></>}</h2>
      <Chart options={options} data={data} height={kind === 'flow' ? 200 : 150} ariaLabel={title} range={range} onRangeChange={onRange} syncKey={SYNC} />
    </section>
  );
}
