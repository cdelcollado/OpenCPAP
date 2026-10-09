/** Model canònic independent del fabricant. Temps en ms UTC des d'epoch. */

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
  /** durada en segons (0 si puntual) */
  duration: number;
}

/** Senyal mostrejada a freqüència constant. */
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
  /** estadístiques que el dispositiu ja ha resumit, si n'hi ha */
  deviceSummary?: Record<string, number>;
}
