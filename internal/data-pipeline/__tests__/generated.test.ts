/**
 * Freshness test: the committed pack assets (generated/, produced by
 * `pnpm generate:packs` from the REAL CLDR adapter — plans/real-cldr-
 * compiler.md) must equal a fresh render of the current dataset —
 * otherwise the committed artifact silently drifted from the source of
 * truth. Also decodes the committed artifact itself as an independent
 * smoke check that it is real, importable pack data.
 *
 * Cache-gated (the adapter reads the gitignored .cache); without the
 * cache the committed-vs-fresh assertions are skipped and only the
 * committed-artifact decode smoke runs (offline-safe).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileDataset,
  decodeLocalePack,
  decodeNumericPack,
  lookupTrieValue,
  renderIndexModule,
  renderLocaleModule,
  renderNumericModule,
  renderPacksModule,
  tagFromStem,
} from '../src/index.js';
import { LOCALES, realCldr } from '../src/dataset/real.js';
import { packs, numeric } from '../generated/index.js';

const generatedDir = join(dirname(fileURLToPath(import.meta.url)), '../generated');
const runtimePacksDir = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/cldr/src/packs');
const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '../../..', '.cache', 'cldr', '48.2.1');
const hasCache = existsSync(join(cacheDir, 'cldr-core/supplemental/numberingSystems.json'));

const stems = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !['index.ts', 'packs.ts', 'numeric.ts'].includes(f))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();

describe('committed pack assets (real CLDR 48.2.1)', () => {
  it('are fresh: file contents equal a fresh render (cache-gated)', () => {
    if (!hasCache) {
      return; // offline: skip freshness, decode smoke below still runs
    }
    const compiled = compileDataset(realCldr());

    for (const stem of stems(generatedDir)) {
      const tag = tagFromStem(stem);
      for (const dir of [generatedDir, runtimePacksDir]) {
        expect(readFileSync(join(dir, `${stem}.ts`), 'utf8'), `${stem}.ts is stale — run pnpm generate:packs`).toBe(
          renderLocaleModule(tag, compiled.locale[tag]),
        );
      }
    }
    // pipeline-only aggregates + the shared numeric fixture
    expect(readFileSync(join(generatedDir, 'packs.ts'), 'utf8')).toBe(renderPacksModule(Object.keys(compiled.locale)));
    expect(readFileSync(join(generatedDir, 'index.ts'), 'utf8')).toBe(renderIndexModule());
    expect(readFileSync(join(generatedDir, 'numeric.ts'), 'utf8')).toBe(renderNumericModule(compiled.numeric));
  });

  it('decode: committed packs resolve codes back to the real dataset values', () => {
    const d = hasCache ? realCldr() : undefined;
    for (const tag of LOCALES as readonly string[]) {
      const mod = packs[tag as keyof typeof packs]; // keyed by locale TAG
      expect(mod, `committed pack ${tag}.ts missing`).toBeDefined();
      const dec = decodeLocalePack(mod!);
      expect(dec.pool.length, `${tag}: real-scale pool`).toBeGreaterThan(100);
      if (d === undefined) {
        continue; // offline: decode smoke only
      }
      for (const [code, name] of Object.entries(d.locales[tag].territories).slice(0, 20)) {
        expect(dec.pool[lookupTrieValue(code, dec.territoryTrie)!], `${tag}: ${code}`).toBe(name);
      }
      for (const [code, cur] of Object.entries(d.locales[tag].currencies).slice(0, 10)) {
        const rec = lookupTrieValue(code, dec.currencyTrie)!;
        expect(dec.pool[dec.currencyTable[rec * 2]], `${tag}: ${code} symbol`).toBe(cur.symbol);
        expect(dec.currencyTable[rec * 2 + 1], `${tag}: ${code} digits`).toBe(cur.fractionDigits);
      }
    }
    const dn = decodeNumericPack(numeric);
    expect(dn.values[dn.keys.indexOf('CEILING')]).toBe(65535);
  });
});
