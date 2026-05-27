/**
 * Plural rules: wire decode + evaluation (both used by the runtime; the
 * decode also powers pipeline round-trip tests).
 *
 * Wire layout (flat u16, encoded by data-pipeline compile/plural.ts):
 *   [catCount, catCode, nOrs, { nAnds, { operand, mod, eq, nRanges,
 *   lo, hi … } … } …]
 * An empty OR list (the 'other' rule) is vacuously true.
 */
export interface PluralRelation {
  /** operand code: n=0 i=1 v=2 w=3 f=4 t=5 e=6 (wire) */
  operand: number;
  /** 0 = none */
  mod: number;
  eq: boolean;
  ranges: Array<[number, number]>;
}

/** One category rule: OR groups of AND-ed relations; ands = [] always matches. */
export interface PluralRule {
  /** index into PLURAL_CATEGORIES (wire order) */
  cat: number;
  ands: PluralRelation[][];
}

export type PluralRuleSet = PluralRule[];

/** Decode a flat plural stream (plain number[] — see compile/plural.ts) into rules [] → other-only. */
export const decodePluralRules = (flat: number[]): PluralRuleSet => {
  if (flat.length === 0) {
    return [{ cat: 5, ands: [] }]; // 'other'
  }
  let p = 0;
  const nCats = flat[p++];
  const rules: PluralRuleSet = [];
  for (let c = 0; c < nCats; c++) {
    const cat = flat[p++];
    const nOrs = flat[p++];
    const ands: PluralRelation[][] = [];
    for (let o = 0; o < nOrs; o++) {
      const nAnds = flat[p++];
      const group: PluralRelation[] = [];
      for (let a = 0; a < nAnds; a++) {
        const operand = flat[p++];
        const mod = flat[p++];
        const eq = flat[p++];
        const nRanges = flat[p++];
        const ranges: Array<[number, number]> = [];
        for (let r = 0; r < nRanges; r++) {
          const lo = flat[p++];
          const hi = flat[p++];
          ranges.push([lo, hi]);
        }
        group.push({ operand, mod, eq: eq === 1, ranges });
      }
      ands.push(group);
    }
    rules.push({ cat, ands });
  }
  return rules;
};

/** The CLDR plural operands, computed from an exact decimal (runtime side). */
export interface PluralOperands {
  n: number;
  i: number;
  v: number;
  w: number;
  f: number;
  t: number;
  e: number;
}

const OPERAND_VALUE = (ops: PluralOperands, code: number): number =>
  code === 0 ? ops.n : code === 1 ? ops.i : code === 2 ? ops.v : code === 3 ? ops.w : code === 4 ? ops.f : code === 5 ? ops.t : ops.e;

/**
 * Evaluate a decoded ruleset for the given operands; returns the matching
 * category index (into PLURAL_CATEGORIES). The 'other' rule is vacuously
 * true and must be last; a defensively-empty ruleset returns 'other'.
 */
export const evaluatePlural = (ops: PluralOperands, rules: PluralRuleSet): number => {
  for (const rule of rules) {
    if (rule.ands.length === 0) {
      return rule.cat; // 'other' (or an always-true rule)
    }
    for (const group of rule.ands) {
      let ok = true;
      for (const rel of group) {
        const v = rel.mod === 0 ? OPERAND_VALUE(ops, rel.operand) : OPERAND_VALUE(ops, rel.operand) % rel.mod;
        const matches = rel.ranges.some(([lo, hi]) => v >= lo && v <= hi);
        if (matches !== rel.eq) {
          ok = false;
          break;
        }
      }
      if (ok) {
        return rule.cat;
      }
    }
  }
  return rules.length > 0 ? rules[rules.length - 1].cat : 5;
};
