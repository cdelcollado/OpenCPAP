import type { Session } from '@opencpap/core';
import { intervalSeconds, summarizeSession, usageSeconds, weightedMean, weightedPercentile } from '@opencpap/core';

/**
 * Parsing and comparison of OSCAR's CSV export against sessions decoded by OpenCPAP.
 * The export has one row per session with the columns
 *   Date, Start, AHI, RDI, OAHI, CAHI, OA, UA, A, H, OH, CH, CA, RERA, Pressure_Avg/Min/Max/95th,
 *   Leak_Avg/Max/95th, SpO2_Avg/Min, Pulse_Avg, Hours, Hours_Used, Machine
 * `Date` is OSCAR's noon-to-noon day, `Start` is the session start in the exporting machine's local time zone.
 * There is no session id, so rows are matched by start time. See docs/oscar-comparison.md.
 */

export interface OscarRow {
  /** OSCAR day (YYYY-MM-DD) */
  date: string;
  /** session start, local time of the exporting machine (HH:MM:SS) */
  time: string;
  ahi: number;
  rdi: number;
  oa: number;
  ca: number;
  h: number;
  rera: number;
  leakAvg: number;
  leakMax: number;
  leak95: number;
  hours: number;
  hoursUsed: number;
  machine: string;
}

const num = (s: string | undefined) => (s === undefined || s.trim() === '' ? NaN : Number(s));

export function parseOscarCsv(text: string): OscarRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const need = ['date', 'start', 'ahi', 'hours_used'];
  const missing = need.filter((n) => col(n) < 0);
  if (missing.length) throw new Error(`Not a recognised OSCAR CSV export: missing column(s) ${missing.join(', ')}`);
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    const get = (n: string) => c[col(n)];
    return {
      date: get('date')!, time: get('start')!, ahi: num(get('ahi')), rdi: num(get('rdi')),
      oa: num(get('oa')), ca: num(get('ca')), h: num(get('h')), rera: num(get('rera')),
      leakAvg: num(get('leak_avg')), leakMax: num(get('leak_max')), leak95: num(get('leak_95th')),
      hours: num(get('hours')), hoursUsed: num(get('hours_used')), machine: get('machine') ?? '',
    };
  });
}

/** "YYYY-MM-DD HH:MM:SS" of an instant in a time zone (default: this machine's). */
export function localKey(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(ms).replace(/ /g, ' ');
}

const addDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);

/** The local timestamp of an OSCAR row. OSCAR's day starts at noon, so a start before 12:00 belongs to the next calendar date. */
export function oscarKey(row: Pick<OscarRow, 'date' | 'time'>): string {
  const hour = Number(row.time.slice(0, 2));
  return `${hour < 12 ? addDay(row.date) : row.date} ${row.time}`;
}

export interface MetricResult { name: string; compared: number; matched: number; maxAbsDiff: number; meanDiff: number; examples: string[] }
export interface Comparison {
  oscarRows: number;
  matched: number;
  /** OSCAR rows with no session starting at that time in our data */
  unmatchedOscar: string[];
  /** our sessions that OSCAR did not export */
  unmatchedOurs: number[];
  metrics: MetricResult[];
  timeZone: string;
}

export interface CompareOptions { timeZone?: string }

export function compareWithOscar(rows: OscarRow[], sessions: Session[], opts: CompareOptions = {}): Comparison {
  const tz = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  // OSCAR's session start is often 1 s earlier than ours (clock rounding), so each session is indexed at -1/0/+1 s.
  const byKey = new Map<string, Session>();
  for (const s of sessions) for (const d of [0, -1000, 1000]) if (!byKey.has(localKey(s.start + d, tz))) byKey.set(localKey(s.start + d, tz), s);
  const acc = new Map<string, MetricResult & { sum: number }>();
  const record = (name: string, label: string, ours: number, theirs: number, tol: number) => {
    if (Number.isNaN(theirs) || Number.isNaN(ours)) return;
    const m = acc.get(name) ?? { name, compared: 0, matched: 0, maxAbsDiff: 0, meanDiff: 0, examples: [], sum: 0 };
    acc.set(name, m);
    const d = ours - theirs;
    m.compared++;
    m.sum += d;
    m.maxAbsDiff = Math.max(m.maxAbsDiff, Math.abs(d));
    if (Math.abs(d) <= tol + 1e-9) m.matched++;
    else if (m.examples.length < 5) m.examples.push(`${label}: ours ${+ours.toFixed(3)} vs OSCAR ${+theirs.toFixed(3)}`);
  };

  const used = new Set<Session>();
  const unmatchedOscar: string[] = [];
  let matched = 0;
  for (const r of rows) {
    const s = byKey.get(oscarKey(r));
    if (!s) { unmatchedOscar.push(`${r.date} ${r.time}`); continue; }
    used.add(s);
    matched++;
    const label = `${r.date} ${r.time} (session ${s.id})`;
    const sum = summarizeSession(s);
    const hours = usageSeconds(s) / 3600;
    // OSCAR rounds hours to 2 decimals and rates to 2 decimals: tolerate the rounding step.
    // `Hours` is the time with the mask on; `Hours_Used` also counts the short mask-off gaps inside a session.
    record('hours with mask on', label, hours, r.hours, 0.006);
    record('hours incl. short gaps', label, (s.end - s.start) / 3600_000, r.hoursUsed, 0.006);
    record('AHI (events/h)', label, sum.ahi ?? 0, r.ahi, 0.011);
    record('RDI (incl. RERA)', label, hours > 0 ? ((sum.counts.obstructive ?? 0) + (sum.counts.central ?? 0) + (sum.counts.hypopnea ?? 0) + (sum.counts.rera ?? 0)) / hours : 0, r.rdi, 0.011);
    record('obstructive apnea count', label, sum.counts.obstructive ?? 0, r.oa, 0);
    record('central apnea count', label, sum.counts.central ?? 0, r.ca, 0);
    record('hypopnea count', label, sum.counts.hypopnea ?? 0, r.h, 0);
    record('RERA count', label, sum.counts.rera ?? 0, r.rera, 0);
    const leak = s.statistics.find((t) => t.channel === 'leak-total')?.values;
    if (leak?.length) {
      // OSCAR weights each interval by the time it covers; the last one is usually partial.
      const times = s.statistics.find((t) => t.channel === 'leak-total')!.times;
      const w = intervalSeconds(times, s.start);
      record('leak average (L/min)', label, weightedMean(leak, w), r.leakAvg, 0.5);
      record('leak maximum (L/min)', label, Math.max(...leak), r.leakMax, 0);
      record('leak 95th percentile (L/min)', label, weightedPercentile(leak, w, 95), r.leak95, 1);
    }
  }
  return {
    oscarRows: rows.length, matched, unmatchedOscar,
    unmatchedOurs: sessions.filter((s) => !used.has(s)).map((s) => s.id),
    metrics: [...acc.values()].map(({ sum, ...m }) => ({ ...m, meanDiff: m.compared ? sum / m.compared : 0 })),
    timeZone: tz,
  };
}

export function formatComparison(c: Comparison): string {
  const out = [
    `OSCAR rows: ${c.oscarRows}; matched by start time (${c.timeZone}): ${c.matched}`,
    ...(c.unmatchedOscar.length ? [`  not found in OpenCPAP: ${c.unmatchedOscar.slice(0, 8).join(', ')}${c.unmatchedOscar.length > 8 ? ` … (${c.unmatchedOscar.length})` : ''}`] : []),
    ...(c.unmatchedOurs.length ? [`  OpenCPAP sessions not in OSCAR's file: ${c.unmatchedOurs.length} (e.g. ${c.unmatchedOurs.slice(0, 8).join(', ')})`] : []),
  ];
  for (const m of c.metrics) {
    out.push(`${m.matched === m.compared ? 'OK  ' : 'DIFF'} ${m.name.padEnd(30)} ${String(m.matched).padStart(4)}/${String(m.compared).padEnd(4)} within tolerance, max |diff| ${+m.maxAbsDiff.toFixed(3)}, mean diff ${+m.meanDiff.toFixed(3)}`);
    for (const e of m.examples) out.push(`       ${e}`);
  }
  return out.join('\n');
}
