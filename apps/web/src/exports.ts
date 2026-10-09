import type { NightSummary, SessionLite, Waveform } from '@opencpap/core';
import { addDays, nightsInRange, periodStats, writeEdf } from '@opencpap/core';

/** CSV cells starting with these characters can be executed as formulas by spreadsheets; prefix them with an apostrophe. */
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(v: string | number | undefined | null): string {
  if (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))) return '';
  if (typeof v === 'number') return String(v);
  const s = FORMULA.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csv = (rows: (string | number | undefined | null)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const num = (v: number | undefined, d = 3) => (v === undefined ? undefined : +v.toFixed(d));
/** Wall-clock time of the device as "YYYY-MM-DDTHH:MM:SS" (no zone: the device does not know one). */
export const wallClock = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** One row per night with the figures shown in the app. Decimal point, no locale formatting, ready for a spreadsheet. */
export function nightsCsv(nights: NightSummary[]): string {
  return csv([
    ['date', 'usage_hours', 'ahi', 'obstructive', 'central', 'hypopnea', 'rera', 'flow_limitation', 'leak_p95_lmin', 'leak_median_lmin', 'leak_max_lmin', 'pressure_min_cmh2o', 'pressure_max_cmh2o', 'breath_rate_per_min', 'flat_breaths_pct', 'periodic_pattern_pct', 'spo2_mean_pct', 'spo2_min_pct', 'time_under_90_pct', 'odi3_per_h', 'odi4_per_h'],
    ...nights.map((n) => [
      n.date, num(n.usageHours), num(n.ahi, 2), n.counts.obstructive ?? 0, n.counts.central ?? 0, n.counts.hypopnea ?? 0, n.counts.rera ?? 0, n.counts['flow-limitation'] ?? 0,
      num(n.leak?.p95, 1), num(n.leak?.median, 1), num(n.leak?.max, 1), num(n.pressure?.min, 1), num(n.pressure?.max, 1),
      num(n.breathing?.rate, 1), num(n.breathing?.flatShare === undefined ? undefined : n.breathing.flatShare * 100, 1), num(n.breathing ? n.breathing.periodicityShare * 100 : undefined, 1),
      num(n.oximetry?.spo2Mean, 1), num(n.oximetry?.spo2Min, 0), num(n.oximetry?.t90, 1), num(n.oximetry?.odi3, 1), num(n.oximetry?.odi4, 1),
    ]),
  ]);
}

export function eventsCsv(sessions: SessionLite[]): string {
  return csv([
    ['session', 'start', 'type', 'detail', 'duration_s'],
    ...sessions.flatMap((s) => s.events.map((e) => [s.id, wallClock(e.start), e.type, e.detail, num(e.duration, 0)])),
  ]);
}

/** Long format (time, channel, unit, value) for the device's per-interval statistics. */
export function statisticsCsv(sessions: SessionLite[]): string {
  return csv([
    ['session', 'time', 'channel', 'unit', 'value'],
    ...sessions.flatMap((s) => s.statistics.flatMap((t) => Array.from(t.times, (ms, i) => [s.id, wallClock(ms), t.channel, t.unit, num(t.values[i], 2)]))),
  ]);
}

/** The imported oximeter samples of a night (time, SpO2, pulse). Empty cells are readings the sensor marked invalid. */
export function oximetryCsv(o: { times: Float64Array; spo2: Float32Array; pulse: Float32Array }): string {
  return csv([['time', 'spo2_pct', 'pulse_bpm'], ...Array.from(o.times, (t, i) => [wallClock(t), num(o.spo2[i], 0), num(o.pulse[i], 0)])]);
}

/**
 * Flow waveform as EDF. Gaps between segments are filled with zeros. The flow unit is not verified (see
 * docs/formats/ds2.md), so the physical dimension is left empty; the values are the device's own numbers.
 */
export function flowEdf(waveforms: Waveform[], startLabel = 'OpenCPAP'): Uint8Array | undefined {
  const segs = waveforms.filter((w) => w.channel === 'flow').sort((a, b) => a.start - b.start);
  if (segs.length === 0) return undefined;
  const rate = segs[0]!.sampleRate;
  const start = segs[0]!.start;
  const end = Math.max(...segs.map((w) => w.start + (w.samples.length / w.sampleRate) * 1000));
  const samples = new Float32Array(Math.ceil(((end - start) / 1000) * rate));
  for (const w of segs) samples.set(w.samples, Math.round(((w.start - start) / 1000) * rate));
  return writeEdf({ startMs: start, recording: `Startdate X X X ${startLabel}`, signals: [{ label: 'Flow', unit: '', sampleRate: rate, samples, physMin: -128, physMax: 127 }] });
}

export function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * A small, stable JSON document with the latest night and the last 7 / 30 days, meant for other tools (Home Assistant
 * command-line or file sensors, scripts, spreadsheets). Dates are YYYY-MM-DD; numbers use a decimal point. It holds
 * figures only: no notes, name or serial number. The schema is documented in docs/integrations.md.
 */
export function summaryJson(nights: NightSummary[], asOf: string, generated = new Date().toISOString()): string {
  const r = (v: number | undefined, d = 2) => (v === undefined || Number.isNaN(v) ? null : +v.toFixed(d));
  const period = (days: number) => {
    const s = periodStats(nightsInRange(nights, addDays(asOf, -(days - 1)), asOf));
    return { days, nights_with_data: s.nights, usage_hours_mean: r(s.usageMean), nights_over_4h: s.nightsOverMin, compliance_pct: r(s.compliance === undefined ? undefined : s.compliance * 100, 1), ahi: r(s.ahi), leak_p95_lmin: r(s.leakP95, 1), leak_median_lmin: r(s.leakMedian, 1) };
  };
  const last = nights.at(-1);
  return JSON.stringify({
    schema: 'opencpap-summary/1', generated, as_of: asOf,
    last_night: last && { date: last.date, usage_hours: r(last.usageHours), ahi: r(last.ahi), obstructive: last.counts.obstructive ?? 0, central: last.counts.central ?? 0, hypopnea: last.counts.hypopnea ?? 0, leak_p95_lmin: r(last.leak?.p95, 1), leak_kind: last.leakKind ?? null, pressure_min_cmh2o: r(last.pressure?.min, 1), pressure_max_cmh2o: r(last.pressure?.max, 1), mode: last.mode ?? null },
    last_7_days: period(7), last_30_days: period(30),
  }, null, 2) + '\n';
}
