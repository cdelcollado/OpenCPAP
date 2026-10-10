import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import { REFERENCE, type DeviceFamily, type RefState } from '@opencpap/core';

const ICON = { good: CircleCheck, warn: TriangleAlert, bad: CircleX };

/** The leak reference line for a device family (the status itself comes from `leakReference`). */
export function leakNote(t: TFunction, family: DeviceFamily): string {
  if (family === 'resmed') return t('reference.leak', { limit: REFERENCE.leakResmed });
  if (family === 'philips') return t('reference.leakPhilips', { min: REFERENCE.leakPhilips.min, max: REFERENCE.leakPhilips.max, problem: REFERENCE.leakPhilips.problem });
  return t('reference.none');
}

/**
 * Three-state reference status (within range / attention / out of range) against a published reference.
 * Icon, colour and text together: the state is never carried by colour alone.
 */
export function RefBadge({ state }: { state: RefState }) {
  const { t } = useTranslation();
  const Icon = ICON[state];
  return (
    <span className={`badge badge-${state}`} data-testid="ref-badge">
      <Icon size={15} strokeWidth={2.2} aria-hidden="true" focusable="false" />
      {t(`reference.state.${state}`)}
    </span>
  );
}
