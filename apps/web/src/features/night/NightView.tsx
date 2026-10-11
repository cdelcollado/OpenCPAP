import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nightFindings, type EventType, type SessionLite, type Waveform } from '@opencpap/core';
import { Chart, PLOT_PAD_RIGHT, axisStyle, readAxisWidth, uPlot, utcDate, type ChartColors, type XRange } from '../../components/Chart';
import { InfoTip } from '../../components/InfoTip';
import { clockAxisValues } from '../../components/axes';
import { IconChevronLeft, IconChevronRight } from '../../components/icons';
import { repository } from '../../db/repository';
import { formatClock, formatClockSeconds, formatHours, formatNightDate, formatNumber } from '../../format';
import { Hero } from '../dashboard/Hero';
import { baseline } from '../dashboard/metrics';
import { href } from '../../router';
import { useData } from '../../state';
import { BreathingCard } from './BreathingCard';
import { OximetryCard } from '../oximetry/OximetryCard';
import { Findings } from './Findings';
import { JournalCard } from './JournalCard';
import { download, eventsCsv, flowEdf, oximetryCsv, statisticsCsv } from '../../exports';
import { buildNightData, readoutAt, type NightChartData } from './nightData';
import { settingsRows } from './settingsRows';
import { EVENT_COLOR, EVENT_ORDER, Timeline } from './Timeline';

const SYNC = 'night';

/** Loads a night; `oximetryKey` changes when its oximeter recording is imported or removed so the curves follow. */
function useNightData(date: string, oximetryKey: number) {
  const [state, setState] = useState<{ loading: boolean; date: string; sessions: SessionLite[]; waveforms: Waveform[]; oximetry?: { times: Float64Array; spo2: Float32Array; pulse: Float32Array; source: string } }>({ loading: true, date, sessions: [], waveforms: [] });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void Promise.all([repository.night(date), repository.oximetry(date)]).then(([r, ox]) => { if (!cancelled) setState({ loading: false, date, sessions: r.sessions, waveforms: r.waveforms, oximetry: ox ? { ...ox.samples, source: ox.row.source } : undefined }); });
    return () => { cancelled = true; };
  }, [date, oximetryKey]);
  const chart = useMemo(() => buildNightData(state.sessions, state.waveforms, state.oximetry), [state.sessions, state.waveforms, state.oximetry]);
  return { ...state, chart };
}

interface TrackSpec { color: (c: ChartColors) => string; label: string; step?: -1 | 1; bars?: boolean; fill?: boolean; points?: boolean; yMin?: number; axisValues?: (v: number) => string }

/** Options for one aligned track: same plot-area insets as the HTML timeline, time labels only on the last track. */
function trackOptions(c: ChartColors, lang: string, maskOff: [number, number][], spec: TrackSpec, showTime: boolean): Omit<uPlot.Options, 'width' | 'height'> {
  const color = spec.color(c);
  return {
    tzDate: utcDate,
    legend: { show: false },
    padding: [6, PLOT_PAD_RIGHT, 0, 0],
    scales: { x: { time: true }, y: { range: (_u, min, max) => { const lo = spec.yMin ?? Math.min(min, 0); return [lo, Math.max(max * 1.12, lo + 1)]; } } },
    axes: [
      { ...axisStyle(c), size: showTime ? 28 : 6, values: showTime ? clockAxisValues(lang) : (_u, s) => s.map(() => '') },
      { ...axisStyle(c), size: readAxisWidth(), values: (_u, s) => s.map((v) => (spec.axisValues ? spec.axisValues(v) : String(Math.round(v * 10) / 10))) },
    ],
    series: [{}, {
      label: spec.label, stroke: color, width: spec.bars ? 0 : 1.6, spanGaps: false, points: spec.points ? { show: true, size: 5, fill: color, stroke: c.surface, width: 1 } : { show: false },
      fill: spec.bars ? color : spec.fill ? `${color}22` : undefined,
      paths: spec.step ? uPlot.paths.stepped!({ align: spec.step }) : spec.bars ? uPlot.paths.bars!({ size: [1, 8] }) : undefined,
    }],
    hooks: {
      // shade the periods when the mask was off
      drawClear: [(u) => {
        const { ctx, bbox } = u;
        ctx.save();
        ctx.fillStyle = c.band;
        for (const [a, b] of maskOff) {
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
  const { nights, changes } = useData();
  const summary = nights.find((n) => n.date === date);
  const { loading, chart, sessions, waveforms, oximetry, date: loadedDate } = useNightData(date, summary?.oximetry?.seconds ?? 0);
  const [range, setRange] = useState<XRange | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => setRange(null), [date]);

  // pointer events arrive for every synced chart: commit at most one update per frame
  const pending = useRef<number | null>(null);
  const frame = useRef(0);
  const onCursor = useCallback((x: number | null) => {
    pending.current = x;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; setCursor((prev) => (prev === pending.current ? prev : pending.current)); });
  }, []);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const dates = useMemo(() => nights.map((n) => n.date), [nights]);
  const idx = dates.indexOf(date);
  const prev = idx > 0 ? dates[idx - 1] : undefined;
  const next = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : undefined;
  const history = useMemo(() => nights.filter((n) => n.date <= date), [nights, date]);
  const base = useMemo(() => baseline(history, 30), [history]);

  const findings = useMemo(() => (summary ? nightFindings(summary, { baseline: base, changes, sessions }) : []), [summary, base, changes, sessions]);
  const mo = useMemo(() => chart?.maskOff ?? [], [chart]);
  const specs = useMemo(() => ({
    flow: { color: (c: ChartColors) => c.flow, label: t('night.flowChart') } as TrackSpec,
    leak: { color: (c: ChartColors) => c.leak, label: t('night.leakChart'), step: -1, fill: true, yMin: 0 } as TrackSpec,
    pressure: { color: (c: ChartColors) => c.pressure, label: t('night.pressureChart'), step: 1, yMin: 0 } as TrackSpec,
    snore: { color: (c: ChartColors) => c.snore, label: t('night.snoreChart'), bars: true, yMin: 0 } as TrackSpec,
    flat: { color: (c: ChartColors) => c.flat, label: t('night.flatChart'), yMin: 0, points: true } as TrackSpec,
    rate: { color: (c: ChartColors) => c.rate, label: t('night.rateChart'), yMin: 0, points: true } as TrackSpec,
    spo2: { color: (c: ChartColors) => c.spo2, label: t('oximetry.spo2Chart') } as TrackSpec,
    pulse: { color: (c: ChartColors) => c.pulse, label: t('oximetry.pulseChart') } as TrackSpec,
  }), [t]);
  const ORDER = ['flow', 'flat', 'rate', 'leak', 'pressure', 'snore', 'spo2', 'pulse'] as const;
  type TrackKey = (typeof ORDER)[number];
  const tracks = useMemo(() => ORDER.filter((k) => chart?.[k]), [chart]);
  // chart data must keep its identity between renders: a new array makes the chart reset its scale and report it
  const trackData = useMemo(() => Object.fromEntries(tracks.map((k) => [k, [chart![k]!.x, chart![k]!.y] as unknown as uPlot.AlignedData])) as Record<TrackKey, uPlot.AlignedData>, [chart, tracks]);
  const lastTrack = tracks.at(-1);
  const opts = useMemo(() => Object.fromEntries(ORDER.map((k) => [k, (c: ChartColors) => trackOptions(c, lang, mo, specs[k], k === lastTrack)])) as Record<TrackKey, (c: ChartColors) => Omit<uPlot.Options, 'width' | 'height'>>, [lang, mo, specs, lastTrack]);

  const unmounted = loading && loadedDate !== date;
  if (unmounted && !chart) return <p>{t('common.loading')}</p>;
  if (!chart || !summary) {
    return (
      <div className="stack">
        <a href={href.dashboard}>← {t('common.back')}</a>
        <div className="banner warn">{t('night.notFound')}</div>
      </div>
    );
  }

  const read = cursor === null ? null : readoutAt(chart, cursor);
  const counts = (Object.entries(summary.counts) as [EventType, number][]).sort((a, b) => EVENT_ORDER.indexOf(a[0]) - EVENT_ORDER.indexOf(b[0]));
  const maxCount = Math.max(1, ...counts.map(([, n]) => n));
  const hasAlt = sessions.some((s) => s.events.some((e) => e.detail === 'alt-hypopnea'));
  const rows = settingsRows(sessions[0]?.settings ?? {}, t, lang);
  const dash = t('common.none');
  const fmt = (v: number | undefined, d = 1) => (v === undefined ? dash : formatNumber(v, lang, d));

  return (
    <div style={{ opacity: unmounted ? 0.6 : 1, transition: 'opacity .15s' }}>
      <div className="page-head">
        <div>
          <h1>{formatNightDate(date, lang)}</h1>
          <p className="sub">{formatClock(summary.start, lang)} – {formatClock(summary.end, lang)} · {t('night.sessionsCount', { count: summary.sessionIds.length })} · {formatHours(summary.usageHours)}</p>
        </div>
        <nav className="row" aria-label={t('night.navLabel')}>
          {prev ? <a className="btn secondary" href={href.night(prev)} rel="prev"><IconChevronLeft />{t('night.prev')}</a> : <span />}
          <label className="sr-only" htmlFor="jump">{t('night.jump')}</label>
          <input id="jump" type="date" value={date} min={dates[0]} max={dates.at(-1)} onChange={(e) => { if (e.target.value) window.location.hash = href.night(e.target.value); }} />
          {next ? <a className="btn secondary" href={href.night(next)} rel="next">{t('night.next')}<IconChevronRight /></a> : <span />}
        </nav>
      </div>

      <Hero nights={history} last={summary} base={base} heading={t('night.heroHeading')} />

      <div className="two-col" style={{ marginTop: '0.9rem' }}>
        <Findings findings={findings} />
        <JournalCard key={date} date={date} />
      </div>
      <div style={{ marginTop: '0.9rem' }}><BreathingCard night={summary} base={base} /></div>
      {summary.oximetry && oximetry && <div style={{ marginTop: '0.9rem' }}><OximetryCard date={date} stats={summary.oximetry} source={oximetry.source} /></div>}

      <section className="card detail" style={{ marginTop: '0.9rem' }} aria-labelledby="detail-title">
        <div className="detail-head">
          <h2 id="detail-title" style={{ margin: 0 }}>{t('night.detail')}</h2>
          <div className="readout" aria-live="off" data-testid="readout">
            {read === null || cursor === null ? (
              <span className="muted">{t('night.zoomHint')}</span>
            ) : (
              <>
                <span className="t num">{formatClockSeconds(cursor * 1000, lang)}</span>
                {chart.flow && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-flow)' }} />{t('night.flowShort')} <b className="num">{fmt(read.flow)}</b></span>}
                {chart.leak && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-leak)' }} />{t('night.leakShort')} <b className="num">{fmt(read.leak)}</b></span>}
                {chart.pressure && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-pressure)' }} />{t('night.pressureShort')} <b className="num">{fmt(read.pressure)}</b></span>}
                {chart.snore && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-snore)' }} />{t('night.snoreShort')} <b className="num">{fmt(read.snore, 0)}</b></span>}
                {chart.flat && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-flat)' }} />{t('night.flatShort')} <b className="num">{fmt(read.flat, 0)} %</b></span>}
                {chart.rate && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-rate)' }} />{t('night.rateShort')} <b className="num">{fmt(read.rate, 1)}</b></span>}
                {chart.spo2 && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-spo2)' }} />{t('oximetry.spo2Short')} <b className="num">{fmt(read.spo2, 0)} %</b></span>}
                {chart.pulse && <span className="rv"><span className="key" style={{ borderTopColor: 'var(--m-pulse)' }} />{t('oximetry.pulseShort')} <b className="num">{fmt(read.pulse, 0)}</b></span>}
              </>
            )}
          </div>
          <button className="btn secondary" type="button" disabled={!range} onClick={() => setRange(null)}>{t('night.resetZoom')}</button>
        </div>

        <div className="track" style={{ display: 'block' }}>
          <div style={{ padding: '0.5rem 0 0.2rem' }}>
            {chart.events.length ? <Timeline events={chart.events} gaps={chart.maskOff} extent={chart.extent} range={range} cursor={cursor} /> : <p className="muted" style={{ padding: '0 1.2rem 0.5rem' }}>{t('night.noEvents')}</p>}
          </div>
        </div>

        {!chart.flow && <div className="track"><div className="track-label"><strong>{t('night.flowChart')}</strong></div><p className="muted track-body" style={{ padding: '0.8rem 1rem' }}>{t('night.noWaveform')}</p></div>}
        {tracks.map((k) => {
          const data = trackData[k];
          const unit = { flow: t('metric.unitLeak'), leak: t('metric.unitLeak'), pressure: t('metric.unitPressure'), snore: t('night.perInterval'), flat: `% · ${t('night.perWindow')}`, rate: `${t('metric.unitPerMin')} · ${t('night.perWindow')}`, spo2: '%', pulse: t('metric.unitPerMin') }[k];
          const explain = { flow: t('explain.flow'), leak: t('explain.leak'), pressure: t('explain.pressure'), snore: undefined, flat: t('explain.flat'), rate: t('explain.rate'), spo2: t('explain.spo2'), pulse: undefined }[k];
          return (
            <div className="track" key={k} data-track={k}>
              <div className="track-label"><strong>{t(k === 'spo2' || k === 'pulse' ? `oximetry.${k}Short` : `night.${k}Short`)} {explain && <InfoTip text={explain} />}</strong><span className="u">{unit}</span></div>
              <div className="track-body">
                <Chart options={opts[k]} data={data} height={k === 'flow' ? 150 : 104} ariaLabel={specs[k].label} domain={chart.extent} range={range} onRangeChange={setRange} syncKey={SYNC} onCursor={onCursor} />
              </div>
            </div>
          );
        })}
      </section>

      <div className="section-title"><h2>{t('night.eventCounts')}</h2></div>
      <section className="card stack" aria-labelledby="ec">
        <h3 id="ec" className="sr-only">{t('night.eventCounts')}</h3>
        {counts.length === 0 ? <p className="muted">{t('night.noEvents')}</p> : (
          <div className="event-bars">
            {counts.map(([type, n]) => (
              <div className="event-bar" key={type}>
                <span>{t(`event.${type}`)}</span>
                <span className="bar" aria-hidden="true"><i style={{ width: `${(n / maxCount) * 100}%`, background: EVENT_COLOR[type] }} /></span>
                <span className="n">{n}</span>
              </div>
            ))}
          </div>
        )}
        {hasAlt && <p className="muted">{t('night.altHypopnea')}</p>}
        <div><button className="btn secondary" type="button" aria-expanded={table} onClick={() => setTable((v) => !v)}>{table ? t('night.hideTable') : t('night.showTable')}</button></div>
        {table && (
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">{t('metric.start')}</th><th scope="col">{t('metric.events')}</th><th scope="col" className="num">s</th></tr></thead>
              <tbody>
                {chart.events.slice(0, 1000).map((e, i) => (
                  <tr key={i}><td className="num">{formatClockSeconds(e.start * 1000, lang)}</td><td>{t(`event.${e.type}`)}</td><td className="num">{Math.round(e.duration)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="section-title"><h2>{t('export.title')}</h2></div>
      <section className="card stack" aria-labelledby="export-title">
        <h3 id="export-title" className="sr-only">{t('export.title')}</h3>
        <div className="btn-row">
          <button className="btn secondary" type="button" onClick={() => download(eventsCsv(sessions), `opencpap-events-${date}.csv`, 'text/csv;charset=utf-8')}>{t('export.events')}</button>
          <button className="btn secondary" type="button" onClick={() => download(statisticsCsv(sessions), `opencpap-statistics-${date}.csv`, 'text/csv;charset=utf-8')}>{t('export.stats')}</button>
          {oximetry && <button className="btn secondary" type="button" onClick={() => download(oximetryCsv(oximetry), `opencpap-oximetry-${date}.csv`, 'text/csv;charset=utf-8')}>{t('export.oximetry')}</button>}
          {chart.flow && <button className="btn secondary" type="button" onClick={() => { const edf = flowEdf(waveforms); if (edf) download(edf as BlobPart, `opencpap-flow-${date}.edf`, 'application/octet-stream'); }}>{t('export.flow')}</button>}
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>{t('export.hint')}</p>
      </section>

      {rows.length > 0 && (
        <>
          <div className="section-title"><h2>{t('night.settingsTitle')}</h2><span className="hint">{t('night.settingsHint')}</span></div>
          <section className="card">
            <dl className="kv">
              {rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
