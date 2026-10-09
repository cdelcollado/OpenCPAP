import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import en from '../../i18n/locales/en.json';
import { settingsRows } from './settingsRows';

await i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n);
const rows = (s: Record<string, string | number | boolean>) => Object.fromEntries(settingsRows(s, t, 'en').map((r) => [r.label, r.value]));

describe('settingsRows', () => {
  it('describes a typical DreamStation 2 configuration', () => {
    const r = rows({ mode: 'cpap', pressure: 9.5, rampTimeMinutes: 15, rampType: 'ramp-plus', rampPressure: 4, flexMode: 'none', humidifierPresent: true, humidifierMode: 'adaptive', humidifierLevel: 3, tubingDiameterMm: 15, maskResistance: 1, autoOn: false, autoOff: false });
    expect(r).toMatchObject({ Mode: 'CPAP', 'Ramp time': '15 min', 'Ramp type': 'Ramp+', 'Ramp starting pressure': '4 cmH₂O', 'Tube diameter': '15 mm', 'Mask resistance': '1', 'Auto start': 'No', 'Auto stop': 'No' });
    expect(Object.keys(r)).not.toContain('Pressure');
  });
  it('hides ramp details when the ramp is off and flex level when flex is off', () => {
    const r = rows({ rampTimeMinutes: 0, rampPressure: 4, flexMode: 'none', flexLevel: 2 });
    expect(r['Ramp time']).toBe('Off');
    expect(r['Ramp starting pressure']).toBeUndefined();
    expect(r['Flex level']).toBeUndefined();
  });
  it('handles a missing humidifier and an empty configuration', () => {
    expect(rows({ humidifierPresent: false }).Humidifier).toBe('None');
    expect(settingsRows({}, t, 'en')).toEqual([]);
  });
});
