/**
 * scientific(options?): toExponential-style formatting over the state.
 *
 * value = d.dddd × 10^k, always emitted with an explicit exponent sign
 * (matching JS toExponential); fractionDigits truncates (not rounds) the
 * mantissa — prototype simplification.
 */
import type { DecimalState } from '../state.js';

export interface ScientificOptions {
  fractionDigits?: number;
}

export const scientific = (state: DecimalState, options?: ScientificOptions): string => {
  if (state.coeff.length === 1 && state.coeff[0] === 0) {
    return '0';
  }
  const k = state.exp + state.coeff.length - 1;
  const digits = state.coeff.join('');
  const frac = options?.fractionDigits;
  let mantissa: string;
  if (frac === undefined) {
    mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  } else if (frac <= 0) {
    mantissa = digits[0];
  } else {
    mantissa = digits.length > 1 ? digits[0] + '.' + (digits.slice(1, 1 + frac) + '0'.repeat(Math.max(0, frac - (digits.length - 1)))) : `${digits[0]}.${'0'.repeat(frac)}`;
  }
  return `${state.sign === -1 ? '-' : ''}${mantissa}e${k >= 0 ? '+' : ''}${k}`;
};
