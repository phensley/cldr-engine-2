/**
 * Pack decoding — the inverse of the compile side (data-pipeline). The
 * runtime and the S2 generated client decode through this; tests on both
 * sides round-trip through it.
 *
 * v0.1: pools are array literals — no decode, no offsets; only the
 * numeric streams (tries, currency tables, numeric values) are decoded.
 */
import { decodeX85GVE16 } from '../binary/decode.js';
import { addKey, newTrie } from '../trie/build.js';
import { encodeTrie } from '../trie/encode.js';
import { scanTrie } from '../trie/scan.js';
import { searchTrie } from '../trie/search.js';
import { decodePluralRules } from './plural.js';
import type { PluralRuleSet } from './plural.js';
import type { LocalePack, NumericPack, VariantDelta } from './types.js';

/** Decoded wire structures, ready for lookups. */
export interface DecodedLocalePack {
  /** Dedup-assigned, sorted string pool (display names + currency symbols). */
  pool: string[];
  territoryTrie: number[];
  languageTrie: number[];
  scriptTrie: number[];
  currencyTrie: number[];
  /** Interleaved [poolIndex, fractionDigits] pairs. */
  currencyTable: number[];
  /** Fixed order: [decimal, percent, currency]. */
  patterns: string[];
  /** Fixed order: [decimal, group, minus, percent]. */
  symbols: string[];
  /** Decoded plural rulesets. */
  plural: { cardinal: PluralRuleSet; ordinal: PluralRuleSet };
  /** Decoded gregorian slice — names RESOLVED to strings (fixed positions). */
  calendar: {
    firstDay: number;
    minDays: number;
    weekendStart: number;
    weekendEnd: number;
    names: {
      monthsWide: string[];
      monthsAbbr: string[];
      daysWide: string[];
      daysAbbr: string[];
      daysNarrow: string[];
      erasWide: string[];
      erasAbbr: string[];
      am: string;
      pm: string;
    };
    dateFormats: string[];
    timeFormats: string[];
    hourFormat: string;
    gmtFormat: string;
  };
}

const resolveNames = (pool: string[], indices: number[]): string[] => indices.map((i) => pool[i]);

export const decodeLocalePack = (pack: LocalePack): DecodedLocalePack => ({
  pool: pack.pool,
  territoryTrie: Array.from(decodeX85GVE16(pack.territories.trie)),
  languageTrie: Array.from(decodeX85GVE16(pack.languages.trie)),
  scriptTrie: Array.from(decodeX85GVE16(pack.scripts.trie)),
  currencyTrie: Array.from(decodeX85GVE16(pack.currencies.trie)),
  currencyTable: Array.from(decodeX85GVE16(pack.currencies.table)),
  patterns: pack.patterns,
  symbols: pack.symbols,
  plural: { cardinal: decodePluralRules(pack.plural.cardinal), ordinal: decodePluralRules(pack.plural.ordinal) },
  calendar: decodeCalendar(pack),
});

/** Decode the gregorian slice; names RESOLVED to strings (fixed positions). */
const decodeCalendar = (pack: LocalePack): DecodedLocalePack['calendar'] => ({
  firstDay: pack.calendar.firstDay,
  minDays: pack.calendar.minDays,
  weekendStart: pack.calendar.weekendStart,
  weekendEnd: pack.calendar.weekendEnd,
  names: {
    monthsWide: resolveNames(pack.pool, pack.calendar.names.monthsWide),
    monthsAbbr: resolveNames(pack.pool, pack.calendar.names.monthsAbbr),
    daysWide: resolveNames(pack.pool, pack.calendar.names.daysWide),
    daysAbbr: resolveNames(pack.pool, pack.calendar.names.daysAbbr),
    daysNarrow: resolveNames(pack.pool, pack.calendar.names.daysNarrow),
    erasWide: resolveNames(pack.pool, pack.calendar.names.erasWide),
    erasAbbr: resolveNames(pack.pool, pack.calendar.names.erasAbbr),
    am: pack.pool[pack.calendar.names.am],
    pm: pack.pool[pack.calendar.names.pm],
  },
  dateFormats: pack.calendar.dateFormats,
  timeFormats: pack.calendar.timeFormats,
  hourFormat: pack.calendar.hourFormat,
  gmtFormat: pack.calendar.gmtFormat,
});

export interface DecodedNumericPack {
  keys: string[];
  values: number[];
}

export interface DecodedZonesTable {
  keys: string[];
  /** Seconds per unit. */
  unit: number;
  /** Additive bias. */
  bias: number;
  /** Offset in SECONDS per key (already unit*bias-expanded). */
  offsets: number[];
}

/** The deferred unit+offset numeric header (design doc §2.4): decode + expand. */
export const decodeZonesTable = (zones: import('./types.js').ZonesTable): DecodedZonesTable => ({
  keys: zones.keys,
  unit: zones.unit,
  bias: zones.bias,
  offsets: Array.from(decodeX85GVE16(zones.values)).map((v) => (v - zones.bias) * zones.unit),
});

export const decodeNumericPack = (pack: NumericPack): DecodedNumericPack => ({
  keys: pack.keys,
  values: Array.from(decodeX85GVE16(pack.values)),
});

/** Convenience: trie value for a key, or undefined. */
export const lookupTrieValue = (key: string, trie: number[]): number | undefined => searchTrie(key, trie)?.value;

// ---------------------------------------------------------------------------
// family-variant merge (generator layout selection, plans/real-cldr-
// compiler.md §3 row 2): base + sparse per-class overrides → a materialized
// DecodedLocalePack, built ONCE per variant at preload; lookups afterwards
// use plain arrays (no per-access indirection).

const decodeTrie = (stream: string): number[] => Array.from(decodeX85GVE16(stream));

/** Overlay delta entries onto base entries (delta wins), re-encode deterministically. */
const materializeTrie = (baseNodes: number[], deltaStream: string | undefined): number[] => {
  if (deltaStream === undefined) {
    return baseNodes;
  }
  const merged = new Map<string, number>();
  for (const e of scanTrie(baseNodes)) {
    merged.set(e.key, e.value);
  }
  for (const e of scanTrie(decodeTrie(deltaStream))) {
    merged.set(e.key, e.value);
  }
  const trie = newTrie();
  for (const [key, value] of [...merged.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    addKey(trie, key, value);
  }
  const nodes: number[] = [];
  encodeTrie(trie, nodes);
  return nodes;
};

/**
 * Materialize a variant's full decoded pack from its base and delta.
 * The caller caches the result (client.ts) — this runs once per variant.
 * Base must already be decoded (or be resolvable by the caller).
 */
export const mergeVariantDelta = (base: DecodedLocalePack, delta: VariantDelta): DecodedLocalePack => {
  const pool = delta.poolAdd === undefined ? base.pool : [...base.pool, ...delta.poolAdd];
  const currencyTable = base.currencyTable.slice();
  if (delta.currencySymbols !== undefined) {
    for (const e of scanTrie(decodeTrie(delta.currencySymbols))) {
      const pairIndex = lookupTrieValue(e.key, base.currencyTrie);
      if (pairIndex !== undefined) {
        currencyTable[pairIndex * 2] = e.value;
      }
    }
  }
  return {
    pool,
    territoryTrie: materializeTrie(base.territoryTrie, delta.territories),
    languageTrie: materializeTrie(base.languageTrie, delta.languages),
    scriptTrie: materializeTrie(base.scriptTrie, delta.scripts),
    currencyTrie: base.currencyTrie,
    currencyTable,
    patterns: delta.patterns ?? base.patterns,
    symbols: delta.symbols ?? base.symbols,
    plural: {
      cardinal: delta.plural?.cardinal !== undefined ? decodePluralRules(delta.plural.cardinal) : base.plural.cardinal,
      ordinal: delta.plural?.ordinal !== undefined ? decodePluralRules(delta.plural.ordinal) : base.plural.ordinal,
    },
    // calendar: full-override semantics — the delta carries a complete
    // calendar block when anything differs (family deltas are rare here:
    // only en-GB's dateFormats differ in the 11-locale set)
    ...(delta.calendar !== undefined ? { calendar: decodeCalendar({ ...({ pool: pool } as LocalePack), calendar: delta.calendar } as LocalePack) } : { calendar: base.calendar }),
  };
};
