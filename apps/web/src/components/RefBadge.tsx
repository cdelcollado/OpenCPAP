import { useTranslation } from 'react-i18next';
import type { RefState } from '@opencpap/core';
import { IconAlert, IconCheck, IconWarn } from './icons';

/** Same icon family as every other status in the app (see icons.tsx). */
const ICON = { good: IconCheck, warn: IconWarn, bad: IconAlert };

/**
 * Three-state reference status (within range / attention / out of range) against a published reference.
 * Icon, colour and text together: the state is never carried by colour alone.
 */
export function RefBadge({ state }: { state: RefState }) {
  const { t } = useTranslation();
  const Icon = ICON[state];
  return (
    <span className={`badge badge-${state}`} data-testid="ref-badge">
      <Icon />
      {t(`reference.state.${state}`)}
    </span>
  );
}
