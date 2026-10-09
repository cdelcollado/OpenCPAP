import type { NightSummary } from '@opencpap/core';
import type { Level } from '../../components/Badge';

/** AHI bands used for the status chip. They are visual hints (a common reading aid), not a diagnosis. */
export function ahiLevel(ahi: number | undefined): Level {
  if (ahi === undefined) return 'neutral';
  return ahi < 5 ? 'good' : ahi < 15 ? 'warn' : 'bad';
}

export function usageLevel(hours: number): Level {
  return hours >= 4 ? 'good' : 'warn';
}

const mean = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

export interface Baseline { usage?: number; ahi?: number; leak?: number; flat?: number; nights: number }

/** Averages of the (up to) `n` nights before the last one: what "last night" is compared against. */
export function baseline(nights: NightSummary[], n = 30): Baseline {
  const prev = nights.slice(Math.max(0, nights.length - 1 - n), -1);
  return { usage: mean(prev.map((x) => x.usageHours)), ahi: mean(prev.map((x) => x.ahi)), leak: mean(prev.map((x) => x.leak?.p95)), flat: mean(prev.map((x) => x.breathing?.flatShare)), nights: prev.length };
}

export type HeatMetric = 'usage' | 'ahi' | 'leak';

export function heatValue(n: NightSummary, metric: HeatMetric): number | undefined {
  return metric === 'usage' ? n.usageHours : metric === 'ahi' ? n.ahi : n.leak?.p95;
}

/** Colour-scale domain per metric: fixed floors keep a calm series from looking dramatic. */
export function heatDomain(nights: NightSummary[], metric: HeatMetric): [number, number] {
  const vals = nights.map((n) => heatValue(n, metric)).filter((v): v is number => v !== undefined);
  const max = vals.length ? Math.max(...vals) : 1;
  if (metric === 'usage') return [0, Math.max(10, max)];
  if (metric === 'ahi') return [0, Math.max(5, max)];
  const min = vals.length ? Math.min(...vals) : 0;
  return [Math.max(0, Math.floor(min / 10) * 10), Math.max(min + 10, Math.ceil(max / 10) * 10)];
}

/** Calendar months covered by the nights (YYYY-MM, ascending), including empty months in between. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number) as [number, number];
  const [ly, lm] = last.split('-').map(Number) as [number, number];
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Weekday of the 1st of the month, Monday = 0 … Sunday = 6. */
export function firstWeekday(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}
