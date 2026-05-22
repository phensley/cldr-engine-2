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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { miniCldr } from './index.js';
import type { CurrencyEntry, Dataset, LocaleData, NumberPatterns, NumberSymbols } from './types.js';

export const CLDR_VERSION = '48.2.1';

/** The decided v1 locale set (plans/real-cldr-compiler.md §2.1). */
export const LOCALES = ['en', 'en-001', 'en-GB', 'en-AU', 'en-CA', 'fr', 'de', 'zh', 'ar', 'hi', 'ru'] as const;

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
  return { territories, languages, scripts, currencies, patterns, symbols };
};

/**
 * The real pipeline dataset (lazy-loaded on first call — reads the
 * cache ~57 JSON files). `numeric` is the shared fixture table until a
 * real standalone numeric stream exists (v1 decision).
 */
let cached: Dataset | undefined;

export const realCldr = (): Dataset => {
  if (cached !== undefined) {
    return cached;
  }
  requireCache();

  const fractions = (readJson('cldr-core/supplemental/currencyData.json') as any).supplemental.currencyData.fractions as Record<
    string,
    { _digits?: string }
  >;

  const locales: Record<string, LocaleData> = {};
  for (const locale of LOCALES) {
    const numbers = (readJson(`cldr-numbers-full/main/${locale}/numbers.json`) as any).main[locale].numbers as CldrNumbers;
    const currencyEntries = (readJson(`cldr-numbers-full/main/${locale}/currencies.json`) as any).main[locale].numbers.currencies as Record<
      string,
      CldrCurrencyEntry
    >;
    const ldn = (file: string) => (readJson(`cldr-localenames-full/main/${locale}/${file}`) as any).main[locale].localeDisplayNames;
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

  cached = { locales, numeric: miniCldr.numeric };
  return cached;
};

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
