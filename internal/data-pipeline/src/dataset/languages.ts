/**
 * Language + script display names — per-locale, small fixture subsets.
 *
 * Exercises the same trie → pool path as territories with non-ASCII
 * values (de "Deutsch", ru "Русский", ar "اَلْعَرَبِيَّة").
 * The REAL adapter (dataset/real.ts) carries the full ~1000-entry CLDR
 * language sets; the fixture stays small for test speed.
 */
export const languages: Record<string, Record<string, string>> = {
  en: {
    en: 'English',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    ru: 'Russian',
    zh: 'Chinese',
    ja: 'Japanese',
    ar: 'Arabic',
    hi: 'Hindi',
  },
  fr: {
    en: 'anglais',
    fr: 'français',
    de: 'allemand',
    es: 'espagnol',
    ru: 'russe',
    zh: 'chinois',
    ja: 'japonais',
    ar: 'arabe',
    hi: 'hindi',
  },
  de: {
    en: 'Englisch',
    fr: 'Französisch',
    de: 'Deutsch',
    es: 'Spanisch',
    ru: 'Russisch',
    zh: 'Chinesisch',
    ja: 'Japanisch',
    ar: 'Arabisch',
    hi: 'Hindi',
  },
  'es-419': {
    en: 'inglés',
    fr: 'francés',
    de: 'alemán',
    es: 'español',
    ru: 'ruso',
    zh: 'chino',
    ja: 'japonés',
    ar: 'árabe',
    hi: 'hindi',
  },
};

export const scripts: Record<string, Record<string, string>> = {
  en: { Latn: 'Latin', Cyrl: 'Cyrillic', Arab: 'Arabic', Deva: 'Devanagari', Hans: 'Simplified Han' },
  fr: { Latn: 'latin', Cyrl: 'cyrillique', Arab: 'arabe', Deva: 'dévanagari', Hans: 'sinogrammes simplifiés' },
  de: { Latn: 'Lateinisch', Cyrl: 'Kyrillisch', Arab: 'Arabisch', Deva: 'Devanagari', Hans: 'Vereinfachtes Chinesisch' },
  'es-419': { Latn: 'latino', Cyrl: 'cirílico', Arab: 'árabe', Deva: 'devanagari', Hans: 'han simplificado' },
};
