import type { Session, EventType } from './model';

export interface SessionSummary {
  /** hours with the mask on */
  usageHours: number;
  counts: Partial<Record<EventType, number>>;
  /** (obstructive + central + hypopnea + unclassified-apnea) / usageHours; undefined when usage is 0 */
  ahi?: number;
}

export function usageSeconds(s: Pick<Session, 'slices'>): number {
  let ms = 0;
  for (const sl of s.slices) if (sl.status === 'mask-on') ms += sl.end - sl.start;
  return ms / 1000;
}

/** Computes usage and event indices for one session. RERAs are reported but not part of the AHI. */
export function summarizeSession(s: Pick<Session, 'slices' | 'events'>): SessionSummary {
  const usageHours = usageSeconds(s) / 3600;
  const counts: Partial<Record<EventType, number>> = {};
  for (const e of s.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const n = (counts.obstructive ?? 0) + (counts.central ?? 0) + (counts.hypopnea ?? 0) + (counts['unclassified-apnea'] ?? 0);
  return { usageHours, counts, ahi: usageHours > 0 ? n / usageHours : undefined };
}
