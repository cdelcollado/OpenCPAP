import { describe, expect, it } from 'vitest';
import type { Session } from '@opencpap/core';
import { compareWithOscar, formatComparison, localKey, oscarKey, parseOscarCsv } from './oscarCsv';

const HEADER = 'Date,Start,AHI,RDI,OAHI,CAHI,OA,UA,A,H,OH,CH,CA,RERA,Pressure_Avg,Pressure_Min,Pressure_Max,Pressure_95th,Leak_Avg,Leak_Max,Leak_95th,SpO2_Avg,SpO2_Min,Pulse_Avg,Hours,Hours_Used,Machine';
// session starts 2026-03-05 21:27:48 Madrid time (= 20:27:48 UTC, winter time) and lasts 2 h with a 60 s mask-off gap
const row = (start = '21:27:48', ahi = '1.5', used = '2.02') =>
  `2026-03-05,${start},${ahi},2.5,,,1,,,2,,,0,2,,,,,28.52,46,46,,,,2,${used},DreamStation 2 Advanced CPAP`;

const t0 = Date.parse('2026-03-05T20:27:49Z'); // one second after OSCAR's start
const ev = (type: string) => ({ type, start: t0, duration: 0 });
const session = {
  id: 7, start: t0, end: t0 + 2 * 3600_000 + 60_000,
  slices: [{ start: t0, end: t0 + 3600_000, status: 'mask-on' }, { start: t0 + 3600_000, end: t0 + 3660_000, status: 'mask-off' }, { start: t0 + 3660_000, end: t0 + 7260_000, status: 'mask-on' }],
  events: [ev('obstructive'), ev('hypopnea'), ev('hypopnea'), ev('rera'), ev('rera')],
  statistics: [{ channel: 'leak-total', unit: 'L/min', times: Float64Array.of(t0 + 120_000, t0 + 151_000), values: Float32Array.of(24, 46) }],
} as unknown as Session;

describe('OSCAR CSV', () => {
  it('parses the export', () => {
    const [r] = parseOscarCsv(`${HEADER}\n${row()}`);
    expect(r).toMatchObject({ date: '2026-03-05', time: '21:27:48', ahi: 1.5, oa: 1, h: 2, rera: 2, leakAvg: 28.52, hours: 2, hoursUsed: 2.02 });
    expect(Number.isNaN(parseOscarCsv(`${HEADER}\n${row()}`)[0]!.rdi)).toBe(false);
  });
  it('rejects other CSV files', () => {
    expect(() => parseOscarCsv('a,b\n1,2')).toThrow(/Not a recognised/);
  });
  it('maps OSCAR noon-to-noon days to local timestamps', () => {
    expect(oscarKey({ date: '2026-03-05', time: '21:27:48' })).toBe('2026-03-05 21:27:48');
    expect(oscarKey({ date: '2026-03-05', time: '01:04:41' })).toBe('2026-03-06 01:04:41');
    expect(localKey(Date.parse('2026-03-05T20:27:48Z'), 'Europe/Madrid')).toBe('2026-03-05 21:27:48');
    expect(localKey(Date.parse('2026-07-01T20:27:48Z'), 'Europe/Madrid')).toBe('2026-07-01 22:27:48'); // summer time
  });
  it('matches within one second and compares every metric', () => {
    const c = compareWithOscar(parseOscarCsv(`${HEADER}\n${row()}`), [session], { timeZone: 'Europe/Madrid' });
    expect(c.matched).toBe(1);
    expect(c.unmatchedOscar).toEqual([]);
    const failing = c.metrics.filter((m) => m.matched !== m.compared).map((m) => m.name);
    expect(failing).toEqual([]);
    expect(c.metrics.map((m) => m.name)).toEqual(expect.arrayContaining(['hours with mask on', 'hours incl. short gaps', 'AHI (events/h)', 'leak average (L/min)']));
  });
  it('reports unmatched rows and differences with examples', () => {
    const c = compareWithOscar(parseOscarCsv(`${HEADER}\n${row()}\n${row('23:59:59')}\n${row('21:27:48', '9.9')}`), [session], { timeZone: 'Europe/Madrid' });
    expect(c.unmatchedOscar).toEqual(['2026-03-05 23:59:59']);
    expect(c.metrics.find((m) => m.name === 'AHI (events/h)')!.examples[0]).toMatch(/ours/);
    expect(formatComparison(c)).toContain('DIFF AHI');
  });
  it('lists sessions that OSCAR did not export', () => {
    const c = compareWithOscar([], [session], { timeZone: 'Europe/Madrid' });
    expect(c.unmatchedOurs).toEqual([7]);
  });
});
