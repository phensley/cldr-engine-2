# Retro: the cldr 1.x resource pack format → what 2.x changes

(`cldr-engine` packages/cldr-compiler/src/resource + cldr-core/src/resource),
the bench-marked re-baselines, and a review discussion. Measurements:
`notes/pool-rebaseline.md`, `notes/s1-benchmark.md`, `notes/s2-bundle-table.md`;
design: `plans/real-data-pack-design.md`, `plans/pack-format-spec.md`._

## The 1.x format — what it got right

- **Base + exceptions structure.** One base layer per language+script
  (min pairwise-distance locale, e.g. en-001 for English), a layer-level
  exceptions pool deduped across all regions, sparse per-region
  `(fieldIndex, valueIndex)` maps, lazily decoded and cached. The
  structure is worth ~3.5× on the wire — measured in 2.x's scenario A.
- **Element-granular deltas for arrays** (each vector position is its own
  field — a locale differing in one month stores one delta).
- **Cheap deltas by construction**: one global field order, offsets
  aligned across layers.
- **A compact transport** (`_`-joined strings, base-36 numarrays,
  manual escaping) — real encoder craft, though gzip-neutral.

## Reactions and follow-ups

### 1. Fair correction: 1.x could already generate custom packs

Custom packs for a chosen language + region list were possible via a
special build-time `cldr-compiler` invocation — that's acknowledged; it
was a separate, explicit tooling step, not the default consumer flow.

What 2.x still adds on top of that precedent:

- the generator is the *primary, integrated* consumer flow
  (`cldr.config.ts` → `cldr.gen.ts` in the app's own build);
- granularity extends below the pack level: per-locale modules, per-
  method feature selection (bundles scale with config: 8.6 KB
  decimal-only → 18.2 KB all-features), verified absent from the bundle;
- the *layout* (literals vs base+delta vs shared pools) is selected per
  config at generate time — 1.x's custom-packs made the language set
  configurable; 2.x makes the encoding structure configurable too.

### 2. Transport — agreed, and measured

Pools as JSON array literals: smaller raw, 2–4× smaller gzipped than the
X85 chain at scale (pool C: 9.8 KB vs 63.8 KB gz), zero decode, no
delimiter restrictions (1.x had to exclude the characters/punctuation
field). GVE16/X85 remains for embedded numeric tables.

### 3. Numeric delta tables — what the numbers say per shape

Benchmark scenario C (300 entries, 60% zeros, 25% ±1, 10% <10, 5% <1000,
20 diffs ±1..±3): full u16 tables 1,624 B vs base+delta 1,249 B —
**23% raw / 34% lazy-gz smaller**. Checked against two CLDR-real shapes:

| Shape | Example | Result |
|---|---|---|
| small uniform values (0..3) | currency fraction digits (300 codes: mostly 2, ~30× 0, 6× 3) | full 870 B = delta 870 B — **delta buys nothing** (GVE16 varints already optimal) |
| large flat values, few diffs | zone offsets in seconds (375 rows @ 18 000 s, 12 diffs ±3 600) | full 2 010 B vs delta-in-hours (+128 bias) 1 540 B — **23% smaller** |

So the rule is **per-table**: delta-encode when the common value's
magnitude is large relative to its deltas (or deltas are unit-scalable);
keep full u16 when values are already small. The compiler should decide
per table — and picking the *unit* (hours vs seconds) is part of the
encoding decision, not an accident of the source data.

### 4. The 2.x bundle loading scheme — how apps load packs at runtime

The generated `cldr.gen.ts` is the entire loading surface; there is no
hand-rolled fetch/parse loader. Two modes:

**Eager (closed locale set, e.g. an SPA with a fixed language list):**

```
import { en, fr, de } from '@phensley/cldr/packs/...';   // static imports
export const cldr = createCldr({ lazy: false, locales: ['en','fr','de'] as const,
                                 packs: { en, fr, de }, build });
cldr.get('fr')   // fully synchronous, zero async
```

- All packs live in the initial bundle — one file in eager builds, where
  gzip dedups the cross-locale text overlap for free.
- `get()` canonicalizes the tag (shared `resolveLocale`, case-insensitive,
  typed to the configured literal union), decodes the pack's numeric
  streams once (tries, tables — ~µs), builds the feature namespace, and
  caches per locale. Subsequent calls are cache hits.

**Lazy (open set, e.g. a server resolving an arbitrary visitor locale):**

```
packs: {
  en: () => import('@phensley/cldr/packs/en').then(m => m.en),   // literal specifiers
  fr: () => import('@phensley/cldr/packs/fr').then(m => m.fr),
  ...   // every known locale, emitted literally — never an interpolated string
}
await cldr.preload('fr')   // the ONLY async seam; idempotent
cldr.get('fr')             // synchronous after preload; throws clearly before it
```

- The literal `import()` per locale is the bundler's native
  code-splitting primitive: esbuild/Vite/webpack emit **one chunk per
  locale** (measured: 4 locale chunks in a 5-file lazy build).
- **Locale switch flow:** user picks a locale → the app awaits
  `cldr.preload(next)` (possibly ahead of render, at the router layer) →
  render reads `cldr.get(next)` synchronously.
- **Base+delta layouts compose with chunking:** with a shared base
  module, the bundler hoists it into one shared chunk imported by every
  locale chunk — the first preload fetches base + that locale's delta;
  subsequent preloads fetch only the small delta chunks. Static imports
  cross chunk boundaries by the same mechanism.
- **Caching:** pack modules are pure data → immutable chunks, long HTTP
  cache lifetimes; the entry chunk changes only when config/features
  change. `preload` never re-fetches a loaded locale.
- **Node/SSR:** identical mechanism (native ESM dynamic import); eager
  mode in a server is fully synchronous.

vs 1.x: async per-language JSON fetch + `Pack` parse at runtime, all
regions inside the language pack. 2.x shifts resolution and merging to
build time (falls back resolved at compile; delta merge-once at preload)
and leaves the app's runtime with a single `preload`/`get` pair.

### 5. Runtime/build-time split — agreed

1.x paid per-access indirection, per-`get()` bundle construction and
runtime language-pack parsing; 2.x pays once at preload (a u16 merge for
deltas, tens of µs) and is index-only afterwards.

## Open items carried forward

- Re-validate scenario crossover points with real CLDR data (real
  duplication/entropy differs from synthetic pools).
- Per-table delta decision in the compiler (section 3 above).
- The generator's layout selection implements
  `plans/real-data-pack-design.md` §3 once real data lands.
