/**
 * Fixed API shapes (plans/alt-api-sketch.md): one canonical hand-authored
 * shape per type; a config selects a subset of a known shape, never a
 * free-form one. The implementation method modules implement exactly these
 * signatures with (state, ...args) first-arg style.
 *
 * The generated client (S2) assembles instances from whichever selected
 * methods were statically imported — unselected slots are absent from the
 * type and the bundle.
 */
import type { DecimalArg, DecimalLike, DecimalState } from './decimal/state.js';
import type { ScientificOptions } from './decimal/format/scientific.js';
import type { CurrencyState } from './currency/state.js';

// ---------------------------------------------------------------------------
// decimal

export interface DecimalFormatSelection {
  scientific?: (state: DecimalState, options?: ScientificOptions) => string;
}

export interface DecimalApi {
  compare?: (state: DecimalState, other: DecimalArg) => number;
  min?: (state: DecimalState, other: DecimalArg) => DecimalState;
  max?: (state: DecimalState, other: DecimalArg) => DecimalState;
  movePoint?: (state: DecimalState, amount: number) => DecimalState;
  format?: DecimalFormatSelection;
}

export type DecimalSelection = Partial<DecimalApi>;

type StateReturn<M extends DecimalSelection, R> = R extends DecimalState ? DecimalInstance<M> : R;

/** The instance shape for a selection M: state-returning methods yield a new instance. */
export type DecimalInstance<M extends DecimalSelection> = {
  [K in keyof M]-?: M[K] extends (state: DecimalState, ...args: infer A) => infer R
    ? (...args: A) => StateReturn<M, R>
    : M[K] extends object
      ? { [N in keyof M[K]]-?: M[K][N] extends (state: DecimalState, ...args: infer NA) => infer NR ? (...args: NA) => NR : never }
      : never;
} & DecimalLike;

// ---------------------------------------------------------------------------
// currency

export interface CurrencyApi {
  format?: (state: CurrencyState) => string;
  symbol?: (state: CurrencyState) => string;
  fractionDigits?: (state: CurrencyState) => number;
}

export type CurrencySelection = Partial<CurrencyApi>;

export type CurrencyInstance<M extends CurrencySelection> = {
  [K in keyof M]-?: M[K] extends (state: CurrencyState, ...args: infer A) => infer R ? (...args: A) => R : never;
};
