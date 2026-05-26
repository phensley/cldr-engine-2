/**
 * Pack decoding — the inverse of the compile side (data-pipeline). The
 * runtime and the S2 generated client decode through this; tests on both
 * sides round-trip through it.
 *
 * v0.1: pools are array literals — no decode, no offsets; only the
 * numeric streams (tries, currency tables, numeric values) are decoded.
 */
import { decodeX85GVE16 } from '../binary/decode.js';
import { addKey, newTrie } from '../trie/build.js';
import { encodeTrie } from '../trie/encode.js';
import { scanTrie } from '../trie/scan.js';
import { searchTrie } from '../trie/search.js';
import type { LocalePack, NumericPack, VariantDelta } from './types.js';

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

// ---------------------------------------------------------------------------
// family-variant merge (generator layout selection, plans/real-cldr-
// compiler.md §3 row 2): base + sparse per-class overrides → a materialized
// DecodedLocalePack, built ONCE per variant at preload; lookups afterwards
// use plain arrays (no per-access indirection).

const decodeTrie = (stream: string): number[] => Array.from(decodeX85GVE16(stream));

/** Overlay delta entries onto base entries (delta wins), re-encode deterministically. */
const materializeTrie = (baseNodes: number[], deltaStream: string | undefined): number[] => {
  if (deltaStream === undefined) {
    return baseNodes;
  }
  const merged = new Map<string, number>();
  for (const e of scanTrie(baseNodes)) {
    merged.set(e.key, e.value);
  }
  for (const e of scanTrie(decodeTrie(deltaStream))) {
    merged.set(e.key, e.value);
  }
  const trie = newTrie();
  for (const [key, value] of [...merged.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    addKey(trie, key, value);
  }
  const nodes: number[] = [];
  encodeTrie(trie, nodes);
  return nodes;
};

/**
 * Materialize a variant's full decoded pack from its base and delta.
 * The caller caches the result (client.ts) — this runs once per variant.
 * Base must already be decoded (or be resolvable by the caller).
 */
export const mergeVariantDelta = (base: DecodedLocalePack, delta: VariantDelta): DecodedLocalePack => {
  const pool = delta.poolAdd === undefined ? base.pool : [...base.pool, ...delta.poolAdd];
  const currencyTable = base.currencyTable.slice();
  if (delta.currencySymbols !== undefined) {
    for (const e of scanTrie(decodeTrie(delta.currencySymbols))) {
      const pairIndex = lookupTrieValue(e.key, base.currencyTrie);
      if (pairIndex !== undefined) {
        currencyTable[pairIndex * 2] = e.value;
      }
    }
  }
  return {
    pool,
    territoryTrie: materializeTrie(base.territoryTrie, delta.territories),
    languageTrie: materializeTrie(base.languageTrie, delta.languages),
    scriptTrie: materializeTrie(base.scriptTrie, delta.scripts),
    currencyTrie: base.currencyTrie,
    currencyTable,
    patterns: delta.patterns ?? base.patterns,
    symbols: delta.symbols ?? base.symbols,
  };
};
