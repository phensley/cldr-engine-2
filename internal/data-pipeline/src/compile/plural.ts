/**
 * Plural-rule compilation (CLDR condition grammar → flat u16 encoding).
 *
 * Grammar (CLDR TR35, the fixed subset shipped in plurals.json/
 * ordinals.json):
 *
 *   condition = and_cond ( "or" and_cond )*
 *   and_cond  = relation ( "and" relation )*
 *   relation  = operand ( "%" | "mod" value )? ( "=" | "!=" ) value_list
 *   operand   = "n" | "i" | "v" | "w" | "f" | "t" | "e"
 *   value_list= value ( "," value )* ; value = int | int ".." int
 *
 * Sample lists ("@integer 0, 1…") are stripped by the adapter — they are
 * NOT part of the conditions. An empty condition (always 'other') encodes
 * as an empty OR list, which the evaluator treats as vacuously true.
 *
 * Wire encoding (per ruleset, flat number[] literal — mod values can
 * exceed u16, e.g. fr's 1_000_000, so the stream is NOT u16-constrained):
 *   [catCount,
 *    catCode, nOrs, { nAnds, { operand, mod, eq, nRanges, lo, hi … } … } …]
 *   operand codes n=0 i=1 v=2 w=3 f=4 t=5 e=6; eq: 1 =, 0 !=; mod 0 = none.
 *   catCode = index into PLURAL_CATEGORIES (wire order).
 */
import { PLURAL_CATEGORIES } from '@cldr/internal-core';
const OPERANDS = { n: 0, i: 1, v: 2, w: 3, f: 4, t: 5, e: 6 } as const;

interface Relation {
  operand: number;
  mod: number;
  eq: boolean;
  ranges: Array<[number, number]>;
}

/** Parse one relation: `i % 10 = 2..4` / `n != 12..14` etc. */
const parseRelation = (raw: string): Relation => {
  const m = /^\s*([nivwfte])\s*(?:(%|mod)\s*(\d+))?\s*(!=|=)\s*([\d\s.,]+?)\s*$/.exec(raw);
  if (m === null) {
    throw new Error(`plural: unparseable relation '${raw}'`);
  }
  const operand = OPERANDS[m[1] as keyof typeof OPERANDS];
  const mod = m[3] === undefined ? 0 : Number(m[3]);
  const eq = m[4] === '=';
  const ranges: Array<[number, number]> = [];
  for (const part of m[5].split(',')) {
    const value = part.trim();
    const range = /^(\d+)\.\.(\d+)$/.exec(value);
    if (range !== null) {
      ranges.push([Number(range[1]), Number(range[2])]);
    } else if (/^\d+$/.test(value)) {
      ranges.push([Number(value), Number(value)]);
    } else {
      throw new Error(`plural: unparseable value '${value}' in '${raw}'`);
    }
  }
  return { operand, mod, eq, ranges };
};

/** Parse a condition into OR-of-AND groups of relations. */
export const parseCondition = (condition: string): Relation[][] => {
  if (condition.trim() === '') {
    return [];
  }
  return condition.split(/\s+or\s+/).map((andGroup) => andGroup.split(/\s+and\s+/).map(parseRelation));
};

/** Encode a category-condition map into the flat wire stream. */
/** Encode a category-condition map into the flat wire stream. */
export const encodePluralRules = (rules: Partial<Record<(typeof PLURAL_CATEGORIES)[number], string>>): number[] => {
  const cats = Object.keys(rules) as Array<(typeof PLURAL_CATEGORIES)[number]>;
  if (cats.length === 0) {
    // other-only: a single empty 'other' rule (always true, last)
    return [1, PLURAL_CATEGORIES.indexOf('other'), 0];
  }
  const out: number[] = [cats.length];
  for (const cat of cats) {
    const groups = parseCondition(rules[cat] ?? '');
    out.push(PLURAL_CATEGORIES.indexOf(cat), groups.length);
    for (const ands of groups) {
      out.push(ands.length);
      for (const rel of ands) {
        out.push(rel.operand, rel.mod, rel.eq ? 1 : 0, rel.ranges.length);
        for (const [lo, hi] of rel.ranges) {
          out.push(lo, hi);
        }
      }
    }
  }
  return out;
};

