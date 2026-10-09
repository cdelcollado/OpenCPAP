import Dexie, { type EntityTable } from 'dexie';
import type { EquipmentItem, OximetryStats, SessionLite, Waveform } from '@opencpap/core';

/** One imported session without its waveforms. `key` makes re-importing the same card idempotent. */
export interface SessionRow {
  key: string; // `${deviceId}/${session id}`
  deviceId: string;
  night: string; // YYYY-MM-DD, see nightOf()
  start: number;
  session: SessionLite;
}

/** One contiguous waveform segment. Kept apart because it is large and only needed on the night view. */
export interface WaveformRow {
  key: string; // `${sessionKey}#${index}`
  sessionKey: string;
  waveform: Waveform;
}

/** The user's note for one night. Empty entries are deleted rather than stored. */
export interface JournalRow {
  date: string; // YYYY-MM-DD, the night (see nightOf)
  note: string;
  tags: string[];
  /** how rested the user felt, 1 (poor) to 5 (great) */
  mood?: 1 | 2 | 3 | 4 | 5;
  updatedAt: number;
}

export interface EquipmentRow extends EquipmentItem { updatedAt: number }

/** Light metadata of a pulse-oximeter recording of one night (the samples live in `oximetrySamples`). */
export interface OximetryRow {
  date: string; // the night
  source: string;
  start: number;
  end: number;
  /** minutes added to the oximeter's clock at import to line it up with the CPAP */
  offsetMin: number;
  stats: OximetryStats;
  importedAt: number;
}

export interface OximetrySamplesRow { date: string; times: Float64Array; spo2: Float32Array; pulse: Float32Array }

export class OpenCpapDb extends Dexie {
  sessions!: EntityTable<SessionRow, 'key'>;
  waveforms!: EntityTable<WaveformRow, 'key'>;
  journal!: EntityTable<JournalRow, 'date'>;
  equipment!: EntityTable<EquipmentRow, 'id'>;
  oximetry!: EntityTable<OximetryRow, 'date'>;
  oximetrySamples!: EntityTable<OximetrySamplesRow, 'date'>;

  constructor(name = 'opencpap') {
    super(name);
    // Indexes: only fields we query by. Older versions stay declared so existing users upgrade in place.
    this.version(1).stores({
      sessions: 'key, night, start, deviceId',
      waveforms: 'key, sessionKey',
    });
    // v2 (Phase 3): per-night journal and equipment tracking. Purely additive, no data migration needed.
    this.version(2).stores({
      sessions: 'key, night, start, deviceId',
      waveforms: 'key, sessionKey',
      journal: 'date',
      equipment: 'id, kind, startDate',
    });
    // v3 (Phase 4): pulse-oximeter recordings, split into a light table (stats) and a heavy one (samples)
    this.version(3).stores({
      sessions: 'key, night, start, deviceId',
      waveforms: 'key, sessionKey',
      journal: 'date',
      equipment: 'id, kind, startDate',
      oximetry: 'date',
      oximetrySamples: 'date',
    });
  }
}

export const db = new OpenCpapDb();
