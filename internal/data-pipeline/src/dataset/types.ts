/**
 * Pipeline input contract (plans/real-cldr-compiler.md).
 *
 * Two producers:
 *   - `miniCldr` (dataset/index.ts) — hand-authored synthetic fixture,
 *     sized to exercise every codec/selection path; kept for offline
 *     tests (never requires network or .cache/).
 *   - `realCldr` (dataset/real.ts) — the real-data adapter: CLDR 48.2.1
 *     cldr-json slices (gitignored .cache, pinned fetch) → the same
 *     contract, with the decided scope: 11 locales, default numbering
 *     system only, coverage-gap fallbacks.
 *
 * The compile step consumes exactly this shape; everything the pack
 * format needs to represent originates here.
 */

/** Number-format patterns per feature (CLDR "pattern" strings, POSITIVE subpattern only). */
export interface NumberPatterns {
  decimal: string;
  percent: string;
  currency: string;
}

/** Per-locale number symbols for the DEFAULT numbering system (CLDR symbols-…). */
export interface NumberSymbols {
  /** Decimal separator, e.g. '.' (en), ',' (fr), '٫' (ar-arab). */
  decimal: string;
  /** Grouping separator, e.g. ',' (en), U+202F (fr), '٬' (ar-arab). */
  group: string;
  /** Minus sign (prefix), e.g. '-' (en). */
  minus: string;
  /** Percent sign, e.g. '%' (en), '%' + leading NBSP in the pattern for fr. */
  percent: string;
}

/** Currency data: display symbols + ISO 4217 fraction digits. */
export interface CurrencyEntry {
  /** e.g. "$" for USD/en, "US$" for USD/ar, "€" for EUR. */
  symbol: string;
  /** CLDR symbol-alt-narrow (falls back to symbol). */
  narrowSymbol: string;
  /** CLDR displayName (falls back to the code). */
  displayName: string;
  /** CLDR displayName-count-other (falls back to displayName). */
  displayNameOther: string;
  /** ISO 4217 fraction digits, e.g. 2 for USD, 0 for JPY, 3 for BHD. */
  fractionDigits: number;
}

/**
 * Locale-independent numeric table. For the real pipeline this is the
 * shared fixture table (no real standalone numeric table is shipped in
 * v1 — real fraction digits ride in the currency table; see
 * plans/real-cldr-compiler.md §2 decision 5).
 */
export interface NumericTable {
  keys: string[];
  values: number[];
}

/** Everything the pipeline knows about one locale. */
export interface LocaleData {
  /** Territory code → display name (trie → string pool, non-ASCII values). */
  territories: Record<string, string>;
  /** Language code → display name (trie → string pool). */
  languages: Record<string, string>;
  /** Script code → display name (trie → string pool). */
  scripts: Record<string, string>;
  /** Currency code → symbols + digits. */
  currencies: Record<string, CurrencyEntry>;
  /** Number-format patterns (positive subpatterns). */
  patterns: NumberPatterns;
  /** Number symbols for the default numbering system. */
  symbols: NumberSymbols;
}

/** The whole dataset: per-locale data + one shared numeric table. */
export interface Dataset {
  /** Keyed by BCP-47 tag ("en", "fr", "de", "es-419"). */
  locales: Record<string, LocaleData>;
  /** Shared, locale-independent table. */
  numeric: NumericTable;
}
