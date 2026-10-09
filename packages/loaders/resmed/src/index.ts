import { readEdf, type DetectResult, type DeviceLoader, type EdfData, type Progress, type Session, type TherapyEvent, type TimeSeries, type VirtualFS, type Waveform } from '@opencpap/core';
import { deviceInfo, parseIdentificationJson, parseTgt, type Identification } from './identification';
import { dayFor, parseStr, type StrDay } from './str';

export * from './identification';
export * from './str';

type Kind = 'BRP' | 'PLD' | 'EVE' | 'CSL' | 'SAD';

interface DataFile { path: string; kind: Kind }

const DATA_RE = /(?:^|\/)DATALOG\/\d{8}\/\d{8}_\d{6}_(BRP|PLD|EVE|CSL|SAD)\.edf$/i;
const STR_RE = /(?:^|\/)STR\.edf$/i;

/** Finds a card-root file whatever its case (FAT is case-insensitive and devices differ). */
const findRoot = (paths: string[], name: string) => paths.find((p) => p.toLowerCase() === name.toLowerCase());

function dataFiles(paths: string[]): DataFile[] {
  const out: DataFile[] = [];
  for (const p of paths) {
    const m = DATA_RE.exec(p);
    if (m) out.push({ path: p, kind: m[1]!.toUpperCase() as Kind });
  }
  return out;
}

async function readIdentification(fs: VirtualFS, paths: string[]): Promise<Identification | undefined> {
  const tgt = findRoot(paths, 'Identification.tgt');
  if (tgt) { const id = parseTgt(new TextDecoder().decode(await fs.read(tgt))); if (id) return id; }
  const json = findRoot(paths, 'Identification.json');
  if (json) return parseIdentificationJson(new TextDecoder().decode(await fs.read(json)));
  return undefined;
}

/** One EDF file with the interval it covers. */
interface Part { kind: Kind; edf: EdfData; start: number; end: number }

/**
 * Tolerance, in ms, when attaching a file that has no flow file of its own (events, pressure statistics) to the
 * session whose flow file covers its start. Different files of one session are written within a second or two.
 */
const ATTACH_TOLERANCE_MS = 60_000;

/**
 * Groups the files of a card into sessions. Files of one session share the `YYYYMMDD_HHMMSS` prefix; a group without
 * a flow (BRP) file is attached to the flow file that covers its start, or becomes a session of its own.
 */
function groupParts(parts: Part[]): Part[][] {
  const byStart = new Map<number, Part[]>();
  for (const p of parts) byStart.set(p.start, [...(byStart.get(p.start) ?? []), p]);
  const groups = [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
  const flowGroups = groups.filter((g) => g.some((p) => p.kind === 'BRP'));
  const result: Part[][] = [...flowGroups];
  for (const g of groups) {
    if (flowGroups.includes(g)) continue;
    const start = Math.min(...g.map((p) => p.start));
    const host = flowGroups.find((f) => {
      const s = Math.min(...f.map((p) => p.start)), e = Math.max(...f.map((p) => p.end));
      return start >= s - ATTACH_TOLERANCE_MS && start <= e + ATTACH_TOLERANCE_MS;
    });
    if (host) host.push(...g); else result.push(g);
  }
  return result.sort((a, b) => Math.min(...a.map((p) => p.start)) - Math.min(...b.map((p) => p.start)));
}

const unitScale = (unit: string) => (/^L\/s$/i.test(unit) ? 60 : 1);

function toEvents(part: Part): { events: TherapyEvent[]; unknown: number } {
  const events: TherapyEvent[] = [];
  let unknown = 0;
  for (const a of part.edf.annotations) {
    const text = a.text.trim();
    const lower = text.toLowerCase();
    let type: TherapyEvent['type'] | undefined;
    if (part.kind === 'CSL') type = /csr start|cheyne/i.test(text) ? 'periodic-breathing' : undefined;
    else if (lower === 'obstructive apnea') type = 'obstructive';
    else if (lower === 'central apnea') type = 'central';
    else if (lower === 'apnea') type = 'unclassified-apnea';
    else if (lower === 'hypopnea') type = 'hypopnea';
    else if (lower === 'arousal') type = 'rera';
    else if (/recording starts|csr end/i.test(text) || text === '') continue;
    if (!type) { unknown++; continue; }
    events.push({ type, start: part.start + a.onset * 1000, duration: a.duration });
  }
  return { events, unknown };
}

/** End-of-interval timestamps for a regularly sampled signal, so it can be stored as a statistics series. */
function series(part: Part, label: string, channel: TimeSeries['channel'], unit: string, scale: number, changesOnly = 0): TimeSeries | undefined {
  const sig = part.edf.signals.find((s) => s.label.startsWith(label));
  if (!sig) return undefined;
  const times: number[] = [], values: number[] = [];
  const step = 1000 / sig.sampleRate;
  let last = NaN;
  for (let i = 0; i < sig.samples.length; i++) {
    const v = sig.samples[i]! * scale;
    // negative / NaN readings are the device's "no data" markers
    if (Number.isNaN(v) || v < 0) continue;
    if (changesOnly && Math.abs(v - last) < changesOnly) continue;
    last = v;
    times.push(part.start + (i + 1) * step);
    values.push(v);
  }
  return times.length ? { channel, unit, times: Float64Array.from(times), values: Float32Array.from(values) } : undefined;
}

function toWaveform(part: Part, label: string, channel: Waveform['channel'], unit: string): Waveform | undefined {
  const sig = part.edf.signals.find((s) => s.label.startsWith(label));
  if (!sig || sig.samples.length === 0) return undefined;
  const scale = unitScale(sig.unit);
  const samples = scale === 1 ? sig.samples : sig.samples.map((v) => v * scale);
  return { channel, unit, sampleRate: sig.sampleRate, start: part.start, samples };
}

function buildSession(device: Session['device'], parts: Part[], days: StrDay[]): Session {
  const start = Math.min(...parts.map((p) => p.start));
  const end = Math.max(...parts.map((p) => p.end));
  const events: TherapyEvent[] = [];
  const waveforms: Waveform[] = [];
  const statistics: TimeSeries[] = [];
  let unknown = 0;
  for (const part of [...parts].sort((a, b) => a.start - b.start)) {
    if (part.kind === 'EVE' || part.kind === 'CSL') {
      const r = toEvents(part);
      events.push(...r.events);
      unknown += r.unknown;
    } else if (part.kind === 'BRP') {
      for (const w of [toWaveform(part, 'Flow', 'flow', 'L/min'), toWaveform(part, 'Press', 'pressure', 'cmH2O')]) if (w) waveforms.push(w);
    } else if (part.kind === 'PLD') {
      // Leak is reported in L/s; the pressure the device is delivering is stored as changes only
      for (const s of [series(part, 'Leak', 'leak-unintentional', 'L/min', 60), series(part, 'Press', 'pressure-set', 'cmH2O', 1, 0.05)]) if (s) statistics.push(s);
    }
  }
  events.sort((a, b) => a.start - b.start);
  return {
    id: Math.floor(start / 1000),
    device,
    start,
    end,
    clock: 'device-local',
    // The data files only exist while the mask is on, so the whole span is therapy time.
    slices: [{ start, end, status: 'mask-on' }],
    settings: dayFor(days, start)?.settings ?? {},
    events,
    waveforms: mergeWaveforms(waveforms),
    statistics: mergeSeries(statistics),
    unknownRecords: unknown,
  };
}

/** Several files of one kind in a session become one series each (sorted by time). */
function mergeSeries(all: TimeSeries[]): TimeSeries[] {
  const by = new Map<TimeSeries['channel'], TimeSeries[]>();
  for (const s of all) by.set(s.channel, [...(by.get(s.channel) ?? []), s]);
  return [...by].map(([channel, list]) => {
    if (list.length === 1) return list[0]!;
    const n = list.reduce((a, s) => a + s.times.length, 0);
    const times = new Float64Array(n), values = new Float32Array(n);
    let o = 0;
    for (const s of list) { times.set(s.times, o); values.set(s.values, o); o += s.times.length; }
    return { channel, unit: list[0]!.unit, times, values };
  });
}

/** Waveform segments stay separate (a gap between files must not be bridged); they are only ordered. */
const mergeWaveforms = (w: Waveform[]) => [...w].sort((a, b) => a.start - b.start || a.channel.localeCompare(b.channel));

/** ResMed AirSense 10 / AirCurve 10 / S9 (EDF+) loader; AirSense 11 support is best-effort and *unverified*. */
export const resmedLoader: DeviceLoader = {
  id: 'resmed',

  async detect(fs: VirtualFS): Promise<DetectResult | null> {
    const paths = await fs.list();
    const files = dataFiles(paths);
    const hasStr = paths.some((p) => STR_RE.test(p));
    const id = findRoot(paths, 'Identification.tgt') ?? findRoot(paths, 'Identification.json');
    if (files.length === 0 && !(hasStr && id)) return null;
    const ident = id ? await readIdentification(fs, paths) : undefined;
    return { device: { manufacturer: 'ResMed', model: deviceInfo(ident).model }, confidence: id && hasStr && files.length ? 0.95 : hasStr && files.length ? 0.8 : 0.5 };
  },

  async *load(fs: VirtualFS, onProgress?: Progress): AsyncIterable<Session> {
    const paths = await fs.list();
    const device = deviceInfo(await readIdentification(fs, paths));
    const strPath = paths.find((p) => STR_RE.test(p));
    let days: StrDay[] = [];
    if (strPath) {
      try { days = parseStr(await fs.read(strPath)); } catch { /* settings are optional: a damaged STR.edf must not block the therapy data */ }
    }

    const parts: Part[] = [];
    for (const f of dataFiles(paths)) {
      try {
        const edf = readEdf(await fs.read(f.path));
        parts.push({ kind: f.kind, edf, start: edf.startMs, end: edf.startMs + edf.durationSeconds * 1000 });
      } catch { /* a damaged file is skipped; its siblings are still imported */ }
    }
    const groups = groupParts(parts);
    for (let i = 0; i < groups.length; i++) {
      onProgress?.(i, groups.length);
      yield buildSession(device, groups[i]!, days);
    }
    onProgress?.(groups.length, groups.length);
  },
};
