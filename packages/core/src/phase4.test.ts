import { describe, expect, it } from 'vitest';
import { addDays } from './compare';
import { detectAnomalies } from './anomalies';
import type { NightSummary } from './nights';
import { histogram, rollingMean } from './trends';

const night = (date: string, usageHours: number, o: Partial<NightSummary> = {}): NightSummary => ({
  date, sessionIds: [1], start: 0, end: 0, usageHours, counts: {}, hasWaveforms: false, settings: {}, ahi: 1, leak: { average: 30, median: 30, p70: 40, p95: 40, max: 50 }, ...o,
});
/** `n` consecutive nights ending at `end`, built by `make(i)` (i = 0 for the oldest) */
const run = (end: string, n: number, make: (i: number, date: string) => NightSummary) => Array.from({ length: n }, (_, i) => { const d = addDays(end, -(n - 1 - i)); return make(i, d); });

describe('rollingMean', () => {
  it('averages the last window values and waits for enough data', () => {
    expect(rollingMean([1, 2, 3, 4, 5], 3, 3)).toEqual([undefined, undefined, 2, 3, 4]);
  });
  it('skips missing values without counting them as zero', () => {
    expect(rollingMean([2, undefined, 4, null, 6], 3, 3)).toEqual([undefined, undefined, undefined, undefined, 4]); // 3 real values needed
    expect(rollingMean([2, undefined, 4, null, 6], 3, 2)).toEqual([undefined, undefined, 3, 3, 4]);
  });
  it('is empty for empty input', () => expect(rollingMean([], 7)).toEqual([]));
});

describe('histogram', () => {
  it('counts into bins and keeps out-of-range values at the ends', () => {
    const h = histogram([0.5, 1, 1.9, 2, 5, 99, -3, undefined, NaN], [0, 1, 2, 3]);
    expect(h.counts).toEqual([2, 2, 3]); // [-3, 0.5] | [1, 1.9] | [2, 5, 99]
    expect(h.total).toBe(7);
  });
  it('handles no data', () => expect(histogram([], [0, 1]).counts).toEqual([0]));
});

describe('detectAnomalies', () => {
  const steady = (end = '2026-03-31', n = 40) => run(end, n, (_i, d) => night(d, 7));
  const ids = (ns: NightSummary[]) => detectAnomalies(ns).map((a) => a.id);

  it('has nothing to say about a steady history or too little data', () => {
    expect(ids(steady())).toEqual([]);
    expect(ids(steady('2026-03-31', 5))).toEqual([]);
  });
  it('notices missed nights after regular use', () => {
    const ns = steady().filter((n) => !['2026-03-26', '2026-03-28', '2026-03-29'].includes(n.date));
    const a = detectAnomalies(ns).find((x) => x.id === 'missedNights')!;
    expect(a.params).toEqual({ missed: 3, days: 7 });
    expect(a.dates).toEqual(['2026-03-26', '2026-03-28', '2026-03-29']);
  });
  it('does not call it missed nights when use was never regular', () => {
    const sparse = run('2026-03-31', 40, (_i, d) => night(d, 7)).filter((_n, i) => i % 3 === 0 || i > 36);
    expect(ids(sparse)).not.toContain('missedNights');
  });
  it('notices three short nights in a row', () => {
    const ns = steady().map((n) => (n.date >= '2026-03-29' ? { ...n, usageHours: 2.5 } : n));
    expect(ids(ns)).toContain('shortRun');
    expect(ids(steady().map((n) => (n.date >= '2026-03-30' ? { ...n, usageHours: 2.5 } : n)))).not.toContain('shortRun');
  });
  it('notices a leak rise but not a small one', () => {
    const rise = steady().map((n) => (n.date >= '2026-03-29' ? { ...n, leak: { average: 0, median: 0, p70: 60, p95: 60, max: 70 } } : n));
    const a = detectAnomalies(rise).find((x) => x.id === 'leakRise')!;
    expect(a.params).toEqual({ now: 60, usual: 40 });
    const small = steady().map((n) => (n.date >= '2026-03-29' ? { ...n, leak: { average: 0, median: 0, p70: 46, p95: 46, max: 70 } } : n));
    expect(ids(small)).not.toContain('leakRise');
  });
  it('notices an AHI rise over the last week', () => {
    const ns = steady().map((n) => (n.date >= '2026-03-25' ? { ...n, ahi: 5 } : n));
    expect(detectAnomalies(ns).find((x) => x.id === 'ahiRise')!.params).toEqual({ now: 5, usual: 1 });
    expect(ids(steady().map((n) => (n.date >= '2026-03-25' ? { ...n, ahi: 2.5 } : n)))).not.toContain('ahiRise');
  });
  it('ignores very short nights when judging the AHI', () => {
    const ns = steady().map((n) => (n.date >= '2026-03-25' ? { ...n, ahi: 9, usageHours: 1 } : n));
    expect(ids(ns)).not.toContain('ahiRise');
  });
});
