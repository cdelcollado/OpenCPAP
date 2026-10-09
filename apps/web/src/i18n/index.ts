import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ca from './locales/ca.json';
import es from './locales/es.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ca', label: 'Català' },
  { code: 'es', label: 'Español' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];
export const resources = { en: { translation: en }, ca: { translation: ca }, es: { translation: es } };

const STORAGE_KEY = 'opencpap.lang';

/** Picks the saved language, else the closest browser language, else English. */
export function detectLanguage(saved: string | null, navigatorLanguages: readonly string[]): LanguageCode {
  const codes = LANGUAGES.map((l) => l.code as string);
  if (saved && codes.includes(saved)) return saved as LanguageCode;
  for (const l of navigatorLanguages) {
    const base = l.toLowerCase().split('-')[0]!;
    if (codes.includes(base)) return base as LanguageCode;
  }
  return 'en';
}

const read = () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };

export function initI18n(lng = detectLanguage(read(), typeof navigator === 'undefined' ? [] : navigator.languages)) {
  void i18n.use(initReactI18next).init({ resources, lng, fallbackLng: 'en', interpolation: { escapeValue: false }, returnNull: false });
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
  return i18n;
}

export function setLanguage(code: LanguageCode) {
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage may be unavailable */ }
}

export default i18n;
