import type { Session } from '@opencpap/core';
import type { FromWorker, ToWorker } from './protocol';
import type { CardSource } from './source';

/** The part of `Worker` that the client needs (lets tests use an in-process fake). */
export interface WorkerLike {
  postMessage(msg: ToWorker): void;
  addEventListener(type: 'message', l: (e: { data: FromWorker }) => void): void;
  addEventListener(type: 'error', l: (e: { message?: string }) => void): void;
  removeEventListener(type: 'message' | 'error', l: (e: never) => void): void;
  terminate(): void;
}

export interface ImportCallbacks {
  onDetected?: (info: { manufacturer: string; model: string; loader: string }) => void;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Creates the import worker (bundlers such as Vite recognise this `new URL` pattern). */
export function createImportWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

/**
 * Imports a card in a worker and yields sessions as they are decoded.
 * The worker is terminated when the iteration ends, fails or is aborted.
 */
export async function* importCard(worker: WorkerLike, source: CardSource, cb: ImportCallbacks = {}): AsyncGenerator<Session> {
  if (cb.signal?.aborted) { worker.terminate(); return; }
  const queue: FromWorker[] = [];
  let wake: (() => void) | undefined;
  const push = (m: FromWorker) => { queue.push(m); wake?.(); };
  const onMessage = (e: { data: FromWorker }) => push(e.data);
  const onError = (e: { message?: string }) => push({ type: 'error', name: 'WorkerError', message: e.message ?? 'worker failed' });
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);
  const onAbort = () => { worker.postMessage({ type: 'cancel' }); push({ type: 'done', count: -1 }); };
  cb.signal?.addEventListener('abort', onAbort);

  try {
    worker.postMessage({ type: 'import', source });
    for (;;) {
      while (queue.length === 0) await new Promise<void>((r) => (wake = r));
      const m = queue.shift()!;
      switch (m.type) {
        case 'detected': cb.onDetected?.(m); break;
        case 'progress': cb.onProgress?.(m.done, m.total); break;
        case 'session': yield m.session; break;
        case 'done': return;
        case 'error': { const e = new Error(m.message); e.name = m.name; throw e; }
      }
    }
  } finally {
    cb.signal?.removeEventListener('abort', onAbort);
    worker.removeEventListener('message', onMessage as never);
    worker.removeEventListener('error', onError as never);
    worker.terminate();
  }
}
