/**
 * Pack format v0.1 wire shapes (plans/pack-format-spec.md).
 *
 * Revision 2026-08-29 — pool transport change: string pools ship as plain
 * array literals (`string[]`), not X85/GVE16 streams. The re-baseline
 * (notes/pool-rebaseline.md) showed the codec chain loses to plain text
 * at real CLDR scale, raw and especially gzipped, and an array needs no
 * offset table (index = position) and no decode at all.
 *
 * Remaining chain: data → number[] → GVE16 → Uint8Array → X85 → string
 * for the NUMERIC streams only — tries, currency tables, numeric tables.
 * Everything ships as an X85 string embedding GVE16-compressed u16
 * arrays; nothing is reconstructed client-side except by the one-pass
 * decoder.
 */

/** One locale's pack: per-locale data only (territories, languages, scripts, currencies, patterns, symbols). */
export interface LocalePack {
  /** Shared pool: display names (territories/languages/scripts) + currency symbols, deduped + sorted. */
  pool: string[];
  /** Territory code → pool index. */
  territories: {
    /** X85(GVE16(trie u16[])). */
    trie: string;
  };
  /** Language code → pool index (wire v1). */
  languages: {
    /** X85(GVE16(trie u16[])). */
    trie: string;
  };
  /** Script code → pool index (wire v1). */
  scripts: {
    /** X85(GVE16(trie u16[])). */
    trie: string;
  };
  /**
   * Currency records. Trie value = index into `table`; table is interleaved
   * u16 pairs [poolIndex, fractionDigits] — decouples currency order from the
   * pool's index space (pool indices are dedup-assigned, not
   * currency-contiguous), so no padding is needed.
   */
  currencies: {
    /** X85(GVE16(trie u16[])). */
    trie: string;
    /** X85(GVE16(u16[])) — 2 × currency count. */
    table: string;
  };
  /** Exactly 3 entries in fixed order: [decimal, percent, currency] (positive subpatterns). */
  patterns: string[];
  /**
   * Exactly 4 entries in fixed order: [decimal, group, minus, percent]
   * (wire v1 — the locale's separators for the DEFAULT numbering system;
   * the runtime formatter renders with these, not hard-coded ','/'.').
   * Keep order in sync with compile/locale.ts + decode.ts.
   */
  symbols: string[];
  /**
   * Plural rules (wire v1, feature 'plural'): compiled CLDR conditions,
   * flat u16 streams (see data-pipeline compile/plural.ts for the
   * layout). Empty stream = no rules (other-only).
   */
  plural: {
    /** Flat rule stream (plain numbers — mod values can exceed u16, e.g. fr's 1_000_000). */
    cardinal: number[];
    ordinal: number[];
  };
  /**
   * Gregorian calendar slice (calendars-scoped-as-proof). Names are
   * FIXED-POSITION pool-index vectors (months 0..11 = Jan..Dec, days
   * 0..6 = sun..sat) — plain number[] literals, no tries (positions are
   * the schema; self-describing by construction).
   */
  calendar: {
    firstDay: number;
    minDays: number;
    weekendStart: number;
    weekendEnd: number;
    names: {
      monthsWide: number[];
      monthsAbbr: number[];
      daysWide: number[];
      daysAbbr: number[];
      daysNarrow: number[];
      erasWide: number[];
      erasAbbr: number[];
      am: number;
      pm: number;
    };
    /** Fixed order: [full, long, medium, short]. */
    dateFormats: string[];
    timeFormats: string[];
    hourFormat: string;
    gmtFormat: string;
  };
}

/** Locale-independent pack (the shared numeric table). */
export interface NumericPack {
  /** Keys (ASCII codes). */
  keys: string[];
  /** X85(GVE16(u16[])) — parallel to keys. */
  values: string;
  /**
   * Zone-offset table (the deferred unit+offset numeric header, design
   * doc §2.4): offsets in seconds at a fixed instant, unit-scaled
   * (900s, e.g. 50 = 45000s) with a bias — the measured rule. Platform
   * tzdb provenance (compiled at generate time); committed + frozen.
   */
  zones?: ZonesTable;
}

/**
 * Plural categories in wire catCode order (= CLDR evaluation order).
 * Shared by the compiler (encode codes), the decoder (map codes to
 * names) and the runtime (return values).
 */
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/**
 * The zone-offset companion (deferred unit+offset numeric header).
 */
export interface ZonesTable {
  keys: string[];
  /** Seconds per value unit (900 = quarter-hour). */
  unit: number;
  /** Additive bias applied to each stored value. */
  bias: number;
  /** X85(GVE16(u16[])) — (offsetSeconds / unit + bias) per key. */
  values: string;
}

/**
 * Family-variant delta (wire v1, generator layout selection — design
 * doc §3 row 2). A variant ships ONLY its differences from a base pack:
 * sparse per-class override tries and optional pool/pattern/symbol
 * overrides. The runtime materializes the merged pack once at preload.
 *
 * Trie streams use the same X85(GVE16(u16[])) codec as LocalePack;
 * values are indices into the MERGED pool (base pool, then poolAdd).
 */
export interface VariantDelta {
  /** Base locale tag this delta applies to (must resolve in the same pack set). */
  base: string;
  /** Extra pool strings appended after the base pool (rare — override values usually exist in base). */
  poolAdd?: string[];
  /** Sparse override tries: code → merged-pool index. */
  territories?: string;
  languages?: string;
  scripts?: string;
  /** Currency symbol overrides: code → merged-pool index (digits always come from base). */
  currencySymbols?: string;
  /** Optional full overrides (usually identical within a family). */
  patterns?: string[];
  symbols?: string[];
  /** Optional plural-rules overrides (rules are language-level; rare in a family). */
  plural?: {
    cardinal?: number[];
    ordinal?: number[];
  };
  /** Optional full calendar override (when any calendar field differs). */
  calendar?: LocalePack['calendar'];
}
