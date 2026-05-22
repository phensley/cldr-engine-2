import type { CurrencyEntry } from './types.js';

/**
 * Currency symbols + fraction digits — per-locale, ~5-6 keys each.
 *
 * Exercises: trie with small values (indexes into a symbol pool).
 * Keys are ISO 4217 codes; fraction digits recover some of the
 * 0/2/3 diversity CLDR carries (JPY=0, KWD=3 not carried here).
 *
 * `cur` fills the contract-required display fields with nominal values
 * (narrowSymbol = symbol, names = code): the fixture never consumes
 * them — the REAL adapter (dataset/real.ts) is where those carry real
 * CLDR data.
 */
const cur = (symbol: string, fractionDigits: number): CurrencyEntry => ({
  symbol,
  narrowSymbol: symbol,
  displayName: symbol,
  displayNameOther: symbol,
  fractionDigits,
});

export const currencies: Record<string, Record<string, CurrencyEntry>> = {
  en: {
    USD: cur('$', 2),
    EUR: cur('€', 2),
    GBP: cur('£', 2),
    JPY: cur('¥', 0),
    CAD: cur('CA$', 2),
    CHF: cur('CHF', 2),
  },
  fr: {
    EUR: cur('€', 2),
    USD: cur('$US', 2),
    GBP: cur('£UK', 2),
    JPY: cur('¥', 0),
    CHF: cur('CHF', 2),
  },
  de: {
    EUR: cur('€', 2),
    USD: cur('$', 2),
    GBP: cur('£', 2),
    JPY: cur('¥', 0),
    CHF: cur('CHF', 2),
    SEK: cur('SEK', 2),
  },
  'es-419': {
    USD: cur('US$', 2),
    EUR: cur('€', 2),
    MXN: cur('MX$', 2),
    BRL: cur('R$', 2),
    ARS: cur('$', 2),
  },
};
