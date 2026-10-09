import { describe, it, expect } from 'vitest';
import { ecb, gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { decryptDs2, parseDs2Header } from './container';

const COMMON = Uint8Array.from([
  0x75, 0xb3, 0xa2, 0x12, 0x4a, 0x65, 0xaf, 0x97, 0x54, 0xd8, 0xc1, 0xf3, 0xe5, 0x2e, 0xb6, 0xf0,
  0x23, 0x20, 0x57, 0x69, 0x7e, 0x38, 0x0e, 0xc9, 0x4a, 0xdc, 0x46, 0x45, 0xb6, 0x92, 0x5a, 0x98,
]);

/** Construeix un contenidor DS2 sintètic amb el mateix esquema que el dispositiu. */
function build(plain: Uint8Array): Uint8Array {
  const iv = new Uint8Array(12).fill(7);
  const salt = new Uint8Array(16).fill(9);
  const payloadKey = new Uint8Array(32).fill(3);
  const common = ecb(new TextEncoder().encode('Patient access to their own data'), { disablePadding: true }).decrypt(COMMON);
  const salted = pbkdf2(sha256, common, salt, { c: 10000, dkLen: 32 });
  const ek = gcm(salted, iv).encrypt(payloadKey);
  const pl = gcm(payloadKey, iv).encrypt(plain);
  const field = (b: Uint8Array) => [b.length & 0xff, b.length >> 8, ...b];
  const u16 = (n: number) => [n & 0xff, n >> 8];
  const head = [
    ...u16(0x0d), ...u16(1), ...u16(1),
    ...field(new TextEncoder().encode('00000000-0000-0000-0000-000000000000')),
    ...field(iv), ...field(salt), ...u16(0), ...u16(1),
    ...field(new Uint8Array(32)), ...field(new Uint8Array(16)), // import key (no s'usa)
    ...field(ek.subarray(0, 32)), ...field(ek.subarray(32)),
    ...field(pl.subarray(pl.length - 16)),
  ];
  expect(head.length).toBe(0xca);
  return Uint8Array.from([...head, ...pl.subarray(0, pl.length - 16)]);
}

describe('contenidor DS2', () => {
  const plain = new TextEncoder().encode('MN=420X150C\nCF=6\n');
  it('desxifra el payload', () => {
    expect(new TextDecoder().decode(decryptDs2(build(plain)).payload)).toBe('MN=420X150C\nCF=6\n');
  });
  it('rebutja capçaleres que no són DS2', () => {
    expect(() => parseDs2Header(new Uint8Array(0xca))).toThrow(/DS2/);
  });
  it('detecta dades manipulades (tag GCM)', () => {
    const f = build(plain);
    f[0xca] = f[0xca]! ^ 1;
    expect(() => decryptDs2(f)).toThrow();
  });
});
