/**
 * Decimal interior state: value = sign × coeff × 10^exp.
 *
 * coeff holds the significant digits (most significant first, no leading
 * zeros; [0] for zero) and exp the decimal exponent. Parsing normalizes
 * any input into this canonical form so compare/min/max are simple.
 */
export interface DecimalState {
  sign: 1 | -1;
  coeff: number[];
  exp: number;
}

/** Anything with an instance holding a DecimalState (`__i`). */
export interface DecimalLike {
  readonly __i: DecimalState;
}

/** Anything a decimal method accepts. */
export type DecimalArg = DecimalState | DecimalLike | string | number;

const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/** Parse a string/number into canonical state. Throws on malformed input. */
export const parseDecimal = (raw: DecimalArg): DecimalState => {
  if (typeof raw === 'object') {
    return '__i' in raw ? raw.__i : raw;
  }
  const s = typeof raw === 'number' ? String(raw) : raw.trim();
  const m = DECIMAL_RE.exec(s);
  if (!m) {
    throw new Error(`invalid decimal: ${JSON.stringify(raw)}`);
  }
  const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
  const expAdj = m[4] ? parseInt(m[4], 10) : 0;
  const fracLen = m[3]?.length ?? 0;
  const digits = (m[2] + (m[3] ?? '')).replace(/^0+/, '');
  if (digits === '') {
    // zero (normalize sign and exponent)
    return { sign: 1, coeff: [0], exp: 0 };
  }
  // strip trailing zeros (coeff holds only significant digits; each
  // dropped zero shifts the decimal point right one place)
  const stripped = digits.replace(/0+$/, '');
  return {
    sign,
    coeff: [...stripped].map((c) => c.charCodeAt(0) - 48),
    exp: expAdj - fracLen + (digits.length - stripped.length),
  };
};

export const isZero = (a: DecimalState): boolean => a.coeff.length === 1 && a.coeff[0] === 0;

/**
 * Compare two positive states by magnitude.
 * Bounds the comparison by the coefficient lengths: once both coefficients
 * are exhausted the remaining digit streams are all zeros.
 */
const cmpMag = (a: DecimalState, b: DecimalState): number => {
  const e = Math.min(a.exp, b.exp);
  const la = a.coeff.length + a.exp - e;
  const lb = b.coeff.length + b.exp - e;
  if (la !== lb) {
    return la > lb ? 1 : -1;
  }
  const dA = (i: number) => (i < a.coeff.length ? a.coeff[i] : 0);
  const dB = (i: number) => (i < b.coeff.length ? b.coeff[i] : 0);
  for (let i = 0; i < la; i++) {
    if (i >= a.coeff.length && i >= b.coeff.length) {
      break; // remaining digits are zeros on both sides
    }
    const x = dA(i);
    const y = dB(i);
    if (x !== y) {
      return x > y ? 1 : -1;
    }
  }
  return 0;
};

/** Full comparison with sign handling. */
export const compareStates = (a: DecimalState, b: DecimalState): -1 | 0 | 1 => {
  if (a.sign !== b.sign) {
    return a.sign === -1 ? -1 : 1;
  }
  const m = cmpMag(a, b);
  return (a.sign === -1 ? -m : m) as -1 | 0 | 1;
};

export const parseArg = (raw: DecimalArg): DecimalState => {
  if (typeof raw === 'object') {
    return '__i' in raw ? raw.__i : raw;
  }
  return parseDecimal(raw);
};

export const minState = (a: DecimalState, b: DecimalState): DecimalState => (compareStates(a, b) <= 0 ? a : b);
export const maxState = (a: DecimalState, b: DecimalState): DecimalState => (compareStates(a, b) >= 0 ? a : b);
