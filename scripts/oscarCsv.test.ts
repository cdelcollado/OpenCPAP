import { describe, it, expect } from 'vitest';
import type { Session } from '@opencpap/core';
import { compareWithOscar, formatComparison, parseOscarSessionsCsv, wallClockSeconds } from './oscarCsv';

const csv = [
  'Date,Session,Start,End,Total Time,AHI,Hypopnea Count,Obstructive Apnea Count,Clear Airway Count,RERA Count,Pressure Median',
  '2026-03-25,325,2026-03-25T22:12:37,2026-03-26T00:12:37,02:00:00,1.500,2,1,0,3,9.5',
  '2026-03-26,999,2026-03-26T22:00:00,2026-03-26T23:00:00,01:00:00,0.000,0,0,0,0,9.5',
].join('\n');

const t0 = Date.parse('2026-03-25T21:12:37Z');
const ev = (type: any) => ({ type, start: t0, duration: 0 });
const session = {
  id: 325, start: t0, end: t0 + 2 * 3600_000, slices: [{ start: t0, end: t0 + 2 * 3600_000, status: 'mask-on' }],
  events: [ev('hypopnea'), ev('hypopnea'), ev('obstructive'), ev('rera'), ev('rera'), ev('rera')],
} as unknown as Session;

describe('OSCAR CSV comparison', () => {
  it('parses the sessions export', () => {
    const rows = parseOscarSessionsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ session: 325, totalSeconds: 7200, ahi: 1.5 });
    expect(rows[0]!.columns['rera count']).toBe(3);
  });
  it('rejects the summary export', () => {
    expect(() => parseOscarSessionsCsv('Date,Session Count,Start,End,Total Time,AHI\n2026-01-01,1,a,b,01:00:00,1')).toThrow(/Sessions/);
  });
  it('compares sessions, counts and the clock offset', () => {
    const c = compareWithOscar(parseOscarSessionsCsv(csv), [session]);
    expect(c.matchedSessions).toBe(1);
    expect(c.missingInOurs).toEqual([999]);
    expect(c.metrics.every((m) => m.matched === m.compared)).toBe(true);
    expect(c.startOffsetHours).toEqual({ 1: 1 }); // OSCAR shifted the clock by +1 h
    expect(formatComparison(c)).toContain('OK   AHI');
  });
  it('reports differences with examples', () => {
    const rows = parseOscarSessionsCsv(csv.replace('1.500', '2.500'));
    const ahi = compareWithOscar(rows, [session]).metrics.find((m) => m.name === 'AHI')!;
    expect(ahi.matched).toBe(0);
    expect(ahi.examples[0]).toMatch(/session 325/);
  });
  it('reads wall-clock fields without zone arithmetic', () => expect(wallClockSeconds('2026-01-01T00:00:00')).toBe(Date.UTC(2026, 0, 1) / 1000));
});
