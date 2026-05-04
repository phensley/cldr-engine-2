/**
 * max(other): the larger of the two states.
 */
import { maxState, parseArg } from './state.js';
import type { DecimalArg, DecimalState } from './state.js';

export const max = (state: DecimalState, other: DecimalArg): DecimalState => maxState(state, parseArg(other));
