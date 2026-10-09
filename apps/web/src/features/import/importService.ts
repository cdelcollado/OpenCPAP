import { addDays, generateDemoSessions, nightOf } from '@opencpap/core';
import { createImportWorker, importCard, type CardSource } from '@opencpap/browser';
import { DEMO_DEVICE_ID, repository } from '../../db/repository';

export interface ImportCallbacks {
  onDetected?: (d: { manufacturer: string; model: string }) => void;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Decodes a card in the worker and stores each session as soon as it arrives. Returns the number of sessions stored. */
export async function importCardToDb(source: CardSource, cb: ImportCallbacks = {}): Promise<number> {
  let count = 0;
  for await (const session of importCard(createImportWorker(), source, cb)) {
    await repository.saveSession(session);
    count++;
  }
  return count;
}

export const DEMO_TAG = 'demo';

/** Synthetic sessions plus a demo mask/cushion/filter and a few notes, so every feature has something to show. */
export async function loadDemoData(): Promise<number> {
  const sessions = generateDemoSessions({ nights: 75, waveformNights: 3 });
  for (const s of sessions) await repository.saveSession(s);
  const asOf = nightOf(sessions.at(-1)!.start);
  // the demo story replaces the cushion about 45 % of the way through the data (see generateDemoSessions)
  const cushionStart = nightOf((sessions.find((x) => x.id > Math.floor(75 * 0.45)) ?? sessions[0]!).start);
  await repository.saveEquipment({ id: 'demo-mask', kind: 'mask', name: 'Demo nasal mask', startDate: addDays(asOf, -150), intervalDays: 180 });
  await repository.saveEquipment({ id: 'demo-cushion', kind: 'cushion', name: 'Demo cushion', startDate: cushionStart, intervalDays: 45 });
  await repository.saveEquipment({ id: 'demo-filter-old', kind: 'filter', name: 'Demo filter (replaced)', startDate: addDays(asOf, -75), endDate: addDays(asOf, -46), intervalDays: 30 });
  await repository.saveEquipment({ id: 'demo-filter', kind: 'filter', name: 'Demo filter', startDate: addDays(asOf, -45), intervalDays: 30 });
  await repository.saveJournal({ date: addDays(asOf, -2), note: 'Slept on my back for part of the night.', tags: [DEMO_TAG, 'back sleeping'], mood: 3 });
  await repository.saveJournal({ date: addDays(asOf, -9), note: 'Cold with a blocked nose.', tags: [DEMO_TAG, 'cold'], mood: 2 });
  await repository.saveJournal({ date: addDays(asOf, -20), note: 'Felt rested all day.', tags: [DEMO_TAG], mood: 5 });
  return sessions.length;
}

/** Removes the demo device together with the demo equipment and notes (identified by id prefix and tag). */
export async function removeDemoData(): Promise<void> {
  await repository.deleteDevice(DEMO_DEVICE_ID);
  for (const e of await repository.equipment()) if (e.id.startsWith('demo-')) await repository.deleteEquipment(e.id);
  for (const j of await repository.journal()) if (j.tags.includes(DEMO_TAG)) await repository.deleteJournal(j.date);
}

/* ---- folder drag & drop ---- */

const readAll = (dir: FileSystemDirectoryEntry) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => {
    const reader = dir.createReader();
    const out: FileSystemEntry[] = [];
    // readEntries returns results in chunks until it returns an empty batch
    const next = () => reader.readEntries((batch) => (batch.length ? (out.push(...batch), next()) : resolve(out)), reject);
    next();
  });

/** Collects files (with card-relative paths) from a drop event, walking dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<Extract<CardSource, { kind: 'files' | 'zip' }> | null> {
  const zip = [...dt.files].find((f) => /\.zip$/i.test(f.name));
  if (zip) return { kind: 'zip', file: zip };
  const files: File[] = [];
  const paths: string[] = [];
  const walk = async (e: FileSystemEntry) => {
    if (e.isFile) {
      files.push(await new Promise<File>((ok, err) => (e as FileSystemFileEntry).file(ok, err)));
      paths.push(e.fullPath.replace(/^\//, ''));
    } else if (e.isDirectory) {
      for (const child of await readAll(e as FileSystemDirectoryEntry)) await walk(child);
    }
  };
  // webkitGetAsEntry must be called synchronously during the drop event
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => e !== null);
  for (const e of entries) await walk(e);
  return files.length ? { kind: 'files', files, paths } : null;
}

declare global {
  interface Window { showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<unknown> }
}
