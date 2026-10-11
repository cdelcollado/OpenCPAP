import { useSyncExternalStore } from 'react';

/**
 * Tracks whether a new version of the app is waiting in the service worker.
 * The service worker only reports it; the user decides when to reload, so unsaved text is never lost silently.
 */
type Apply = (reload: boolean) => Promise<void>;

let apply: Apply | null = null;
let ready = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

/** Called by the service worker registration when a new version has been downloaded. */
export function markUpdateReady(applyUpdate: Apply) {
  apply = applyUpdate;
  if (ready) return;
  ready = true;
  emit();
}

/** Activates the waiting version and reloads the page. */
export function installUpdate() {
  void apply?.(true);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True once a new version has been downloaded and is waiting to be activated. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}

/** Only for tests: resets the module state. */
export function resetUpdateStateForTests() {
  apply = null;
  ready = false;
  emit();
}
