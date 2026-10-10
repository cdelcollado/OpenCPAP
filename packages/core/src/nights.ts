import type { EventType, Session, SessionSettings, TimeSeries } from './model';
import type { OximetryStats } from './oximetry';
import { usageSeconds } from './stats';

/** A session without its bulky waveforms: what the dashboard and the database list work with. */
export type SessionLite = Omit<Session, 'waveforms'>;

/** Linear-interpolation percentile (p in 0..100) of a numeric list; NaN for an empty list. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Percentile of values that each cover a different amount of time (nearest rank on the cumulative weight):
 * the smallest value whose cumulative weight reaches p % of the total. This matches OSCAR's time-weighted
 * statistics (a 31 s partial interval counts for less than a full 120 s one). Equal weights are used when the
 * total weight is not positive.
 */
export function weightedPercentile(values: ArrayLike<number>, weights: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, weights[i]!);
  const equal = total <= 0;
  const w = (i: number) => (equal ? 1 : Math.max(0, weights[i]!));
  if (equal) total = n;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const target = (Math.min(100, Math.max(0, p)) / 100) * total;
  let cum = 0;
  for (const i of order) {
    cum += w(i);
    if (cum >= target - 1e-9) return values[i]!;
  }
  return values[order[n - 1]!]!;
}

export function weightedMean(values: ArrayLike<number>, weights: ArrayLike<number>): number {
  let sum = 0, total = 0;
  for (let i = 0; i < values.length; i++) { const w = Math.max(0, weights[i]!); sum += values[i]! * w; total += w; }
  if (total > 0) return sum / total;
  if (values.length === 0) return NaN;
  let plain = 0;
  for (let i = 0; i < values.length; i++) plain += values[i]!;
  return plain / values.length;
}

/**
 * Seconds covered by each sample of a statistics series: from the previous sample (or from `startMs` for the first
 * one) to its own time. The last interval of a session is usually shorter than a full interval.
 */
export function intervalSeconds(times: ArrayLike<number>, startMs: number): number[] {
  return Array.from({ length: times.length }, (_, i) => Math.max(0, (times[i]! - (i === 0 ? startMs : times[i - 1]!)) / 1000));
}

const HALF_DAY_MS = 12 * 3600_000;

/**
 * The "night" a session belongs to, as YYYY-MM-DD: the calendar date of (start − 12 h), so a session that begins
 * at 23:00 on the 5th and one that begins at 03:00 on the 6th are both night 2026-xx-05 (OSCAR uses the same
 * noon-to-noon split). Timestamps are read as wall-clock fields (UTC accessors), see `Session.clock`.
 */
export function nightOf(startMs: number): string {
  return new Date(startMs - HALF_DAY_MS).toISOString().slice(0, 10);
}

/**
 * Therapy pressure the device was configured for, ignoring the ramp: a fixed value, or the min/max of an
 * auto-titrating or bi-level mode. Returns undefined when the settings do not say.
 */
export function configuredPressure(settings: SessionLite['settings']): { min: number; max: number } | undefined {
  const n = (k: string) => (typeof settings[k] === 'number' ? (settings[k] as number) : undefined);
  const pairs: [string, string][] = [['pressureMin', 'pressureMax'], ['epap', 'ipap'], ['epapMin', 'ipapMax']];
  for (const [a, b] of pairs) {
    const lo = n(a), hi = n(b);
    if (lo !== undefined && hi !== undefined) return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  const fixed = n('pressure');
  return fixed === undefined ? undefined : { min: fixed, max: fixed };
}

/** Night-level view of the sessions' breath analyses, weighted by the number of breaths (periodicity by seconds). */
export interface NightBreathing { breaths: number; seconds: number; rate?: number; periodCv?: number; volumeCv?: number; shape?: number; flatShare?: number; ieRatio?: number; periodicityShare: number }

function nightBreathing(sessions: SessionLite[]): NightBreathing | undefined {
  const a = sessions.map((s) => s.analysis?.breathing).filter((x): x is NonNullable<typeof x> => !!x && x.breaths > 0);
  if (a.length === 0) return undefined;
  const breaths = a.reduce((t, x) => t + x.breaths, 0), seconds = a.reduce((t, x) => t + x.seconds, 0);
  const wmean = (pick: (x: (typeof a)[number]) => number | undefined) => {
    let sum = 0, w = 0;
    for (const x of a) { const v = pick(x); if (v !== undefined && !Number.isNaN(v)) { sum += v * x.breaths; w += x.breaths; } }
    return w ? sum / w : undefined;
  };
  return {
    breaths, seconds, rate: wmean((x) => x.rate), periodCv: wmean((x) => x.periodCv), volumeCv: wmean((x) => x.volumeCv),
    shape: wmean((x) => x.shape), flatShare: wmean((x) => x.flatShare), ieRatio: wmean((x) => x.ieRatio),
    periodicityShare: a.reduce((t, x) => t + x.periodicityShare * x.seconds, 0) / seconds,
  };
}

const seriesOf = (s: SessionLite, channel: TimeSeries['channel']) => s.statistics.find((t) => t.channel === channel);

/**
 * The leak statistics of a session: total leak (Philips) when present, otherwise unintentional leak (ResMed).
 * The two are different quantities (see `TimeSeries`), which is why nights record which kind they hold.
 */
export const leakSeriesOf = (s: Pick<SessionLite, 'statistics'>) =>
  s.statistics.find((t) => t.channel === 'leak-total') ?? s.statistics.find((t) => t.channel === 'leak-unintentional');

export interface NightSummary {
  /** YYYY-MM-DD, see `nightOf` */
  date: string;
  sessionIds: number[];
  /** first mask-on to last session end (ms) */
  start: number;
  end: number;
  usageHours: number;
  counts: Partial<Record<EventType, number>>;
  /** (OA + CA + H + UA) / usageHours */
  ahi?: number;
  /** RERA per hour (not part of the AHI) */
  reraIndex?: number;
  /** total leak statistics in L/min, weighted by the time each interval covers (as OSCAR does) */
  /** `p70` is the 70th percentile: the figure ResMed's own seal rule uses (see reference.ts) */
  leak?: { average: number; median: number; p70: number; p95: number; max: number };
  /** which leak the figures above describe: `total` (includes the vent flow) or `unintentional` (vent flow subtracted) */
  leakKind?: 'total' | 'unintentional';
  /** therapy pressure in cmH2O: the configured pressure (min/max for auto and bi-level modes), without the ramp */
  pressure?: { min: number; max: number; median: number };
  /** snore events reported per hour */
  snoreIndex?: number;
  /** device mode of the first session */
  mode?: string;
  /** manufacturer of the first session's device (selects the reference ranges, see reference.ts) */
  manufacturer?: string;
  /** therapy settings of the first session of the night (used to detect setting changes) */
  settings: SessionSettings;
  /** experimental breath analysis over all sessions of the night that have flow data */
  breathing?: NightBreathing;
  /** statistics of a separate pulse-oximeter recording of this night, when one was imported */
  oximetry?: OximetryStats;
  hasWaveforms: boolean;
}

function mergeCounts(sessions: SessionLite[]) {
  const counts: Partial<Record<EventType, number>> = {};
  for (const s of sessions) for (const e of s.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

export function summarizeNight(date: string, sessions: SessionLite[], opts: { hasWaveforms?: boolean; oximetry?: OximetryStats } = {}): NightSummary {
  const usage = sessions.reduce((a, s) => a + usageSeconds(s), 0) / 3600;
  const counts = mergeCounts(sessions);
  const apneas = (counts.obstructive ?? 0) + (counts.central ?? 0) + (counts.hypopnea ?? 0) + (counts['unclassified-apnea'] ?? 0);

  const leaks: number[] = [];
  const leakWeights: number[] = [];
  const pressures: number[] = [];
  let snores = 0;
  for (const s of sessions) {
    const leak = leakSeriesOf(s);
    if (leak) {
      leaks.push(...leak.values);
      leakWeights.push(...intervalSeconds(leak.times, s.start));
    }
    const sn = seriesOf(s, 'snore-count');
    if (sn) for (const v of sn.values) snores += v;
    const cfg = configuredPressure(s.settings);
    if (cfg) pressures.push(cfg.min, cfg.max);
    else {
      // no settings: fall back to the pressure changes the device logged (includes the ramp)
      const set = seriesOf(s, 'pressure-set') ?? seriesOf(s, 'epap-set');
      if (set) pressures.push(...set.values);
    }
  }
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  return {
    date,
    sessionIds: sorted.map((s) => s.id),
    start: sorted[0]?.start ?? 0,
    end: Math.max(...sorted.map((s) => s.end)),
    usageHours: usage,
    counts,
    ahi: usage > 0 ? apneas / usage : undefined,
    reraIndex: usage > 0 ? (counts.rera ?? 0) / usage : undefined,
    leak: leaks.length ? { average: weightedMean(leaks, leakWeights), median: weightedPercentile(leaks, leakWeights, 50), p70: weightedPercentile(leaks, leakWeights, 70), p95: weightedPercentile(leaks, leakWeights, 95), max: Math.max(...leaks) } : undefined,
    leakKind: leaks.length ? (sessions.some((s) => seriesOf(s, 'leak-total')) ? 'total' : 'unintentional') : undefined,
    pressure: pressures.length ? { min: Math.min(...pressures), max: Math.max(...pressures), median: percentile(pressures, 50) } : undefined,
    snoreIndex: usage > 0 && snores > 0 ? snores / usage : undefined,
    mode: typeof sorted[0]?.settings.mode === 'string' ? sorted[0].settings.mode : undefined,
    manufacturer: sorted[0]?.device.manufacturer,
    settings: sorted[0]?.settings ?? {},
    breathing: nightBreathing(sessions),
    oximetry: opts.oximetry,
    hasWaveforms: opts.hasWaveforms ?? false,
  };
}

/** Groups sessions into nights (ascending by date). */
export function groupNights(sessions: SessionLite[], waveformSessionIds: ReadonlySet<number> = new Set(), oximetry: ReadonlyMap<string, OximetryStats> = new Map()): NightSummary[] {
  const by = new Map<string, SessionLite[]>();
  for (const s of sessions) {
    const k = nightOf(s.start);
    (by.get(k) ?? by.set(k, []).get(k)!).push(s);
  }
  return [...by]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => summarizeNight(date, list, { hasWaveforms: list.some((s) => waveformSessionIds.has(s.id)), oximetry: oximetry.get(date) }));
}

export interface Compliance {
  /** calendar nights in the window */
  nights: number;
  /** nights with at least `minHours` of use */
  compliantNights: number;
  /** compliantNights / nights, 0..1 */
  ratio: number;
  averageHours: number;
  /** meets the common "≥ 4 h on ≥ 70 % of nights" rule */
  meetsCommonRule: boolean;
}

const DAY_MS = 86400_000;

/**
 * Compliance over the `days` calendar nights ending at `endDate` (inclusive). Nights without data count as 0 h.
 */
export function compliance(nights: NightSummary[], endDate: string, days = 30, minHours = 4): Compliance {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const byDate = new Map(nights.map((n) => [n.date, n]));
  let ok = 0, total = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(end - i * DAY_MS).toISOString().slice(0, 10);
    total += byDate.get(d)?.usageHours ?? 0;
    if ((byDate.get(d)?.usageHours ?? 0) >= minHours) ok++;
  }
  const ratio = days > 0 ? ok / days : 0;
  return { nights: days, compliantNights: ok, ratio, averageHours: days > 0 ? total / days : 0, meetsCommonRule: ratio >= 0.7 };
}
