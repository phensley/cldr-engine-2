/**
 * format(): format an amount with the locale's currency pattern and the
 * code's symbol, rounding to the code's fraction digits (e.g. JPY = 0).
 */
import { formatPattern } from '../decimal/format/pattern.js';
import { currencyRecord } from './lookup.js';
import type { CurrencyState } from './state.js';

export const format = (state: CurrencyState): string => {
  const rec = currencyRecord(state);
  const pattern = state.pack.patterns[2]; // [decimal, percent, currency]
  return formatPattern(state.amount, pattern, { symbol: state.pack.pool[rec.poolIndex], maxFrac: rec.digits });
};
