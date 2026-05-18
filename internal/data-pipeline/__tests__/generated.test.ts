/**
 * Freshness test: the committed pack assets (generated/, produced by
 * `pnpm generate:packs`) must equal a fresh render of the current dataset —
 * otherwise the committed artifact silently drifted from the source of truth.
 * Also decodes the committed artifact itself as an independent smoke check
 * that it is real, importable pack data.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileDataset,
  decodeLocalePack,
  decodeNumericPack,
  lookupTrieValue,
  miniCldr,
  renderIndexModule,
  renderLocaleModule,
  renderNumericModule,
  renderPacksModule,
} from '../src/index.js';
import { packs, numeric } from '../generated/index.js';

const generatedDir = join(dirname(fileURLToPath(import.meta.url)), '../generated');
const runtimePacksDir = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/cldr/src/packs');

const PACK_STEMS = ['en', 'fr', 'de', 'es419', 'numeric'];

describe('committed pack assets', () => {
  it('are fresh: file contents equal a fresh render', () => {
    const compiled = compileDataset(miniCldr);

    for (const stem of PACK_STEMS) {
      for (const dir of [generatedDir, runtimePacksDir]) {
        expect(readFileSync(join(dir, `${stem}.ts`), 'utf8'), `${stem}.ts is stale — run pnpm generate:packs`).toBe(
          stem === 'numeric' ? renderNumericModule(compiled.numeric) : renderLocaleModule(stem === 'es419' ? 'es-419' : stem, compiled.locale[stem === 'es419' ? 'es-419' : stem]),
        );
      }
    }
    // pipeline-only aggregates
    expect(readFileSync(join(generatedDir, 'packs.ts'), 'utf8')).toBe(renderPacksModule(Object.keys(compiled.locale)));
    expect(readFileSync(join(generatedDir, 'index.ts'), 'utf8')).toBe(renderIndexModule());
  });

  it('decode: committed packs resolve codes back to dataset values', () => {
    for (const tag of Object.keys(miniCldr.locales)) {
      const d = decodeLocalePack(packs[tag]);
      for (const [code, name] of Object.entries(miniCldr.locales[tag].territories)) {
        expect(d.pool[lookupTrieValue(code, d.territoryTrie)!], `${tag}: ${code}`).toBe(name);
      }
    }
    const d = decodeNumericPack(numeric);
    expect(d.values[d.keys.indexOf('CEILING')]).toBe(65535);
  });
});
