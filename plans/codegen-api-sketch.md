# Alternative API Sketch: Codegen-Generated Client

## Relationship to the other docs

[objective.md](./objective.md) and [alt-api-sketch.md](./alt-api-sketch.md) both try to make a
single, generically-composed runtime API tree-shakable — either by patching methods onto shared
class prototypes, or by composing typed instances from method maps the app assembles itself.
Both approaches spend real design effort fighting the same underlying tension: a bundler can only
eliminate what it can *statically* prove is unreachable, and a sufficiently generic runtime
composition mechanism makes that proof harder, not easier, the more flexible it gets.

This doc considers a different premise, deliberately in isolation from the other two: **stop
trying to make one generic runtime API tree-shakable, and instead generate a bespoke, already-minimal
client from a rich, ordinary, non-tree-shaking-constrained internal implementation.** Tree-shaking
stops being a property the runtime API has to earn through clever composition, and becomes a
property of what the generator chooses to emit.

## Precedent

This is a well-worn pattern for libraries with a surface area too large to hand-import
piece-by-piece, where consumers want a rich, fully-typed client but only a fraction of the total
surface:

- **Prisma Client** — reads your `schema.prisma`, generates a concrete client (`prisma.user.findMany()`)
  containing only the models/fields your schema defines, fully typed, no unused branches.
- **GraphQL Code Generator / tRPC** — reads your schema and query documents, emits typed
  operations for exactly the queries you wrote.
- **Stripe / protobuf / gRPC / OpenAPI-generated SDKs** — emit a concrete client from a schema or
  IDL, rather than shipping one universal client that tree-shakes down at build time.

None of these libraries ask their *internal* implementation to be tree-shakable. The internal
implementation is free to be a large, richly cross-referenced, ordinary codebase — classes with
full method sets, shared helpers, whatever is most maintainable to write and reason about. The
generator is the only thing that needs to know how to produce a minimal subset; consumers never
see, and never need to reason about, the mechanism.

## Architecture

**1. A "reference implementation" — normal code, no fragmentation.**

Every feature (`Decimal`, `Currency`, `Calendar`, ...) is written as an ordinary class or module
with its full method set, exactly like the current cldr-engine, with no prototype-patching,
WeakMap indirection, or method-map composition required. This package is never shipped to
consumers directly — it exists to be read by the generator (and used directly in this repo's own
tests/tools/docs), so none of its internals need to compromise for bundle size.

```typescript
// internal/decimal/decimal.ts — plain, complete, never shipped as-is
export class Decimal {
  compare(other: DecimalArg): number { /* ... */ }
  min(other: DecimalArg): Decimal { /* ... */ }
  max(other: DecimalArg): Decimal { /* ... */ }
  movePoint(n: number): Decimal { /* ... */ }
  format = {
    scientific: (options?: ScientificOptions): string => { /* uses this.movePoint(...) internally */ },
  };
}
```

**2. A manifest describing the reference implementation's structure.**

The same kind of AST scan named as a "medium investment" mitigation in
[objective-assessment.md](./objective-assessment.md#medium-investment-a-generated-dependency-manifest--lint-rule)
— but here it drives generation instead of a lint rule. A small scan over the reference
implementation produces, for every method/feature, its source location and internal
dependencies (`Decimal.format.scientific` depends on `Decimal.movePoint`), plus which locale-data
loaders each feature needs (`Currency` needs `currencyData` + `symbols`).

**3. A small, declarative spec the consuming app authors.**

```typescript
// cldr.config.ts
export default defineConfig({
  locales: ['en', 'es-419', 'fr'],
  features: {
    decimal: { compare: true, min: true, format: { scientific: true } }, // max, format.engineering omitted
    currency: true, // shorthand for "all of currency's public surface"
  },
});
```

Note this reuses the boolean-flag *input format* explicitly set aside in
[alt-api-sketch.md](./alt-api-sketch.md#booleans-vs-real-references-at-each-slot) as unsuitable
for a runtime `buildCldr` — here, flags are fine, because they're consumed by the generator at
build time, not interpreted at runtime. This is precisely the caveat noted there: boolean flags
work once something expands them into literal imports before the bundler sees them.

**4. A generator that emits a concrete client.**

```bash
npx cldr-engine-generate --config cldr.config.ts --out src/cldr.gen.ts
```

```typescript
// src/cldr.gen.ts — generated, committed or produced in CI, never hand-edited
import { compare } from '@cldr-engine/internal/decimal/compare.js';
import { min } from '@cldr-engine/internal/decimal/min.js';
import { scientific } from '@cldr-engine/internal/decimal/format/scientific.js';
import { movePoint } from '@cldr-engine/internal/decimal/movePoint.js'; // pulled in transitively — scientific depends on it
import * as currency from '@cldr-engine/internal/currency/index.js';
import { resolveLocale } from '@cldr-engine/internal/locale.js';
import { loadCurrencyData, loadSymbolsData } from '@cldr-engine/internal/data/currency.js';

const localeCache = new Map<string, LocaleContext>();

export const cldr = {
  get(locale: 'en' | 'es-419' | 'fr') {
    let ctx = localeCache.get(locale);
    if (!ctx) {
      const resolved = resolveLocale(locale);
      ctx = {
        decimal: { new: (raw) => makeDecimalInstance(raw, { compare, min, format: { scientific } }) },
        currency: currency.build(resolved, { currencyData: loadCurrencyData(resolved), symbols: loadSymbolsData(resolved) }),
      };
      localeCache.set(locale, ctx);
    }
    return ctx;
  },
};
```

The output is *literal* TypeScript — every import is real and static, so the bundler's ordinary
dead-code elimination is sufficient; there's no generic runtime dispatch left to reason about.
`locale` is even narrowed to the literal union of locales in the config, so passing an
unconfigured locale is a type error, not a runtime surprise — a nice side effect of generation
knowing your full intent up front.

## What this removes, compared to the runtime-composition track

- **No recursive composition types.** `Selected<T, F>`-style mapped types, the `this`-binding
  fix for nested namespaces, and the boolean-vs-real-reference distinction all disappear from
  the runtime — they either don't apply (the generated file is concrete) or get pushed into the
  generator's own code, which runs at build time and never ships.
- **No missing-import failure mode at all.** The single generated entry point contains exactly
  and only what the config declared. There's nothing left for a consumer to forget to import —
  removing the single biggest risk flagged in the assessment of the original prototype-patching
  plan, without needing a lint rule, manifest-driven checker, or dev-mode Proxy guard to catch it.
- **The internal implementation can be exactly as rich and conventional as you want.** No
  pressure to fragment `Decimal` into one-method-per-file, no WeakMap indirection needed purely
  for extensibility (real `#private` fields are fine again, since the class never needs
  after-the-fact patching) — the internal codebase optimizes for maintainability, and the
  generator absorbs the tree-shaking burden entirely.

## What this doesn't remove — and where the real design work moves

- **Per-locale resolution amortization still matters, independent of tree-shaking.** The
  generated client should still resolve a locale once (`cldr.get(locale)`) and hand every
  composed feature a shared resolved context, the same way this was designed in
  [alt-api-sketch.md](./alt-api-sketch.md#the-locale-data-wrinkle). This is the fix for the
  Intl.* fragmentation problem (`Intl.NumberFormat`, `Intl.PluralRules`, etc. each independently
  re-resolving subtags) and for Temporal's duplicated-calculation cost — and it's orthogonal to
  whether tree-shaking comes from codegen or runtime composition. Keep it either way.
- **The manifest/AST-scan is now load-bearing, not optional.** In the assessment's original
  sequencing this was a "medium investment, do it after the Proxy guard" step. Here it's the
  foundation the generator depends on from day one — it has to correctly resolve every feature's
  internal dependencies and locale-data needs, or the generated client silently omits something
  it needs (the same silent-failure risk from the other track, just relocated to the
  generator-authoring stage instead of every consuming app).
- **Regeneration workflow.** Something has to decide when `cldr.gen.ts` is produced: committed
  to the consumer's repo and regenerated on config changes (Prisma's model), produced fresh in
  CI on every install (heavier, but avoids stale generated files), or produced by a bundler
  plugin that runs the generator as part of the build graph. Each has different DX and staleness
  failure modes worth prototyping before committing.
- **Locale data shipping.** The config's `locales` list should drive which locale data tables are
  inlined or fetched, not just which methods are compiled in — this needs the same manifest to
  cover data as well as code, so requesting `locales: ['en', 'fr']` doesn't accidentally pull in
  every locale's data by default. See the next section for how this splits into two generator
  modes.

## Locale-data loading: eager vs. lazy

Two different real consumer scenarios need two different generator behaviors, and the config
should make the choice explicit rather than picking one globally:

- **Closed locale set** — the common case, where an app supports a fixed, known list of
  locales. The generator knows exactly which locale data is needed at generation time, so it can
  emit plain, static, synchronous imports for exactly those locales — no runtime loading, no
  async, at all, for that mode. This is a real reduction in async surface compared to 1.x, not
  just a lateral move, since the whole reason 1.x needs async pack loading (not knowing the
  locale set ahead of time) doesn't apply here.
- **Open/lazy locale set** — the app genuinely can't know its locale set ahead of time (e.g. a
  server resolving an arbitrary visitor's locale per request). Locale data still needs to load on
  demand, but the mechanism should be a real dynamic `import()` per locale rather than a
  hand-rolled fetch-and-parse pack loader — every modern bundler treats `import()` as its native
  code-splitting primitive, automatically creating and caching a separate chunk per target. This
  wasn't viable to lean on as heavily in 1.x's dual CJS/ESM world (dynamic `import()` from a CJS
  build has real interop quirks), but is fully idiomatic now that 2.x is ESM-only.

```typescript
// cldr.config.ts
export default defineConfig({
  locales: ['en', 'es-419', 'fr'],   // closed set — eager, fully synchronous
  // or:
  locales: { lazy: true },          // open set — any known CLDR locale, loaded on demand
  features: { /* ... */ },
});
```

**A real gotcha worth designing around from the start:** bundler code-splitting on `import()`
generally requires a statically analyzable specifier — a literal string, or a small enumerable
set of them — not an arbitrary runtime-computed string. `import(`./data/${locale}.js`)` built
from a fully dynamic runtime value won't code-split reliably across all bundlers. Since CLDR's
supported locale list is finite and known when the generator runs (even in lazy mode), the
generator should emit a finite, literal `import()` per known locale (e.g. a generated switch or
lookup map of literal specifiers), never a single dynamically-interpolated import.

**`cldr.get(locale)` itself should stay synchronous in both modes.** For lazy mode, introduce one
explicit async seam ahead of it — `await cldr.preload(locale)` — rather than letting `.get()`
sometimes return a promise and sometimes a value. `preload` is what triggers the per-locale
`import()` and resolves once that locale's data is available; `.get()` afterward is a plain
synchronous lookup, throwing if called before the corresponding `preload`. This keeps async
confined to one well-named boundary instead of leaking into every call site, and in eager mode
there's no `preload` step needed at all — `.get()` works immediately since everything was already
statically imported.

One thing to avoid regardless of mode: top-level `await` in the library's own source. ESM-only
permits it, but it forecloses the "consumer mechanically transforms our ESM output to CJS in a
pinch" escape hatch discussed earlier, and it isn't needed here — `preload` can be an ordinary
exported async function.

## Open questions

- **Generator implementation strategy.** ts-morph/TS compiler API AST scan (matches the
  assessment's original suggestion) vs. hand-maintained per-feature manifests authored alongside
  the reference implementation (less automatic, but avoids AST-scanning fragility as the
  internal codebase evolves). Given you already maintain a data-compilation pipeline in
  `cldr-compiler`, extending that existing tooling investment to also emit the API surface may
  be more tractable than building a second, separate AST-scanning system from scratch.
- **Dev-loop ergonomics.** Prisma-style workflows require running the generator after every
  config change before the app compiles again — worth prototyping how disruptive this feels
  compared to "just add an import," including editor/watch-mode integration.
- **Escape hatches.** Some consumers may want to bypass config-driven generation entirely (e.g.
  a tool that needs runtime-dynamic feature selection based on user input rather than a
  build-time config). Worth deciding whether the reference implementation is *also* directly
  usable in an unshaken form for that minority case, or whether that's explicitly out of scope.
- **Versioning the generated output.** If the reference implementation's internals change
  between versions (a method moves, a dependency shifts), regenerating should be safe and
  mostly mechanical — but the manifest and generator both need to stay in lockstep with the
  reference implementation's structure across releases, which is an ongoing maintenance
  obligation, not a one-time cost.
- **How this relates to [alt-api-sketch.md](./alt-api-sketch.md).** The fixed-shape API
  design there (one canonical interface per type, e.g. `DecimalApi`) still applies here almost
  unchanged — it's a good source-of-truth shape for the reference implementation and for the
  generated client's types, regardless of which tree-shaking mechanism produces the final
  bundle. The two docs mostly disagree about *where* the tree-shaking guarantee comes from
  (generic runtime composition vs. a build-time generation step), not about what a good API
  surface looks like.
