import { describe, expect, it } from 'vitest';
import { analyzeSession } from './analysis';
import { leakSeriesOf, summarizeNight, type SessionLite } from './nights';
import type { TimeSeries, Waveform } from './model';

const START = Date.UTC(2026, 2, 5, 23);
const series = (channel: TimeSeries['channel'], v: number, n = 30): TimeSeries => ({
  channel, unit: 'L/min', times: Float64Array.from({ length: n }, (_, i) => START + (i + 1) * 120_000), values: Float32Array.from({ length: n }, () => v),
});
const session = (statistics: TimeSeries[]): SessionLite => ({
  device: { manufacturer: 'X', model: 'Y', serial: 'Z' }, id: 1, start: START, end: START + 3600_000, clock: 'device-local',
  slices: [{ start: START, end: START + 3600_000, status: 'mask-on' }], settings: {}, events: [], statistics,
});

describe('leak kinds (Philips total leak versus ResMed unintentional leak)', () => {
  it('uses unintentional leak when that is all the device reports, and says so', () => {
    const n = summarizeNight('2026-03-05', [session([series('leak-unintentional', 4)])]);
    expect(n.leak?.median).toBe(4);
    expect(n.leakKind).toBe('unintentional');
  });
  it('prefers total leak when both exist', () => {
    const s = session([series('leak-unintentional', 4), series('leak-total', 30)]);
    expect(leakSeriesOf(s)?.channel).toBe('leak-total');
    const n = summarizeNight('2026-03-05', [s]);
    expect(n.leak?.median).toBe(30);
    expect(n.leakKind).toBe('total');
  });
  it('has no kind without leak data', () => {
    expect(summarizeNight('2026-03-05', [session([])]).leakKind).toBeUndefined();
  });
});

describe('breath analysis on faster flow', () => {
  /** a breath every 4 s with a flat-ish top, sampled at `rate` Hz */
  const flow = (rate: number, seconds: number): Waveform => ({
    channel: 'flow', unit: 'L/min', sampleRate: rate, start: START,
    samples: Float32Array.from({ length: rate * seconds }, (_, i) => 30 * Math.sin((2 * Math.PI * i) / (rate * 4))),
  });
  it('reduces 25 Hz flow to the analysed rate and finds the same breathing as the 5 Hz signal', () => {
    const a5 = analyzeSession([flow(5, 600)])!.breathing;
    const a25 = analyzeSession([flow(25, 600)])!.breathing;
    expect(a25.rate).toBeCloseTo(a5.rate!, 0);
    expect(a25.rate).toBeCloseTo(15, 0);
    expect(Math.abs(a25.breaths - a5.breaths)).toBeLessThanOrEqual(2);
  });
  it('leaves rates that are not a multiple of 5 Hz alone', () => {
    expect(analyzeSession([flow(7, 600)])?.breathing.rate).toBeCloseTo(15, 0);
  });
});
