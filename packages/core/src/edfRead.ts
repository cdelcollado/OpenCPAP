/**
 * European Data Format (EDF / EDF+) reader. ResMed devices write their data as EDF+, and other manufacturers use
 * the same container, so this lives in core. Spec: https://www.edfplus.info/specs/edf.html and /specs/edfplus.html.
 *
 * Scope: continuous recordings (EDF and EDF+C) and per-record signals (ResMed's daily `STR.edf`). Discontinuous
 * EDF+D files are read as if continuous; the per-record onset in the timekeeping annotation is exposed through
 * `recordOnsets` so a caller can handle them.
 */

export interface EdfSignalData {
  label: string;
  /** physical dimension as written in the file (e.g. `cmH2O`, `L/s`), trimmed */
  unit: string;
  /** samples per record */
  samplesPerRecord: number;
  /** samples per second (`samplesPerRecord / recordDuration`) */
  sampleRate: number;
  /** all records concatenated, converted to physical units */
  samples: Float32Array;
}

export interface EdfAnnotation {
  /** seconds from the start of the recording */
  onset: number;
  /** seconds; 0 when the annotation has no duration */
  duration: number;
  text: string;
}

export interface EdfData {
  /** EDF+ (`EDF+C` / `EDF+D`) reserved field, empty for plain EDF */
  plus: string;
  patient: string;
  recording: string;
  /** recording start as wall-clock fields encoded as UTC epoch ms (the device clock; see `Session.clock`) */
  startMs: number;
  /** seconds per data record */
  recordDuration: number;
  /** records actually present (a file cut short has fewer than the header says) */
  records: number;
  signals: EdfSignalData[];
  annotations: EdfAnnotation[];
  /** onset of every record in seconds, from the EDF+ timekeeping annotation (empty for plain EDF) */
  recordOnsets: number[];
  /** `records × recordDuration`, seconds */
  durationSeconds: number;
}

export class EdfError extends Error {
  constructor(message: string) { super(message); this.name = 'EdfError'; }
}

const ANNOTATIONS = 'EDF Annotations';

/**
 * Parses an EDF/EDF+ file. A truncated last record is dropped; a header that declares more records than the file
 * holds (a recording that was still being written, or `-1`) is accepted with the records that are there.
 */
export function readEdf(bytes: Uint8Array): EdfData {
  if (bytes.length < 256) throw new EdfError('Not an EDF file: shorter than the 256-byte header');
  const dec = new TextDecoder('ascii');
  const field = (o: number, n: number) => dec.decode(bytes.subarray(o, o + n)).trim();
  if (field(0, 8) !== '0') throw new EdfError('Not an EDF file: version field is not "0"');

  const ns = parseInt(field(252, 4), 10);
  const headerBytes = parseInt(field(184, 8), 10);
  if (!(ns >= 1 && ns <= 4096) || headerBytes !== 256 + ns * 256 || bytes.length < headerBytes) throw new EdfError('Corrupt EDF header');
  const recordDuration = parseFloat(field(244, 8));
  if (!(recordDuration > 0)) throw new EdfError('EDF record duration must be positive');

  const startMs = parseStart(field(168, 8), field(176, 8));

  // per-signal header blocks are stored one field at a time (all labels, then all transducers, ...)
  let pos = 256;
  const block = (width: number) => { const out: string[] = []; for (let i = 0; i < ns; i++) out.push(field(pos + i * width, width)); pos += ns * width; return out; };
  const labels = block(16);
  block(80); // transducer
  const units = block(8);
  const physMin = block(8).map(parseFloat), physMax = block(8).map(parseFloat);
  const digMin = block(8).map(parseFloat), digMax = block(8).map(parseFloat);
  block(80); // prefilter
  const spr = block(8).map((v) => parseInt(v, 10));
  block(32); // reserved
  if (spr.some((n) => !(n >= 0))) throw new EdfError('Corrupt EDF header: bad samples-per-record');

  const recordSamples = spr.reduce((a, b) => a + b, 0);
  const recordBytes = recordSamples * 2;
  const declared = parseInt(field(236, 8), 10);
  const available = recordBytes ? Math.floor((bytes.length - headerBytes) / recordBytes) : 0;
  const records = declared >= 0 ? Math.min(declared, available) : available;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signals: EdfSignalData[] = [];
  const annotations: EdfAnnotation[] = [];
  const recordOnsets: number[] = [];
  let offset = 0;
  for (let i = 0; i < ns; i++) {
    const n = spr[i]!;
    if (labels[i] === ANNOTATIONS) {
      for (let r = 0; r < records; r++) {
        const at = headerBytes + r * recordBytes + offset * 2;
        parseTals(bytes.subarray(at, at + n * 2), annotations, recordOnsets);
      }
    } else {
      const dRange = digMax[i]! - digMin[i]!, pRange = physMax[i]! - physMin[i]!;
      const gain = dRange !== 0 && Number.isFinite(pRange / dRange) ? pRange / dRange : 1;
      const base = Number.isFinite(physMin[i]!) && dRange !== 0 ? physMin[i]! - digMin[i]! * gain : 0;
      const samples = new Float32Array(records * n);
      for (let r = 0; r < records; r++) {
        const at = headerBytes + r * recordBytes + offset * 2;
        for (let k = 0; k < n; k++) samples[r * n + k] = view.getInt16(at + k * 2, true) * gain + base;
      }
      signals.push({ label: labels[i]!, unit: units[i]!, samplesPerRecord: n, sampleRate: n / recordDuration, samples });
    }
    offset += n;
  }
  annotations.sort((a, b) => a.onset - b.onset);
  return {
    plus: field(192, 5), patient: field(8, 80), recording: field(88, 80), startMs, recordDuration, records,
    signals, annotations, recordOnsets, durationSeconds: records * recordDuration,
  };
}

/** `dd.mm.yy` + `hh.mm.ss` → epoch ms of the same wall-clock fields read as UTC. Years 85–99 are 19xx (EDF spec), others 20xx. */
function parseStart(date: string, time: string): number {
  const d = /^(\d\d)\.(\d\d)\.(\d\d)$/.exec(date), t = /^(\d\d)[.:](\d\d)[.:](\d\d)$/.exec(time);
  if (!d || !t) throw new EdfError(`Bad EDF start date/time: "${date}" "${time}"`);
  const yy = +d[3]!;
  return Date.UTC(yy >= 85 ? 1900 + yy : 2000 + yy, +d[2]! - 1, +d[1]!, +t[1]!, +t[2]!, +t[3]!);
}

const TAL = /^([+-]\d+(?:\.\d*)?)(?:\x15(\d+(?:\.\d*)?))?\x14([\s\S]*)$/;

/** Parses the time-stamped annotation lists of one record. The first TAL of a record is its timekeeping entry. */
function parseTals(bytes: Uint8Array, out: EdfAnnotation[], recordOnsets: number[]): void {
  const text = new TextDecoder('utf-8').decode(bytes);
  let first = true;
  for (const raw of text.split('\x00')) {
    if (!raw) continue;
    const m = TAL.exec(raw);
    if (!m) { first = false; continue; }
    const onset = parseFloat(m[1]!), duration = m[2] ? parseFloat(m[2]) : 0;
    if (first) { recordOnsets.push(onset); first = false; }
    for (const t of m[3]!.split('\x14')) if (t) out.push({ onset, duration, text: t });
  }
}
