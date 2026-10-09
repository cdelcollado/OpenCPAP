import type { NightSummary } from './nights';

export type SettingValue = string | number | boolean;
export interface SettingChange { key: string; from: SettingValue; to: SettingValue }
export interface ChangeEvent { date: string; changes: SettingChange[] }

/** Settings that change what the patient feels or what the numbers mean. Others are reported as "minor". */
export const MAJOR_SETTINGS = ['mode', 'pressure', 'pressureMin', 'pressureMax', 'epap', 'ipap', 'epapMin', 'ipapMax', 'pressureSupport', 'rampTimeMinutes', 'rampPressure', 'rampType', 'flexMode', 'flexLevel', 'ezStart'] as const;

/**
 * Compares the therapy settings of consecutive nights and returns, for each night whose settings differ from the
 * previous night's, what changed. A setting that is missing on either night is ignored (devices only report what
 * applies), so a change is always "had value A, now has value B". Nights are compared in date order.
 */
export function settingsChanges(nights: NightSummary[]): ChangeEvent[] {
  const sorted = [...nights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: ChangeEvent[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.settings, cur = sorted[i]!.settings;
    const changes: SettingChange[] = [];
    for (const key of Object.keys(cur)) {
      const a = prev[key], b = cur[key];
      if (a === undefined || b === undefined || a === b) continue;
      changes.push({ key, from: a, to: b });
    }
    if (changes.length) out.push({ date: sorted[i]!.date, changes: changes.sort((x, y) => x.key.localeCompare(y.key)) });
  }
  return out;
}

export const isMajor = (key: string) => (MAJOR_SETTINGS as readonly string[]).includes(key);
