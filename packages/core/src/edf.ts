/**
 * Minimal European Data Format (EDF) writer, so waveforms can be opened in tools such as EDFbrowser.
 * Spec: https://www.edfplus.info/specs/edf.html — 16-bit samples, continuous recording, one-second data records.
 */

export interface EdfSignal {
  label: string;
  /** physical dimension, e.g. "cmH2O"; leave empty when the unit is not known */
  unit: string;
  sampleRate: number;
  /** samples already in physical units */
  samples: ArrayLike<number>;
  physMin: number;
  physMax: number;
}

export interface EdfOptions {
  /** recording start as wall-clock fields (the device clock), epoch ms read with UTC accessors */
  startMs: number;
  patient?: string;
  recording?: string;
  signals: EdfSignal[];
}

const ascii = (s: string, n: number) => {
  const t = s.replace(/[^\x20-\x7e]/g, '?');
  return t.length > n ? t.slice(0, n) : t.padEnd(n, ' ');
};
const num = (v: number, n: number) => ascii(String(Number.isInteger(v) ? v : +v.toFixed(4)), n);
const pad2 = (v: number) => String(v).padStart(2, '0');

/** Serialises the signals into an EDF file. Signals may have different rates; the file is padded with zeros to whole seconds. */
export function writeEdf(o: EdfOptions): Uint8Array {
  const ns = o.signals.length;
  if (ns === 0) throw new Error('EDF needs at least one signal');
  const seconds = Math.max(1, Math.ceil(Math.max(...o.signals.map((s) => s.samples.length / s.sampleRate))));
  const perRecord = o.signals.map((s) => { if (!Number.isInteger(s.sampleRate)) throw new Error('EDF export needs integer sample rates'); return s.sampleRate; });
  const d = new Date(o.startMs);
  const headerBytes = 256 + ns * 256;
  const recordSamples = perRecord.reduce((a, b) => a + b, 0);
  const out = new Uint8Array(headerBytes + seconds * recordSamples * 2);
  const enc = new TextEncoder();
  let pos = 0;
  const put = (s: string) => { out.set(enc.encode(s), pos); pos += s.length; };

  put(ascii('0', 8));
  put(ascii(o.patient ?? 'X X X X', 80));
  put(ascii(o.recording ?? 'Startdate X X X X', 80));
  put(`${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCFullYear() % 100)}`);
  put(`${pad2(d.getUTCHours())}.${pad2(d.getUTCMinutes())}.${pad2(d.getUTCSeconds())}`);
  put(num(headerBytes, 8));
  put(ascii('', 44));
  put(num(seconds, 8));
  put(num(1, 8));
  put(num(ns, 4));
  const each = (width: number, f: (s: EdfSignal, i: number) => string) => o.signals.forEach((s, i) => put(ascii(f(s, i), width)));
  each(16, (s) => s.label);
  each(80, () => '');
  each(8, (s) => s.unit);
  each(8, (s) => String(s.physMin));
  each(8, (s) => String(s.physMax));
  each(8, () => '-32768');
  each(8, () => '32767');
  each(80, () => '');
  each(8, (_s, i) => String(perRecord[i]));
  each(32, () => '');

  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let acc = 0;
  for (const p of perRecord) { offsets.push(acc); acc += p; }
  o.signals.forEach((s, i) => {
    const gain = 65535 / (s.physMax - s.physMin);
    for (let k = 0; k < s.samples.length; k++) {
      const rec = Math.floor(k / perRecord[i]!), within = k % perRecord[i]!;
      let dig = Math.round((s.samples[k]! - s.physMin) * gain - 32768);
      dig = Math.max(-32768, Math.min(32767, dig));
      view.setInt16(headerBytes + (rec * recordSamples + offsets[i]! + within) * 2, dig, true);
    }
  });
  return out;
}
