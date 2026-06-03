# Packaging Sketch: cldr-2.x Repo Layout

## Relationship to the other docs

[alt-api-sketch.md](./alt-api-sketch.md) and [codegen-api-sketch.md](./codegen-api-sketch.md)
work out the runtime API shape and how tree-shaking is achieved (via a build-time generator
producing a concrete `cldr.gen.ts`, per the codegen doc). This doc covers the repo/package
structure a `cldr-2.x` rewrite would live in to support that: what's published, what's
workspace-private, and how to avoid a circular dependency between the runtime and the tooling
that both compiles CLDR data and generates consumer clients — a real risk carried over from how
1.x's `cldr-compiler` already depends on runtime code today.

## Two public packages, as agreed

- **`@phensley/cldr`** — the runtime. Isomorphic, tree-shakable, no Node-only dependencies. What
  a consumer's app actually bundles and ships to a browser or server.
- **`@phensley/cldr-generate`** — the generator. A Node-only CLI/programmatic tool a consumer
  runs in their own project (reading their `cldr.config.ts`) to produce `cldr.gen.ts`, per
  [codegen-api-sketch.md](./codegen-api-sketch.md#4-a-generator-that-emits-a-concrete-client).
  Not something an app bundles into its shipped output — it runs at the consumer's build time,
  analogous to the Prisma CLI.

Everything else in the repo is workspace-private and never published — but "everything else"
turns out to need splitting into two pieces, not one, to avoid the circular dependency.

## The circular-dependency risk

In 1.x, `cldr-compiler` depends on runtime code — presumably things like locale identifier
parsing (BCP-47 parsing, likely-subtag matching) and the type definitions describing the shape
of compiled data, since the compiler needs to *produce* data in the same shape the runtime
*consumes* it in. That's a real, legitimate shared-code need, not an accident.

The trap in 2.x is that the **generator** has the same need (it has to understand the reference
implementation's shape to generate against it) while the **data pipeline** also needs runtime
code, and the **runtime**'s own build depends on the data pipeline's output (compiled locale
data). If "runtime code" the pipeline/generator need is defined *inside* the runtime package
itself, you get:

```
data-pipeline ──needs source from──▶ runtime
runtime ──needs build output from──▶ data-pipeline
```

Two different *kinds* of edges are tangled together here, worth naming explicitly because they
have different implications:

- **Source/module dependency** (data-pipeline importing runtime's parsing utilities) — this is
  the kind that causes real circular-import problems, breaks TS project-reference build
  ordering, and is what "avoid a circular dependency" usually means.
- **Build-artifact dependency** (runtime's build consuming data-pipeline's *compiled data
  output* as an input file, not importing its source) — this is a pipeline ordering constraint,
  not a module cycle. Runtime never imports a line of data-pipeline's TypeScript.

The second kind is fine and unavoidable — the data has to be compiled before runtime can bundle
it. The first kind is the one to actually eliminate.

## The fix: a small shared leaf package

Pull the specific things both the data pipeline and the generator need out of runtime
entirely, into a fourth, workspace-private package with **zero internal dependencies of its
own** — a true leaf:

- **`internal/core`** (name TBD, e.g. `cldr-core`) — locale identifier parsing/normalization,
  likely-subtag matching, and the wire-format type definitions/codecs describing compiled data —
  whatever pure, dependency-free logic is shared between "produces this data" and "reads this
  data" or "understands this shape."

```
                 internal/core   (leaf — no deps)
                  │      │      │
        ┌─────────┘      │      └──────────────┐
        ▼                ▼                     ▼
internal/data-pipeline  @phensley/cldr   @phensley/cldr-generate
  (private, never          (public,           (public, depends
   published)               bundles core       on core +
                             in)                runtime's /internal
                                                 subpath)

internal/data-pipeline ──produces build artifacts consumed by──▶ @phensley/cldr's build
```

Nothing points back into `data-pipeline` from anywhere. `runtime` and `generator` both depend on
`core`, `data-pipeline` depends on `core`, and the only edge into `data-pipeline` is "its output
file gets read by runtime's build step" — an artifact dependency, not a module import. No cycle.

Since `internal/core` is workspace-private and small, it doesn't need to become a *third* public
package to satisfy the "two public packages" goal — both `@phensley/cldr` and
`@phensley/cldr-generate` bundle it into their own build output directly (their bundler inlines
the workspace source), rather than depending on it as a resolvable npm package at install time.
`data-pipeline`, being private-to-private, can just reference it as an ordinary workspace
dependency with no bundling step needed.

## Where the generator's "compile-only namespace" lives

From the earlier packaging discussion: the generator needs to read the reference implementation
(the rich, unfragmented internal version of `Decimal`, `Currency`, etc. described in
[codegen-api-sketch.md](./codegen-api-sketch.md#1-a-reference-implementation--normal-code-no-fragmentation))
and its manifest. Since the generator already depends on `@phensley/cldr` directly (one
direction only, no cycle), the cleanest place for this is a **Node-only subpath export** on the
runtime package itself, gated by an `exports` condition so a browser-targeting bundler resolving
the plain `.` entry point never touches it:

```jsonc
// @phensley/cldr package.json
{
  "exports": {
    ".": { "import": "./dist/runtime/index.js" },        // isomorphic, tree-shakable — what apps ship
    "./internal": { "node": "./dist/internal/index.js" }  // reference impl + manifest — generator only
  }
}
```

`@phensley/cldr-generate` imports from `@phensley/cldr/internal`; ordinary consumer apps only
ever import from `@phensley/cldr` and never see (and a browser bundler never resolves) the
`./internal` subpath. This keeps the "compile-only namespace inside the overall package" idea
from the earlier discussion, expressed as a conditional export rather than a separate publish
step — the generator and the reference implementation it reads ship in lockstep, atomically,
with no version-skew risk between them.

## Build artifacts and tooling

**ESM-only is the modern default, with one real caveat for this project.** The ecosystem
consensus has moved from "publish CJS, add ESM as a bonus" to ESM-only for new libraries:
Node has supported ESM stably since v14, and shipping both formats risks the *dual-package
hazard* — a consumer's dependency graph loading two separate module instances (one via
`require()`, one via `import`), which silently breaks anything relying on shared module state,
`instanceof` checks, or singletons across the two realms. Dual publishing also roughly doubles
build and type-declaration complexity (`.d.ts`/`.d.mts`/`.d.cts`, separate `exports` conditions).
Prominent library authors (sindresorhus's chalk, execa, got, etc.) have moved ESM-only for
exactly these reasons, and that's the recommended default for `cldr-2.x`. **The caveat:** since
cldr-engine already has several internal production consumers, this is a fact-dependent decision,
not a pure style call — worth auditing whether any current consumers require CJS/older bundler
support before committing to ESM-only.

**What the published `@phensley/cldr` package contains:**

- Compiled `.js` (ESM, `"type": "module"`), matching `.d.ts`, plus `.d.ts.map`/`.js.map` source
  maps for consumer debuggability.
- A `package.json` `"exports"` map as the entry-point mechanism (superseding `"main"`/`"module"`/
  `"browser"`) — this is also the mechanism behind the `./internal` subpath gating above.
- An explicit `"sideEffects"` field (`false`, or an array) — still essential even without
  prototype-patching, since it's what licenses a consumer's bundler to drop unused imports.
- No raw `.ts` source required (shipping it alongside `.d.ts.map` for "go to definition" into
  real source is a nice-to-have, not a requirement).
- If dual CJS/ESM is later found necessary: add `.cjs` + `.d.cts` output and `"import"`/
  `"require"` `exports` conditions per entry point, rather than the legacy `"main"`+`"module"`
  pair.

**Don't fully bundle the runtime's dist — preserve module structure.** The published package
should mirror its source module structure (one output file per source module) rather than
collapsing into one or a few bundled files, for two reasons specific to this design: ordinary
tree-shaking granularity for any consumer importing `@phensley/cldr` directly, and — more
specifically — the generator's literal imports (`import { compare } from
'@phensley/cldr/internal/decimal/compare.js'`) need real, individually-addressable files to point
at, not a monolithic internal bundle. This favors **Rollup with `preserveModules: true`**, or
`unbuild` (the unjs ecosystem's Rollup-based library bundler, with good "preserve per-module
output, inline workspace deps" defaults), over the single-file-bundle default of `tsup`/plain
esbuild. `@phensley/cldr-generate`'s own CLI entry point is a different case — a Node tool a
consumer runs directly rather than something a bundler tree-shakes — so bundling that into one
executable file with `tsup`/esbuild is fine.

**How `internal/core` actually lands inside the published runtime.** It's never published as its
own npm package. Each public package's own build step treats it as a workspace-local module to
*inline*, not an external dependency:

```javascript
// rollup.config.js for @phensley/cldr
export default {
  external: (id) => !id.startsWith('.') && !id.startsWith('@cldr-internal/core'),
  output: { preserveModules: true, format: 'esm' },
};
```

Rollup resolves `internal/core`'s TypeScript source directly and compiles it into the runtime
package's own dist as part of the runtime's build — by publish time there's no unresolved
`internal/core` import left; its code is physically part of the runtime's output tree (e.g.
`dist/internal-core/parseSubtags.js` sitting alongside `dist/decimal/compare.js`).
`@phensley/cldr-generate` does the same independently in its own build, so each public package
ends up with its own small inlined copy. One consequence worth noting: because `internal/core`
is always inlined rather than depended on as a resolvable package, it doesn't need its own
`package.json`, semver, or publish lifecycle at all — a plain shared TypeScript source directory
wired up via a workspace path alias or TS project reference is sufficient.

**Inlined code is just as tree-shakable as the rest of the mirrored tree — with three caveats
worth being deliberate about.** Once `internal/core` is resolved as part of the same module
graph (non-external), Rollup's `preserveModules` treats its files exactly like any other node in
that graph: each becomes its own output file, deduped (two runtime files importing the same core
function share one emitted file, not two copies), and a downstream consumer's bundler sees
individually importable ES modules with named exports regardless of which original workspace
package they came from. Nothing about "having been inlined" survives as a marker in the
published output. What actually determines whether this holds in practice:

1. `internal/core` itself has to be written tree-shaking-friendly — named exports, no
   module-scope side effects, no `export *` barrel that obscures which specific symbols are
   used.
2. The **published package's** `"sideEffects"` field has to cover the *merged* file set — since
   `internal/core` has no `package.json` of its own once inlined, its side-effect status is
   inherited into whichever public package absorbed it.
3. `preserveModulesRoot` needs correct configuration so core's files land at a sane, predictable
   path under the runtime's dist, rather than Rollup mirroring the workspace's actual relative
   directory structure (which can produce `../`-escaping output paths when inlining a sibling
   workspace package rather than a subdirectory of the same project).

**Committing to ESM-only unlocks dynamic `import()` as the locale-data loading mechanism.** 1.x
avoided dynamic `import()`, likely because it has real interop quirks when called from a
CommonJS build in a dual-publish world. That constraint disappears once 2.x is ESM-only — every
modern bundler treats `import()` as its native, first-class code-splitting primitive. See
[codegen-api-sketch.md](./codegen-api-sketch.md#locale-data-loading-eager-vs-lazy) for how this
splits generator output into an eager mode (closed locale list → static synchronous imports, no
async at all) versus a lazy mode (open locale set → per-locale `import()`, one bundler-managed
chunk per locale). Both modes are worth exercising in the prototype below, since they stress
different parts of the build (static tree-shaking vs. runtime code-splitting correctness).

**Validation tooling worth wiring into CI from day one:** `arethetypeswrong` (attw) — checks
that the `exports` map resolves to correct types under every `moduleResolution` mode a consumer
might use, directly relevant given the conditional `./internal` export — and `publint` — general
package.json/publishing correctness. Both are cheap, automated, and catch "conditional export
resolves to the wrong `.d.ts` for some consumer's TS config" before it ships.

## Validation plan: skeletal prototype + isolated publish/consume cycle

Before committing to this structure for the real `cldr-2.x` rewrite, prototype it end-to-end in
skeletal form, mirroring how [objective-assessment.md](./objective-assessment.md) validated the
original prototype-patching technique against `packages/decimal` + `examples/treetwo`:

- Scaffold the four packages (`internal/core`, `internal/data-pipeline`, `@phensley/cldr`,
  `@phensley/cldr-generate`) with minimal stub contents — a couple of `internal/core` functions
  (one used, one deliberately unused), a couple of runtime methods depending on them, and a
  minimal generator that reads a config and emits a `cldr.gen.ts`.
- Verify the build produces the expected per-module output structure and that the unused
  `internal/core` export is actually absent from a downstream bundle (esbuild or webpack) —
  confirming the tree-shaking mechanics above hold in practice, not just in theory.
- Stand up a private registry (Verdaccio) and run the **full** publish → install → consume cycle
  in a completely separate client project: `npm publish` both public packages to the local
  registry, install them fresh in an isolated app (not a workspace symlink), run the generator
  against a `cldr.config.ts` there, and bundle the result. This is the step that catches
  packaging mistakes workspace-linked development hides — symlinked workspace packages resolve
  differently than a real `npm install` from a registry, so `exports` map correctness, the
  `./internal` gating actually blocking browser resolution, and `.d.ts` resolution under a
  consumer's own `moduleResolution` setting all need to be checked against a real install, not
  just against the monorepo's own dev environment.
- **Exercise both locale-data loading modes against a few distinct real-world client shapes**,
  not just one toy app, since eager and lazy mode stress different parts of the toolchain:
  - A **fixed-locale SPA** (`locales: ['en', 'es-419', 'fr']`, eager mode) bundled with a
    mainstream bundler (Vite/webpack) — confirm the final bundle contains zero runtime async for
    locale data and no data for unrequested locales leaks in.
  - A **server app resolving an arbitrary per-request locale** (`locales: { lazy: true }`) —
    confirm `preload(locale)` triggers a real per-locale `import()`, that repeated `preload`
    calls for the same locale don't reload, and that `.get()` throws clearly if called before
    `preload` for that locale.
  - A **bundler with weaker code-splitting support** (a minimal esbuild config, or a
    Rollup config without explicit chunking set up) exercising lazy mode — confirm the generator's
    literal-per-locale `import()` output degrades sensibly (e.g. still correct, if less
    optimally chunked) rather than silently breaking or inlining every locale anyway.
  - A **mixed-feature case** — eager decimal/currency for a small locale set alongside lazy
    calendar data for a broader one — to confirm the two modes can coexist within one generated
    client without one mode's assumptions leaking into the other.

## Package list

| Package | Published? | Depends on | Role |
|---|---|---|---|
| `internal/core` | No (bundled into both public packages) | nothing | Shared pure logic + wire-format types, the leaf that breaks the cycle |
| `internal/data-pipeline` | No | `internal/core` | Successor to `cldr-compiler`; compiles raw CLDR data into the runtime's data assets |
| `@phensley/cldr` | Yes | `internal/core` (bundled) + `internal/data-pipeline`'s build output (artifact only) | Runtime: isomorphic, tree-shakable, ships an `./internal` subpath for the generator |
| `@phensley/cldr-generate` | Yes | `internal/core` (bundled) + `@phensley/cldr/internal` | Consumer-facing CLI/programmatic generator, Node-only |

## Open questions

- **Naming and exact contents of `internal/core`.** Worth an explicit audit of what 1.x
  `cldr-compiler` actually imports from runtime today, to scope what has to move into the leaf
  package versus what can stay purely inside runtime (or purely inside the data pipeline).
- **Monorepo tooling.** pnpm/yarn workspaces plus a task runner (Turborepo or Nx) would enforce
  the build order (`core` → `data-pipeline` and `runtime` in parallel → `generator`) and can
  fail the build if a forbidden edge (e.g. `internal/core` importing anything) appears — worth
  wiring a dependency-graph lint (dependency-cruiser or similar) as a CI check from day one,
  rather than relying on convention to keep `core` a true leaf as the repo grows.
- **Does the generator need compiled data directly, or only loader functions?** As sketched, the
  generated client imports data-loading functions that already live in `@phensley/cldr`'s
  published data assets (produced by `data-pipeline`'s build step) — the generator itself likely
  never needs `data-pipeline`'s output directly, only the runtime's. Worth confirming this holds
  once the manifest's actual shape is designed, since a counterexample would reintroduce a
  generator → data-pipeline edge to think about.
- **`./internal` subpath scope creep.** Once it exists, it's tempting to reach for it from
  tests, docs tooling, or benchmarks in this repo too — fine in principle, but worth deciding
  whether that's an explicitly supported use or something to route through `internal/core`/a
  dedicated dev-tools package instead, so `./internal`'s surface stays scoped to "what the
  generator needs" rather than becoming a second, semi-public API by accretion.
