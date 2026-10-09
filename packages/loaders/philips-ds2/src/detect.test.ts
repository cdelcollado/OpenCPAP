import { describe, it, expect } from 'vitest';
import { MemoryFS } from '@opencpap/core';
import { philipsDs2Loader } from './index';

describe('philips-ds2 detect', () => {
  it('detecta la carpeta P-SERIES', async () => {
    const fs = new MemoryFS(new Map([['P-SERIES/X/a.000', new Uint8Array(1)]]));
    expect((await philipsDs2Loader.detect(fs))?.device.manufacturer).toBe('Philips Respironics');
  });
  it('retorna null si no és Philips', async () => {
    expect(await philipsDs2Loader.detect(new MemoryFS(new Map()))).toBeNull();
  });
});
