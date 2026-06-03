# Cleanroom Prototype Plan — cldr-engine 2.0

Status: **approved, phase 0 (skeleton) complete**

This is the working plan for the cleanroom prototype. It implements the design
direction already sketched in this repo's docs (see [Context & docs](#context--docs)),
per the decisions recorded below.

---

## 1. Objective

Prototype a cldr-engine 2.0 that satisfies the three goals from
[notes/overview.md](../notes/overview.md):

1. **Minimize the code and resource-pack footprint**
2. **Modular** — add only the packages you need
3. **Granular** — select only the locales and features you need

The prototype must *prove* each goal with measurements, not just sketches.

## 2. Approved decisions

| # | Decision | Notes |
|---|---|---|
| D1 | **Codegen is the mechanism** | Per `plans/codegen-api-sketch.md`: ordinary reference implementation + manifest + generator emitting a literal, already-minimal `cldr.gen.ts`. Tree-shaking is a property of what the generator emits. No runtime composition, no prototype patching. |
| D2 | **Synthetic data first ("mini-cldr")** | Hand-authored dataset sized to exercise every codec and selection path. Real CLDR data integration is out of scope until the mechanism is proven. |
| D3 | **Work in the target repo layout** | Four-package structure from `plans/packaging-sketch.md`; spikes land in their final homes, no throwaway spike directories. |
| D4 | **Encoding module = `internal/core`** | Moved from the old repo (`cldr-engine-ng/encoding/` → `internal/core/`). It seeds the leaf package's wire-format codec layer. |
| D5 | **Plan-first workflow** | This doc is the single source of truth for scope; the orientation doc (`ORIENTATION.md`) sets context for fresh sessions. |

## 3. Context & docs

Migrated from the old repo (`cldr-engine-ng`); read these for the full design
narrative:

- `plans/objective.md` — original prototype-patching approach (validated, then rejected for its silent-runtime-failure flaw; see assessment)
- `plans/objective-assessment.md` — verdict on patching; seeding the "configurator" idea
- `plans/alt-api-sketch.md` — runtime composition alternative (fixed-shape APIs survive into this plan)
- `plans/codegen-api-sketch.md` — **the mechanism this prototype implements** (eager/lazy locale modes, config shape, generator output)
- `plans/packaging-sketch.md` — **the repo/package layout this prototype follows** (4 packages, ESM-only, `./internal` subpath, Verdaccio validation)
- `notes/*` — overview, design criteria, links

## 4. Architecture

```
                 internal/core        (leaf — zero deps; seeded from the old encoding module)
                  │      │      │
        ┌─────────┘      │      └──────────────┐
        ▼                ▼                     ▼
internal/data-pipeline  @phensley/cldr   @phensley/cldr-generate
  (private, never          (public,           (public, Node-only
   published)               bundles core       CLI; consumes runtime's
                             in; ships            ./internal subpath)
                             ./internal
                             subpath)
internal/data-pipeline ──produces pack assets consumed by──▶ @phensley/cldr's build
```

- **`internal/core`** (`@cldr/internal-core`, private, name TBD): the wire-format
  codec layer + future locale-id parsing. Today it holds the migrated binary
  (X85, GVE16) and array-trie modules. Dependency-free, isomorphic.
- **`internal/data-pipeline`** (`@cldr/data-pipeline`, private): successor to
  `cldr-compiler`. Compiles mini-cldr datasets into pack assets (X85 strings in
  TS modules) using core's codecs.
- **`@phensley/cldr`** (public): the runtime. Reference implementation (rich,
  ordinary classes — never fragmented), fixed-shape API per type, per-locale
  pack assets, plus a Node-gated `./internal` subpath exposing the reference
  implementation + manifest to the generator.
- **`@phensley/cldr-generate`** (public): CLI/programmatic generator. Reads a
  consumer's `cldr.config.ts` + the runtime's manifest → emits `cldr.gen.ts`.

## 5. Pack format v0 (spike 1 subject)

The chain that makes every data structure embeddable in ESM source:

```
data (trie | pools | offsets)  →  number[]  →  GVE16  →  Uint8Array  →  X85  →  string
```

| Data shape | Mechanism | Where |
|---|---|---|
| key→value maps (BCP-47 tags, currency/region codes) | array trie (case-insensitive search, exact-case bias) | `internal/core/src/trie` |
| 16-bit number arrays | GVE16 group varint (≈44% savings for small values) | `internal/core/src/binary` |
| arbitrary bytes embedded in JS/TS/JSON | X85 custom ASCII85 (no escapes, +25% vs base64 +33%) | `internal/core/src/binary` |
| string pools (display names, patterns) | utf8 bytes via X85 (decided S1; utf16/GVE16 measured and rejected) | `internal/core/src/binary` |

**Open questions resolved in S1 (measurements in `notes/s1-benchmark.md`, spec in `plans/pack-format-spec.md`):**

- **16-bit ceiling** — chunked pools; u16 everywhere; GVE32 rejected
  (3.1× offsets cost at stress scale). Compile guard throws loudly on
  overflow.
- **String-pool codec** — utf8 (UTF-8 bytes via X85); utf16 loses on
  bytes and decode speed. Plain-literal pools re-baselined when real
  CLDR data lands.
- **Trie value semantics** — pool indices, with per-dataset record tables
  (currency-table pattern) as the general escape hatch.
- **Honest caveat** — the codec chain is not a wire-compression play:
  gz(raw JSON) beats gz(pack) at every measured scale; the chain earns
  bytes via structure/decode/selection.

## 6. Surfaces (spike 2 subject)

Consumer-facing shapes, fixed in spike 2, driven by the codegen doc:

```typescript
// cldr.config.ts (consumer-authored)
export default defineConfig({
  locales: ['en', 'es-419', 'fr'],   // closed set → eager, fully synchronous
  // { lazy: true }                  // open set → per-locale import(), preload seam
  features: {
    decimal: { compare: true, min: true, format: { scientific: true } },
    currency: true,                  // shorthand: whole surface
  },
});
```

```bash
npx cldr-generate --config cldr.config.ts --out src/cldr.gen.ts
# emitted: literal static imports (eager) or a literal per-locale import() map
# (lazy); locale param narrowed to the config's literal union
```

- Reference implementation: plain classes, full method sets, `#private` fine.
- Fixed-shape API interfaces per type (from `alt-api-sketch.md`):
  `DecimalApi`, `CurrencyApi`, ... — config selects a subset of a known shape.
- Manifest: derived, not hand-authored — `scripts/scan-manifest.ts`
  (`pnpm scan:manifest`) derives the slot surface from the `*Api` interfaces
  in `src/api.ts`, verifies every ref against the impl modules + package
  exports + factory.ts, and derives `locales` from the packs dir; pack-stream
  metadata (`data`, `needsLocaleData`) is declared in the scanner's
  FEATURE_META. Freshness enforced by `packages/cldr/__tests__/manifest
  .test.ts`.
- Locale resolution: `cldr.get(locale)` synchronous; `preload(locale)` before
  `.get()` in lazy mode; `resolveLocale` shared across features (no Intl.*
  re-resolution).

## 7. Mini-cldr dataset (spike 1 subject)

Synthetic, hand-authored, sized to exercise every path. Proposed shape:

| Dataset | Locale-independent? | Codec exercised | Ideal stress |
|---|---|---|---|
| Territory display names (`GB` → "United Kingdom", `ES` → "España") | per-locale | trie + string pool (non-ASCII!) | ~10–20 keys/locale |
| Currency symbols + fraction digits (`USD` → `$`, 2) | per-locale | trie (small values) | ~5 currencies/locale |
| Number format patterns (decimal/percent/currency) | per-locale | string pool | 2–3 patterns/locale |
| Numeric table (e.g. synthetic "zone offsets") | shared | GVE16-only | mix of small + near-65535 values |

Locales: `en`, `fr`, `de`, `es-419` (4th exercises a region-subtag).

Selection demo: `locales: ['en']` must ship nothing for `fr`/`de`; a
`currency: true` config must pull currency data, a `decimal`-only config must
not.

## 8. Spikes

### S0 — Skeleton (DONE)

- Repo scaffolded at `internal/core/` with the migrated encoding module.
- pnpm workspaces, vitest, strict NodeNext tsconfig. `pnpm test` green
  (17 tests), `pnpm typecheck` clean.
- Reconstructed missing test helpers (`random.ts`, `permutation.ts`) from call
  sites; later **restored from the author's originals** (one debug
  `console.log` removed). Flagged in ORIENTATION.md.
- Migration notes: `trie-off/` experiments and `*.test-off.ts` left behind in
  cldr-engine-ng.

### S1 — Pack format & data pipeline (DONE)

- `internal/data-pipeline` compiles the mini-cldr dataset (territories,
  currencies, patterns, shared numeric table; en/fr/de/es-419) into pack
  TS modules (`pnpm generate:packs`; committed under `generated/`,
  freshness test keeps them honest).
- Both pool codecs benchmarked; utf8 decided; 16-bit question settled
  (chunked pools); size/perf tables in `notes/s1-benchmark.md`;
  **deliverable: `plans/pack-format-spec.md`**.

### S2 — Selection mechanism: reference impl + manifest + generator (DONE)

- `@phensley/cldr`: reference impl as per-method tree-shakable modules
  (decimal: compare/min/max/movePoint/format.{scientific,pattern};
  currency: format/symbol/fractionDigits), fixed API shapes (`DecimalApi`/
  `CurrencyApi` — config selects a subset of a known shape; unselected
  slots are compile-absent), `makeDecimalFactory`/`makeCurrencyFactory`
  vtable assembly, `createCldr` runtime (eager: fully sync; lazy: literal
  per-locale `import()` map + `preload` seam; `get()` narrowed to the
  configured union), shared `resolveLocale` (no per-feature re-resolution).
- Manifest (generated, `src/manifest.ts`, via `./manifest` subpath; see
  `scripts/scan-manifest.ts`): feature → public slots → module refs +
  factory + needsLocaleData. Slot surface derived from `api.ts`; refs
  verified at scan time.
- `@phensley/cldr-generate`: `defineConfig`, manifest validation (errors
  list valid choices), literal-emission `cldr.gen.ts`; CLI reads a TS
  config via tsx. Committed clients in `examples/eager-app` + `examples/
  lazy-app` (regenerable-checked).
- Bundle-proof harness (`pnpm bundle-proof`, esbuild metafiles):
  `notes/s2-bundle-table.md`; absence + scaling assertions all green:
  decimal-only-en 8625 B / currency-en-fr 12946 B / all-4-eager 18220 B /
  all-lazy 18630 B (4 per-locale chunks; entry carries zero pack payload);
  unselected methods/locales physically absent from graphs.
- **S2 acceptance met**: unselected methods/locales absent (metafile +
  grep checks), bytes scale with config, eager = zero runtime async,
  lazy `preload` idempotent + `get()`-before-`preload` throws, `get()`
  narrowed to configured locales (eager).

### S3 — Packaging & publish cycle (DONE)

- Builds (`pnpm build`, scripts/build.ts): internal/core inlined into both
  public packages (src/_core copy + rollup preserveModules + rollup-plugin-
  dts — no published `.d.ts` references the private leaf); generator via
  tsc emit + esbuild-bundled CLI bin. Publish-shaped metadata: exports maps
  over `dist` (per-method subpaths; `./manifest` node-gated — the designed
  browser block), `files: [dist]`, `sideEffects: false`, engines, legacy
  main/types. Runtime's core dependency dropped (inlined); generator
  declares the runtime as a peer.
- dependency-cruiser enforces the 4-package layout: core imports nothing
  outside itself; data-pipeline is importable by no one (output-only);
  generator reaches the runtime only via `./manifest`.
- attw + publint (`pnpm packaging-check`): ESM-only CJS warnings +
  the designed `./manifest` node10/bundler block are the only problems.
- Verdaccio round-trip (`pnpm publish-roundtrip`): local registry →
  publish both → isolated consumer install (registry-only) → published
  CLI generates the client → tsc clean under NodeNext AND bundler
  resolutions (skipLibCheck off) → esbuild browser bundle reruns in node
  with dev-identical output and 0.7% byte parity vs workspace symlinks;
  `./manifest` blocked for browser platform, resolves under node;
  installed dist has zero private-package imports.

**S3 acceptance met**: full publish→install→generate→bundle round-trip in
an isolated project; `./internal`-equivalent (`./manifest`) unreachable
from a browser-targeted bundle; types resolve under NodeNext + bundler;
attw/publint clean per the explicit profile.

## 9. Sequencing & gates

```
S0 skeleton ──▶ S1 pack format ──▶ S2 selection mechanism ──▶ S3 packaging
      ▲              │                    │                        │
      └──────────────┴────────────────────┴────────────────────────┘
        (S1 and S2 touch disjoint code — may overlap; S3 needs S2's output shape)
```

| Gate | Exit criteria |
|---|---|
| S1 | Pack format spec v0 + size/perf numbers + 16-bit decision |
| S2 | Generator round-trip proven; absence assertions pass; size table recorded |
| S3 | Isolated-app publish/consume round-trip green; packaging checks clean |

## 10. Tooling

- pnpm workspaces (v11; `allowBuilds` for esbuild postinstall), Node ESM-only.
- TypeScript `NodeNext` + strict; `.js`-extension import specifiers (ESM-correct).
- vitest (globals) for tests; esbuild for bundle-proof harness (metafiles).
- S3: Rollup `preserveModules`/unbuild, dependency-cruiser, attw, publint,
  Verdaccio.

## 11. Out of scope (prototype)

- Real CLDR datasets; the full `cldr-compiler` data pipeline (real-data
  harness for the pack DESIGN is done — scripts/fetch-cldr-data.ts +
  benchmark-real.ts; the compiler input pipeline itself is not).
- Calendars, timezones, plural rules, relative time (beyond `decimal` +
  `currency` as the two proof features).
- ~~AST-scan manifest automation~~ done (`scripts/scan-manifest.ts`).
- Non-ASCII trie keys (code lookups are ASCII; display names live in pools).
- CJS dual-publish support (ESM-only; re-audit if a consumer needs CJS).
- DX tooling for the generator (watchers, bundler plugin, staleness checks).

## 11b. Follow-ups

- **Real-data pack structure** (`plans/real-data-pack-design.md`):
  1.x's base+exceptions overlap mechanism analyzed; improvement
  opportunities recorded (config-scoped layout selection, mask+
  compacted deltas, config-global value dedup via shared pools + u16
  index tables, numeric delta tables); the benchmark-pools extension
  measures the candidates before real CLDR data lands.
- ~~Real CLDR dataset integration (supersedes the mini-cldr compile
  path)~~ **DONE** — `scripts/fetch-cldr-data.ts` (pinned
  CLDR 48.2.1 cldr-json, sha256-pinned, extracts a 11-locale subset to
  gitignored `.cache/`, `pnpm fetch:cldr`) + `scripts/benchmark-real.ts`
  (`pnpm benchmark:real`) re-validates the design doc §3 layout table
  on real data → `notes/real-data-validate.md`: all four rows
  CONFIRMED, with the family eager-gz tie resolved in deltas' favor,
  the shared-pool rejection holding at 33.9% real overlap, and the
  numeric rule sharpened (unit scaling mandatory; non-varying tables
  excluded).
- ~~AST-scan manifest automation~~ **DONE** —
  `scripts/scan-manifest.ts` (`pnpm scan:manifest`) derives the manifest
  from the source of truth (`api.ts` `*Api` interfaces → slots; impl
  modules → refs verified; factory.ts, package.json exports, packs dir),
  so it cannot drift from the code. Committed + freshness-checked by
  `packages/cldr/__tests__/manifest.test.ts`.
- ~~Generator regeneration workflow (committed vs CI)~~ **DONE** —
  committed output + test-enforced freshness + idempotency gate
  (`pnpm regenerate`, `pnpm check:generated`); decision + pipeline order
  in `notes/regeneration-workflow.md`.
- **Real-CLDR compiler integration (next shelf item)** — scoped +
  decisions recorded (`plans/real-cldr-compiler.md`),
  NOT started. Greenfield 2.0 compiler: mini-cldr input path → real
  CLDR 48.2.1 slices; 11 locales, default numbering systems, tries+
  pools wire format v1, 1.x parity harness. Phases A–D, boundaries and
  follow-ups in the doc.

## 12. Open questions

**Decided — npm package naming:** keep `@phensley/cldr` and
release 2.0 as a major (2.0.0) under the same name; do NOT create
`@phensley/cldr2`. The line is one product, one name on npm — the codegen
mechanism is a breaking second major, which is exactly what npm majors
signal, and the name is mechanically replaceable in the manifest/
generator output if that ever changes. Until the real-CLDR validation
passes, publish nothing (stay at 0.0.0); pre-releases, if wanted, go out
as `2.0.0-rc.x` under the `next` dist-tag. Revisit only if 1.x evolves as
a parallel product line and the 2.0.0 tag on the flagship name would
mislead its consumers.

- `internal/core` naming (`@cldr/internal-core` provisional).
- Manifest: hand-authored in S2 — how much structure should it share with the
  eventual AST scan? **ANSWERED**: the scan derives everything
  structural (slots from `api.ts`, refs from impl modules, locales from the
  packs dir); only pack-stream metadata (`data`, `needsLocaleData`) is
  declared, in the scanner's FEATURE_META.
- Generator regeneration workflow (committed output vs CI-generated) — decide
  in S3. **ANSWERED**: committed artifacts everywhere, freshness
  test-enforced, plus `pnpm check:generated` idempotency gate (covers
  untracked/new files the per-artifact tests can't see). See
  `notes/regeneration-workflow.md`.
- Locale-bundle cache lifetime for short-lived `cldr` instances.
  **ANSWERED — per-client, deliberately.** All caches (decoded
  packs, built contexts, preload state) live inside the `createCldr`
  closure and die with the instance; no module-level/global cache, no
  WeakRef, no eviction logic — cross-instance isolation is structural
  (tested). Rationale: (1) the generated client is a module-scope
  singleton by construction (`export const cldr = createCldr(…)`), so
  per-client caches already have app lifetime in the intended usage;
  (2) sharing would need immutability contracts on decoded packs AND on
  consumer-supplied `build` closures, for a non-problem — decode is ~3
  µs on the en pack and the cost of re-creation (static imports) is
  already shared by the module graph; (3) apps that genuinely re-create
  often should hoist the client or pass their own decode Map — the
  runtime will not grow an implicit global cache. Locked in by
  `packages/cldr/__tests__/client.test.ts` (contexts repeat per client;
  preload state is per-client).
- Whether the reference implementation stays inside `@phensley/cldr`'s
  `./internal` or becomes its own private package (packaging-sketch says
  inside; revisit if the generator → runtime edge stays one-directional).
  **ANSWERED — stays inside `@phensley/cldr`, as its PUBLIC
  import surface; the sketch's `./internal` subpath is superseded.** The
  generator → runtime edge is one-directional (generator imports the
  runtime's manifest; runtime has zero published deps; depcruise
  enforced) — no cycle to escape by splitting the impl into a separate
  package — and the codegen model requires impl modules to be directly
  importable AND bundler-resolvable from generated clients (a
  node-gated `./internal` as sketched would break browser bundles of
  generated clients). Node-gating applies only to `./manifest`
  (generator-only; verified browser-blocked in S3). The hygiene goal of
  `./internal` — consumers not reaching internals — is now enforced
  structurally: the exports map is MANIFEST-DERIVED (`pnpm
  scan:manifest` rewrites `package.json` exports with explicit per-slot
  subpaths, no `./decimal/*` wildcards), so `decimal/state`,
  `currency/lookup`, `locale`, `factory` etc. are not importable
  (negative-resolution test). The manifest is literally the boundary
  between the public and internal surface.
