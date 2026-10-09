import { crc16, crc32Wchar } from './crc';

/**
 * PRS1 chunk framing. Adapted from OSCAR's PRS1DataChunk (prs1_parser.cpp, GPLv3).
 * Specification: docs/formats/ds2.md, section "Chunk framing".
 */

export const HTYPE_NORMAL = 0;
export const HTYPE_INTERVAL = 1; // waveform / interval data

export interface WaveformInfo {
  /** index of the signal inside an interval (0..n-1) */
  kind: number;
  /** samples per interval for this signal */
  interleave: number;
}

export interface Chunk {
  fileVersion: number;
  blockSize: number;
  htype: number;
  family: number;
  familyVersion: number;
  ext: number;
  sessionId: number;
  /** device clock, seconds since Unix epoch (timezone semantics: see docs) */
  timestamp: number;
  /** key/value pairs of the extended header (fileVersion 3, normal chunks) */
  hblock: Map<number, number>;
  /** waveform chunks only */
  intervalCount?: number;
  intervalSeconds?: number;
  waveformInfo: WaveformInfo[];
  /** payload without the trailing CRC */
  data: Uint8Array;
  /** offset of the chunk within the file */
  offset: number;
}

export class ChunkError extends Error {}

/**
 * Splits a decrypted file into chunks, validating the header checksum and payload CRC.
 * Stops (and reports through `onError`) at the first corrupt chunk, like OSCAR does.
 */
export function* parseChunks(file: Uint8Array, onError?: (e: ChunkError) => void): Generator<Chunk> {
  let pos = 0;
  while (pos < file.length) {
    let chunk: Chunk;
    let next: number;
    try {
      [chunk, next] = parseOne(file, pos);
    } catch (e) {
      if (e instanceof ChunkError) {
        onError?.(e);
        return;
      }
      throw e;
    }
    yield chunk;
    pos = next;
  }
}

function parseOne(f: Uint8Array, start: number): [Chunk, number] {
  const fail = (msg: string) => new ChunkError(`chunk @0x${start.toString(16)}: ${msg}`);
  if (start + 15 > f.length) throw fail('truncated header');
  const h = (i: number) => f[start + i]!;

  const fileVersion = h(0);
  const blockSize = h(1) | (h(2) << 8);
  const htype = h(3);
  const family = h(4);
  const familyVersion = h(5);
  const ext = h(6);
  const sessionId = (h(7) | (h(8) << 8) | (h(9) << 16) | (h(10) << 24)) >>> 0;
  const timestamp = (h(11) | (h(12) << 8) | (h(13) << 16) | (h(14) << 24)) >>> 0;

  if (blockSize === 0) throw fail('block size 0');
  if (fileVersion < 2 || fileVersion > 3) throw fail(`unsupported file version ${fileVersion}`);
  if (htype !== HTYPE_NORMAL && htype !== HTYPE_INTERVAL) throw fail(`unexpected htype ${htype}`);

  let p = start + 15;
  const hblock = new Map<number, number>();
  const waveformInfo: WaveformInfo[] = [];
  let intervalCount: number | undefined;
  let intervalSeconds: number | undefined;

  if (htype === HTYPE_NORMAL) {
    if (fileVersion === 3) {
      if (p >= f.length) throw fail('truncated extended header');
      const pairs = f[p]!;
      p += 1;
      if (p + pairs * 2 > f.length) throw fail('truncated extended header');
      for (let i = 0; i < pairs; i++) hblock.set(f[p + 2 * i]!, f[p + 2 * i + 1]!);
      p += pairs * 2;
    }
  } else {
    if (p + 4 > f.length) throw fail('truncated waveform header');
    intervalCount = f[p]! | (f[p + 1]! << 8);
    intervalSeconds = f[p + 2]!;
    const signals = f[p + 3]!;
    p += 4;
    const entry = fileVersion === 3 ? 4 : 3;
    if (p + signals * entry + 1 > f.length) throw fail('truncated waveform header');
    for (let i = 0; i < signals; i++) {
      waveformInfo.push({ kind: f[p]!, interleave: f[p + 1]! | (f[p + 2]! << 8) });
      p += entry;
    }
    p += 1; // trailing byte (always 0 in observed data)
  }

  // 8-bit additive checksum of the header, stored right after it.
  if (p >= f.length) throw fail('missing header checksum');
  let sum = 0;
  for (let i = start; i < p; i++) sum = (sum + f[i]!) & 0xff;
  if (sum !== f[p]) throw fail(`header checksum ${sum} != ${f[p]}`);
  p += 1;

  const end = start + blockSize;
  if (blockSize < p - start) throw fail('block smaller than header');
  if (end > f.length) throw fail('block extends past end of file');

  const crcSize = fileVersion === 3 ? 4 : 2;
  const body = f.subarray(p, end);
  if (body.length < crcSize) throw fail('block too short for CRC');
  const data = body.subarray(0, body.length - crcSize);
  let stored = 0;
  for (let i = 0; i < crcSize; i++) stored |= body[body.length - crcSize + i]! << (8 * i);
  stored >>>= 0;
  const calc = fileVersion === 3 ? crc32Wchar(data) : crc16(data);
  if (calc !== stored) throw fail(`payload CRC 0x${calc.toString(16)} != 0x${stored.toString(16)}`);

  return [
    { fileVersion, blockSize, htype, family, familyVersion, ext, sessionId, timestamp, hblock, intervalCount, intervalSeconds, waveformInfo, data, offset: start },
    end,
  ];
}
