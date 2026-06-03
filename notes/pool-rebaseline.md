# Pool-encoding re-baseline + real-data pack structure

_Recorded 2026-09-05T16:51:06.703Z_ — scripts/benchmark-pools.ts; design context: plans/real-data-pack-design.md.

## 1. Pool transport (mono-locale): array literal vs literal+offsets vs X85 chain

Module text bytes raw + gzip; gz = what crosses the wire.

| pool | candidate | module bytes | gz bytes | gz vs literal | segments |
| --- | --- | --- | --- | --- | --- |
| A (2.5 KB, 250) | json (array literal) | 3414 | 1751 | 79% | — |
| A (2.5 KB, 250) | literal (+u16 unit offsets) | 3375 | 2227 | 100% | 1 |
| A (2.5 KB, 250) | chain (X85 utf8 + byte offsets) | 4024 | 3057 | 137% | 1 |
| B (30 KB, 3k) | json (array literal) | 41441 | 9009 | 58% | — |
| B (30 KB, 3k) | literal (+u16 unit offsets) | 40457 | 15444 | 100% | 1 |
| B (30 KB, 3k) | chain (X85 utf8 + byte offsets) | 48539 | 32953 | 213% | 1 |
| C (800 KB, 25k) | json (array literal) | 345828 | 9762 | 15% | — |
| C (800 KB, 25k) | literal (+u16 unit offsets) | 337304 | 63694 | 100% | 5 |
| C (800 KB, 25k) | chain (X85 utf8 + byte offsets) | 404894 | 248668 | 390% | 5 |
| D (150 KB, 5k, CJK/Cyrillic) | json (array literal) | 93467 | 9425 | 48% | — |
| D (150 KB, 5k, CJK/Cyrillic) | literal (+u16 unit offsets) | 91798 | 19614 | 100% | 1 |
| D (150 KB, 5k, CJK/Cyrillic) | chain (X85 utf8 + byte offsets) | 111414 | 53034 | 270% | 2 |

## 2. Decode time (largest pools)

| pool | chain decode (us/op) | literal decode (us/op) | ratio |
| --- | --- | --- | --- |
| B (30 KB, 3k) | 397.5 | 94.1 | 4.2x |
| C (800 KB, 25k) | 3349.8 | 895.8 | 3.7x |
| D (150 KB, 5k, CJK/Cyrillic) | 874.0 | 151.7 | 5.8x |

## 3. Multi-locale structures (real-data pack design gates)

raw module bytes = in-cache cost of the TS modules; gz concat = eager single-bundle wire bytes; gz per-module = lazy/chunked wire bytes (each module compressed separately).

### A: en family — 2000 fields, 5 locales, overrides 0.005 / 0.015 / 0.04 / 0.2

| structure | raw module bytes (cache) | gz concat (eager) | gz per-module (lazy) | modules | note |
| --- | --- | --- | --- | --- | --- |
| literal-each (v0.1) | 88778 | 11663 | 40780 | 5 | per-locale literal pools |
| pairs (1.x-style) | 25547 | 11865 | 12327 | 6 | layer exceptions pool + base-36 (fieldIdx, valueIdx) maps |
| base-delta | 24344 | 11087 | 11721 | 6 | layer exceptions pool + X85 mask + override indices |
| shared-full | 44196 | 21916 | 28204 | 6 | global pool + u16 index arrays |
| shared-delta | 26576 | 15019 | 14185 | 6 | global pool + base index + mask + override indices |

### B: cross-family en/fr/de — 2000 fields, 15% shared values

| structure | raw module bytes (cache) | gz concat (eager) | gz per-module (lazy) | modules | note |
| --- | --- | --- | --- | --- | --- |
| literal-each (v0.1) | 49813 | 18230 | 23054 | 3 | 3 per-locale literal pools |
| shared-full | 44665 | 25596 | 24844 | 4 | global pool + u16 index arrays |

## 4. Numeric tables: full vs delta

### C: numeric table — 300 entries, 20 diffs (±1..±3)

| structure | raw module bytes (cache) | gz concat (eager) | gz per-module (lazy) | modules | note |
| --- | --- | --- | --- | --- | --- |
| numeric full (u16 each) | 1624 | 505 | 841 | 2 | both locales as absolute u16 tables |
| numeric delta (u16 biased) | 1249 | 527 | 558 | 2 | base + delta-from-base array |

## 5. What the numbers decide

**Scenario A (one family).** The delta structures dominate: base-delta cuts raw cache bytes 3.6x vs per-locale literals (24.3 vs 88.8 KB) and lazy wire bytes 3.5x (11.7 vs 40.8 KB); eager gz is a near-tie (11.1 vs 11.7 KB) — gzip recovers cross-locale text overlap inside one bundle, but a single-bundle eager app is the only case where literals compete. The 1.x pair maps stay within ~5% of mask+indices even at 20% overrides: the delta-vs-full STRUCTURE is worth ~20x more than the pair-vs-mask representation. Shared-pool structures lose (u16 index arrays are incompressible X85: shared-full lazy gz 28.2 KB, shared-delta 14.2 KB).

**Scenario B (cross-family, ~15% shared values).** Shared pools do NOT pay: literals win both gz modes (eager 18.2 vs 25.6 KB; lazy 23.1 vs 24.8 KB) — the shared pool dedups only 15% of values while the per-locale index arrays add incompressible bytes. Cross-language value sharing is better left to gzip (eager) or base+delta structures within a family.

**Scenario C (numeric tables).** Delta-encoded tables win raw (+23%) and lazy gz (+34%); eager gz is a tie. Adopt deltas for numeric tables.

**Layout decisions for the generator (per config shape):**

- single locale, small eager sets -> literal pool modules (v0.1, unchanged)
- multiple variants of one family (en + en-GB + en-AU + en-CA) -> base module + per-variant deltas (mask or pairs; both within 5%, pick pairs for simplicity)
- cross-family sets (en + fr + de) -> literal modules (shared pools rejected at <= 15% overlap; re-measure above ~40% if such configs appear)
- numeric tables -> base + delta-from-base u16 arrays (GVE16)

Re-validate with real CLDR data: real duplication/entropy differs from synthetic pools; the crossover points (family overlap, override density) move with the data.

