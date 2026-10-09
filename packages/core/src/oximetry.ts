import { nightOf } from './nights';

/**
 * Pulse-oximeter recordings (SpO2 and pulse rate) from a separate device such as a Wellue/Viatom ring. The CPAP
 * itself records no oxygen data. Times are wall-clock like everything else: the oximeter's clock and the CPAP's clock
 * are compared as they are, and a correction in minutes can be applied when they disagree.
 */

export interface OximetryRecording {
  /** sample times, epoch ms read with UTC accessors (wall-clock), ascending */
  times: Float64Array;
  /** % saturation; NaN when the sensor reported an invalid value */
  spo2: Float32Array;
  /** beats per minute; NaN when invalid */
  pulse: Float32Array;
}

export interface OximetryParse {
  recording: OximetryRecording;
  /** which timestamp layout was recognised */
  format: 'iso' | 'time-month-day-year' | 'month-day-year-time' | 'day-month-year' | 'month-day-year';
  /** true when day/month order could not be told from the data and day-first was assumed */
  ambiguousDate: boolean;
  /** rows ignored because the time or both values could not be read */
  skipped: number;
  columns: { time: string; spo2: string; pulse?: string };
}

export class OximetryParseError extends Error {}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2}):(\d{2})/;
const RE_TMDY = /^(\d{1,2}):(\d{2}):(\d{2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/;
const RE_MDYT = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/;
const RE_NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i;

const utc = (y: number, mo: number, d: number, h: number, mi: number, s: number) => Date.UTC(y, mo, d, h, mi, s);
const hour12 = (h: number, ap?: string) => (ap ? (h % 12) + (ap.toUpperCase() === 'PM' ? 12 : 0) : h);

type Layout = OximetryParse['format'];
interface Parsed { ms: number; layout: Layout; a?: number; b?: number }

function parseTime(raw: string, dayFirst: boolean): Parsed | undefined {
  const s = raw.trim().replace(/^"|"$/g, '');
  let m = RE_ISO.exec(s);
  if (m) return { ms: utc(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!), layout: 'iso' };
  m = RE_TMDY.exec(s);
  if (m && MONTHS[m[4]!.toLowerCase()] !== undefined) return { ms: utc(+m[6]!, MONTHS[m[4]!.toLowerCase()]!, +m[5]!, +m[1]!, +m[2]!, +m[3]!), layout: 'time-month-day-year' };
  m = RE_MDYT.exec(s);
  if (m && MONTHS[m[1]!.toLowerCase()] !== undefined) return { ms: utc(+m[3]!, MONTHS[m[1]!.toLowerCase()]!, +m[2]!, +m[4]!, +m[5]!, +m[6]!), layout: 'month-day-year-time' };
  m = RE_NUMERIC.exec(s);
  if (m) {
    const a = +m[1]!, b = +m[2]!, y = +m[3]!, h = hour12(+m[4]!, m[7]), mi = +m[5]!, sec = m[6] ? +m[6] : 0;
    const [day, month] = dayFirst ? [a, b] : [b, a];
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    return { ms: utc(y, month - 1, day, h, mi, sec), layout: dayFirst ? 'day-month-year' : 'month-day-year', a, b };
  }
  return undefined;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Reads an oximeter CSV export. The header is required; columns are found by name (time, SpO2/oxygen, pulse). */
export function parseOximetryCsv(text: string, opts: { dayFirst?: boolean } = {}): OximetryParse {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 3) throw new OximetryParseError('The file has no data rows');
  const sep = [',', ';', '\t'].map((c) => [c, lines[0]!.split(c).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const header = splitLine(lines[0]!, sep);
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iTime = find(/time|date|stamp/i), iSpo2 = find(/spo2|oxygen|o2|saturation/i), iPulse = find(/pulse|\bpr\b|heart|bpm/i);
  if (iTime < 0 || iSpo2 < 0) throw new OximetryParseError('Could not find a time column and an SpO2 / oxygen column in the header');

  // decide day-first versus month-first for all-numeric dates by looking at every row
  const rows = lines.slice(1).map((l) => splitLine(l, sep));
  let dayFirst = opts.dayFirst ?? true, ambiguous = true;
  for (const r of rows) {
    const m = RE_NUMERIC.exec((r[iTime] ?? '').trim());
    if (!m) continue;
    if (+m[1]! > 12) { dayFirst = true; ambiguous = false; break; }
    if (+m[2]! > 12) { dayFirst = false; ambiguous = false; break; }
  }

  const pts: { t: number; s: number; p: number }[] = [];
  let skipped = 0, layout: Layout | undefined;
  for (const r of rows) {
    const t = parseTime(r[iTime] ?? '', dayFirst);
    const s = Number(r[iSpo2]), p = iPulse >= 0 ? Number(r[iPulse]) : NaN;
    if (!t || (Number.isNaN(s) && Number.isNaN(p))) { skipped++; continue; }
    layout ??= t.layout;
    pts.push({ t: t.ms, s: s >= 50 && s <= 100 ? s : NaN, p: p >= 20 && p <= 250 ? p : NaN });
  }
  if (pts.length < 2 || !layout) throw new OximetryParseError('No readable rows: check that the times look like 2026-03-05 22:15:30');
  pts.sort((a, b) => a.t - b.t);
  const uniq = pts.filter((p, i) => i === 0 || p.t > pts[i - 1]!.t);
  return {
    recording: { times: Float64Array.from(uniq, (p) => p.t), spo2: Float32Array.from(uniq, (p) => p.s), pulse: Float32Array.from(uniq, (p) => p.p) },
    format: layout, ambiguousDate: layout === 'day-month-year' || layout === 'month-day-year' ? ambiguous : false, skipped,
    columns: { time: header[iTime]!, spo2: header[iSpo2]!, pulse: iPulse >= 0 ? header[iPulse] : undefined },
  };
}

/** Shifts every time by `minutes` (to line the oximeter clock up with the CPAP's). */
export function shiftRecording(r: OximetryRecording, minutes: number): OximetryRecording {
  return { ...r, times: r.times.map((t) => t + minutes * 60_000) };
}

/** Splits a recording into nights (noon to noon, like therapy data). */
export function splitByNight(r: OximetryRecording): Map<string, OximetryRecording> {
  const out = new Map<string, number[]>();
  for (let i = 0; i < r.times.length; i++) { const k = nightOf(r.times[i]!); (out.get(k) ?? out.set(k, []).get(k)!).push(i); }
  return new Map([...out].map(([k, idx]) => [k, { times: Float64Array.from(idx, (i) => r.times[i]!), spo2: Float32Array.from(idx, (i) => r.spo2[i]!), pulse: Float32Array.from(idx, (i) => r.pulse[i]!) }]));
}

export interface Desaturation { start: number; end: number; nadir: number; /** points below the baseline */ depth: number }

export interface OximetryStats {
  /** seconds of valid SpO2 */
  seconds: number;
  spo2Mean?: number;
  spo2Min?: number;
  /** % of valid time below 90 % and below 88 % */
  t90?: number;
  t88?: number;
  /** oxygen desaturation index: drops of ≥ 3 % / ≥ 4 % per hour of valid recording */
  odi3?: number;
  odi4?: number;
  desaturations3: number;
  desaturations4: number;
  pulseMean?: number;
  pulseMin?: number;
  pulseMax?: number;
}

const MAX_GAP = 30; // seconds: a longer gap is missing data, not a long sample

/** Seconds each sample stands for: until the next sample, capped so a gap does not count as data. */
export function sampleSeconds(times: ArrayLike<number>): Float64Array {
  const w = new Float64Array(times.length);
  for (let i = 0; i < times.length; i++) w[i] = i + 1 < times.length ? Math.min((times[i + 1]! - times[i]!) / 1000, MAX_GAP) : 1;
  return w;
}

/**
 * Finds desaturations: SpO2 falls at least `drop` points below the recent baseline (the 90th percentile of the previous
 * 120 s) for 10 s to 3 min. The event ends when SpO2 comes back to within half of the drop of the baseline.
 */
export function findDesaturations(r: OximetryRecording, drop: number): Desaturation[] {
  const { times, spo2 } = r;
  const out: Desaturation[] = [];
  let i = 0;
  while (i < times.length) {
    if (Number.isNaN(spo2[i]!)) { i++; continue; }
    // baseline over the 120 s before this sample
    let a = i;
    while (a > 0 && times[i]! - times[a - 1]! <= 120_000) a--;
    const window: number[] = [];
    for (let k = a; k < i; k++) if (!Number.isNaN(spo2[k]!)) window.push(spo2[k]!);
    if (window.length < 5) { i++; continue; }
    window.sort((x, y) => x - y);
    const base = window[Math.floor(window.length * 0.9)]!;
    if (spo2[i]! <= base - drop) {
      let j = i, nadir = spo2[i]!;
      while (j + 1 < times.length && (Number.isNaN(spo2[j + 1]!) || spo2[j + 1]! < base - drop / 2) && times[j + 1]! - times[i]! <= 180_000) { if (!Number.isNaN(spo2[j + 1]!)) nadir = Math.min(nadir, spo2[j + 1]!); j++; }
      const dur = (times[j]! - times[i]!) / 1000;
      if (dur >= 10) out.push({ start: times[i]!, end: times[j]!, nadir, depth: base - nadir });
      i = j + 1;
    } else i++;
  }
  return out;
}

export function oximetryStats(r: OximetryRecording): OximetryStats {
  const w = sampleSeconds(r.times);
  let seconds = 0, sum = 0, below90 = 0, below88 = 0, min = Infinity, psum = 0, pw = 0, pmin = Infinity, pmax = -Infinity;
  for (let i = 0; i < r.times.length; i++) {
    const s = r.spo2[i]!, p = r.pulse[i]!;
    if (!Number.isNaN(s)) { seconds += w[i]!; sum += s * w[i]!; if (s < 90) below90 += w[i]!; if (s < 88) below88 += w[i]!; min = Math.min(min, s); }
    if (!Number.isNaN(p)) { psum += p * w[i]!; pw += w[i]!; pmin = Math.min(pmin, p); pmax = Math.max(pmax, p); }
  }
  const d3 = findDesaturations(r, 3), d4 = findDesaturations(r, 4), hours = seconds / 3600;
  return {
    seconds, spo2Mean: seconds ? sum / seconds : undefined, spo2Min: Number.isFinite(min) ? min : undefined,
    t90: seconds ? (below90 / seconds) * 100 : undefined, t88: seconds ? (below88 / seconds) * 100 : undefined,
    odi3: hours > 0 ? d3.length / hours : undefined, odi4: hours > 0 ? d4.length / hours : undefined,
    desaturations3: d3.length, desaturations4: d4.length,
    pulseMean: pw ? psum / pw : undefined, pulseMin: Number.isFinite(pmin) ? pmin : undefined, pulseMax: Number.isFinite(pmax) ? pmax : undefined,
  };
}

/** Minutes during which the recording and any of the given [start, end] ranges (ms) overlap. */
export function overlapMinutes(r: OximetryRecording, ranges: [number, number][]): number {
  const w = sampleSeconds(r.times);
  let sec = 0;
  for (let i = 0; i < r.times.length; i++) if (ranges.some(([a, b]) => r.times[i]! >= a && r.times[i]! <= b)) sec += w[i]!;
  return sec / 60;
}
