import { ecb, gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { crc32Wchar } from '../crc';

/** Test helpers that build synthetic DS2 data. Never put real patient data in tests. */

const COMMON = Uint8Array.from([
  0x75, 0xb3, 0xa2, 0x12, 0x4a, 0x65, 0xaf, 0x97, 0x54, 0xd8, 0xc1, 0xf3, 0xe5, 0x2e, 0xb6, 0xf0,
  0x23, 0x20, 0x57, 0x69, 0x7e, 0x38, 0x0e, 0xc9, 0x4a, 0xdc, 0x46, 0x45, 0xb6, 0x92, 0x5a, 0x98,
]);

/** Wraps plaintext in the encrypted DS2 container. */
export function buildDs2File(plain: Uint8Array): Uint8Array {
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
    ...field(new Uint8Array(32)), ...field(new Uint8Array(16)),
    ...field(ek.subarray(0, 32)), ...field(ek.subarray(32)),
    ...field(pl.subarray(pl.length - 16)),
  ];
  if (head.length !== 0xca) throw new Error('bad synthetic header');
  return Uint8Array.from([...head, ...pl.subarray(0, pl.length - 16)]);
}

export interface ChunkSpec {
  sessionId?: number;
  timestamp: number;
  ext: number;
  /** normal chunks: record sizes by code, e.g. {3: 4} */
  hblock?: Record<number, number>;
  /** waveform chunks */
  waveform?: { intervalCount: number; intervalSeconds: number; interleave: number[] };
  data: number[];
}

/** Builds a fileVersion 3, family 0 version 6 chunk with valid header checksum and CRC32. */
export function buildChunk(spec: ChunkSpec): Uint8Array {
  const wf = spec.waveform;
  const h: number[] = [3, 0, 0, wf ? 1 : 0, 0, 6, spec.ext];
  const id = spec.sessionId ?? 1;
  h.push(id & 255, (id >> 8) & 255, (id >> 16) & 255, (id >>> 24) & 255);
  const ts = spec.timestamp;
  h.push(ts & 255, (ts >> 8) & 255, (ts >> 16) & 255, (ts >>> 24) & 255);
  if (wf) {
    h.push(wf.intervalCount & 255, wf.intervalCount >> 8, wf.intervalSeconds, wf.interleave.length);
    wf.interleave.forEach((n, i) => h.push(i, n & 255, n >> 8, 8));
    h.push(0);
  } else {
    const pairs = Object.entries(spec.hblock ?? {});
    h.push(pairs.length);
    for (const [k, v] of pairs) h.push(Number(k), v);
  }
  const crc = crc32Wchar(Uint8Array.from(spec.data));
  const size = h.length + 1 + spec.data.length + 4;
  h[1] = size & 255;
  h[2] = size >> 8;
  const sum = h.reduce((a, b) => (a + b) & 255, 0);
  return Uint8Array.from([...h, sum, ...spec.data, crc & 255, (crc >> 8) & 255, (crc >> 16) & 255, (crc >>> 24) & 255]);
}

export const concatBytes = (...a: Uint8Array[]) => Uint8Array.from(a.flatMap((x) => [...x]));

const enc = (s: string) => new TextEncoder().encode(s);

/** Files of a tiny synthetic DS2 card: one device, one 1-hour session with 2 events and 10 s of flow. */
export function syntheticCardFiles(): Map<string, Uint8Array> {
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
  return new Map([
    ['P-SERIES/AAAA0001/PROP.BIN', props],
    ['P-SERIES/AAAA0001/P0/00000010.B01', buildDs2File(summary)],
    ['P-SERIES/AAAA0001/P0/00000010.B02', buildDs2File(events)],
    ['P-SERIES/AAAA0001/P0/00000010.B05', buildDs2File(wave)],
  ]);
}
