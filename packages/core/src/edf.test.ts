import { describe, expect, it } from 'vitest';
import { writeEdf } from './edf';

const text = (b: Uint8Array, from: number, n: number) => new TextDecoder().decode(b.subarray(from, from + n)).trimEnd();

/** Tiny EDF reader for the tests: returns header fields and the physical samples of each signal. */
function read(b: Uint8Array) {
  const ns = Number(text(b, 252, 4));
  const records = Number(text(b, 236, 8));
  const dur = Number(text(b, 244, 8));
  const at = (field: number, width: number, i: number) => 256 + ns * (field) + i * width;
  const cols = (offset: number, width: number) => Array.from({ length: ns }, (_, i) => text(b, 256 + offset * ns + i * width, width));
  const labels = cols(0, 16), unit = cols(96, 8), pmin = cols(104, 8).map(Number), pmax = cols(112, 8).map(Number);
  const dmin = cols(120, 8).map(Number), dmax = cols(128, 8).map(Number), spr = cols(216, 8).map(Number);
  void at;
  const view = new DataView(b.buffer, b.byteOffset);
  const hdr = 256 + ns * 256, per = spr.reduce((a, c) => a + c, 0);
  const sig = spr.map(() => [] as number[]);
  for (let r = 0; r < records; r++) {
    let off = 0;
    for (let s = 0; s < ns; s++) {
      for (let k = 0; k < spr[s]!; k++) {
        const dig = view.getInt16(hdr + (r * per + off + k) * 2, true);
        sig[s]!.push(pmin[s]! + ((dig - dmin[s]!) * (pmax[s]! - pmin[s]!)) / (dmax[s]! - dmin[s]!));
      }
      off += spr[s]!;
    }
  }
  return { ns, records, dur, labels, unit, pmin, pmax, spr, sig, header: { version: text(b, 0, 8), start: text(b, 168, 8) + ' ' + text(b, 176, 8), hdrBytes: Number(text(b, 184, 8)) } };
}

describe('writeEdf', () => {
  const flow = Float32Array.from({ length: 23 }, (_, i) => Math.round(60 * Math.sin(i / 3)));
  const file = writeEdf({ startMs: Date.UTC(2026, 2, 5, 22, 7, 9), signals: [{ label: 'Flow', unit: '', sampleRate: 5, samples: flow, physMin: -128, physMax: 127 }] });

  it('writes a header that follows the spec', () => {
    const r = read(file);
    expect(r.header.version).toBe('0');
    expect(r.header.start).toBe('05.03.26 22.07.09');
    expect(r.header.hdrBytes).toBe(512);
    expect(r.ns).toBe(1);
    expect(r.labels).toEqual(['Flow']);
    expect(r.dur).toBe(1);
    expect(r.records).toBe(5); // 23 samples at 5 Hz → 4.6 s → 5 records
    expect(file.length).toBe(512 + 5 * 5 * 2);
  });
  it('round-trips the samples within the 16-bit resolution and pads the last record with the minimum', () => {
    const r = read(file);
    for (let i = 0; i < flow.length; i++) expect(Math.abs(r.sig[0]![i]! - flow[i]!)).toBeLessThan(0.01);
    expect(r.sig[0]!.length).toBe(25);
  });
  it('supports several signals with different rates', () => {
    const f = writeEdf({ startMs: 0, signals: [
      { label: 'Flow', unit: 'a.u.', sampleRate: 5, samples: new Float32Array(10).fill(10), physMin: -128, physMax: 127 },
      { label: 'Pressure', unit: 'cmH2O', sampleRate: 1, samples: new Float32Array(2).fill(9.5), physMin: 0, physMax: 30 },
    ] });
    const r = read(f);
    expect(r.spr).toEqual([5, 1]);
    expect(r.unit).toEqual(['a.u.', 'cmH2O']);
    expect(r.sig[1]![0]).toBeCloseTo(9.5, 2);
    expect(r.sig[0]![3]).toBeCloseTo(10, 2);
  });
  it('replaces non-ASCII text and rejects invalid input', () => {
    const f = writeEdf({ startMs: 0, patient: 'Núria', signals: [{ label: 'Fluxe', unit: '', sampleRate: 1, samples: [1], physMin: 0, physMax: 2 }] });
    expect(text(f, 8, 80)).toBe('N?ria');
    expect(() => writeEdf({ startMs: 0, signals: [] })).toThrow();
    expect(() => writeEdf({ startMs: 0, signals: [{ label: 'x', unit: '', sampleRate: 2.5, samples: [1], physMin: 0, physMax: 1 }] })).toThrow(/integer/);
  });
});
