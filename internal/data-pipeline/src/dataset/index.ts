/**
 * The mini-cldr dataset — hand-authored, sized to exercise every codec and
 * selection path (plans/prototype-plan.md §7). The compile step's input.
 *
 * Locales: en, fr, de, es-419 (the region-subtag exercises resolution).
 * Territory keys overlap across locales with per-locale additions; the
 * shared numeric table mixes small and near-65535 values.
 */
import { currencies } from './currencies.js';
import { numeric } from './numeric.js';
import { patterns } from './patterns.js';
import { territories } from './territories.js';
import type { Dataset } from './types.js';

const locales = ['en', 'fr', 'de', 'es-419'] as const;

export const miniCldr: Dataset = {
  locales: Object.fromEntries(
    locales.map((locale) => [locale, { currencies: currencies[locale], territories: territories[locale], patterns: patterns[locale] }]),
  ),
  numeric,
};
