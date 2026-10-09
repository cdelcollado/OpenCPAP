import { describe, expect, it } from 'vitest';
import { generateDemoSessions, groupNights } from '@opencpap/core';
import { csv, csvCell, eventsCsv, flowEdf, nightsCsv, oximetryCsv, statisticsCsv, summaryJson, wallClock } from './exports';

describe('csvCell', () => {
  it('quotes separators, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('plain')).toBe('plain');
  });
  it('defuses spreadsheet formulas', () => {
    for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx']) expect(csvCell(evil).replace(/^"/, '')).toMatch(/^'/);
  });
  it('leaves numbers alone and empties for missing values', () => {
    expect(csvCell(-3.5)).toBe('-3.5');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(NaN)).toBe('');
  });
  it('joins rows with CRLF', () => expect(csv([['a', 1], ['b', 2]])).toBe('a,1\r\nb,2\r\n'));
});

describe('exports of demo data', () => {
  const sessions = generateDemoSessions({ nights: 12, seed: 6, waveformNights: 2 });
  const nights = groupNights(sessions);
  it('writes one row per night with a fixed header', () => {
    const lines = nightsCsv(nights).trimEnd().split('\r\n');
    expect(lines).toHaveLength(nights.length + 1);
    expect(lines[0]).toBe('date,usage_hours,ahi,obstructive,central,hypopnea,rera,flow_limitation,leak_p95_lmin,leak_median_lmin,leak_max_lmin,pressure_min_cmh2o,pressure_max_cmh2o,breath_rate_per_min,flat_breaths_pct,periodic_pattern_pct,spo2_mean_pct,spo2_min_pct,time_under_90_pct,odi3_per_h,odi4_per_h');
    const cols = lines[1]!.split(',');
    expect(cols).toHaveLength(21);
    expect(cols[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(cols[1])).toBeGreaterThan(0);
    expect(cols.every((c) => !c.includes('"'))).toBe(true); // plain numbers and ISO dates: nothing needed quoting
  });
  it('lists events and statistics with device wall-clock times', () => {
    const withEvents = sessions.find((s) => s.events.length)!;
    const ev = eventsCsv([withEvents]).trimEnd().split('\r\n');
    expect(ev).toHaveLength(withEvents.events.length + 1);
    expect(ev[1]!.split(',')[1]).toBe(wallClock(withEvents.events[0]!.start));
    const st = statisticsCsv([withEvents]).trimEnd().split('\r\n');
    expect(st[1]!.split(',')).toHaveLength(5);
    expect(st.length).toBeGreaterThan(50);
  });
  it('exports the flow as a valid EDF with gaps filled', () => {
    const s = sessions.find((x) => x.waveforms.length)!;
    const edf = flowEdf(s.waveforms)!;
    expect(new TextDecoder().decode(edf.subarray(0, 8)).trim()).toBe('0');
    const samples = s.waveforms[0]!.samples.length;
    expect(edf.length).toBe(512 + Math.ceil(samples / 5) * 5 * 2);
    expect(flowEdf([])).toBeUndefined();
    // two segments with a one-minute gap
    const w = s.waveforms[0]!;
    const a = { ...w, samples: w.samples.slice(0, 50) }, b = { ...w, start: w.start + 70_000, samples: w.samples.slice(0, 50) };
    expect(flowEdf([b, a])!.length).toBe(512 + 80 * 5 * 2); // 10 s + 60 s of zeros + 10 s = 80 one-second records
  });
});

describe('oximetryCsv', () => {
  it('writes wall-clock times and leaves invalid readings empty', () => {
    const out = oximetryCsv({ times: Float64Array.of(Date.UTC(2026, 2, 5, 23, 0, 0), Date.UTC(2026, 2, 5, 23, 0, 4)), spo2: Float32Array.of(96, NaN), pulse: Float32Array.of(61, 62) });
    expect(out).toBe('time,spo2_pct,pulse_bpm\r\n2026-03-05T23:00:00,96,61\r\n2026-03-05T23:00:04,,62\r\n');
  });
});

describe('summaryJson', () => {
  const nights = groupNights(generateDemoSessions({ nights: 40, seed: 6, waveformNights: 0 }).map(({ waveforms: _w, ...s }) => s));
  const doc = JSON.parse(summaryJson(nights, nights.at(-1)!.date, '2026-05-01T00:00:00.000Z'));
  it('has a stable, documented shape', () => {
    expect(doc.schema).toBe('opencpap-summary/1');
    expect(doc.generated).toBe('2026-05-01T00:00:00.000Z');
    expect(doc.as_of).toBe(nights.at(-1)!.date);
    expect(Object.keys(doc.last_night)).toEqual(['date', 'usage_hours', 'ahi', 'obstructive', 'central', 'hypopnea', 'leak_p95_lmin', 'leak_kind', 'pressure_min_cmh2o', 'pressure_max_cmh2o', 'mode']);
    expect(Object.keys(doc.last_7_days)).toEqual(['days', 'nights_with_data', 'usage_hours_mean', 'nights_over_4h', 'compliance_pct', 'ahi', 'leak_p95_lmin', 'leak_median_lmin']);
    expect(doc.last_7_days.days).toBe(7);
    expect(doc.last_30_days.nights_with_data).toBeGreaterThan(20);
  });
  it('contains figures only', () => {
    const text = summaryJson(nights, nights.at(-1)!.date);
    expect(text).not.toMatch(/serial|note|patient|tag/i);
    expect(text.endsWith('\n')).toBe(true);
  });
  it('uses null for what is missing', () => {
    const empty = JSON.parse(summaryJson([], '2026-01-10'));
    expect(empty.last_night).toBeUndefined();
    expect(empty.last_7_days.ahi).toBeNull();
  });
});
