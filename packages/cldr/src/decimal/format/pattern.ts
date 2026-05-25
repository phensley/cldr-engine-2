/**
 * CLDR number-pattern formatter (v1, real-data aware).
 *
 * Pattern subset: '#'/'0' digits, ',' grouping (group sizes read from the
 * pattern — '#,##,##0' = Indian 2+3), '.' decimal, '%' suffix (×100; the
 * pattern's literal '%' renders as written — fr ships '#,##0 %' with NBSP),
 * '¤' symbol placement in prefix/suffix.
 *
 * v1 (real data): separators render with the locale's SYMBOLS (wire v1
 * pack.symbols), not hard-coded ','/'.' — fr renders U+202F grouping and
 * ',' decimal; ar renders its LRM-wrapped minus. Patterns are positive
 * subpatterns (the pipeline adapter splits 'positive;negative'); negatives
 * keep the minus-prefix rule — per-locale negative pattern forms are a
 * recorded follow-up.
 */
import type { DecimalState } from '../state.js';

export interface PatternInfo {
  group: boolean;
  /** Primary grouping size (digits after the last ','). */
  primary: number;
  /** Secondary grouping size (digits between the last two ','; 0 = none). */
  secondary: number;
  minFrac: number;
  maxFrac: number;
  percent: boolean;
  currency: boolean;
  prefix: string;
  suffix: string;
}

export const parsePattern = (pattern: string): PatternInfo => {
  let group = false;
  let primary = 0;
  let secondary = 0;
  let minFrac = 0;
  let maxFrac = 0;
  let percent = false;
  let currency = false;
  let inFrac = false;
  let fStart = -1;
  let fEnd = -1;
  let lastComma = -1;
  let prevComma = -1;
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
      prevComma = lastComma;
      lastComma = i;
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
  // grouping sizes: digits after the last ',' = primary; digits between
  // the last two ',' = secondary ('#,##0' → 1/—; '#,##,##0' → 1/2)
  if (group) {
    const intEnd = inFrac ? pattern.indexOf('.') : pattern.length;
    primary = intEnd - lastComma - 1;
    secondary = prevComma >= 0 ? lastComma - prevComma - 1 : 0;
  }
  const subst = (s: string, symbol?: string) => (currency && symbol !== undefined ? s.replace(/¤/g, symbol) : s);
  const prefix = fStart >= 0 ? subst(pattern.slice(0, fStart)) : '';
  const suffix = fEnd >= 0 ? subst(pattern.slice(fEnd + 1)) : '';
  return { group, primary, secondary, minFrac, maxFrac, percent, currency, prefix, suffix };
};

/** Group integer digits per the pattern's group sizes (rightmost = primary). */
export const groupDigits = (int: string, primary: number, secondary: number, sep: string): string => {
  if (primary <= 0 || int.length <= primary) {
    return int;
  }
  const groups: string[] = [];
  let i = int.length;
  groups.unshift(int.slice(i - primary));
  i -= primary;
  while (i > 0) {
    const size = secondary > 0 ? secondary : primary;
    const take = Math.min(size, i);
    groups.unshift(int.slice(i - take, i));
    i -= take;
  }
  return groups.join(sep);
};

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

export interface FormatSymbols {
  decimal: string;
  group: string;
  minus: string;
}

export interface FormatOptions {
  /** Currency symbol to substitute for '¤'. */
  symbol?: string;
  /** Override the pattern's max fraction digits (e.g. JPY = 0). */
  maxFrac?: number;
  /** Locale symbols (wire v1): decimal/group separators + minus sign. */
  symbols?: FormatSymbols;
}

export const formatPattern = (state: DecimalState, pattern: string, options?: FormatOptions): string => {
  const info = parsePattern(pattern);
  const syms = options?.symbols;
  let s = state;
  if (info.percent) {
    s = { sign: state.sign, coeff: state.coeff, exp: state.exp + 2 }; // ×100
  }
  const maxFrac = options?.maxFrac ?? info.maxFrac;
  const { int, frac } = roundTo(s, maxFrac);
  // roundTo already limited frac to maxFrac digits; pad to the pattern's minimum
  let fracStr = '';
  if (maxFrac > 0 && (frac !== '' || info.minFrac > 0)) {
    fracStr = (syms?.decimal ?? '.') + frac.padEnd(info.minFrac, '0');
  }
  const body = (info.group ? groupDigits(int, info.primary, info.secondary, syms?.group ?? ',') : int) + fracStr;
  // minus sign leads the whole output (before any symbol/prefix) — the
  // separate CLDR negative-pattern forms are a recorded follow-up
  const subst = (t: string) => (options?.symbol !== undefined ? t.replace(/¤/g, options.symbol) : t);
  return (s.sign === -1 ? syms?.minus ?? '-' : '') + subst(info.prefix) + body + subst(info.suffix);
};
