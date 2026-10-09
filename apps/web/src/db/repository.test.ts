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
