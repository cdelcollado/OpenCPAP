import { describe, expect, it } from 'vitest';
import { href, parseRoute } from './router';

describe('parseRoute', () => {
  it('parses known routes', () => {
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/night/2026-03-05')).toEqual({ name: 'night', date: '2026-03-05' });
  });
  it('falls back to the dashboard', () => {
    for (const h of ['', '#', '#/', '#/nope', '#/night', '#/night/garbage', '#/night/2026-3-5']) expect(parseRoute(h)).toEqual({ name: 'dashboard' });
  });
  it('round-trips generated links', () => expect(parseRoute(href.night('2026-01-02'))).toEqual({ name: 'night', date: '2026-01-02' }));
});
