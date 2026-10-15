import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import pl from './locales/pl.json';

export const SUPPORTED_LANGUAGES = ['pl', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'pl';

/**
 * UI is Polish by default (FR-18). Keys are English; Polish plurals use i18next's
 * Intl.PluralRules suffixes (_one, _few, _many, _other).
 */
export function initI18n(language: Language = DEFAULT_LANGUAGE): typeof i18next {
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      resources: { pl: { translation: pl }, en: { translation: en } },
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      interpolation: { escapeValue: false }, // React escapes output
      initAsync: false,
    });
  } else if (i18next.language !== language) {
    void i18next.changeLanguage(language);
  }
  return i18next;
}
