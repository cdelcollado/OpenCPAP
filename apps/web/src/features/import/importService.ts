import { generateDemoSessions } from '@opencpap/core';
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

export async function loadDemoData(): Promise<number> {
  const sessions = generateDemoSessions({ nights: 75, waveformNights: 3 });
  for (const s of sessions) await repository.saveSession(s);
  return sessions.length;
}

export const removeDemoData = () => repository.deleteDevice(DEMO_DEVICE_ID);

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
