/**
 * Mini CLDR number-pattern formatter (v0).
 *
 * Supports the pattern subset the mini-cldr dataset ships: '#'/'0' digits,
 * ',' grouping, '.' fraction, '%' suffix (×100), and '¤' symbol placement
 * in prefix/suffix. Grouping uses ',' as written in the pattern — a v0
 * simplification (real CLDR uses locale-specific group separators).
 */
import type { DecimalState } from '../state.js';

export interface PatternInfo {
  group: boolean;
  minFrac: number;
  maxFrac: number;
  percent: boolean;
  currency: boolean;
  prefix: string;
  suffix: string;
}

export const parsePattern = (pattern: string): PatternInfo => {
  let group = false;
  let minFrac = 0;
  let maxFrac = 0;
  let percent = false;
  let currency = false;
  let inFrac = false;
  let fStart = -1;
  let fEnd = -1;
  const count = (i: number) => {
    if (fStart < 0) {
      fStart = i;
    }
    fEnd = i;
  };
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === ',') {
      group = true;
      count(i);
    } else if (c === '.') {
      inFrac = true;
      count(i);
    } else if (c === '#') {
      count(i);
      if (inFrac) {
        maxFrac++;
      }
    } else if (c === '0') {
      count(i);
      if (inFrac) {
        maxFrac++;
        minFrac++;
      }
    } else if (c === '%') {
      percent = true;
    } else if (c === '¤') {
      currency = true;
    }
  }
  const subst = (s: string, symbol?: string) => (currency && symbol !== undefined ? s.replace(/¤/g, symbol) : s);
  const prefix = fStart >= 0 ? subst(pattern.slice(0, fStart)) : '';
  const suffix = fEnd >= 0 ? subst(pattern.slice(fEnd + 1)) : '';
  return { group, minFrac, maxFrac, percent, currency, prefix, suffix };
};

const groupDigits = (int: string): string => int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Round a state to `maxFrac` fractional digits (half-up with carry) and
 * split into integer/fraction digit strings.
 */
const roundTo = (state: DecimalState, maxFrac: number): { int: string; frac: string } => {
  let coeff = state.coeff;
  const exp = state.exp;
  const intLen = coeff.length + exp;
  let intDigits: number[];
  let fracDigits: number[];
  if (intLen <= 0) {
    intDigits = [0];
    fracDigits = [...Array(-intLen).fill(0), ...coeff];
  } else if (exp >= 0) {
    intDigits = [...coeff, ...Array(exp).fill(0)];
    fracDigits = [];
  } else {
    intDigits = coeff.slice(0, intLen);
    fracDigits = coeff.slice(intLen);
  }
  if (fracDigits.length > maxFrac) {
    const keep = fracDigits.slice(0, maxFrac);
    let carry = fracDigits[maxFrac] >= 5;
    if (carry) {
      for (let i = keep.length - 1; i >= 0 && carry; i--) {
        if (keep[i] === 9) {
          keep[i] = 0;
        } else {
          keep[i]++;
          carry = false;
        }
      }
      if (carry) {
        for (let j = intDigits.length - 1; j >= 0 && carry; j--) {
          if (intDigits[j] === 9) {
            intDigits[j] = 0;
          } else {
            intDigits[j]++;
            carry = false;
          }
        }
        if (carry) {
          intDigits = [1, ...intDigits];
        }
      }
    }
    fracDigits = keep;
  }
  return { int: intDigits.join(''), frac: fracDigits.join('') };
};

export interface FormatOptions {
  /** Currency symbol to substitute for '¤'. */
  symbol?: string;
  /** Override the pattern's max fraction digits (e.g. JPY = 0). */
  maxFrac?: number;
}

export const formatPattern = (state: DecimalState, pattern: string, options?: FormatOptions): string => {
  const info = parsePattern(pattern);
  let s = state;
  if (info.percent) {
    s = { sign: state.sign, coeff: state.coeff, exp: state.exp + 2 }; // ×100
  }
  const maxFrac = options?.maxFrac ?? info.maxFrac;
  const { int, frac } = roundTo(s, maxFrac);
  // roundTo already limited frac to maxFrac digits; pad to the pattern's minimum
  let fracStr = '';
  if (maxFrac > 0 && (frac !== '' || info.minFrac > 0)) {
    fracStr = '.' + frac.padEnd(info.minFrac, '0');
  }
  const sign = s.sign === -1 ? '-' : '';
  const body = sign + (info.group ? groupDigits(int) : int) + fracStr;
  const subst = (t: string) => (options?.symbol !== undefined ? t.replace(/¤/g, options.symbol) : t);
  return subst(info.prefix) + body + subst(info.suffix);
};
