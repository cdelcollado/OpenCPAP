import type { TFunction } from 'i18next';
import type { ChangeEvent, SettingValue } from '@opencpap/core';

const PRESSURE_KEYS = new Set(['pressure', 'pressureMin', 'pressureMax', 'epap', 'ipap', 'epapMin', 'ipapMax', 'pressureSupport', 'pressureSupportMin', 'pressureSupportMax', 'rampPressure']);

/** A setting's display name ("Ramp time"); falls back to the raw key for settings we have no label for. */
export function settingLabel(key: string, t: TFunction): string {
  return t(`settingKey.${key}`, { defaultValue: key });
}

/** A setting's value with its unit ("9.5 cmH₂O", "15 min", "Yes", "Adaptive"). */
export function settingValue(key: string, value: SettingValue, t: TFunction, lang: string): string {
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no');
  if (typeof value === 'string') {
    if (key === 'mode') return t(`mode.${value}`, { defaultValue: value });
    if (key === 'rampType') return t(`setting.rampType_${value}`, { defaultValue: value });
    if (key === 'flexMode') return t(`setting.flex_${value}`, { defaultValue: value });
    if (key === 'humidifierMode') return t(`setting.humid_${value}`, { defaultValue: value });
    return value;
  }
  const n = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value);
  if (PRESSURE_KEYS.has(key)) return `${n} ${t('metric.unitPressure')}`;
  if (key === 'rampTimeMinutes') return value === 0 ? t('common.off') : `${n} ${t('common.minutesShort')}`;
  if (key === 'tubingDiameterMm') return `${n} mm`;
  return n;
}

/** "Pressure: 9 cmH₂O → 10 cmH₂O; Ramp time: 15 min → 20 min" (at most `max` items, then "+n"). */
export function describeChanges(c: ChangeEvent, t: TFunction, lang: string, max = 2): string {
  const parts = c.changes.slice(0, max).map((x) => `${settingLabel(x.key, t)}: ${settingValue(x.key, x.from, t, lang)} → ${settingValue(x.key, x.to, t, lang)}`);
  if (c.changes.length > max) parts.push(`+${c.changes.length - max}`);
  return parts.join('; ');
}
