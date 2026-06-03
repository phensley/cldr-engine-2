# S1 benchmark — pack format v0

_Recorded 2026-08-29T01:36:08.881Z_

## 1. Pack sizes (mini-cldr): utf8 vs utf16 vs raw JSON

Raw JSON = the naive representation a runtime would ship without codecs. gz columns are gzip of the module text (actual wire bytes).

| locale | utf8 pack | utf16 pack | raw JSON | gz utf8 | gz utf16 | gz raw |
| --- | --- | --- | --- | --- | --- | --- |
| en | 616 | 648 | 578 | 482 | 494 | 331 |
| fr | 581 | 618 | 516 | 450 | 463 | 309 |
| de | 666 | 708 | 612 | 520 | 534 | 343 |
| es-419 | 611 | 648 | 548 | 474 | 495 | 324 |
| Σ all locales | 2474 | 2622 | 2254 | 1926 | 1986 | 1307 |

| stream | utf8 pack | utf16 pack | raw JSON | gz utf8 | gz utf16 | gz raw |
| --- | --- | --- | --- | --- | --- | --- |
| numeric (shared) | 385 | 421 | 390 | 329 | 361 | 203 |
## 2. Decode + lookup perf

| measure | utf8 | utf16 |
| --- | --- | --- |
| decode all locale packs + numeric (ms/op) | 27.10 | 31.52 |
| decode en pack (ms/op) | 5.613 | 6.476 |
| 11-lookup batch on decoded pack (ms/op) | 0.856 | 0.841 |
## 3. 16-bit ceiling (S1 open question)

Synthetic pool: 20000 place names (~12% accented), UTF-8 data ≈ 196 KB — past the single-pool ceiling of 65535 offset units.

Single-pool encoding overflow: yes — u16 offsets guard (RangeError)

| metric | utf8 chunked | utf16 chunked | raw JSON |
| --- | --- | --- | --- |
| strings | 20000 | 20000 | 20000 |
| data stream size | 196 KB | 391 KB | — |
| segments (≤ 65535 units each) | 4 | 4 | — |
| pack bytes | 303254 | 334554 | 260001 |
| gzip bytes | 106309 | 126735 | 49192 |
| zip ratio vs gz(raw) | 216.1% | 257.6% | 100% |

Hypothetical single-pool u32 (GVE32-style) offsets: ≈ 70004 bytes for 20001 offsets (est. 3.5 B/value) — vs ≈ 22502 bytes for the byte-equivalent u16 offsets (chunked). The gap is the decision.
## 4. 16-bit decision (recorded for plans/pack-format-spec.md)

**Chunked pools; keep u16 everywhere (no GVE32).**

- Single-pool offsets (= pool data length in u16 units) cap at 65535 — ~64 KB of data per pool. Real CLDR pools exceed this.
- Chunking splits the pool into ≤64 KB segments; every value stays u16, so GVE16 and the trie encoder are untouched. Segment overhead is one offset-sentinel per chunk (bytes, see table).
- A GVE32 extension would widen every offsets value to 1-4 bytes (~3.5 B/entry at 0-200k scale, table above) — strictly worse than chunking at every measured point, and it rewrites the core binary.
- Trie values (pool indices) stay u16 while a pool has < 65536 entries — true of the stress pool and of real CLDR pools; if ever exceeded, the escape hatch is a per-dataset record table (the currency-table pattern) rather than a wider trie.

Consequence for v0: LocalePack uses flat single-segment pools (as compiled today); ChunkedPoolPack is the overflow path and the S1-M5 spec keeps both shapes.
## 5. Findings (what the numbers decide)

**Pool codec: utf8.** Smaller than utf16 at every scale (mini-cldr totals 2474 vs 2622 B; stress 303 vs 334 KB; gzip 1926 vs 1986 B / 106 vs 127 KB) and ~15% faster to decode (27.6 vs 31.4 us all-packs). Lookup cost is trie-bound, codec-independent (~0.84 us/batch).

**The codec chain is not a wire-compression play.** gz(pack) exceeds gz(raw JSON) at every measured scale (totals 1926 vs 1307 B; stress 106 vs 49 KB): X85/GVE16 leave little redundancy for gzip, while repetitive text gzips well. The chain earns its bytes via structure + single-pass decode + escape-free embedding + deterministic byte-exact selection (the S2 lever) — recorded so S2 re-baselines plain-literal UTF-8 pools against the codec chain when real CLDR data lands (out of prototype scope).

**16-bit: chunked pools, no GVE32.** Offsets for the stress pool: ~22.5 KB chunked (u16) vs ~70 KB hypothetical u32 varints — 3.1x, plus a core rewrite and a widened trie. Chunking adds only per-chunk sentinel bytes (~4 segments -> ~20 B).
