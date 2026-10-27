// Available interface languages. To add one: create `locales/<code>.json`
// (copy en.json and translate it) and add an entry here.

export interface Language {
  code: string;
  /** Name of the language written in that language. */
  nativeName: string;
}

// English is the main language: listed first and used when the browser asks for none of these.
export const LANGUAGES: Language[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'es', nativeName: 'Español' },
];

export const FALLBACK_LANGUAGE = 'en';
