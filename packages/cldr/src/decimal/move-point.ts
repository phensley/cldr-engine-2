/**
 * movePoint(amount): shift the decimal point; +n multiplies by 10^n.
 */
import type { DecimalState } from './state.js';

export const movePoint = (state: DecimalState, amount: number): DecimalState => ({
  sign: state.sign,
  coeff: state.coeff,
  exp: state.exp + amount,
});
