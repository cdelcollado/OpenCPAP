import type { DeviceLoader, VirtualFS, DetectResult, Session } from '@opencpap/core';

/** Philips Respironics DreamStation 2 loader. Detection only; chunk parsing arrives in Phase 1. */
export const philipsDs2Loader: DeviceLoader = {
  id: 'philips-ds2',
  async detect(fs: VirtualFS): Promise<DetectResult | null> {
    const files = await fs.list('P-SERIES/');
    if (files.length === 0) return null;
    return { device: { manufacturer: 'Philips Respironics', model: 'DreamStation (P-SERIES)' }, confidence: 0.5 };
  },
  async *load(): AsyncIterable<Session> {
    throw new Error('DS2 parsing is not implemented yet (Phase 1)');
  },
};
