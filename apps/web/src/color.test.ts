import { describe, expect, it } from 'vitest';
import { contrast, heatRamp, inkFor, luminance, mixHex, parseHex } from './color';

describe('color helpers', () => {
  it('parses hex', () => {
    expect(parseHex('#2a78d6')).toEqual([42, 120, 214]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
  });
  it('mixes linearly and clamps', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030');
  });
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
  });
  it('picks readable ink', () => {
    expect(inkFor('#ffffff')).toBe('#0b1217');
    expect(inkFor('#0d1418')).toBe('#ffffff');
    // always the better of the two inks (mid tones may have neither above 4.5:1, callers must check)
    for (const bg of ['#2a78d6', '#eb6834', '#4a3aa7', '#cde2fb', '#1b2830', '#808080']) {
      const best = Math.max(contrast(bg, '#ffffff'), contrast(bg, '#0b1217'));
      expect(contrast(bg, inkFor(bg))).toBeCloseTo(best, 5);
    }
    expect(contrast('#cde2fb', inkFor('#cde2fb'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('heatRamp', () => {
  const surfaces = { light: '#eef1f3', dark: '#1b2830' };
  const hues = { light: ['#2a78d6', '#eb6834', '#4a3aa7'], dark: ['#3987e5', '#d95926', '#9085e9'] } as const;
  for (const mode of ['light', 'dark'] as const) {
    for (const hue of hues[mode]) {
      it(`${mode} ${hue}: readable numbers in every step and a strictly ordered ramp`, () => {
        const ramp = heatRamp(surfaces[mode], hue);
        expect(ramp).toHaveLength(6);
        for (const r of ramp) expect(contrast(r.bg, r.ink)).toBeGreaterThanOrEqual(4.5);
        for (let i = 1; i < ramp.length; i++) expect(ramp[i]!.share).toBeGreaterThan(ramp[i - 1]!.share - 1e-9);
        expect(new Set(ramp.map((r) => r.bg)).size).toBeGreaterThanOrEqual(4); // steps stay distinguishable
      });
    }
  }
});
