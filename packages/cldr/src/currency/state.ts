/**
 * Currency interior state: the locale's decoded pack + the amount being
 * formatted/queried. Shared by the currency method modules (S2-M2).
 */
import type { DecodedLocalePack } from '@cldr/internal-core';
import type { DecimalState } from '../decimal/state.js';

export interface CurrencyState {
  pack: DecodedLocalePack;
  amount: DecimalState;
  code: string;
}
