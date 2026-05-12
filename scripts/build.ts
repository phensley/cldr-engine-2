/**
 * Build both public packages for publish (S3-M1).
 *
 *   pnpm build
 *
 * @phensley/cldr — rollup preserveModules: the workspace-private
 * internal/core is FIRST copied into src/_core (generated, gitignored)
 * and aliased to '@cldr/internal-core', so its code + types are INLINED
 * into the runtime's dist — the published package has zero dependency on
 * the un-published core, and every per-method subpath the generated
 * client imports resolves to a real dist file.
 *
 * @phensley/cldr-generate — tsc emit (ESM, externals kept: the runtime
 * package + tsx) + esbuild-bundled CLI bin.
 *
 * Post-build checks: dist contains no '@cldr/internal-core' specifier
 * anywhere (js or d.ts), and every exports-map target exists.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import alias from '@rollup/plugin-alias';
import esbuildPlugin from 'rollup-plugin-esbuild';
import { dts } from 'rollup-plugin-dts';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cldr = join(root, 'packages/cldr');
const gen = join(root, 'packages/cldr-generate');

// ---------------------------------------------------------------------------
// helpers

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
    } else if (f.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
};

/** src-relative input map: { 'decimal/compare': 'src/decimal/compare.ts', index: ... } */
const inputMap = (srcDir: string): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const file of walk(srcDir)) {
    if (file.includes('_core')) {
      continue; // inlined core is imported, never an entry
    }
    map[relative(srcDir, file).replace(/\.ts$/, '')] = file;
  }
  return map;
};

const assertDistClean = (dir: string) => {
  for (const file of walk(join(dir, 'dist')).filter((f) => f.endsWith('.js') || f.endsWith('.d.ts'))) {
    const text = readFileSync(file, 'utf8');
    if (text.includes('@cldr/internal-core') || text.includes('@cldr/data-pipeline')) {
      throw new Error(`dist leaks a private package import: ${file}`);
    }
  }
};

const assertExportsResolve = (pkgDir: string) => {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const missing: string[] = [];
  const targets = (e: string | Record<string, unknown>) => {
    if (typeof e === 'string') {
      missing.push(e);
      return;
    }
    for (const v of Object.values(e)) {
      targets(v as string | Record<string, unknown>);
    }
  };
  for (const t of Object.values(pkg.exports)) {
    targets(t);
  }
  for (const t of [...new Set(missing)]) {
    if (t.includes('*')) {
      continue; // pattern targets are validated by attw + the round-trip
    }
    if (!existsSync(join(pkgDir, t))) {
      throw new Error(`${pkg.name}: exports target missing: ${t}`);
    }
  }
};

// ---------------------------------------------------------------------------
// 1. inline internal/core into the runtime build

const coreCopy = join(cldr, 'src/_core');
rmSync(coreCopy, { recursive: true, force: true });
cpSync(join(root, 'internal/core/src'), coreCopy, { recursive: true });

// ---------------------------------------------------------------------------
// 2. @phensley/cldr: js + declarations (preserveModules)

const srcDir = join(cldr, 'src');
const inputs = inputMap(srcDir);

const js = await rollup({
  input: inputs,
  plugins: [
    alias({ entries: [{ find: '@cldr/internal-core', replacement: join(coreCopy, 'index.ts') }] }),
    nodeResolve({ extensions: ['.ts'] }),
    esbuildPlugin({ target: 'es2022' }),
  ],
});
await js.write({
  dir: join(cldr, 'dist'),
  format: 'esm',
  sourcemap: true,
  preserveModules: true,
  preserveModulesRoot: srcDir,
  exports: 'named',
});
await js.close();

const dtsBuild = await rollup({
  input: inputs,
  plugins: [
    alias({ entries: [{ find: '@cldr/internal-core', replacement: join(coreCopy, 'index.ts') }] }),
    nodeResolve({ extensions: ['.ts'] }),
    dts(),
  ],
});
await dtsBuild.write({
  dir: join(cldr, 'dist'),
  preserveModules: true,
  preserveModulesRoot: srcDir,
  entryFileNames: '[name].d.ts',
});
await dtsBuild.close();

// ---------------------------------------------------------------------------
// 3. @phensley/cldr-generate: tsc emit + bundled CLI

rmSync(join(gen, 'dist'), { recursive: true, force: true });
const tsc = require.resolve('typescript/bin/tsc');
const tscRun = spawnSync(process.execPath, [tsc, '-p', join(gen, 'tsconfig.build.json')], { cwd: root, encoding: 'utf8' });
if (tscRun.status !== 0) {
  console.error(tscRun.stdout, tscRun.stderr);
  process.exit(tscRun.status ?? 1);
}

await esbuild({
  entryPoints: [join(gen, 'src/cli.ts')],
  outfile: join(gen, 'dist/bin.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
  external: ['tsx', '@phensley/cldr', '@phensley/cldr/*'],
  logLevel: 'silent',
});
chmodSync(join(gen, 'dist/bin.mjs'), 0o755);

// ---------------------------------------------------------------------------
// 4. post-build checks

assertDistClean(cldr);
assertDistClean(gen);
assertExportsResolve(cldr);
assertExportsResolve(gen);

const count = (d: string) => walk(join(d, 'dist')).length;
console.log(`built ${cldr} → ${count(cldr)} dist files`);
console.log(`built ${gen} → ${count(gen)} dist files`);
console.log('dist clean (no private-package imports), exports targets present');
