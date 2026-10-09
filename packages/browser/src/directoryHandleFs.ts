import type { VirtualFS } from '@opencpap/core';
import { isMarker } from './paths';
import { MAX_FILE_BYTES } from './fileListFs';

/** The subset of the File System Access API that we use (also easy to fake in tests). */
export interface FileEntry { kind: 'file'; name: string; getFile(): Promise<File> }
export interface DirEntry { kind: 'directory'; name: string; values(): AsyncIterable<FileEntry | DirEntry> }

/** Deepest level searched for a marker folder below the chosen directory. */
const MAX_MARKER_DEPTH = 2;

/**
 * VirtualFS over a `FileSystemDirectoryHandle` obtained from `showDirectoryPicker()` (Chromium).
 * Only marker folders (P-SERIES, …) are walked, so a card full of unrelated files lists quickly.
 * Paths are re-rooted so that the marker folder is the first segment.
 */
export class DirectoryHandleFS implements VirtualFS {
  private files = new Map<string, FileEntry>();
  private scanned: Promise<void> | undefined;

  constructor(private root: DirEntry) {}

  private scan(): Promise<void> {
    this.scanned ??= (async () => {
      const walk = async (dir: DirEntry, prefix: string) => {
        for await (const e of dir.values()) {
          const p = `${prefix}${e.name}`;
          if (e.kind === 'directory') await walk(e, `${p}/`);
          else this.files.set(p, e);
        }
      };
      const findMarkers = async (dir: DirEntry, depth: number): Promise<boolean> => {
        let found = false;
        const subdirs: DirEntry[] = [];
        for await (const e of dir.values()) {
          if (e.kind !== 'directory') continue;
          if (isMarker(e.name)) { await walk(e, `${e.name}/`); found = true; }
          else subdirs.push(e);
        }
        if (found || depth >= MAX_MARKER_DEPTH) return found;
        for (const d of subdirs) if (await findMarkers(d, depth + 1)) found = true;
        return found;
      };
      if (isMarker(this.root.name)) await walk(this.root, `${this.root.name}/`);
      else await findMarkers(this.root, 1);
    })();
    return this.scanned;
  }

  async list(prefix = '') {
    await this.scan();
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  async exists(path: string) {
    await this.scan();
    return this.files.has(path);
  }
  async read(path: string) {
    await this.scan();
    const e = this.files.get(path);
    if (!e) throw new Error(`File not found: ${path}`);
    const f = await e.getFile();
    if (f.size > MAX_FILE_BYTES) throw new Error(`File too large: ${path}`);
    return new Uint8Array(await f.arrayBuffer());
  }
}
