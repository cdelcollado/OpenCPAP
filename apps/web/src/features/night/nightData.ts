import type { SessionLite, TimeSeries, Waveform } from '@opencpap/core';
import type { Gap, TimelineEvent } from './Timeline';

/** Everything the night view draws, in chart-friendly units (seconds since epoch of the device clock). */
export interface NightChartData {
  extent: [number, number];
  events: TimelineEvent[];
  maskOff: Gap[];
  flow?: { x: Float64Array | number[]; y: Float32Array | (number | null)[] };
  leak?: { x: Float64Array; y: Float32Array };
  snore?: { x: Float64Array; y: Float32Array };
  pressure?: { x: Float64Array | number[]; y: Float32Array | number[] };
}

const merge = (sessions: SessionLite[], channel: TimeSeries['channel']) => {
  const rows: [number, number][] = [];
  for (const s of sessions) {
    const t = s.statistics.find((x) => x.channel === channel);
    if (t) for (let i = 0; i < t.times.length; i++) rows.push([t.times[i]! / 1000, t.values[i]!]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return rows;
};

const toSeries = (rows: [number, number][]) =>
  rows.length ? { x: Float64Array.from(rows, (r) => r[0]), y: Float32Array.from(rows, (r) => r[1]) } : undefined;

/** Joins waveform segments into one series; a `null` sample between segments makes the gap visible. */
export function joinWaveforms(waveforms: Waveform[], channel: Waveform['channel']) {
  const segs = waveforms.filter((w) => w.channel === channel).sort((a, b) => a.start - b.start);
  if (!segs.length) return undefined;
  if (segs.length === 1) {
    const w = segs[0]!;
    const x = new Float64Array(w.samples.length);
    for (let i = 0; i < x.length; i++) x[i] = w.start / 1000 + i / w.sampleRate;
    return { x, y: w.samples };
  }
  const x: number[] = [], y: (number | null)[] = [];
  segs.forEach((w, k) => {
    if (k > 0) { x.push(w.start / 1000 - 0.001); y.push(null); }
    for (let i = 0; i < w.samples.length; i++) { x.push(w.start / 1000 + i / w.sampleRate); y.push(w.samples[i]!); }
  });
  return { x, y };
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
    pressure = { x: [...steps.map((r) => r[0]), end], y: [...steps.map((r) => r[1]), steps.at(-1)![1]] };
  } else {
    const fixed = sessions.map((s) => s.settings.pressure).find((p): p is number => typeof p === 'number');
    if (fixed !== undefined) pressure = { x: [start, end], y: [fixed, fixed] };
  }

  return {
    extent: [start, end], events, maskOff, pressure,
    flow: joinWaveforms(waveforms, 'flow'),
    leak: toSeries(merge(sessions, 'leak-total')),
    snore: toSeries(merge(sessions, 'snore-count')),
  };
}
