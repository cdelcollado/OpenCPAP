import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ca from './locales/ca.json';
import es from './locales/es.json';
import { detectLanguage } from './index';

const keys = (o: unknown, p = ''): string[] =>
  typeof o === 'object' && o !== null ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p];
const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
const flat = (o: unknown): Record<string, string> => Object.fromEntries(keys(o).map((k) => [k, k.split('.').reduce<any>((a, s) => a[s], o)]));

describe('locales', () => {
  const base = keys(en).sort();
  it.each([['ca', ca], ['es', es]])('%s has exactly the same keys as English', (_n, loc) => {
    expect(keys(loc).sort()).toEqual(base);
  });
  it.each([['ca', ca], ['es', es]])('%s uses the same interpolation placeholders', (_n, loc) => {
    const a = flat(en), b = flat(loc);
    for (const k of base) expect(placeholders(b[k]!), k).toEqual(placeholders(a[k]!));
  });
  it('has no empty strings', () => {
    for (const loc of [en, ca, es]) for (const v of Object.values(flat(loc))) expect(v.trim()).not.toBe('');
  });
});

describe('detectLanguage', () => {
  it('prefers the saved language', () => expect(detectLanguage('ca', ['es-ES'])).toBe('ca'));
  it('falls back to the browser language', () => expect(detectLanguage(null, ['fr-FR', 'es-AR'])).toBe('es'));
  it('ignores unsupported saved values and defaults to English', () => expect(detectLanguage('xx', ['fr'])).toBe('en'));
});
