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
  localeIdentifier,
  lookupTrieValue,
  miniCldr,
  renderIndexModule,
  renderLocaleModule,
  renderNumericModule,
  renderPacksModule,
} from '../src/index.js';
import { packs, numeric } from '../generated/index.js';

const generatedDir = join(dirname(fileURLToPath(import.meta.url)), '../generated');

describe('committed pack assets', () => {
  it('are fresh: file contents equal a fresh render (default codec)', () => {
    const compiled = compileDataset(miniCldr, { poolCodec: 'utf8' });

    for (const [locale, pack] of Object.entries(compiled.locale)) {
      const file = join(generatedDir, `${localeIdentifier(locale)}.ts`);
      expect(readFileSync(file, 'utf8'), `${locale}.ts is stale — run pnpm generate:packs`).toBe(
        renderLocaleModule(locale, pack),
      );
    }
    expect(readFileSync(join(generatedDir, 'numeric.ts'), 'utf8')).toBe(renderNumericModule(compiled.numeric));
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
