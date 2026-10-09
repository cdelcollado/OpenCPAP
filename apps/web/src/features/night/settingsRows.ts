import type { TFunction } from 'i18next';
import type { SessionSettings } from '@opencpap/core';

export interface SettingRow { label: string; value: string }

const bool = (t: TFunction, v: boolean) => t(v ? 'common.yes' : 'common.no');

/**
 * Human-readable therapy settings of a session. Only settings the device actually reported are listed.
 * Pressure is left out: it is shown in the summary tiles.
 */
export function settingsRows(s: SessionSettings, t: TFunction, lang: string): SettingRow[] {
  const rows: SettingRow[] = [];
  const num = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : undefined);
  const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : undefined);
  const flag = (k: string) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : undefined);
  const n1 = (v: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(v);
  const add = (label: string, value: string | undefined) => { if (value !== undefined) rows.push({ label: t(`setting.${label}`), value }); };

  const mode = str('mode');
  add('mode', mode ? t(`mode.${mode}`, mode) : undefined);
  const ramp = num('rampTimeMinutes');
  add('rampTime', ramp === undefined ? undefined : ramp === 0 ? t('common.off') : `${ramp} ${t('common.minutesShort')}`);
  const rampType = str('rampType');
  add('rampType', rampType ? t(`setting.rampType_${rampType}`, rampType) : undefined);
  const rampP = num('rampPressure');
  add('rampPressure', rampP === undefined || ramp === 0 ? undefined : `${n1(rampP)} ${t('metric.unitPressure')}`);
  const flex = str('flexMode');
  add('flex', flex ? t(`setting.flex_${flex}`, flex) : undefined);
  const flexLevel = num('flexLevel');
  add('flexLevel', flexLevel === undefined || flex === 'none' ? undefined : String(flexLevel));
  const ez = flag('ezStart');
  add('ezStart', ez === undefined ? undefined : bool(t, ez));
  if (flag('humidifierPresent') === false) add('humidifier', t('setting.humid_none'));
  else {
    const hm = str('humidifierMode');
    add('humidifier', hm ? t(`setting.humid_${hm}`, hm) : undefined);
    const hl = num('humidifierLevel');
    add('humidLevel', hl === undefined ? undefined : String(hl));
    const tt = num('heatedTubeTemperature');
    add('tubeTemp', tt === undefined ? undefined : String(tt));
  }
  const tube = num('tubingDiameterMm');
  add('tubing', tube === undefined ? undefined : `${tube} mm`);
  const mr = num('maskResistance');
  add('maskResistance', mr === undefined ? undefined : mr === 0 ? t('common.off') : String(mr));
  const on = flag('autoOn'), off = flag('autoOff');
  add('autoStart', on === undefined ? undefined : bool(t, on));
  add('autoStop', off === undefined ? undefined : bool(t, off));
  return rows;
}
