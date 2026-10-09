import { describe, expect, it } from 'vitest';
import { generateDemoSessions } from '@opencpap/core';
import { buildNightData, joinWaveforms } from './nightData';

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
