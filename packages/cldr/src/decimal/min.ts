/**
 * min(other): the smaller of the two states.
 */
import { minState, parseArg } from './state.js';
import type { DecimalArg, DecimalState } from './state.js';

export const min = (state: DecimalState, other: DecimalArg): DecimalState => minState(state, parseArg(other));
