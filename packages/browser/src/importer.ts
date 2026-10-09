import { analyzeSession, detectLoader, UnsupportedCardError, type DeviceLoader, type Session } from '@opencpap/core';
import { createFs, type CardSource } from './source';
import type { FromWorker } from './protocol';

/** All ArrayBuffers owned by a session, so they can be transferred to the UI thread instead of copied. */
export function sessionBuffers(s: Session): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>();
  for (const w of s.waveforms) set.add(w.samples.buffer as ArrayBuffer);
  for (const t of s.statistics) { set.add(t.times.buffer as ArrayBuffer); set.add(t.values.buffer as ArrayBuffer); }
  const win = s.analysis?.windows;
  if (win) for (const a of [win.times, win.flatShare, win.rate, win.volumeCv]) set.add(a.buffer as ArrayBuffer);
  return [...set];
}

/**
 * The import pipeline, independent of Worker plumbing so it can be tested in Node:
 * build the VirtualFS, detect the device, stream sessions through `post`.
 */
export async function runImport(
  source: CardSource,
  loaders: readonly DeviceLoader[],
  post: (msg: FromWorker, transfer?: ArrayBuffer[]) => void,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  try {
    const fs = await createFs(source);
    const match = await detectLoader(fs, loaders);
    if (!match) throw new UnsupportedCardError();
    post({ type: 'detected', manufacturer: match.detected.device.manufacturer, model: match.detected.device.model, loader: match.loader.id });
    let count = 0;
    for await (const session of match.loader.load(fs, (done, total) => post({ type: 'progress', done, total }))) {
      if (isCancelled()) return;
      count++;
      // breath analysis runs here, off the UI thread, while the waveform is in memory
      session.analysis ??= analyzeSession(session.waveforms);
      post({ type: 'session', session }, sessionBuffers(session));
    }
    post({ type: 'done', count });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    post({ type: 'error', name: err.name, message: err.message });
  }
}
