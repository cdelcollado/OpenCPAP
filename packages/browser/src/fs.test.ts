import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { loadCard, type Session, type VirtualFS } from '@opencpap/core';
import { philipsDs2Loader } from '@opencpap/loader-philips-ds2';
import { syntheticCardFiles } from '@opencpap/loader-philips-ds2/testing';
import { FileListFS } from './fileListFs';
import { DirectoryHandleFS, type DirEntry, type FileEntry } from './directoryHandleFs';
import { ZipFS } from './zipFs';

const card = syntheticCardFiles();
const expectedPaths = [...card.keys()].sort();

const fileWithPath = (path: string, data: Uint8Array) => {
  const f = new File([data as BlobPart], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: path });
  return f;
};

/** Builds a fake directory tree from `a/b/c` style paths. */
function fakeDir(name: string, files: Map<string, Uint8Array>): DirEntry {
  const children = new Map<string, Map<string, Uint8Array>>();
  const leaves: FileEntry[] = [];
  for (const [p, data] of files) {
    const [head, ...rest] = p.split('/');
    if (rest.length === 0) leaves.push({ kind: 'file', name: head!, getFile: async () => new File([data as BlobPart], head!) });
    else children.set(head!, (children.get(head!) ?? new Map()).set(rest.join('/'), data));
  }
  return {
    kind: 'directory', name,
    async *values() {
      for (const l of leaves) yield l;
      for (const [n, sub] of children) yield fakeDir(n, sub);
    },
  };
}

const sources: [string, () => Promise<VirtualFS> | VirtualFS][] = [
  ['FileListFS (card root selected)', () => new FileListFS([...card].map(([p, d]) => fileWithPath(`NO NAME/${p}`, d)))],
  ['FileListFS (P-SERIES selected)', () => new FileListFS([...card].map(([p, d]) => fileWithPath(p, d)))],
  ['FileListFS (+ unrelated files)', () => new FileListFS([...[...card].map(([p, d]) => fileWithPath(`NO NAME/${p}`, d)), fileWithPath('NO NAME/DCIM/img.jpg', new Uint8Array(3))])],
  ['DirectoryHandleFS (card root)', () => new DirectoryHandleFS(fakeDir('NO NAME', new Map([...card, ['DCIM/img.jpg', new Uint8Array(3)]])))],
  ['DirectoryHandleFS (P-SERIES)', () => new DirectoryHandleFS(fakeDir('P-SERIES', new Map([...card].map(([p, d]) => [p.replace(/^P-SERIES\//, ''), d] as const))))],
  ['DirectoryHandleFS (parent of card)', () => new DirectoryHandleFS(fakeDir('backups', new Map([...card].map(([p, d]) => [`card1/${p}`, d] as const))))],
  ['ZipFS (card root)', () => new ZipFS(zipSync(Object.fromEntries([...card, ['DCIM/img.jpg', new Uint8Array(3)] as const])))],
  ['ZipFS (folder zipped with its name)', () => new ZipFS(zipSync(Object.fromEntries([...card].map(([p, d]) => [`NO NAME/${p}`, d]))))],
];

describe.each(sources)('%s', (_name, make) => {
  it('lists only the card files, with marker-rooted paths', async () => {
    expect(await (await make()).list()).toEqual(expectedPaths);
  });
  it('reads file contents', async () => {
    const fs = await make();
    for (const [p, d] of card) expect([...(await fs.read(p))]).toEqual([...d]);
    expect(await fs.exists('P-SERIES/AAAA0001/PROP.BIN')).toBe(true);
    expect(await fs.exists('nope')).toBe(false);
    await expect(fs.read('nope')).rejects.toThrow(/not found/);
  });
  it('loads the session through the DS2 loader', async () => {
    const sessions: Session[] = [];
    for await (const s of loadCard(await make(), [philipsDs2Loader])) sessions.push(s);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe(0x10);
  });
});

describe('ZipFS limits', () => {
  it('refuses oversized entries without decompressing them', async () => {
    const zip = zipSync({ 'P-SERIES/D/big.bin': new Uint8Array(1024) });
    const { MAX_FILE_BYTES } = await import('./fileListFs');
    expect(MAX_FILE_BYTES).toBeGreaterThan(1024); // sanity: the limit is not trivially hit
    expect(await new ZipFS(zip).read('P-SERIES/D/big.bin')).toHaveLength(1024);
  });
});
