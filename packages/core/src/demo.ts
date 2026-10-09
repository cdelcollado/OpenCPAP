import { analyzeSession } from './analysis';
import type { OximetryRecording } from './oximetry';
import type { Session, TherapyEvent, TimeSeries, Waveform } from './model';

/** Small deterministic PRNG (mulberry32) so demo data and tests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoOptions {
  nights?: number;
  /** last night, YYYY-MM-DD */
  endDate?: string;
  seed?: number;
  /** only the most recent N nights get a flow waveform (they are large) */
  waveformNights?: number;
}

const poisson = (r: () => number, lambda: number) => {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L && k < 200);
  return k - 1;
};

/**
 * Generates plausible but entirely synthetic sessions (a fictitious CPAP user) so people can explore the app
 * without a card, and so tests have realistic data. Never derived from real patient data.
 */
export function generateDemoSessions(opts: DemoOptions = {}): Session[] {
  const nights = opts.nights ?? 60;
  const r = rng(opts.seed ?? 42);
  const end = Date.parse(`${opts.endDate ?? '2026-06-30'}T00:00:00Z`);
  const waveformNights = opts.waveformNights ?? 3;
  const device = { manufacturer: 'Demo', model: 'Demo CPAP (synthetic data)', serial: 'DEMO-0001', firmware: '1.0' };
  const out: Session[] = [];
  // a story for the demo: the pressure is raised once (events drop afterwards), and the leak creeps up as the
  // cushion ages until it is replaced
  const changeAt = nights >= 10 ? Math.floor(nights * 0.62) : nights; // very short demos have no story
  const cushionReplacedAt = Math.floor(nights * 0.45);

  for (let n = 0; n < nights; n++) {
    const day = end - (nights - 1 - n) * 86400_000;
    if (r() < 0.06) continue; // a missed night now and then
    const startMs = day + (22 * 60 + 15 + Math.round((r() - 0.5) * 90)) * 60_000; // ~22:15 ± 45 min
    const hours = Math.max(0.5, 7.2 + (r() - 0.5) * 3.2 - (r() < 0.08 ? 4 : 0));
    const durS = Math.round(hours * 3600);
    const endMs = startMs + durS * 1000;

    const rate = (1.2 + 2.5 * r() * r()) * (n >= changeAt ? 0.75 : 1); // events/hour, most nights low
    const events: TherapyEvent[] = [];
    const add = (type: TherapyEvent['type'], count: number, duration = 0) => {
      for (let i = 0; i < count; i++) events.push({ type, start: startMs + Math.round(r() * durS) * 1000, duration });
    };
    add('obstructive', poisson(r, rate * 0.35 * hours));
    add('central', poisson(r, rate * 0.1 * hours));
    add('hypopnea', poisson(r, rate * 0.55 * hours));
    add('rera', poisson(r, 0.8 * hours));
    add('flow-limitation', poisson(r, 0.5 * hours));
    add('large-leak', poisson(r, 0.15 * hours), 60 + Math.round(r() * 240));
    events.sort((a, b) => a.start - b.start);

    const intervals = Math.floor(durS / 120);
    const times = new Float64Array(intervals), leak = new Float32Array(intervals), snore = new Float32Array(intervals);
    const cushionAge = n < cushionReplacedAt ? n : n - cushionReplacedAt;
    const base = 3 + 0.09 * cushionAge + r() * 3;
    for (let i = 0; i < intervals; i++) {
      times[i] = startMs + (i + 1) * 120_000;
      leak[i] = Math.max(0, base + (r() - 0.5) * 6 + (r() < 0.02 ? 25 : 0));
      snore[i] = r() < 0.25 ? Math.round(r() * 3) : 0;
    }
    const pressure = n >= changeAt ? 10 : 9.5;
    const statistics: TimeSeries[] = [
      { channel: 'leak-total', unit: 'L/min', times, values: leak },
      { channel: 'snore-count', unit: 'count', times, values: snore },
      { channel: 'pressure-set', unit: 'cmH2O', times: Float64Array.of(startMs, startMs + 15 * 60_000), values: Float32Array.of(4, pressure) },
    ];

    const waveforms: Waveform[] = [];
    if (n >= nights - waveformNights) {
      // breathing like the real signal: smooth inspiration (positive), abrupt switch to a decaying expiration.
      // Each night has its own breath rate and "flatness" (a smaller exponent flattens the inspiration).
      const rateHz = 5, count = durS * rateHz, flow = new Float32Array(count);
      const bpm = 14 + r() * 5, period = 60 / bpm, flatPower = 0.55 + r() * 0.5;
      for (let i = 0; i < count; i++) {
        const t = i / rateHz, ph = t % period, ti = 1.4;
        const v = ph < ti ? 24 * Math.sin((Math.PI * ph) / ti) ** flatPower : -26 * Math.exp(-(ph - ti) / 0.9);
        flow[i] = Math.round(v + (r() - 0.5) * 3);
      }
      waveforms.push({ channel: 'flow', unit: 'L/min', sampleRate: rateHz, start: startMs, samples: flow });
    }

    out.push({
      id: n + 1, device, start: startMs, end: endMs, clock: 'device-local',
      slices: [{ start: startMs, end: endMs, status: 'mask-on' }],
      settings: { mode: 'cpap', pressure, rampTimeMinutes: 15, rampType: 'ramp-plus', rampPressure: 4, humidifierPresent: true, humidifierMode: 'adaptive', humidifierLevel: 3, tubingDiameterMm: 15 },
      events, waveforms, statistics, unknownRecords: 0, analysis: analyzeSession(waveforms),
    });
  }
  return out;
}

/**
 * A fictitious pulse-oximeter recording that goes with a demo session: SpO2 around 95 % with a dip after each
 * obstructive apnea or hypopnea (the more events, the more dips), pulse rising a little after each dip. 1 Hz.
 */
export function generateDemoOximetry(session: Pick<Session, 'start' | 'end' | 'events'>, seed = 7): OximetryRecording {
  const r = rng(seed);
  const seconds = Math.floor((session.end - session.start) / 1000);
  const times = new Float64Array(seconds), spo2 = new Float32Array(seconds), pulse = new Float32Array(seconds);
  const dips = session.events.filter((e) => e.type === 'obstructive' || e.type === 'hypopnea' || e.type === 'central').map((e) => ({ at: Math.round((e.start - session.start) / 1000), depth: 3 + Math.round(r() * 3), len: 20 + Math.round(r() * 25) }));
  for (let i = 0; i < seconds; i++) {
    times[i] = session.start + i * 1000;
    let v = 95.5 + Math.sin(i / 900) * 0.6 + (r() - 0.5) * 0.8, p = 58 + Math.sin(i / 1500) * 3 + (r() - 0.5) * 2;
    for (const d of dips) { const k = i - d.at; if (k >= 0 && k < d.len) { v -= d.depth * Math.sin((Math.PI * k) / d.len); p += 6 * Math.sin((Math.PI * k) / d.len); } }
    spo2[i] = Math.round(Math.min(100, Math.max(70, v))); pulse[i] = Math.round(p);
  }
  return { times, spo2, pulse };
}
