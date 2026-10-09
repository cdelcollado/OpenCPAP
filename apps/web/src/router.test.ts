import { describe, expect, it } from 'vitest';
import { href, parseRange, parseRoute } from './router';

describe('parseRoute', () => {
  it('parses known routes', () => {
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/equipment')).toEqual({ name: 'equipment' });
    expect(parseRoute('#/night/2026-03-05')).toEqual({ name: 'night', date: '2026-03-05' });
  });
  it('falls back to the dashboard', () => {
    for (const h of ['', '#', '#/', '#/nope', '#/night', '#/night/garbage', '#/night/2026-3-5']) expect(parseRoute(h)).toEqual({ name: 'dashboard' });
  });
  it('round-trips generated links', () => {
    expect(parseRoute(href.night('2026-01-02'))).toEqual({ name: 'night', date: '2026-01-02' });
    const a: [string, string] = ['2026-01-01', '2026-01-30'], b: [string, string] = ['2026-01-31', '2026-03-01'];
    expect(parseRoute(href.compare(a, b))).toEqual({ name: 'compare', a, b });
    expect(parseRoute(href.compare())).toEqual({ name: 'compare', a: undefined, b: undefined });
    expect(parseRoute(href.report(a))).toEqual({ name: 'report', range: a });
    expect(parseRoute(href.report())).toEqual({ name: 'report', range: undefined });
  });
  it('ignores malformed ranges instead of failing', () => {
    expect(parseRoute('#/compare?a=nonsense&b=2026-01-01..')).toEqual({ name: 'compare', a: undefined, b: undefined });
    expect(parseRoute('#/report?range=2026-13-01')).toEqual({ name: 'report', range: undefined });
  });
});

describe('parseRange', () => {
  it('orders reversed ranges', () => expect(parseRange('2026-03-01..2026-01-01')).toEqual(['2026-01-01', '2026-03-01']));
  it('rejects anything else', () => { for (const v of [null, '', '2026-01-01', 'a..b', '2026-01-01..2026-01-02..2026-01-03']) expect(parseRange(v)).toBeUndefined(); });
});
