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
import { Findings } from './Findings';
import { JournalCard } from './JournalCard';
import { buildNightData, readoutAt, type NightChartData } from './nightData';
import { settingsRows } from './settingsRows';
import { EVENT_COLOR, EVENT_ORDER, Timeline } from './Timeline';

const SYNC = 'night';

function useNightData(date: string) {
  const [state, setState] = useState<{ loading: boolean; date: string; sessions: SessionLite[]; waveforms: Waveform[] }>({ loading: true, date, sessions: [], waveforms: [] });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void repository.night(date).then((r) => { if (!cancelled) setState({ loading: false, date, sessions: r.sessions, waveforms: r.waveforms }); });
    return () => { cancelled = true; };
  }, [date]);
  const chart = useMemo(() => buildNightData(state.sessions, state.waveforms), [state.sessions, state.waveforms]);
  return { ...state, chart };
}

interface TrackSpec { color: (c: ChartColors) => string; label: string; step?: -1 | 1; bars?: boolean; fill?: boolean; yMin?: number; axisValues?: (v: number) => string }

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
      label: spec.label, stroke: color, width: spec.bars ? 0 : 1.6, spanGaps: false, points: { show: false },
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
  const { loading, chart, sessions, date: loadedDate } = useNightData(date);
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
  }), [t]);
  const tracks = useMemo(() => (['flow', 'leak', 'pressure', 'snore'] as const).filter((k) => chart?.[k]), [chart]);
  const lastTrack = tracks.at(-1);
  const opts = useMemo(() => Object.fromEntries((['flow', 'leak', 'pressure', 'snore'] as const).map((k) => [k, (c: ChartColors) => trackOptions(c, lang, mo, specs[k], k === lastTrack)])) as Record<'flow' | 'leak' | 'pressure' | 'snore', (c: ChartColors) => Omit<uPlot.Options, 'width' | 'height'>>, [lang, mo, specs, lastTrack]);

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
          const s = chart[k]!;
          const data = [s.x, s.y] as unknown as uPlot.AlignedData;
          const unit = k === 'flow' ? t('metric.unitLeak') : k === 'leak' ? t('metric.unitLeak') : k === 'pressure' ? t('metric.unitPressure') : t('night.perInterval');
          const explain = k === 'flow' ? t('explain.flow') : k === 'leak' ? t('explain.leak') : k === 'pressure' ? t('explain.pressure') : undefined;
          return (
            <div className="track" key={k} data-track={k}>
              <div className="track-label"><strong>{t(`night.${k}Short`)} {explain && <InfoTip text={explain} />}</strong><span className="u">{unit}</span></div>
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
