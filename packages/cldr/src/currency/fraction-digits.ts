/**
 * fractionDigits(): ISO 4217 digit count for the currency code.
 */
import type { CurrencyState } from './state.js';
import { currencyRecord } from './lookup.js';

export const fractionDigits = (state: CurrencyState): number => currencyRecord(state).digits;
