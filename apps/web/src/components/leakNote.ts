import type { TFunction } from 'i18next';
import { REFERENCE, type DeviceFamily } from '@opencpap/core';

/** Leak line for the dashboard: what is judged, the figure, and the reference for the family (one line). */
export function leakJudged(t: TFunction, family: DeviceFamily, value: string): string {
  if (family === 'resmed') return t('reference.leakJudgedResmed', { value, limit: REFERENCE.leakResmed });
  if (family === 'philips') return t('reference.leakJudgedPhilips', { value, min: REFERENCE.leakPhilips.min, max: REFERENCE.leakPhilips.max });
  return t('reference.leakJudgedOther', { value });
}

/** The leak reference line for a device family (the status itself comes from `leakReference`). */
export function leakNote(t: TFunction, family: DeviceFamily): string {
  if (family === 'resmed') return t('reference.leak', { limit: REFERENCE.leakResmed });
  if (family === 'philips') return t('reference.leakPhilips', { min: REFERENCE.leakPhilips.min, max: REFERENCE.leakPhilips.max, problem: REFERENCE.leakPhilips.problem });
  return t('reference.none');
}
