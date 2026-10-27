import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readStorage, writeStorage } from '../ui/storage';
import { FALLBACK_LANGUAGE, LANGUAGES } from './languages';
import { fillPluralForms } from './plurals';

const STORAGE_KEY = 'stepsql.lang';

// Every locales/<code>.json file is bundled; only registered languages are offered.
const files = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*.json', { eager: true });
const resources = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, { translation: fillPluralForms(files[`./locales/${l.code}.json`]!.default, l.code) }]),
);

const supported = (code: string | null | undefined): string | undefined => {
  if (!code) return undefined;
  const base = code.toLowerCase().split('-')[0]!;
  return LANGUAGES.find((l) => l.code === base)?.code;
};

export function detectLanguage(): string {
  const stored = supported(readStorage(STORAGE_KEY));
  if (stored) return stored;
  const nav = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const candidate of nav) {
    const found = supported(candidate);
    if (found) return found;
  }
  return FALLBACK_LANGUAGE;
}

export function changeLanguage(code: string): void {
  writeStorage(STORAGE_KEY, code);
  void i18n.changeLanguage(code);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Keep <html lang>, the title and the meta description in the active language.
function syncDocument(lng: string): void {
  document.documentElement.lang = lng;
  document.title = `${i18n.t('app.title')} · ${i18n.t('app.tagline')}`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('app.subtitle'));
}

i18n.on('languageChanged', syncDocument);
syncDocument(i18n.language);

export default i18n;
