# Real-CLDR compiler — size/perf record + decisions (Phase D)

- plans/real-cldr-compiler.md phases A–C done (adapter, wire v1 + real packs, validation,
round-trip re-record).

## Real scale (CLDR 48.2.1, 11 locales)

| locale | territories | languages | scripts | currencies | pack module bytes |
| --- | --- | --- | --- | --- | --- |
| en (+001/GB/AU/CA) | 316 | 693 | 220 | 307 | 38.3 KB |
| fr | 311 | 663 | 144 | 284 | 35.5 KB |
| de | 310 | 652 | 169 | 305 | 36.0 KB |
| zh | 304 | 594 | 203 | 307 | 39.1 KB |
| ar | 306 | 576 | 129 | 262 | 41.9 KB |
| hi | 309 | 576 | 141 | 193 | 47.3 KB |
| ru | 309 | 585 | 168 | 282 | 44.4 KB |

- `decodeLocalePack` (en): **~150 µs/op** at real scale (mini fixture was
  ~3 µs) — decode-once-per-client remains the right contract; merge-once
  materialization for family deltas adds a one-time sub-ms cost (D2).
- Pack bytes are plain JSON literals (pools + X85 string streams); gz is
  the wire metric (bundles below).

## Bundle table (re-baselined on real packs, notes/s2-bundle-table.md)

| config | bundle bytes | gz |
| --- | --- | --- |
| decimal-only-en | 7.6 KB | 2.6 KB |
| currency-en-fr | 85.2 KB | 40.6 KB |
| all-4-eager (en/fr/de/zh) | 164 KB | 78 KB |
| all-lazy (11 locales) | 451 KB / 12 files | 209 KB |

## Decision: languages/scripts stay on the wire (v1)

Measured: languages+scripts tries are **~60% of pack bytes** (en: 30.5 KB
full vs 12.2 KB without) and **nothing consumes them yet** (decimal/currency
read only territories, currencies, patterns, symbols).

**Decision: KEEP for v1.** Rationale:
1. real-scale trie/pool/decode behavior is itself a Phase-C validation
   goal — cutting them would re-shrink the stress test the wire needs;
2. the localeDisplayNames feature (territory/language/script names at
   runtime) is the shortest-path next consumer — the data and wire are
   then already in place;
3. the cut is a one-line revert (compile excludes two field classes) if
   the bundle table ever dominates the product metric.

Recorded as an explicit option for the full-coverage follow-up.

## Family-layout numbers (D2)

| config | bundle bytes | gz | note |
| --- | --- | --- | --- |
| all-4-eager (en/fr/de/zh, literals) | 168.5 KB | 79.9 KB | 4 independent locales |
| family-en-eager (en + GB/AU/CA, base+deltas) | 68.3 KB | 31.3 KB | 2.5× smaller, same count |
| all-lazy (11 locales, deltas for family) | 316.6 KB | 144.2 KB | 12 files |

Merge machinery tax: decimal-only-en 7.6 → 14.4 KB (createCldr imports
scan/encode statically); recorded follow-up if the single-locale floor
matters.

## Open follow-ups (from plans/real-cldr-compiler.md)

Full coverage (766 locales); all numbering systems; compact notations;
currency relevance sets; aligned-vector format + family base/delta (D2);
parity Tier 2 (1.x pack-field decoder); per-locale negative-pattern
forms; rounding/cash fields on the wire.
