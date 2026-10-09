/** Manufacturer-independent canonical model. Timestamps are UTC epoch milliseconds. See docs/data-model.md. */

export type EventType =
  | 'obstructive' | 'central' | 'hypopnea' | 'unclassified-apnea'
  | 'rera' | 'flow-limitation' | 'snore' | 'periodic-breathing'
  | 'large-leak' | 'vibratory-snore';

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
}

/** Signal sampled at a constant rate. */
export interface Waveform {
  channel: 'flow' | 'pressure' | 'leak' | 'tidal-volume' | 'resp-rate' | 'spo2' | 'pulse';
  unit: string;
  sampleRate: number; // Hz
  start: number;
  samples: Float32Array;
}

export interface SessionSettings {
  mode?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface Session {
  device: DeviceInfo;
  start: number;
  end: number;
  settings: SessionSettings;
  events: TherapyEvent[];
  waveforms: Waveform[];
  /** statistics already summarized by the device, if any (used for cross-checking) */
  deviceSummary?: Record<string, number>;
}
