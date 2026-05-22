import type { NumberPatterns, NumberSymbols } from './types.js';

/**
 * Number format patterns + symbols — per-locale.
 *
 * Exercises: string pool (patterns ship whole; symbols like NBSP are
 * non-ASCII). "\u00a0" is the non-breaking space CLDR uses in fr/de
 * number formats. Fixture symbols are chosen to render EXACTLY the
 * historical fixture outputs (fr groups with ',', not the real
 * U+202F) — the real adapter carries real CLDR symbols.
 */
export const patterns: Record<string, NumberPatterns> = {
  en: {
    decimal: '#,##0.###',
    percent: '#,##0%',
    currency: '¤#,##0.00',
  },
  fr: {
    decimal: '#,##0.###',
    percent: '#,##0\u00a0%',
    currency: '#,##0.00\u00a0¤',
  },
  de: {
    decimal: '#,##0.###',
    percent: '#,##0\u00a0%',
    currency: '#,##0.00\u00a0¤',
  },
  'es-419': {
    decimal: '#,##0.###',
    percent: '#,##0\u00a0%',
    currency: '¤#,##0.00',
  },
};

export const symbols: Record<string, NumberSymbols> = {
  en: { decimal: '.', group: ',', minus: '-', percent: '%' },
  fr: { decimal: ',', group: ',', minus: '-', percent: '%' },
  de: { decimal: ',', group: '.', minus: '-', percent: '%' },
  'es-419': { decimal: '.', group: ',', minus: '-', percent: '%' },
};
