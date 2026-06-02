/**
 * Real-CLDR adapter (plans/real-cldr-compiler.md Phase A).
 *
 * Reads the pinned, sha-verified cldr-json 48.2.1 slice from the
 * gitignored cache (`.cache/cldr/${CLDR_VERSION}`, produced by
 * `pnpm fetch:cldr`) and produces the canonical pipeline Dataset.
 *
 * Scope (decided 2026-08-30):
 *   - 11 locales: en, en-001, en-GB, en-AU, en-CA, fr, de, zh, ar, hi, ru;
 *   - DEFAULT numbering system only (numbers.json `defaultNumberingSystem`
 *     keys — note CLDR ≥45 changed ar/hi/… defaults to latn);
 *   - coverage-gap rule: missing currency symbol → code, missing
 *     displayName → code, missing fraction-digits entry → 2 (ISO 4217
 *     default), missing narrow symbol → symbol;
 *   - patterns store the POSITIVE subpattern only (CLDR "standard" is
 *     `positive;negative`); the runtime's v1 negative rule stays
 *     minus-prefix (per-locale negative forms are a follow-up);
 *   - plural rules come from cldr-core plurals.json (cardinal) +
 *     ordinals.json (ordinal), resolved through the parent chain
 *     (en-GB → en) and stripped of the '@integer/@decimal' SAMPLE lists
 *     (not part of the conditions); a locale absent from the tables is
 *     other-only;
 *   - the shared numeric table stays the mini-cldr fixture (no real
 *     standalone numeric table in v1 — real fraction digits ride in the
 *     currency table; plans/real-cldr-compiler.md §2.5).
 *
 * CLDR 48 files are fully resolved per locale (verified — en-GB carries
 * all 316 territory codes), so no inheritance engine; entries a locale
 * file lacks are gaps the fallback rule covers.
 *
 * Deterministic: key order follows the pinned JSON files.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { miniCldr } from './index.js';
import type { CalendarData, CurrencyEntry, Dataset, LocaleData, NumberPatterns, NumberSymbols, PluralCategory, PluralRulesData } from './types.js';

export const CLDR_VERSION = '48.2.1';

/** The committed regression set (packs are committed for these; full coverage regenerates at publish). */
export const LOCALES = ['en', 'en-001', 'en-GB', 'en-AU', 'en-CA', 'fr', 'de', 'zh', 'ar', 'hi', 'ru'] as const;

/**
 * BCP-47 subtag extraction for the SUPPLEMENTAL lookups (weekData is
 * territory-keyed; plurals exact-then-language). Scripts are 4-alpha,
 * regions 2-alpha or 3-digit; all other subtags are ignored.
 */
export const parseBcp47 = (tag: string): { lang: string; script?: string; region?: string } => {
  const parts = tag.split('-');
  let script: string | undefined;
  let region: string | undefined;
  for (const p of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(p) && script === undefined) {
      script = p;
    } else if ((/^[A-Za-z]{2}$/.test(p) || /^[0-9]{3}$/.test(p)) && region === undefined) {
      region = p;
    }
  }
  return { lang: parts[0], script, region };
};

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '.cache', 'cldr', CLDR_VERSION);

const cachePath = (p: string): string => join(CACHE, p);

const readJson = (p: string): any => JSON.parse(readFileSync(cachePath(p), 'utf8')) as unknown;

const requireCache = (): void => {
  if (!existsSync(cachePath('cldr-core/supplemental/numberingSystems.json'))) {
    throw new Error(`CLDR cache not found at ${CACHE} — run \`pnpm fetch:cldr\` first`);
  }
};

interface CldrNumbers {
  defaultNumberingSystem: string;
  [k: string]: unknown;
}
interface CldrSymbols {
  decimal: string;
  group: string;
  minusSign: string;
  percentSign: string;
}
interface CldrCurrencyEntry {
  symbol?: string;
  'symbol-alt-narrow'?: string;
  displayName?: string;
  'displayName-count-other'?: string;
}

/** Positive subpattern only: CLDR standard forms are `positive;negative`. */
const positive = (standard: string): string => standard.split(';')[0];

const buildLocale = (
  locale: string,
  numbers: CldrNumbers,
  currencyEntries: Record<string, CldrCurrencyEntry>,
  fractionDigits: Record<string, { _digits?: string }>,
  territories: Record<string, string>,
  languages: Record<string, string>,
  scripts: Record<string, string>,
): LocaleData => {
  const ns = numbers.defaultNumberingSystem;
  const sym = numbers[`symbols-numberSystem-${ns}`] as CldrSymbols | undefined;
  if (sym === undefined) {
    throw new Error(`real adapter: ${locale} has no symbols for its default numbering system '${ns}'`);
  }
  const formats = (kind: string): string => {
    const v = numbers[`${kind}-numberSystem-${ns}`] as { standard?: string } | undefined;
    if (v?.standard === undefined) {
      throw new Error(`real adapter: ${locale} has no ${kind} standard pattern for '${ns}'`);
    }
    return positive(v.standard);
  };
  const symbols: NumberSymbols = { decimal: sym.decimal, group: sym.group, minus: sym.minusSign, percent: sym.percentSign };
  const patterns: NumberPatterns = {
    decimal: formats('decimalFormats'),
    percent: formats('percentFormats'),
    currency: formats('currencyFormats'),
  };
  const currencies: Record<string, CurrencyEntry> = {};
  for (const [code, c] of Object.entries(currencyEntries)) {
    const digits = fractionDigits[code]?._digits;
    currencies[code] = {
      symbol: c.symbol ?? code,
      narrowSymbol: c['symbol-alt-narrow'] ?? c.symbol ?? code,
      displayName: c.displayName ?? code,
      displayNameOther: c['displayName-count-other'] ?? c.displayName ?? code,
      fractionDigits: digits === undefined ? 2 : Number(digits),
    };
  }

  const plural = resolvePluralRules(locale);
  const calendar = buildCalendar(locale);
  return { territories, languages, scripts, currencies, patterns, symbols, plural, calendar };
};

/** Weekday code → 0..6 (sun..sat), CLDR weekData uses 'sun'..'sat' keys. */
const DAY_CODE: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * Gregorian slice (calendars-scoped-as-proof): per-locale names/patterns
 * from ca-gregorian.json + hourFormat/gmtFormat from timeZoneNames.json
 * + territory-derived week rules from weekData.json (region from the
 * tag; '001' fallback). CLDR 48 kept firstDay/weekend in weekData, not
 * calendarData.
 */
const buildCalendar = (locale: string): CalendarData => {
  const greg = (readJson(`cldr-dates-full/main/${locale}/ca-gregorian.json`) as any).main[locale].dates.calendars.gregorian;
  const tz = (readJson(`cldr-dates-full/main/${locale}/timeZoneNames.json`) as any).main[locale].dates.timeZoneNames;
  const week = (readJson('cldr-core/supplemental/weekData.json') as any).supplemental.weekData;

  // region from the tag (proper BCP-47 — 'zh-Hant-TW' resolves TW, not 'Hant')
  const region = parseBcp47(locale).region ?? '001';
  const firstDay = DAY_CODE[week.firstDay[region] ?? week.firstDay['001']] ?? 1;
  const weekendStart = DAY_CODE[week.weekendStart[region] ?? week.weekendStart['001']] ?? 6;
  const weekendEnd = DAY_CODE[week.weekendEnd[region] ?? week.weekendEnd['001']] ?? 0;

  const names = (obj: Record<string, string>, from: number, to: number): string[] => {
    const out: string[] = [];
    for (let i = from; i <= to; i++) {
      const v = obj[String(i)];
      if (v === undefined) {
        throw new Error(`real adapter: ${locale} calendar missing position ${i}`);
      }
      out.push(v);
    }
    return out;
  };
  const dayNames = (obj: Record<string, string>): string[] =>
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((k) => {
      const v = obj[k];
      if (v === undefined) {
        throw new Error(`real adapter: ${locale} calendar missing day '${k}'`);
      }
      return v;
    });
  const eras = (obj: Record<string, string>): string[] => [obj['0'], obj['1']];
  // CLDR 48: format entries may carry { _value, _numbers } (alternative
  // numbering annotations, e.g. roman-numeral months) — take the pattern
  const pattern = (v: unknown): string => (typeof v === 'string' ? v : (v as { _value?: string } | undefined)?._value ?? '');

  return {
    firstDay,
    minDays: Number(week.minDays[region] ?? week.minDays['001'] ?? 1),
    weekendStart,
    weekendEnd,
    monthsWide: names(greg.months.format.wide, 1, 12),
    monthsAbbr: names(greg.months.format.abbreviated, 1, 12),
    daysWide: dayNames(greg.days.format.wide),
    daysAbbr: dayNames(greg.days.format.abbreviated),
    daysNarrow: dayNames(greg.days.format.narrow),
    erasWide: eras(greg.eras.eraNames),
    erasAbbr: eras(greg.eras.eraAbbr),
    dayPeriodsAm: greg.dayPeriods.format.wide.am,
    dayPeriodsPm: greg.dayPeriods.format.wide.pm,
    dateFormats: { full: pattern(greg.dateFormats.full), long: pattern(greg.dateFormats.long), medium: pattern(greg.dateFormats.medium), short: pattern(greg.dateFormats.short) },
    timeFormats: { full: pattern(greg.timeFormats.full), long: pattern(greg.timeFormats.long), medium: pattern(greg.timeFormats.medium), short: pattern(greg.timeFormats.short) },
    hourFormat: tz.hourFormat,
    gmtFormat: tz.gmtFormat,
  };
};

/**
 * CLDR plural tables are keyed by LANGUAGE (en-001/en-GB inherit en;
 * locales without entries are other-only). Sample lists after '@' are
 * not part of the conditions and are stripped.
 */
interface PluralTable {
  [tag: string]: Record<string, string> | undefined;
}

const conditionOnly = (rule: string): string => rule.split('@')[0].trim();

const resolvePluralRules = (locale: string): PluralRulesData => {
  const lang = locale.split('-')[0];
  const read = (file: string): PluralTable =>
    (readJson(file) as any).supplemental[file === 'cldr-core/supplemental/plurals.json' ? 'plurals-type-cardinal' : 'plurals-type-ordinal'] as PluralTable;
  const pick = (file: string): Partial<Record<PluralCategory, string>> => {
    const table = read(file);
    const raw = table[locale] ?? table[lang];
    if (raw === undefined) {
      return {};
    }
    const out: Partial<Record<PluralCategory, string>> = {};
    for (const [key, rule] of Object.entries(raw)) {
      const cat = key.replace(/^pluralRule-count-/, '') as PluralCategory;
      out[cat] = conditionOnly(rule);
    }
    return out;
  };
  return { cardinal: pick('cldr-core/supplemental/plurals.json'), ordinal: pick('cldr-core/supplemental/ordinals.json') };
};

/**
 * The real pipeline dataset (lazy-loaded; cache reads only).
 * `full` = the entire cached locale universe (~766; some classes absent
 * for low-coverage locales — those encode as empty name sets). Default =
 * the committed regression set (LOCALES).
 * `numeric` is the shared fixture table until a real standalone numeric
 * stream exists (v1 decision).
 */
const cached11: { d: Dataset | undefined } = { d: undefined };
const cachedAll: { d: Dataset | undefined } = { d: undefined };

export interface RealOptions {
  full?: boolean;
}

export const realCldr = (opts: RealOptions = {}): Dataset => {
  const box = opts.full ? cachedAll : cached11;
  if (box.d !== undefined) {
    return box.d;
  }
  requireCache();

  const fractions = (readJson('cldr-core/supplemental/currencyData.json') as any).supplemental.currencyData.fractions as Record<
    string,
    { _digits?: string }
  >;

  const tags = opts.full ? cachedLocales() : [...LOCALES];
  const locales: Record<string, LocaleData> = {};
  for (const locale of tags) {
    const numbers = (readJson(`cldr-numbers-full/main/${locale}/numbers.json`) as any).main[locale].numbers as CldrNumbers;
    const currencyEntries = (readJson(`cldr-numbers-full/main/${locale}/currencies.json`) as any).main[locale].numbers.currencies as Record<
      string,
      CldrCurrencyEntry
    >;
    const ldn = (file: string) => {
      try {
        const main = (readJson(`cldr-localenames-full/main/${locale}/${file}`) as any).main[locale];
        return main?.localeDisplayNames ?? {};
      } catch {
        return {}; // low-coverage locale: class absent
      }
    };
    locales[locale] = buildLocale(
      locale,
      numbers,
      currencyEntries,
      fractions,
      ldn('territories.json').territories ?? {},
      ldn('languages.json').languages ?? {},
      ldn('scripts.json').scripts ?? {},
    );
  }

  box.d = { locales, numeric: miniCldr.numeric };
  return box.d;
};

/** Locale codes present in the cache (all fetched locale dirs, root excluded). */
const cachedLocales = (): string[] =>
  readdirSync(join(CACHE, 'cldr-numbers-full', 'main'))
    .filter((d) => d !== 'root')
    .sort();

/** Counts per locale (diagnostics/benchmarks; cheap — derived from the cached object). */
export const realCldrStats = (): Record<string, { territories: number; languages: number; scripts: number; currencies: number }> => {
  const d = realCldr();
  return Object.fromEntries(
    Object.entries(d.locales).map(([tag, l]) => [
      tag,
      {
        territories: Object.keys(l.territories).length,
        languages: Object.keys(l.languages).length,
        scripts: Object.keys(l.scripts).length,
        currencies: Object.keys(l.currencies).length,
      },
    ]),
  );
};
