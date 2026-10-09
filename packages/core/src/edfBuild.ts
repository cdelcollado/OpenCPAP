import type { EdfAnnotation } from './edfRead';

/**
 * General EDF+ builder: arbitrary record duration, per-signal digital range and EDF+ annotations. Used to create
 * synthetic device cards for tests and demos (the plain `writeEdf` in `edf.ts` is the export-oriented writer).
 */
export interface EdfBuildSignal {
  label: string;
  unit: string;
  samplesPerRecord: number;
  physMin: number;
  physMax: number;
  /** defaults to the full 16-bit range */
  digMin?: number;
  digMax?: number;
  /** physical values, `records × samplesPerRecord` of them */
  data: ArrayLike<number>;
}

export interface EdfBuildOptions {
  startMs: number;
  recordDuration: number;
  records: number;
  signals: EdfBuildSignal[];
  /** when given, the file is EDF+C and carries an "EDF Annotations" signal */
  annotations?: EdfAnnotation[];
  patient?: string;
  recording?: string;
  /** write this number in the header instead of the real record count (to test truncated / still-open files) */
  declaredRecords?: number;
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s.padEnd(n, ' '));
const p2 = (v: number) => String(v).padStart(2, '0');
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(6)));

export function buildEdfPlus(o: EdfBuildOptions): Uint8Array {
  const enc = new TextEncoder();
  const hasAnn = !!o.annotations;
  const tals: Uint8Array[] = [];
  if (hasAnn) {
    for (let r = 0; r < o.records; r++) {
      const here = o.annotations!.filter((a) => Math.min(o.records - 1, Math.floor(a.onset / o.recordDuration)) === r);
      const text = `+${fmt(r * o.recordDuration)}\x14\x14\x00` + here.map((a) => `+${fmt(a.onset)}${a.duration ? `\x15${fmt(a.duration)}` : ''}\x14${a.text}\x14\x00`).join('');
      tals.push(enc.encode(text));
    }
  }
  const annSamples = hasAnn ? Math.ceil(Math.max(...tals.map((t) => t.length), 16) / 2) : 0;

  const sigs = o.signals;
  const ns = sigs.length + (hasAnn ? 1 : 0);
  const headerBytes = 256 + ns * 256;
  const perRecord = sigs.map((s) => s.samplesPerRecord).concat(hasAnn ? [annSamples] : []);
  const recordSamples = perRecord.reduce((a, b) => a + b, 0);
  const out = new Uint8Array(headerBytes + o.records * recordSamples * 2);
  let pos = 0;
  const put = (s: string, width: number) => { out.set(enc.encode(pad(s, width)), pos); pos += width; };

  const d = new Date(o.startMs);
  put('0', 8);
  put(o.patient ?? 'X X X X', 80);
  put(o.recording ?? 'Startdate X X X X', 80);
  put(`${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCFullYear() % 100)}`, 8);
  put(`${p2(d.getUTCHours())}.${p2(d.getUTCMinutes())}.${p2(d.getUTCSeconds())}`, 8);
  put(String(headerBytes), 8);
  put(hasAnn ? 'EDF+C' : '', 44);
  put(String(o.declaredRecords ?? o.records), 8);
  put(fmt(o.recordDuration), 8);
  put(String(ns), 4);
  const all = [...sigs.map((s) => ({ ...s, digMin: s.digMin ?? -32768, digMax: s.digMax ?? 32767 })), ...(hasAnn ? [{ label: 'EDF Annotations', unit: '', samplesPerRecord: annSamples, physMin: -1, physMax: 1, digMin: -32768, digMax: 32767, data: [] }] : [])];
  for (const [width, f] of [
    [16, (s: (typeof all)[number]) => s.label], [80, () => ''], [8, (s: (typeof all)[number]) => s.unit],
    [8, (s: (typeof all)[number]) => fmt(s.physMin)], [8, (s: (typeof all)[number]) => fmt(s.physMax)],
    [8, (s: (typeof all)[number]) => fmt(s.digMin)], [8, (s: (typeof all)[number]) => fmt(s.digMax)],
    [80, () => ''], [8, (s: (typeof all)[number]) => String(s.samplesPerRecord)], [32, () => ''],
  ] as const) for (const s of all) put(f(s), width);

  const view = new DataView(out.buffer);
  let offset = 0;
  all.forEach((s, i) => {
    const n = s.samplesPerRecord;
    for (let r = 0; r < o.records; r++) {
      const at = headerBytes + (r * recordSamples + offset) * 2;
      if (hasAnn && i === all.length - 1) { out.set(tals[r]!, at); continue; }
      for (let k = 0; k < n; k++) {
        const phys = s.data[r * n + k] ?? 0;
        const gain = (s.digMax - s.digMin) / (s.physMax - s.physMin);
        view.setInt16(at + k * 2, Math.max(-32768, Math.min(32767, Math.round(s.digMin + (phys - s.physMin) * gain))), true);
      }
    }
    offset += n;
  });
  return out;
}
