import { describe, expect, it } from 'vitest';
import { buildEdfPlus } from './edfBuild';
import { writeEdf } from './edf';
import { EdfError, readEdf } from './edfRead';

const START = Date.UTC(2026, 2, 5, 22, 7, 9);

describe('readEdf', () => {
  const flow = Float32Array.from({ length: 50 }, (_, i) => Math.round(20 * Math.sin(i / 4) * 100) / 100);
  const file = buildEdfPlus({
    startMs: START, recordDuration: 2, records: 5,
    signals: [
      { label: 'Flow.40ms', unit: 'L/s', samplesPerRecord: 10, physMin: -4, physMax: 4, data: Float32Array.from(flow, (v) => v / 10) },
      { label: 'Leak.2s', unit: 'L/s', samplesPerRecord: 1, physMin: 0, physMax: 2, digMin: 0, digMax: 20000, data: [0.1, 0.2, 0.3, 0.4, 0.5] },
    ],
    annotations: [{ onset: 1.5, duration: 12, text: 'Obstructive Apnea' }, { onset: 7, duration: 0, text: 'Arousal' }],
  });

  it('reads the header fields', () => {
    const e = readEdf(file);
    expect(e.plus).toBe('EDF+C');
    expect(e.startMs).toBe(START);
    expect(e.recordDuration).toBe(2);
    expect(e.records).toBe(5);
    expect(e.durationSeconds).toBe(10);
  });

  it('converts digital values to physical ones and derives sample rates', () => {
    const e = readEdf(file);
    expect(e.signals.map((s) => s.label)).toEqual(['Flow.40ms', 'Leak.2s']); // annotations are not a signal
    const [f, l] = e.signals;
    expect(f!.sampleRate).toBe(5);
    expect(f!.unit).toBe('L/s');
    expect(f!.samples.length).toBe(50);
    expect(f!.samples[7]).toBeCloseTo(flow[7]! / 10, 3);
    expect(l!.sampleRate).toBe(0.5);
    expect([...l!.samples].map((v) => +v.toFixed(3))).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('reads annotations with and without duration, and the record onsets', () => {
    const e = readEdf(file);
    expect(e.annotations).toEqual([{ onset: 1.5, duration: 12, text: 'Obstructive Apnea' }, { onset: 7, duration: 0, text: 'Arousal' }]);
    expect(e.recordOnsets).toEqual([0, 2, 4, 6, 8]);
  });

  it('reads files written by the app\'s own EDF writer', () => {
    const e = readEdf(writeEdf({ startMs: START, signals: [{ label: 'Flow', unit: 'L/min', sampleRate: 5, samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], physMin: -128, physMax: 127 }] }));
    expect(e.plus).toBe('');
    expect(e.signals[0]!.sampleRate).toBe(5);
    expect(e.signals[0]!.samples[9]).toBeCloseTo(10, 0);
  });

  it('accepts a file that is shorter than its header says (still being written)', () => {
    const e = readEdf(buildEdfPlus({ startMs: START, recordDuration: 1, records: 3, declaredRecords: 100, signals: [{ label: 'A', unit: '', samplesPerRecord: 2, physMin: 0, physMax: 10, data: [1, 2, 3, 4, 5, 6] }] }));
    expect(e.records).toBe(3);
  });

  it('drops a truncated last record', () => {
    const full = buildEdfPlus({ startMs: START, recordDuration: 1, records: 3, signals: [{ label: 'A', unit: '', samplesPerRecord: 2, physMin: 0, physMax: 10, data: [1, 2, 3, 4, 5, 6] }] });
    expect(readEdf(full.subarray(0, full.length - 3)).records).toBe(2);
  });

  it('rejects things that are not EDF', () => {
    expect(() => readEdf(new Uint8Array(10))).toThrow(EdfError);
    expect(() => readEdf(new Uint8Array(600).fill(65))).toThrow(/version/);
    const bad = Uint8Array.from(file); bad.set(new TextEncoder().encode('99999999'), 184);
    expect(() => readEdf(bad)).toThrow(/Corrupt/);
  });

  it('reads 19xx years per the specification (85–99)', () => {
    const e = readEdf(buildEdfPlus({ startMs: Date.UTC(1999, 0, 2, 3, 4, 5), recordDuration: 1, records: 1, signals: [{ label: 'A', unit: '', samplesPerRecord: 1, physMin: 0, physMax: 1, data: [0] }] }));
    expect(e.startMs).toBe(Date.UTC(1999, 0, 2, 3, 4, 5));
  });
});
