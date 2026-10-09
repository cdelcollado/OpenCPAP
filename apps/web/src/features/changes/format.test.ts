import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import en from '../../i18n/locales/en.json';
import ca from '../../i18n/locales/ca.json';
import { settingLabel, settingValue } from './format';

await i18n.init({ lng: 'en', resources: { en: { translation: en }, ca: { translation: ca } }, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n);

describe('settings formatting', () => {
  it('adds units and translates enums', () => {
    expect(settingValue('pressure', 9.5, t, 'en')).toBe('9.5 cmH₂O');
    expect(settingValue('rampTimeMinutes', 15, t, 'en')).toBe('15 min');
    expect(settingValue('rampTimeMinutes', 0, t, 'en')).toBe('Off');
    expect(settingValue('tubingDiameterMm', 15, t, 'en')).toBe('15 mm');
    expect(settingValue('mode', 'auto-cpap', t, 'en')).toBe('Auto CPAP');
    expect(settingValue('humidifierMode', 'heated-tube', t, 'en')).toBe('Heated tube');
    expect(settingValue('ezStart', true, t, 'en')).toBe('Yes');
    expect(settingValue('humidifierLevel', 4, t, 'en')).toBe('4');
  });
  it('uses the locale for numbers and falls back to the raw text for unknown values', () => {
    expect(settingValue('pressure', 9.5, t, 'ca')).toBe('9,5 cmH₂O');
    expect(settingValue('mode', 'weird', t, 'en')).toBe('weird');
  });
  it('labels known settings and falls back to the key', () => {
    expect(settingLabel('rampTimeMinutes', t)).toBe('Ramp time');
    expect(settingLabel('somethingNew', t)).toBe('somethingNew');
  });
});
