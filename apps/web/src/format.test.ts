import { describe, expect, it } from 'vitest';
import { addDays, formatBytes, formatClock, formatClockSeconds, formatHours, formatNightDate, formatNumber } from './format';

describe('format', () => {
  it('formats hours', () => {
    expect(formatHours(7.0833)).toBe('7 h 05 min');
    expect(formatHours(0)).toBe('0 h 00 min');
    expect(formatHours(-1)).toBe('0 h 00 min');
    expect(formatHours(1.9999)).toBe('2 h 00 min');
  });
  it('formats numbers per locale and handles missing values', () => {
    expect(formatNumber(1.234, 'en')).toBe('1.2');
    expect(formatNumber(1.234, 'ca', 2)).toBe('1,23');
    expect(formatNumber(undefined, 'en')).toBe('—');
    expect(formatNumber(NaN, 'en')).toBe('—');
  });
  it('shows device wall-clock time regardless of the browser zone', () => {
    expect(formatClock(Date.parse('2026-03-05T23:05:00Z'), 'en')).toBe('23:05');
  });
  it('formats clock with seconds', () => expect(formatClockSeconds(Date.parse('2026-03-05T23:05:09Z'), 'en')).toBe('23:05:09'));
  it('formats night dates in UTC', () => {
    expect(formatNightDate('2026-03-05', 'en')).toContain('2026');
    expect(formatNightDate('2026-03-05', 'en', 'short')).toMatch(/5/);
  });
  it('formats bytes', () => {
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3, 'en')).toBe('5 GB');
  });
  it('adds days across month boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
