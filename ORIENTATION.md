# cldr-engine-2 — Orientation

Context-setting entry point for working in this repo. Read this first, then
[plans/prototype-plan.md](plans/prototype-plan.md) for the working plan.

## What this is

A **cleanroom prototype** for **cldr-engine 2.0** — a rewrite of the
`cldr-engine` CLDR internationalization library (numbers, dates, currencies,
plurals, …). The prototype validates a design for making a large class-based
TypeScript library **tree-shakable** and its data footprint **granular**.

The repo was created 2025-08-28 by migrating design docs and the encoding
module out of the previous repo (`cldr-engine-ng`, which keeps the old
prototype-patching PoC `packages/decimal` + `examples/treetwo` as an archived
artifact).

### The three goals (notes/overview.md)

1. **Minimize the code and resource-pack footprint**
2. **Modular** — add only the packages you need
3. **Granular** — select only the locales and features you need

## The design direction (decided)

**Codegen**: an ordinary, rich "reference implementation" (plain classes, no
fragmentation tricks) + a dependency manifest + a generator that reads a
consumer's `cldr.config.ts` (locales + features) and emits a literal
`cldr.gen.ts` containing exactly the imports needed. Tree-shaking becomes a
property of what the generator emits, and a missing piece is a compile error
by construction. This is the conclusion the migrated docs converge on:

| Doc | Role |
|---|---|
| `plans/prototype-plan.md` | **The plan.** Spikes, acceptance criteria, open questions |
| `plans/codegen-api-sketch.md` | Mechanism this prototype implements (eager/lazy locale modes, config shape) |
| `plans/packaging-sketch.md` | Target repo layout (4 packages, ESM-only, `./internal` subpath) |
| `plans/alt-api-sketch.md` | Fixed-shape API ideas that survive into this design |
| `plans/objective.md` / `objective-assessment.md` | The earlier patching approach and why it was rejected |
| `notes/*` | Goals, design criteria, links, old todo |

## Pack format building blocks (in `internal/core`, migrated from the old repo's `encoding/`)

Resource packs ship as strings/data embedded in ESM modules. The codec chain:

```
data (trie | pools | offsets) → number[] → GVE16 → Uint8Array → X85 → string
```

- `internal/core/src/trie/` — compact **array trie**: key→value maps with
  case-insensitive, exact-case-biased search; keys stored in the index, no
  client-side index build. (`build.ts` inserts, `encode.ts` flattens to
  `number[]`, `search.ts` queries.)
- `internal/core/src/binary/` — **GVE16** group-varint for 16-bit number
  arrays (~44% savings on small values) and **X85**, a no-escape ASCII85
  encoding (+25% vs base64's +33%) for embedding bytes in JS/TS/JSON.
  `decodeX85GVE16` decodes both in one pass.

## Repo map

```
internal/core/          workspace-private leaf (zero deps) — the codec layer;
                        future home of locale-id parsing + wire-format types.
                        src/binary, src/trie + __tests__ (vitest, 17 tests)
internal/data-pipeline/ (planned, not yet created) — mini-cldr dataset →
                        pack assets, using core's codecs
packages/...            (planned) @phensley/cldr runtime + @phensley/cldr-generate
plans/                  design docs + prototype-plan.md (the working plan)
notes/                  goals + original design criteria
```

