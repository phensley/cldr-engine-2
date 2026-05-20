/**
 * check:generated — regeneration idempotency + freshness gate.
 *
 *   pnpm check:generated
 *
 * Runs the FULL regeneration pipeline (pnpm regenerate) and then fails if
 * the working tree changed under any generated artifact path. This is the
 * CI-ready gate for the "committed output + test-enforced freshness"
 * workflow (notes/regeneration-workflow.md):
 *
 *   - every generated artifact is committed;
 *   - freshness is additionally asserted by the per-artifact tests
 *     (packs: internal/data-pipeline/__tests__/generated.test.ts,
 *     manifest: packages/cldr/__tests__/manifest.test.ts, clients: the
 *     examples regenerable tests);
 *   - this gate covers what the tests can't: NEW untracked files (e.g. a
 *     new locale pack that the freshness test's hardcoded stem list
 *     doesn't know about) and cross-artifact ordering mistakes.
 *
 * On failure the tree contains the freshly regenerated output: either
 * commit it (if it is an intentional dataset/API change) or restore it.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Artifact paths (repo-relative) that regeneration owns exclusively. */
const GENERATED = [
  'internal/data-pipeline/generated',
  'packages/cldr/src/packs',
  'packages/cldr/src/manifest.ts',
  'examples/eager-app/src/cldr.gen.ts',
  'examples/lazy-app/src/cldr.gen.ts',
];

const status = () => {
  const out = execFileSync('git', ['status', '--porcelain', '--', ...GENERATED], { cwd: ROOT, encoding: 'utf8' });
  return out.trim();
};

console.log('check:generated: running pnpm regenerate…');
execFileSync('pnpm', ['regenerate'], { cwd: ROOT, stdio: 'inherit' });

const dirty = status();
if (dirty.length > 0) {
  console.error('\ncheck:generated: FAILED — regeneration produced changes:');
  console.error(dirty);
  console.error('\nThe tree now contains the fresh output. If an input (dataset, api.ts, config)');
  console.error('intentionally changed, commit it as part of that change. Otherwise the');
  console.error('generator is non-deterministic or an artifact is stale — investigate.');
  process.exit(1);
}
console.log('\ncheck:generated: OK — regeneration is idempotent; committed artifacts are fresh.');
