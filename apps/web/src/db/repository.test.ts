import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDemoSessions } from '@opencpap/core';
import { OpenCpapDb } from './db';
import { Repository, deviceIdOf, sessionKey } from './repository';

let n = 0;
let repo: Repository;
beforeEach(() => { repo = new Repository(new OpenCpapDb(`test-${n++}`)); });

const demo = () => generateDemoSessions({ nights: 12, seed: 3, waveformNights: 2 });

describe('Repository', () => {
  it('stores sessions and returns nights', async () => {
    const sessions = demo();
    for (const s of sessions) await repo.saveSession(s);
    const nights = await repo.nights();
    expect(nights.length).toBe(sessions.length);
    expect(nights.slice(-2).every((x) => x.hasWaveforms)).toBe(true);
    expect(nights[0]!.hasWaveforms).toBe(false);
    expect(await repo.counts()).toEqual({ sessions: sessions.length, waveformSegments: 2 });
  });

  it('is idempotent: re-importing the same card does not duplicate', async () => {
    const sessions = demo();
    for (const s of sessions) await repo.saveSession(s);
    for (const s of sessions) await repo.saveSession(s);
    expect((await repo.counts()).sessions).toBe(sessions.length);
    expect((await repo.counts()).waveformSegments).toBe(2);
  });

  it('replaces a session and drops stale waveforms', async () => {
    const [s] = generateDemoSessions({ nights: 1, seed: 1, waveformNights: 1 });
    await repo.saveSession(s!);
    expect((await repo.counts()).waveformSegments).toBe(1);
    await repo.saveSession({ ...s!, waveforms: [] });
    expect((await repo.counts()).waveformSegments).toBe(0);
  });

  it('round-trips typed arrays of a night', async () => {
    const sessions = demo();
    for (const s of sessions) await repo.saveSession(s);
    const last = sessions.at(-1)!;
    const night = await repo.night((await repo.nights()).at(-1)!.date);
    expect(night.sessions.map((x) => x.id)).toContain(last.id);
    expect(night.waveforms[0]!.samples).toBeInstanceOf(Float32Array);
    expect(night.waveforms[0]!.samples.length).toBe(last.waveforms[0]!.samples.length);
    expect(night.sessions[0]!.statistics[0]!.values).toBeInstanceOf(Float32Array);
  });

  it('keeps sessions from different devices apart and deletes one device', async () => {
    const a = generateDemoSessions({ nights: 3, seed: 1, waveformNights: 1 });
    const b = generateDemoSessions({ nights: 3, seed: 1, waveformNights: 1 }).map((s) => ({ ...s, device: { ...s.device, serial: 'OTHER' } }));
    for (const s of [...a, ...b]) await repo.saveSession(s);
    expect((await repo.counts()).sessions).toBe(a.length + b.length);
    expect((await repo.devices()).map((d) => d.sessions)).toEqual([a.length, b.length]);
    await repo.deleteDevice(deviceIdOf(b[0]!));
    expect((await repo.counts()).sessions).toBe(a.length);
    expect((await repo.counts()).waveformSegments).toBe(1);
  });

  it('clears everything', async () => {
    for (const s of demo()) await repo.saveSession(s);
    await repo.clearAll();
    expect(await repo.counts()).toEqual({ sessions: 0, waveformSegments: 0 });
  });

  it('builds stable keys', () => {
    const [s] = demo();
    expect(sessionKey(s!)).toBe(`${deviceIdOf(s!)}/${s!.id}`);
  });
});

describe('journal and equipment', () => {
  it('stores, updates and removes a journal entry; an empty entry deletes it', async () => {
    await repo.saveJournal({ date: '2026-03-05', note: 'Noisy night', tags: [' cold ', 'cold', '', 'late meal'], mood: 2 });
    let rows = await repo.journal();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-03-05', note: 'Noisy night', tags: ['cold', 'late meal'], mood: 2 });
    await repo.saveJournal({ date: '2026-03-05', note: 'Edited', tags: [], mood: undefined });
    expect((await repo.journal())[0]!.note).toBe('Edited');
    await repo.saveJournal({ date: '2026-03-05', note: '   ', tags: [], mood: undefined });
    expect(await repo.journal()).toHaveLength(0);
  });
  it('caps note length and tag count', async () => {
    await repo.saveJournal({ date: '2026-03-05', note: 'x'.repeat(6000), tags: Array.from({ length: 30 }, (_, i) => `t${i}`) });
    const [row] = await repo.journal();
    expect(row!.note).toHaveLength(5000);
    expect(row!.tags).toHaveLength(20);
  });
  it('stores equipment ordered by start date and deletes it', async () => {
    await repo.saveEquipment({ id: 'b', kind: 'hose', name: 'Hose', startDate: '2026-02-01', intervalDays: 90 });
    await repo.saveEquipment({ id: 'a', kind: 'mask', name: 'Mask', startDate: '2026-01-01', intervalDays: 180 });
    expect((await repo.equipment()).map((e) => e.id)).toEqual(['a', 'b']);
    await repo.deleteEquipment('a');
    expect((await repo.equipment()).map((e) => e.id)).toEqual(['b']);
  });
  it('clearAll also removes the journal and equipment, deleteDevice does not', async () => {
    for (const s of demo()) await repo.saveSession(s);
    await repo.saveJournal({ date: '2026-03-05', note: 'keep me', tags: [] });
    await repo.saveEquipment({ id: 'a', kind: 'mask', name: 'Mask', startDate: '2026-01-01', intervalDays: 180 });
    await repo.deleteDevice('Demo:DEMO-0001');
    expect(await repo.journal()).toHaveLength(1);
    expect(await repo.equipment()).toHaveLength(1);
    await repo.clearAll();
    expect(await repo.journal()).toHaveLength(0);
    expect(await repo.equipment()).toHaveLength(0);
  });
});

describe('schema migration v1 → v2', () => {
  it('keeps existing therapy data when a version-1 database is opened by the current code', async () => {
    const name = `migrate-${n++}`;
    const { default: Dexie } = await import('dexie');
    const old = new Dexie(name);
    old.version(1).stores({ sessions: 'key, night, start, deviceId', waveforms: 'key, sessionKey' });
    await old.table('sessions').put({ key: 'Demo:X/1', deviceId: 'Demo:X', night: '2026-03-05', start: 1, session: { id: 1 } });
    old.close();
    const upgraded = new OpenCpapDb(name);
    expect(await upgraded.sessions.count()).toBe(1);
    await upgraded.journal.put({ date: '2026-03-05', note: 'n', tags: [], updatedAt: 1 });
    expect(await upgraded.journal.count()).toBe(1);
    upgraded.close();
  });
});

describe('breath analysis backfill', () => {
  it('computes the analysis of stored sessions that have flow but no analysis, once', async () => {
    const sessions = generateDemoSessions({ nights: 8, seed: 4, waveformNights: 4 }).map((s) => ({ ...s, analysis: undefined }));
    const withFlow = sessions.filter((s) => s.waveforms.length).length;
    expect(withFlow).toBeGreaterThanOrEqual(2);
    for (const s of sessions) await repo.saveSession(s);
    expect((await repo.listSessions()).every((r) => !r.session.analysis)).toBe(true);
    const updated = await repo.backfillAnalysis();
    expect(updated).toBe(withFlow); // only sessions with flow
    const rows = await repo.listSessions();
    expect(rows.filter((r) => r.session.analysis).length).toBe(withFlow);
    const a = rows.find((r) => r.session.analysis)!.session.analysis!;
    expect(a.breathing.breaths).toBeGreaterThan(1000);
    expect(a.breathing.rate).toBeGreaterThan(10);
    expect(a.windows.times.length).toBeGreaterThan(10);
    expect(await repo.backfillAnalysis()).toBe(0); // nothing left to do
    expect(await repo.backfillAnalysis({ force: true })).toBe(withFlow);
  });
});

describe('oximetry storage', () => {
  const T0 = Date.UTC(2026, 5, 29, 23, 0, 0);
  const rec = (seconds: number, start = T0) => ({
    times: Float64Array.from({ length: seconds }, (_, i) => start + i * 1000),
    spo2: Float32Array.from({ length: seconds }, (_, i) => (i > 300 && i < 330 ? 91 : 96)),
    pulse: Float32Array.from({ length: seconds }, () => 62),
  });

  it('stores a recording by night with its statistics and joins them to the night summaries', async () => {
    for (const s of generateDemoSessions({ nights: 4, seed: 12, waveformNights: 0 })) await repo.saveSession(s);
    const target = (await repo.nights()).at(-1)!;
    const start = Date.parse(`${target.date}T23:00:00Z`);
    const saved = await repo.saveOximetry(rec(3600, start), { source: 'test.csv', offsetMin: 0 });
    expect(saved.map((x) => x.date)).toEqual([target.date]);
    expect(saved[0]!.stats.odi3).toBeGreaterThan(0);
    const night = (await repo.nights()).find((n) => n.date === target.date)!;
    expect(night.oximetry?.spo2Min).toBe(91);
    const full = await repo.oximetry(target.date);
    expect(full!.samples.spo2).toBeInstanceOf(Float32Array);
    expect(full!.samples.times.length).toBe(3600);
    expect(full!.row.source).toBe('test.csv');
  });
  it('splits a recording across nights, ignores a handful of stray samples and replaces on re-import', async () => {
    const two = { times: Float64Array.of(...rec(3600, Date.UTC(2026, 5, 29, 23)).times, ...rec(30, Date.UTC(2026, 5, 30, 13)).times), spo2: new Float32Array(3630).fill(95), pulse: new Float32Array(3630).fill(60) };
    const saved = await repo.saveOximetry(two, { source: 'a.csv', offsetMin: 0 });
    expect(saved).toHaveLength(1); // the 30 samples at 13:00 form a second "night" that is too short to keep
    await repo.saveOximetry(rec(3600, Date.UTC(2026, 5, 29, 23)), { source: 'b.csv', offsetMin: 5 });
    expect((await repo.oximetry('2026-06-29'))!.row).toMatchObject({ source: 'b.csv', offsetMin: 5 });
  });
  it('deletes one night and clearAll removes everything', async () => {
    await repo.saveOximetry(rec(3600), { source: 'x', offsetMin: 0 });
    await repo.deleteOximetry('2026-06-29');
    expect(await repo.oximetry('2026-06-29')).toBeUndefined();
    await repo.saveOximetry(rec(3600), { source: 'x', offsetMin: 0 });
    await repo.clearAll();
    expect(await repo.oximetry('2026-06-29')).toBeUndefined();
  });
  it('opens a version-2 database with the version-3 code and keeps its data', async () => {
    const name = `migrate3-${n++}`;
    const { default: Dexie } = await import('dexie');
    const old = new Dexie(name);
    old.version(2).stores({ sessions: 'key, night, start, deviceId', waveforms: 'key, sessionKey', journal: 'date', equipment: 'id, kind, startDate' });
    await old.table('journal').put({ date: '2026-03-05', note: 'kept', tags: [], updatedAt: 1 });
    old.close();
    const upgraded = new OpenCpapDb(name);
    expect((await upgraded.journal.get('2026-03-05'))!.note).toBe('kept');
    await upgraded.oximetry.put({ date: '2026-03-05', source: 's', start: 0, end: 1, offsetMin: 0, stats: { seconds: 1, desaturations3: 0, desaturations4: 0 }, importedAt: 1 });
    expect(await upgraded.oximetry.count()).toBe(1);
    upgraded.close();
  });
});
