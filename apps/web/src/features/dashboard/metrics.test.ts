import { describe, expect, it } from 'vitest';
import type { NightSummary } from '@opencpap/core';
import { ahiLevel, baseline, daysInMonth, firstWeekday, heatDomain, monthsBetween, usageLevel } from './metrics';

const night = (date: string, usageHours: number, ahi?: number, p95?: number): NightSummary => ({
  date, sessionIds: [1], start: 0, end: 0, usageHours, counts: {}, ahi, hasWaveforms: false,
  leak: p95 === undefined ? undefined : { average: p95, median: p95, p95, max: p95 },
});

describe('levels', () => {
  it('bands the AHI', () => {
    expect(ahiLevel(undefined)).toBe('neutral');
    expect(ahiLevel(0)).toBe('good');
    expect(ahiLevel(4.99)).toBe('good');
    expect(ahiLevel(5)).toBe('warn');
    expect(ahiLevel(14.9)).toBe('warn');
    expect(ahiLevel(15)).toBe('bad');
  });
  it('flags use under 4 hours', () => {
    expect(usageLevel(3.99)).toBe('warn');
    expect(usageLevel(4)).toBe('good');
  });
});

describe('baseline', () => {
  const nights = [night('2026-01-01', 8, 1, 40), night('2026-01-02', 6, 3, 50), night('2026-01-03', 7, undefined), night('2026-01-04', 1, 9, 99)];
  it('averages the nights before the last, skipping missing values', () => {
    const b = baseline(nights);
    expect(b.nights).toBe(3);
    expect(b.usage).toBeCloseTo(7);
    expect(b.ahi).toBeCloseTo(2);
    expect(b.leak).toBeCloseTo(45);
  });
  it('only looks back n nights', () => expect(baseline(nights, 1).usage).toBe(7));
  it('is empty with a single night', () => expect(baseline([night('2026-01-01', 8)]).usage).toBeUndefined());
});

describe('heat scale and calendar maths', () => {
  const ns = [night('2026-01-01', 12, 2, 41), night('2026-01-02', 3, 18, 58)];
  it('uses stable floors per metric', () => {
    expect(heatDomain(ns, 'usage')).toEqual([0, 12]);
    expect(heatDomain([night('2026-01-01', 4)], 'usage')).toEqual([0, 10]);
    expect(heatDomain(ns, 'ahi')).toEqual([0, 18]);
    expect(heatDomain([night('2026-01-01', 4, 0.5)], 'ahi')).toEqual([0, 5]);
    expect(heatDomain(ns, 'leak')).toEqual([40, 60]);
  });
  it('lists months including gaps and across years', () => {
    expect(monthsBetween('2025-11-05', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-03-01', '2026-03-31')).toEqual(['2026-03']);
  });
  it('knows month lengths and the weekday of the 1st (Monday = 0)', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(firstWeekday('2026-10')).toBe(3); // Thursday 1 Oct 2026
    expect(firstWeekday('2026-06')).toBe(0); // Monday 1 Jun 2026
  });
});
