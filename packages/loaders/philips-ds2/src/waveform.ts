import type { Chunk } from './chunk';

/**
 * Waveform records (`.B05`). Each chunk holds `intervalCount` intervals of `intervalSeconds` seconds.
 * Inside an interval the signals are stored one after another, `interleave` bytes each.
 * Adapted from OSCAR's PRS1Import::ImportWaveforms (GPLv3). Specification: docs/formats/ds2.md.
 */

export interface DecodedSignal {
  /** raw bytes of this signal, in time order */
  bytes: Uint8Array;
  /** samples per second */
  sampleRate: number;
}

export interface DecodedWaveformChunk {
  /** seconds since epoch of the first sample */
  start: number;
  /** seconds covered by the chunk */
  duration: number;
  signals: DecodedSignal[];
}

export function decodeWaveformChunk(chunk: Chunk): DecodedWaveformChunk {
  const n = chunk.waveformInfo.length;
  const seconds = chunk.intervalSeconds ?? 1;
  const count = chunk.intervalCount ?? 0;
  const stride = chunk.waveformInfo.reduce((a, w) => a + w.interleave, 0);
  const intervals = stride > 0 ? Math.min(count, Math.floor(chunk.data.length / stride)) : 0;
  const outs = chunk.waveformInfo.map((w) => new Uint8Array(w.interleave * intervals));
  let pos = 0;
  for (let i = 0; i < intervals; i++) {
    for (let s = 0; s < n; s++) {
      const len = chunk.waveformInfo[s]!.interleave;
      outs[s]!.set(chunk.data.subarray(pos, pos + len), i * len);
      pos += len;
    }
  }
  return {
    start: chunk.timestamp,
    duration: intervals * seconds,
    signals: chunk.waveformInfo.map((w, s) => ({ bytes: outs[s]!, sampleRate: w.interleave / seconds })),
  };
}
