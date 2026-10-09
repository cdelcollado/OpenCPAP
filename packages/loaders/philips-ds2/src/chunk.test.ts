import { describe, it, expect } from 'vitest';
import { parseChunks, ChunkError } from './chunk';
import { crc16 } from './crc';
import { buildChunk, concatBytes } from './testing/builders';

describe('crc', () => {
  it('crc16/KERMIT check value', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x2189);
  });
});

describe('parseChunks', () => {
  const a = buildChunk({ sessionId: 0x145, timestamp: 1_700_000_000, ext: 1, hblock: { 3: 4 }, data: [3, 10, 0, 0, 0] });
  const b = buildChunk({ sessionId: 0x145, timestamp: 1_700_000_300, ext: 1, hblock: { 4: 2 }, data: [4, 5, 0] });

  it('reads consecutive chunks and exposes header fields', () => {
    const chunks = [...parseChunks(concatBytes(a, b))];
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ fileVersion: 3, family: 0, familyVersion: 6, ext: 1, sessionId: 0x145, timestamp: 1_700_000_000 });
    expect(chunks[0]!.hblock.get(3)).toBe(4);
    expect([...chunks[1]!.data]).toEqual([4, 5, 0]);
  });

  it('reports a corrupt payload CRC and stops', () => {
    const bad = Uint8Array.from(b);
    bad[bad.length - 6] = bad[bad.length - 6]! ^ 0xff; // flip a data byte
    const errors: ChunkError[] = [];
    const chunks = [...parseChunks(concatBytes(a, bad), (e) => errors.push(e))];
    expect(chunks).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/CRC/);
  });

  it('reports a corrupt header checksum', () => {
    const bad = Uint8Array.from(a);
    bad[7] = bad[7]! ^ 1; // session id byte
    const errors: ChunkError[] = [];
    expect([...parseChunks(bad, (e) => errors.push(e))]).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/header checksum/);
  });

  it('reports truncated files', () => {
    const errors: ChunkError[] = [];
    expect([...parseChunks(a.subarray(0, a.length - 3), (e) => errors.push(e))]).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});
