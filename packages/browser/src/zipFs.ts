import { unzipSync } from 'fflate';
import type { VirtualFS } from '@opencpap/core';
import { rerootPaths } from './paths';
import { MAX_FILE_BYTES } from './fileListFs';

/**
 * VirtualFS over a ZIP archive of the card (or of its P-SERIES folder). Entries are decompressed on demand,
 * one at a time, so a large archive never has to fit in memory. Entries larger than MAX_FILE_BYTES
 * (decompressed) are refused to defuse zip bombs.
 */
export class ZipFS implements VirtualFS {
  private index: Map<string, string>; // normalized path -> raw entry name

  constructor(private zip: Uint8Array) {
    const names: [string, string][] = [];
    // The filter sees every entry's metadata; returning false means nothing is decompressed here.
    unzipSync(zip, { filter: (f) => { if (!f.name.endsWith('/')) names.push([f.name, f.name]); return false; } });
    this.index = rerootPaths(names);
  }

  async list(prefix = '') {
    return [...this.index.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  async exists(path: string) {
    return this.index.has(path);
  }
  async read(path: string) {
    const raw = this.index.get(path);
    if (raw === undefined) throw new Error(`File not found: ${path}`);
    let tooBig = false;
    const out = unzipSync(this.zip, {
      filter: (f) => {
        if (f.name !== raw) return false;
        if (f.originalSize > MAX_FILE_BYTES) { tooBig = true; return false; }
        return true;
      },
    });
    if (tooBig) throw new Error(`File too large: ${path}`);
    const data = out[raw];
    if (!data) throw new Error(`File not found: ${path}`);
    return data;
  }
}
