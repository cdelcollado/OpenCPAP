import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import type { RefState } from '@opencpap/core';

const ICON = { good: CircleCheck, warn: TriangleAlert, bad: CircleX };

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
