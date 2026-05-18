/**
 * Regenerate the committed pack assets:
 *
 *   pnpm generate:packs
 *
 * v0.1: pools ship as array literals (notes/pool-rebaseline.md); only
 * numeric streams go through the codec chain. Deterministic: regenerating
 * after an unchanged dataset produces no diff. The generated files are
 * committed; __tests__/generated.test.ts asserts they stay fresh.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileDataset,
  localeIdentifier,
  miniCldr,
  renderIndexModule,
  renderLocaleModule,
  renderNumericModule,
  renderPacksModule,
} from '../internal/data-pipeline/src/index.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDirs = [
  join(scriptDir, '../internal/data-pipeline/generated'),
  join(scriptDir, '../packages/cldr/src/packs'),
];

const compiled = compileDataset(miniCldr);
for (const outDir of outDirs) {
  mkdirSync(outDir, { recursive: true });
  for (const [locale, pack] of Object.entries(compiled.locale)) {
    writeFileSync(join(outDir, `${localeIdentifier(locale)}.ts`), renderLocaleModule(locale, pack));
  }
  writeFileSync(join(outDir, 'numeric.ts'), renderNumericModule(compiled.numeric));
}
// pipeline keeps the aggregate modules (its own artifact); the runtime
// package addresses packs per-locale through its exports map instead
const outDir = outDirs[0];
writeFileSync(join(outDir, 'packs.ts'), renderPacksModule(Object.keys(compiled.locale)));
writeFileSync(join(outDir, 'index.ts'), renderIndexModule());

console.log(`generated ${Object.keys(compiled.locale).length} locale packs + numeric (pool arrays) → ${outDirs.join(', ')}`);
