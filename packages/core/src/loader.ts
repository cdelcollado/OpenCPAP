import type { DeviceInfo, Session } from './model';
import type { VirtualFS } from './vfs';

export interface DetectResult {
  device: Pick<DeviceInfo, 'manufacturer' | 'model'>;
  confidence: number; // 0..1
}

export type Progress = (done: number, total: number) => void;

export interface DeviceLoader {
  id: string;
  detect(fs: VirtualFS): Promise<DetectResult | null>;
  load(fs: VirtualFS, onProgress?: Progress): AsyncIterable<Session>;
}

export class UnsupportedCardError extends Error {
  constructor() {
    super('No supported CPAP data found on this card');
    this.name = 'UnsupportedCardError';
  }
}

/** Runs every loader's cheap `detect` and returns the most confident match. */
export async function detectLoader(
  fs: VirtualFS,
  loaders: readonly DeviceLoader[],
): Promise<{ loader: DeviceLoader; detected: DetectResult } | null> {
  let best: { loader: DeviceLoader; detected: DetectResult } | null = null;
  for (const loader of loaders) {
    const detected = await loader.detect(fs);
    if (detected && (!best || detected.confidence > best.detected.confidence)) best = { loader, detected };
  }
  return best;
}

/** Detects the device on the card and streams its sessions. Throws `UnsupportedCardError` if none matches. */
export async function* loadCard(
  fs: VirtualFS,
  loaders: readonly DeviceLoader[],
  onProgress?: Progress,
): AsyncGenerator<Session> {
  const match = await detectLoader(fs, loaders);
  if (!match) throw new UnsupportedCardError();
  yield* match.loader.load(fs, onProgress);
}
