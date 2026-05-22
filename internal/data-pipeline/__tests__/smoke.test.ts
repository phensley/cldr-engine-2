/**
 * Scaffold smoke tests: prove the workspace wiring the pipeline is built on.
 *
 * 1. `@cldr/internal-core` resolves through its exports map (the contract
 *    the compile step will consume) and the codec chain round-trips.
 * 2. The dataset input contract accepts hand-authored data shape-wise.
 */
import { addKey, decodeX85GVE16, encodeGVE16, encodeTrie, encodeX85, newTrie, searchTrie } from '@cldr/internal-core';
import type { Dataset } from '../src/index.js';

describe('workspace wiring', () => {
  test('core codecs round-trip through the package exports map', () => {
    const u16 = new Uint16Array([1, 2, 65535, 0]);
    const round = decodeX85GVE16(encodeX85(encodeGVE16(u16)));
    expect(Array.from(round)).toEqual([1, 2, 65535, 0]);
  });

  test('trie encode/search round-trips through the package surface', () => {
    const t = newTrie();
    addKey(t, 'GB', 0);
    addKey(t, 'US', 1);
    const nodes: number[] = [];
    encodeTrie(t, nodes);
    // exact and case-insensitive lookups resolve to their assigned values
    expect(searchTrie('GB', nodes)?.value).toBe(0);
    expect(searchTrie('us', nodes)?.value).toBe(1);
  });

  test('dataset input contract accepts a hand-authored sample', () => {
    const sample = {
      locales: {
        en: {
          currencies: { USD: { symbol: '$', narrowSymbol: '$', displayName: 'US Dollar', displayNameOther: 'US dollars', fractionDigits: 2 } },
          territories: { GB: 'United Kingdom', ES: 'Spain' },
          languages: { fr: 'French' },
          scripts: { Latn: 'Latin' },
          patterns: { decimal: '#,##0.###', percent: '#,##0%', currency: '¤#,##0.00' },
          symbols: { decimal: '.', group: ',', minus: '-', percent: '%' },
        },
      },
      numeric: { keys: ['UTC+0'], values: [0, 65535] },
    } satisfies Dataset;
    expect(sample.locales.en.territories.ES).toBe('Spain');
    expect(sample.numeric.values).toContain(65535);
  });
});
