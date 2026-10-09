import { buildEdfPlus, MemoryFS, type EdfAnnotation } from '@opencpap/core';

/** Test helpers that build synthetic ResMed cards. Never put real patient data in tests. */

export interface FakeSession {
  /** wall-clock start, e.g. `Date.UTC(2026, 2, 5, 22, 10, 0)` */
  start: number;
  /** whole minutes of therapy */
  minutes: number;
  /** events as ResMed writes them: annotation text and onset in seconds from the session start */
  events?: { text: 'Obstructive Apnea' | 'Central Apnea' | 'Apnea' | 'Hypopnea' | 'Arousal'; onset: number; duration?: number }[];
  /** CSR episodes (written to the CSL file) */
  csr?: { onset: number; duration: number }[];
  /** unintentional leak in L/s (default 0.05) */
  leak?: number;
  /** delivered pressure, cmH2O (default 8) */
  pressure?: number;
  /** skip the files of these kinds */
  omit?: ('BRP' | 'PLD' | 'EVE' | 'CSL')[];
  /** shift the start of the EVE/PLD files by this many seconds (real cards are not perfectly aligned) */
  skewSeconds?: number;
}

export interface FakeCardOptions {
  sessions: FakeSession[];
  serial?: string;
  product?: string;
  /** STR.edf settings of every day */
  mode?: 0 | 1;
  pressure?: number;
  minPressure?: number;
  maxPressure?: number;
  /** write no STR.edf */
  noStr?: boolean;
  /** write no Identification file */
  noIdentification?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`; };
/** noon of the night a timestamp belongs to (ResMed days run noon to noon) */
const noonOf = (ms: number) => { const d = new Date(ms - 12 * 3600_000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12); };

export const FLOW_PERIOD_SECONDS = 4;

export function buildResmedCard(o: FakeCardOptions): MemoryFS {
  const files = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  if (!o.noIdentification) {
    files.set('Identification.tgt', enc.encode(`#SRN ${o.serial ?? 'TEST0000001'}\r\n#PNA ${(o.product ?? 'AirSense 10 AutoSet').replace(/ /g, '_')}\r\n#PCD 37028\r\n#PVR SX567-0401\r\n`));
  }

  for (const s of o.sessions) {
    const records = s.minutes;
    const day = stamp(s.start).slice(0, 8);
    const skew = (s.skewSeconds ?? 0) * 1000;
    const put = (kind: string, startMs: number, bytes: Uint8Array) => files.set(`DATALOG/${day}/${stamp(startMs)}_${kind}.edf`, bytes);
    const omit = new Set(s.omit ?? []);

    if (!omit.has('BRP')) {
      const n = records * 60 * 25;
      const flow = new Float32Array(n), press = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / 25;
        const inApnea = s.events?.some((e) => e.text !== 'Arousal' && t >= e.onset && t < e.onset + (e.duration ?? 10));
        flow[i] = (inApnea ? 0.02 : 0.5) * Math.sin((2 * Math.PI * t) / FLOW_PERIOD_SECONDS);
        press[i] = s.pressure ?? 8;
      }
      put('BRP', s.start, buildEdfPlus({
        startMs: s.start, recordDuration: 60, records,
        signals: [
          { label: 'Flow.40ms', unit: 'L/s', samplesPerRecord: 1500, physMin: -4, physMax: 4, data: flow },
          { label: 'Press.40ms', unit: 'cmH2O', samplesPerRecord: 1500, physMin: 0, physMax: 30, data: press },
        ],
        annotations: [],
      }));
    }
    if (!omit.has('PLD')) {
      const n = records * 30;
      put('PLD', s.start + skew, buildEdfPlus({
        startMs: s.start + skew, recordDuration: 60, records,
        signals: [
          { label: 'Leak.2s', unit: 'L/s', samplesPerRecord: 30, physMin: -0.5, physMax: 2, data: Float32Array.from({ length: n }, () => s.leak ?? 0.05) },
          { label: 'Press.2s', unit: 'cmH2O', samplesPerRecord: 30, physMin: 0, physMax: 30, data: Float32Array.from({ length: n }, () => s.pressure ?? 8) },
        ],
      }));
    }
    const ann = (list: { text: string; onset: number; duration?: number }[]): EdfAnnotation[] => list.map((e) => ({ onset: e.onset, duration: e.duration ?? 0, text: e.text }));
    if (!omit.has('EVE')) {
      put('EVE', s.start + skew, buildEdfPlus({ startMs: s.start + skew, recordDuration: 60, records, signals: [], annotations: ann([{ text: 'Recording starts', onset: 0 }, ...(s.events ?? [])]) }));
    }
    if (s.csr && !omit.has('CSL')) {
      put('CSL', s.start + skew, buildEdfPlus({ startMs: s.start + skew, recordDuration: 60, records, signals: [], annotations: ann(s.csr.map((c) => ({ text: 'CSR Start', ...c }))) }));
    }
  }

  if (!o.noStr && o.sessions.length) {
    const noons = [...new Set(o.sessions.map((s) => noonOf(s.start)))].sort((a, b) => a - b);
    const first = noons[0]!, last = noons.at(-1)!;
    const nDays = Math.round((last - first) / 86_400_000) + 1;
    const perDay = (f: (day: number, sessions: FakeSession[]) => number) => Float32Array.from({ length: nDays }, (_, d) => f(d, o.sessions.filter((s) => noonOf(s.start) === first + d * 86_400_000)));
    const hours = (ss: FakeSession[]) => ss.reduce((a, s) => a + s.minutes, 0) / 60;
    const idx = (text: string) => (_d: number, ss: FakeSession[]) => { const h = hours(ss); return h ? ss.reduce((a, s) => a + (s.events?.filter((e) => e.text === text).length ?? 0), 0) / h : 0; };
    const sig = (label: string, unit: string, min: number, max: number, data: Float32Array, spr = 1) => ({ label, unit, samplesPerRecord: spr, physMin: min, physMax: max, data });
    const maskOn = new Float32Array(nDays * 10).fill(-1), maskOff = new Float32Array(nDays * 10).fill(-1);
    for (let d = 0; d < nDays; d++) {
      o.sessions.filter((s) => noonOf(s.start) === first + d * 86_400_000).slice(0, 10).forEach((s, k) => {
        maskOn[d * 10 + k] = (s.start - (first + d * 86_400_000)) / 60_000;
        maskOff[d * 10 + k] = maskOn[d * 10 + k]! + s.minutes;
      });
    }
    const ahi = (d: number, ss: FakeSession[]) => idx('Obstructive Apnea')(d, ss) + idx('Central Apnea')(d, ss) + idx('Apnea')(d, ss) + idx('Hypopnea')(d, ss);
    files.set('STR.edf', buildEdfPlus({
      startMs: first, recordDuration: 86_400, records: nDays,
      signals: [
        sig('Mask On', 'min', -1, 2000, maskOn, 10), sig('Mask Off', 'min', -1, 2000, maskOff, 10),
        sig('Mode', '', 0, 20, perDay(() => o.mode ?? 1)),
        sig('S.C.Press', 'cmH2O', 0, 30, perDay(() => o.pressure ?? 0)),
        sig('S.A.MinPress', 'cmH2O', 0, 30, perDay(() => o.minPressure ?? 6)),
        sig('S.A.MaxPress', 'cmH2O', 0, 30, perDay(() => o.maxPressure ?? 12)),
        sig('S.EPR.EPREnable', '', 0, 1, perDay(() => 1)), sig('S.EPR.Level', 'cmH2O', 0, 5, perDay(() => 3)),
        sig('Duration', 'min', 0, 2000, perDay((_d, ss) => hours(ss) * 60)),
        sig('AHI', '', 0, 200, perDay(ahi)),
        sig('OAI', '', 0, 200, perDay(idx('Obstructive Apnea'))), sig('CAI', '', 0, 200, perDay(idx('Central Apnea'))),
        sig('HI', '', 0, 200, perDay(idx('Hypopnea'))), sig('UAI', '', 0, 200, perDay(idx('Apnea'))),
        sig('Leak.50', 'L/s', 0, 2, perDay((_d, ss) => (ss[0]?.leak ?? 0.05))),
        sig('Leak.95', 'L/s', 0, 2, perDay((_d, ss) => (ss[0]?.leak ?? 0.05))),
      ],
    }));
  }
  return new MemoryFS(files);
}
