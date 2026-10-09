/**
 * Compares an OSCAR CSV export with what OpenCPAP decodes from the same SD card.
 *   npx tsx scripts/compare-oscar.ts <oscar-sessions.csv> [card-folder]   (default card: fixtures/raw). Set OSCAR_TZ=Europe/Madrid to override the time zone used to match start times.
 * Guide: docs/oscar-comparison.md
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCard, MemoryFS, type Session } from '@opencpap/core';
import { philipsDs2Loader } from '@opencpap/loader-philips-ds2';
import { compareWithOscar, formatComparison, parseOscarCsv } from './oscarCsv';

async function main() {
  const [csvPath, cardArg] = process.argv.slice(2);
  if (!csvPath) { console.error('usage: compare-oscar.ts <oscar-sessions.csv> [card-folder]'); process.exit(2); }
  const card = resolve(cardArg ?? 'fixtures/raw');

  const files = new Map<string, Uint8Array>();
  (function walk(rel: string) {
    for (const n of readdirSync(join(card, rel))) {
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(join(card, r)).isDirectory()) walk(r); else files.set(r, new Uint8Array(readFileSync(join(card, r))));
    }
  })('');

  const sessions: Session[] = [];
  for await (const s of loadCard(new MemoryFS(files), [philipsDs2Loader])) sessions.push(s);
  const rows = parseOscarCsv(readFileSync(csvPath, 'latin1'));
  console.log(formatComparison(compareWithOscar(rows, sessions, { timeZone: process.env.OSCAR_TZ })));
}

// Wrapped in a function: tsx compiles this file as CommonJS, where top-level await is not allowed.
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
