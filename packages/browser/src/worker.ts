/// <reference lib="webworker" />
// Entry point of the import Web Worker. Add new device loaders to LOADERS.
import { philipsDs2Loader } from '@opencpap/loader-philips-ds2';
import { runImport } from './importer';
import type { FromWorker, ToWorker } from './protocol';

const LOADERS = [philipsDs2Loader];

let cancelled = false;
const scope = self as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

scope.onmessage = (e) => {
  if (e.data.type === 'cancel') { cancelled = true; return; }
  cancelled = false;
  void runImport(e.data.source, LOADERS, (msg, transfer) => scope.postMessage(msg, transfer ?? []), () => cancelled);
};
