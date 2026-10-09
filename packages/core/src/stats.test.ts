import { describe, it, expect } from 'vitest';
import { summarizeSession, usageSeconds } from './stats';

const h = 3_600_000;
describe('summarizeSession', () => {
  const slices = [
    { start: 0, end: 2 * h, status: 'mask-on' as const },
    { start: 2 * h, end: 3 * h, status: 'mask-off' as const },
    { start: 3 * h, end: 5 * h, status: 'mask-on' as const },
  ];
  it('counts only mask-on time', () => expect(usageSeconds({ slices })).toBe(4 * 3600));
  it('computes AHI without RERA', () => {
    const ev = (type: any) => ({ type, start: 0, duration: 0 });
    const r = summarizeSession({ slices, events: [ev('obstructive'), ev('central'), ev('hypopnea'), ev('hypopnea'), ev('rera')] });
    expect(r.ahi).toBeCloseTo(1);
    expect(r.counts.rera).toBe(1);
  });
  it('has no AHI when unused', () => expect(summarizeSession({ slices: [], events: [] }).ahi).toBeUndefined());
});
