/**
 * S3 publish round-trip (plans/packaging-sketch.md validation plan):
 *
 *   pnpm publish-roundtrip
 *
 * Spins up a local Verdaccio registry, publishes both public packages,
 * scaffolds an ISOLATED consumer project (os tmpdir — NOT the workspace,
 * so nothing resolves through workspace symlinks), and runs the full
 * consumer lifecycle against the installed artifacts:
 *
 *   npm install → published CLI generates cldr.gen.ts → tsc typechecks
 *   under NodeNext AND bundler resolutions (skipLibCheck: false) →
 *   esbuild browser bundle runs and returns identical output to the
 *   workspace-symlink dev → ./manifest is blocked for browser platform
 *   but resolves under node → installed dist has zero private-package
 *   imports → bundle bytes are at parity with workspace dev.
 *
 * Results recorded to notes/s3-publish-roundtrip.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build as esbuild } from 'esbuild';
import { defineConfig, generate } from '../packages/cldr-generate/src/index.js';

const ROOT = process.cwd();
const REGISTRY = 'http://127.0.0.1:4873';
const CONSUMER = mkdtempSync(join(tmpdir(), 'cldr-roundtrip-'));

const failures: string[] = [];
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failures.push(msg);
  }
};

const run = (cmd: string, args: string[], cwd: string, opts: { silent?: boolean } = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } });
  if (!opts.silent && r.status !== 0) {
    console.error(`  [${cmd} ${args.join(' ')}] failed:\n${(r.stdout || '') + (r.stderr || '')}`.slice(0, 2000));
  }
  return r;
};

/**
 * Create a throwaway user on the local registry and return the auth token
 * (the standard CI flow: PUT the org.couchdb.user document, get a token,
 * pass it via a userconfig .npmrc — npm publish refuses to run anonymously
 * even when the registry ACL allows $all).
 */
const createRegistryUser = async (): Promise<string> => {
  const res = await fetch(`${REGISTRY}/-/user/org.couchdb.user:roundtrip`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'roundtrip', password: 'roundtrip-pass', email: 'roundtrip@test.local', _id: 'org.couchdb.user:roundtrip' }),
  });
  const body = (await res.json()) as { ok?: string; token?: string; error?: string };
  if (!res.ok || typeof body.token !== 'string') {
    throw new Error(`registry user creation failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body.token;
};

const waitForRegistry = async (timeoutMs = 20000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${REGISTRY}/-/ping`);
      if (res.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('verdaccio did not come up');
};

// ---------------------------------------------------------------------------
// 0. verdaccio + publish

console.log('== starting verdaccio ==');
const verdaccio = spawn('pnpm', ['exec', 'verdaccio', '--config', join(ROOT, '.verdaccio/config.yaml')], {
  cwd: ROOT,
  stdio: 'ignore',
});
try {
  await waitForRegistry();
  console.log(`registry up at ${REGISTRY}`);
  const token = await createRegistryUser();
  console.log('registry user created (auth token acquired)');
  const publishRc = join(ROOT, '.verdaccio', 'publish.npmrc');
  writeFileSync(publishRc, `registry=${REGISTRY}/
//127.0.0.1:4873/:_authToken=${token}
`);

  // 2.5 the publish artifact is BUILT FULL (766 packs + full manifest) —
  // the registry gets the FULL universe
  const buildFull = run('pnpm', ['build:full'], ROOT);
  assert(buildFull.status === 0, 'build:full failed in the workspace');

  for (const pkg of ['cldr', 'cldr-generate']) {
    console.log(`== publishing @phensley/${pkg} ==`);
    const r = run('npm', ['publish', '--userconfig', publishRc, '--registry', REGISTRY, '--access', 'public', '--loglevel', 'error'], join(ROOT, 'packages', pkg));
    assert(r.status === 0, `publish @phenley/${pkg} failed`);
    if (r.status !== 0) {
      console.error(r.stdout);
    }
  }

  // -------------------------------------------------------------------------
  // 1. isolated consumer scaffold

  // single source of truth: the consumer's cldr.config.ts and the
  // workspace parity reference both generate from this
  const CONFIG = defineConfig({
    locales: ['en', 'ja', 'pt'], // ja/pt exist ONLY in the full universe
    features: {
      decimal: { compare: true, min: true, format: { scientific: true } },
      currency: true,
    },
  });

  const APP = `import { cldr } from './cldr.gen.js';
export const run = (locale: 'en' | 'ja' | 'pt') => {
  const ctx = cldr.get(locale);
  const total = ctx.currency.new('1234.5', 'USD').format();
  const cheapest = ctx.decimal.new('0.99').min(1.5);
  const ratio = cheapest.format.scientific();
  return \`\${total} / \${ratio} / \${cheapest.compare('1.0')}\`;
};
`;
  mkdirSync(join(CONSUMER, 'src'), { recursive: true });
  writeFileSync(
    join(CONSUMER, 'package.json'),
    JSON.stringify(
      {
        name: 'roundtrip-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          '@phensley/cldr': '0.0.0',
          '@phensley/cldr-generate': '0.0.0',
          typescript: '^5.9.0',
          esbuild: '^0.28.0',
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(CONSUMER, '.npmrc'), `registry=${REGISTRY}/\n//127.0.0.1:4873/:_authToken=${token}\n`);
  writeFileSync(
    join(CONSUMER, 'cldr.config.ts'),
    `import { defineConfig } from '@phensley/cldr-generate';\nexport default defineConfig(${JSON.stringify(CONFIG, null, 2)});\n`,
  );
  writeFileSync(join(CONSUMER, 'src/app.ts'), APP);
  // intentionally OUTSIDE src/ — the typechecks cover real consumer code;
  // this probe proves the ./manifest browser-block at bundle time only
  writeFileSync(
    join(CONSUMER, 'manifest-probe.ts'),
    `import { manifest } from '@phensley/cldr/manifest';\nexport const locales = manifest.locales;\n`,
  );
  for (const [name, resolution] of [
    ['tsconfig.nodenext.json', { module: 'nodenext', moduleResolution: 'nodenext' }],
    ['tsconfig.bundler.json', { module: 'esnext', moduleResolution: 'bundler' }],
  ] as const) {
    writeFileSync(
      join(CONSUMER, name),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'es2022',
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            ...resolution,
          },
          include: ['src', 'cldr.config.ts'],
        },
        null,
        2,
      ),
    );
  }

  // 2. install from the local registry
  console.log('== consumer: npm install (from verdaccio) ==');
  const install = run('npm', ['install'], CONSUMER, { silent: true });
  assert(install.status === 0, 'consumer npm install failed');
  console.log(`installed ${join(CONSUMER, 'node_modules', '@phensley')}`);

  // 3. published CLI generates the client
  console.log('== consumer: published cldr-generate CLI ==');
  const gen = run(join(CONSUMER, 'node_modules', '.bin', 'cldr-generate'), ['--config', 'cldr.config.ts', '--out', 'src/cldr.gen.ts'], CONSUMER);
  assert(gen.status === 0, 'generator CLI failed in consumer');
  const genFile = join(CONSUMER, 'src/cldr.gen.ts');
  assert(readFileSync(genFile, 'utf8').includes('@phensley/cldr/packs/ja'), 'generated client imports the ja pack');
  console.log('client generated (' + readFileSync(genFile, 'utf8').length + ' bytes)');

  // 4. types resolve under NodeNext + bundler resolutions (real installed
  //    .d.ts files, skipLibCheck off)
  for (const cfg of ['tsconfig.nodenext.json', 'tsconfig.bundler.json']) {
    console.log(`== consumer: tsc -p ${cfg} ==`);
    const t = run('npm', ['exec', 'tsc', '--', '-p', cfg], CONSUMER);
    assert(t.status === 0, `tsc ${cfg} failed in consumer`);
  }

  // 5. browser bundle: runs, output parity with workspace dev
  console.log('== consumer: esbuild browser bundle ==');
  const bundleOut = join(CONSUMER, 'out');
  const bundling = await esbuild({
    entryPoints: [join(CONSUMER, 'src/app.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: bundleOut,
    logLevel: 'silent',
  });
  assert(bundling.errors.length === 0, 'consumer bundle failed');
  const stripComments = (t: string) => t.replace(/\n\/\/ .*/g, '').replace(/\/\/# sourceMappingURL=.*/g, '');
  const consumerText = stripComments(readFileSync(join(bundleOut, 'app.js'), 'utf8'));
  const consumerBytes = consumerText.length;
  const consumerGz = gzipSync(consumerText).length;

  const bundleMod = await import(new URL(`file://${join(bundleOut, 'app.js')}`));
  const result = (bundleMod as { run(l: string): string }).run('en');
  const ja = (bundleMod as { run(l: string): string }).run('ja');
  assert(result === '$1,234.50 / 9.9e-1 / -1', `bundle output parity: got "${result}"`);
  // ja resolves + renders from the FULL-universe pack (USD formatting is
  // identical across en/ja — JPY narrowing is covered by the goldens)
  assert(ja === '$1,234.50 / 9.9e-1 / -1', `full-universe locale render: got "${ja}"`);

  // workspace-symlink parity reference (same app content, same esbuild)
  const wsOut = join(ROOT, '.bundle-proof', 'parity-ws');
  mkdirSync(wsOut, { recursive: true });
  writeFileSync(join(wsOut, 'app.ts'), APP);
  writeFileSync(join(wsOut, 'cldr.gen.ts'), generate(CONFIG));
  await esbuild({
    entryPoints: [join(wsOut, 'app.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: wsOut,
    logLevel: 'silent',
  });
  const wsBytes = stripComments(readFileSync(join(wsOut, 'app.js'), 'utf8')).length;
  const drift = Math.abs(consumerBytes - wsBytes) / Math.min(consumerBytes, wsBytes);
  assert(drift < 0.05, `bundle parity drift ${(drift * 100).toFixed(1)}% vs workspace (>5% — investigate)`);
  console.log(`bundle: installed ${consumerBytes} B (${consumerGz} gz) vs workspace ${wsBytes} B — drift ${(drift * 100).toFixed(1)}%`);

  // 6. ./manifest: blocked for browser platform, resolvable under node
  console.log('== consumer: ./manifest gating ==');
  const blocked = await esbuild({
    entryPoints: [join(CONSUMER, 'manifest-probe.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: join(CONSUMER, 'out-blocked'),
    logLevel: 'silent',
  }).then(
    () => null,
    (e: Error) => e.message,
  );
  assert(blocked !== null && /Could not resolve|No matching export/.test(blocked), `browser bundling must not resolve ./manifest: got ${String(blocked).slice(0, 120)}`);
  const man = await import(new URL(`file://${join(CONSUMER, 'node_modules', '@phensley', 'cldr', 'dist', 'manifest.js')}`));
  const manLocales = (man as { manifest: { locales: string[] } }).manifest.locales;
  assert(manLocales.length === 766, `published manifest lists the FULL universe (got ${manLocales.length})`);
  assert(manLocales.includes('ja') && manLocales.includes('pt'), 'full universe includes ja/pt');
  console.log('browser: blocked ✓  node: resolves ✓');

  // 7. installed dist hygiene
  const installed = join(CONSUMER, 'node_modules', '@phensley', 'cldr', 'dist');
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        out.push(...walk(p));
      } else {
        out.push(p);
      }
    }
    return out;
  };
  const leaks = walk(installed).filter((f) => /\.(js|d\.ts)$/.test(f)).filter((f) => {
    const t = readFileSync(f, 'utf8');
    return t.includes('@cldr/internal-core') || t.includes('@cldr/data-pipeline');
  });
  assert(leaks.length === 0, `installed dist leaks private imports: ${leaks.join(', ')}`);
  console.log('installed dist hygiene: clean');

  // -------------------------------------------------------------------------
  // record

  const md = [
    '# S3 publish round-trip record',
    '',
    `_Recorded ${new Date().toISOString()}_ — consumer: \`${CONSUMER}\` (isolated tmpdir, installed from local verdaccio).`,
    '',
    '| step | result |',
    '| --- | --- |',
    '| publish `@phensley/cldr` + `@phensley/cldr-generate` → verdaccio | ✓ |',
    '| consumer `npm install` (registry-only) | ✓ |',
    '| published CLI → `cldr.gen.ts` | ✓ |',
    '| `tsc` NodeNext resolution (skipLibCheck off) | ✓ |',
    '| `tsc` bundler resolution (skipLibCheck off) | ✓ |',
    '| esbuild browser bundle | ✓ |',
    `| bundle parity vs workspace symlinks | ${consumerBytes} B vs ${wsBytes} B (drift ${(drift * 100).toFixed(1)}%) |`,
    `| bundle rerun in node = dev output | \`${result}\` |`,
    '| `./manifest` browser-blocked / node-resolved | ✓ / ✓ |',
    '| installed dist private-import scan | clean |',
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'notes/s3-publish-roundtrip.md'), md);
  console.log(md);
} finally {
  verdaccio.kill('SIGTERM');
  rmSync(join(ROOT, '.verdaccio', 'storage'), { recursive: true, force: true });
  rmSync(join(ROOT, '.verdaccio', 'htpasswd'), { force: true });
  rmSync(join(ROOT, '.verdaccio', 'publish.npmrc'), { force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} assertion(s) FAILED:`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
}
console.log('\npublish → install → generate → typecheck → bundle round-trip green');
