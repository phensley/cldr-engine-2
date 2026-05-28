/**
 * Family-variant delta compilation (design doc §3 row 2 — generator
 * layout selection). A variant's delta is its DIFFERENCES from the
 * family base over the field classes, encoded as sparse override tries;
 * override values index into the MERGED pool (base pool first, then
 * poolAdd). Fraction digits are locale-independent (currencyData) and
 * never vary, so currency deltas carry symbol overrides only.
 */
import { addKey, encodeTrie, newTrie } from '@cldr/internal-core';
import { encodePluralRules } from './plural.js';
import type { LocaleData } from '../dataset/types.js';
import type { VariantDelta } from '../pack/types.js';
import { packU16 } from './pool.js';

const byKey = <T>(obj: Record<string, T>) => Object.keys(obj).sort().map((k) => [k, obj[k]] as const);

/** Real-data distance between two locales: differing entries across the field classes. */
export const localeDistance = (a: LocaleData, b: LocaleData): number => {
  let n = 0;
  for (const cls of ['territories', 'languages', 'scripts'] as const) {
    for (const [k, v] of byKey(a[cls])) {
      if (b[cls][k] !== v) {
        n++;
      }
    }
  }
  for (const [code, cur] of byKey(a.currencies)) {
    if (b.currencies[code]?.symbol !== cur.symbol) {
      n++;
    }
  }
  if (JSON.stringify(a.patterns) !== JSON.stringify(b.patterns)) {
    n++;
  }
  if (JSON.stringify(a.symbols) !== JSON.stringify(b.symbols)) {
    n++;
  }
  if (JSON.stringify(a.plural) !== JSON.stringify(b.plural)) {
    n++;
  }
  return n;
};

/** Min-pairwise-distance family base (the 1.x base-selection rule, measured optimal). */
export const pickFamilyBase = (members: string[], data: Record<string, LocaleData>): string => {
  let best = members[0];
  let bestScore = Infinity;
  for (const a of members) {
    let score = 0;
    for (const b of members) {
      if (a !== b) {
        score += localeDistance(data[a], data[b]);
      }
    }
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
};

/**
 * Build a variant's delta from the full base/variant data. `basePool` is
 * the COMPILED base pack's pool — delta trie values must reference the
 * merged pool (base pool, then poolAdd appended).
 */
export const buildVariantDelta = (base: LocaleData, variant: LocaleData, basePool: string[]): VariantDelta => {
  const poolAdd: string[] = [];
  const idxOf = (value: string): number => {
    const inBase = basePool.indexOf(value);
    if (inBase !== -1) {
      return inBase;
    }
    const inAdd = poolAdd.indexOf(value);
    if (inAdd !== -1) {
      return basePool.length + inAdd;
    }
    poolAdd.push(value);
    return basePool.length + poolAdd.length - 1;
  };

  const sparseTrie = <T>(baseRec: Record<string, T>, varRec: Record<string, T>, valueOf: (v: T) => string): string | undefined => {
    const entries = byKey(varRec).filter(([k, v]) => !(k in baseRec) || baseRec[k] !== v).map(([k, v]) => [k, idxOf(valueOf(v))] as const);
    if (entries.length === 0) {
      return undefined;
    }
    const trie = newTrie();
    for (const [k, v] of entries) {
      addKey(trie, k, v);
    }
    const nodes: number[] = [];
    encodeTrie(trie, nodes);
    return packU16(nodes);
  };

  const currencySymbols = sparseTrie(
    base.currencies,
    variant.currencies,
    (c) => c.symbol, // digits come from base (locale-independent)
  );

  const patterns = JSON.stringify(base.patterns) !== JSON.stringify(variant.patterns) ? [variant.patterns.decimal, variant.patterns.percent, variant.patterns.currency] : undefined;
  const symbols = JSON.stringify(base.symbols) !== JSON.stringify(variant.symbols) ? [variant.symbols.decimal, variant.symbols.group, variant.symbols.minus, variant.symbols.percent] : undefined;
  // plural rules are language-level: en-GB inherits en, so family deltas
  // normally carry no override — the field exists for correctness anyway
  const calendar =
    JSON.stringify(base.calendar) !== JSON.stringify(variant.calendar)
      ? {
          firstDay: variant.calendar.firstDay,
          minDays: variant.calendar.minDays,
          weekendStart: variant.calendar.weekendStart,
          weekendEnd: variant.calendar.weekendEnd,
          names: {
            monthsWide: variant.calendar.monthsWide.map((s) => idxOf(s)),
            monthsAbbr: variant.calendar.monthsAbbr.map((s) => idxOf(s)),
            daysWide: variant.calendar.daysWide.map((s) => idxOf(s)),
            daysAbbr: variant.calendar.daysAbbr.map((s) => idxOf(s)),
            daysNarrow: variant.calendar.daysNarrow.map((s) => idxOf(s)),
            erasWide: variant.calendar.erasWide.map((s) => idxOf(s)),
            erasAbbr: variant.calendar.erasAbbr.map((s) => idxOf(s)),
            am: idxOf(variant.calendar.dayPeriodsAm),
            pm: idxOf(variant.calendar.dayPeriodsPm),
          },
          dateFormats: [variant.calendar.dateFormats.full, variant.calendar.dateFormats.long, variant.calendar.dateFormats.medium, variant.calendar.dateFormats.short],
          timeFormats: [variant.calendar.timeFormats.full, variant.calendar.timeFormats.long, variant.calendar.timeFormats.medium, variant.calendar.timeFormats.short],
          hourFormat: variant.calendar.hourFormat,
          gmtFormat: variant.calendar.gmtFormat,
        }
      : undefined;
  const plural =
    JSON.stringify(base.plural) !== JSON.stringify(variant.plural)
      ? { cardinal: Object.keys(variant.plural.cardinal).length > 0 ? encodePluralRules(variant.plural.cardinal) : [], ordinal: Object.keys(variant.plural.ordinal).length > 0 ? encodePluralRules(variant.plural.ordinal) : [] }
      : undefined;

  // NOTE: all sparseTrie calls above MUTATE poolAdd — the conditional
  // spread below must therefore come after them (property evaluation is
  // in object-literal order).
  return {
    base: '', // filled by the caller (generate-packs)
    territories: sparseTrie(base.territories, variant.territories, (s) => s),
    languages: sparseTrie(base.languages, variant.languages, (s) => s),
    scripts: sparseTrie(base.scripts, variant.scripts, (s) => s),
    currencySymbols,
    patterns,
    symbols,
    plural,
    calendar,
    ...(poolAdd.length > 0 ? { poolAdd } : {}),
  };
};
