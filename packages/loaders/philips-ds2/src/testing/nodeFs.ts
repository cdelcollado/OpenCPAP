import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { VirtualFS } from '@opencpap/core';

/** Test-only VirtualFS backed by a directory on disk (the "SD card root"). */
export class NodeFS implements VirtualFS {
  constructor(private root: string) {}
  async list(prefix = '') {
    const out: string[] = [];
    const walk = (rel: string) => {
      for (const name of readdirSync(join(this.root, rel))) {
        const r = rel ? `${rel}/${name}` : name;
        if (statSync(join(this.root, r)).isDirectory()) walk(r);
        else out.push(r);
      }
    };
    walk('');
    return out.filter((p) => p.startsWith(prefix)).sort();
  }
  async read(path: string) {
    return new Uint8Array(readFileSync(join(this.root, path)));
  }
  async exists(path: string) {
    return existsSync(join(this.root, path));
  }
}
