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
import { deriveManifest, renderManifest, MANIFEST_PATH } from '../../../scripts/scan-manifest.js';
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
});
