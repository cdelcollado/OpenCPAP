import { breathWindows, detectBreaths, periodicity, summarizeBreaths, type BreathSummary } from './breath';
import type { Waveform } from './model';

/** Version of the analysis algorithm; bump it when results change so stored analyses can be recomputed. */
export const ANALYSIS_VERSION = 1;

export interface BreathingAnalysis extends BreathSummary {
  /** share of 6-minute windows with a waxing-and-waning pattern, 0..1 */
  periodicityShare: number;
  /** typical period of that pattern, seconds */
  periodicityPeriod?: number;
  /** seconds of flow that were analysed */
  seconds: number;
}

/** Per-window series along the session (window ≈ 5 min), ready to plot; times are epoch milliseconds (device clock). */
export interface WindowSeries {
  times: Float64Array;
  flatShare: Float32Array;
  rate: Float32Array;
  volumeCv: Float32Array;
}

export interface SessionAnalysis { version: number; breathing: BreathingAnalysis; windows: WindowSeries }

const MIN_SEGMENT_SECONDS = 120;

/**
 * Experimental breath analysis of the flow waveform of one session (see `breath.ts`). Returns undefined when there is
 * not enough flow. Each contiguous segment is analysed on its own so gaps never create fake breaths.
 */
export function analyzeSession(waveforms: Waveform[]): SessionAnalysis | undefined {
  const segments = waveforms.filter((w) => w.channel === 'flow' && w.samples.length / w.sampleRate >= MIN_SEGMENT_SECONDS);
  if (segments.length === 0) return undefined;
  const all = [] as ReturnType<typeof detectBreaths>;
  const times: number[] = [], flat: number[] = [], rate: number[] = [], vcv: number[] = [];
  let seconds = 0, perWeight = 0, perShare = 0;
  const periods: number[] = [];
  for (const w of segments) {
    const b = detectBreaths(w.samples, w.sampleRate);
    const dur = w.samples.length / w.sampleRate;
    seconds += dur;
    all.push(...b);
    for (const win of breathWindows(b)) {
      times.push(w.start + win.t * 1000);
      flat.push(win.flatShare ?? NaN); rate.push(win.rate ?? NaN); vcv.push(win.volumeCv ?? NaN);
    }
    const p = periodicity(b);
    perWeight += dur; perShare += p.share * dur;
    if (p.period !== undefined) periods.push(p.period);
  }
  if (all.length === 0) return undefined;
  const s = summarizeBreaths(all);
  periods.sort((a, b) => a - b);
  return {
    version: ANALYSIS_VERSION,
    breathing: { ...s, periodicityShare: perWeight ? perShare / perWeight : 0, periodicityPeriod: periods[Math.floor(periods.length / 2)], seconds },
    windows: { times: Float64Array.from(times), flatShare: Float32Array.from(flat), rate: Float32Array.from(rate), volumeCv: Float32Array.from(vcv) },
  };
}
