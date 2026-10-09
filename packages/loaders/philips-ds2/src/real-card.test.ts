import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeFS } from './testing/nodeFs';
import { decryptDs2 } from './container';
import { parseChunks } from './chunk';

// Integration test against a real card copied to fixtures/raw (git-ignored). Skipped when absent.
const root = fileURLToPath(new URL('../../../../fixtures/raw', import.meta.url));
const has = existsSync(root + '/P-SERIES');

describe.skipIf(!has)('real DS2 card', () => {
  it('decrypts every file and every chunk passes header checksum and CRC', async () => {
    const fs = new NodeFS(root);
    const files = (await fs.list('P-SERIES/')).filter((p) => /\.B0\d$/.test(p));
    expect(files.length).toBeGreaterThan(0);
    const errors: string[] = [];
    const stats = new Map<string, number>();
    for (const path of files) {
      const { payload } = decryptDs2(await fs.read(path));
      let n = 0;
      for (const c of parseChunks(payload, (e) => errors.push(`${path}: ${e.message}`))) {
        n++;
        const k = `${path.split('.').pop()} v${c.fileVersion} fam${c.family}.${c.familyVersion} htype${c.htype}`;
        stats.set(k, (stats.get(k) ?? 0) + 1);
      }
      if (n === 0) errors.push(`${path}: no chunks`);
    }
    console.log('files:', files.length, 'chunk kinds:', Object.fromEntries(stats), 'errors:', errors.length, errors.slice(0, 5));
    expect(errors).toEqual([]);
  });
});

describe.skipIf(!has)('real DS2 card: loader', () => {
  it('parsed event counts match the counts reported by the device itself', async () => {
    const { philipsDs2Loader } = await import('./index');
    const { summarizeSession } = await import('@opencpap/core');
    const fs = new NodeFS(root);
    let sessions = 0, compared = 0, unknown = 0;
    const mismatches: string[] = [];
    for await (const s of philipsDs2Loader.load(fs)) {
      sessions++;
      unknown += s.unknownRecords ?? 0;
      if (!s.deviceSummary || s.events.length === 0 && s.statistics.length === 0) continue; // card kept no event file
      compared++;
      const c = { ...summarizeSession(s).counts };
      // Hypopneas stored under record code 0x0b are not part of the device's own count (see docs/formats/ds2.md).
      const alt = s.events.filter((e) => e.detail === 'alt-hypopnea').length;
      c.hypopnea = (c.hypopnea ?? 0) - alt;
      for (const k of ['obstructive', 'central', 'hypopnea', 'rera', 'flow-limitation'] as const) {
        if ((c[k] ?? 0) !== s.deviceSummary[k]) mismatches.push(`session ${s.id} ${k}: parsed ${c[k] ?? 0} vs device ${s.deviceSummary[k]}`);
      }
    }
    console.log({ sessions, compared, unknown, mismatches: mismatches.length, sample: mismatches.slice(0, 8) });
    expect(compared).toBeGreaterThan(0);
    expect(unknown).toBe(0);
    expect(mismatches).toEqual([]);
  }, 120000);
});
