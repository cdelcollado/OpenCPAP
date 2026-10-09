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

  for (let n = 0; n < nights; n++) {
    const day = end - (nights - 1 - n) * 86400_000;
    if (r() < 0.06) continue; // a missed night now and then
    const startMs = day + (22 * 60 + 15 + Math.round((r() - 0.5) * 90)) * 60_000; // ~22:15 ± 45 min
    const hours = Math.max(0.5, 7.2 + (r() - 0.5) * 3.2 - (r() < 0.08 ? 4 : 0));
    const durS = Math.round(hours * 3600);
    const endMs = startMs + durS * 1000;

    const rate = 1.2 + 2.5 * r() * r(); // events/hour, most nights low
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
    const base = 4 + r() * 6;
    for (let i = 0; i < intervals; i++) {
      times[i] = startMs + (i + 1) * 120_000;
      leak[i] = Math.max(0, base + (r() - 0.5) * 6 + (r() < 0.02 ? 25 : 0));
      snore[i] = r() < 0.25 ? Math.round(r() * 3) : 0;
    }
    const pressure = 9.5;
    const statistics: TimeSeries[] = [
      { channel: 'leak-total', unit: 'L/min', times, values: leak },
      { channel: 'snore-count', unit: 'count', times, values: snore },
      { channel: 'pressure-set', unit: 'cmH2O', times: Float64Array.of(startMs, startMs + 15 * 60_000), values: Float32Array.of(4, pressure) },
    ];

    const waveforms: Waveform[] = [];
    if (n >= nights - waveformNights) {
      const rateHz = 5, count = durS * rateHz, flow = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const t = i / rateHz;
        flow[i] = 22 * Math.sin((2 * Math.PI * t) / 4) + (r() - 0.5) * 4;
      }
      waveforms.push({ channel: 'flow', unit: 'L/min', sampleRate: rateHz, start: startMs, samples: flow });
    }

    out.push({
      id: n + 1, device, start: startMs, end: endMs, clock: 'device-local',
      slices: [{ start: startMs, end: endMs, status: 'mask-on' }],
      settings: { mode: 'cpap', pressure, rampTimeMinutes: 15, rampType: 'ramp-plus', rampPressure: 4, humidifierPresent: true, humidifierMode: 'adaptive', humidifierLevel: 3, tubingDiameterMm: 15 },
      events, waveforms, statistics, unknownRecords: 0,
    });
  }
  return out;
}
