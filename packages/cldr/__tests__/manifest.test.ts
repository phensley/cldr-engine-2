/**
 * Freshness + integrity tests for the generated runtime manifest
 * (packages/cldr/src/manifest.ts, produced by `pnpm scan:manifest`).
 *
 * Mirrors the pack-assets pattern (internal/data-pipeline/__tests__/
 * generated.test.ts): the committed artifact must equal a fresh derive +
 * render, and the committed artifact itself is independently verified
 * (every slot ref resolves to a real module + export).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveExports, deriveManifest, renderManifest, MANIFEST_PATH, PKG_PATH } from '../../../scripts/scan-manifest.js';
import { manifest } from '../src/manifest.js';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../src');

/** Named top-level exports of a module (const/function/class/var + export { x }). */
const exportedNames = (file: string): Set<string> => {
  const text = readFileSync(file, 'utf8');
  const names = new Set<string>();
  for (const m of text.matchAll(/export\s+(?:const|function|class|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const n of m[1].split(',')) {
      const nm = n.trim().split(/\s+as\s+/).pop();
      if (nm) {
        names.add(nm);
      }
    }
  }
  return names;
};

/** Every MethodRef in a feature's committed slot tree. */
const allRefs = (slots: Record<string, unknown>): Array<{ specifier: string; exportName: string }> => {
  const out: Array<{ specifier: string; exportName: string }> = [];
  const visit = (node: unknown) => {
    if (node !== null && typeof node === 'object' && 'namespace' in node) {
      const ns = (node as { namespace: Record<string, unknown> }).namespace;
      for (const v of Object.values(ns)) {
        visit(v);
      }
    } else if (node !== null && typeof node === 'object' && 'specifier' in node) {
      out.push(node as { specifier: string; exportName: string });
    }
  };
  for (const v of Object.values(slots)) {
    visit(v);
  }
  return out;
};

const tagFromStem = (stem: string): string => (/([a-z]+)(\d+)$/i.test(stem) ? stem.replace(/([a-z]+)(\d+)$/i, '$1-$2') : stem);

describe('committed runtime manifest', () => {
  it('is fresh: file contents equal a fresh derive + render', () => {
    expect(readFileSync(MANIFEST_PATH, 'utf8'), 'manifest.ts is stale — run pnpm scan:manifest').toBe(renderManifest(deriveManifest()));
  });

  it('every slot ref resolves to a real module + export', () => {
    for (const fm of Object.values(manifest.features)) {
      for (const ref of allRefs(fm.slots)) {
        const rel = ref.specifier.replace(/^@phensley\/cldr\//, '');
        const file = join(srcDir, `${rel}.ts`);
        expect(existsSync(file), `${rel}.ts missing`).toBe(true);
        expect(exportedNames(file).has(ref.exportName), `${rel}.ts must export ${ref.exportName}`).toBe(true);
      }
    }
  });

  it('locales match the shipped packs directory', () => {
    const tags = readdirSync(join(srcDir, 'packs'))
      .filter((f) => f.endsWith('.ts') && f !== 'numeric.ts')
      .map((f) => tagFromStem(f.replace(/\.ts$/, '')));
    expect([...manifest.locales].sort()).toEqual(tags.sort());
  });

  it('package.json exports equal the manifest-derived surface (no wildcards for internals)', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as { exports: unknown };
    expect(pkg.exports, 'package.json exports are stale — run pnpm scan:manifest').toEqual(deriveExports(deriveManifest()));
  });

  it('the public surface is exactly the manifest: internal modules are not importable', async () => {
    // the ref-impl placement contract (plans/prototype-plan.md §12): the
    // wildcard `./decimal/*`/`./currency/*` reachability is closed —
    // internals ship in dist but are not resolvable through the exports map
    for (const spec of [
      '@phensley/cldr/decimal/state',
      '@phensley/cldr/decimal/format/pattern',
      '@phensley/cldr/currency/lookup',
      '@phensley/cldr/currency/state',
      '@phensley/cldr/locale',
      '@phensley/cldr/factory',
      '@phensley/cldr/api',
      '@phensley/cldr/index',
    ]) {
      await expect(import(spec), spec).rejects.toThrow();
    }
    // …and the slot subpaths resolve (symmetry check)
    for (const spec of ['@phensley/cldr/decimal/compare', '@phensley/cldr/currency/format', '@phensley/cldr/decimal/format/scientific']) {
      await expect(import(spec), spec).resolves.toBeDefined();
    }
  });
});
