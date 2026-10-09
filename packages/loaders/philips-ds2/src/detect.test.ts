import { describe, it, expect } from 'vitest';
import { MemoryFS } from '@opencpap/core';
import { philipsDs2Loader } from './index';

const card = (...paths: string[]) => new MemoryFS(new Map(paths.map((p) => [p, new Uint8Array(1)])));

describe('philips-ds2 detect', () => {
  it('detects a DS2 card with properties and sessions with high confidence', async () => {
    const r = await philipsDs2Loader.detect(card('P-SERIES/DEV/PROP.BIN', 'P-SERIES/DEV/P0/00000001.B01'));
    expect(r?.device.manufacturer).toBe('Philips Respironics');
    expect(r?.confidence).toBeGreaterThan(0.8);
  });
  it('detects with lower confidence when only one kind of file is present', async () => {
    expect((await philipsDs2Loader.detect(card('P-SERIES/DEV/PROP.BIN')))?.confidence).toBeLessThan(0.8);
    expect((await philipsDs2Loader.detect(card('P-SERIES/DEV/P1/0000000A.B02')))?.confidence).toBeLessThan(0.8);
  });
  it('is case-insensitive about the P-SERIES folder name', async () => {
    expect(await philipsDs2Loader.detect(card('p-series/DEV/PROP.BIN'))).not.toBeNull();
  });
  it('does not claim older PRS1 cards (unencrypted .00n files)', async () => {
    expect(await philipsDs2Loader.detect(card('P-SERIES/P0/12345678/A.001'))).toBeNull();
    expect(await philipsDs2Loader.detect(card('P-SERIES/X/a.000'))).toBeNull();
  });
  it('returns null when the card is not Philips', async () => {
    expect(await philipsDs2Loader.detect(card('DATALOG/x.edf'))).toBeNull();
  });
});
