import { describe, it, expect } from 'vitest';
import { compliance, configuredPressure, groupNights, intervalSeconds, nightOf, percentile, summarizeNight, weightedMean, weightedPercentile, type SessionLite } from './nights';
import { generateDemoOximetry, generateDemoSessions, rng } from './demo';
import { oximetryStats } from './oximetry';

const iso = (s: string) => Date.parse(`${s}Z`);
const H = 3600_000;
const lite = (id: number, start: string, hours: number, extra: Partial<SessionLite> = {}): SessionLite => ({
  id, device: { manufacturer: 'T', model: 'T', serial: 'T' }, start: iso(start), end: iso(start) + hours * H, clock: 'device-local',
  slices: [{ start: iso(start), end: iso(start) + hours * H, status: 'mask-on' }], settings: {}, events: [], statistics: [], ...extra,
});

describe('percentile', () => {
  it('interpolates', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([0, 10], 95)).toBeCloseTo(9.5);
    expect(percentile([7], 95)).toBe(7);
  });
  it('is NaN for no data and clamps p', () => {
    expect(percentile([], 50)).toBeNaN();
    expect(percentile([1, 2], 150)).toBe(2);
  });
});

describe('time-weighted statistics', () => {
  it('weights each value by the time it covers (the case that revealed OSCAR\'s method)', () => {
    // 24 L/min for 120 s then 46 L/min for the 31 s left of a 151 s session: OSCAR reports an average of 28.52
    expect(weightedMean([24, 46], [120, 31])).toBeCloseTo(28.52, 2);
    expect(weightedPercentile([24, 46], [120, 31], 95)).toBe(46);
    // a brief spike at the end must not dominate the 95th percentile
    expect(weightedPercentile([28, 27, 23, 21, 76], [120, 120, 120, 120, 8], 95)).toBe(28);
  });
  it('nearest rank on cumulative weight', () => {
    expect(weightedPercentile([1, 2, 3, 4], [1, 1, 1, 1], 50)).toBe(2);
    expect(weightedPercentile([1, 2, 3, 4], [1, 1, 1, 1], 100)).toBe(4);
    expect(weightedPercentile([3, 1, 2], [1, 1, 1], 0)).toBe(1);
  });
  it('falls back to equal weights and handles empty input', () => {
    expect(weightedMean([2, 4], [0, 0])).toBe(3);
    expect(weightedPercentile([5, 1], [0, 0], 50)).toBe(1);
    expect(weightedPercentile([], [], 50)).toBeNaN();
  });
  it('derives interval lengths from sample times', () => {
    expect(intervalSeconds([120_000, 240_000, 271_000], 0)).toEqual([120, 120, 31]);
    expect(intervalSeconds([1000], 5000)).toEqual([0]);
  });
  it('is used for the night leak statistics', () => {
    const s = lite(1, '2026-03-05T23:00:00', 1, {
      statistics: [{ channel: 'leak-total', unit: 'L/min', times: Float64Array.of(iso('2026-03-05T23:02:00'), iso('2026-03-05T23:02:31')), values: Float32Array.of(24, 46) }],
    });
    const leak = summarizeNight('2026-03-05', [s]).leak!;
    expect(leak.average).toBeCloseTo(28.52, 2);
    expect(leak.max).toBe(46);
  });
});

describe('nightOf', () => {
  it('splits nights at noon', () => {
    expect(nightOf(iso('2026-03-05T23:00:00'))).toBe('2026-03-05');
    expect(nightOf(iso('2026-03-06T03:00:00'))).toBe('2026-03-05');
    expect(nightOf(iso('2026-03-06T11:59:59'))).toBe('2026-03-05');
    expect(nightOf(iso('2026-03-06T12:00:00'))).toBe('2026-03-06');
  });
});

describe('summarizeNight / groupNights', () => {
  const ev = (type: any) => ({ type, start: 0, duration: 0 });
  const a = lite(1, '2026-03-05T23:00:00', 3, {
    events: [ev('obstructive'), ev('hypopnea'), ev('rera')],
    statistics: [{ channel: 'leak-total', unit: 'L/min', times: Float64Array.of(1, 2, 3), values: Float32Array.of(2, 4, 40) }, { channel: 'snore-count', unit: 'count', times: Float64Array.of(1), values: Float32Array.of(6) }],
    settings: { mode: 'cpap', pressure: 9.5 },
  });
  const b = lite(2, '2026-03-06T03:30:00', 3, { events: [ev('central')] });
  it('merges sessions of the same night', () => {
    const n = groupNights([b, a]);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ date: '2026-03-05', sessionIds: [1, 2], usageHours: 6, mode: 'cpap' });
    expect(n[0]!.ahi).toBeCloseTo(3 / 6);
    expect(n[0]!.reraIndex).toBeCloseTo(1 / 6);
    expect(n[0]!.pressure).toEqual({ min: 9.5, max: 9.5, median: 9.5 });
    expect(n[0]!.leak!.p95).toBeGreaterThan(20);
    expect(n[0]!.snoreIndex).toBeCloseTo(1);
  });
  it('flags nights with waveforms', () => {
    expect(groupNights([a], new Set([1]))[0]!.hasWaveforms).toBe(true);
    expect(groupNights([a])[0]!.hasWaveforms).toBe(false);
  });
  it('has no AHI without usage', () => {
    expect(summarizeNight('2026-03-05', [lite(3, '2026-03-05T23:00:00', 0)]).ahi).toBeUndefined();
  });
});

describe('pressure', () => {
  it('ignores the ramp: uses the configured pressure, not the logged changes', () => {
    const s = lite(1, '2026-03-05T23:00:00', 8, {
      settings: { mode: 'cpap', pressure: 9.5 },
      statistics: [{ channel: 'pressure-set', unit: 'cmH2O', times: Float64Array.of(1, 2, 3), values: Float32Array.of(4, 5, 9.5) }],
    });
    expect(summarizeNight('2026-03-05', [s]).pressure).toEqual({ min: 9.5, max: 9.5, median: 9.5 });
  });
  it('reports a range for auto and bi-level modes', () => {
    expect(configuredPressure({ pressureMin: 6, pressureMax: 12 })).toEqual({ min: 6, max: 12 });
    expect(configuredPressure({ epap: 8, ipap: 12 })).toEqual({ min: 8, max: 12 });
    expect(configuredPressure({ epapMin: 5, ipapMax: 15 })).toEqual({ min: 5, max: 15 });
    expect(configuredPressure({})).toBeUndefined();
  });
  it('falls back to logged pressure changes when settings are missing', () => {
    const s = lite(1, '2026-03-05T23:00:00', 8, { statistics: [{ channel: 'pressure-set', unit: 'cmH2O', times: Float64Array.of(1, 2), values: Float32Array.of(8, 10) }] });
    expect(summarizeNight('2026-03-05', [s]).pressure).toMatchObject({ min: 8, max: 10 });
  });
});

describe('compliance', () => {
  const nights = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'].map((d, i) => summarizeNight(d, [lite(i, `${d}T23:00:00`, [8, 3, 5, 4][i]!)]));
  it('counts nights of at least 4 h over the window, missing nights as 0', () => {
    const c = compliance(nights, '2026-03-04', 5);
    expect(c).toMatchObject({ nights: 5, compliantNights: 3 });
    expect(c.ratio).toBeCloseTo(0.6);
    expect(c.meetsCommonRule).toBe(false);
    expect(c.averageHours).toBeCloseTo(20 / 5);
    expect(compliance(nights, '2026-03-04', 4).meetsCommonRule).toBe(true);
  });
});

describe('generateDemoSessions', () => {
  it('is deterministic and structurally valid', () => {
    const a = generateDemoSessions({ nights: 20, seed: 7 });
    const b = generateDemoSessions({ nights: 20, seed: 7 });
    expect(a.length).toBeGreaterThan(15);
    expect(a.map((s) => s.events.length)).toEqual(b.map((s) => s.events.length));
    for (const s of a) {
      expect(s.end).toBeGreaterThan(s.start);
      expect(s.events.every((e) => e.start >= s.start && e.start <= s.end)).toBe(true);
      expect(s.device.manufacturer).toBe('Demo');
    }
    // the last 3 calendar nights carry flow (a night can be skipped, so count by id)
    expect(a.filter((s) => s.waveforms.length).map((s) => s.id).every((id) => id > 17)).toBe(true);
    expect(a.filter((s) => s.waveforms.length).length).toBeGreaterThanOrEqual(2);
    for (const s of a.filter((x) => x.waveforms.length)) expect(s.analysis?.breathing.breaths).toBeGreaterThan(500);
    const nights = groupNights(a);
    expect(nights.every((n) => n.usageHours > 0)).toBe(true);
  });
  it('tells a story: a pressure change part-way and leak that grows with cushion age', () => {
    const a = generateDemoSessions({ nights: 80, seed: 11, waveformNights: 0 });
    const first = a[0]!.settings.pressure, lastP = a.at(-1)!.settings.pressure;
    expect(first).toBe(9.5);
    expect(lastP).toBe(10);
    const nightsList = groupNights(a);
    const early = nightsList.slice(0, 30).map((n) => n.leak!.p95), late = nightsList.slice(34, 36).map((n) => n.leak!.p95);
    expect(Math.max(...early.slice(-5))).toBeGreaterThan(Math.min(...early.slice(0, 5))); // rising before the replacement
    expect(late.length).toBe(2);
  });
  it('makes a believable oximetry recording whose dips follow the events', () => {
    const [s] = generateDemoSessions({ nights: 1, seed: 21, waveformNights: 0 });
    const rec = generateDemoOximetry(s!);
    const st = oximetryStats(rec);
    expect(rec.times.length).toBe(Math.floor((s!.end - s!.start) / 1000));
    expect(st.spo2Mean).toBeGreaterThan(93);
    expect(st.spo2Mean).toBeLessThan(97);
    const ev = s!.events.filter((e) => ['obstructive', 'hypopnea', 'central'].includes(e.type)).length;
    expect(st.desaturations3).toBeGreaterThan(ev * 0.4);
    expect(st.desaturations3).toBeLessThanOrEqual(ev);
  });
  it('rng is in [0,1)', () => {
    const r = rng(1);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
