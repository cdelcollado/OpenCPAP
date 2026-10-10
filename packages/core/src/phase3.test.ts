import { describe, expect, it } from 'vitest';
import type { NightSummary } from './nights';
import { settingsChanges, isMajor } from './changes';
import { aroundChange, comparePeriods, daysBetween, addDays, nightsInRange, periodStats, recentVersusPrevious } from './compare';
import { dueItems, equipmentStatus, leakByAge, DEFAULT_INTERVAL_DAYS, type EquipmentItem } from './equipment';
import { nightFindings } from './findings';

const night = (date: string, usageHours: number, o: Partial<NightSummary> = {}): NightSummary => ({
  date, sessionIds: [1], start: 0, end: 0, usageHours, counts: {}, hasWaveforms: false, settings: {}, ...o,
});

describe('settingsChanges', () => {
  const ns = [
    night('2026-01-01', 7, { settings: { mode: 'cpap', pressure: 9, rampTimeMinutes: 15, humidifierLevel: 3 } }),
    night('2026-01-02', 7, { settings: { mode: 'cpap', pressure: 9, rampTimeMinutes: 15, humidifierLevel: 3 } }),
    night('2026-01-03', 7, { settings: { mode: 'cpap', pressure: 10, rampTimeMinutes: 15, humidifierLevel: 4 } }),
    night('2026-01-04', 7, { settings: { mode: 'cpap', pressure: 10, rampTimeMinutes: 15 } }), // humidifier not reported
  ];
  it('reports what changed and on which night, sorted by key', () => {
    expect(settingsChanges(ns)).toEqual([{ date: '2026-01-03', changes: [{ key: 'humidifierLevel', from: 3, to: 4 }, { key: 'pressure', from: 9, to: 10 }] }]);
  });
  it('ignores settings that are missing on either night and works on unsorted input', () => {
    expect(settingsChanges([...ns].reverse()).map((c) => c.date)).toEqual(['2026-01-03']);
    expect(settingsChanges([ns[0]!])).toEqual([]);
  });
  it('tells major settings from minor ones', () => {
    expect(isMajor('pressure')).toBe(true);
    expect(isMajor('humidifierLevel')).toBe(false);
  });
});

describe('periodStats and comparePeriods', () => {
  const ev = (n: number) => n;
  const a = [
    night('2026-01-01', 8, { ahi: 1, counts: { obstructive: ev(4), hypopnea: ev(4) }, leak: { average: 30, median: 28, p70: 40, p95: 40, max: 50 } }),
    night('2026-01-02', 2, { ahi: 3, counts: { obstructive: ev(3), rera: ev(2) }, leak: { average: 32, median: 30, p70: 44, p95: 44, max: 55 } }),
  ];
  const b = [night('2026-02-01', 6, { ahi: 0.5, counts: { hypopnea: ev(3) }, leak: { average: 20, median: 18, p70: 30, p95: 30, max: 40 } })];
  it('summarises a period with total-based rates', () => {
    const s = periodStats(a);
    expect(s).toMatchObject({ nights: 2, totalHours: 10, usageMean: 5, nightsOverMin: 1, compliance: 0.5 });
    expect(s.ahi).toBeCloseTo(11 / 10); // (4+4+3 events) / 10 h: weighted, not the mean of nightly values
    expect(s.rates.obstructive).toBeCloseTo(0.7);
    expect(s.rates.rera).toBeCloseTo(0.2);
    expect(s.ahiMedian).toBe(2);
    expect(s.leakP95).toBe(42);
  });
  it('handles an empty period', () => {
    expect(periodStats([])).toMatchObject({ nights: 0, totalHours: 0, usageMean: undefined, compliance: undefined, ahi: undefined, rates: {} });
  });
  it('computes b − a and leaves metrics undefined when a side has no data', () => {
    const c = comparePeriods(periodStats(a), periodStats(b));
    expect(c.delta.usageMean).toBeCloseTo(1);
    expect(c.delta.ahi).toBeCloseTo(0.5 - 1.1);
    expect(c.delta.leakP95).toBe(-12);
    expect(c.delta.rates.obstructive).toBeCloseTo(-0.7);
    expect(c.delta.rates.hypopnea).toBeCloseTo(0.5 - 0.4);
    expect(comparePeriods(periodStats([]), periodStats(b)).delta.usageMean).toBeUndefined();
  });
  it('builds the common period pairs', () => {
    expect(recentVersusPrevious('2026-03-31', 30)).toEqual({ a: ['2026-01-31', '2026-03-01'], b: ['2026-03-02', '2026-03-31'] });
    expect(aroundChange('2026-03-10', 7)).toEqual({ a: ['2026-03-03', '2026-03-09'], b: ['2026-03-10', '2026-03-16'] });
    expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('filters nights by an inclusive range', () => {
    expect(nightsInRange([...a, ...b], '2026-01-02', '2026-02-01').map((n) => n.date)).toEqual(['2026-01-02', '2026-02-01']);
  });
});

describe('equipment', () => {
  const item = (o: Partial<EquipmentItem> = {}): EquipmentItem => ({ id: 'x', kind: 'cushion', name: 'Cushion', startDate: '2026-01-01', intervalDays: 90, ...o });
  it('ages an item and flags it as the interval nears', () => {
    expect(equipmentStatus(item(), '2026-02-01')).toMatchObject({ ageDays: 31, daysLeft: 59, state: 'ok' });
    expect(equipmentStatus(item(), '2026-03-25').state).toBe('soon'); // 83 days: 7 left
    expect(equipmentStatus(item(), '2026-04-01').state).toBe('due'); // 90 days
    expect(equipmentStatus(item(), '2026-04-20').state).toBe('overdue');
  });
  it('retires replaced items and stops their clock', () => {
    const s = equipmentStatus(item({ endDate: '2026-01-31' }), '2026-06-01');
    expect(s).toMatchObject({ state: 'retired', ageDays: 30 });
  });
  it('lists the items to act on, most urgent first', () => {
    const items = [item({ id: 'a', startDate: '2026-01-01' }), item({ id: 'b', startDate: '2025-12-01' }), item({ id: 'c', startDate: '2026-03-15' })];
    expect(dueItems(items, '2026-04-10').map((d) => d.item.id)).toEqual(['b', 'a']);
  });
  it('has defaults for every kind', () => {
    for (const v of Object.values(DEFAULT_INTERVAL_DAYS)) expect(v).toBeGreaterThan(0);
  });

  const nights = Array.from({ length: 40 }, (_, i) => night(addDays('2026-01-01', i), 7, { leak: { average: 0, median: 0, p70: 30 + i * 0.5, p95: 30 + i * 0.5, max: 0 } }));
  it('fits the leak trend over the age of an item', () => {
    const r = leakByAge(nights, item());
    expect(r.points).toHaveLength(40);
    expect(r.early).toBeCloseTo(31.5);
    expect(r.late).toBeCloseTo(48); // median of the last 7 nights (ages 33–39)
    expect(r.slope30).toBeCloseTo(15, 1);
    expect(r.trend).toBe('rising');
  });
  it('respects the item period and needs enough nights', () => {
    expect(leakByAge(nights, item({ endDate: '2026-01-05' })).trend).toBeUndefined();
    expect(leakByAge(nights, item({ startDate: '2026-02-05', endDate: '2026-02-09' })).points).toHaveLength(5);
    const flat = nights.map((n) => ({ ...n, leak: { average: 0, median: 0, p70: 40, p95: 40, max: 0 } }));
    expect(leakByAge(flat, item()).trend).toBe('flat');
  });
});

describe('nightFindings', () => {
  const base = { usage: 7, ahi: 1, leak: 40 };
  const ids = (n: NightSummary, ctx = {}) => nightFindings(n, { baseline: base, ...ctx }).map((f) => f.id);
  it('describes a normal night', () => {
    expect(ids(night('2026-03-05', 7.2, { ahi: 0.8, leak: { average: 0, median: 0, p70: 41, p95: 41, max: 0 } }))).toEqual(['usageOk', 'ahiLow']);
  });
  it('flags short use, in two degrees', () => {
    expect(ids(night('d', 3, { ahi: 1 }))[0]).toBe('usageShort');
    expect(ids(night('d', 1, { ahi: 1 }))[0]).toBe('usageVeryShort');
  });
  it('compares with the usual only on nights long enough to mean something', () => {
    expect(ids(night('d', 7, { ahi: 4 }))).toContain('ahiAboveUsual');
    expect(ids(night('d', 3, { ahi: 4 }))).not.toContain('ahiAboveUsual');
    expect(ids(night('d', 7, { ahi: 0.1 }), { baseline: { ...base, ahi: 2 } })).toContain('ahiBelowUsual');
    expect(ids(night('d', 7, { ahi: 7 }))).toContain('ahiMid');
    expect(ids(night('d', 7, { ahi: 20 }))).toContain('ahiHigh');
  });
  it('notices high leak, large-leak time, interruptions, periodic breathing and changes', () => {
    const n = night('2026-03-05', 7, { ahi: 1, reraIndex: 6, leak: { average: 0, median: 0, p70: 60, p95: 60, max: 0 } });
    const sessions = [{
      slices: [{ start: 0, end: 600_000, status: 'mask-on' as const }, { start: 600_000, end: 780_000, status: 'mask-off' as const }],
      events: [{ type: 'large-leak' as const, start: 0, duration: 400 }, { type: 'periodic-breathing' as const, start: 0, duration: 360 }],
    }];
    expect(nightFindings(night('d', 6.9333, { ahi: 1 }), { baseline: base })[0]!.params).toEqual({ hours: 6.9, minutes: 416 });
    const f = nightFindings(n, { baseline: base, sessions, changes: [{ date: '2026-03-05', changes: [{ key: 'pressure', from: 9, to: 10 }] }] });
    expect(f.map((x) => x.id)).toEqual(expect.arrayContaining(['leakHigh', 'largeLeak', 'maskOff', 'periodic', 'reraHigh', 'settingsChanged']));
    expect(f.find((x) => x.id === 'maskOff')!.params).toEqual({ count: 1, minutes: 3 });
    expect(f.find((x) => x.id === 'largeLeak')!.params).toEqual({ minutes: 7 });
  });
  it('does not call a small leak increase high', () => {
    expect(ids(night('d', 7, { ahi: 1, leak: { average: 0, median: 0, p70: 43, p95: 43, max: 0 } }))).not.toContain('leakHigh');
  });
});

describe('nightFindings: oximetry', () => {
  const base = { usage: 7, ahi: 1, leak: 40 };
  const withOx = (ox: Partial<NonNullable<NightSummary['oximetry']>>) => night('d', 7, { ahi: 1, oximetry: { seconds: 25000, desaturations3: 0, desaturations4: 0, spo2Min: 92, ...ox } });
  it('reports frequent desaturations, time at low oxygen and steady nights', () => {
    expect(nightFindings(withOx({ odi3: 8 }), { baseline: base }).map((f) => f.id)).toContain('desatFrequent');
    expect(nightFindings(withOx({ odi3: 1, t90: 12 }), { baseline: base }).map((f) => f.id)).toContain('lowOxygenTime');
    const steady = nightFindings(withOx({ odi3: 1, t90: 0.2 }), { baseline: base });
    expect(steady.find((f) => f.id === 'oxygenSteady')!.params).toEqual({ min: 92 });
  });
  it('says nothing about oxygen without an hour of data', () => {
    expect(nightFindings(withOx({ seconds: 600, odi3: 30 }), { baseline: base }).map((f) => f.id)).not.toContain('desatFrequent');
  });
});
