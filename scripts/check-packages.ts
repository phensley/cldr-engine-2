/**
 * Packaging check: attw (Are the Types Wrong) + publint for both public
 * packages, with an explicit allowed-problem profile.
 *
 * Allowed attw problems:
 *   - CJSResolvesToESM — deliberate ESM-only packaging (⚠️; resolves fine
 *     from ESM/bundler)
 *   - NoResolution on './manifest' under node10 + bundler — the DESIGNED
 *     browser/tooling block: the manifest is generator-only (node-gated)
 *
 * Anything else fails the check.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Run a command; returns { status, stdout } — attw exits 1 when problems exist, so callers decide. */
const run = (cmd: string, args: string[], cwd: string) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.error) {
    throw r.error;
  }
  return { status: r.status ?? 1, stdout: r.stdout };
};

const subpathOf = (e: { entrypoint?: { subpath?: string } | string }) =>
  typeof e.entrypoint === 'string' ? e.entrypoint : e.entrypoint?.subpath ?? '.';

const check = (pkg: string, opts: { manifestGated?: boolean } = {}) => {
  const dir = join(root, 'packages', pkg);
  console.log(`\n== ${pkg} ==`);

  // publint
  const publint = run('pnpm', ['exec', 'publint', dir], dir);
  if (publint.status !== 0 || !publint.stdout.includes('All good')) {
    console.error(publint.stdout);
    throw new Error(`${pkg}: publint reported issues`);
  }
  console.log('publint: clean');

  // attw (json) — exit 1 is normal (problems exist by design); the JSON on
  // stdout is the source of truth and is validated against the profile below
  const attw = run('pnpm', ['exec', 'attw', '--pack', '.', '-f', 'json'], dir);
  const data = JSON.parse(attw.stdout) as { problems: Record<string, Array<{ entrypoint?: { subpath?: string } | string; resolutionKind?: string }>> };
  const problems = data.problems;

  // the designed ./manifest block: the runtime's manifest is node-gated,
  // so it must be unresolvable from node10 legacy resolution and from
  // bundlers/browsers (the generator-only contract)
  if (opts.manifestGated) {
    const manifestBlocked = (problems['NoResolution'] ?? []).some(
      (e) => subpathOf(e) === './manifest' && (e.resolutionKind === 'node10' || e.resolutionKind === 'bundler'),
    );
    if (!manifestBlocked) {
      console.error(`${pkg}: expected ./manifest to be node10+bundler-blocked — check the exports map`);
      process.exitCode = 1;
    }
  }

  const offenders: string[] = [];
  for (const [kind, entries] of Object.entries(problems)) {
    if (kind === 'CJSResolvesToESM') {
      continue; // ESM-only by design
    }
    for (const e of entries) {
      const subpath = subpathOf(e);
      if (kind === 'NoResolution' && subpath === './manifest' && (e.resolutionKind === 'node10' || e.resolutionKind === 'bundler')) {
        continue; // the designed manifest block
      }
      offenders.push(`${kind} @ ${subpath} (${e.resolutionKind})`);
    }
  }
  if (offenders.length > 0) {
    console.error(`${pkg}: unexpected attw problems:`);
    for (const o of offenders) {
      console.error(`  ✗ ${o}`);
    }
    process.exitCode = 1;
  } else {
    console.log('attw: clean (ESM-only warnings + designed ./manifest block only)');
  }
};

check('cldr', { manifestGated: true });
check('cldr-generate');

if (process.exitCode === 1) {
  process.exit(1);
}
console.log('\npackaging checks passed');
