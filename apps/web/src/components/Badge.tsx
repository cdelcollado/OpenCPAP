import type { ReactNode } from 'react';
import { IconAlert, IconCheck, IconDot, IconWarn } from './icons';

export type Level = 'good' | 'warn' | 'bad' | 'neutral';
const ICON: Record<Level, () => ReactNode> = { good: IconCheck, warn: IconWarn, bad: IconAlert, neutral: IconDot };

/** Status chip. State is always carried by an icon and text, never by colour alone. */
export function Badge({ level, children }: { level: Level; children: ReactNode }) {
  const Icon = ICON[level];
  return <span className={`badge badge-${level}`}><Icon />{children}</span>;
}
