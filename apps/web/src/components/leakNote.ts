import type { TFunction } from 'i18next';
import { REFERENCE, type DeviceFamily } from '@opencpap/core';

/** The leak reference line for a device family (the status itself comes from `leakReference`). */
export function leakNote(t: TFunction, family: DeviceFamily): string {
  if (family === 'resmed') return t('reference.leak', { limit: REFERENCE.leakResmed });
  if (family === 'philips') return t('reference.leakPhilips', { min: REFERENCE.leakPhilips.min, max: REFERENCE.leakPhilips.max, problem: REFERENCE.leakPhilips.problem });
  return t('reference.none');
}
