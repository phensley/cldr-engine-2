/**
 * Pack decoding — the inverse of src/compile. Used by the round-trip/
 * freshness tests today; the S2 runtime vendors the same shape.
 */
import { decodeX85, decodeX85GVE16, searchTrie } from '@cldr/internal-core';
import type { LocalePack, NumericPack, PoolPack } from './types.js';

const utf8 = new TextDecoder('utf-8');

/** Decode a pool into its strings. */
export const decodePool = (pack: PoolPack): string[] => {
  const offsets = Array.from(decodeX85GVE16(pack.offsets));
  const out: string[] = [];
  if (pack.codec === 'utf16') {
    // Chunk the spread so a full 65535-unit segment stays under the call
    // arg limit (String.fromCharCode caps out near 64k args).
    const data = Array.from(decodeX85GVE16(pack.data));
    for (let i = 0; i < offsets.length - 1; i++) {
      const slice = data.slice(offsets[i], offsets[i + 1]);
      let s = '';
      for (let j = 0; j < slice.length; j += 8192) {
        s += String.fromCharCode(...slice.slice(j, j + 8192));
      }
      out.push(s);
    }
    return out;
  }
  const data = decodeX85(pack.data);
  const dlen = offsets[offsets.length - 1]; // true data length; decodeX85 restores pad
  for (let i = 0; i < offsets.length - 1; i++) {
    out.push(utf8.decode(data.subarray(offsets[i], Math.min(offsets[i + 1], dlen))));
  }
  return out;
};

/** Decoded wire structures, ready for lookups. */
export interface DecodedLocalePack {
  /** Dedup-assigned, sorted string pool (territory names + currency symbols). */
  pool: string[];
  territoryTrie: number[];
  currencyTrie: number[];
  /** Interleaved [poolIndex, fractionDigits] pairs. */
  currencyTable: number[];
  /** Fixed order: [decimal, percent, currency]. */
  patterns: string[];
}

export const decodeLocalePack = (pack: LocalePack): DecodedLocalePack => ({
  pool: decodePool(pack.pool),
  territoryTrie: Array.from(decodeX85GVE16(pack.territories.trie)),
  currencyTrie: Array.from(decodeX85GVE16(pack.currencies.trie)),
  currencyTable: Array.from(decodeX85GVE16(pack.currencies.table)),
  patterns: decodePool(pack.patterns),
});

export interface DecodedNumericPack {
  keys: string[];
  values: number[];
}

export const decodeNumericPack = (pack: NumericPack): DecodedNumericPack => ({
  keys: decodePool(pack.keys),
  values: Array.from(decodeX85GVE16(pack.values)),
});

/** Convenience: trie value for a key, or undefined. */
export const lookupTrieValue = (key: string, trie: number[]): number | undefined => searchTrie(key, trie)?.value;
