/**
 * compare(other): -1 / 0 / 1.
 */
import { compareStates, parseArg } from './state.js';
import type { DecimalArg, DecimalState } from './state.js';

export const compare = (state: DecimalState, other: DecimalArg): number => compareStates(state, parseArg(other));
