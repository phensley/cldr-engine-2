/**
 * Pack format v0 wire shapes (plans/prototype-plan.md §5).
 *
 * Chain: data → number[] → GVE16 → Uint8Array → X85 → string. Every piece
 * ships as an X85 string embedding GVE16-compressed u16 arrays; nothing is
 * reconstructed client-side except by the one-pass decoder.
 *
 * Open until S1-M5: the string-pool codec ('utf8' vs 'utf16') is measured
 * by the benchmark and the decision recorded in plans/pack-format-spec.md.
 */

/** String-pool byte stream codec. */
export type PoolCodec = 'utf8' | 'utf16';

/**
 * A decoded-on-demand string pool.
 *
 *   utf8:  `data` = UTF-8 bytes (bare X85), `offsets` = byte offsets (u16)
 *   utf16: `data` = UTF-16 code units (u16), `offsets` = code-unit offsets
 *
 * Offsets hold n+1 entries: start of each string plus an end sentinel equal
 * to the data length, so string i is data[offsets[i] .. offsets[i+1]).
 */
export interface PoolPack {
  codec: PoolCodec;
  /** X85(GVE16(u16[])) — n+1 offsets, end sentinel last. */
  offsets: string;
  /** utf8: X85(bytes); utf16: X85(GVE16(u16 code units)). */
  data: string;
}

/** One locale's pack: per-locale data only (territories, currencies, patterns). */
export interface LocalePack {
  /** Shared string pool: territory names + currency symbols. */
  pool: PoolPack;
  /** Territory code → pool index. */
  territories: {
    /** X85(GVE16(trie u16[])). */
    trie: string;
  };
  /**
   * Currency records. Trie value = index into `table`; table is interleaved
   * u16 pairs [poolIndex, fractionDigits] — decouples currency order from the
   * shared pool's index space (pool indices are dedup-assigned, not
   * currency-contiguous), so no padding is needed.
   */
  currencies: {
    /** X85(GVE16(trie u16[])). */
    trie: string;
    /** X85(GVE16(u16[])) — 2 × currency count. */
    table: string;
  };
  /** Exactly 3 entries in fixed order: [decimal, percent, currency]. */
  patterns: PoolPack;
}

/** Locale-independent pack (the shared numeric table). */
export interface NumericPack {
  /** Keys (ASCII codes) as a pool. */
  keys: PoolPack;
  /** X85(GVE16(u16[])) — parallel to keys. */
  values: string;
}

/** Complete compile output: one LocalePack per locale + one NumericPack. */
export interface CompiledDataset {
  locale: Record<string, LocalePack>;
  numeric: NumericPack;
}
