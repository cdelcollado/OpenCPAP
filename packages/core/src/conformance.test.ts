import { describe, expect, it } from 'vitest';
import { checkSessions } from './conformance';
import { generateDemoSessions } from './demo';
import type { Session } from './model';

const base = (): Session => ({
  device: { manufacturer: 'X', model: 'Y', serial: 'Z' }, id: 1,
  start: Date.UTC(2026, 0, 1, 22), end: Date.UTC(2026, 0, 2, 6), clock: 'utc',
  slices: [{ start: Date.UTC(2026, 0, 1, 22), end: Date.UTC(2026, 0, 2, 6), status: 'mask-on' }],
  settings: {}, events: [], waveforms: [], statistics: [],
});

describe('checkSessions', () => {
  it('accepts the demo data and a minimal session', () => {
    expect(checkSessions(generateDemoSessions({ nights: 5, waveformNights: 1 }))).toEqual([]);
    expect(checkSessions([base()])).toEqual([]);
  });

  it('flags every kind of violation with a readable message', () => {
    const s = base();
    const bad: Session[] = [
      s,
      { ...s, id: 1 }, // duplicate id
      { ...base(), id: 2, start: 5, end: 10, slices: [] },
      { ...base(), id: 3, events: [{ type: 'obstructive', start: s.end + 3_600_000, duration: 5 }, { type: 'bogus' as never, start: s.start, duration: -1 }] },
      { ...base(), id: 4, events: [{ type: 'central', start: s.start + 1000, duration: 5 }, { type: 'central', start: s.start, duration: 5 }] },
      { ...base(), id: 5, waveforms: [{ channel: 'flow', unit: 'L/s', sampleRate: 25, start: s.start, samples: Float32Array.from([1, NaN]) }] },
      { ...base(), id: 6, statistics: [{ channel: 'leak-unintentional', unit: 'L/s', times: Float64Array.from([s.start + 2, s.start + 1]), values: Float32Array.from([1, 2]) }] },
    ];
    const messages = checkSessions(bad).map((i) => `${i.session}: ${i.message}`).join('\n');
    expect(messages).toMatch(/1: session id is not unique/);
    expect(messages).toMatch(/2: start is before year 2000/);
    expect(messages).toMatch(/3: event obstructive .* outside the session/);
    expect(messages).toMatch(/3: unknown event type "bogus"/);
    expect(messages).toMatch(/3: event bogus has an invalid duration -1/);
    expect(messages).toMatch(/4: events are not sorted/);
    expect(messages).toMatch(/5: flow must be in L\/min/);
    expect(messages).toMatch(/5: waveform flow has 1 non-finite/);
    expect(messages).toMatch(/6: statistics leak-unintentional must be in L\/min/);
    expect(messages).toMatch(/6: .*times are not ascending/);
  });

  it('reports an empty result and sub-year-2000 timestamps', () => {
    expect(checkSessions([]).map((i) => i.message)).toEqual(['the loader produced no sessions']);
    expect(checkSessions([{ ...base(), start: 1_000_000, end: 2_000_000, slices: [{ start: 1_000_000, end: 2_000_000, status: 'mask-on' }] }]).map((i) => i.message)).toContain('start is before year 2000; timestamps must be epoch milliseconds');
  });

  it('requires therapy time', () => {
    expect(checkSessions([{ ...base(), slices: [] }]).map((i) => i.message)).toContain('no mask-on slice, so the session has no therapy time');
  });
});
