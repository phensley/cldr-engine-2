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
}

/** Locale-independent pack (the shared numeric table). */
export interface NumericPack {
  /** Keys (ASCII codes). */
  keys: string[];
  /** X85(GVE16(u16[])) — parallel to keys. */
  values: string;
}
