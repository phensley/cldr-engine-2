/**
 * Territory display names — per-locale, ~13-14 keys each.
 *
 * Exercises: trie (ASCII codes) + string pool with non-ASCII values
 * (accented chars, U+2019), shared subset across locales plus
 * locale-specific keys.
 *
 * Real CLDR-flavored names; keys are ISO 3166-1 alpha-2 codes.
 */
export const territories: Record<string, Record<string, string>> = {
  en: {
    GB: 'United Kingdom',
    FR: 'France',
    DE: 'Germany',
    ES: 'Spain',
    US: 'United States',
    JP: 'Japan',
    CN: 'China',
    IT: 'Italy',
    RU: 'Russia',
    BR: 'Brazil',
    IN: 'India',
    CA: 'Canada',
    AU: 'Australia',
    CI: 'Côte d’Ivoire',
  },
  fr: {
    GB: 'Royaume-Uni',
    FR: 'France',
    DE: 'Allemagne',
    ES: 'Espagne',
    US: 'États-Unis',
    JP: 'Japon',
    CN: 'Chine',
    IT: 'Italie',
    RU: 'Russie',
    BR: 'Brésil',
    IN: 'Inde',
    CH: 'Suisse',
    MA: 'Maroc',
  },
  de: {
    GB: 'Vereinigtes Königreich',
    FR: 'Frankreich',
    DE: 'Deutschland',
    ES: 'Spanien',
    US: 'Vereinigte Staaten',
    JP: 'Japan',
    CN: 'China',
    IT: 'Italien',
    RU: 'Russland',
    BR: 'Brasilien',
    IN: 'Indien',
    AT: 'Österreich',
    CH: 'Schweiz',
    NL: 'Niederlande',
  },
  'es-419': {
    GB: 'Reino Unido',
    FR: 'Francia',
    DE: 'Alemania',
    ES: 'España',
    US: 'Estados Unidos',
    JP: 'Japón',
    CN: 'China',
    IT: 'Italia',
    RU: 'Rusia',
    BR: 'Brasil',
    IN: 'India',
    MX: 'México',
    AR: 'Argentina',
    CL: 'Chile',
    CO: 'Colombia',
  },
};

