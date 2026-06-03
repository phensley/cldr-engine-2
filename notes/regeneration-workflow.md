# Regeneration workflow — committed output + test-enforced freshness

closes prototype-plan §11b "Generator regeneration
workflow (committed vs CI)" and §12's "decide in S3".

## Decision

**Generated artifacts are COMMITTED, and freshness is enforced by tests +
an idempotency gate. Nothing is generated at CI/build time.**

- git-diffable changes: a dataset or API change shows exactly which packs,
  manifest refs, and client imports moved;
- deterministic regeneration: `pnpm regenerate` reproduces the committed
  tree byte-for-byte (verified by `pnpm check:generated`);
- consumers and IDE/typecheck see the shipped bytes, not a build-time
  reconstruction.

The rejected alternative — CI-time generation (exclude artifacts, rebuild
in CI) — buys "never stale by construction" at the cost of invisible
diffs, a mandatory build step for every consumer/dev tool, and divergence
between what CI sweated over and what was reviewed in the PR. The stale-
risk of the committed model is closed by gates (below).

## The generated artifacts

| Artifact | Source of truth | Command | Freshness test |
| --- | --- | --- | --- |
| pipeline packs (`internal/data-pipeline/generated/*`, runtime `packages/cldr/src/packs/*`) | `internal/data-pipeline/src/dataset/*` (mini-cldr) | `pnpm generate:packs` | `internal/data-pipeline/__tests__/generated.test.ts` |
| runtime manifest (`packages/cldr/src/manifest.ts`) | `src/api.ts` `*Api` interfaces + impl modules + packs dir | `pnpm scan:manifest` | `packages/cldr/__tests__/manifest.test.ts` |
| runtime exports map (`packages/cldr/package.json` `exports`) | the same manifest derivation (the public surface IS the slot refs) | `pnpm scan:manifest` | `packages/cldr/__tests__/manifest.test.ts` (deep-equal + negative resolution) |
| example clients (`examples/{eager,lazy}/src/cldr.gen.ts`) | consumer config + committed manifest | `pnpm generate:client` / `pnpm generate:client:lazy` | `examples/*/__tests__/generated-client.test.ts` |

## Ordering constraint (a footgun, now documented)

`generate:client*` resolves `@phensley/cldr/manifest` and
`@phensley/cldr/packs/*` from the runtime's BUILT dist (the packaging
reality: the published generator consumes the installed runtime). So the
full pipeline order is fixed:

```
pnpm regenerate  =  generate:packs → scan:manifest → build → generate:client → generate:client:lazy
```

`scan:manifest` reads src (api.ts + packs dir); `generate:client` reads
dist — hence `build` sits between them. Running `generate:client`
directly against a stale dist silently regenerates a stale client; the
per-example regenerable tests catch that on the next `pnpm test`.

## Gates

1. **Per-artifact freshness tests** (`pnpm test`) — committed file must
   byte-match a fresh render ("stale — run pnpm <command>").
2. **`pnpm check:generated`** — runs the full `regenerate` pipeline, then
   fails if the tree changed under any generated path. This covers what
   the freshness tests cannot: NEW untracked files (e.g. a locale pack
   added to the dataset — `generated.test.ts`'s stem list is
   hand-maintained) and cross-artifact ordering mistakes.
   On failure the tree contains the fresh output: commit it if the change
   is intentional, otherwise fix the generator.
3. **Determinism** — regeneration must be idempotent; gate 2 is the CI
   check that enforces it (local: `pnpm check:generated`; CI would run
   the same command).

No CI pipeline exists in this repo yet; when one lands, the gate is
`pnpm install --frozen-lockfile && pnpm check:generated && pnpm test`.
