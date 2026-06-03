# Pack format spec v0.1 — S1 deliverable, revised after the pool re-baseline

Status: **approved**. Measurements: `notes/s1-benchmark.md`
(v0 decisions: utf8 codec, 16-bit) and `notes/pool-rebaseline.md`
(v0.1: pool transport). Implementation: `internal/data-pipeline`
(compile) + `internal/core` (wire shapes + decode).

## 1. What changed in v0.1

The pool re-baseline (`scripts/benchmark-pools.ts`) measured the S1-chain
pool transport against plain text at representative CLDR scale
(2.5 KB → 800 KB pools):

- **chain loses everywhere** — raw +16–19%, gz 2.1×–3.9× worse at ≥ 30 KB
  (pool C: 248.7 KB vs 63.8 KB gz), decode 4–6× slower.
- **array literals need no offsets** (index = position), are identity-
  decoded (zero decode), and gzip best of all candidates (pool C:
  9.8 KB gz).
- The X85/GVE16 chain stays for **numeric streams only** (tries, currency
  tables, numeric tables) — the S1 utf8-vs-utf16 codec question and the
  pool chunking machinery are moot (no per-pool codec, no offset table).

**Effect:** `LocalePack.pool` and `patterns` and `NumericPack.keys` are
plain `string[]`; `ChunkedPoolPack` and the pool codecs are deleted. The
u16 wire domain now covers only numbers — trie values keep the 65535
cap, with the per-dataset record-table pattern as the escape hatch.

## 2. The codec chain (numeric streams)

```
numbers (trie | tables) → number[] → GVE16 → Uint8Array → X85 → string
```

- **GVE16** — group varint for u16 arrays (1–2 bytes per value + 1/8
  selector byte; ~44% savings on small values). Length-prefixed (4 bytes).
- **X85** — no-escape ASCII85 (+25% over raw bytes); safe in single-,
  double-quoted, JSON and template contexts.
- **decodeX85GVE16** (core) decodes both in one pass.
- Trie arrays (core `trie/encode.ts`) flatten to `number[]` → u16 →
  same chain. Search is case-insensitive with exact-case bias.

## 3. Wire shapes (v0.1 → v1 real-data)

All types live in `internal/core/src/pack/types.ts`.

### LocalePack — one per locale

```ts
interface LocalePack {
  pool: string[];                 // display names (territories/languages/
                                  // scripts) + currency symbols, deduped +
                                  // sorted; trie values index here
  territories: { trie: string };  // code → pool index (X85(GVE16(u16[])))
  languages: { trie: string };    // v1: display-name tries
  scripts: { trie: string };      // v1
  currencies: { trie: string; table: string };
                                  // code → table pair index; table =
                                  // interleaved u16 pairs [poolIndex,
                                  // fractionDigits]
  patterns: string[];             // fixed order: [decimal, percent,
                                  // currency] — POSITIVE subpatterns only
                                  // (adapter splits ';')
  symbols: string[];              // v1, fixed order: [decimal, group,
                                  // minus, percent] — the DEFAULT
                                  // numbering system's separators; the
                                  // runtime renders with these
}
```

### Plural rules (wire v1, feature 'plural')

```ts
plural: { cardinal: number[]; ordinal: number[] };  // flat literal streams
```

Compiled CLDR conditions (compile/plural.ts): OR-of-AND relation groups,
operand codes n=0 i=1 v=2 w=3 f=4 t=5 e=6, % mod, =/!=, value ranges.
Plain number[] literals on the wire — not the u16 chain, because CLDR
mod values exceed u16 (fr.many: `i % 1000000 = 0`); the data is tiny.
Empty stream = other-only. Decode + evaluation in core pack/plural.ts.

### Calendar slice (wire v1, gregorian, scoped-as-proof)

Fixed-position index vectors into the shared pool (months 0..11 = Jan..Dec,
days 0..6 = sun..sat, eras 2, am/pm) as plain number[] literals, plus the
ICU date-pattern subset as string literals. Positions are the schema —
self-describing, no tries. The zone-offset companion ships as a separate
shared module (`zones`, the deferred unit+offset numeric header):
`{ keys, unit: 900, bias: 50, values }` — offsets at a fixed instant,
quarter-hour units + bias (measured rule), expanded by decodeZonesTable.

The currency table decouples currency order from pool index space
(pool indices are dedup-assigned, not currency-contiguous) — no padding.
Real scale (en): ~1,200 pool strings, 316/693/220 name keys, 307
currencies — languages/scripts dominate pack bytes (bundle table re-
baselined in notes/s2-bundle-table.md; the pair-index trie convention
`table[v*2]` is unchanged from v0.1).

### NumericPack — the shared, locale-independent table

```ts
interface NumericPack {
  keys: string[];   // ASCII codes
  values: string;   // X85(GVE16(u16[])) — parallel to keys
}
```

## 4. Data shapes (what carries what)

| Dataset | Per-locale | Mechanism |
|---|---|---|
| Territory display names | yes | trie (ASCII codes) → pool array index |
| Currency symbols + digits | yes | trie → currency table ([pool idx, digits]) |
| Number format patterns | yes | fixed-order array of 3 |
| Numeric table (offsets) | shared | keys array + GVE16 values |

Negative numeric values have no wire home yet (u16 domain); the dataset
encodes them as a bias (minutes east of UTC-12).

## 5. Decisions, with measurements

1. **Pool transport: array literals (v0.1).** `notes/pool-rebaseline.md`;
   the S1 chain is retained for numbers only. Under gzip, array-literal
   pools also beat the old chain 2–4× at scale — the module text is plain
   text a bundler/http layer can compress.
2. **16-bit: u16 everywhere for numbers; no GVE32.** (`notes/s1-benchmark.md`
   stress: chunked u16 offsets ≈ 22.5 KB vs ≈ 70 KB hypothetical u32
   varints — 3.1×.) Trie values cap at 65535 (pool ENTRY count); the
   per-dataset record-table pattern is the escape hatch if ever exceeded.
3. **Decode is nearly free now.** Pools are identity (array index);
   only trie/table streams decode (~µs per locale pack).
4. **The codec chain is not a wire-compression play** — recorded in S1,
   confirmed here: its value is structure + escape-free embedding +
   deterministic byte-exact selection (the S2 lever), not compression.

## 6. Overflow paths and guards

- **Compile guard (loud):** any number outside the u16 wire domain
  throws (`compile/pool.ts` — `toU16`); tries and tables pass through it.
- **Pool arrays have no u16 ceiling** — 40k+ entries compile fine; only
  trie values (indices) are u16-bounded (> 65535 pool entries would need
  the record-table escape hatch).
- **Empty key sets** encode to empty u16 streams (guarded in the
  compiler; empty tries decode to `undefined` lookups).

## 7. Out of scope (prototype)

- Pack versioning/magic bytes (version is pinned by the S2 build).
- Signed values, wide tries (future-data items).
- Real CLDR data; the S1 §4 note (plain-literal pools under gzip) is now
  resolved by the v0.1 transport decision — re-validate sizes when real
  data lands (synthetic pools ≈ real scale, but real entropy differs).
