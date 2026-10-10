import type { EventType } from './model';
import { percentile, type NightSummary } from './nights';

export interface PeriodStats {
  /** nights with data */
  nights: number;
  totalHours: number;
  usageMean?: number;
  usageMedian?: number;
  nightsOverMin: number;
  /** nightsOverMin / nights, 0..1 */
  compliance?: number;
  /** all apneas and hypopneas / total hours of use */
  ahi?: number;
  /** median of the nightly AHI */
  ahiMedian?: number;
  /** events per hour of use, by type */
  rates: Partial<Record<EventType, number>>;
  /** median of the nightly 70th-percentile leak (L/min), the figure the leak reference uses */
  leakP70?: number;
  /** median of the nightly 95th-percentile leak (L/min) */
  leakP95?: number;
  /** median of the nightly median leak (L/min) */
  leakMedian?: number;
}

const median = (xs: number[]) => (xs.length ? percentile(xs, 50) : undefined);
const defined = (xs: (number | undefined)[]) => xs.filter((x): x is number => x !== undefined && !Number.isNaN(x));

/** Nights whose date is within [from, to] (inclusive, YYYY-MM-DD). */
export const nightsInRange = (nights: NightSummary[], from: string, to: string) => nights.filter((n) => n.date >= from && n.date <= to);

export function periodStats(nights: NightSummary[], minHours = 4): PeriodStats {
  const usage = nights.map((n) => n.usageHours);
  const totalHours = usage.reduce((a, b) => a + b, 0);
  const counts: Partial<Record<EventType, number>> = {};
  for (const n of nights) for (const [k, v] of Object.entries(n.counts)) counts[k as EventType] = (counts[k as EventType] ?? 0) + v;
  const rates: Partial<Record<EventType, number>> = {};
  if (totalHours > 0) for (const [k, v] of Object.entries(counts)) rates[k as EventType] = v / totalHours;
  const apneas = (counts.obstructive ?? 0) + (counts.central ?? 0) + (counts.hypopnea ?? 0) + (counts['unclassified-apnea'] ?? 0);
  const over = usage.filter((h) => h >= minHours).length;
  return {
    nights: nights.length, totalHours, usageMean: nights.length ? totalHours / nights.length : undefined, usageMedian: median(usage),
    nightsOverMin: over, compliance: nights.length ? over / nights.length : undefined,
    ahi: totalHours > 0 ? apneas / totalHours : undefined,
    ahiMedian: median(defined(nights.map((n) => n.ahi))),
    rates,
    leakP70: median(defined(nights.map((n) => n.leak?.p70))),
    leakP95: median(defined(nights.map((n) => n.leak?.p95))),
    leakMedian: median(defined(nights.map((n) => n.leak?.median))),
  };
}

export interface PeriodComparison {
  a: PeriodStats;
  b: PeriodStats;
  /** b − a for the numeric metrics (undefined when either side lacks data) */
  delta: { usageMean?: number; compliance?: number; ahi?: number; ahiMedian?: number; leakP95?: number; leakMedian?: number; rates: Partial<Record<EventType, number>> };
}

const diff = (a?: number, b?: number) => (a === undefined || b === undefined ? undefined : b - a);

/** Compares two periods; `delta` is how much `b` differs from `a` (positive = higher in `b`). */
export function comparePeriods(a: PeriodStats, b: PeriodStats): PeriodComparison {
  const rates: Partial<Record<EventType, number>> = {};
  for (const k of new Set([...Object.keys(a.rates), ...Object.keys(b.rates)]) as Set<EventType>) rates[k] = (b.rates[k] ?? 0) - (a.rates[k] ?? 0);
  return {
    a, b,
    delta: { usageMean: diff(a.usageMean, b.usageMean), compliance: diff(a.compliance, b.compliance), ahi: diff(a.ahi, b.ahi), ahiMedian: diff(a.ahiMedian, b.ahiMedian), leakP95: diff(a.leakP95, b.leakP95), leakMedian: diff(a.leakMedian, b.leakMedian), rates },
  };
}

const DAY = 86400_000;
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The `days` calendar days ending at `end` and the `days` before them: the usual "recent vs previous" comparison. */
export function recentVersusPrevious(end: string, days: number): { a: [string, string]; b: [string, string] } {
  const bFrom = addDays(end, -(days - 1));
  const aTo = addDays(bFrom, -1);
  return { a: [addDays(aTo, -(days - 1)), aTo], b: [bFrom, end] };
}

/** `days` days before a change and `days` days from the change date on (the change night is the first of "after"). */
export function aroundChange(changeDate: string, days: number): { a: [string, string]; b: [string, string] } {
  return { a: [addDays(changeDate, -days), addDays(changeDate, -1)], b: [changeDate, addDays(changeDate, days - 1)] };
}
