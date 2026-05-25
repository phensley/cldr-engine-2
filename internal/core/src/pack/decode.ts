/**
 * Pack decoding — the inverse of the compile side (data-pipeline). The
 * runtime and the S2 generated client decode through this; tests on both
 * sides round-trip through it.
 *
 * v0.1: pools are array literals — no decode, no offsets; only the
 * numeric streams (tries, currency tables, numeric values) are decoded.
 */
import { decodeX85GVE16 } from '../binary/decode.js';
import { searchTrie } from '../trie/search.js';
import type { LocalePack, NumericPack } from './types.js';

/** Decoded wire structures, ready for lookups. */
export interface DecodedLocalePack {
  /** Dedup-assigned, sorted string pool (display names + currency symbols). */
  pool: string[];
  territoryTrie: number[];
  languageTrie: number[];
  scriptTrie: number[];
  currencyTrie: number[];
  /** Interleaved [poolIndex, fractionDigits] pairs. */
  currencyTable: number[];
  /** Fixed order: [decimal, percent, currency]. */
  patterns: string[];
  /** Fixed order: [decimal, group, minus, percent]. */
  symbols: string[];
}

export const decodeLocalePack = (pack: LocalePack): DecodedLocalePack => ({
  pool: pack.pool,
  territoryTrie: Array.from(decodeX85GVE16(pack.territories.trie)),
  languageTrie: Array.from(decodeX85GVE16(pack.languages.trie)),
  scriptTrie: Array.from(decodeX85GVE16(pack.scripts.trie)),
  currencyTrie: Array.from(decodeX85GVE16(pack.currencies.trie)),
  currencyTable: Array.from(decodeX85GVE16(pack.currencies.table)),
  patterns: pack.patterns,
  symbols: pack.symbols,
});

export interface DecodedNumericPack {
  keys: string[];
  values: number[];
}

export const decodeNumericPack = (pack: NumericPack): DecodedNumericPack => ({
  keys: pack.keys,
  values: Array.from(decodeX85GVE16(pack.values)),
});

/** Convenience: trie value for a key, or undefined. */
export const lookupTrieValue = (key: string, trie: number[]): number | undefined => searchTrie(key, trie)?.value;
