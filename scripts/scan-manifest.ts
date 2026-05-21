/**
 * Manifest automation — derive the runtime manifest from the source of
 * truth instead of hand-maintaining it (plans/prototype-plan.md §6,
 * §11b follow-up).
 *
 *   pnpm scan:manifest
 *
 * Sources, in order of authority:
 *
 *   1. `packages/cldr/src/api.ts` — the `*Api` interfaces ARE the public
 *      surface (a config selects a subset of a known shape). Member keys
 *      of `DecimalApi`/`CurrencyApi` are the slot keys; a member typed as
 *      a plain function signature is a method slot; a member typed as a
 *      reference to another interface declared in api.ts is a namespace
 *      slot (recursively resolved).
 *   2. The impl modules (`src/<feature>/<kebab-path>.ts`) — every derived
 *      ref is VERIFIED to exist as a real module exporting the named
 *      symbol. This is the drift guard: a slot in the Api without an
 *      implementation fails the scan, and a generated client can never
 *      import a ref that vanished from the code.
 *   3. `packages/cldr/package.json` — the specifier's subpath must be
 *      covered by the exports wildcard (`./<feature>/*`).
 *   4. `packages/cldr/src/factory.ts` — the per-feature factory
 *      (`make<Feature>Factory`, by convention) must be exported.
 *   5. `packages/cldr/src/packs/*.ts` — the `locales` list is the set of
 *      shipped locale packs (minus the shared `numeric` stream).
 *
 * Not derivable from the API shape, declared in FEATURE_META below:
 * pack-stream metadata (`data`, `needsLocaleData`). Adding an `*Api`
 * interface without metadata is a scan ERROR, not a silent omission.
 *
 * The scanner also derives the package exports map (a second output of
 * the same run): the runtime's PUBLIC surface is exactly the manifest's
 * slot refs, so `exports` is rewritten with explicit per-slot subpaths
 * (no `./decimal/*` wildcards — internals like `decimal/state` are not
 * importable by consumers). This is the embodiment of the ref-impl
 * placement decision (plans/prototype-plan.md §12): the reference
 * implementation stays inside the runtime AS its public import surface,
 * and the manifest is the boundary between public and internal.
 *
 * The generated module keeps the same types and shape as before, so
 * `@phensley/cldr/manifest` consumers (the generator) are untouched.
 * Output is committed; packages/cldr/__tests__/manifest.test.ts keeps it
 * fresh (same pattern as the pack assets).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'packages', 'cldr', 'src');
const API_FILE = join(SRC, 'api.ts');
const FACTORY_FILE = join(SRC, 'factory.ts');
const PACKS_DIR = join(SRC, 'packs');
export const MANIFEST_PATH = join(SRC, 'manifest.ts');
export const PKG_PATH = join(ROOT, 'packages', 'cldr', 'package.json');

// ---------------------------------------------------------------------------
// per-feature metadata NOT derivable from the API shape (pack-stream usage).
// A feature whose `*Api` interface exists but has no entry here is an error.

const FEATURE_META: Record<string, { data: string[]; needsLocaleData: boolean }> = {
  decimal: { data: [], needsLocaleData: false },
  currency: { data: ['currencies', 'patterns', 'pool'], needsLocaleData: true },
};

// ---------------------------------------------------------------------------
// AST helpers

const parse = (file: string): ts.SourceFile => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** Named top-level exports of a module (const/function/var/class + export { x }). */
const exportedNames = (file: string): Set<string> => {
  const sf = parse(file);
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
    if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          names.add(d.name.text);
        }
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text);
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const e of stmt.exportClause.elements) {
        names.add(e.name.text);
      }
    }
  }
  return names;
};

/** All interfaces declared in api.ts (slot roots must be `*Api`; namespace targets may be any name). */
const apiInterfaces = (): Map<string, ts.InterfaceDeclaration> => {
  const sf = parse(API_FILE);
  const out = new Map<string, ts.InterfaceDeclaration>();
  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      out.set(stmt.name.text, stmt);
    }
  }
  return out;
};

const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const camel = (name: string): string => name[0].toLowerCase() + name.slice(1);
const pascal = (name: string): string => name[0].toUpperCase() + name.slice(1);
/** packs/en.ts → 'en'; packs/es419.ts → 'es-419' (inverse of localeIdentifier). */
const tagFromStem = (stem: string): string => (/([a-z]+)(\d+)$/i.test(stem) ? stem.replace(/([a-z]+)(\d+)$/i, '$1-$2') : stem);

// ---------------------------------------------------------------------------
// derive

interface MethodRefLike {
  specifier: string;
  exportName: string;
}
type FeatureSlotLike = MethodRefLike | { namespace: Record<string, FeatureSlotLike> };

export interface DerivedFeature {
  factory: string;
  data: string[];
  needsLocaleData: boolean;
  slots: Record<string, FeatureSlotLike>;
}

export interface DerivedManifest {
  locales: string[];
  features: Record<string, DerivedFeature>;
  /** Informational: impl modules that export symbols but are not slots. */
  info: string[];
}

/**
 * Resolve one *Api interface into a slot tree. Method members (function
 * type) → MethodRef; interface-reference members → namespace (recursive).
 * Anything else is a scan error: the surface must stay a pure
 * method/namespace selection shape.
 */
const resolveSlots = (iface: ts.InterfaceDeclaration, interfaces: Map<string, ts.InterfaceDeclaration>, path: string[]): Record<string, FeatureSlotLike> => {
  const out: Record<string, FeatureSlotLike> = {};
  for (const member of iface.members) {
    if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name)) {
      throw new Error(`api.ts: ${iface.name.text} member ${member.name?.getText() ?? '?'} is not a named property — surface must be plain method keys`);
    }
    const key = member.name.text;
    if (member.type === undefined) {
      throw new Error(`api.ts: ${iface.name.text}.${key} has no type — surface members need a function type or an interface reference`);
    }
    if (ts.isFunctionTypeNode(member.type)) {
      const specifier = `@phensley/cldr/${[...path, kebab(key)].join('/')}`;
      out[key] = { specifier, exportName: key };
      continue;
    }
    if (ts.isTypeReferenceNode(member.type) && ts.isIdentifier(member.type.typeName)) {
      const target = interfaces.get(member.type.typeName.text);
      if (target === undefined) {
        throw new Error(`api.ts: ${iface.name.text}.${key} references '${member.type.typeName.text}' which is not an interface declared in api.ts — namespace targets must be declared there`);
      }
      out[key] = { namespace: resolveSlots(target, interfaces, [...path, kebab(key)]) };
      continue;
    }
    throw new Error(`api.ts: ${iface.name.text}.${key} has an unsupported type — function signature or *Api interface reference only`);
  }
  return out;
};

const verifyRefs = (feature: string, slots: Record<string, FeatureSlotLike>): void => {
  const failures: string[] = [];
  const visit = (node: FeatureSlotLike, segs: string[]) => {
    // segs = [feature, kebab(segment), …] — the module-relative path
    if ('namespace' in node) {
      for (const [k, v] of Object.entries(node.namespace)) {
        visit(v, [...segs, kebab(k)]);
      }
      return;
    }
    const file = join(SRC, `${segs.join('/')}.ts`);
    const rel = segs.join('/');
    if (!existsSync(file)) {
      failures.push(`${rel}.ts missing — module for ${node.specifier} does not exist`);
    } else if (!exportedNames(file).has(node.exportName)) {
      failures.push(`${rel}.ts exists but does not export '${node.exportName}'`);
    }
  };
  for (const [k, v] of Object.entries(slots)) {
    visit(v, [feature, kebab(k)]);
  }
  if (failures.length > 0) {
    throw new Error(`manifest scan failed — slots without implementations (implement or remove the api.ts member):\n  - ${failures.join('\n  - ')}`);
  }
};

/** Kebab-case module-relative paths of every slot (['decimal/compare', 'decimal/format/scientific', …]). */
const slotKebabPaths = (slots: Record<string, FeatureSlotLike>): Set<string> => {
  const out = new Set<string>();
  const walk = (node: FeatureSlotLike, path: string[]) => {
    if ('namespace' in node) {
      for (const [k, v] of Object.entries(node.namespace)) {
        walk(v, [...path, kebab(k)]);
      }
    } else {
      out.add(path.join('/'));
    }
  };
  for (const [k, v] of Object.entries(slots)) {
    walk(v, [kebab(k)]);
  }
  return out;
};

export const deriveManifest = (): DerivedManifest => {
  const interfaces = apiInterfaces();
  const features: Record<string, DerivedFeature> = {};
  const info: string[] = [];

  for (const [ifaceName, iface] of [...interfaces].filter(([name]) => name.endsWith('Api'))) {
    const feature = camel(ifaceName.replace(/Api$/, ''));
    const meta = FEATURE_META[feature];
    if (meta === undefined) {
      throw new Error(`api.ts declares '${ifaceName}' but FEATURE_META has no entry for feature '${feature}' — add data/needsLocaleData metadata (or remove the interface)`);
    }
    const factory = `make${pascal(feature)}Factory`;
    if (!exportedNames(FACTORY_FILE).has(factory)) {
      throw new Error(`factory.ts does not export '${factory}' — factory naming convention is make<Feature>Factory`);
    }
    const slots = resolveSlots(iface, interfaces, [feature]);
    verifyRefs(feature, slots);
    features[feature] = { factory, data: meta.data, needsLocaleData: meta.needsLocaleData, slots };

    // informational: impl modules that export symbols but are not slots
    const slotPaths = slotKebabPaths(slots);
    const internal: string[] = [];
    for (const dir of walkTsDirs(join(SRC, feature))) {
      const key = dir.slice(SRC.length + 1 + feature.length + 1).replace(/\.ts$/, '');
      if (!slotPaths.has(key)) {
        internal.push(`${feature}/${key}`);
      }
    }
    if (internal.length > 0) {
      info.push(`${feature}: non-slot impl modules (internal): ${internal.join(', ')}`);
    }
  }

  const locales = readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'numeric.ts')
    .map((f) => tagFromStem(f.replace(/\.ts$/, '')))
    .sort();

  return { locales, features, info };
};

/** All *.ts files under a dir, recursively (relative paths). */
const walkTsDirs = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTsDirs(p));
    } else if (entry.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
};

/**
 * The manifest-derived exports map: the runtime's public surface is
 * exactly its slot refs. `exports` in package.json is rewritten from
 * this on every scan, so internals (decimal/state, currency/lookup,
 * locale, factory, client) are NOT importable by consumers — the
 * wildcard `./decimal/*` / `./currency/*` reachability is closed
 * (ref-impl placement decision, plans/prototype-plan.md §12).
 * Stable hand blocks: root, packs (generated per-locale, kept wildcard),
 * and the node-gated generator-only manifest.
 */
export const deriveExports = (d: DerivedManifest): Record<string, unknown> => {
  const map: Record<string, unknown> = {
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
  };
  const add = (node: FeatureSlotLike, segs: string[]) => {
    if ('namespace' in node) {
      for (const [k, v] of Object.entries(node.namespace)) {
        add(v, [...segs, kebab(k)]);
      }
      return;
    }
    const rel = segs.join('/');
    map[`./${rel}`] = { types: `./dist/${rel}.d.ts`, default: `./dist/${rel}.js` };
  };
  for (const [feature, f] of Object.entries(d.features)) {
    for (const [k, v] of Object.entries(f.slots)) {
      add(v, [feature, kebab(k)]);
    }
  }
  map['./packs/*'] = { types: './dist/packs/*.d.ts', default: './dist/packs/*.js' };
  map['./manifest'] = { node: { types: './dist/manifest.d.ts', default: './dist/manifest.js' } };
  return map;
};

// ---------------------------------------------------------------------------
// render

const renderSlots = (slots: Record<string, FeatureSlotLike>, indent: string): string => {
  const parts: string[] = [];
  for (const [key, slot] of Object.entries(slots)) {
    if ('namespace' in slot) {
      parts.push(`${indent}${key}: {\n${indent}  namespace: {\n${renderSlots(slot.namespace, indent + '    ')}${indent}  },\n${indent}},`);
    } else {
      parts.push(`${indent}${key}: { specifier: '${slot.specifier}', exportName: '${slot.exportName}' },`);
    }
  }
  return parts.join('\n') + (parts.length > 0 ? '\n' : '');
};

const TYPES = `export interface MethodRef {
  /** Package subpath specifier, e.g. '@phensley/cldr/decimal/compare'. */
  specifier: string;
  /** Named export of that module. */
  exportName: string;
}

export interface NamespaceSlot {
  namespace: Record<string, MethodRef>;
}

export type FeatureSlot = MethodRef | NamespaceSlot;

export interface FeatureManifest {
  /** Config keys → impl refs (true = whole surface / whole namespace). */
  slots: Record<string, FeatureSlot>;
  /** Pack streams this feature reads (informational, per-locale v0). */
  data: string[];
  /** True when the feature needs the locale's decoded pack. */
  needsLocaleData: boolean;
  /** Runtime factory the generated client assembles this feature with. */
  factory: 'makeDecimalFactory' | 'makeCurrencyFactory';
}

export interface Manifest {
  /** Every locale the runtime ships packs for (lazy mode maps ALL of them). */
  locales: readonly string[];
  features: Record<string, FeatureManifest>;
}
`;

export const renderManifest = (d: DerivedManifest): string => {
  const features = Object.entries(d.features)
    .map(
      ([name, f]) => `    ${name}: {
      factory: '${f.factory}',
      data: [${f.data.map((s) => `'${s}'`).join(', ')}],
      needsLocaleData: ${f.needsLocaleData},
      slots: {
${renderSlots(f.slots, '        ')}      },
    },`,
    )
    .join('\n');
  return [
    '/**',
    ' * Generated by scripts/scan-manifest.ts — DO NOT EDIT. Regenerate with pnpm scan:manifest.',
    ' *',
    ' * Derived from the source of truth: the *Api interfaces in src/api.ts (slot surface),',
    ' * the impl modules (each ref verified to exist), factory.ts, and the packs/',
    ' * directory (locales). The package.json exports map is derived from the same',
    ' * run: the runtime\'s public surface is exactly its slot refs (no wildcard',
    ' * reachability for internals). Per-feature pack-stream metadata is declared',
    ' * in FEATURE_META in the scanner. Freshness is enforced by',
    ' * packages/cldr/__tests__/manifest.test.ts (same pattern as the pack assets).',
    ' */',
    TYPES,
    `export const manifest: Manifest = {\n  locales: [${d.locales.map((l) => `'${l}'`).join(', ')}],\n  features: {\n${features}\n  },\n};\n`,
  ].join('\n');
};

// ---------------------------------------------------------------------------
// CLI

const isMain = (): boolean => {
  const argv1 = process.argv[1];
  return argv1 !== undefined && pathToFileURL(argv1).href === import.meta.url;
};

if (isMain()) {
  const derived = deriveManifest();
  const out = renderManifest(derived);
  writeFileSync(MANIFEST_PATH, out);

  const exportsMap = deriveExports(derived);
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as Record<string, unknown>;
  pkg.exports = exportsMap;
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`);

  const featureSummary = Object.entries(derived.features)
    .map(([name, f]) => `${name}: ${Object.keys(f.slots).length} slots`)
    .join(', ');
  console.log(`scan-manifest: wrote ${MANIFEST_PATH}`);
  console.log(`scan-manifest: wrote ${PKG_PATH} exports (${Object.keys(exportsMap).length - 3} slot subpaths)`);
  console.log(`scan-manifest: locales [${derived.locales.join(', ')}], ${featureSummary}`);
  console.log('scan-manifest: all slot refs verified (module + export)');
  for (const line of derived.info) {
    console.log(`scan-manifest: info — ${line}`);
  }
}
