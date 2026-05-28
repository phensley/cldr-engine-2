/**
 * The mini-cldr dataset — hand-authored, sized to exercise every codec and
 * selection path (plans/prototype-plan.md §7). The compile step's offline
 * test fixture; the REAL pipeline input is the CLDR adapter (real.ts).
 *
 * Locales: en, fr, de, es-419 (the region-subtag exercises resolution).
 * Territory keys overlap across locales with per-locale additions; the
 * shared numeric table mixes small and near-65535 values.
 */
import { currencies } from './currencies.js';
import { languages, scripts } from './languages.js';
import { numeric } from './numeric.js';
import { patterns, symbols } from './patterns.js';
import { territories } from './territories.js';
import type { Dataset } from './types.js';

/** Fixture gregorian slice (nominal values — the REAL adapter carries CLDR data). */
const FIXTURE_CALENDAR = {
  firstDay: 1, minDays: 1, weekendStart: 6, weekendEnd: 0,
  monthsWide: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthsAbbr: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  daysWide: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  daysAbbr: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  daysNarrow: ['S','M','T','W','T','F','S'],
  erasWide: ['Before Christ','Anno Domini'],
  erasAbbr: ['BC','AD'],
  dayPeriodsAm: 'AM', dayPeriodsPm: 'PM',
  dateFormats: { full: 'EEEE, MMMM d, y', long: 'MMMM d, y', medium: 'MMM d, y', short: 'M/d/yy' },
  timeFormats: { full: 'h:mm:ss a zzzz', long: 'h:mm:ss a z', medium: 'h:mm:ss a', short: 'h:mm a' },
  hourFormat: '+HH:mm;-HH:mm',
  gmtFormat: 'GMT{0}',
};

const locales = ['en', 'fr', 'de', 'es-419'] as const;

export const miniCldr: Dataset = {
  locales: Object.fromEntries(
    locales.map((locale) => [
      locale,
      {
        currencies: currencies[locale],
        territories: territories[locale],
        languages: languages[locale],
        scripts: scripts[locale],
        patterns: patterns[locale],
        symbols: symbols[locale],
        // fixture plurals: en gets a minimal cardinal rule so the OFFLINE
        // compile round-trip exercises the plural stream; other locales are
        // other-only (the committed REAL packs carry the full rules)
        plural: locale === 'en' ? { cardinal: { one: 'n = 1', other: '' }, ordinal: {} } : { cardinal: {}, ordinal: {} },
        calendar: FIXTURE_CALENDAR,
      },
    ]),
  ),
  numeric,
};
