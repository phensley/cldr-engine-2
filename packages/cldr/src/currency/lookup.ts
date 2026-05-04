/**
 * Shared currency-record lookup: trie → interleaved currency table →
 * (pool index, fraction digits). Every currency method resolves through
 * this so unknown codes fail identically, up front.
 */
import { lookupTrieValue } from '@cldr/internal-core';
import type { CurrencyState } from './state.js';

export interface CurrencyRecord {
  poolIndex: number;
  digits: number;
}

export const currencyRecord = (state: CurrencyState): CurrencyRecord => {
  const v = lookupTrieValue(state.code, state.pack.currencyTrie);
  if (v === undefined) {
    throw new Error(`currency code "${state.code}" is not in this locale's pack`);
  }
  return {
    poolIndex: state.pack.currencyTable[v * 2],
    digits: state.pack.currencyTable[v * 2 + 1],
  };
};
