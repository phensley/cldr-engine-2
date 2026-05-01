import type { NumberPatterns } from './types.js';

/**
 * Number format patterns — per-locale, 3 per locale.
 *
 * Exercises: string pool (patterns ship whole; symbols like NBSP are
 * non-ASCII). "\u00a0" is the non-breaking space CLDR uses in
 * fr/de number formats.
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

