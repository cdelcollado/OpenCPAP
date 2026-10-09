import { describe, expect, it } from 'vitest';
import { breathWindows, detectBreaths, FLAT_SHAPE, periodicity, summarizeBreaths } from './breath';
import { rng } from './demo';

interface Synth { bpm?: number; seconds?: number; rate?: number; amp?: number; /** < 1 flattens the inspiration */ flat?: number; noise?: number; seed?: number; /** amplitude modulation period (s) and depth 0..1 */ modPeriod?: number; modDepth?: number; ti?: number }

/** Inspiration positive (power-sine), abrupt switch to an exponentially decaying expiration, like the real signal. */
function synth({ bpm = 15, seconds = 300, rate = 5, amp = 25, flat = 1, noise = 1, seed = 1, modPeriod, modDepth = 0, ti = 1.4 }: Synth = {}) {
  const r = rng(seed), n = Math.round(seconds * rate), out = new Float32Array(n), period = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / rate, ph = t % period;
    const a = amp * (modPeriod ? 1 - modDepth * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / modPeriod)) : 1);
    const v = ph < ti ? a * Math.sin((Math.PI * ph) / ti) ** flat : -a * 1.1 * Math.exp(-(ph - ti) / 0.9);
    out[i] = Math.round(v + (r() - 0.5) * 2 * noise);
  }
  return out;
}

describe('detectBreaths', () => {
  it('finds the breaths and their rate and timing', () => {
    const b = detectBreaths(synth({ bpm: 15 }), 5);
    const s = summarizeBreaths(b);
    expect(b.length).toBeGreaterThan(60);
    expect(s.rate).toBeCloseTo(15, 0);
    expect(s.ti).toBeGreaterThan(0.9);
    expect(s.ti).toBeLessThan(1.8);
    expect(s.ieRatio).toBeGreaterThan(1.0); // expiration longer than inspiration
    expect(s.periodCv).toBeLessThan(0.1);
  });
  it('follows a change of rate', () => {
    expect(summarizeBreaths(detectBreaths(synth({ bpm: 10 }), 5)).rate).toBeCloseTo(10, 0);
    // at 5 Hz one sample is 0.2 s, so fast rates are quantised (24/min = 12.5 samples per breath)
    expect(Math.abs(summarizeBreaths(detectBreaths(synth({ bpm: 24 }), 5)).rate! - 24)).toBeLessThanOrEqual(1.2);
  });
  it('tells a rounded inspiration from a flat-topped one', () => {
    const round = summarizeBreaths(detectBreaths(synth({ flat: 1 }), 5));
    const flat = summarizeBreaths(detectBreaths(synth({ flat: 0.2 }), 5));
    expect(round.shape!).toBeLessThan(0.75);
    expect(flat.shape!).toBeGreaterThan(round.shape! + 0.1);
    expect(flat.flatShare!).toBeGreaterThan(round.flatShare! + 0.5);
    expect(round.flatShare!).toBeLessThan(0.1);
    expect(FLAT_SHAPE).toBeGreaterThan(0.7);
  });
  it('is insensitive to the scale of the signal', () => {
    const a = summarizeBreaths(detectBreaths(synth({ amp: 5, noise: 0.2 }), 5));
    const b = summarizeBreaths(detectBreaths(synth({ amp: 80, noise: 0.2 }), 5));
    expect(a.rate).toBeCloseTo(b.rate!, 0);
    expect(a.shape!).toBeCloseTo(b.shape!, 1);
  });
  it('survives a baseline offset and slow drift', () => {
    const x = synth({ seconds: 300 });
    const drift = Float32Array.from(x, (v, i) => v + 6 + 4 * Math.sin(i / 400));
    expect(summarizeBreaths(detectBreaths(drift, 5)).rate).toBeCloseTo(15, 0);
  });
  it('ignores pure noise and flat lines', () => {
    const r = rng(3);
    expect(detectBreaths(Float32Array.from({ length: 2000 }, () => (r() - 0.5) * 0.4), 5).length).toBeLessThan(5);
    expect(detectBreaths(new Float32Array(2000), 5)).toEqual([]);
    expect(detectBreaths(new Float32Array(20), 5)).toEqual([]);
  });
  it('measures irregular breathing as variable', () => {
    const r = rng(9);
    const parts: number[] = [];
    while (parts.length < 1500) { const seg = synth({ bpm: 8 + r() * 20, seconds: 6 + r() * 10, seed: Math.floor(r() * 1000) }); parts.push(...seg); }
    expect(summarizeBreaths(detectBreaths(Float32Array.from(parts), 5)).periodCv!).toBeGreaterThan(0.2);
  });
});

describe('breathWindows', () => {
  it('summarises consecutive windows along the recording', () => {
    const w = breathWindows(detectBreaths(synth({ seconds: 1200 }), 5), 300);
    expect(w.length).toBeGreaterThanOrEqual(3);
    for (const x of w) expect(x.rate).toBeCloseTo(15, 0);
    expect(w[1]!.t - w[0]!.t).toBeCloseTo(300);
  });
});

describe('periodicity', () => {
  it('detects waxing and waning of breath size with a 60 s period', () => {
    const p = periodicity(detectBreaths(synth({ seconds: 1800, modPeriod: 60, modDepth: 0.7 }), 5));
    expect(p.share).toBeGreaterThan(0.6);
    expect(p.period).toBeGreaterThanOrEqual(50);
    expect(p.period).toBeLessThanOrEqual(70);
  });
  it('does not flag steady breathing', () => {
    expect(periodicity(detectBreaths(synth({ seconds: 1800 }), 5)).share).toBeLessThan(0.1);
  });
  it('needs enough breaths', () => expect(periodicity([]).share).toBe(0));
});
