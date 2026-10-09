import type { VirtualFS } from '@opencpap/core';
import { rerootPaths } from './paths';

/** Maximum size of a single file we are willing to read into memory. Real files are < 1 MB. */
export const MAX_FILE_BYTES = 256 * 1024 * 1024;

/**
 * VirtualFS over `File` objects, as produced by `<input type="file" webkitdirectory>`
 * (paths from `webkitRelativePath`) or by drag and drop. Works in every modern browser.
 */
export class FileListFS implements VirtualFS {
  private files: Map<string, File>;

  constructor(files: Iterable<File>, relativePath: (f: File) => string = (f) => f.webkitRelativePath || f.name) {
    const entries: [string, string][] = [];
    const byRef = new Map<string, File>();
    let n = 0;
    for (const f of files) {
      const ref = String(n++);
      byRef.set(ref, f);
      entries.push([relativePath(f), ref]);
    }
    this.files = new Map([...rerootPaths(entries)].map(([p, ref]) => [p, byRef.get(ref)!]));
  }

  async list(prefix = '') {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  async exists(path: string) {
    return this.files.has(path);
  }
  async read(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`File not found: ${path}`);
    if (f.size > MAX_FILE_BYTES) throw new Error(`File too large: ${path}`);
    return new Uint8Array(await f.arrayBuffer());
  }
}
