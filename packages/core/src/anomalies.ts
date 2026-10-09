import { addDays, daysBetween } from './compare';
import type { NightSummary } from './nights';
import { percentile } from './nights';

export type AnomalyLevel = 'warn' | 'info';
/** A language-neutral observation worth a look. `dates` lists the nights involved (most recent last). */
export interface Anomaly { id: string; level: AnomalyLevel; dates: string[]; params: Record<string, number> }

const median = (xs: number[]) => (xs.length ? percentile(xs, 50) : undefined);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/**
 * Looks at the most recent nights for patterns that deserve attention. Rules (all relative to the user's own history,
 * all anchored on the latest night so results do not depend on today's clock):
 * - `missedNights`: 3 or more of the last 7 calendar nights have no data, though use was regular before.
 * - `shortRun`: the last 3 nights with data were all under 4 h.
 * - `leakRise`: the median 95 % leak of the last 3 nights is ≥ 1.4× the median of the 30 nights before and ≥ 8 L/min above it.
 * - `ahiRise`: the mean AHI of the last 7 nights is ≥ 2× the mean of the 30 before and ≥ 2 above it.
 * They are prompts to look at the data, never a diagnosis; the app words them neutrally.
 */
export function detectAnomalies(all: NightSummary[]): Anomaly[] {
  const nights = [...all].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (nights.length < 10) return [];
  const last = nights.at(-1)!.date;
  const out: Anomaly[] = [];

  // missed nights in the last 7 calendar days, if use was regular before
  const have = new Set(nights.map((n) => n.date));
  const missed: string[] = [];
  for (let i = 0; i < 7; i++) { const d = addDays(last, -i); if (!have.has(d)) missed.push(d); }
  const before = nights.filter((n) => daysBetween(n.date, last) >= 7 && daysBetween(n.date, last) < 37);
  const regular = before.length >= 14;
  if (missed.length >= 3 && regular) out.push({ id: 'missedNights', level: 'warn', dates: missed.reverse(), params: { missed: missed.length, days: 7 } });

  const lastThree = nights.slice(-3);
  if (lastThree.every((n) => n.usageHours < 4)) out.push({ id: 'shortRun', level: 'warn', dates: lastThree.map((n) => n.date), params: { nights: 3 } });

  const prior = nights.slice(-33, -3);
  const leakNow = median(lastThree.map((n) => n.leak?.p95).filter((v): v is number => v !== undefined));
  const leakThen = median(prior.map((n) => n.leak?.p95).filter((v): v is number => v !== undefined));
  if (leakNow !== undefined && leakThen !== undefined && prior.length >= 10 && leakNow >= leakThen * 1.4 && leakNow - leakThen >= 8) {
    out.push({ id: 'leakRise', level: 'warn', dates: lastThree.map((n) => n.date), params: { now: Math.round(leakNow), usual: Math.round(leakThen) } });
  }

  const week = nights.slice(-7);
  const prior30 = nights.slice(-37, -7);
  const ahiNow = mean(week.filter((n) => n.usageHours >= 2).map((n) => n.ahi).filter((v): v is number => v !== undefined));
  const ahiThen = mean(prior30.filter((n) => n.usageHours >= 2).map((n) => n.ahi).filter((v): v is number => v !== undefined));
  if (ahiNow !== undefined && ahiThen !== undefined && prior30.length >= 10 && ahiNow >= ahiThen * 2 && ahiNow - ahiThen >= 2) {
    out.push({ id: 'ahiRise', level: 'warn', dates: week.map((n) => n.date), params: { now: Math.round(ahiNow * 10) / 10, usual: Math.round(ahiThen * 10) / 10 } });
  }
  return out;
}
