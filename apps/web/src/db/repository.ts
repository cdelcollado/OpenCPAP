import { ANALYSIS_VERSION, analyzeSession, groupNights, nightOf, oximetryStats, splitByNight, type NightSummary, type OximetryRecording, type OximetryStats, type Session, type SessionLite, type Waveform } from '@opencpap/core';
import { db as defaultDb, type EquipmentRow, type JournalRow, type OpenCpapDb, type OximetryRow, type OximetrySamplesRow, type SessionRow } from './db';

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
    const oxi = new Map((await this.db.oximetry.toArray()).map((o) => [o.date, o.stats]));
    return groupNights(rows.map((r) => r.session), ids, oxi);
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

  /**
   * Computes (or recomputes) the breath analysis of stored sessions that have flow data: those without an analysis,
   * with an older algorithm version, or all of them when `force` is set. Returns how many sessions were updated.
   */
  async backfillAnalysis(opts: { force?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<number> {
    const withFlow = await this.sessionKeysWithWaveforms();
    const todo = (await this.db.sessions.toArray()).filter((r) => withFlow.has(r.key) && (opts.force || !r.session.analysis || r.session.analysis.version < ANALYSIS_VERSION));
    let done = 0;
    for (const row of todo) {
      const wf = (await this.db.waveforms.where('sessionKey').equals(row.key).toArray()).map((w) => w.waveform);
      const analysis = analyzeSession(wf);
      await this.db.sessions.update(row.key, { session: { ...row.session, analysis } });
      done++; // not inside the optional call: its arguments are skipped when there is no callback
      opts.onProgress?.(done, todo.length);
    }
    return done;
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

  /** Deletes everything stored in this browser: therapy data, journal and equipment. */
  async clearAll(): Promise<void> {
    await this.db.transaction('rw', [this.db.sessions, this.db.waveforms, this.db.journal, this.db.equipment, this.db.oximetry, this.db.oximetrySamples], async () => {
      await this.db.sessions.clear();
      await this.db.waveforms.clear();
      await this.db.journal.clear();
      await this.db.equipment.clear();
      await this.db.oximetry.clear();
      await this.db.oximetrySamples.clear();
    });
  }

  /* ---- journal ---- */

  async journal(): Promise<JournalRow[]> {
    return this.db.journal.orderBy('date').toArray();
  }

  /** Saves a night's entry; an entry with no note, tags or mood is removed instead. Tags are trimmed, de-duplicated and capped. */
  async saveJournal(entry: Omit<JournalRow, 'updatedAt'>): Promise<void> {
    const tags = [...new Set(entry.tags.map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 40)))].slice(0, 20);
    const note = entry.note.slice(0, 5000);
    if (!note.trim() && tags.length === 0 && entry.mood === undefined) {
      await this.db.journal.delete(entry.date);
      return;
    }
    await this.db.journal.put({ ...entry, note, tags, updatedAt: Date.now() });
  }

  async deleteJournal(date: string): Promise<void> {
    await this.db.journal.delete(date);
  }

  /* ---- oximetry ---- */

  /**
   * Stores a recording, split into nights. A night that already has oximetry is replaced. Returns the nights written
   * with their statistics.
   */
  async saveOximetry(recording: OximetryRecording, meta: { source: string; offsetMin: number }): Promise<{ date: string; stats: OximetryStats }[]> {
    const out: { date: string; stats: OximetryStats }[] = [];
    for (const [date, part] of splitByNight(recording)) {
      if (part.times.length < 60) continue; // a few stray samples after waking are not a night
      const stats = oximetryStats(part);
      await this.db.transaction('rw', this.db.oximetry, this.db.oximetrySamples, async () => {
        await this.db.oximetry.put({ date, source: meta.source, start: part.times[0]!, end: part.times.at(-1)!, offsetMin: meta.offsetMin, stats, importedAt: Date.now() });
        await this.db.oximetrySamples.put({ date, times: part.times, spo2: part.spo2, pulse: part.pulse });
      });
      out.push({ date, stats });
    }
    return out;
  }

  async oximetry(date: string): Promise<{ row: OximetryRow; samples: OximetrySamplesRow } | undefined> {
    const [row, samples] = await Promise.all([this.db.oximetry.get(date), this.db.oximetrySamples.get(date)]);
    return row && samples ? { row, samples } : undefined;
  }

  async deleteOximetry(date: string): Promise<void> {
    await this.db.transaction('rw', this.db.oximetry, this.db.oximetrySamples, async () => { await this.db.oximetry.delete(date); await this.db.oximetrySamples.delete(date); });
  }

  /* ---- equipment ---- */

  async equipment(): Promise<EquipmentRow[]> {
    return this.db.equipment.orderBy('startDate').toArray();
  }

  async saveEquipment(item: Omit<EquipmentRow, 'updatedAt'>): Promise<void> {
    await this.db.equipment.put({ ...item, name: item.name.slice(0, 80), updatedAt: Date.now() });
  }

  async deleteEquipment(id: string): Promise<void> {
    await this.db.equipment.delete(id);
  }
}

export const repository = new Repository();
