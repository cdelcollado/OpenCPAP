import type { Session } from '@opencpap/core';
import type { CardSource } from './source';

/** Messages between the UI thread and the import worker. */
export type ToWorker = { type: 'import'; source: CardSource } | { type: 'cancel' };

export type FromWorker =
  | { type: 'detected'; manufacturer: string; model: string; loader: string }
  | { type: 'progress'; done: number; total: number }
  | { type: 'session'; session: Session }
  | { type: 'done'; count: number }
  | { type: 'error'; name: string; message: string };
