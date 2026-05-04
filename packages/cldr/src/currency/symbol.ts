/**
 * symbol(): the locale's symbol for the currency code (from the pool).
 */
import type { CurrencyState } from './state.js';
import { currencyRecord } from './lookup.js';

export const symbol = (state: CurrencyState): string => state.pack.pool[currencyRecord(state).poolIndex];
