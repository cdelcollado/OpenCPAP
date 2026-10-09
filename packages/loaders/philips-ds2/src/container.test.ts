import { describe, it, expect } from 'vitest';
import { decryptDs2, parseDs2Header } from './container';
import { buildDs2File } from './testing/builders';

describe('DS2 container', () => {
  const plain = new TextEncoder().encode('MN=420X150C\nCF=6\n');
  it('decrypts the payload', () => {
    expect(new TextDecoder().decode(decryptDs2(buildDs2File(plain)).payload)).toBe('MN=420X150C\nCF=6\n');
  });
  it('rejects headers that are not DS2', () => {
    expect(() => parseDs2Header(new Uint8Array(0xca))).toThrow(/DS2/);
  });
  it('detects tampered data (GCM tag)', () => {
    const f = buildDs2File(plain);
    f[0xca] = f[0xca]! ^ 1;
    expect(() => decryptDs2(f)).toThrow();
  });
});
