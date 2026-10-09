import { groupNights, nightOf, type NightSummary, type Session, type SessionLite, type Waveform } from '@opencpap/core';
import { db as defaultDb, type OpenCpapDb, type SessionRow } from './db';

export const deviceIdOf = (s: Pick<Session, 'device'>) => `${s.device.manufacturer}:${s.device.serial}`;
export const sessionKey = (s: Pick<Session, 'device' | 'id'>) => `${deviceIdOf(s)}/${s.id}`;
export const DEMO_DEVICE_ID = 'Demo:DEMO-0001';

/** Data-access layer. All persistence goes through here so the schema can change in one place. */
export class Repository {
  constructor(private db: OpenCpapDb = defaultDb) {}

  /** Stores (or replaces) a session and its waveforms. Safe to call again for the same card. */
  async saveSession(s: Session): Promise<void> {
    const key = sessionKey(s);
    const { waveforms, ...lite } = s;
    await this.db.transaction('rw', this.db.sessions, this.db.waveforms, async () => {
      await this.db.waveforms.where('sessionKey').equals(key).delete();
      await this.db.sessions.put({ key, deviceId: deviceIdOf(s), night: nightOf(s.start), start: s.start, session: lite });
      if (waveforms.length) {
        await this.db.waveforms.bulkPut(waveforms.map((waveform, i) => ({ key: `${key}#${i}`, sessionKey: key, waveform })));
      }
    });
  }

  async listSessions(): Promise<SessionRow[]> {
    return this.db.sessions.orderBy('start').toArray();
  }

  async sessionKeysWithWaveforms(): Promise<Set<string>> {
    return new Set(await this.db.waveforms.orderBy('sessionKey').uniqueKeys() as string[]);
  }

  /** Night summaries for everything stored, ascending. */
  async nights(): Promise<NightSummary[]> {
    const rows = await this.listSessions();
    const withWf = await this.sessionKeysWithWaveforms();
    const ids = new Set(rows.filter((r) => withWf.has(r.key)).map((r) => r.session.id));
    return groupNights(rows.map((r) => r.session), ids);
  }

  /** Sessions of a night, with their waveforms. */
  async night(date: string): Promise<{ sessions: SessionLite[]; waveforms: Waveform[]; keys: string[] }> {
    const rows = await this.db.sessions.where('night').equals(date).sortBy('start');
    const keys = rows.map((r) => r.key);
    const wf = keys.length ? await this.db.waveforms.where('sessionKey').anyOf(keys).toArray() : [];
    return {
      sessions: rows.map((r) => r.session),
      waveforms: wf.map((w) => w.waveform).sort((a, b) => a.start - b.start),
      keys,
    };
  }

  async counts() {
    return { sessions: await this.db.sessions.count(), waveformSegments: await this.db.waveforms.count() };
  }

  async devices(): Promise<{ deviceId: string; manufacturer: string; model: string; sessions: number }[]> {
    const by = new Map<string, { deviceId: string; manufacturer: string; model: string; sessions: number }>();
    await this.db.sessions.each((r) => {
      const e = by.get(r.deviceId) ?? { deviceId: r.deviceId, manufacturer: r.session.device.manufacturer, model: r.session.device.model, sessions: 0 };
      e.sessions++;
      by.set(r.deviceId, e);
    });
    return [...by.values()];
  }

  async deleteDevice(deviceId: string): Promise<void> {
    await this.db.transaction('rw', this.db.sessions, this.db.waveforms, async () => {
      const keys = await this.db.sessions.where('deviceId').equals(deviceId).primaryKeys();
      await this.db.waveforms.where('sessionKey').anyOf(keys).delete();
      await this.db.sessions.bulkDelete(keys);
    });
  }

  async clearAll(): Promise<void> {
    await this.db.transaction('rw', this.db.sessions, this.db.waveforms, async () => {
      await this.db.sessions.clear();
      await this.db.waveforms.clear();
    });
  }
}

export const repository = new Repository();
