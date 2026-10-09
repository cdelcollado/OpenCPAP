import { describe, it, expect } from 'vitest';
import { MemoryFS, summarizeSession, type Session } from '@opencpap/core';
import { philipsDs2Loader } from './index';
import { buildChunk, buildDs2File } from './testing/builders';

const enc = (s: string) => new TextEncoder().encode(s);

/** A tiny synthetic DS2 card: one device, one 1-hour session with 2 events and 10 s of flow. */
function syntheticCard() {
  const props = buildDs2File(enc('SN=TEST0001\nMN=420X150C\nSV=V1.0.6\nCF=6\n'));
  const summary = buildChunk({
    sessionId: 0x10, timestamp: 1_800_000_000, ext: 1, hblock: { 1: 3, 3: 4, 4: 4 },
    data: [1, 0x0a, 1, 100, /* settings: pressure 10 */ 3, 0, 0, 0, 0, 4, 0x10, 0x0e, 0, 0],
  });
  const events = buildChunk({
    sessionId: 0x10, timestamp: 1_800_000_000, ext: 2, hblock: { 6: 3, 0x14: 3 },
    data: [0x06, 100, 0, 10, 0x14, 50, 0, 5],
  });
  const wave = buildChunk({
    sessionId: 0x10, timestamp: 1_800_000_000, ext: 5,
    waveform: { intervalCount: 2, intervalSeconds: 1, interleave: [5] },
    data: [1, 2, 3, 4, 5, 0xff, 0xfe, 0, 1, 2],
  });
  return new MemoryFS(new Map([
    ['P-SERIES/AAAA0001/PROP.BIN', props],
    ['P-SERIES/AAAA0001/P0/00000010.B01', buildDs2File(summary)],
    ['P-SERIES/AAAA0001/P0/00000010.B02', buildDs2File(events)],
    ['P-SERIES/AAAA0001/P0/00000010.B05', buildDs2File(wave)],
  ]));
}

async function collect(fs: MemoryFS) {
  const out: Session[] = [];
  for await (const s of philipsDs2Loader.load(fs)) out.push(s);
  return out;
}

describe('philipsDs2Loader (synthetic card)', () => {
  it('detects the card with high confidence when PROP.BIN exists', async () => {
    expect((await philipsDs2Loader.detect(syntheticCard()))?.confidence).toBeGreaterThan(0.8);
  });

  it('builds a session from summary, events and waveform files', async () => {
    const [s] = await collect(syntheticCard());
    expect(s).toBeDefined();
    expect(s!.id).toBe(0x10);
    expect(s!.device).toMatchObject({ manufacturer: 'Philips Respironics', model: 'DreamStation 2 Advanced CPAP', firmware: 'V1.0.6' });
    expect(s!.clock).toBe('device-local');
    expect(s!.settings.pressure).toBe(10);
    expect(s!.slices).toEqual([{ start: 1_800_000_000_000, end: 1_800_003_600_000, status: 'mask-on' }]);
    expect(s!.events.map((e) => e.type)).toEqual(['obstructive', 'hypopnea']); // OA at t=100-10, hypopnea at t=150-5
    expect(s!.waveforms).toHaveLength(1);
    expect(s!.waveforms[0]).toMatchObject({ channel: 'flow', sampleRate: 5 });
    expect([...s!.waveforms[0]!.samples]).toEqual([1, 2, 3, 4, 5, -1, -2, 0, 1, 2]); // signed bytes
    const sum = summarizeSession(s!);
    expect(sum.usageHours).toBeCloseTo(1);
    expect(sum.ahi).toBeCloseTo(2);
  });

  it('skips sessions that have no summary file', async () => {
    const files = new Map(await Promise.all((await syntheticCard().list()).map(async (p) => [p, await syntheticCard().read(p)] as const)));
    files.delete('P-SERIES/AAAA0001/P0/00000010.B01');
    expect(await collect(new MemoryFS(files))).toHaveLength(0);
  });

  it('is not detected on a non-Philips card', async () => {
    expect(await philipsDs2Loader.detect(new MemoryFS(new Map([['DATALOG/x.edf', new Uint8Array(1)]])))).toBeNull();
  });
});
