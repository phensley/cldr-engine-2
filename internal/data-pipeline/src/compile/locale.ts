/**
 * Compile one locale's data into a LocalePack.
 *
 * v0.1: pools compile to sorted, deduped string ARRAYS (the re-baseline
 * transport decision — notes/pool-rebaseline.md); only trie/table numeric
 * streams go through the codec chain. Order of operations matters: pool
 * strings are collected, deduped and sorted first (pool indices are
 * assigned before any trie can reference them); keys are inserted sorted
 * for deterministic output. Trie values are always pool indices; currency
 * fraction digits ride in a separate interleaved table so currency order
 * never depends on pool layout.
 */
import { addKey, encodeTrie, newTrie } from '@cldr/internal-core';
import type { LocaleData } from '../dataset/types.js';
import type { LocalePack } from '../pack/types.js';
import { packU16 } from './pool.js';

const byKey = <T>(obj: Record<string, T>) => Object.keys(obj).sort().map((k) => [k, obj[k]] as const);

export const compileLocale = (data: LocaleData): LocalePack => {
  // Shared pool: territory names + currency symbols, sorted + deduped.
  const pool = [...new Set([...Object.values(data.territories), ...Object.values(data.currencies).map((c) => c.symbol)])].sort();
  const index = new Map(pool.map((s, i) => [s, i]));

  // Territories: code → pool index. (An empty key set encodes to an
  // empty u16 array — encodeTrie's leaf path needs a defined value, so
  // only run it when keys exist.)
  const territoryKeys = byKey(data.territories);
  const territoryNodes: number[] = [];
  if (territoryKeys.length > 0) {
    const territoryTrie = newTrie();
    for (const [code, name] of territoryKeys) {
      addKey(territoryTrie, code, index.get(name)!);
    }
    encodeTrie(territoryTrie, territoryNodes);
  }

  // Currencies: code → table index; table = [poolIndex, fractionDigits] pairs.
  const currencyTable: number[] = [];
  const currencyKeys = byKey(data.currencies);
  const currencyNodes: number[] = [];
  if (currencyKeys.length > 0) {
    const currencyTrie = newTrie();
    for (const [code, cur] of currencyKeys) {
      addKey(currencyTrie, code, currencyTable.length / 2);
      currencyTable.push(index.get(cur.symbol)!, cur.fractionDigits);
    }
    encodeTrie(currencyTrie, currencyNodes);
  }

  return {
    pool,
    territories: { trie: packU16(territoryNodes) },
    currencies: { trie: packU16(currencyNodes), table: packU16(currencyTable) },
    patterns: [data.patterns.decimal, data.patterns.percent, data.patterns.currency],
  };
};
