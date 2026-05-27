/**
 * Runtime plural support: DecimalState → CLDR operands → category.
 *
 * The operand-to-rule machinery (decode + evaluatePlural) lives in
 * internal-core (pack/plural.ts); this module adapts the runtime's exact
 * decimal state to the operand vector and exposes the category names.
 */
import { evaluatePlural, PLURAL_CATEGORIES } from '@cldr/internal-core';
import type { PluralRuleSet, PluralOperands } from '@cldr/internal-core';
import type { DecimalState } from '../decimal/state.js';
import type { PluralState } from '../api.js';

/** Exact operands from the decimal state (coeff/exp — no floating conversion except n). */
const operandsFrom = (amount: DecimalState): PluralOperands => {
  const coeff = amount.coeff;
  const exp = amount.exp;
  const intLen = coeff.length + exp;
  let intDigits: number[];
  let fracDigits: number[];
  if (intLen <= 0) {
    intDigits = [];
    fracDigits = [...Array(-intLen).fill(0), ...coeff];
  } else if (exp >= 0) {
    intDigits = [...coeff, ...Array(exp).fill(0)];
    fracDigits = [];
  } else {
    intDigits = coeff.slice(0, intLen);
    fracDigits = coeff.slice(intLen);
  }
  const intText = intDigits.join('') || '0';
  const fracText = fracDigits.join('');
  const fracTrimmed = fracText.replace(/0+$/, '');
  const n = Number(`${intText}.${fracText === '' ? '0' : fracText}`);
  return {
    n,
    i: Number(intText),
    v: fracDigits.length,
    w: fracTrimmed.length,
    f: fracText === '' ? 0 : Number(fracText),
    t: fracTrimmed === '' ? 0 : Number(fracTrimmed),
    // compact/exponent formatting is a follow-up; plain amounts have e = 0
    // (CLDR: e = the compact exponent, 0 for non-compact notation)
    e: 0,
  };
};

/** The plural category name for a state (via the pack's decoded rules). */
export const select = (state: PluralState, type: 'cardinal' | 'ordinal' = 'cardinal'): string => {
  const rules: PluralRuleSet = state.pack.plural[type];
  return PLURAL_CATEGORIES[evaluatePlural(operandsFrom(state.amount), rules)];
};
