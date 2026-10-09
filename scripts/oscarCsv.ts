import type { Session } from '@opencpap/core';
import { summarizeSession, usageSeconds } from '@opencpap/core';

/**
 * Parsing and comparison of OSCAR's "Export CSV → Sessions" file against sessions decoded by OpenCPAP.
 * OSCAR writes one row per session: Date, Session (decimal id), Start, End, Total Time (hh:mm:ss), AHI,
 * then "<channel> Count" columns and pressure statistics. See docs/oscar-comparison.md.
 */

export interface OscarRow {
  session: number;
  /** wall-clock fields as written by OSCAR (local time of the machine that exported) */
  start: string;
  end: string;
  totalSeconds: number;
  ahi: number;
  /** all other numeric columns by (lower-cased) header */
  columns: Record<string, number>;
}

const num = (s: string | undefined) => (s === undefined || s.trim() === '' ? NaN : Number(s));

export function parseOscarSessionsCsv(text: string): OscarRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim());
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iSession = idx(/^session$/i);
  if (iSession < 0) throw new Error('Not an OSCAR "Sessions" export: no "Session" column (choose Sessions, not Summary)');
  const iStart = idx(/^start$/i), iEnd = idx(/^end$/i), iTotal = idx(/^total time$/i), iAhi = idx(/^ahi$/i);
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    const [h = 0, m = 0, s = 0] = (c[iTotal] ?? '').split(':').map(Number);
    const columns: Record<string, number> = {};
    header.forEach((name, i) => { if (![iSession, iStart, iEnd, iTotal, iAhi, 0].includes(i)) columns[name.toLowerCase()] = num(c[i]); });
    return { session: Number(c[iSession]), start: c[iStart]!, end: c[iEnd]!, totalSeconds: h * 3600 + m * 60 + s, ahi: num(c[iAhi]), columns };
  });
}

/** Finds the first column whose header matches. */
function column(row: OscarRow, re: RegExp): number | undefined {
  const key = Object.keys(row.columns).find((k) => re.test(k));
  return key === undefined ? undefined : row.columns[key];
}

/** "2026-03-25T21:12:37" → seconds, reading the fields as if they were UTC (no zone arithmetic). */
export const wallClockSeconds = (iso: string) => Date.parse(iso.length === 19 ? `${iso}Z` : iso) / 1000;

export interface MetricResult { name: string; compared: number; matched: number; maxAbsDiff: number; examples: string[] }
export interface Comparison {
  oscarSessions: number;
  matchedSessions: number;
  missingInOurs: number[];
  metrics: MetricResult[];
  /** histogram of (OSCAR start − our start) in whole hours: reveals how OSCAR shifted the device clock */
  startOffsetHours: Record<string, number>;
}

export function compareWithOscar(rows: OscarRow[], sessions: Session[], opts: { secondsTolerance?: number; ahiTolerance?: number } = {}): Comparison {
  const secTol = opts.secondsTolerance ?? 2;
  const ahiTol = opts.ahiTolerance ?? 0.05;
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const metrics = new Map<string, MetricResult>();
  const metric = (name: string) => metrics.get(name) ?? (metrics.set(name, { name, compared: 0, matched: 0, maxAbsDiff: 0, examples: [] }), metrics.get(name)!);
  const record = (name: string, id: number, ours: number, theirs: number, tol: number) => {
    const m = metric(name);
    const d = Math.abs(ours - theirs);
    m.compared++;
    m.maxAbsDiff = Math.max(m.maxAbsDiff, d);
    if (d <= tol) m.matched++;
    else if (m.examples.length < 5) m.examples.push(`session ${id}: ours ${+ours.toFixed(3)} vs OSCAR ${+theirs.toFixed(3)}`);
  };

  const missing: number[] = [];
  const hist: Record<string, number> = {};
  let matched = 0;
  for (const r of rows) {
    const s = byId.get(r.session);
    if (!s) { missing.push(r.session); continue; }
    matched++;
    const sum = summarizeSession(s);
    const span = (s.end - s.start) / 1000;
    // OSCAR's "Total Time" is either the span or the mask-on time depending on version/session; accept the closer one.
    const ours = [usageSeconds(s), span].sort((a, b) => Math.abs(a - r.totalSeconds) - Math.abs(b - r.totalSeconds))[0]!;
    record('total time (s)', r.session, ours, r.totalSeconds, secTol);
    record('mask-on time (s) vs OSCAR total', r.session, usageSeconds(s), r.totalSeconds, secTol);
    if (!Number.isNaN(r.ahi)) record('AHI', r.session, sum.ahi ?? 0, r.ahi, ahiTol);
    const counts: [string, RegExp, number][] = [
      ['obstructive count', /obstructive/, sum.counts.obstructive ?? 0],
      ['clear airway count', /clear ?airway/, sum.counts.central ?? 0],
      ['hypopnea count', /^hypopnea/, sum.counts.hypopnea ?? 0],
      ['RERA count', /rera|respiratory effort/, sum.counts.rera ?? 0],
      ['flow limitation count', /flow limit/, sum.counts['flow-limitation'] ?? 0],
    ];
    for (const [name, re, mine] of counts) {
      const v = column(r, re);
      if (v !== undefined && !Number.isNaN(v)) record(name, r.session, mine, v, 0);
    }
    const off = Math.round((wallClockSeconds(r.start) - s.start / 1000) / 3600);
    hist[off] = (hist[off] ?? 0) + 1;
  }
  return { oscarSessions: rows.length, matchedSessions: matched, missingInOurs: missing, metrics: [...metrics.values()], startOffsetHours: hist };
}

export function formatComparison(c: Comparison): string {
  const out = [`OSCAR sessions: ${c.oscarSessions}, found in OpenCPAP: ${c.matchedSessions}` + (c.missingInOurs.length ? `, missing: ${c.missingInOurs.slice(0, 10).join(',')}${c.missingInOurs.length > 10 ? '…' : ''}` : '')];
  for (const m of c.metrics) {
    out.push(`${m.matched === m.compared ? 'OK  ' : 'DIFF'} ${m.name.padEnd(34)} ${m.matched}/${m.compared} match, max |diff| ${+m.maxAbsDiff.toFixed(3)}`);
    for (const e of m.examples) out.push(`       ${e}`);
  }
  out.push(`OSCAR start − device start (hours, histogram): ${JSON.stringify(c.startOffsetHours)}`);
  return out.join('\n');
}
