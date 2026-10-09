import { percentile, type NightSummary } from './nights';
import { daysBetween } from './compare';

export type EquipmentKind = 'mask' | 'cushion' | 'headgear' | 'hose' | 'filter' | 'humidifier-chamber' | 'other';
export const EQUIPMENT_KINDS: EquipmentKind[] = ['mask', 'cushion', 'headgear', 'hose', 'filter', 'humidifier-chamber', 'other'];

/**
 * Starting points for the replacement interval, in days. Manufacturers and clinics differ, so these are only
 * defaults the user can edit; the app never claims they are medical advice.
 */
export const DEFAULT_INTERVAL_DAYS: Record<EquipmentKind, number> = { mask: 180, cushion: 90, headgear: 180, hose: 90, filter: 30, 'humidifier-chamber': 180, other: 90 };

export interface EquipmentItem {
  id: string;
  kind: EquipmentKind;
  name: string;
  /** first night of use, YYYY-MM-DD */
  startDate: string;
  /** last day of use when the item was replaced */
  endDate?: string;
  intervalDays: number;
  note?: string;
}

export type EquipmentState = 'ok' | 'soon' | 'due' | 'overdue' | 'retired';
export interface EquipmentStatus { ageDays: number; daysLeft: number; state: EquipmentState }

/** Days of use as of `asOf` (the latest data date, so the result does not depend on today's clock) and what to do about it. */
export function equipmentStatus(item: EquipmentItem, asOf: string): EquipmentStatus {
  const end = item.endDate && item.endDate < asOf ? item.endDate : asOf;
  const ageDays = Math.max(0, daysBetween(item.startDate, end));
  const daysLeft = item.intervalDays - ageDays;
  if (item.endDate && item.endDate <= asOf) return { ageDays, daysLeft, state: 'retired' };
  const soon = Math.max(7, Math.round(item.intervalDays * 0.1));
  return { ageDays, daysLeft, state: daysLeft < -7 ? 'overdue' : daysLeft <= 0 ? 'due' : daysLeft <= soon ? 'soon' : 'ok' };
}

export interface LeakAge { points: { age: number; leak: number }[]; early?: number; late?: number; /** L/min gained per 30 days of use (linear fit) */ slope30?: number; trend?: 'rising' | 'flat' | 'falling' }

const median = (xs: number[]) => (xs.length ? percentile(xs, 50) : undefined);

/** 95th-percentile leak by age of an item (days since it was first used), with a linear trend. Needs ≥ 10 nights for a slope. */
export function leakByAge(nights: NightSummary[], item: Pick<EquipmentItem, 'startDate' | 'endDate'>): LeakAge {
  const pts = nights
    .filter((n) => n.date >= item.startDate && (!item.endDate || n.date <= item.endDate) && n.leak)
    .map((n) => ({ age: daysBetween(item.startDate, n.date), leak: n.leak!.p95 }))
    .sort((a, b) => a.age - b.age);
  const out: LeakAge = { points: pts };
  if (pts.length >= 6) { out.early = median(pts.slice(0, 7).map((p) => p.leak)); out.late = median(pts.slice(-7).map((p) => p.leak)); }
  if (pts.length >= 10) {
    const n = pts.length, mx = pts.reduce((a, p) => a + p.age, 0) / n, my = pts.reduce((a, p) => a + p.leak, 0) / n;
    const sxx = pts.reduce((a, p) => a + (p.age - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p.age - mx) * (p.leak - my), 0);
    if (sxx > 0) {
      out.slope30 = (sxy / sxx) * 30;
      out.trend = out.slope30 >= 2 ? 'rising' : out.slope30 <= -2 ? 'falling' : 'flat';
    }
  }
  return out;
}

/** Ids of items whose replacement is due or close, most urgent first. */
export function dueItems(items: EquipmentItem[], asOf: string): { item: EquipmentItem; status: EquipmentStatus }[] {
  return items
    .map((item) => ({ item, status: equipmentStatus(item, asOf) }))
    .filter(({ status }) => status.state === 'soon' || status.state === 'due' || status.state === 'overdue')
    .sort((a, b) => a.status.daysLeft - b.status.daysLeft);
}

