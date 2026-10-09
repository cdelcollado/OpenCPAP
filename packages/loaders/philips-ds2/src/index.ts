import type { DeviceLoader, VirtualFS, DetectResult, Session } from '@opencpap/core';

/** Loader Philips Respironics DreamStation 2. Detecció només; el parsing arriba a la Fase 1. */
export const philipsDs2Loader: DeviceLoader = {
  id: 'philips-ds2',
  async detect(fs: VirtualFS): Promise<DetectResult | null> {
    const files = await fs.list('P-SERIES/');
    if (files.length === 0) return null;
    return { device: { manufacturer: 'Philips Respironics', model: 'DreamStation (P-SERIES)' }, confidence: 0.5 };
  },
  async *load(): AsyncIterable<Session> {
    throw new Error('Parsing DS2 encara no implementat (Fase 1)');
  },
};
