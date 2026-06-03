# Real-data pack design — from the 1.x structure analysis

Status: **design note; layout decisions measured; re-validated on real CLDR 48.2.1 data**.
Source analysis: `cldr-engine` 1.x — `packages/cldr-compiler/src/resource/
{pack,machine}.ts` + `packages/cldr-core/src/resource/{pack,bundle}.ts`.
Measured in `scripts/benchmark-pools.ts` → `notes/pool-rebaseline.md`
(scenarios A/B/C below reference those tables); re-validated against real
CLDR 48.2.1 data in `scripts/benchmark-real.ts` → `notes/real-data-validate.md`
(11 locales incl. zh/ar/hi/ru; 1845 real fields; `pnpm fetch:cldr` gets the
pinned cldr-json subset into `.cache/` — tree stays clean).

## 1. What 1.x does (verified in code)

Per language+script, the compiler builds one pack containing:

- a **base layer** — every field value, one offset per field, offsets
  globally aligned across all layers of the language;
- a layer-level **exceptions pool** — values differing from base, deduped
  across ALL regions of the language (the cross-locale overlap win);
- per-region sparse maps — `(fieldIndex → exceptionIndex)` pairs, encoded
  as base-36 numarrays in space-joined strings, decoded lazily per region
  and cached;
- base selection = **min pairwise distance** locale (en-001 for English;
  measured −350 KB across all packs by the author's own note).

Runtime lookup = two-level indirection (`exceptions[index[offset]] ??
strings[offset]`). Numeric fields (digit counts/divisors) are encoded as
strings into the same pools. Transport: `_`-delimited joined strings with
manual quote escaping (the CLDR characters/punctuation field is excluded
because of the delimiter).

## 2. Improvement opportunities for 2.0

### 2.1 Scope the overlap structure to the CONFIG, not the language — and let the generator choose the layout

1.x computes one base for every region of a language and ships the whole
language pack regardless of what the consumer needs. The 2.0 generator
knows the consumer's locale set at generate time, so the pack LAYOUT
becomes a per-config compile-time optimization, like the eager/lazy
split:

| Config shape | Layout |
|---|---|
| single locale | literal pool module (no delta machinery) |
| one family, several variants (en, en-GB, en-AU, en-CA) | shared base module + per-variant delta modules |
| mixed families (en, fr, de) | shared value pool + per-locale index tables (measured and REJECTED — §2.3) |

Base selection generalizes from pairwise-distance to config-scoped
k-medoids (2–3 bases for distant clusters).

### 2.2 Exception representation: mask + compacted overrides vs (field, value) pairs

Regional variants override a small fraction of fields (0.1–5% typical).
Two representations for a variant's delta:

- 1.x pairs: (fieldIdx, valueIdx) base-36, into a layer-level exceptions
  pool (values deduped across the family);
- mask + compacted indices: a field-position bitmask (bit-packed X85
  bytes) + the overriding values' indices in field order.

**Measured (scenario A, overrides 0.5–20%): the two are within ~5% of
each other — the STRUCTURE (delta vs full data) is worth ~20× the
pair-vs-mask representation. Pick pairs for simplicity.** Real-data
confirmation (en family, measured override density 0.1–2.8%): pairs
4.5× raw / 4.4× lazy-gz smaller than literals, and now ALSO −7.5% on
eager gz (the synthetic near-tie resolves in deltas' favor — gzip can't
recover the sparsity of a 2-out-of-1845-field variant like en-GB).
The 1.x element-granularity for arrays (each vector position is its own
field — verified) is retained either way.

### 2.3 Dedup at config scope: REJECTED by measurement (≤ 15% overlap)

A config-global pool module + per-locale u16 index tables (fixed field
order → dense index arrays) was the leading candidate. **Measured
(scenario B, en/fr/de, ~15% shared values): shared pools lose on every
gzip mode** — the shared pool dedups only the overlap while the
per-locale u16 index arrays add incompressible X85 bytes (eager 25.6 vs
18.2 KB, lazy 24.8 vs 23.1 KB vs literals). Cross-language sharing is
better left to gzip inside one bundle, or to base+delta within a family.
Real-data confirmation (en/fr/de/zh/ar/hi/ru, real overlaps 8.8–33.9%):
literals win both gz modes even with de at 33.9% overlap (shared-full
+38% eager / +34% lazy gz; shared-delta +33% / +28%). This RETIRES the
recorded ≥40% re-measure gate as a live contingency — the locale pairs
that would cross it (en/de, nl/de, the Scandinavian cluster) are
family-ish dialects that the base+delta row already handles. shared-full
is off the table; keep a canary only: re-open if a >40%-overlap config
materializes whose locales are NOT family-classified (treat that as a
family-detection bug, not a shared-pool revival).

### 2.4 Numbers out of the string pools — deltas adopted

1.x stores numeric fields as strings. 2.0: typed u16 arrays via GVE16,
**delta-encoded from a base** — measured (scenario C, 300 entries, 20
diffs): raw +23% smaller, lazy gz +34% smaller, eager gz a tie.
Real-data confirmation (zone-offset pairs, 418 entries, 128 real DST
diffs): the win is wire gz (unit-scaled delta −23% lazy, −5% eager),
NOT raw bytes — real scaled offsets are small enough for 1-byte varints
in both encodings, so raw is a tie where the synthetic showed +23%.
Two sharpened corollaries from real data:

- **unit scaling is required even for the FULL encoding when the value
domain exceeds u16** — absolute offsets span −39600..50400s (93600 >
65535); 900s units are exact for every modern tzdb offset, half-hour
units round the :15/:45 zones, and the bias must cover the scaled span
(−22..28 half-hours ⇒ b=50);
- **the per-table rule also excludes tables that don't vary per locale**
— currency fraction digits (0/2/3/4, 307 codes) are a single
locale-independent table: no per-locale base exists to delta from, so
they ship full (447 raw bytes) and the rule doesn't apply;
- **pack format: numeric tables declare a unit + offset header and ship
FULL by default** — the codec cannot assume a raw u16 domain fits; the
compile step picks the unit and bias from the data (900s exactness for
tzdb, bias ≥ scaled span) and records them with the table.

### 2.5 Transport + runtime hygiene

- No `_`-delimiter / base-36 / manual escaping (v0.1 array literals
  already fixed this; the CLDR punctuation restriction disappears).
- Lookups: merge-once per locale at preload (a delta module materializes
  into a dense u16 array, tens of µs) instead of per-access two-level
  resolution.
- Field ordering sorted for gzip (cluster shared prefixes) — compile
  time, deterministic.

## 3. Measured + real-data-validated layout decisions (generator defaults per config shape)

Full tables in `notes/pool-rebaseline.md` (scenarios A/B/C); real-data
re-validation in `notes/real-data-validate.md` (CLDR 48.2.1, 11 locales,
1845-field universe).

| Config shape | Layout | Evidence (synthetic → real-data verdict) |
|---|---|---|
| single locale / small eager sets | literal pool modules (v0.1) | literals tie base-delta on eager gz; no machinery needed. Real: literals beat X85 chain 1.8× gz on a real CJK pool → CONFIRMED |
| multiple variants of one family | base module + per-variant deltas (pairs or mask — both within 5%) | raw 3.6× / lazy gz 3.5× better than literals. Real: 4.5× raw / 4.4× lazy gz, eager now −7.5% (near-tie resolved); pairs ≈3% from mask; base = min pairwise distance (en-001 measured optimal) → CONFIRMED |
| cross-family sets | literal modules | shared pools rejected ≤ 15% overlap. Real: 8.8–33.9% real overlaps, shared pools still +28..+38% worse → CONFIRMED; ≥40% gate retired to a canary (§2.3) |
| numeric tables | base + delta-from-base u16 arrays (per-table rule: only when the table varies across locales AND magnitude is large relative to deltas) | raw +23%, lazy gz +34%. Real: gz-only win (−23% lazy, −5% eager), raw tie; unit scaling mandatory (u16 span); fraction digits excluded (locale-independent single table) → CONFIRMED, sharpened |

The layout is a generate-time decision (the generator knows the config),
like the eager/lazy split. **IMPLEMENTED** (`4412ad8`):
family detection (language subtag) + min-pairwise base + sparse
per-class delta modules, merged once at preload; measured on real packs:
family-en-eager (4 locales, base+3 deltas) 68.3 KB raw / 31.3 KB gz vs
all-4-eager (4 literals) 168.5 KB / 79.9 KB gz — 2.5× at equal locale
count; full variant packs physically absent from the graph. Cross-family
and single-locale configs unchanged (literals).
Real-data validation confirms all four rows; the crossover points moved
in deltas' favor on family configs (eager gz — deltas now win every
mode, so no eager/lazy carve-out for families) and the shared-pool
rejection holds with margin (≥40% gate retired to a canary, §2.3).

Deferred, not pending: the per-table delta DECISION RULE in the compiler
(weight magnitude vs delta spread; choose unit + bias; skip non-varying
tables) is measured but has no real consumer yet — real CLDR's large
numeric tables are locale-independent single tables (full encoding +
declared unit/offset header, §2.4) and its per-locale numeric tables are
tiny. Implement the rule when a genuinely varying per-locale numeric
table exists; first candidate: runtime-derived plural-rule encodings.
