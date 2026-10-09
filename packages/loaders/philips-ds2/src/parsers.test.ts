import { describe, it, expect } from 'vitest';
import { parseChunks } from './chunk';
import { parseSummary } from './summary';
import { parseEvents } from './events';
import { decodeWaveformChunk } from './waveform';
import { buildChunk } from './testing/builders';

const first = (bytes: Uint8Array) => [...parseChunks(bytes)][0]!;

describe('parseSummary', () => {
  // records: 1 = settings (13 B), 3 = mask on (4 B), 4 = mask off (4 B), 2 = equipment off (9 B)
  const settings = [0x00, 1, 0, /*mode cpap*/ 0x0a, 1, 95 /*9.5 cmH2O*/, 0x2c, 1, 15 /*ramp 15 min*/, 0x35, 2, 0x20, 0x60];
  const data = [
    1, ...settings,
    3, 0, 0, 0, 0, // mask on at +0
    4, 0x10, 0x0e, 0, 0, // mask off at +3600 s
    2, 0x1e, 0, 0, 0, 0, 0, 0, 0, 0, // equipment off at +30 s later
  ];
  const chunk = first(buildChunk({ timestamp: 1000, ext: 1, hblock: { 1: settings.length, 3: 4, 4: 4, 2: 9 }, data }));

  it('extracts slices with cumulative offsets', () => {
    const r = parseSummary(chunk);
    expect(r.slices).toEqual([
      { t: 0, kind: 'mask-on' },
      { t: 3600, kind: 'mask-off' },
      { t: 3630, kind: 'equipment-off' },
    ]);
    expect(r.duration).toBe(3630);
  });

  it('decodes settings', () => {
    const { settings: s } = parseSummary(chunk);
    expect(s).toMatchObject({ mode: 'cpap', pressure: 9.5, rampTimeMinutes: 15, rampType: 'ramp-plus', humidifierPresent: true, humidifierMode: 'adaptive' });
  });
});

describe('parseEvents', () => {
  const data = [
    0x01, 0, 0, 80, /* pressure set 8.0 at t=0 */
    0x06, 100, 0, 20, /* OA reported at t=100, flagged 20 s earlier */
    0x0f, 200, 0, 30, 0, 10, /* periodic breathing: 2*30 s long, ended 10 s before t=300 */
    0x11, 120, 0, 12, 2, 95, /* stats at t=420: leak 12, snore 2, avg pressure 9.5 */
  ];
  // sizes include the 2-byte timestamp
  const chunk = first(buildChunk({ timestamp: 5000, ext: 2, hblock: { 1: 3, 6: 3, 0x0f: 5, 0x11: 5 }, data }));

  it('maps records to events with elapsed/duration corrections', () => {
    const r = parseEvents(chunk);
    expect(r.events).toEqual([
      { type: 'obstructive', start: 80, duration: 0, code: 6 },
      { type: 'periodic-breathing', start: 300 - 10 - 60, duration: 60, code: 0x0f },
    ]);
  });

  it('collects statistics', () => {
    const r = parseEvents(chunk);
    expect(r.stats).toContainEqual({ channel: 'pressure-set', t: 0, value: 8 });
    expect(r.stats).toContainEqual({ channel: 'leak-total', t: 420, value: 12 });
    expect(r.stats).toContainEqual({ channel: 'snore-count', t: 420, value: 2 });
    expect(r.stats).toContainEqual({ channel: 'flex-pressure-avg', t: 420, value: 9.5 });
    expect(r.unknownRecords).toBe(0);
  });
});

describe('decodeWaveformChunk', () => {
  it('de-interleaves signals', () => {
    // 2 intervals of 1 s; signal 0 has 3 bytes per interval, signal 1 has 1
    const chunk = first(buildChunk({
      timestamp: 2000, ext: 5,
      waveform: { intervalCount: 2, intervalSeconds: 1, interleave: [3, 1] },
      data: [1, 2, 3, 100, 4, 5, 6, 101],
    }));
    const w = decodeWaveformChunk(chunk);
    expect(w.duration).toBe(2);
    expect([...w.signals[0]!.bytes]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...w.signals[1]!.bytes]).toEqual([100, 101]);
    expect(w.signals[0]!.sampleRate).toBe(3);
  });
});
