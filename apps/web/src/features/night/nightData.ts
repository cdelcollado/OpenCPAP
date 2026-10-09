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

export function buildNightData(sessions: SessionLite[], waveforms: Waveform[]): NightChartData | undefined {
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

  const leak = merge(sessions, 'leak-total');
  const snore = merge(sessions, 'snore-count');
  return {
    extent: [start, end], events, maskOff, pressure,
    flow: joinWaveforms(waveforms, 'flow'),
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
export interface Readout { flow?: number; leak?: number; pressure?: number; snore?: number }

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
  if (d.pressure) {
    // value holds from its time onward: last change at or before x
    const i = indexAtOrAfter(d.pressure.x, x + 1e-9) - 1;
    if (i >= 0) out.pressure = Number(d.pressure.y[Math.min(i, d.pressure.y.length - 1)]);
  }
  return out;
}
