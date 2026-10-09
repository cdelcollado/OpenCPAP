import type { DeviceLoader, VirtualFS, DetectResult, Session, Waveform, TimeSeries, Slice, Progress } from '@opencpap/core';
import { decryptDs2 } from './container';
import { parseChunks, type Chunk } from './chunk';
import { parseSummary } from './summary';
import { parseEvents } from './events';
import { decodeWaveformChunk } from './waveform';
import { deviceInfoFromProperties, parseProperties } from './device';

export { decryptDs2, parseDs2Header } from './container';
export { parseChunks } from './chunk';
export * from './device';

/** Finds `P-SERIES` whatever its case; returns the actual folder name. */
function seriesRoot(paths: string[]): string | undefined {
  for (const p of paths) {
    const first = p.split('/')[0]!;
    if (first.toUpperCase() === 'P-SERIES') return first;
  }
  return undefined;
}

interface SessionFiles { id: number; byExt: Map<number, string[]> }

/** Groups `<device>/P<n>/<8 hex id>.B0<ext>` files by session id. */
function groupSessions(paths: string[], root: string): Map<string, Map<number, SessionFiles>> {
  const devices = new Map<string, Map<number, SessionFiles>>();
  const re = new RegExp(`^${root}/([^/]+)/P\\d+/([0-9A-Fa-f]{8})\\.B(\\d{2})$`, 'i');
  for (const p of paths) {
    const m = re.exec(p);
    if (!m) continue;
    const [, dev, hex, ext] = m;
    const id = parseInt(hex!, 16);
    const sessions = devices.get(dev!) ?? new Map<number, SessionFiles>();
    devices.set(dev!, sessions);
    const s = sessions.get(id) ?? { id, byExt: new Map() };
    sessions.set(id, s);
    const e = parseInt(ext!, 10);
    s.byExt.set(e, [...(s.byExt.get(e) ?? []), p]);
  }
  return devices;
}

async function readChunks(fs: VirtualFS, path: string): Promise<Chunk[]> {
  const { payload } = decryptDs2(await fs.read(path));
  return [...parseChunks(payload)];
}

interface Segment {
  channel: Waveform['channel'];
  unit: string;
  sampleRate: number;
  start: number;
  parts: Float32Array[];
  end: number;
}

/** Gain applied to raw waveform bytes: [flow (signed, L/min), pressure (unsigned, 0.1 cmH2O)]. */
function toWaveforms(chunks: Chunk[]): Waveform[] {
  const out: Waveform[] = [];
  const sorted = [...chunks].sort((a, b) => a.timestamp - b.timestamp);
  const current = new Map<number, Segment>();
  const flush = () => {
    for (const w of current.values()) {
      const n = w.parts.reduce((a, p) => a + p.length, 0);
      const samples = new Float32Array(n);
      let o = 0;
      for (const p of w.parts) { samples.set(p, o); o += p.length; }
      out.push({ channel: w.channel, unit: w.unit, sampleRate: w.sampleRate, start: w.start * 1000, samples });
    }
    current.clear();
  };
  for (const c of sorted) {
    const dec = decodeWaveformChunk(c);
    // A gap or overlap of more than the clock jitter (1 s) starts a new contiguous segment.
    const first = current.values().next().value;
    if (first && Math.abs(dec.start - first.end) > 1) flush();
    dec.signals.forEach((sig, idx) => {
      const flow = idx === 0;
      let w = current.get(idx);
      if (!w) {
        w = { channel: flow ? 'flow' : 'pressure', unit: flow ? 'L/min' : 'cmH2O', sampleRate: sig.sampleRate, start: dec.start, parts: [], end: dec.start };
        current.set(idx, w);
      }
      const f = new Float32Array(sig.bytes.length);
      for (let i = 0; i < f.length; i++) f[i] = flow ? (sig.bytes[i]! << 24) >> 24 : sig.bytes[i]! / 10;
      w.parts.push(f);
      w.end = dec.start + dec.duration;
    });
  }
  flush();
  return out;
}

function toSeries(stats: { channel: TimeSeries['channel']; t: number; value: number }[]): TimeSeries[] {
  const units: Record<TimeSeries['channel'], string> = {
    'pressure-set': 'cmH2O', 'epap-set': 'cmH2O', 'ipap-set': 'cmH2O', 'pressure-avg': 'cmH2O',
    'flex-pressure-avg': 'cmH2O', 'leak-total': 'L/min', 'snore-count': 'count',
  };
  const by = new Map<TimeSeries['channel'], { t: number; value: number }[]>();
  for (const s of stats) by.set(s.channel, [...(by.get(s.channel) ?? []), s]);
  return [...by].map(([channel, rows]) => {
    rows.sort((a, b) => a.t - b.t);
    return { channel, unit: units[channel], times: Float64Array.from(rows, (r) => r.t * 1000), values: Float32Array.from(rows, (r) => r.value) };
  });
}

/** Philips Respironics DreamStation 2 loader (family 0, version 6). */
export const philipsDs2Loader: DeviceLoader = {
  id: 'philips-ds2',

  async detect(fs: VirtualFS): Promise<DetectResult | null> {
    const files = await fs.list();
    const root = seriesRoot(files);
    if (!root) return null;
    const hasProp = files.some((p) => /^[^/]+\/[^/]+\/PROP\.BIN$/i.test(p) && p.toUpperCase().startsWith('P-SERIES/'));
    return { device: { manufacturer: 'Philips Respironics', model: 'DreamStation 2' }, confidence: hasProp ? 0.9 : 0.5 };
  },

  async *load(fs: VirtualFS, onProgress?: Progress): AsyncIterable<Session> {
    const paths = await fs.list();
    const root = seriesRoot(paths);
    if (!root) return;
    const devices = groupSessions(paths, root);
    let total = 0;
    for (const s of devices.values()) total += s.size;
    let done = 0;

    for (const [dev, sessions] of devices) {
      const propPath = paths.find((p) => p.toUpperCase() === `${root}/${dev}/PROP.BIN`.toUpperCase());
      const props = propPath ? parseProperties(new TextDecoder().decode(decryptDs2(await fs.read(propPath)).payload)) : {};
      const device = deviceInfoFromProperties(props);

      for (const id of [...sessions.keys()].sort((a, b) => a - b)) {
        const files = sessions.get(id)!;
        onProgress?.(done++, total);
        const session = await buildSession(fs, device, files);
        if (session) yield session;
      }
    }
    onProgress?.(total, total);
  },
};

async function buildSession(fs: VirtualFS, device: Session['device'], files: SessionFiles): Promise<Session | undefined> {
  const summaryChunks = (await Promise.all((files.byExt.get(1) ?? []).map((p) => readChunks(fs, p)))).flat();
  const summary = summaryChunks.find((c) => c.family === 0 && c.familyVersion === 6);
  if (!summary) return undefined; // without a summary we know neither settings nor mask times (OSCAR skips these too)

  const parsed = parseSummary(summary);
  const base = summary.timestamp;
  const marks = parsed.slices;
  const slices: Slice[] = [];
  const sessionEnd = base + parsed.duration;
  marks.forEach((m, i) => {
    const start = (base + m.t) * 1000;
    const end = (i + 1 < marks.length ? base + marks[i + 1]!.t : sessionEnd) * 1000;
    if (end > start && (m.kind === 'mask-on' || m.kind === 'mask-off')) slices.push({ start, end, status: m.kind });
  });

  const events: Session['events'] = [];
  const stats: Parameters<typeof toSeries>[0] = [];
  let unknown = parsed.unknownRecords;
  for (const p of files.byExt.get(2) ?? []) {
    for (const c of await readChunks(fs, p)) {
      if (c.family !== 0 || c.familyVersion !== 6) continue;
      const r = parseEvents(c);
      unknown += r.unknownRecords;
      for (const e of r.events) events.push({ type: e.type, start: (c.timestamp + e.start) * 1000, duration: e.duration, ...(e.code === 0x0b && { detail: 'alt-hypopnea' }) });
      for (const s of r.stats) stats.push({ channel: s.channel, t: c.timestamp + s.t, value: s.value });
    }
  }
  events.sort((a, b) => a.start - b.start);

  const waveChunks = (await Promise.all((files.byExt.get(5) ?? []).map((p) => readChunks(fs, p)))).flat().filter((c) => c.htype === 1);

  const firstOn = slices.find((s) => s.status === 'mask-on');
  return {
    id: files.id,
    device,
    start: firstOn?.start ?? base * 1000,
    end: sessionEnd * 1000,
    clock: 'device-local',
    slices,
    settings: parsed.settings,
    events,
    waveforms: toWaveforms(waveChunks),
    statistics: toSeries(stats),
    unknownRecords: unknown,
    deviceSummary: parsed.deviceCounts && {
      obstructive: parsed.deviceCounts.obstructive,
      central: parsed.deviceCounts.central,
      hypopnea: parsed.deviceCounts.hypopnea,
      rera: parsed.deviceCounts.rera,
      'flow-limitation': parsed.deviceCounts.flowLimitation,
    },
  };
}
