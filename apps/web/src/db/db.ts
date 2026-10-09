import Dexie, { type EntityTable } from 'dexie';
import type { SessionLite, Waveform } from '@opencpap/core';

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

export class OpenCpapDb extends Dexie {
  sessions!: EntityTable<SessionRow, 'key'>;
  waveforms!: EntityTable<WaveformRow, 'key'>;

  constructor(name = 'opencpap') {
    super(name);
    // Schema version 1. Indexes: only fields we query by. Bump the version and add .upgrade() for changes.
    this.version(1).stores({
      sessions: 'key, night, start, deviceId',
      waveforms: 'key, sessionKey',
    });
  }
}

export const db = new OpenCpapDb();
