/**
 * Regenerate the committed pack assets under internal/data-pipeline/generated.
 *
 *   pnpm generate:packs            → default pool codec (utf8)
 *   pnpm generate:packs -- utf16   → utf16 pools (benchmark comparison)
 *
 * Deterministic: regenerating after an unchanged dataset produces no diff.
 * The generated files are committed; __tests__/generated.test.ts asserts
 * they stay fresh (=== a fresh render).
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

const codec = process.argv.includes('--utf16') ? 'utf16' : 'utf8';
const outDir = join(dirname(fileURLToPath(import.meta.url)), '../internal/data-pipeline/generated');

const compiled = compileDataset(miniCldr, { poolCodec: codec });
mkdirSync(outDir, { recursive: true });

for (const [locale, pack] of Object.entries(compiled.locale)) {
  writeFileSync(join(outDir, `${localeIdentifier(locale)}.ts`), renderLocaleModule(locale, pack));
}
writeFileSync(join(outDir, 'numeric.ts'), renderNumericModule(compiled.numeric));
writeFileSync(join(outDir, 'packs.ts'), renderPacksModule(Object.keys(compiled.locale)));
writeFileSync(join(outDir, 'index.ts'), renderIndexModule());

console.log(`generated ${Object.keys(compiled.locale).length} locale packs + numeric (codec: ${codec}) → ${outDir}`);
