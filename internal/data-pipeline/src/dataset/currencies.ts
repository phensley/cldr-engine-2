import type { CurrencyEntry } from './types.js';

/**
 * Currency symbols + fraction digits — per-locale, ~5-6 keys each.
 *
 * Exercises: trie with small values (indexes into a symbol pool).
 * Keys are ISO 4217 codes; fraction digits recover some of the
 * 0/2/3 diversity CLDR carries (JPY=0, KWD=3 not carried here).
 */
export const currencies: Record<string, Record<string, CurrencyEntry>> = {
  en: {
    USD: { symbol: '$', fractionDigits: 2 },
    EUR: { symbol: '€', fractionDigits: 2 },
    GBP: { symbol: '£', fractionDigits: 2 },
    JPY: { symbol: '¥', fractionDigits: 0 },
    CAD: { symbol: 'CA$', fractionDigits: 2 },
    CHF: { symbol: 'CHF', fractionDigits: 2 },
  },
  fr: {
    EUR: { symbol: '€', fractionDigits: 2 },
    USD: { symbol: '$US', fractionDigits: 2 },
    GBP: { symbol: '£UK', fractionDigits: 2 },
    JPY: { symbol: '¥', fractionDigits: 0 },
    CHF: { symbol: 'CHF', fractionDigits: 2 },
  },
  de: {
    EUR: { symbol: '€', fractionDigits: 2 },
    USD: { symbol: '$', fractionDigits: 2 },
    GBP: { symbol: '£', fractionDigits: 2 },
    JPY: { symbol: '¥', fractionDigits: 0 },
    CHF: { symbol: 'CHF', fractionDigits: 2 },
    SEK: { symbol: 'SEK', fractionDigits: 2 },
  },
  'es-419': {
    USD: { symbol: 'US$', fractionDigits: 2 },
    EUR: { symbol: '€', fractionDigits: 2 },
    MXN: { symbol: 'MX$', fractionDigits: 2 },
    BRL: { symbol: 'R$', fractionDigits: 2 },
    ARS: { symbol: '$', fractionDigits: 2 },
  },
};

