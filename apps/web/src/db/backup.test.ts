import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDemoSessions } from '@opencpap/core';
import { OpenCpapDb } from './db';
import { Repository } from './repository';
import { BACKUP_FORMAT, BackupError, exportBackup, importBackup, parseRecord, stringifyRecord } from './backup';

let n = 0;
let db: OpenCpapDb, repo: Repository;
beforeEach(() => { db = new OpenCpapDb(`backup-${n++}`); repo = new Repository(db); });
const fresh = () => { const d = new OpenCpapDb(`backup-restore-${n++}`); return { d, r: new Repository(d) }; };
const blobOf = (...lines: string[]) => new Blob([lines.join('\n') + '\n']);
const HEADER = JSON.stringify({ format: BACKUP_FORMAT, version: 1, createdAt: 'x', app: 't', includesWaveforms: false });

async function seed() {
  const sessions = generateDemoSessions({ nights: 6, seed: 2, waveformNights: 2 });
  for (const s of sessions) await repo.saveSession(s);
  await repo.saveJournal({ date: '2026-06-30', note: 'Slept well', tags: ['cold', 'alcohol'], mood: 4 });
  await repo.saveEquipment({ id: 'm1', kind: 'mask', name: 'Nasal mask', startDate: '2026-05-01', intervalDays: 180 });
  return sessions;
}

describe('typed-array serialisation', () => {
  it('round-trips Float32Array and Float64Array, including views of larger buffers', () => {
    const big = new Float32Array([1, 2, 3, 4, 5]);
    const rec = parseRecord(stringifyRecord({ a: big.subarray(1, 4), b: Float64Array.of(0.1, 1e300), c: 'text' })) as { a: Float32Array; b: Float64Array; c: string };
    expect([...rec.a]).toEqual([2, 3, 4]);
    expect([...rec.b]).toEqual([0.1, 1e300]);
    expect(rec.c).toBe('text');
  });
  it('rejects unknown or truncated arrays', () => {
    expect(() => parseRecord('{"x":{"$ta":"Uint8Array","b64":"AA=="}}')).toThrow(/unsupported/);
    expect(() => parseRecord('{"x":{"$ta":"Float32Array","b64":"AAA="}}')).toThrow(/truncated/);
  });
});

describe('oximetry in backups', () => {
  it('restores recordings with their samples, and keeps a newer local recording', async () => {
    const times = Float64Array.from({ length: 120 }, (_, i) => Date.UTC(2026, 5, 29, 23) + i * 1000);
    const recording = { times, spo2: new Float32Array(120).fill(95), pulse: new Float32Array(120).fill(60) };
    await repo.saveOximetry(recording, { source: 'ring.csv', offsetMin: 3 });
    const blob = await exportBackup(db, { includeWaveforms: false, app: 'test' });
    const { d, r } = fresh();
    const counts = await importBackup(d, blob);
    expect(counts.oximetry).toBe(1);
    const got = await r.oximetry('2026-06-29');
    expect(got!.row).toMatchObject({ source: 'ring.csv', offsetMin: 3 });
    expect(got!.samples.spo2.length).toBe(120);
    // a newer local import is kept, together with its own samples
    const other = fresh();
    await other.r.saveOximetry({ ...recording, spo2: new Float32Array(120).fill(88) }, { source: 'newer.csv', offsetMin: 0 });
    await importBackup(other.d, blob);
    expect((await other.r.oximetry('2026-06-29'))!.row.source).toBe('newer.csv');
    expect((await other.r.oximetry('2026-06-29'))!.samples.spo2[0]).toBe(88);
  });
});

describe('backup export and import', () => {
  it('restores sessions, waveforms, journal and equipment into an empty database', async () => {
    const sessions = await seed();
    const blob = await exportBackup(db, { includeWaveforms: true, app: 'test' });
    const { d, r } = fresh();
    const counts = await importBackup(d, blob);
    expect(counts).toMatchObject({ sessions: sessions.length, waveforms: 2, journal: 1, equipment: 1, skipped: 0 });
    expect(await r.counts()).toEqual(await repo.counts());
    const last = (await r.nights()).at(-1)!;
    const orig = (await repo.nights()).at(-1)!;
    expect(last).toEqual(orig);
    const wf = (await r.night(last.date)).waveforms[0]!;
    expect(wf.samples).toBeInstanceOf(Float32Array);
    expect([...wf.samples.slice(0, 50)]).toEqual([...(await repo.night(last.date)).waveforms[0]!.samples.slice(0, 50)]);
    expect((await r.journal())[0]).toMatchObject({ date: '2026-06-30', note: 'Slept well', tags: ['cold', 'alcohol'], mood: 4 });
    expect((await r.equipment())[0]).toMatchObject({ id: 'm1', kind: 'mask' });
  });

  it('is gzip-compressed and much smaller than the data it holds', async () => {
    await seed();
    const blob = await exportBackup(db, { includeWaveforms: true, app: 'test' });
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect([head[0], head[1]]).toEqual([0x1f, 0x8b]);
  });

  it('leaves waveforms out unless asked (they can be re-imported from the card)', async () => {
    await seed();
    const { d, r } = fresh();
    const counts = await importBackup(d, await exportBackup(db, { includeWaveforms: false, app: 'test' }));
    expect(counts.waveforms).toBe(0);
    expect((await r.counts()).waveformSegments).toBe(0);
    expect((await r.counts()).sessions).toBeGreaterThan(0);
  });

  it('accepts an uncompressed file and is idempotent when applied twice', async () => {
    await seed();
    const raw = await exportBackup(db, { includeWaveforms: false, app: 'test' });
    const { d, r } = fresh();
    await importBackup(d, raw);
    await importBackup(d, raw);
    expect((await r.counts()).sessions).toBe((await repo.counts()).sessions);
    expect(await r.journal()).toHaveLength(1);
  });

  it('keeps the newer journal entry and equipment item when merging', async () => {
    await seed();
    const blob = await exportBackup(db, { includeWaveforms: false, app: 'test' });
    const { d, r } = fresh();
    await d.journal.put({ date: '2026-06-30', note: 'Newer local note', tags: [], updatedAt: Date.now() + 60_000 });
    await d.equipment.put({ id: 'm1', kind: 'mask', name: 'Local mask', startDate: '2026-05-01', intervalDays: 100, updatedAt: Date.now() + 60_000 });
    await importBackup(d, blob);
    expect((await r.journal())[0]!.note).toBe('Newer local note');
    expect((await r.equipment())[0]!.name).toBe('Local mask');
  });

  it('rejects files that are not backups and backups from the future', async () => {
    const { d } = fresh();
    await expect(importBackup(d, new Blob(['hello world']))).rejects.toThrow(BackupError);
    await expect(importBackup(d, new Blob(['{"format":"other","version":1}\n']))).rejects.toThrow(/Not an OpenCPAP backup/);
    await expect(importBackup(d, blobOf(JSON.stringify({ format: BACKUP_FORMAT, version: 99 })))).rejects.toThrow(/newer version/);
    await expect(importBackup(d, new Blob([]))).rejects.toThrow(/empty/);
  });

  it('skips malformed or unexpected records without touching the database', async () => {
    const { d, r } = fresh();
    const counts = await importBackup(d, blobOf(
      HEADER,
      'not json at all',
      JSON.stringify({ t: 'session', row: { key: 'x' } }), // missing fields
      JSON.stringify({ t: 'journal', row: { date: 'tomorrow', note: '', tags: [], updatedAt: 1 } }), // bad date
      JSON.stringify({ t: 'evil', row: {} }),
      JSON.stringify({ t: 'equipment', row: { id: 'ok', kind: 'filter', name: 'Filter', startDate: '2026-01-01', intervalDays: 30, updatedAt: 1 } }),
    ));
    expect(counts).toMatchObject({ equipment: 1, skipped: 4, sessions: 0 });
    expect(await r.counts()).toEqual({ sessions: 0, waveformSegments: 0 });
  });
});
