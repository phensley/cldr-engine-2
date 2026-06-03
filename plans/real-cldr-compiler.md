# Real-CLDR compiler — the 2.0 data pipeline (greenfield)

Status: **scoped + decisions recorded; not started.** Next
shelf item after the pack-design/measurement work (which this builds on:
`plans/real-data-pack-design.md`, `notes/real-data-validate.md`).

## 1. What this is

A **greenfield 2.0 compiler**: the input side of the pack pipeline goes
from the hand-authored synthetic `miniCldr` dataset (S1) to **real CLDR
48.2.1 cldr-json data** (fetched, sha-pinned, gitignored). The 1.x
`cldr-compiler` (other repo) is a **format-semantics reference only** —
its pack/machine analysis is already mined into
`real-data-pack-design.md`; no 1.x code is ported.

Reused as-is: `internal/core` codecs (GVE16/X85/trie, u16 domain), pack
decode, the regeneration workflow (`pnpm regenerate` /
`check:generated`), and the field-universe construction in
`scripts/benchmark-real.ts` as the adapter's proof-of-concept.

## 2. Decisions

1. **Locale coverage: the 11 measured locales** — en, en-001, en-GB,
   en-AU, en-CA, fr, de, zh, ar, hi, ru (already in `.cache/`). Full
   cldr-json locale coverage = follow-up (lazy mode's `manifest.locales`
   = packs dir, so full coverage eventually matters for the lazy story).
2. **Numbering systems: default-only v1** — each locale's
   `defaultNumberingSystem` (ar → arab, hi → deva, …). All systems a
   locale defines = follow-up.
3. **Wire format: keep code→value tries + pools (v0.1 shapes) for v1.**
   The aligned-vector format + family base/delta emission (the measured
   4.5×/4.4× payoff, §3 layout table) is the **generator's**
   layout-selection machinery, orthogonal to data integration — own
   follow-up.
4. **1.x parity harness: in scope** — diff our decoded values against
   the 1.x repo's compiled pack resources for overlapping (locale, code,
   key) tuples. Strongest correctness check available, nearly free.
   (1.x data may be an older CLDR vintage + 1.x transformations; mismatches get triaged, not chased.)
5. In addition, inherited from the measured design:
   - numeric streams carry a **unit + offset header**, full-encode by
     default; the per-table delta rule stays deferred (no genuinely
     varying per-locale numeric table exists for decimal/currency —
     real-data finding, `real-data-pack-design.md` §2.4);
   - u16 wire domain with the record-table escape hatch;
   - committed generated artifacts + freshness tests;
   - pinned CLDR version (48.2.1, sha in fetch script).

## 3. Phases

### A. Input layer — fetch + adapter
**DONE**: fetch slice extended (numberingSystems + all-file completeness check); dataset contract v2 (languages/scripts/symbols/narrow+display currency fields); `dataset/real.ts` adapter — 11 locales, default numbering system only, coverage-gap rule (symbol→code, digits→2), patterns positive-only. Frozen-value tests (real-dataset.test.ts).

### B. Compile features (per locale)
**DONE**: wire v1 — languages/scripts tries + symbols [decimal, group, minus, percent]; runtime formatter v1 (locale symbols — fr U+202F, ar LRM/RTL marks; pattern-group sizes — hi Indian 12,34,567; positives only; minus-prefix negatives = follow-up); generate:packs input = realCldr() with stale-stem cleanup; 11 real packs committed; fixtures/examples/bundle-proof/publish-roundtrip moved to the real locale set. Real-scale numbers recorded (en pack ~1,200 pool strings; currency-en-fr bundle 85 KB — languages/scripts dominate; nothing consumes them yet — size review is an open consideration, not cut).

### C. Validation
**DONE**: golden real-render tests across scripts (en/de/fr/zh/ar/hi/ru — real-formats.test.ts); **1.x parity Tier 1** (parity-1x.test.ts — every 1.x-compiled currency fraction digit matches the 2.x pipeline, CLDR 48.2.0 vs 48.2.1); bundle table re-baselined with real packs; miniCldr stays the offline fixture. Remaining: publish-roundtrip re-run on the real locale set.

**Parity Tier 2 (recorded, not built)**: per-field pack-value parity (territory names/symbols/patterns) requires executing the 1.x mapping-DSL decoder against its compiled packs — port-worthy when the full locale set lands; the frozen-value tests anchor values to the CLDR source meanwhile.

### D. Housekeeping
**DONE**: `notes/real-cldr-compiler.md` (real scale, decode perf, bundle table re-baseline, languages/scripts weight decision — KEEP, with the one-line-revert cut option recorded); `plans/pack-format-spec.md` wire v1 shapes recorded.

## 4. Deliberate follow-ups (not this work)

- Full locale coverage; all numbering systems per locale; compact
  notations (short/long); currency relevance sets (territoryInfo).
- ~~Family base/delta emission + merge-at-preload decode~~ **DONE** 
  — generator layout selection per config
  shape (language-subtag families, min-pairwise base, sparse per-class
  delta modules, merge-once-at-preload; measured 2.5× at equal locale
  count). Aligned-vector format remains unbuilt (tries kept — the
  sparse-delta representation landed within the measured band).
- ~~Plurals~~ **DONE** — third data class
  (plurals.json + ordinals.json), CLDR condition grammar compiler,
  flat-literal wire stream, runtime evaluator + factory; the manifest/
  exports/generator/layout machinery auto-derived the feature with zero
  hand-wiring (FEATURE_META only). Remaining feature areas (calendars,
  timezones, units, relative time) — the pipeline is shaped so they
  slot in; separate follow-ups.
- Anything requiring CLDR XML / ICU sources (v1 is cldr-json only).

## 5. Full 766-locale coverage

**Milestone 1 done**: fetch is glob-based (5,050 files, 191 MB gitignored
cache, 766 locales × 7 classes); adapter gains proper BCP-47 subtag
parsing (region for weekData; zh-Hant-TW → TW not 'Hant'), full mode
(`realCldr({ full: true })`) including low-coverage locales (91 without
localenames → empty name sets; 724 languages / 580 scripts / 675
territories file coverage); `generate:packs:full` compiles all 766
(22 MB, ~15 s) into gitignored generated-full/ + writes the deterministic
aggregate SHA-256 anchor (generated/coverage.sha256, committed);
coverage tests: 766 compile, anchor equality (compiler-drift gate),
every-pack decode + spot lookups (ja/pt/th; data facts: CLDR 48 has NO
pt-BR — 'pt' IS Brazilian; _value/_numbers format indirection in some
date patterns; 'ไทย' is CLDR's TH name).

**Milestone 2 done**: `pnpm build:full` injects the FULL
universe into the publish artifact — 766 packs (+ 443 family deltas over
95 families + layout + zones) written to dist with matching .d.ts, and
the FULL manifest (dist/manifest.js/.d.ts listing all 766); the repo/
committed state stays the 11 (regression corpus). The publish-roundtrip
now exercises it genuinely: build:full → verdaccio (body limit raised:
tarball ~15 MB) → install → generate a client importing **ja** →
typecheck → bundle with ja renders ✓; manifest.locales === 766 asserted;
data lessons frozen (ja USD symbol is '\$'; th gregorian year is CE —
Buddhist-era years are non-gregorian backlog; uk NBSP; he bidi marks).
Cache-gated full-locale goldens cover ja/ko/tr/th/uk/he through the
public factories (¥ rounding, CJK calendar forms, tr/uk plurals).
Verification: 167 tests, bundle-proof, whole-tree coverage anchor
(packs + deltas + layout + zones).

**Footprint decision**: commit the 11-locale regression corpus
(source-freshness-validated as today) + generate the FULL set at
publish time into dist (deterministic compiler over the sha-pinned
cldr-json input — provenance is the gate; the anchor catches compiler
drift). Milestone 2 wires generate:packs:full into the build/dist flow
+ manifest/layout/deltas at scale + publish-roundtrip exercises the
full path + new-locale goldens.

## 6. Out of scope (hard boundary)

- Porting 1.x compiler code (greenfield; reference only).
- Publishing/versioning (still 0.0.0; gated on the §12 release
  decision).
- Runtime API growth beyond the two proof features.
