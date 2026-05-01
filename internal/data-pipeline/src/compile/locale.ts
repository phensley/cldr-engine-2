/**
 * Compile one locale's data into a LocalePack.
 *
 * Order of operations matters: pool strings are collected, deduped and
 * sorted first (pool indices are assigned before any trie can reference
 * them); keys are inserted sorted for deterministic output. Trie values
 * are always pool indices; currency fraction digits ride in a separate
 * interleaved table so currency order never depends on pool layout.
 */
import { addKey, encodeTrie, newTrie } from '@cldr/internal-core';
import type { LocaleData } from '../dataset/types.js';
import type { LocalePack, PoolCodec } from '../pack/types.js';
import { encodePool, packU16 } from './pool.js';

const byKey = <T>(obj: Record<string, T>) => Object.keys(obj).sort().map((k) => [k, obj[k]] as const);

export const compileLocale = (data: LocaleData, codec: PoolCodec): LocalePack => {
  // Shared pool: territory names + currency symbols, sorted + deduped.
  const poolStrings = [...new Set([...Object.values(data.territories), ...Object.values(data.currencies).map((c) => c.symbol)])].sort();
  const pool = encodePool(poolStrings, codec);
  const index = new Map(poolStrings.map((s, i) => [s, i]));

  // Territories: code → pool index.
  const territoryTrie = newTrie();
  for (const [code, name] of byKey(data.territories)) {
    addKey(territoryTrie, code, index.get(name)!);
  }
  const territoryNodes: number[] = [];
  encodeTrie(territoryTrie, territoryNodes);

  // Currencies: code → table index; table = [poolIndex, fractionDigits] pairs.
  const currencyTable: number[] = [];
  const currencyTrie = newTrie();
  for (const [code, cur] of byKey(data.currencies)) {
    addKey(currencyTrie, code, currencyTable.length / 2);
    currencyTable.push(index.get(cur.symbol)!, cur.fractionDigits);
  }
  const currencyNodes: number[] = [];
  encodeTrie(currencyTrie, currencyNodes);

  // Patterns: fixed-order pool [decimal, percent, currency].
  const patterns = encodePool([data.patterns.decimal, data.patterns.percent, data.patterns.currency], codec);

  return {
    pool,
    territories: { trie: packU16(territoryNodes) },
    currencies: { trie: packU16(currencyNodes), table: packU16(currencyTable) },
    patterns,
  };
};
