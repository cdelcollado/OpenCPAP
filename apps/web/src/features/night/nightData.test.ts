import { describe, expect, it } from 'vitest';
import { generateDemoSessions } from '@opencpap/core';
import { buildNightData, indexAtOrAfter, joinWaveforms, readoutAt } from './nightData';

describe('buildNightData', () => {
  const [s] = generateDemoSessions({ nights: 1, seed: 5, waveformNights: 1 });
  const { waveforms, ...lite } = s!;

  it('converts to seconds and exposes every series', () => {
    const d = buildNightData([lite], waveforms)!;
    expect(d.extent[0]).toBe(s!.start / 1000);
    expect(d.extent[1]).toBe(s!.end / 1000);
    expect(d.events.length).toBe(s!.events.length);
    expect(d.events.every((e) => e.start >= d.extent[0] && e.start <= d.extent[1])).toBe(true);
    expect(d.leak!.x.length).toBe(d.leak!.y.length);
    expect(d.flow!.x.length).toBe(waveforms[0]!.samples.length);
    expect(d.pressure!.y.at(-1)).toBe(9.5); // step series is extended to the end of the session
    expect(d.pressure!.x.at(-1)).toBe(d.extent[1]);
  });

  it('plots snore bars at the middle of their interval but keeps the interval end for lookups', () => {
    const d = buildNightData([lite], [])!;
    const i = 3;
    expect(d.snore!.t![i]! - d.snore!.x[i]!).toBeCloseTo(60); // demo intervals are 120 s long
  });

  it('works without waveforms and returns undefined without sessions', () => {
    expect(buildNightData([lite], [])!.flow).toBeUndefined();
    expect(buildNightData([], [])).toBeUndefined();
  });

  it('falls back to the configured pressure when no pressure events exist', () => {
    const d = buildNightData([{ ...lite, statistics: lite.statistics.filter((x) => x.channel !== 'pressure-set') }], [])!;
    expect(d.pressure!.y).toEqual([9.5, 9.5]);
  });

  it('marks mask-off periods', () => {
    const t = lite.start;
    const d = buildNightData([{ ...lite, slices: [{ start: t, end: t + 1000, status: 'mask-on' }, { start: t + 1000, end: t + 5000, status: 'mask-off' }] }], [])!;
    expect(d.maskOff).toEqual([[(t + 1000) / 1000, (t + 5000) / 1000]]);
  });
});

describe('joinWaveforms', () => {
  const wf = (start: number, n: number) => ({ channel: 'flow' as const, unit: 'L/min', sampleRate: 5, start, samples: new Float32Array(n).fill(1) });
  it('inserts a null between disjoint segments', () => {
    const j = joinWaveforms([wf(10_000, 5), wf(60_000, 5)], 'flow')!;
    expect(j.y.length).toBe(11);
    expect(j.y[5]).toBeNull();
    expect(j.x[6]).toBeCloseTo(60);
  });
  it('is undefined for a missing channel', () => expect(joinWaveforms([wf(0, 5)], 'pressure')).toBeUndefined());
});

describe('readoutAt (shared cursor)', () => {
  const [s] = generateDemoSessions({ nights: 1, seed: 9, waveformNights: 1 });
  const { waveforms, ...lite } = s!;
  const d = buildNightData([lite], waveforms)!;

  it('finds the first index at or after x', () => {
    expect(indexAtOrAfter([1, 2, 3], 2)).toBe(1);
    expect(indexAtOrAfter([1, 2, 3], 2.1)).toBe(2);
    expect(indexAtOrAfter([1, 2, 3], 9)).toBe(3);
    expect(indexAtOrAfter([], 1)).toBe(0);
  });
  it('is empty outside the night', () => {
    expect(readoutAt(d, d.extent[0] - 10)).toEqual({});
    expect(readoutAt(d, d.extent[1] + 10)).toEqual({});
  });
  it('reads every track at a time inside the night', () => {
    const x = d.extent[0] + 3600;
    const r = readoutAt(d, x);
    expect(r.flow).toBeTypeOf('number');
    expect(r.leak).toBe(d.leak!.y[indexAtOrAfter(d.leak!.x, x)]);
    expect(r.pressure).toBe(9.5);
  });
  it('uses the ramp pressure before the first change and the new one after', () => {
    const t0 = d.pressure!.x[0] as number;
    expect(readoutAt(d, t0 + 1).pressure).toBe(4);
    expect(readoutAt(d, d.extent[0] + 20 * 60).pressure).toBe(9.5);
  });
});

import { niceTicks } from './Timeline';
describe('niceTicks', () => {
  const at = (iso: string) => Date.parse(`${iso}Z`) / 1000;
  it('aligns ticks to round wall-clock times', () => {
    const t = niceTicks(at('2026-03-05T21:21:00'), at('2026-03-06T04:00:00'));
    expect(t.length).toBeGreaterThanOrEqual(4);
    expect(t.length).toBeLessThanOrEqual(9);
    expect(t.every((x) => x % 1800 === 0)).toBe(true);
    expect(t[0]).toBeGreaterThanOrEqual(at('2026-03-05T21:21:00'));
    expect(t.at(-1)).toBeLessThanOrEqual(at('2026-03-06T04:00:00'));
  });
  it('refines the step when zoomed in', () => {
    const t = niceTicks(at('2026-03-05T23:00:10'), at('2026-03-05T23:20:00'));
    expect(t[1]! - t[0]!).toBeLessThanOrEqual(300);
  });
  it('copes with a degenerate range', () => expect(niceTicks(100, 100).length).toBeLessThanOrEqual(2));
});
