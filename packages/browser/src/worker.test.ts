import { describe, it, expect } from 'vitest';
import type { Session } from '@opencpap/core';
import { philipsDs2Loader } from '@opencpap/loader-philips-ds2';
import { syntheticCardFiles } from '@opencpap/loader-philips-ds2/testing';
import { importCard, type WorkerLike } from './client';
import { runImport } from './importer';
import type { FromWorker, ToWorker } from './protocol';
import type { CardSource } from './source';

/** Runs the real import pipeline in-process, cloning every message like a Worker would. */
function fakeWorker(opts: { delayMs?: number } = {}): WorkerLike & { terminated: boolean; received: ToWorker[] } {
  const listeners: ((e: { data: FromWorker }) => void)[] = [];
  let cancelled = false;
  const w = {
    terminated: false,
    received: [] as ToWorker[],
    postMessage(msg: ToWorker) {
      w.received.push(msg);
      if (msg.type === 'cancel') { cancelled = true; return; }
      void runImport(msg.source, [philipsDs2Loader], (m, transfer) => {
        const data = structuredClone(m, { transfer }) as FromWorker;
        setTimeout(() => listeners.forEach((l) => l({ data })), opts.delayMs ?? 0);
      }, () => cancelled);
    },
    addEventListener(type: string, l: never) { if (type === 'message') listeners.push(l); },
    removeEventListener(type: string, l: never) { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); },
    terminate() { w.terminated = true; },
  };
  return w as never;
}

const zipSource = async (files: Map<string, Uint8Array>): Promise<CardSource> => {
  const { zipSync } = await import('fflate');
  return { kind: 'zip', file: new Blob([zipSync(Object.fromEntries(files))]) };
};

describe('importCard (worker protocol)', () => {
  it('streams detection, progress and sessions, then terminates the worker', async () => {
    const w = fakeWorker();
    const detected: string[] = [];
    const progress: [number, number][] = [];
    const sessions: Session[] = [];
    for await (const s of importCard(w, await zipSource(syntheticCardFiles()), {
      onDetected: (d) => detected.push(d.loader),
      onProgress: (a, b) => progress.push([a, b]),
    })) sessions.push(s);
    expect(detected).toEqual(['philips-ds2']);
    expect(progress.at(-1)).toEqual([1, 1]);
    expect(sessions).toHaveLength(1);
    // typed arrays survive the structured clone / transfer
    expect([...sessions[0]!.waveforms[0]!.samples]).toEqual([1, 2, 3, 4, 5, -1, -2, 0, 1, 2]);
    expect(w.terminated).toBe(true);
  });

  it('reports unsupported cards as an UnsupportedCardError', async () => {
    const w = fakeWorker();
    const src = await zipSource(new Map([['P-SERIES/other/readme.txt', new Uint8Array(1)]]));
    await expect((async () => { for await (const _ of importCard(w, src)) { /* drain */ } })()).rejects.toMatchObject({ name: 'UnsupportedCardError' });
    expect(w.terminated).toBe(true);
  });

  it('reports corrupt data as an error instead of hanging', async () => {
    const w = fakeWorker();
    const files = syntheticCardFiles();
    files.set('P-SERIES/AAAA0001/P0/00000010.B01', new Uint8Array(300)); // not a DS2 container
    await expect((async () => { for await (const _ of importCard(w, await zipSource(files))) { /* drain */ } })()).rejects.toThrow(/DS2/);
  });

  it('does not start when already aborted', async () => {
    const w = fakeWorker();
    const ac = new AbortController();
    ac.abort();
    const got: Session[] = [];
    for await (const s of importCard(w, await zipSource(syntheticCardFiles()), { signal: ac.signal })) got.push(s);
    expect(got).toHaveLength(0);
    expect(w.received).toHaveLength(0);
    expect(w.terminated).toBe(true);
  });

  it('cancels the worker when aborted while importing', async () => {
    const w = fakeWorker({ delayMs: 5 });
    const ac = new AbortController();
    for await (const _ of importCard(w, await zipSource(syntheticCardFiles()), { signal: ac.signal, onDetected: () => ac.abort() })) { /* drain */ }
    expect(w.received.some((m) => m.type === 'cancel')).toBe(true);
    expect(w.terminated).toBe(true);
  });
});
