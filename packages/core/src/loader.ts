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
