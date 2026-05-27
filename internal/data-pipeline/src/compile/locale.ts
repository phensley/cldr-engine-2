/**
 * Compile one locale's data into a LocalePack (wire v1).
 *
 * v0.1/v1: pools compile to sorted, deduped string ARRAYS (the
 * re-baseline transport decision — notes/pool-rebaseline.md); only
 * trie/table numeric streams go through the codec chain. Order of
 * operations matters: pool strings are collected, deduped and sorted
 * first (pool indices are assigned before any trie can reference them);
 * keys are inserted sorted for deterministic output. Trie values are
 * always pool indices; currency fraction digits ride in a separate
 * interleaved table so currency order never depends on pool layout.
 *
 * Wire v1 additions (plans/real-cldr-compiler.md §2.3): language/script
 * display-name tries and the locale's number symbols ([decimal, group,
 * minus, percent] — the runtime formats with these, not hard-coded
 * separators). Patterns ship as positive subpatterns only.
 */
import { addKey, encodeTrie, newTrie } from '@cldr/internal-core';
import type { LocaleData } from '../dataset/types.js';
import type { LocalePack } from '../pack/types.js';
import { encodePluralRules } from './plural.js';
import { packU16 } from './pool.js';

const byKey = <T>(obj: Record<string, T>) => Object.keys(obj).sort().map((k) => [k, obj[k]] as const);

/** code → pool-index trie, empty key sets compile to an empty stream. */
const compileTrie = (entries: Array<readonly [string, string]>, index: Map<string, number>): string => {
  const nodes: number[] = [];
  if (entries.length > 0) {
    const trie = newTrie();
    for (const [code, value] of entries) {
      addKey(trie, code, index.get(value)!);
    }
    encodeTrie(trie, nodes);
  }
  return packU16(nodes);
};

export const compileLocale = (data: LocaleData): LocalePack => {
  // Shared pool: display names + currency symbols, sorted + deduped.
  const pool = [
    ...new Set([
      ...Object.values(data.territories),
      ...Object.values(data.languages),
      ...Object.values(data.scripts),
      ...Object.values(data.currencies).map((c) => c.symbol),
    ]),
  ].sort();
  const index = new Map(pool.map((s, i) => [s, i]));

  // Currencies: code → PAIR index; table = [poolIndex, fractionDigits]
  // pairs (runtime resolves table[v * 2] — v0 convention, kept on wire).
  const currencyTable: number[] = [];
  const currencyKeys = byKey(data.currencies);
  for (const [, cur] of currencyKeys) {
    currencyTable.push(index.get(cur.symbol)!, cur.fractionDigits);
  }
  const currencyNodes: number[] = [];
  if (currencyKeys.length > 0) {
    const currencyTrie = newTrie();
    currencyKeys.forEach(([code], pairIndex) => addKey(currencyTrie, code, pairIndex));
    encodeTrie(currencyTrie, currencyNodes);
  }

  return {
    pool,
    territories: { trie: compileTrie(byKey(data.territories), index) },
    languages: { trie: compileTrie(byKey(data.languages), index) },
    scripts: { trie: compileTrie(byKey(data.scripts), index) },
    currencies: { trie: packU16(currencyNodes), table: packU16(currencyTable) },
    patterns: [data.patterns.decimal, data.patterns.percent, data.patterns.currency],
    symbols: [data.symbols.decimal, data.symbols.group, data.symbols.minus, data.symbols.percent],
    plural: {
      cardinal: encodePluralRules(data.plural.cardinal),
      ordinal: encodePluralRules(data.plural.ordinal),
    },
  };
};
