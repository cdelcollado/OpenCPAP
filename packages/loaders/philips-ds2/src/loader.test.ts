import { describe, it, expect } from 'vitest';
import { MemoryFS, summarizeSession, type Session } from '@opencpap/core';
import { philipsDs2Loader } from './index';
import { syntheticCardFiles } from './testing/builders';

async function collect(fs: MemoryFS) {
  const out: Session[] = [];
  for await (const s of philipsDs2Loader.load(fs)) out.push(s);
  return out;
}

describe('philipsDs2Loader (synthetic card)', () => {
  it('detects the card with high confidence when PROP.BIN exists', async () => {
    expect((await philipsDs2Loader.detect(new MemoryFS(syntheticCardFiles())))?.confidence).toBeGreaterThan(0.8);
  });

  it('builds a session from summary, events and waveform files', async () => {
    const [s] = await collect(new MemoryFS(syntheticCardFiles()));
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
    const files = syntheticCardFiles();
    files.delete('P-SERIES/AAAA0001/P0/00000010.B01');
    expect(await collect(new MemoryFS(files))).toHaveLength(0);
  });

  it('is not detected on a non-Philips card', async () => {
    expect(await philipsDs2Loader.detect(new MemoryFS(new Map([['DATALOG/x.edf', new Uint8Array(1)]])))).toBeNull();
  });
});
