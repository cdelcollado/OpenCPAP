import { intervalSeconds, type SessionLite, type TimeSeries, type Waveform } from '@opencpap/core';
import type { Gap, TimelineEvent } from './Timeline';

/** A series for charts (`x`, `y`) plus the raw sample times when they differ from the plotted x (`t`). */
export interface Track<X = Float64Array | number[], Y = Float32Array | number[]> { x: X; y: Y; t?: Float64Array }

/** Everything the night view draws, in chart-friendly units (seconds since epoch of the device clock). */
export interface NightChartData {
  extent: [number, number];
  events: TimelineEvent[];
  maskOff: Gap[];
  flow?: { x: Float64Array | number[]; y: Float32Array | (number | null)[]; rate: number };
  /** x = end of each statistics interval (step drawn backwards: the value covers the interval before it) */
  leak?: Track<Float64Array, Float32Array>;
  /** x = middle of each interval (bar position); `t` = interval end times */
  snore?: Track<Float64Array, Float32Array>;
  /** pressure changes: value holds from its time onward */
  pressure?: Track;
  /** share of flat-topped breaths per ~5 min window, in % (x = window middle) */
  flat?: Track<Float64Array, Float32Array>;
  /** breaths per minute per window */
  rate?: Track<Float64Array, Float32Array>;
  /** pulse-oximeter recording; invalid readings are null so the line breaks there */
  spo2?: Track<Float64Array, (number | null)[]>;
  pulse?: Track<Float64Array, (number | null)[]>;
}

const merge = (sessions: SessionLite[], channel: TimeSeries['channel']) => {
  const rows: { t: number; v: number; w: number }[] = [];
  for (const s of sessions) {
    const series = s.statistics.find((x) => x.channel === channel);
    if (!series) continue;
    const w = intervalSeconds(series.times, s.start);
    for (let i = 0; i < series.times.length; i++) rows.push({ t: series.times[i]! / 1000, v: series.values[i]!, w: w[i]! });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
};

/** Joins waveform segments into one series; a `null` sample between segments makes the gap visible. */
export function joinWaveforms(waveforms: Waveform[], channel: Waveform['channel']) {
  const segs = waveforms.filter((w) => w.channel === channel).sort((a, b) => a.start - b.start);
  if (!segs.length) return undefined;
  const rate = segs[0]!.sampleRate;
  if (segs.length === 1) {
    const w = segs[0]!;
    const x = new Float64Array(w.samples.length);
    for (let i = 0; i < x.length; i++) x[i] = w.start / 1000 + i / w.sampleRate;
    return { x, y: w.samples, rate };
  }
  const x: number[] = [], y: (number | null)[] = [];
  segs.forEach((w, k) => {
    if (k > 0) { x.push(w.start / 1000 - 0.001); y.push(null); }
    for (let i = 0; i < w.samples.length; i++) { x.push(w.start / 1000 + i / w.sampleRate); y.push(w.samples[i]!); }
  });
  return { x, y, rate };
}

export function buildNightData(sessions: SessionLite[], waveforms: Waveform[], oximetry?: { times: Float64Array; spo2: Float32Array; pulse: Float32Array }): NightChartData | undefined {
  if (!sessions.length) return undefined;
  const start = Math.min(...sessions.map((s) => s.start)) / 1000;
  const end = Math.max(...sessions.map((s) => s.end)) / 1000;

  const events: TimelineEvent[] = sessions.flatMap((s) => s.events.map((e) => ({ type: e.type, start: e.start / 1000, duration: e.duration })));
  events.sort((a, b) => a.start - b.start);

  const maskOff: Gap[] = sessions.flatMap((s) => s.slices.filter((sl) => sl.status === 'mask-off').map((sl): Gap => [sl.start / 1000, sl.end / 1000]));

  let pressure: NightChartData['pressure'];
  const steps = merge(sessions, 'pressure-set');
  if (steps.length) {
    pressure = { x: [...steps.map((r) => r.t), end], y: [...steps.map((r) => r.v), steps.at(-1)!.v] };
  } else {
    const fixed = sessions.map((s) => s.settings.pressure).find((p): p is number => typeof p === 'number');
    if (fixed !== undefined) pressure = { x: [start, end], y: [fixed, fixed] };
  }

  const win = sessions.flatMap((s) => (s.analysis ? [...s.analysis.windows.times].map((t, i) => ({ t: t / 1000, flat: s.analysis!.windows.flatShare[i]!, rate: s.analysis!.windows.rate[i]! })) : []))
    .filter((w) => !Number.isNaN(w.flat) && !Number.isNaN(w.rate)).sort((a, b) => a.t - b.t);
  // total leak (Philips) when the sessions have it, else unintentional leak (ResMed)
  const leak = merge(sessions, sessions.some((s) => s.statistics.some((t) => t.channel === 'leak-total')) ? 'leak-total' : 'leak-unintentional');
  const snore = merge(sessions, 'snore-count');
  return {
    extent: [start, end], events, maskOff, pressure,
    flow: joinWaveforms(waveforms, 'flow'),
    spo2: oximetry ? { x: Float64Array.from(oximetry.times, (t) => t / 1000), y: Array.from(oximetry.spo2, (v) => (Number.isNaN(v) ? null : v)) } : undefined,
    pulse: oximetry ? { x: Float64Array.from(oximetry.times, (t) => t / 1000), y: Array.from(oximetry.pulse, (v) => (Number.isNaN(v) ? null : v)) } : undefined,
    flat: win.length ? { x: Float64Array.from(win, (w) => w.t), y: Float32Array.from(win, (w) => w.flat * 100) } : undefined,
    rate: win.length ? { x: Float64Array.from(win, (w) => w.t), y: Float32Array.from(win, (w) => w.rate) } : undefined,
    leak: leak.length ? { x: Float64Array.from(leak, (r) => r.t), y: Float32Array.from(leak, (r) => r.v) } : undefined,
    snore: snore.length
      ? { x: Float64Array.from(snore, (r) => r.t - r.w / 2), y: Float32Array.from(snore, (r) => r.v), t: Float64Array.from(snore, (r) => r.t) }
      : undefined,
  };
}

/** First index with `times[i] >= x` (binary search); `times.length` when none. */
export function indexAtOrAfter(times: ArrayLike<number>, x: number): number {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid]! < x) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Values of every track at an x position (seconds), for the shared cursor readout. */
export interface Readout { flow?: number; leak?: number; pressure?: number; snore?: number; flat?: number; rate?: number; spo2?: number; pulse?: number }

export function readoutAt(d: NightChartData, x: number): Readout {
  const out: Readout = {};
  const [start, end] = d.extent;
  if (x < start || x > end) return out;
  if (d.flow) {
    const i = Math.round((x - Number(d.flow.x[0])) * d.flow.rate);
    const v = d.flow.y[i];
    if (v != null && i >= 0 && i < d.flow.y.length) out.flow = v;
  }
  // statistics are reported at the end of the interval they describe: the value for x is the first sample at or after x
  if (d.leak) { const i = indexAtOrAfter(d.leak.x, x); if (i < d.leak.y.length) out.leak = d.leak.y[i]; }
  if (d.snore?.t) { const i = indexAtOrAfter(d.snore.t, x); if (i < d.snore.y.length) out.snore = d.snore.y[i]; }
  // window metrics: the window whose middle is nearest to x, if x lies within half a window (150 s) of it
  for (const k of ['flat', 'rate'] as const) {
    const tr = d[k];
    if (!tr) continue;
    const i = indexAtOrAfter(tr.x, x);
    const best = [i - 1, i].filter((j) => j >= 0 && j < tr.x.length).sort((a, b) => Math.abs(tr.x[a]! - x) - Math.abs(tr.x[b]! - x))[0];
    if (best !== undefined && Math.abs(tr.x[best]! - x) <= 150) out[k] = tr.y[best];
  }
  // oximeter samples: the nearest one, if it is within 30 s of x
  for (const k of ['spo2', 'pulse'] as const) {
    const tr = d[k];
    if (!tr) continue;
    const i = indexAtOrAfter(tr.x, x);
    const best = [i - 1, i].filter((j) => j >= 0 && j < tr.x.length).sort((a, b) => Math.abs(tr.x[a]! - x) - Math.abs(tr.x[b]! - x))[0];
    const v = best === undefined ? null : tr.y[best];
    if (best !== undefined && v != null && Math.abs(tr.x[best]! - x) <= 30) out[k] = v;
  }
  if (d.pressure) {
    // value holds from its time onward: last change at or before x
    const i = indexAtOrAfter(d.pressure.x, x + 1e-9) - 1;
    if (i >= 0) out.pressure = Number(d.pressure.y[Math.min(i, d.pressure.y.length - 1)]);
  }
  return out;
}
