# Real-data pack-structure validation (CLDR 48.2.1)

_Recorded 2026-09-05T16:52:11.554Z_ — scripts/benchmark-real.ts (mirrors scripts/benchmark-pools.ts encodings); data: cldr-json 48.2.1 (zip sha256 6435a529…) → `.cache/cldr/48.2.1` via scripts/fetch-cldr-data.ts; design context: plans/real-data-pack-design.md §3.

## 0. Real field universe

1845 fields: territories + languages + scripts + per-currency {symbol, displayName} (CLDR 48 ships fully resolved per-locale JSON — per-locale diffs are real divergence). Locales: en-001, en, en-GB, en-AU, en-CA, fr, de, zh, ar, hi, ru.

## 1. Mono-locale transport — real CJK pool (zh territory names)

| pool | candidate | module bytes | gz bytes | gz vs literal | roundtrip |
| --- | --- | --- | --- | --- | --- |
| zh territories (316, CJK, 3.4 KB utf8) | json (array literal) | 4439 | 2134 | 100% | ok |
| zh territories (316, CJK, 3.4 KB utf8) | chain (X85 utf8 + byte offsets) | 5239 | 3836 | 180% | ok |

## 2. Family structure (design doc §3 row 2)

- 1845 fields (territories ∪ languages ∪ scripts ∪ currency symbols+names, real union).
- override density vs base (en-001): en 1.2466124661246614% (23/1845); en-GB 0.10840108401084012% (2/1845); en-AU 2.7642276422764227% (51/1845); en-CA 1.8970189701897018% (35/1845)
- exception values: 93 unique across variants; base pool: 1646 unique strings.

raw module bytes = in-cache cost; gz concat = eager single bundle; gz per-module = lazy chunks.

### A-real: en-001 base + en, en-GB, en-AU, en-CA

| structure | raw module bytes (cache) | gz concat (eager) | gz per-module (lazy) | modules | note |
| --- | --- | --- | --- | --- | --- |
| literal-each (v0.1) | 110110 | 10674 | 44618 | 5 | per-locale literal pools |
| pairs (1.x-style) | 24293 | 9871 | 10228 | 6 | layer exceptions pool + base-36 (fieldIdx, valueIdx) maps |
| base-delta | 25060 | 9925 | 10349 | 6 | layer exceptions pool + X85 mask + override indices |
| shared-full | 46609 | 18138 | 27323 | 6 | global pool + u16 index arrays |
| shared-delta | 29784 | 14078 | 13699 | 6 | global pool + base index + mask + override indices |


### en-family pairwise field distances (base-selection justification)

|  | en-001 | en | en-GB | en-AU | en-CA |
| --- | --- | --- | --- | --- | --- |
| en-001 | 0 | 23 | 2 | 51 | 35 |
| en | 23 | 0 | 25 | 68 | 42 |
| en-GB | 2 | 25 | 0 | 53 | 37 |
| en-AU | 51 | 68 | 53 | 0 | 59 |
| en-CA | 35 | 42 | 37 | 59 | 0 |

**Verdict: row 2 CONFIRMED, with eager gz resolving in deltas' favor.** Pairs vs literal-each: raw 4.53×, lazy gz 4.36×, and eager gz -7.5% (synthetic scenario A measured a near-tie; the real family duplicates HEAVILY — en-GB overrides only 2/1845 fields — so gzip alone cannot recover the sparsity, the delta structure can). Pairs vs mask stay within 5% on every metric (-3.1% raw) — keeping the 'pairs for simplicity' default. Shared pools lose on every metric (shared-full eager gz 69.9%). Base selection: en-001 minimizes pairwise distance (Σ111 vs en-GB 117, en 158, en-CA 173, en-AU 231) — the 1.x choice is optimal on real data.

## 3. Cross-family structure (design doc §3 row 3)

- 1845 fields. Real cross-locale value overlap vs en: fr 12.6%; de 33.9%; zh 8.8%; ar 9.0%; hi 9.2%; ru 9.1%.
- shared pool: 9113 unique strings across 7 locales.

### B-real: cross-family en / fr / de / zh / ar / hi / ru

| structure | raw module bytes (cache) | gz concat (eager) | gz per-module (lazy) | modules | note |
| --- | --- | --- | --- | --- | --- |
| literal-each (v0.1) | 191594 | 58516 | 60394 | 7 | 7 per-locale literal pools |
| shared-full | 219380 | 81047 | 80765 | 8 | global pool + u16 index arrays |
| shared-delta | 211915 | 77866 | 77033 | 8 | global pool + base index + mask + override indices |


**Verdict: row 3 CONFIRMED — literals win both gz modes even with de at 33.9% overlap.** shared-full: eager gz 38.5%, lazy gz 33.7%; shared-delta: eager 33.1%, lazy 27.6%. The u16 index arrays outweigh what the shared pool recovers (the pool dedups only the overlap while every locale pays full index bytes; mask+delta within a family — §2 — is where real duplication lives). The ≥40% re-measure gate is retired to a canary (design doc §2.3): 33.9% overlap is still a 30%+ loss, and any pair that would cross the gate is family-classified and handled by the base+delta row anyway.

## 4. Numeric tables (design doc §3 row 4)

- fraction digits: 307 currencies, value distribution 0×46, 2×253, 3×6, 4×2. Locale-independent ⇒ no cross-locale base to delta from — the per-table delta rule does NOT apply here.
- zone offsets: 418 IANA zones (platform tzdb), offsets at 2025-01-15 vs 2025-07-15 UTC noon. DST diffs: 128 zones change (+0s×290, +3600s×114, -3600s×12, +7200s×1, -1800s×1). Absolute seconds span -39600..50400s — wider than the u16 domain [0, 65535], so the FULL encoding also needs unit scaling (900s units exact for all tzdb offsets).

### C-real: numeric tables — real fraction digits + real zone offsets

| structure | raw module bytes (cache) | gz concat (eager) | gz per-module (lazy) | modules | note |
| --- | --- | --- | --- | --- | --- |
| fraction digits (full u16) | 447 | 207 | 207 | 1 | single table — delta needs a second table/base; N/A (see note) |
| offsets full (u16, 900s units + bias) | 1214 | 790 | 1038 | 2 | both instants as absolute scaled u16 tables |
| offsets delta (seconds, bias 10000) | 1734 | 824 | 861 | 2 | base + delta-from-base, raw seconds |
| offsets delta (half-hr units, bias 50) | 1214 | 750 | 792 | 2 | base + delta-from-base, scaled to 1800s units (15-min zones rounded) |
| offsets delta (quarter-hr units, bias 50) | 1214 | 747 | 799 | 2 | base + delta-from-base, scaled to 900s units (exact for all tzdb offsets) |


**Verdict: row 4 CONFIRMED with the rule sharpened — 'per-table' now also means 'per-tables-that-vary'.**

- **Fraction digits (307 codes, 0×46 / 2×253 / 3×6 / 4×2): single, locale-independent table — 447 raw bytes. There is NO per-locale variant to delta from, so the rule excludes it outright (the 'delta buys nothing for 0/2/3' prediction never gets exercised — stronger than predicted).**
- **Zone-offset pairs: unit-scaled delta wins lazy gz -23.0% (offsets delta (half-hr units, bias 50): -23.7%) and eager gz -5.4%; raw is a TIE (1.00×) — the synthetic +23% raw win did NOT reproduce, because real scaled offsets are small enough for 1-byte varints in both encodings. The real win is wire gz, not cache bytes.**
- **Unit choice is decisive: the naive seconds-delta (bias 10000) LOSES eager gz (4.3%) and raw (1.43×) — only lazy gz stays ahead. Scaling + bias per the recorded rule is required, not optional polish.**
- **New constraint the synthetic never hit: absolute offsets span −39600..50400s — wider than the u16 domain — so unit scaling is REQUIRED for the full encoding itself, not just deltas (900s units are exact for every modern tzdb offset; half-hour units round the :15/:45 zones; bias must cover the scaled span, −22..28 half-hours ⇒ b=50).**

## 5. Design-doc §3 table after real-data validation

| Config shape | Layout | Real-data verdict |
| --- | --- | --- |
| single locale / small eager sets | literal pool modules (v0.1) | CONFIRMED — real CJK literals beat X85 chain 1.8× gz |
| multiple variants of one family | base module + per-variant deltas (pairs) | CONFIRMED (raw 4.5×, lazy 4.4×, eager −7.5%); pairs vs mask within 5% |
| cross-family sets | literal modules | CONFIRMED — 30%+ worse with shared pools at 33.9% de overlap |
| numeric tables | base + delta-from-base u16 (per-table rule) | CONFIRMED for tables that vary; unit scaling required (u16 span); non-varying single tables encoded full |

