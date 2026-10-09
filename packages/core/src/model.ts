/** Manufacturer-independent canonical model. Timestamps are UTC epoch milliseconds. See docs/data-model.md. */

export type EventType =
  | 'obstructive' | 'central' | 'hypopnea' | 'unclassified-apnea'
  | 'rera' | 'flow-limitation' | 'snore' | 'periodic-breathing'
  | 'large-leak' | 'vibratory-snore' | 'variable-breathing';

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  serial: string;
  firmware?: string;
}

export interface TherapyEvent {
  type: EventType;
  start: number;
  /** duration in seconds (0 for instantaneous events) */
  duration: number;
  /**
   * Device-specific refinement of `type`. DS2: `alt-hypopnea` marks hypopneas stored under record
   * code 0x0b, which OSCAR counts but the device's own statistics do not.
   */
  detail?: string;
}

/** Signal sampled at a constant rate. */
export interface Waveform {
  channel: 'flow' | 'pressure' | 'leak' | 'tidal-volume' | 'resp-rate' | 'spo2' | 'pulse';
  unit: string;
  sampleRate: number; // Hz
  start: number;
  samples: Float32Array;
}

/** Irregularly sampled series (e.g. per-interval statistics reported by the device). */
export interface TimeSeries {
  channel: 'pressure-set' | 'epap-set' | 'ipap-set' | 'pressure-avg' | 'flex-pressure-avg' | 'leak-total' | 'snore-count';
  unit: string;
  /** UTC ms, ascending */
  times: Float64Array;
  values: Float32Array;
}

/** A contiguous period inside a session. */
export interface Slice {
  start: number;
  end: number;
  status: 'mask-on' | 'mask-off' | 'equipment-off';
}

export interface SessionSettings {
  mode?: string;
  [key: string]: string | number | boolean | undefined;
}

/** Experimental waveform-derived analysis attached to a session (see analysis.ts). Not provided by loaders. */
export type { SessionAnalysis } from './analysis';
import type { SessionAnalysis } from './analysis';

export interface Session {
  device: DeviceInfo;
  /** device-provided session id (unique per device) */
  id: number;
  start: number;
  end: number;
  /**
   * Meaning of the timestamps. `device-local`: the device stores wall-clock time with no zone
   * information, so values are wall-clock seconds encoded as if they were UTC (OSCAR does the same).
   */
  clock: 'utc' | 'device-local';
  /** mask-on / mask-off periods; therapy usage is the total of `mask-on` slices */
  slices: Slice[];
  settings: SessionSettings;
  events: TherapyEvent[];
  waveforms: Waveform[];
  statistics: TimeSeries[];
  /** breath analysis computed from the flow waveform when the session was imported */
  analysis?: SessionAnalysis;
  /** number of device records that could not be interpreted (diagnostics) */
  unknownRecords?: number;
  /** statistics already summarized by the device, if any (used for cross-checking) */
  deviceSummary?: Record<string, number>;
}
