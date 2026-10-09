import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { loadCard, summarizeSession, type Session, type VirtualFS } from '@opencpap/core';
import { philipsDs2Loader } from '@opencpap/loader-philips-ds2';
import { FileListFS } from './fileListFs';
import { DirectoryHandleFS, type DirEntry } from './directoryHandleFs';
import { ZipFS } from './zipFs';

// Integration test against a real card copied to fixtures/raw (git-ignored). Skipped when absent.
const root = fileURLToPath(new URL('../../../fixtures/raw', import.meta.url));
const has = existsSync(join(root, 'P-SERIES'));

function walk(dir: string, rel = ''): string[] {
  return readdirSync(join(dir, rel)).flatMap((n) => {
    const r = rel ? `${rel}/${n}` : n;
    return statSync(join(dir, r)).isDirectory() ? walk(dir, r) : [r];
  });
}

function diskDir(path: string, name: string): DirEntry {
  return {
    kind: 'directory', name,
    async *values() {
      for (const n of readdirSync(path)) {
        const p = join(path, n);
        if (statSync(p).isDirectory()) yield diskDir(p, n);
        else yield { kind: 'file' as const, name: n, getFile: async () => new File([readFileSync(p) as BlobPart], n) };
      }
    },
  };
}

async function fingerprint(fs: VirtualFS) {
  const sessions: Session[] = [];
  for await (const s of loadCard(fs, [philipsDs2Loader])) sessions.push(s);
  return sessions.map((s) => {
    const sum = summarizeSession(s);
    return [s.id, s.start, s.end, s.events.length, s.waveforms.reduce((a, w) => a + w.samples.length, 0), s.statistics.length, +sum.usageHours.toFixed(4)].join(':');
  });
}

describe.skipIf(!has)('real DS2 card through the browser adapters', () => {
  const files = has ? walk(root) : [];

  it('all adapters yield identical sessions', async () => {
    const asFile = (p: string) => {
      const f = new File([readFileSync(join(root, p)) as BlobPart], p.split('/').pop()!);
      Object.defineProperty(f, 'webkitRelativePath', { value: `NO NAME/${p}` });
      return f;
    };
    const t0 = performance.now();
    const fromFiles = await fingerprint(new FileListFS(files.map(asFile)));
    const t1 = performance.now();
    const fromDir = await fingerprint(new DirectoryHandleFS(diskDir(root, 'NO NAME')));
    const zip = zipSync(Object.fromEntries(files.map((p) => [p, readFileSync(join(root, p))])), { level: 0 });
    const t2 = performance.now();
    const fromZip = await fingerprint(new ZipFS(zip));
    const t3 = performance.now();
    console.log(`sessions=${fromFiles.length} FileListFS=${(t1 - t0).toFixed(0)}ms ZipFS=${(t3 - t2).toFixed(0)}ms zip=${(zip.length / 1e6).toFixed(1)}MB`);
    expect(fromFiles.length).toBeGreaterThan(500);
    expect(fromDir).toEqual(fromFiles);
    expect(fromZip).toEqual(fromFiles);
  }, 300000);
});
