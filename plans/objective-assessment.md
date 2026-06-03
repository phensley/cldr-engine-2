# Assessment

Overall: the two techniques are a reasonable, feasible approach to making a large class-based library tree-shakable, and the prototype in `packages/decimal` (exercised by `examples/treetwo`) demonstrates the mechanics work. The tradeoffs are real but likely justified given the potential bundle-size wins for a library this large.

## Dynamic extension of classes (prototype patching + declaration merging)

**Works as intended.** `packages/decimal/src/compare.ts` and `negate.ts` confirm the pattern: each fragment imports the skeleton class, augments its interface via `declare module '<path-to-class-declaration>'`, and patches the method onto the prototype as a side effect of import. Consumers pull in only the fragments they use (`examples/treetwo/src/two.ts`).

**Biggest risk: silent runtime breakage, not compile-time safety.** Declaration merging only extends the *type*. If a call site's dependency graph fails to import the defining fragment, TypeScript compiles cleanly but the call fails at runtime (`method is not a function`). Type-checking and runtime reality can diverge. Before this ships as a public API, we need tooling to close this gap — e.g. a lint rule or codegen step that cross-checks every prototype-method call against the transitive import graph to guarantee the defining fragment is always reachable.

**Overhead is likely negligible.** Prototype patching happens once at module load, not per call. The main cost is developer/tooling complexity (see above), not runtime performance.

## Private "inner" objects via WeakMap

**Necessary for extensibility, not just privacy.** Native `#private` fields would give real runtime privacy, but they must be declared in the class body up front — which defeats the "skeleton class + independently shipped fragments" model. WeakMap-backed inner objects are the mechanism that lets fragments shipped in separate files/packages share state without modifying the base class declaration. This justification is worth stating explicitly wherever this technique is documented going forward.

**Overhead needs measurement, not assumption.** Per-call WeakMap lookups are cheap in general but non-zero. For hot-path numeric code (e.g. `Decimal` arithmetic in loops), this could matter at scale. A microbenchmark comparing WeakMap-indirected field access vs. direct object fields is worth doing before committing further.

## Alternative worth naming

A pure function-export API (`capitalize(foo)` instead of `foo.capitalize()`) would get tree-shaking for free, with compile-time-enforced imports (a missing import is a compile error, not a runtime failure) and no WeakMap indirection. This prototype is implicitly choosing to preserve a class-based public API surface for existing/expected consumers instead — a legitimate constraint, but worth stating explicitly as the reason for taking on this technique's overhead rather than the simpler functional route.

## Mitigating the missing-import failure mode

Given the target library (`cldr-engine`) is large enough that a code generator or "configurator" is a realistic option, here is a speculative set of techniques to close the gap, roughly ordered from cheap safety-net to full investment.

**Root cause is a phase separation, not something fixable purely at the type level.** `tsc` reasons about everything transitively reachable in the *compile* graph (which typically includes every fragment anyone imports for typing), while the bundler reasons about runtime *reachability* of side effects in the final bundle. Those are two different tools enforcing two different notions of "included," with no shared source of truth. Any real fix has to bridge that gap explicitly — either with static analysis spanning both phases, or a runtime safety net.

**Immediate, cheap mitigation: a dev-mode Proxy guard on the skeleton prototype.** Wrap each skeleton class's prototype in a `Proxy` (behind a dev-only build flag, stripped in production) whose `get` trap throws a descriptive error for any undefined method: e.g. `"Decimal.prototype.min is not defined — import '@phensley/decimal/compare'"`. Costs one Proxy per class, requires no codegen, and turns "not a function" into an actionable message. Doesn't prevent the bug, but makes it instantly diagnosable in dev/test, which covers a lot of real-world risk since most missing imports would surface in local dev or CI before shipping. See [Addendum: dev-mode Proxy guard example](#addendum-dev-mode-proxy-guard-example) for a worked example against `packages/decimal`.

**Also verify `package.json` `sideEffects` correctness** — a related but distinct risk. If a package sets `"sideEffects": false` for tree-shaking purposes without explicitly listing fragment files, a bundler could legally strip an imported fragment as dead code even when it *is* imported, causing the same failure mode for a different reason. This technique's contract should include an explicit `"sideEffects"` array/glob covering every fragment file.

**Medium investment: a generated dependency manifest + lint rule.** Every fragment file follows the same shape (`import { Foo } from './foo.js'` + `declare module` + `Foo.prototype.x = ...`), so a small AST scan (ts-morph or the TS compiler API) over the whole library can mechanically extract, for each method, which file defines it and what fragments it in turn imports. That manifest (`method → { definingFile, requiredImports[] }`) powers a custom ESLint rule (needs type info, since it must resolve which class a `.method()` call targets) that walks a consuming project's usage and its actual import graph and errors on any call whose defining fragment isn't transitively imported. This is the real correctness backbone — it turns the risk from "hope someone remembers" into a build-time check, without requiring consumers to change how they write code.

**Bigger investment: a "configurator" codegen tool**, which is a good fit given `cldr-engine`'s size. Use the same manifest to flip the burden from "track individual methods" to "declare desired features":

```
npx cldr-engine-configure --features=numbers,dates,plural-rules --locales=en,fr,de > cldr-engine.gen.ts
```

The tool resolves the transitive closure of fragments needed for the requested features and emits a single generated file containing exactly the required side-effect imports, which the app imports once as its entry point. Analogous to Modernizr custom builds, FontAwesome subsetting, or lodash-cli. Given the actual surface area of dates/numbers/currencies/plurals/relative-time/etc., this is a better long-term answer than expecting app authors to hand-pick dozens of method imports — it makes fragment-level granularity an internal implementation detail most consumers never see.

**Cheaper middle ground before the full configurator: curated preset entry points** (e.g. `@phensley/cldr-engine/presets/full`, `/presets/numbers-only`, `/presets/dates-only`) that bundle common fragment combinations by hand. Most consumers use a preset; advanced users needing minimal bundles drop to individual fragment imports (protected by the lint rule). This captures most of the practical benefit for a fraction of the tooling investment, and can coexist with or evolve into the full configurator later.

**Suggested sequencing:** ship the Proxy dev-guard and fix `sideEffects` config first (low cost, closes the worst debugging pain immediately) → build the manifest + lint rule next (closes the correctness gap for hand-written imports) → invest in presets, then the full configurator, once the technique is validated against a slice of the real library with real data on how consumers want to select features.

## Bottom line

Feasible and worth continuing to prototype. The highest-priority next step is closing the missing-import failure mode (via lint/codegen), since that's the difference between a clever bundling technique and a footgun for downstream consumers of a library this size.

## Addendum: dev-mode Proxy guard example

Two things make this trickier than "just wrap the prototype in a Proxy":

1. **A class's `.prototype` property is non-writable and non-configurable** — `Decimal.prototype = new Proxy(...)` is not legal. Instead, insert the guard *above* the real prototype in the chain via `Object.setPrototypeOf`, which only touches the prototype *object's* internal `[[Prototype]]` slot (that's allowed).
2. **A blanket "throw on any missing property" trap breaks normal JS duck-typing** — things like `.then` (thenable checks), `.toJSON`, `Symbol.iterator`, `console.log` inspection, etc. routinely probe for optional properties and expect a quiet `undefined`, not an exception. The trap needs an allowlist of the class's *known* method names and should only throw for those.

```typescript
// packages/decimal/src/decimal.ts
import { decimalNew } from './inner.js';
import { parse } from './parse.js';
import { DecimalFlag } from './private.js';

export type DecimalArg = number | string | Decimal;

export class Decimal {
  constructor(n: number | string) {
    // ...unchanged...
  }
}

// --- dev-only "missing fragment" guard ---
if (process.env.NODE_ENV !== 'production') {
  // Every method name this class exposes once its fragment is imported.
  // Could be generated from the fragment manifest instead of hand-maintained.
  const knownMethods = new Set([
    'min', 'max', 'compare', // compare.js
    'negate',                // negate.js
    'add',                   // add.js
    'subtract',               // subtract.js
  ]);

  const guard = new Proxy(Object.getPrototypeOf(Decimal.prototype), {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && knownMethods.has(prop)) {
        throw new Error(
          `Decimal.prototype.${prop} is not defined. ` +
            `Did you forget to import the fragment that provides it? ` +
            `e.g. import '@phensley/decimal/${prop}'`,
        );
      }
      // Anything else (Symbol.iterator, 'then', 'toJSON', ...) falls
      // through to normal Object.prototype behavior.
      return Reflect.get(target, prop, receiver);
    },
  });

  Object.setPrototypeOf(Decimal.prototype, guard);
}
```

Fragments don't change at all — `compare.ts` still does `Decimal.prototype.min = function (...) {}` as before, which adds an *own* property directly on `Decimal.prototype`. Own-property lookups are resolved before the engine ever walks up to the injected guard, so the throw only fires when a method genuinely isn't there.

**Making it disappear in production**: bundlers (webpack `DefinePlugin`, Rollup `@rollup/plugin-replace`, esbuild `define`) statically substitute `process.env.NODE_ENV` with the literal string `"production"` at build time, which turns the `if` into `if (false) { ... }`; the minifier (Terser etc.) then dead-code-eliminates the whole block, including the `knownMethods` set and the Proxy — so none of this ships in the production bundle. This is the same mechanism React's dev-mode warnings rely on.
