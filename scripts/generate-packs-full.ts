/**
 * Full-universe pack generation (coverage milestone 1; the publish-time
 * flow wires these into dist in milestone 2).
 *
 *   pnpm generate:packs:full
 *
 * Compiles EVERY cached locale (766) and writes the per-locale pack
 * modules into the GITIGNORED generated-full/ directory, plus a
 * deterministic aggregate SHA-256 into the committed
 * internal/data-pipeline/generated/coverage.sha256 (the freshness
 * anchor: with the pinned cldr-json input and a deterministic compiler,
 * the full set is reproducible — the anchor catches compiler drift;
 * source drift is guarded by the sha-pinned fetch).
 *
 * The committed 11-locale regression corpus (generate:packs) is
 * untouched; the full set is breadth, generated on demand.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDataset, localeIdentifier, renderLocaleModule } from '../internal/data-pipeline/src/index.js';
import { realCldr } from '../internal/data-pipeline/src/dataset/real.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'internal', 'data-pipeline', 'generated-full');
const ANCHOR = join(ROOT, 'internal', 'data-pipeline', 'generated', 'coverage.sha256');

const compiled = compileDataset(realCldr({ full: true }));
mkdirSync(OUT, { recursive: true });

const tags = Object.keys(compiled.locale).sort();
const modules: string[] = [];
for (const tag of tags) {
  const module = renderLocaleModule(tag, compiled.locale[tag]);
  modules.push(module);
  writeFileSync(join(OUT, `${localeIdentifier(tag)}.ts`), module);
}
const aggregate = modules.join('\n');
const sha = createHash('sha256').update(aggregate).digest('hex');
writeFileSync(ANCHOR, `${sha}\n`);

console.log(`generate-packs-full: ${tags.length} locale packs → ${OUT}`);
console.log(`generate-packs-full: coverage anchor ${sha} → ${ANCHOR}`);
