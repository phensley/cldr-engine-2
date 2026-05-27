/**
 * Family-delta parity (design doc §3 row 2): for every family variant
 * shipped by generate-packs, the merge of (decoded base, delta) must
 * equal the variant's FULL literal pack — value-level, across every
 * field class. This is the correctness contract of the layout selection:
 * base+delta is a byte-optimized representation of the same data.
 *
 * Cache-gated (needs the real dataset + generated deltas; without the
 * cache the committed artifacts are all still present, but the deltas'
 * source values need the adapter — skip).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVariantDelta, pickFamilyBase, localeDistance } from '../src/compile/delta.js';
import { decodeLocalePack, lookupTrieValue, mergeVariantDelta, scanTrie } from '@cldr/internal-core';
import { CLDR_VERSION, LOCALES, realCldr } from '../src/dataset/real.js';
import { compileDataset } from '../src/compile/index.js';
import type { VariantDelta } from '@cldr/internal-core';
import { en as enDelta } from '../generated/delta/en.js';
import { enGB as enGBDelta } from '../generated/delta/enGB.js';
import { enAU as enAUDelta } from '../generated/delta/enAU.js';
import { enCA as enCADelta } from '../generated/delta/enCA.js';
import { packs as committedPacks } from '../generated/index.js';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.cache', 'cldr', CLDR_VERSION);
const hasCache = existsSync(cacheDir);

describe.skipIf(!hasCache)('family base + delta (layout selection)', () => {
  const dataset = realCldr();
  const compiled = compileDataset(dataset);

  const families = new Map<string, string[]>();
  for (const tag of LOCALES as readonly string[]) {
    const lang = tag.split('-')[0];
    families.set(lang, [...(families.get(lang) ?? []), tag]);
  }

  test('the en family resolves to the measured-optimal base en-001', () => {
    const members = families.get('en')!;
    expect(members.length).toBeGreaterThanOrEqual(2);
    expect(pickFamilyBase(members, dataset.locales)).toBe('en-001');
    // en-001 minimizes pairwise distance
    const sums = members.map((a) => ({ tag: a, sum: members.reduce((s, b) => s + (a === b ? 0 : localeDistance(dataset.locales[a], dataset.locales[b])), 0) }));
    const min = Math.min(...sums.map((s) => s.sum));
    expect(sums.filter((s) => s.sum === min).map((s) => s.tag)).toContain('en-001');
  });

  const full = (tag: string) => decodeLocalePack(compiled.locale[tag]);

  const assertMergedEqualsFull = (tag: string, baseTag: string): void => {
    const delta = buildVariantDelta(dataset.locales[baseTag], dataset.locales[tag], compiled.locale[baseTag].pool) as VariantDelta;
    delta.base = baseTag;
    const merged = mergeVariantDelta(full(baseTag), delta);
    const expected = full(tag);

    const valueMap = (trie: number[], pool: string[]) => new Map(scanTrie(trie).map((e) => [e.key, pool[e.value]]));
    expect(valueMap(merged.territoryTrie, merged.pool)).toEqual(valueMap(expected.territoryTrie, expected.pool));
    expect(valueMap(merged.languageTrie, merged.pool)).toEqual(valueMap(expected.languageTrie, expected.pool));
    expect(valueMap(merged.scriptTrie, merged.pool)).toEqual(valueMap(expected.scriptTrie, expected.pool));
    expect(merged.patterns).toEqual(expected.patterns);
    expect(merged.symbols).toEqual(expected.symbols);
    expect(JSON.stringify(merged.plural), `${tag}: plural rules`).toEqual(JSON.stringify(expected.plural));

    // currency records: every code in the full pack resolves identically
    for (const e of scanTrie(expected.currencyTrie)) {
      const mv = lookupTrieValue(e.key, merged.currencyTrie);
      expect(mv, `currency ${e.key} present`).toBeDefined();
      expect(merged.pool[merged.currencyTable[mv! * 2]], `currency ${e.key} symbol`).toBe(expected.pool[expected.currencyTable[e.value * 2]]);
      expect(merged.currencyTable[mv! * 2 + 1], `currency ${e.key} digits`).toBe(expected.currencyTable[e.value * 2 + 1]);
    }
  };

  test('every family variant merges to its full literal (value-level)', () => {
    for (const members of families.values()) {
      if (members.length < 2) {
        continue;
      }
      const base = pickFamilyBase(members, dataset.locales);
      for (const tag of members) {
        if (tag !== base) {
          assertMergedEqualsFull(tag, base);
        }
      }
    }
  });

  test('committed delta modules merge to the committed full packs', () => {
    const committedDelta: Record<string, VariantDelta> = { en: enDelta, 'en-GB': enGBDelta, 'en-AU': enAUDelta, 'en-CA': enCADelta };
    for (const members of families.values()) {
      if (members.length < 2) {
        continue;
      }
      const base = pickFamilyBase(members, dataset.locales);
      for (const tag of members) {
        if (tag === base) {
          continue;
        }
        const delta = committedDelta[tag];
        expect(delta, `committed delta for ${tag}`).toBeDefined();
        expect(delta.base).toBe(base);
        const merged = mergeVariantDelta(decodeLocalePack(committedPacks[base as keyof typeof committedPacks]), delta);
        const expected = decodeLocalePack(committedPacks[tag as keyof typeof committedPacks]);
        // merged pool = base ∪ variant values: every variant value must
        // resolve (the pool may carry base-only strings the variant lacks)
        for (const v of expected.pool) {
          expect(merged.pool, `${tag}: pool contains '${v}'`).toContain(v);
        }
        expect(merged.patterns).toEqual(expected.patterns);
        expect(merged.symbols).toEqual(expected.symbols);
      }
    }
  });
});
