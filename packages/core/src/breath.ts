import { percentile } from './nights';

/**
 * Breath-by-breath analysis of a flow waveform (positive = inspiration, see docs/formats/ds2.md).
 *
 * Everything here is **scale-free**: it uses times, ratios and coefficients of variation, never absolute flow or
 * volume, because the physical unit of the device's flow samples is not verified. The DreamStation 2 records flow at
 * only 5 Hz (about 15 samples per breath), so these are coarse, experimental measures: they are not the Glasgow
 * index and must not be compared with 25 Hz tools such as AirwayLab.
 */

export interface Breath {
  /** start of the inspiration, seconds from the start of the analysed segment */
  t: number;
  /** inspiratory and expiratory time, seconds */
  ti: number;
  te: number;
  /** highest inspiratory flow */
  peak: number;
  /** mean inspiratory flow divided by the peak: ≈ 0.64 for a sine, → 1 for a flat-topped (flow-limited) shape */
  shape: number;
  /** inspiratory volume in arbitrary units (sum of flow / sample rate), only meaningful relative to other breaths */
  volume: number;
}

export interface BreathOptions {
  /** breaths outside these bounds are discarded as artefacts */
  minPeriod: number; maxPeriod: number; minTi: number; maxTi: number;
  /** dead band around zero as a fraction of the robust signal amplitude */
  deadband: number;
  /** ignore breaths whose peak is smaller than this fraction of the amplitude */
  minPeakShare: number;
  /** below this robust amplitude (in raw device counts, i.e. a few quantisation steps) the segment is treated as noise */
  minAmplitude: number;
}
export const DEFAULT_BREATH_OPTIONS: BreathOptions = { minPeriod: 1.5, maxPeriod: 12, minTi: 0.4, maxTi: 6, deadband: 0.08, minPeakShare: 0.25, minAmplitude: 3 };

/** Mean of `x` over a sliding window (centered), via a running sum. */
function movingMean(x: ArrayLike<number>, window: number): Float64Array {
  const n = x.length, out = new Float64Array(n), half = Math.max(1, Math.floor(window / 2));
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i]! + x[i]!;
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - half), b = Math.min(n, i + half + 1); out[i] = (cum[b]! - cum[a]!) / (b - a); }
  return out;
}

/**
 * Finds breaths in one contiguous flow segment. Method: remove the slow baseline (moving mean over ~15 s), find
 * inspiration (flow above a small dead band) and expiration (below it) phases, and take one breath per inspiration
 * onset. Phases that are too short, too long or too small are dropped.
 */
export function detectBreaths(samples: ArrayLike<number>, rate: number, opts: Partial<BreathOptions> = {}): Breath[] {
  const o = { ...DEFAULT_BREATH_OPTIONS, ...opts };
  const n = samples.length;
  if (n < rate * 10) return [];
  const base = movingMean(samples, Math.round(15 * rate));
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = samples[i]! - base[i]!;
  const amp = percentile(Float64Array.from(x, Math.abs), 90);
  if (!(amp >= o.minAmplitude)) return [];
  const db = amp * o.deadband;

  // phase boundaries: inspiration onsets and the expiration onset that follows each
  const onsets: { inIdx: number; exIdx: number }[] = [];
  let state: 0 | 1 | -1 = 0; // 1 inspiration, -1 expiration
  for (let i = 0; i < n; i++) {
    const v = x[i]!;
    const nextState: 0 | 1 | -1 = v > db ? 1 : v < -db ? -1 : state;
    if (nextState === 1 && state !== 1) onsets.push({ inIdx: i, exIdx: -1 });
    else if (nextState === -1 && state === 1 && onsets.length) onsets[onsets.length - 1]!.exIdx = i;
    state = nextState;
  }

  const out: Breath[] = [];
  for (let k = 0; k + 1 < onsets.length; k++) {
    const cur = onsets[k]!, nxt = onsets[k + 1]!;
    if (cur.exIdx < 0) continue;
    const period = (nxt.inIdx - cur.inIdx) / rate, ti = (cur.exIdx - cur.inIdx) / rate, te = (nxt.inIdx - cur.exIdx) / rate;
    if (period < o.minPeriod || period > o.maxPeriod || ti < o.minTi || ti > o.maxTi) continue;
    let peak = -Infinity, sum = 0;
    for (let i = cur.inIdx; i < cur.exIdx; i++) { const v = x[i]!; if (v > peak) peak = v; sum += v; }
    if (peak < amp * o.minPeakShare) continue;
    const len = cur.exIdx - cur.inIdx;
    out.push({ t: cur.inIdx / rate, ti, te, peak, shape: sum / len / peak, volume: sum / rate });
  }
  return out;
}

/* ---------------- summaries ---------------- */

export interface BreathSummary {
  breaths: number;
  /** breaths per minute, from the median breath period */
  rate?: number;
  /** coefficient of variation of the breath period (0 = metronome) */
  periodCv?: number;
  /** coefficient of variation of the inspiratory volume of consecutive breaths */
  volumeCv?: number;
  /** median inspiratory time, seconds */
  ti?: number;
  /** median expiratory time over median inspiratory time */
  ieRatio?: number;
  /** median of mean/peak inspiratory flow (see `Breath.shape`) */
  shape?: number;
  /** share of breaths flatter than `FLAT_SHAPE`, 0..1 (experimental flow-limitation indicator) */
  flatShare?: number;
}

/** Inspiratory shape above this ratio counts as "flat-topped". Calibrated on the sample card, see docs/analytics.md. */
export const FLAT_SHAPE = 0.8;

const median = (xs: number[]) => (xs.length ? percentile(xs, 50) : undefined);
const cv = (xs: number[]) => {
  if (xs.length < 3) return undefined;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!(m > 0)) return undefined;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m;
};

export function summarizeBreaths(b: Breath[]): BreathSummary {
  if (b.length === 0) return { breaths: 0 };
  const period = b.map((x) => x.ti + x.te);
  const ti = median(b.map((x) => x.ti)), te = median(b.map((x) => x.te));
  const mp = median(period);
  return {
    breaths: b.length,
    rate: mp ? 60 / mp : undefined,
    periodCv: cv(period),
    volumeCv: cv(b.map((x) => x.volume)),
    ti,
    ieRatio: ti && te ? te / ti : undefined,
    shape: median(b.map((x) => x.shape)),
    flatShare: b.filter((x) => x.shape >= FLAT_SHAPE).length / b.length,
  };
}

export interface BreathWindow extends BreathSummary { /** seconds from the segment start (window middle) */ t: number }

/** Summaries over consecutive windows (default 5 min), for plotting along the night. Windows with < 20 breaths are skipped. */
export function breathWindows(b: Breath[], windowSeconds = 300): BreathWindow[] {
  const out: BreathWindow[] = [];
  let i = 0;
  while (i < b.length) {
    const w0 = Math.floor(b[i]!.t / windowSeconds) * windowSeconds;
    const j = b.findIndex((x, k) => k >= i && x.t >= w0 + windowSeconds);
    const end = j < 0 ? b.length : j;
    const slice = b.slice(i, end);
    if (slice.length >= 20) out.push({ ...summarizeBreaths(slice), t: w0 + windowSeconds / 2 });
    i = end;
  }
  return out;
}

/* ---------------- periodic breathing ---------------- */

export interface Periodicity {
  /** share of 6-minute windows with a clear waxing-and-waning pattern, 0..1 */
  share: number;
  /** median period of the pattern in seconds, when any window qualifies */
  period?: number;
}

/**
 * Looks for waxing and waning of breath size (periodic breathing / Cheyne–Stokes-like patterns): the inspiratory
 * volumes are resampled every 2 s and the autocorrelation is searched for a peak at lags of 20–120 s. A window counts
 * when the peak is ≥ 0.5 and the volumes vary by more than 25 %. Experimental; the device's own periodic-breathing
 * events remain the reference.
 */
export function periodicity(b: Breath[], windowSeconds = 360): Periodicity {
  if (b.length < 60) return { share: 0 };
  const step = 2;
  const t0 = b[0]!.t, t1 = b.at(-1)!.t;
  const n = Math.floor((t1 - t0) / step);
  const env = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * step;
    while (k + 1 < b.length && b[k + 1]!.t <= t) k++;
    env[i] = b[k]!.volume;
  }
  const w = Math.round(windowSeconds / step);
  let windows = 0, hits = 0;
  const periods: number[] = [];
  for (let s = 0; s + w <= n; s += Math.round(w / 2)) {
    windows++;
    const seg = env.slice(s, s + w);
    const m = seg.reduce((a, c) => a + c, 0) / w;
    if (!(m > 0)) continue;
    const dev = seg.map((v) => v - m);
    const varSum = dev.reduce((a, c) => a + c * c, 0);
    if (Math.sqrt(varSum / w) / m < 0.25) continue;
    let best = -1, bestLag = 0;
    for (let lag = 10; lag <= 60 && lag < w / 2; lag++) {
      let acc = 0;
      for (let i = 0; i + lag < w; i++) acc += dev[i]! * dev[i + lag]!;
      const r = acc / varSum;
      if (r > best) { best = r; bestLag = lag; }
    }
    if (best >= 0.5) { hits++; periods.push(bestLag * step); }
  }
  return { share: windows ? hits / windows : 0, period: median(periods) };
}
