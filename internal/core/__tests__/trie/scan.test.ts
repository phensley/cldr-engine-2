/**
 * Trie scanning (scan.ts): enumeration mirrors the encoder — scan of an
 * encoded trie reproduces the inserted (key, value) entries; scanning +
 * re-encoding is identity (used by the family-delta merge).
 */
import { addKey, newTrie } from '../../src/trie/build.js';
import { encodeTrie } from '../../src/trie/encode.js';
import { scanTrie } from '../../src/trie/scan.js';
import { searchTrie } from '../../src/trie/search.js';

const build = (entries: Array<[string, number]>): number[] => {
  const trie = newTrie();
  for (const [k, v] of [...entries].sort(([a], [b]) => (a < b ? -1 : 1))) {
    addKey(trie, k, v);
  }
  const nodes: number[] = [];
  encodeTrie(trie, nodes);
  return nodes;
};

describe('scanTrie', () => {
  test('enumerates every inserted entry, key-ordered', () => {
    const entries: Array<[string, number]> = [
      ['US', 0],
      ['GB', 1],
      ['DE', 2],
      ['FR', 3],
      ['BR', 4],
      ['MX', 5],
    ];
    const nodes = build(entries);
    expect(scanTrie(nodes)).toEqual([...entries].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => ({ key, value })));
  });

  test('branching prefixes and shared suffixes survive a scan + re-encode round-trip', () => {
    const entries: Array<[string, number]> = [
      ['en', 1],
      ['en-GB', 2],
      ['en-AU', 3],
      ['es', 4],
      ['es-419', 5],
      ['zh', 6],
    ];
    const once = build(entries);
    const entries2 = scanTrie(once).map((e) => [e.key, e.value] as [string, number]);
    const twice = build(entries2);
    expect(once).toEqual(twice);
    expect(searchTrie('en-AU', twice)?.value).toBe(3);
    expect(searchTrie('zh', twice)?.value).toBe(6);
  });

  test('empty trie scans to nothing', () => {
    expect(scanTrie([])).toEqual([]);
  });
});
