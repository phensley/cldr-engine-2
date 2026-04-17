/**
 * Pipeline input contract — the mini-cldr dataset (plans/prototype-plan.md §7).
 *
 * Hand-authored, synthetic data sized to exercise every codec and selection
 * path:
 *
 *   - territory display names  → trie + string pool (non-ASCII!)
 *   - currency symbols/digits  → trie (small values)
 *   - number format patterns   → string pool
 *   - shared numeric table     → GVE16-only (small + near-65535 values)
 *
 * The compile step (S1-M3) consumes exactly this shape; everything the pack
 * format needs to represent originates here.
 */

/** Number-format patterns per feature (CLDR "pattern" strings). */
export interface NumberPatterns {
  decimal: string;
  percent: string;
  currency: string;
}

/** Currency data: display symbol + fraction digits. */
export interface CurrencyEntry {
  /** e.g. "$" for USD, "€" for EUR. */
  symbol: string;
  /** ISO 4217 fraction digits, e.g. 2 for USD, 0 for JPY. */
  fractionDigits: number;
}

/**
 * Locale-independent numeric table (synthetic, e.g. zone-offset groups).
 * Keys are ASCII code lookups; values exercise the GVE16 range including
 * near-65535 entries.
 */
export interface NumericTable {
  keys: string[];
  values: number[];
}

/** Everything the pipeline knows about one locale. */
export interface LocaleData {
  /** Currency code → symbol/fraction digits (small trie values). */
  currencies: Record<string, CurrencyEntry>;
  /** Territory code → display name (trie → string pool, non-ASCII values). */
  territories: Record<string, string>;
  /** Number-format patterns (string pool). */
  patterns: NumberPatterns;
}

/** The whole dataset: per-locale data + one shared numeric table. */
export interface Dataset {
  /** Keyed by BCP-47 tag ("en", "fr", "de", "es-419"). */
  locales: Record<string, LocaleData>;
  /** Shared, locale-independent table. */
  numeric: NumericTable;
}
