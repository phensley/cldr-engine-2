/**
 * Regenerate the committed pack assets:
 *
 *   pnpm generate:packs
 *
 * v1 (real data): input is the CLDR 48.2.1 adapter (`realCldr()`, see
 * plans/real-cldr-compiler.md) — the mini-cldr fixture stays for the
 * offline pipeline tests. Pools ship as array literals; only numeric
 * streams go through the codec chain. Deterministic: regenerating after
 * an unchanged dataset produces no diff. The generated files are
 * committed; __tests__/generated.test.ts asserts they stay fresh.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileDataset,
  localeIdentifier,
  renderIndexModule,
  renderLocaleModule,
  renderNumericModule,
  renderPacksModule,
} from '../internal/data-pipeline/src/index.js';
import { realCldr } from '../internal/data-pipeline/src/dataset/real.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDirs = [
  join(scriptDir, '../internal/data-pipeline/generated'),
  join(scriptDir, '../packages/cldr/src/packs'),
];

const compiled = compileDataset(realCldr());
const stems = new Set(Object.keys(compiled.locale).map(localeIdentifier));
for (const outDir of outDirs) {
  mkdirSync(outDir, { recursive: true });
  for (const [locale, pack] of Object.entries(compiled.locale)) {
    writeFileSync(join(outDir, `${localeIdentifier(locale)}.ts`), renderLocaleModule(locale, pack));
  }
  writeFileSync(join(outDir, 'numeric.ts'), renderNumericModule(compiled.numeric));
  // remove stale locale stems (locale-set changes must not leave ghosts:
  // the scanner derives manifest.locales from this dir)
  for (const f of readdirSync(outDir)) {
    if (!f.endsWith('.ts')) {
      continue;
    }
    const stem = f.replace(/\.ts$/, '');
    if (stem !== 'numeric' && stem !== 'packs' && stem !== 'index' && !stems.has(stem)) {
      rmSync(join(outDir, f));
      console.log(`generate-packs: removed stale ${join(outDir, f)}`);
    }
  }
}
// pipeline keeps the aggregate modules (its own artifact); the runtime
// package addresses packs per-locale through its exports map instead
const outDir = outDirs[0];
writeFileSync(join(outDir, 'packs.ts'), renderPacksModule(Object.keys(compiled.locale)));
writeFileSync(join(outDir, 'index.ts'), renderIndexModule());

console.log(`generated ${Object.keys(compiled.locale).length} locale packs + numeric (pool arrays) → ${outDirs.join(', ')}`);
