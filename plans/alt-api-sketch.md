# Alternative API Sketch: Composed Namespace Objects

## Why this exists

[objective.md](./objective.md) and its [assessment](./objective-assessment.md) explore making the
existing class-oriented API tree-shakable via prototype patching + WeakMap-backed private state.
That works, but has two structural costs: (a) a missing fragment import is a *silent runtime
failure*, not a compile error, and (b) WeakMap indirection has a per-call cost that needs
measuring.

This doc sketches a different mechanism that aims to keep the parts of the original API people
actually like — a single discoverable, hierarchical, autocompletable context object
(`cldr.get(locale).decimal.new(...)`) — while getting tree-shaking and privacy "for free" from
plain JS composition instead of side-effecting global mutation. The goal is tree-shaking that
reaches all the way down to individual methods and individual locale-data loaders, not just
whole feature packages.

## Core mechanism: build, don't patch

Instead of a shared class whose prototype gets mutated by whichever fragments happen to be
imported, each "instance" is assembled at runtime from exactly the method functions the app
composed in. Composition happens once, in application setup code — not per call site — so it
reads like configuration, not boilerplate repeated everywhere.

```typescript
// packages/decimal/src/methods/min.ts
export const min = (inner: DecimalInner, other: DecimalInner): DecimalInner => { /* ... */ };

// packages/decimal/src/methods/add.ts
export const add = (inner: DecimalInner, other: DecimalInner): DecimalInner => { /* ... */ };
```

```typescript
// app setup
import { defineFactory } from '@cldr-engine/core';
import { min } from '@cldr-engine/decimal/methods/min';
import { add } from '@cldr-engine/decimal/methods/add';

const decimal = defineFactory({ min, add }); // decimal.new(...) only ever has .min/.add
```

If an app never imports `min`, it is never referenced anywhere in the module graph, so a
bundler drops it the same way it drops any other unused export — no manifest, lint rule, or
dev-mode Proxy guard required to catch a missing method, because calling `d.subtract()` when
`subtract` was never composed in is a **TypeScript compile error**, not a runtime "not a
function." This directly removes the biggest risk flagged in the assessment.

### Avoiding per-instance closure bloat

A naive factory would bind each method as a fresh closure per instance, which trades the
assessment's WeakMap-lookup cost for a different one (N closures allocated per instance). The
fix is to build one shared, frozen "vtable" object per factory call — done once when
`defineFactory` runs, not once per instance — and have instances hold a reference to it plus
their own private inner state, which is the same shape as a prototype chain, just built
dynamically from composed pieces instead of mutated globally.

```typescript
type MethodMap = Record<string, (inner: any, ...args: any[]) => any>;

function defineFactory<M extends MethodMap>(methods: M) {
  type Instance = { [K in keyof M]: M[K] extends (inner: any, ...a: infer A) => infer R ? (...a: A) => R : never };

  const vtable = {} as Instance;
  for (const key of Object.keys(methods) as (keyof M)[]) {
    (vtable as any)[key] = function (this: { __inner: any }, ...args: any[]) {
      return methods[key](this.__inner, ...args);
    };
  }
  Object.freeze(vtable);

  return {
    new(raw: string | number): Instance {
      return Object.assign(Object.create(vtable), { __inner: parseDecimal(raw) });
    },
  };
}
```

`vtable` is shared across every `Decimal` instance created by this particular `decimal` factory
— same memory profile as a class prototype — but it only contains the methods actually
composed in, and it's a plain local object, not a global mutated by import side effects.

(Note: `__inner` here is a regular enumerable property, not truly private the way a WeakMap
association is. If real privacy is needed later, the two techniques can be layered — this sketch
optimizes for tree-shaking + compile-time safety first, and treats privacy as a separable,
optional refinement rather than a load-bearing requirement.)

## The locale-data wrinkle

Not all types are alike. `Decimal` is pure math — it needs no locale data. `Currency`,
`Calendar`, and `DateTime` do: currency needs decimal formatting plus currency-symbol/fraction
data, calendars need week-data and timezone data, etc. If every feature under the root object
required a resolved locale bundle, `decimal` would carry locale-loading weight it doesn't need;
if none did, currency/calendar couldn't get their data.

So there are two kinds of composed features:

- **Value features** (`decimal`): locale-independent. `defineFactory(methods)` as above.
- **Locale features** (`currency`, `calendar`, `datetime`): declare which locale data loaders
  they need, and only receive a resolved bundle containing those.

```typescript
// packages/currency/src/index.ts
import { defineLocaleFactory } from '@cldr-engine/core';
import { loadCurrencyData } from '@cldr-engine/data/currency';
import { loadSymbolsData } from '@cldr-engine/data/symbols';
import { format } from './methods/format.js';
import { parse } from './methods/parse.js';

export const currencyFeature = defineLocaleFactory(
  { currencyData: loadCurrencyData, symbols: loadSymbolsData }, // data deps, as real loader refs
  { format, parse },
);
```

Declaring the *loader function itself* as the dependency (not just a string flag) matters: it
means `resolveLocaleData` never needs a hardcoded switch over "every possible data kind" that
would force-bundle all loaders regardless of use. It only ever calls the loaders that were
actually imported and composed in, so unused locale-data readers (e.g. `weekData` if you never
compose `calendar`) are dropped by the bundler exactly like an unused method.

`defineLocaleFactory` builds its own shared vtable the same way, except each method closes over
`(bundle, inner, ...args)` instead of just `(inner, ...args)`:

```typescript
function defineLocaleFactory<D extends Record<string, (locale: string) => any>, M extends MethodMap>(
  deps: D,
  methods: M,
) {
  return {
    deps, // exposed so the root builder can collect + dedupe across features
    build(bundle: { [K in keyof D]: ReturnType<D[K]> }) {
      // same vtable-construction trick as defineFactory, methods read from `bundle` via closure
      // ...
      return { new(raw: string) { /* uses bundle + parsed inner */ } };
    },
  };
}
```

## The root builder

`buildCldr` composes whatever value features and locale features you imported into one typed
root object. It collects the union of data-loader dependencies across all composed locale
features (deduplicating shared ones — e.g. `calendar` and `datetime` both need `zoneData`), and
`.get(locale)` resolves each loader exactly once, caching the result per locale.

```typescript
function buildCldr<F extends Record<string, ValueFeature<any> | LocaleFeature<any, any>>>(features: F) {
  const localeBundleCache = new Map<string, unknown>();

  function resolveBundle(locale: string) {
    let bundle = localeBundleCache.get(locale);
    if (!bundle) {
      const merged: Record<string, unknown> = {};
      for (const key in features) {
        const f = features[key];
        if ('deps' in f) {
          for (const depKey in f.deps) {
            merged[depKey] ??= f.deps[depKey](locale); // each loader called once, deduped by key
          }
        }
      }
      bundle = merged;
      localeBundleCache.set(locale, bundle);
    }
    return bundle;
  }

  return {
    get(locale: string): ComposedRoot<F> {
      const bundle = resolveBundle(locale);
      const root = {} as ComposedRoot<F>;
      for (const key in features) {
        const f = features[key];
        (root as any)[key] = 'deps' in f ? f.build(bundle) : f;
      }
      return root;
    },
  };
}
```

`ComposedRoot<F>` is a mapped type that only has keys for the features you actually passed to
`buildCldr` — so autocomplete on `cldr.get('es-419').` only ever shows what was imported and
composed, nothing latent or hypothetical.

## Worked example

```typescript
import { buildCldr } from '@cldr-engine/core';
import { decimalFeature } from '@cldr-engine/decimal'; // pre-composed with a house set of methods, or build your own
import { currencyFeature } from '@cldr-engine/currency';

const cldr = buildCldr({
  decimal: decimalFeature,   // value feature — no locale data pulled in
  currency: currencyFeature, // locale feature — pulls in currencyData + symbols loaders, deduped
});

const es = cldr.get('es-419');
const d = es.decimal.new('3.14159');   // Decimal, no locale bundle involved at all
d.min(other);

const price = es.currency.new('1234.5', 'USD'); // internally reuses decimal math + currency/symbol data
price.format();
```

If the app never imports `currencyFeature`, `loadCurrencyData` and `loadSymbolsData` are never
referenced, so neither the loader code nor the underlying currency/symbol data tables ship in
the bundle. If it imports `currency` but not `calendar`/`datetime`, `weekData`/`zoneData` loaders
never ship either. Tree-shaking is just normal ESM dead-code elimination the whole way down —
methods, features, and locale-data loaders alike — because inclusion is entirely driven by what
got composed into `buildCldr(...)`, and nothing is reachable except through that composition.

## Nesting within one instance: a fixed API shape, toggled on or off

The examples above are flat — one method map per factory. But real types want internal
grouping (`decimal.format.scientific()` rather than `decimal.scientific()`), and it's tempting to
let `buildCldr`'s input shape freely dictate the output shape ("design your own API" by nesting
plain objects however you like). That was explored and rejected in favor of a fixed shape you
selectively enable, for two concrete reasons surfaced while working through it.

### The `this`-binding problem with free-form nesting

`instance.min(...)` works because `min` sits directly on `instance`'s prototype, so `this ===
instance` inside it. But `instance.format.scientific(...)` calls `scientific` with `this ===
instance.format`, not `this === instance` — the private inner state lives on `instance`, and a
freely-user-defined `format` sub-object has no built-in way back to it. Fixing this generically
(so `buildCldr` can accept *any* nesting shape a caller invents) means every namespace level
needs a runtime-constructed back-reference:

```typescript
function buildInstance(tree: CompiledVtableTree, inner: DecimalInner) {
  const instance = Object.assign(Object.create(tree.__methods), { __inner: inner });
  for (const key of tree.__namespaceKeys) {
    instance[key] = Object.assign(Object.create(tree[key].__methods), { __owner: instance });
  }
  return instance;
}
```

This works, but it's only needed because the *shape itself* is dynamic input. **Rule going
forward: any node that contains a `new` leaf is instantiable; anything else, at any depth, is
always a sub-namespace of whichever instantiable node contains it — never ambiguous.**

### Free-form shape vs. fixed shape

Letting callers invent arbitrary nesting (`buildCldr({ decimal: { compare, min, format: {
scientific } } })` with `decimal`'s internal grouping decided ad hoc by whoever calls
`buildCldr`) means the compose helper's type has to *infer* a novel object shape from
heterogeneous leaf kinds (plain method vs. locale-aware method vs. further nesting) supplied on
the spot. That's a much harder type-level problem than picking a known subset of an
already-known shape, and it buys comparatively little — nobody actually wants fifty different
apps each inventing a different place for `scientific` to live; a consistent, discoverable,
documented shape is worth more than per-app freedom here.

So: **the API shape is fixed and hand-authored once** (one canonical interface per type, e.g.
`DecimalApi` below), and what varies per app is only *which parts of that fixed shape are
present*. This turns the compose type from "infer an arbitrary structure" into "filter a known
structure," which is squarely in TypeScript's comfort zone (the same category of problem as
`Pick`/`Partial`):

```typescript
interface DecimalApi {
  new: (raw: string | number) => DecimalInstance;
  compare(other: DecimalArg): number;
  min(other: DecimalArg): DecimalInstance;
  max(other: DecimalArg): DecimalInstance;
  format: {
    scientific(options?: ScientificOptions): string;
  };
}
```

### Booleans vs. real references at each slot

There are two ways to say "which parts of `DecimalApi` are present," and only one keeps
tree-shaking free.

**Option A — boolean flags:**

```typescript
const cldrmeta = buildCldr({
  decimal: { compare: true, min: true, max: false, format: { scientific: true } },
});
```

This is the more concise input, and the type (`Flags<DecimalApi>` → `Selected<DecimalApi, F>`)
is simple to write. But a `true`/`false` flag carries no runtime value — the real `compare`/
`min`/`scientific` implementations still have to come from *somewhere*, and if the library's
internal builder imports all of them unconditionally and just branches on the flags at runtime,
every method ships in every bundle regardless of what's flagged off (bundlers eliminate dead
*code paths*, not runtime boolean decisions). Making booleans actually tree-shake requires a
build-time step — codegen, or a bundler `define`+DCE pass — that expands the flags object into
literal conditional imports before the bundler ever sees it. That's viable, but it's exactly the
"configurator" tool named in the assessment, not a plain library call.

**Option B — real references at fixed slots (recommended):**

```typescript
import { compare } from '@cldr-engine/decimal/compare';
import { scientific } from '@cldr-engine/decimal/format/scientific';

const cldrmeta = buildCldr({
  decimal: {
    compare,                 // present = imported = in the bundle, same as every earlier example
    format: { scientific },  // `min`/`max` are simply absent — never imported, never bundled
  },
});
```

Each slot has a known, fixed expected type from `DecimalApi`, so the compose type is still
"validate + pick a known subset" — the same type-checking win as booleans — while presence in
the bundle stays a direct, zero-tooling consequence of what's imported, exactly as in every
example earlier in this doc. This is the recommended shape: fixed positions for type simplicity
and unambiguous `this` handling, real references (not flags) for free tree-shaking. Boolean
flags remain a reasonable *input format* for a future codegen tool to expand into this form, but
shouldn't be the thing a runtime `buildCldr` consumes directly.

## What's still open

- **Type inference complexity.** `ComposedRoot<F>` and the loader-dedup merge type need careful
  generic plumbing to keep `.get(locale)` results fully typed without the user annotating
  anything. Worth prototyping against the TS compiler directly before committing.
- **Composition boilerplate.** Every app writes its own `buildCldr({...})` call once. That's a
  reasonable one-time cost, but for less sophisticated consumers a generated "starter" file
  (analogous to the configurator idea in the assessment, but emitting literal composition code
  instead of side-effect imports) is probably worth offering.
- **Data loader dedup key.** The sketch dedupes by object key name (`currencyData`, `zoneData`,
  ...) assuming all features agree on the same key meaning the same loader. That convention
  needs to be enforced (a shared, versioned catalog of data-dependency keys) rather than
  left to each feature package to invent independently.
- **Locale bundle caching lifetime.** `resolveBundle` caches per locale for the lifetime of the
  `cldr` object. Fine for a long-lived singleton; needs a story for apps that construct many
  short-lived `cldr` instances (e.g. per-request in a server) if data loading is expensive.
- **Privacy.** `__inner` is enumerable, unlike the WeakMap approach in objective.md. If true
  privacy matters more than saved here, it can be layered back in without giving up
  tree-shaking, but it's an added cost that should be justified per type rather than applied
  uniformly.
- **Migration cost.** This is a materially different public API shape from both the existing
  class-based library and the prototype-patching prototype. Worth a small side-by-side
  comparison (bundle size, call ergonomics, type-safety) against `packages/decimal` before
  deciding to pursue this over the original plan.

## Addendum: paths considered and not taken

- **Free-form, caller-defined nesting shape.** Letting whoever calls `buildCldr` invent their own
  grouping (put `scientific` at the top level here, nest it three levels deep there) was
  rejected in favor of one fixed, hand-authored shape per type that callers can only
  enable/disable pieces of. The free-form version requires the compose helper to *infer* a novel
  structure from heterogeneous leaf kinds supplied ad hoc, which is materially harder to type
  correctly than filtering a known interface, and it buys little real value — a consistent,
  documented, discoverable shape across apps beats per-app bespoke layouts.
- **Boolean flags consumed directly by a runtime `buildCldr`.** Rejected as the *primary*
  mechanism, not as an idea outright: a flags object with no accompanying build step doesn't
  tree-shake, because the real implementations still have to be reachable from somewhere at
  runtime, and a generic builder that imports everything and branches on flags defeats the
  purpose. Booleans stay on the table only as an input format for a future codegen/configurator
  tool that expands them into the real-reference form before bundling — not as something a plain
  library function reads directly.
- **Per-call-site fragment imports (the original objective.md technique).** Not discarded — it's
  the subject of the plan this doc is an alternative to — but worth restating why this doc
  explores a different path: prototype patching's biggest cost is that a missing fragment import
  is a *silent runtime failure* (compiles fine, throws "not a function" later), which needed a
  lint rule, generated manifest, or dev-mode Proxy guard to catch. The composition-based
  approach here makes the same mistake a compile error instead, at the cost of a different
  authoring style (build a typed object once, rather than accumulate side-effect imports).
